'use strict';
/**
 * unifiedEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified in-memory screening index covering ALL sources:
 *   PEP:        OPENSANCTIONS_PEP | WIKIDATA | ICIJ
 *   SANCTIONS:  OFAC | UN | EU | UK | SECO | DFAT | MAS | BIS | …
 *
 * Three-layer index:
 *   _tokenIndex    — exact token lookup (fast path)
 *   _phoneticIndex — Double Metaphone (transliteration-tolerant)
 *   _trigramIndex  — character trigrams (typo/OCR-tolerant)
 *
 * Scoring: Jaro-Winkler 50% + Levenshtein 25% + Trigram Dice 25%
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query }          = require('../db/connection');
const { doubleMetaphone } = require('double-metaphone');

// ── In-memory state ───────────────────────────────────────────────────────────
let _tokenIndex    = new Map();   // token → Set<rowKey>
let _phoneticIndex = new Map();   // metaphone_code → Set<rowKey>
let _trigramIndex  = new Map();   // trigram → Set<rowKey>
let _entryMap      = new Map();   // rowKey → entry object

// rowKey = `${list_category}:${id}` e.g. "PEP:12345" or "SANCTIONS:82316"

let _isLoading     = false;
let _loadProgress  = { loaded: 0, total: 0, pct: 0, phase: 'idle' };
let _lastLoaded    = null;
let _loadError     = null;

// ── Text utilities ────────────────────────────────────────────────────────────
function normalize(str) {
  if (!str) return '';
  return str.toUpperCase()
    .replace(/[''`]/g, '')
    .replace(/[-_.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(name) {
  return normalize(name).split(' ').filter(t => t.length > 1);
}

function generateTrigrams(str) {
  const s = '#' + normalize(str).replace(/\s+/g, '') + '#';
  const grams = new Set();
  for (let i = 0; i < s.length - 2; i++) grams.add(s.slice(i, i + 3));
  return grams;
}

function phoneticCodes(name) {
  const codes = new Set();
  for (const tok of tokenize(name)) {
    if (tok.length < 2) continue;
    try {
      const [primary, secondary] = doubleMetaphone(tok);
      if (primary)   codes.add(primary);
      if (secondary) codes.add(secondary);
    } catch (_) {}
  }
  return codes;
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1;
  const l1 = s1.length, l2 = s2.length;
  if (!l1 || !l2) return 0;
  const matchDist = Math.floor(Math.max(l1, l2) / 2) - 1;
  const s1m = new Array(l1).fill(false);
  const s2m = new Array(l2).fill(false);
  let matches = 0, transpositions = 0;
  for (let i = 0; i < l1; i++) {
    const lo = Math.max(0, i - matchDist);
    const hi = Math.min(i + matchDist + 1, l2);
    for (let j = lo; j < hi; j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue;
      s1m[i] = s2m[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (!s1m[i]) continue;
    while (!s2m[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro = (matches / l1 + matches / l2 + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, l1, l2); i++) {
    if (s1[i] === s2[i]) prefix++; else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function trigramSimilarity(a, b) {
  const ga = generateTrigrams(a), gb = generateTrigrams(b);
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

function scoreName(searchName, entryName) {
  const s = normalize(searchName), e = normalize(entryName);
  if (s === e) return 100;
  const jw   = jaroWinkler(s, e);
  const maxL = Math.max(s.length, e.length);
  const lev  = maxL ? 1 - levenshtein(s, e) / maxL : 0;
  const tri  = trigramSimilarity(s, e);
  // Token-reorder bonus: sort tokens and compare
  const st = tokenize(s).sort().join(' ');
  const et = tokenize(e).sort().join(' ');
  const tokenScore = st === et ? 1 : jaroWinkler(st, et) * 0.5 + trigramSimilarity(st, et) * 0.5;
  const base = jw * 0.5 + lev * 0.25 + tri * 0.25;
  return Math.round(Math.max(base, tokenScore * 0.9) * 100);
}

// ── Index a single entry ──────────────────────────────────────────────────────
function indexEntry(entry, tokenIdx, phoneticIdx, trigramIdx) {
  const key = `${entry.list_category}:${entry.id}`;
  const names = [entry.primary_name];
  if (entry.aliases) {
    for (const a of entry.aliases.split(/[|,;]/)) {
      const t = a.trim();
      if (t) names.push(t);
    }
  }
  for (const name of names) {
    for (const tok of tokenize(name)) {
      if (!tokenIdx.has(tok)) tokenIdx.set(tok, new Set());
      tokenIdx.get(tok).add(key);
    }
    for (const code of phoneticCodes(name)) {
      if (!phoneticIdx.has(code)) phoneticIdx.set(code, new Set());
      phoneticIdx.get(code).add(key);
    }
    for (const gram of generateTrigrams(name)) {
      if (!trigramIdx.has(gram)) trigramIdx.set(gram, new Set());
      trigramIdx.get(gram).add(key);
    }
  }
}

// ── Load all sources into RAM ─────────────────────────────────────────────────
let _loadPromise = null;

function loadUnified() {
  if (_isLoading && _loadPromise) return _loadPromise;
  _loadPromise = _doLoad();
  return _loadPromise;
}

async function _doLoad() {
  _isLoading = true;
  _loadError = null;
  _loadProgress = { loaded: 0, total: 0, pct: 0, phase: 'counting' };

  const newTokenIdx    = new Map();
  const newPhoneticIdx = new Map();
  const newTrigramIdx  = new Map();
  const newEntryMap    = new Map();

  try {
    // Count total rows
    const countRes = await query(`
      SELECT
        (SELECT COUNT(*) FROM pep_entries WHERE status IN ('ACTIVE','DELISTED')) +
        (SELECT COUNT(*) FROM sanctions_entries WHERE status IN ('ACTIVE','DELISTED')) AS total
    `);
    const total = countRes.recordset[0].total;
    _loadProgress.total = total;
    _loadProgress.phase = 'loading';

    let loaded = 0;
    const BATCH = 5000;

    // ── Phase 1: Load PEP entries ─────────────────────────────────────────────
    let offset = 0;
    while (true) {
      const rows = await query(`
        SELECT id, source AS source_code,
          CASE source
            WHEN 'OPENSANCTIONS_PEP' THEN 'OpenSanctions PEP'
            WHEN 'WIKIDATA' THEN 'Wikidata SPARQL'
            WHEN 'ICIJ' THEN 'ICIJ Offshore Leaks'
            ELSE source END AS source_name,
          'PEP' AS list_category,
          external_id, schema_type AS entry_type, primary_name,
          aliases, birth_date, countries, nationality, position,
          political_party, gender, dataset, adverse_links,
          wikidata_id, icij_node_id, status, first_seen AS listing_date
        FROM pep_entries
        WHERE status IN ('ACTIVE','DELISTED')
        ORDER BY id
        OFFSET ${offset} ROWS FETCH NEXT ${BATCH} ROWS ONLY
      `);
      if (!rows.recordset.length) break;
      for (const row of rows.recordset) {
        const key = `PEP:${row.id}`;
        newEntryMap.set(key, row);
        indexEntry(row, newTokenIdx, newPhoneticIdx, newTrigramIdx);
        loaded++;
      }
      offset += BATCH;
      _loadProgress.loaded = loaded;
      _loadProgress.pct = total ? Math.round(loaded / total * 100) : 0;
    }

    // ── Phase 2: Load Sanctions entries ───────────────────────────────────────
    offset = 0;
    while (true) {
      const rows = await query(`
        SELECT e.id, s.source_code, s.source_name,
          'SANCTIONS' AS list_category,
          e.external_id, e.entry_type, e.primary_name,
          (SELECT STRING_AGG(a.alias_name, '|') FROM sanctions_aliases a WHERE a.entry_id = e.id) AS aliases,
          e.dob AS birth_date, e.countries, e.nationality, e.position,
          e.political_party, e.gender, e.dataset, e.adverse_links,
          e.wikidata_id, e.icij_node_id, e.status,
          CONVERT(NVARCHAR(50), e.listing_date, 23) AS listing_date
        FROM sanctions_entries e
        JOIN sanctions_list_sources s ON e.source_id = s.id
        WHERE e.status IN ('ACTIVE','DELISTED')
        ORDER BY e.id
        OFFSET ${offset} ROWS FETCH NEXT ${BATCH} ROWS ONLY
      `);
      if (!rows.recordset.length) break;
      for (const row of rows.recordset) {
        const key = `SANCTIONS:${row.id}`;
        newEntryMap.set(key, row);
        indexEntry(row, newTokenIdx, newPhoneticIdx, newTrigramIdx);
        loaded++;
      }
      offset += BATCH;
      _loadProgress.loaded = loaded;
      _loadProgress.pct = total ? Math.round(loaded / total * 100) : 0;
    }

    // Atomic swap
    _tokenIndex    = newTokenIdx;
    _phoneticIndex = newPhoneticIdx;
    _trigramIndex  = newTrigramIdx;
    _entryMap      = newEntryMap;
    _lastLoaded    = new Date();
    _loadProgress  = { loaded, total, pct: 100, phase: 'complete' };
    _isLoading     = false;

    console.log(`[UnifiedEngine] Loaded ${loaded.toLocaleString()} entries into RAM (${newTokenIdx.size.toLocaleString()} tokens, ${newPhoneticIdx.size.toLocaleString()} phonetic codes, ${newTrigramIdx.size.toLocaleString()} trigrams)`);
  } catch (err) {
    _isLoading  = false;
    _loadError  = err.message;
    _loadProgress.phase = 'error';
    console.error('[UnifiedEngine] Load error:', err.message);
    throw err;
  }
}

// ── Tier-2 fallback: SQL in-memory table (sanctions_entries_mem) ─────────────
async function screenUnifiedMem(name, opts = {}) {
  const { threshold = 70, maxResults = 50 } = opts;
  const candidateThreshold = Math.max(40, threshold - 20);
  const tokens = tokenize(name);
  if (!tokens.length) return null; // signal to fall through to disk

  // Check if sanctions_entries_mem has any rows at all
  const { query } = require('../db/connection');
  const countRow = await query('SELECT COUNT(*) AS cnt FROM sanctions_entries_mem').catch(() => null);
  const memCount = countRow?.recordset?.[0]?.cnt || 0;
  if (memCount === 0) return null; // nothing in mem table, fall through to disk

  const primaryLike = tokens.map(t => `primary_name LIKE '%${t.replace(/'/g,"''")}%'`).join(' AND ');
  const aliasLike   = tokens.map(t => `ISNULL(aliases,'') LIKE '%${t.replace(/'/g,"''")}%'`).join(' AND ');
  const whereClause = `(${primaryLike}) OR (${aliasLike})`;

  // Also check PEP entries from pep_entries (PEP has no mem table, always from disk)
  const [memRows, pepRows] = await Promise.all([
    query(`
      SELECT TOP 300 id, source_id, source_code, source_code AS source_name,
        'SANCTIONS' AS list_category,
        external_id, entry_type, primary_name,
        aliases, dob AS birth_date, nationality, programme,
        status, listing_date
      FROM sanctions_entries_mem
      WHERE ${whereClause}
    `).then(r => r.recordset).catch(() => []),
    query(`
      SELECT TOP 200 id, source AS source_code,
        CASE source
          WHEN 'OPENSANCTIONS_PEP' THEN 'OpenSanctions PEP'
          WHEN 'WIKIDATA' THEN 'Wikidata SPARQL'
          WHEN 'ICIJ' THEN 'ICIJ Offshore Leaks'
          ELSE source END AS source_name,
        'PEP' AS list_category,
        external_id, schema_type AS entry_type, primary_name,
        aliases, birth_date, countries, nationality, position,
        political_party, gender, dataset, adverse_links,
        wikidata_id, icij_node_id, status, first_seen AS listing_date
      FROM pep_entries
      WHERE status IN ('ACTIVE','DELISTED') AND (
        ${tokens.map(t => `primary_name LIKE '%${t.replace(/'/g,"''")}%'`).join(' AND ')}
        OR ISNULL(aliases,'') LIKE '%${tokens[0].replace(/'/g,"''")}%'
      )
    `).then(r => r.recordset).catch(() => []),
  ]);

  const candidates = [...memRows, ...pepRows];
  if (!candidates.length) return null; // nothing found, fall through

  const results = [];
  for (const entry of candidates) {
    const names = [entry.primary_name];
    if (entry.aliases) for (const a of entry.aliases.split(/[|,;]/)) { const t = a.trim(); if (t) names.push(t); }
    let best = 0, bestMatchedName = entry.primary_name;
    for (const n of names) {
      const s = scoreName(name, n);
      if (s > best) { best = s; bestMatchedName = n; }
    }
    if (best >= candidateThreshold) results.push({ ...entry, score: best, matchedName: bestMatchedName });
  }
  results.sort((a, b) => b.score - a.score);
  const filtered = results.filter(r => r.score >= threshold);
  if (!filtered.length) return null; // nothing above threshold, fall through to disk
  return { results: filtered.slice(0, maxResults), totalInRAM: 0, indexReady: false, memFallback: true, query: name };
}

// ── Tier-3 fallback: disk table (sanctions_entries) ───────────────────────────
async function screenUnifiedDB(name, opts = {}) {
  const { threshold = 70, maxResults = 50 } = opts;
  // Use a lower threshold for DB candidate retrieval to avoid missing near-exact matches
  const candidateThreshold = Math.max(40, threshold - 20);
  const norm = normalize(name);
  const tokens = tokenize(name);
  if (!tokens.length) return { results: [], totalInRAM: 0, indexReady: false, dbFallback: true };

  // Build LIKE clauses — search each token in primary_name only (aliases may be NULL)
  // Use AND for multi-token queries so we get tighter candidates
  const primaryLike = tokens.map(t => `primary_name LIKE '%${t.replace(/'/g,"''")}%'`).join(' AND ');
  const aliasLike   = tokens.map(t => `ISNULL(aliases,'') LIKE '%${t.replace(/'/g,"''")}%'`).join(' AND ');
  const pepWhere    = `(${primaryLike}) OR (${aliasLike})`;

  const [pepRows, sanctRows] = await Promise.all([
    query(`
      SELECT TOP 300 id, source AS source_code,
        CASE source
          WHEN 'OPENSANCTIONS_PEP' THEN 'OpenSanctions PEP'
          WHEN 'WIKIDATA' THEN 'Wikidata SPARQL'
          WHEN 'ICIJ' THEN 'ICIJ Offshore Leaks'
          ELSE source END AS source_name,
        'PEP' AS list_category,
        external_id, schema_type AS entry_type, primary_name,
        aliases, birth_date, countries, nationality, position,
        political_party, gender, dataset, adverse_links,
        wikidata_id, icij_node_id, status, first_seen AS listing_date
      FROM pep_entries
      WHERE status IN ('ACTIVE','DELISTED') AND (${pepWhere})
    `).then(r => r.recordset).catch(() => []),
    query(`
      SELECT TOP 200 e.id, s.source_code, s.source_name,
        'SANCTIONS' AS list_category,
        e.external_id, e.entry_type, e.primary_name,
        (SELECT STRING_AGG(a.alias_name, '|') FROM sanctions_aliases a WHERE a.entry_id = e.id) AS aliases,
        e.dob AS birth_date, e.countries, e.nationality, e.position,
        e.political_party, e.gender, e.dataset, e.adverse_links,
        e.wikidata_id, e.icij_node_id, e.status,
        CONVERT(NVARCHAR(50), e.listing_date, 23) AS listing_date
      FROM sanctions_entries e
      JOIN sanctions_list_sources s ON e.source_id = s.id
      WHERE e.status IN ('ACTIVE','DELISTED') AND (
        ${tokens.map(t => `e.primary_name LIKE '%${t.replace(/'/g,"''")}%'`).join(' AND ')}
        OR EXISTS (
          SELECT 1 FROM sanctions_aliases a
          WHERE a.entry_id = e.id
          AND ${tokens.map(t => `a.alias_name LIKE '%${t.replace(/'/g,"''")}%'`).join(' AND ')}
        )
      )
    `).then(r => r.recordset).catch(() => []),
  ]);

  const candidates = [...pepRows, ...sanctRows];
  const results = [];
  for (const entry of candidates) {
    const names = [entry.primary_name];
    if (entry.aliases) for (const a of entry.aliases.split(/[|,;]/)) { const t = a.trim(); if (t) names.push(t); }
    let best = 0, bestMatchedName = entry.primary_name;
    for (const n of names) {
      const s = scoreName(name, n);
      if (s > best) { best = s; bestMatchedName = n; }
    }
    if (best >= candidateThreshold) results.push({ ...entry, score: best, matchedName: bestMatchedName });
  }
  results.sort((a, b) => b.score - a.score);
  // Filter to user's threshold after scoring
  const filtered = results.filter(r => r.score >= threshold);
  return { results: filtered.slice(0, maxResults), totalInRAM: 0, indexReady: false, dbFallback: true, query: name };
}

// ── Screening function ────────────────────────────────────────────────────────
function screenUnified(name, opts = {}) {
  const {
    threshold    = 70,
    maxResults   = 20,
    filterSource = null,   // e.g. 'PEP' or 'SANCTIONS' or null for all
    filterList   = null,   // e.g. 'OFAC' or 'WIKIDATA' or null for all
  } = opts;

  if (!_entryMap.size) return null; // signal caller to use DB fallback

  const candidates = new Map(); // key → best score

  // Token lookup
  for (const token of tokenize(name)) {
    const ids = _tokenIndex.get(token);
    if (ids) for (const key of ids) candidates.set(key, (candidates.get(key) || 0) + 1);
  }

  // Phonetic lookup
  for (const code of phoneticCodes(name)) {
    const ids = _phoneticIndex.get(code);
    if (ids) for (const key of ids) candidates.set(key, (candidates.get(key) || 0) + 1);
  }

  // Trigram lookup (for short names or no token matches)
  if (candidates.size < 50) {
    for (const gram of generateTrigrams(name)) {
      const ids = _trigramIndex.get(gram);
      if (ids) for (const key of ids) {
        if (!candidates.has(key)) candidates.set(key, 0);
      }
    }
  }

  // Score candidates
  const results = [];
  for (const key of candidates.keys()) {
    const entry = _entryMap.get(key);
    if (!entry) continue;
    if (filterSource && entry.list_category !== filterSource) continue;
    if (filterList  && entry.source_code    !== filterList)   continue;

    // Score against primary name and all aliases
    const names = [entry.primary_name];
    if (entry.aliases) for (const a of entry.aliases.split(/[|,;]/)) { const t = a.trim(); if (t) names.push(t); }

    let best = 0;
    let bestMatchedName = entry.primary_name;
    for (const n of names) {
      const s = scoreName(name, n);
      if (s > best) { best = s; bestMatchedName = n; }
    }

    if (best >= threshold) {
      results.push({ ...entry, score: best, matchedName: bestMatchedName });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return {
    results: results.slice(0, maxResults),
    totalInRAM: _entryMap.size,
    indexReady: true,
    query: name,
  };
}

// ── Status ────────────────────────────────────────────────────────────────────
function getUnifiedStatus() {
  return {
    totalInRAM:    _entryMap.size,
    tokenCount:    _tokenIndex.size,
    phoneticCount: _phoneticIndex.size,
    trigramCount:  _trigramIndex.size,
    isLoading:     _isLoading,
    loadProgress:  _loadProgress,
    lastLoaded:    _lastLoaded,
    loadError:     _loadError,
    indexReady:    _entryMap.size > 0,
  };
}

// ── Clear / reload by category ────────────────────────────────────────────────
async function reloadCategory(category) {
  // Remove all entries of this category from indexes
  const keysToRemove = [];
  for (const key of _entryMap.keys()) {
    if (key.startsWith(category + ':')) keysToRemove.push(key);
  }
  for (const key of keysToRemove) {
    _entryMap.delete(key);
    for (const [tok, ids] of _tokenIndex)    { ids.delete(key); if (!ids.size) _tokenIndex.delete(tok); }
    for (const [code, ids] of _phoneticIndex) { ids.delete(key); if (!ids.size) _phoneticIndex.delete(code); }
    for (const [gram, ids] of _trigramIndex)  { ids.delete(key); if (!ids.size) _trigramIndex.delete(gram); }
  }

  // Reload from DB
  const BATCH = 5000;
  let offset = 0, loaded = 0;
  const table = category === 'PEP' ? 'pep_entries' : 'sanctions_entries';

  if (category === 'PEP') {
    while (true) {
      const rows = await query(`
        SELECT id, source AS source_code,
          CASE source WHEN 'OPENSANCTIONS_PEP' THEN 'OpenSanctions PEP'
            WHEN 'WIKIDATA' THEN 'Wikidata SPARQL' WHEN 'ICIJ' THEN 'ICIJ Offshore Leaks'
            ELSE source END AS source_name,
          'PEP' AS list_category, external_id, schema_type AS entry_type,
          primary_name, aliases, birth_date, countries, nationality, position,
          political_party, gender, dataset, adverse_links, wikidata_id, icij_node_id,
          status, first_seen AS listing_date
        FROM pep_entries WHERE status IN ('ACTIVE','DELISTED')
        ORDER BY id OFFSET ${offset} ROWS FETCH NEXT ${BATCH} ROWS ONLY
      `);
      if (!rows.recordset.length) break;
      for (const row of rows.recordset) {
        const key = `PEP:${row.id}`;
        _entryMap.set(key, row);
        indexEntry(row, _tokenIndex, _phoneticIndex, _trigramIndex);
        loaded++;
      }
      offset += BATCH;
    }
  } else {
    while (true) {
      const rows = await query(`
        SELECT e.id, s.source_code, s.source_name, 'SANCTIONS' AS list_category,
          e.external_id, e.entry_type, e.primary_name,
          (SELECT STRING_AGG(a.alias_name, '|') FROM sanctions_aliases a WHERE a.entry_id = e.id) AS aliases,
          e.dob AS birth_date, e.countries, e.nationality, e.position,
          e.political_party, e.gender, e.dataset, e.adverse_links,
          e.wikidata_id, e.icij_node_id, e.status,
          CONVERT(NVARCHAR(50), e.listing_date, 23) AS listing_date
        FROM sanctions_entries e JOIN sanctions_list_sources s ON e.source_id = s.id
        WHERE e.status IN ('ACTIVE','DELISTED')
        ORDER BY e.id OFFSET ${offset} ROWS FETCH NEXT ${BATCH} ROWS ONLY
      `);
      if (!rows.recordset.length) break;
      for (const row of rows.recordset) {
        const key = `SANCTIONS:${row.id}`;
        _entryMap.set(key, row);
        indexEntry(row, _tokenIndex, _phoneticIndex, _trigramIndex);
        loaded++;
      }
      offset += BATCH;
    }
  }
  console.log(`[UnifiedEngine] Reloaded ${loaded.toLocaleString()} ${category} entries`);
  return loaded;
}

function clearRAM() {
  _tokenIndex    = new Map();
  _phoneticIndex = new Map();
  _trigramIndex  = new Map();
  _entryMap      = new Map();
  _lastLoaded    = null;
  _loadProgress  = { loaded: 0, total: 0, pct: 0, phase: 'idle' };
  console.log('[UnifiedEngine] RAM index cleared');
}

// ── Auto-load on startup ──────────────────────────────────────────────────────
setTimeout(() => {
  loadUnified().catch(e => console.error('[UnifiedEngine] Startup load failed:', e.message));
}, 2000);

module.exports = {
  loadUnified,
  screenUnified,
  screenUnifiedMem,
  screenUnifiedDB,
  getUnifiedStatus,
  reloadCategory,
  clearRAM,
  scoreName,
};
