/**
 * In-Memory PEP (Politically Exposed Persons) Screening Engine
 * =============================================================
 * Mirrors the SanctionsEngine architecture:
 *   DB (pep_entries_mem) → RAM Map → Token + Phonetic + Trigram Index → Candidate lookup → Fuzzy score
 *
 * Indexing strategy (3-layer):
 *   1. Token index      – exact token match (fast, high precision)
 *   2. Phonetic index   – Double Metaphone (catches Gaddafi/Qaddafi, Mohammed/Muhammad)
 *   3. Trigram index    – 3-char sliding window (catches partial names, typos, transliterations)
 *
 * Scoring strategy (composite):
 *   - Jaro-Winkler distance (rewards prefix agreement, good for names)
 *   - Levenshtein similarity (edit distance fallback)
 *   - Trigram overlap coefficient (structural similarity)
 *   - Token-level best-match aggregation (handles reordered name parts)
 *
 * Performance target: <20ms per screening request
 */
'use strict';
const { query } = require('../db/connection');
const { doubleMetaphone } = require('double-metaphone');

// ── Engine state ──────────────────────────────────────────────────────────────
let _pepEntries    = new Map();   // pep_id → pep object
let _tokenIndex    = new Map();   // token → Set of pep_ids
let _phoneticIndex = new Map();   // metaphone_code → Set of pep_ids
let _trigramIndex  = new Map();   // trigram → Set of pep_ids  (NEW)
let _loadedAt      = null;
let _entryCount    = 0;
let _isLoading     = false;
let _loadPromise   = null;

// ── Load progress (exposed via /api/pep/stats) ────────────────────────────────
let _loadProgress  = { loaded: 0, total: 0, pct: 0 };

