/**
 * In-Memory Sanctions Screening Engine
 * =====================================
 * Loads all sanctions entries into RAM at startup and builds an inverted
 * token index for fast candidate retrieval. Fuzzy scoring runs only on
 * candidates (~50-200 entries) instead of all 35,224.
 *
 * Architecture:
 *   DB (35,224 rows) → RAM Map → Token Index → Candidate lookup → Fuzzy score
 *
 * Performance target: <20ms per screening request
 * Memory footprint:   ~80-100 MB
 */

'use strict';

const { query } = require('../db/connection');
const { doubleMetaphone } = require('double-metaphone');
const redisCache = require('./redisCache'); // D — Redis cache

// ── List priority order (compliance standard) ─────────────────────────────────
const LIST_PRIORITY = ['OFAC', 'UN', 'EU', 'UK', 'SECO', 'BIS', 'DFAT', 'MAS'];

// ── Engine state ──────────────────────────────────────────────────────────────
let _entries        = new Map();   // entry_id → entry object
let _tokenIndex     = new Map();   // token → Set of entry_ids
let _phoneticIndex  = new Map();   // metaphone_code → Set of entry_ids (B: phonetic index)
let _loadedAt       = null;
let _entryCount     = 0;
let _isLoading      = false;
let _loadPromise    = null;

// ── Tokenizer ─────────────────────────────────────────────────────────────────
/**
 * Split a name into normalized tokens.
 * "Mohammed Al-Rashidi" → ["MOHAMMED", "AL", "RASHIDI"]
 */
function tokenize(name) {
  if (!name) return [];
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')   // replace punctuation with space
    .split(/\s+/)
    .filter(t => t.length >= 2);    // drop single-char tokens
}

/**
 * B — Double Metaphone phonetic codes for a name.
 * "Gaddafi" and "Qaddafi" both → ["KTF","KTF"]
 * Returns array of unique non-empty codes.
 */
function phoneticCodes(name) {
  if (!name) return [];
  const tokens = tokenize(name);
  const codes = new Set();
  for (const tok of tokens) {
    try {
      const [primary, secondary] = doubleMetaphone(tok);
      if (primary)   codes.add(primary);
      if (secondary) codes.add(secondary);
    } catch (_) {}
  }
  return [...codes];
}

// ── Levenshtein similarity (0-100) ────────────────────────────────────────────
function similarity(a, b) {
  if (a === b) return 100;
  if (!a || !b) return 0;

  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > Math.max(la, lb) * 0.6) return 0;

  // Containment bonus
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(la, lb);
    const longer  = Math.max(la, lb);
    return Math.round((shorter / longer) * 100);
  }

  // Levenshtein
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
  const dist = dp[la][lb];
  const maxLen = Math.max(la, lb);
  return Math.round((1 - dist / maxLen) * 100);
}

/**
 * Score a search name against an entry name using token-aware fuzzy matching.
 * Returns 0-100.
 */
function scoreName(searchName, entryName) {
  const s = searchName.toUpperCase().trim();
  const e = entryName.toUpperCase().trim();

  // Exact match
  if (s === e) return 100;

  // Full string similarity
  const fullScore = similarity(s, e);

  // Token-level scoring: best token pair average
  const sToks = tokenize(s);
  const eToks = tokenize(e);
  if (sToks.length === 0 || eToks.length === 0) return fullScore;

  let tokenScore = 0;
  for (const st of sToks) {
    let best = 0;
    for (const et of eToks) {
      const sc = similarity(st, et);
      if (sc > best) best = sc;
    }
    tokenScore += best;
  }
  tokenScore = Math.round(tokenScore / sToks.length);

  return Math.max(fullScore, tokenScore);
}

// ── Load all entries into RAM ─────────────────────────────────────────────────
async function loadEntries() {
  if (_isLoading) return _loadPromise;

  _isLoading   = true;
  _loadPromise = _doLoad();
  return _loadPromise;
}

async function _doLoad() {
  console.log('[SanctionsEngine] Loading entries into RAM...');
  const t0 = Date.now();

  try {
    // D — Try Redis cache first (instant load, no DB round-trip)
    const cached = await redisCache.loadIndex();
    if (cached) {
      _entries       = new Map(cached.entries.map(e => [e.id, e]));
      _tokenIndex    = cached.tokenIndex;
      _phoneticIndex = cached.phoneticIndex;
      _entryCount    = cached.entryCount;
      _loadedAt      = new Date();
      _isLoading     = false;
      const elapsed  = Date.now() - t0;
      const memMB    = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      console.log(`[SanctionsEngine] Restored ${_entryCount.toLocaleString()} entries from Redis cache in ${elapsed}ms | heap: ${memMB}MB`);
      return { count: _entryCount, loadedAt: _loadedAt, elapsed, source: 'redis' };
    }

    // Load all active entries with source code
    const result = await query(`
      SELECT
        e.id,
        e.primary_name,
        e.entry_type,
        e.dob,
        e.nationality,
        e.programme,
        e.status,
        e.listing_date,
        s.source_code,
        s.source_name
      FROM sanctions_entries e
      INNER JOIN sanctions_list_sources s ON s.id = e.source_id
      WHERE e.status IN ('Active', 'ACTIVE')
    `);

    // Load all aliases in one query
    const aliasResult = await query(`
      SELECT a.entry_id, a.alias_name, a.alias_type, a.alias_quality
      FROM sanctions_aliases a
      INNER JOIN sanctions_entries e ON e.id = a.entry_id
      WHERE e.status IN ('Active', 'ACTIVE')
        AND a.alias_name IS NOT NULL
        AND LEN(a.alias_name) > 1
    `);

    // Build alias map: entry_id → [alias_name, ...]
    const aliasMap = new Map();
    for (const a of (aliasResult.recordset || [])) {
      if (!aliasMap.has(a.entry_id)) aliasMap.set(a.entry_id, []);
      aliasMap.get(a.entry_id).push(a.alias_name);
    }

    const rows = result.recordset || [];

    // Build Map and token index
    const newEntries    = new Map();
    const newTokenIndex = new Map();

    const newPhoneticIndex = new Map();

    for (const row of rows) {
      const aliases = aliasMap.get(row.id) || [];
      const entry = {
        id:          row.id,
        name:        row.primary_name,
        aliases,
        type:        row.entry_type,
        dob:         row.dob,
        nationality: row.nationality,
        programme:   row.programme,
        listSource:  row.source_code,
        listName:    row.source_name,
        listPriority: LIST_PRIORITY.indexOf(row.source_code),
      };
      newEntries.set(row.id, entry);

      // Index primary name tokens
      for (const token of tokenize(row.primary_name)) {
        if (!newTokenIndex.has(token)) newTokenIndex.set(token, new Set());
        newTokenIndex.get(token).add(row.id);
      }
      // Index alias tokens
      for (const alias of aliases) {
        for (const token of tokenize(alias)) {
          if (!newTokenIndex.has(token)) newTokenIndex.set(token, new Set());
          newTokenIndex.get(token).add(row.id);
        }
      }
      // B — Phonetic index: primary name + aliases
      for (const code of phoneticCodes(row.primary_name)) {
        if (!newPhoneticIndex.has(code)) newPhoneticIndex.set(code, new Set());
        newPhoneticIndex.get(code).add(row.id);
      }
      for (const alias of aliases) {
        for (const code of phoneticCodes(alias)) {
          if (!newPhoneticIndex.has(code)) newPhoneticIndex.set(code, new Set());
          newPhoneticIndex.get(code).add(row.id);
        }
      }
    }

    _entries       = newEntries;
    _tokenIndex    = newTokenIndex;
    _phoneticIndex = newPhoneticIndex;
    _entryCount = newEntries.size;
    _loadedAt   = new Date();
    _isLoading  = false;

    const elapsed = Date.now() - t0;
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    console.log(`[SanctionsEngine] Loaded ${_entryCount.toLocaleString()} entries in ${elapsed}ms | heap: ${memMB}MB`);

    // D — Save to Redis cache for instant future restarts
    redisCache.saveIndex({
      entries:       [...newEntries.values()],
      tokenIndex:    newTokenIndex,
      phoneticIndex: newPhoneticIndex,
      entryCount:    _entryCount,
    }).catch(e => console.error('[SanctionsEngine] Redis save failed:', e.message));

    return { count: _entryCount, loadedAt: _loadedAt, elapsed, source: 'db' };
  } catch (err) {
    _isLoading = false;
    console.error('[SanctionsEngine] Load failed:', err.message);
    throw err;
  }
}

// ── Core screening function ───────────────────────────────────────────────────
/**
 * Screen a name against the in-memory index.
 *
 * @param {string} name          - Name to screen
 * @param {object} opts
 * @param {number} opts.threshold - Minimum score to report (default 60)
 * @param {number} opts.maxResults - Max matches to return (default 10)
 * @param {string[]} opts.lists  - Limit to specific lists (default: all)
 * @returns {{ matches, topScore, result, screenedAt, durationMs }}
 */