// ── Tokenizer ─────────────────────────────────────────────────────────────────
function tokenize(name) {
  if (!name) return [];
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

// ── Trigram generator ─────────────────────────────────────────────────────────
function generateTrigrams(str) {
  if (!str || str.length < 2) return new Set();
  const s = '#' + str.toUpperCase().replace(/[^A-Z0-9]/g, '') + '#';
  const grams = new Set();
  for (let i = 0; i <= s.length - 3; i++) {
    grams.add(s.substring(i, i + 3));
  }
  return grams;
}

// ── Phonetic codes (Double Metaphone) ─────────────────────────────────────────
function phoneticCodes(name) {
  if (!name) return [];
  const codes = new Set();
  for (const tok of tokenize(name)) {
    if (tok.length < 3) continue;
    try {
      const [primary, secondary] = doubleMetaphone(tok);
      if (primary)   codes.add(primary);
      if (secondary && secondary !== primary) codes.add(secondary);
    } catch (_) {}
  }
  return [...codes];
}

// ── Jaro-Winkler similarity (0-100) ──────────────────────────────────────────
function jaroWinkler(s1, s2) {
  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;
  const l1 = s1.length, l2 = s2.length;
  const matchDist = Math.max(Math.floor(Math.max(l1, l2) / 2) - 1, 0);
  const s1Matches = new Array(l1).fill(false);
  const s2Matches = new Array(l2).fill(false);
  let matches = 0, transpositions = 0;
  for (let i = 0; i < l1; i++) {
    const start = Math.max(0, i - matchDist);
    const end   = Math.min(i + matchDist + 1, l2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true; s2Matches[j] = true; matches++; break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro = (matches / l1 + matches / l2 + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(l1, l2)); i++) {
    if (s1[i] === s2[i]) prefix++; else break;
  }
  const jw = jaro + prefix * 0.1 * (1 - jaro);
  return Math.round(jw * 100);
}

// ── Levenshtein similarity (0-100) ────────────────────────────────────────────
function levenshtein(a, b) {
  if (a === b) return 100;
  if (!a || !b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > Math.max(la, lb) * 0.6) return 0;
  if (a.includes(b) || b.includes(a)) {
    return Math.round((Math.min(la, lb) / Math.max(la, lb)) * 100);
  }
  const dp = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return Math.round((1 - dp[la][lb] / Math.max(la, lb)) * 100);
}

// ── Trigram Dice coefficient (0-100) ─────────────────────────────────────────
function trigramSimilarity(a, b) {
  const ga = generateTrigrams(a);
  const gb = generateTrigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let intersection = 0;
  for (const g of ga) { if (gb.has(g)) intersection++; }
  return Math.round((2 * intersection / (ga.size + gb.size)) * 100);
}

// ── Composite name scorer ─────────────────────────────────────────────────────
function scoreName(searchName, entryName) {
  const s = searchName.toUpperCase().trim();
  const e = entryName.toUpperCase().trim();
  if (s === e) return 100;

  const jw   = jaroWinkler(s, e);
  const lev  = levenshtein(s, e);
  const trig = trigramSimilarity(s, e);
  const fullScore = Math.round(jw * 0.5 + lev * 0.25 + trig * 0.25);

  const sToks = tokenize(s);
  const eToks = tokenize(e);
  if (sToks.length === 0 || eToks.length === 0) return fullScore;

  let tokenScore = 0;
  for (const st of sToks) {
    let best = 0;
    for (const et of eToks) {
      const sc = Math.round(
        jaroWinkler(st, et) * 0.5 +
        levenshtein(st, et) * 0.25 +
        trigramSimilarity(st, et) * 0.25
      );
      if (sc > best) best = sc;
    }
    tokenScore += best;
  }
  tokenScore = Math.round(tokenScore / sToks.length);

  return Math.max(fullScore, tokenScore);
}

// ── Load all PEP entries into RAM ─────────────────────────────────────────────
function loadPEPs() {
  if (_isLoading) return _loadPromise;
  if (_entryCount > 0) return Promise.resolve({ count: _entryCount, loadedAt: _loadedAt });
  _isLoading    = true;
  _loadProgress = { loaded: 0, total: 0, pct: 0 };
  _loadPromise  = _doLoad();
  return _loadPromise;
}

async function _doLoad() {
  console.log('[PEPEngine] Loading PEP entries into RAM (Token + Phonetic + Trigram index)...');
  const t0 = Date.now();
  try {
    const { getPool } = require('../db/connection');
    const PAGE = 10000;
    let offset = 0;
    const rows = [];

    // Get total count for progress tracking
    try {
      const pool = await getPool();
      const countResult = await pool.request().query(
        `SELECT COUNT(*) AS cnt FROM pep_entries_mem WHERE status = 'ACTIVE'`
      );
      _loadProgress.total = countResult.recordset[0]?.cnt || 703175;
    } catch (_) {
      _loadProgress.total = 703175;
    }

    while (true) {
      let page = [];
      try {
        const pool = await getPool();
        const result = await pool.request().query(`
          SELECT
            id, external_id, source, schema_type,
            primary_name, aliases, birth_date,
            countries, nationality, position,
            political_party, gender, dataset,
            remarks, adverse_links, wikidata_id,
            icij_node_id, first_seen, last_seen, status
          FROM pep_entries_mem
          WHERE status = 'ACTIVE'
          ORDER BY id
          OFFSET ${offset} ROWS FETCH NEXT ${PAGE} ROWS ONLY
        `);
        page = result.recordset || [];
      } catch (pageErr) {
        console.log(`[PEPEngine] Page ${offset}-${offset+PAGE} error: ${pageErr.message}, retrying...`);
        await new Promise(r => setTimeout(r, 3000));
        const pool = await getPool();
        const result = await pool.request().query(`
          SELECT
            id, external_id, source, schema_type,
            primary_name, aliases, birth_date,
            countries, nationality, position,
            political_party, gender, dataset,
            remarks, adverse_links, wikidata_id,
            icij_node_id, first_seen, last_seen, status
          FROM pep_entries_mem
          WHERE status = 'ACTIVE'
          ORDER BY id
          OFFSET ${offset} ROWS FETCH NEXT ${PAGE} ROWS ONLY
        `);
        page = result.recordset || [];
      }
      if (page.length === 0) break;
      rows.push(...page);
      offset += PAGE;
      _loadProgress.loaded = rows.length;
      _loadProgress.pct = _loadProgress.total > 0
        ? Math.round((rows.length / _loadProgress.total) * 100)
        : 0;
      if (page.length < PAGE) break;
      console.log(`[PEPEngine] Loaded ${rows.length.toLocaleString()} rows so far... (${_loadProgress.pct}%)`);
    }

    const newEntries     = new Map();
    const newTokenIdx    = new Map();
    const newPhoneticIdx = new Map();
    const newTrigramIdx  = new Map();

    const indexName = (name, id) => {
      if (!name) return;
      const upper = name.toUpperCase().trim();
      for (const token of tokenize(upper)) {
        if (!newTokenIdx.has(token)) newTokenIdx.set(token, new Set());
        newTokenIdx.get(token).add(id);
      }
      for (const code of phoneticCodes(upper)) {
        if (!newPhoneticIdx.has(code)) newPhoneticIdx.set(code, new Set());
        newPhoneticIdx.get(code).add(id);
      }
      for (const token of tokenize(upper)) {
        if (token.length < 3) continue;
        for (const gram of generateTrigrams(token)) {
          if (!newTrigramIdx.has(gram)) newTrigramIdx.set(gram, new Set());
          newTrigramIdx.get(gram).add(id);
        }
      }
    };

    for (const row of rows) {
      const aliasList = row.aliases
        ? row.aliases.split('|').map(a => a.trim()).filter(Boolean)
        : [];

      const entry = {
        id:           row.id,
        externalId:   row.external_id,
        source:       row.source,
        schemaType:   row.schema_type,
        name:         row.primary_name,
        aliases:      aliasList,
        birthDate:    row.birth_date,
        countries:    row.countries,
        nationality:  row.nationality,
        position:     row.position,
        party:        row.political_party,
        gender:       row.gender,
        dataset:      row.dataset,
        remarks:      row.remarks,
        adverseLinks: row.adverse_links,
        wikidataId:   row.wikidata_id,
        icijNodeId:   row.icij_node_id,
        firstSeen:    row.first_seen,
        lastSeen:     row.last_seen,
      };
      newEntries.set(row.id, entry);
      indexName(row.primary_name, row.id);
      for (const alias of aliasList) indexName(alias, row.id);
    }

    _pepEntries    = newEntries;
    _tokenIndex    = newTokenIdx;
    _phoneticIndex = newPhoneticIdx;
    _trigramIndex  = newTrigramIdx;
    _entryCount    = newEntries.size;
    _loadedAt      = new Date();
    _isLoading     = false;
    _loadProgress  = { loaded: _entryCount, total: _entryCount, pct: 100 };

    const elapsed = Date.now() - t0;
    const memMB   = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    console.log(`[PEPEngine] Loaded ${_entryCount.toLocaleString()} PEP entries in ${elapsed}ms | heap: ${memMB}MB`);
    console.log(`[PEPEngine] Index sizes: tokens=${newTokenIdx.size.toLocaleString()}, phonetic=${newPhoneticIdx.size.toLocaleString()}, trigrams=${newTrigramIdx.size.toLocaleString()}`);
    return { count: _entryCount, loadedAt: _loadedAt, elapsed };
  } catch (err) {
    _isLoading = false;
    console.error('[PEPEngine] Load failed:', err.message);
    throw err;
  }
}

// ── PEP screening function ────────────────────────────────────────────────────
function screenPEP(name, opts = {}) {
  if (!name) return { matches: [], topScore: 0, result: 'CLEAR', error: 'No name provided' };
  const threshold  = opts.threshold  ?? 70;
  const maxResults = opts.maxResults ?? 20;
  const t0 = Date.now();

  const searchUpper = name.toUpperCase().trim();
  const searchToks  = tokenize(searchUpper);

  const candidateIds = new Set();

  // Layer 1: Token index
  for (const token of searchToks) {
    const ids = _tokenIndex.get(token);
    if (ids) ids.forEach(id => candidateIds.add(id));
  }

  // Layer 2: Phonetic index (Double Metaphone)
  for (const code of phoneticCodes(searchUpper)) {
    const ids = _phoneticIndex.get(code);
    if (ids) ids.forEach(id => candidateIds.add(id));
  }

  // Layer 3: Trigram index
  for (const token of searchToks) {
    if (token.length < 3) continue;
    for (const gram of generateTrigrams(token)) {
      const ids = _trigramIndex.get(gram);
      if (ids) ids.forEach(id => candidateIds.add(id));
    }
  }

  // Prefix broadening if still too few candidates
  if (candidateIds.size < 20 && searchToks.length > 0) {
    const firstTok = searchToks[0];
    const prefix = firstTok.substring(0, Math.max(3, firstTok.length - 1));
    for (const [tok, ids] of _tokenIndex) {
      if (tok.startsWith(prefix)) {
        ids.forEach(id => candidateIds.add(id));
      }
    }
  }

  const scored = [];
  for (const id of candidateIds) {
    const entry = _pepEntries.get(id);
    if (!entry) continue;

    let bestScore = scoreName(searchUpper, entry.name);
    let matchedOn = entry.name;

    for (const alias of entry.aliases) {
      const s = scoreName(searchUpper, alias);
      if (s > bestScore) { bestScore = s; matchedOn = alias; }
    }

    if (bestScore >= threshold) {
      scored.push({ entry, score: bestScore, matchedOn });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  const topMatches = scored.slice(0, maxResults);

  const matches = topMatches.map(({ entry, score, matchedOn }) => ({
    id:           entry.id,
    externalId:   entry.externalId,
    source:       entry.source,
    name:         entry.name,
    matchedOn,
    score,
    schemaType:   entry.schemaType,
    birthDate:    entry.birthDate,
    countries:    entry.countries,
    nationality:  entry.nationality,
    position:     entry.position,
    party:        entry.party,
    gender:       entry.gender,
    dataset:      entry.dataset,
    remarks:      entry.remarks,
    adverseLinks: entry.adverseLinks,
    wikidataId:   entry.wikidataId,
    icijNodeId:   entry.icijNodeId,
    firstSeen:    entry.firstSeen,
    lastSeen:     entry.lastSeen,
    aliases:      entry.aliases,
  }));

  const topScore = matches.length > 0 ? matches[0].score : 0;
  const result   = topScore >= 85 ? 'HIT' : topScore >= threshold ? 'POSSIBLE_MATCH' : 'CLEAR';

  return {
    matches,
    topScore,
    result,
    screenedAt:  new Date().toISOString(),
    durationMs:  Date.now() - t0,
    totalPEPs:   _entryCount,
  };
}

// ── Status / reload ───────────────────────────────────────────────────────────
function getPEPStatus() {
  return {
    loaded:       _entryCount > 0,
    entryCount:   _entryCount,
    loadedAt:     _loadedAt,
    memoryMB:     Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    isLoading:    _isLoading,
    loadProgress: _loadProgress,
  };
}

async function reloadPEPs() {
  _isLoading    = false;
  _loadPromise  = null;
  _pepEntries    = new Map();
  _tokenIndex    = new Map();
  _phoneticIndex = new Map();
  _trigramIndex  = new Map();
  _entryCount    = 0;
  _loadProgress  = { loaded: 0, total: 0, pct: 0 };
  return loadPEPs();
}

// ── Upsert a single PEP entry into RAM ───────────────────────────────────────
function upsertPEPInRAM(pepRow) {
  const aliasList = pepRow.aliases
    ? pepRow.aliases.split('|').map(a => a.trim()).filter(Boolean)
    : [];
  const entry = {
    id:           pepRow.id,
    externalId:   pepRow.external_id,
    source:       pepRow.source,
    schemaType:   pepRow.schema_type,
    name:         pepRow.primary_name,
    aliases:      aliasList,
    birthDate:    pepRow.birth_date,
    countries:    pepRow.countries,
    nationality:  pepRow.nationality,
    position:     pepRow.position,
    party:        pepRow.political_party,
    gender:       pepRow.gender,
    dataset:      pepRow.dataset,
    remarks:      pepRow.remarks,
    adverseLinks: pepRow.adverse_links,
    wikidataId:   pepRow.wikidata_id,
    icijNodeId:   pepRow.icij_node_id,
    firstSeen:    pepRow.first_seen,
    lastSeen:     pepRow.last_seen,
  };
  _pepEntries.set(pepRow.id, entry);

  const indexName = (name) => {
    if (!name) return;
    const upper = name.toUpperCase().trim();
    for (const token of tokenize(upper)) {
      if (!_tokenIndex.has(token)) _tokenIndex.set(token, new Set());
      _tokenIndex.get(token).add(pepRow.id);
    }
    for (const code of phoneticCodes(upper)) {
      if (!_phoneticIndex.has(code)) _phoneticIndex.set(code, new Set());
      _phoneticIndex.get(code).add(pepRow.id);
    }
    for (const token of tokenize(upper)) {
      if (token.length < 3) continue;
      for (const gram of generateTrigrams(token)) {
        if (!_trigramIndex.has(gram)) _trigramIndex.set(gram, new Set());
        _trigramIndex.get(gram).add(pepRow.id);
      }
    }
  };

  indexName(pepRow.primary_name);
  for (const alias of aliasList) indexName(alias);
  _entryCount = _pepEntries.size;
}

// ── Source-specific RAM reload ──────────────────────────────────────────────────
const _sourceLoadProgress = {};

async function loadSourceIntoRAM(source) {
  console.log(`[PEPEngine] Reloading source '${source}' into RAM...`);
  _sourceLoadProgress[source] = { loaded: 0, total: 0, pct: 0, isLoading: true };
  try {
    const { getPool } = require('../db/connection');
    const pool = await getPool();
    const safe = source.replace(/[^A-Z0-9_]/gi, '');

    // Get count
    const countRes = await pool.request().query(
      `SELECT COUNT(*) AS cnt FROM pep_entries_mem WHERE status = 'ACTIVE' AND source = '${safe}'`
    );
    const total = countRes.recordset[0]?.cnt || 0;
    _sourceLoadProgress[source].total = total;

    // Remove old entries for this source from all indexes
    const toRemove = [];
    for (const [id, entry] of _pepEntries) {
      if (entry.source === source) toRemove.push(id);
    }
    for (const id of toRemove) {
      _pepEntries.delete(id);
      // Remove from token index
      for (const [tok, ids] of _tokenIndex) { ids.delete(id); if (ids.size === 0) _tokenIndex.delete(tok); }
      for (const [code, ids] of _phoneticIndex) { ids.delete(id); if (ids.size === 0) _phoneticIndex.delete(code); }
      for (const [gram, ids] of _trigramIndex) { ids.delete(id); if (ids.size === 0) _trigramIndex.delete(gram); }
    }
    console.log(`[PEPEngine] Removed ${toRemove.length} old '${source}' entries from RAM.`);

    // Load fresh from DB
    const PAGE = 5000;
    let offset = 0;
    let loaded = 0;
    while (true) {
      const res = await pool.request().query(`
        SELECT id, external_id, source, schema_type,
               primary_name, aliases, birth_date,
               countries, nationality, position,
               political_party, gender, dataset,
               remarks, adverse_links, wikidata_id,
               icij_node_id, first_seen, last_seen, status
        FROM pep_entries_mem
        WHERE status = 'ACTIVE' AND source = '${safe}'
        ORDER BY id
        OFFSET ${offset} ROWS FETCH NEXT ${PAGE} ROWS ONLY
      `);
      const page = res.recordset || [];
      if (page.length === 0) break;
      for (const row of page) upsertPEPInRAM(row);
      loaded += page.length;
      offset += PAGE;
      _sourceLoadProgress[source].loaded = loaded;
      _sourceLoadProgress[source].pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
      if (page.length < PAGE) break;
    }
    _entryCount = _pepEntries.size;
    _sourceLoadProgress[source] = { loaded, total, pct: 100, isLoading: false };
    console.log(`[PEPEngine] Source '${source}' reloaded: ${loaded} entries. Total RAM: ${_entryCount}`);
  } catch (err) {
    _sourceLoadProgress[source] = { ..._sourceLoadProgress[source], isLoading: false, error: err.message };
    throw err;
  }
}

function getSourceLoadProgress(source) {
  return _sourceLoadProgress[source] || { loaded: 0, total: 0, pct: 0, isLoading: false };
}

module.exports = { loadPEPs, screenPEP, getPEPStatus, reloadPEPs, upsertPEPInRAM, loadSourceIntoRAM, getSourceLoadProgress };