function screen(name, opts = {}) {
  if (!name || typeof name !== 'string') {
    return { matches: [], topScore: 0, result: 'CLEAR', error: 'No name provided' };
  }

  const threshold  = opts.threshold  ?? 60;
  const maxResults = opts.maxResults ?? 10;
  const listsFilter = opts.lists && opts.lists.length > 0
    ? new Set(opts.lists.map(l => l.toUpperCase()))
    : null;

  const t0 = Date.now();
  const searchUpper = name.toUpperCase().trim();
  const searchTokens = tokenize(searchUpper);

  // ── Step 1: Candidate retrieval via token index ──────────────────────────
  const candidateIds = new Set();

  if (searchTokens.length > 0) {
    for (const token of searchTokens) {
      // Exact token lookup
      if (_tokenIndex.has(token)) {
        for (const id of _tokenIndex.get(token)) candidateIds.add(id);
      }
      // Prefix lookup for short tokens (≤6 chars)
      if (token.length <= 6) {
        for (const [indexToken, ids] of _tokenIndex) {
          if (indexToken.startsWith(token) || token.startsWith(indexToken)) {
            for (const id of ids) candidateIds.add(id);
          }
        }
      }
    }
  }

  // B — Phonetic candidate expansion: catches Gaddafi/Qaddafi, Mohammed/Muhammad etc.
  for (const code of phoneticCodes(searchUpper)) {
    const ids = _phoneticIndex.get(code);
    if (ids) ids.forEach(id => candidateIds.add(id));
  }

  // If very few candidates, broaden search with substring matching on first token
  if (candidateIds.size < 20 && searchTokens.length > 0) {
    const firstTok = searchTokens[0];
    for (const [indexToken, ids] of _tokenIndex) {
      if (indexToken.includes(firstTok) || firstTok.includes(indexToken)) {
        for (const id of ids) candidateIds.add(id);
      }
    }
  }

  // ── Step 2: Score candidates (primary name + aliases) ───────────────────
  const scored = [];

  for (const id of candidateIds) {
    const entry = _entries.get(id);
    if (!entry) continue;
    if (listsFilter && !listsFilter.has(entry.listSource)) continue;

    // Score primary name
    let bestScore = scoreName(searchUpper, entry.name);
    let matchedName = entry.name;
    let matchedVia = 'PRIMARY';

    // Score aliases — keep the best match
    if (entry.aliases && entry.aliases.length > 0) {
      for (const alias of entry.aliases) {
        const aliasScore = scoreName(searchUpper, alias);
        if (aliasScore > bestScore) {
          bestScore = aliasScore;
          matchedName = alias;
          matchedVia = 'ALIAS';
        }
      }
    }

    if (bestScore >= threshold) {
      scored.push({ ...entry, score: bestScore, matchedName, matchedVia });
    }
  }

  // ── Step 3: Sort by list priority then score ──────────────────────────────
  scored.sort((a, b) => {
    // Higher score first
    if (b.score !== a.score) return b.score - a.score;
    // Then by list priority (OFAC=0 first)
    const pa = a.listPriority >= 0 ? a.listPriority : 99;
    const pb = b.listPriority >= 0 ? b.listPriority : 99;
    return pa - pb;
  });

  const matches    = scored.slice(0, maxResults);
  const topScore   = matches.length > 0 ? matches[0].score : 0;
  const durationMs = Date.now() - t0;

  // ── Step 4: Determine result ──────────────────────────────────────────────
  let result;
  if (topScore >= 90)      result = 'BLOCKED';
  else if (topScore >= 65) result = 'POTENTIAL_MATCH';
  else                     result = 'CLEAR';

  return {
    matches: matches.map(m => ({
      entryId:     m.id,
      name:        m.name,
      matchedName: m.matchedName || m.name,
      matchedVia:  m.matchedVia  || 'PRIMARY',
      type:        m.type,
      score:       m.score,
      matchType:   m.score === 100 ? 'EXACT' : 'FUZZY',
      listSource:  m.listSource,
      listName:    m.listName,
      programme:   m.programme,
      nationality: m.nationality,
      dob:         m.dob,
      aliases:     m.aliases || [],
    })),
    topScore,
    result,
    candidatesEvaluated: candidateIds.size,
    totalEntries: _entryCount,
    screenedAt:  new Date().toISOString(),
    durationMs,
  };
}

// ── Real-time cache sync ─────────────────────────────────────────────────────

/**
 * Add or fully replace one entry in the RAM cache.
 * Call this immediately after INSERT or UPDATE in the DB.
 *
 * @param {object} row  - DB row: { id, primary_name, entry_type, dob, nationality, programme, status, source_code, source_name }
 */
function upsertEntry(row) {
  if (!row || !row.id) return;

  // Remove old token index entries for this id (if updating)
  const existing = _entries.get(row.id);
  if (existing) {
    for (const token of tokenize(existing.name)) {
      const ids = _tokenIndex.get(token);
      if (ids) {
        ids.delete(row.id);
        if (ids.size === 0) _tokenIndex.delete(token);
      }
    }
    _entries.delete(row.id);
    _entryCount--;
  }

  // Only index active entries
  const status = (row.status || '').toLowerCase();
  if (status !== 'active') return;

  const entry = {
    id:           row.id,
    name:         row.primary_name,
    type:         row.entry_type,
    dob:          row.dob,
    nationality:  row.nationality,
    programme:    row.programme,
    listSource:   row.source_code,
    listName:     row.source_name,
    listPriority: LIST_PRIORITY.indexOf(row.source_code),
  };

  _entries.set(row.id, entry);
  _entryCount++;

  // Add new token index entries
  for (const token of tokenize(row.primary_name)) {
    if (!_tokenIndex.has(token)) _tokenIndex.set(token, new Set());
    _tokenIndex.get(token).add(row.id);
  }

  console.log(`[SanctionsEngine] upsert id=${row.id} name="${row.primary_name}" list=${row.source_code} | total=${_entryCount}`);
}

/**
 * Remove one entry from the RAM cache.
 * Call this immediately after DELETE in the DB.
 *
 * @param {number} id  - The sanctions_entries.id to remove
 */
function removeEntry(id) {
  const entry = _entries.get(id);
  if (!entry) return;

  // Remove from token index
  for (const token of tokenize(entry.name)) {
    const ids = _tokenIndex.get(token);
    if (ids) {
      ids.delete(id);
      if (ids.size === 0) _tokenIndex.delete(token);
    }
  }

  _entries.delete(id);
  _entryCount--;
  console.log(`[SanctionsEngine] removed id=${id} name="${entry.name}" | total=${_entryCount}`);
}

/**
 * Patch specific fields of an entry in the RAM cache without a full reload.
 * Call this after a partial UPDATE (e.g. status change, programme update).
 *
 * @param {number} id     - The entry id
 * @param {object} fields - Partial fields to update: { primary_name?, status?, dob?, nationality?, programme?, source_code? }
 */
function patchEntry(id, fields) {
  const entry = _entries.get(id);
  if (!entry) {
    // Entry not in cache — if it's being activated, we need the full row
    // Caller should use upsertEntry instead
    return;
  }

  // If name is changing, re-index tokens
  if (fields.primary_name && fields.primary_name !== entry.name) {
    // Remove old tokens
    for (const token of tokenize(entry.name)) {
      const ids = _tokenIndex.get(token);
      if (ids) { ids.delete(id); if (ids.size === 0) _tokenIndex.delete(token); }
    }
    entry.name = fields.primary_name;
    // Add new tokens
    for (const token of tokenize(entry.name)) {
      if (!_tokenIndex.has(token)) _tokenIndex.set(token, new Set());
      _tokenIndex.get(token).add(id);
    }
  }

  // If status is changing to inactive, remove from cache
  if (fields.status && !['active', 'ACTIVE', 'Active'].includes(fields.status)) {
    removeEntry(id);
    return;
  }

  // Patch other fields
  if (fields.dob         !== undefined) entry.dob         = fields.dob;
  if (fields.nationality !== undefined) entry.nationality = fields.nationality;
  if (fields.programme   !== undefined) entry.programme   = fields.programme;
  if (fields.source_code !== undefined) {
    entry.listSource  = fields.source_code;
    entry.listPriority = LIST_PRIORITY.indexOf(fields.source_code);
  }

  console.log(`[SanctionsEngine] patched id=${id} fields=${Object.keys(fields).join(',')} | total=${_entryCount}`);
}

// ── Status ────────────────────────────────────────────────────────────────────
function getStatus() {
  return {
    loaded:     _entryCount > 0,
    entryCount: _entryCount,
    loadedAt:   _loadedAt,
    tokenCount: _tokenIndex.size,
    memoryMB:   Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    listPriority: LIST_PRIORITY,
  };
}

// ── Reload (called after scraper runs) ───────────────────────────────────────
async function reload() {
  _entries    = new Map();
  _tokenIndex = new Map();
  _entryCount = 0;
  _loadedAt   = null;
  _isLoading  = false;
  return loadEntries();
}

// ── Auto-reload every 3 hours ─────────────────────────────────────────────────
setInterval(() => {
  console.log('[SanctionsEngine] Auto-reload triggered (3h interval)');
  reload().catch(err => console.error('[SanctionsEngine] Auto-reload failed:', err.message));
}, 3 * 60 * 60 * 1000);

module.exports = { loadEntries, screen, getStatus, reload, upsertEntry, removeEntry, patchEntry, LIST_PRIORITY };
