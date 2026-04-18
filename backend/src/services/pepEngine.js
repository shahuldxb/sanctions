/**
 * In-Memory PEP Screening Engine
 * ================================
 * Loads all PEP entries from pep_entries into RAM at startup and builds an
 * inverted token index for fast candidate retrieval. Fuzzy scoring runs only
 * on candidates instead of all 700,000+ records.
 *
 * Architecture:
 *   DB (700k rows) → RAM Map → Token Index → Candidate lookup → Fuzzy score
 *
 * Performance target: <50ms per screening request
 * Memory footprint:   ~600-900 MB (700k entries with aliases)
 *
 * Aliases in pep_entries are stored as pipe-delimited strings, e.g.:
 *   "Давид Ткемаладзе|ديفيد تكيمالادزي|დავით ტყემალაძე"
 */

'use strict';

const { query } = require('../db/connection');

// ── Engine state ──────────────────────────────────────────────────────────────
let _entries        = new Map();   // pep_id → entry object
let _tokenIndex     = new Map();   // token  → Set of pep_ids
let _loadedAt       = null;
let _entryCount     = 0;
let _isLoading      = false;
let _loadPromise    = null;

// ── Tokenizer ─────────────────────────────────────────────────────────────────
/**
 * Split a name into normalized tokens (Latin script only for index speed).
 * "Mohammed Al-Rashidi" → ["MOHAMMED", "AL", "RASHIDI"]
 * Non-Latin characters are stripped so the index stays ASCII-clean.
 */
function tokenize(name) {
  if (!name) return [];
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

/**
 * Parse a pipe-delimited alias string into an array of alias strings.
 * Returns [] if the value is null/undefined/empty.
 */
function parseAliases(raw) {
  if (!raw) return [];
  return raw
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 1);
}

// ── Levenshtein similarity (0-100) ────────────────────────────────────────────
function similarity(a, b) {
  if (a === b) return 100;
  if (!a || !b) return 0;

  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > Math.max(la, lb) * 0.6) return 0;

  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(la, lb);
    const longer  = Math.max(la, lb);
    return Math.round((shorter / longer) * 100);
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
  const dist = dp[la][lb];
  return Math.round((1 - dist / Math.max(la, lb)) * 100);
}

/**
 * Score a search name against an entry name using token-aware fuzzy matching.
 * Returns 0-100.
 */
function scoreName(searchName, entryName) {
  const s = searchName.toUpperCase().trim();
  const e = entryName.toUpperCase().trim();
  if (s === e) return 100;

  const fullScore = similarity(s, e);
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

// ── Load all PEP entries into RAM ─────────────────────────────────────────────
async function loadEntries() {
  if (_isLoading) return _loadPromise;
  _isLoading   = true;
  _loadPromise = _doLoad();
  return _loadPromise;
}

async function _doLoad() {
  console.log('[PepEngine] Loading PEP entries into RAM...');
  const t0 = Date.now();

  try {
    const newEntries    = new Map();
    const newTokenIndex = new Map();

    // Stream in pages of 50,000 to avoid a single massive result set in memory
    const PAGE_SIZE = 50000;
    let offset = 0;
    let totalLoaded = 0;

    while (true) {
      const result = await query(`
        SELECT
          id,
          primary_name,
          aliases,
          birth_date,
          countries,
          nationality,
          position,
          political_party,
          gender,
          dataset,
          source,
          status
        FROM pep_entries
        WHERE status = 'ACTIVE'
        ORDER BY id
        OFFSET ${offset} ROWS FETCH NEXT ${PAGE_SIZE} ROWS ONLY
      `);

      const rows = result.recordset || [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const aliases = parseAliases(row.aliases);

        const entry = {
          id:           row.id,
          name:         row.primary_name,
          aliases,
          dob:          row.birth_date,
          countries:    row.countries,
          nationality:  row.nationality,
          position:     row.position,
          party:        row.political_party,
          gender:       row.gender,
          dataset:      row.dataset,
          source:       row.source,
        };

        newEntries.set(row.id, entry);

        // Index primary name tokens
        for (const token of tokenize(row.primary_name)) {
          if (!newTokenIndex.has(token)) newTokenIndex.set(token, new Set());
          newTokenIndex.get(token).add(row.id);
        }

        // Index alias tokens (Latin-script aliases only for index efficiency)
        for (const alias of aliases) {
          for (const token of tokenize(alias)) {
            if (!newTokenIndex.has(token)) newTokenIndex.set(token, new Set());
            newTokenIndex.get(token).add(row.id);
          }
        }
      }

      totalLoaded += rows.length;
      offset      += PAGE_SIZE;

      const elapsedSoFar = Math.round((Date.now() - t0) / 1000);
      console.log(`[PepEngine] Loaded ${totalLoaded.toLocaleString()} / ? entries (${elapsedSoFar}s elapsed)...`);

      if (rows.length < PAGE_SIZE) break;  // last page
    }

    _entries    = newEntries;
    _tokenIndex = newTokenIndex;
    _entryCount = newEntries.size;
    _loadedAt   = new Date();
    _isLoading  = false;

    const elapsed = Date.now() - t0;
    const memMB   = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    console.log(`[PepEngine] Loaded ${_entryCount.toLocaleString()} PEP entries in ${elapsed}ms | heap: ${memMB}MB`);

    return { count: _entryCount, loadedAt: _loadedAt, elapsed };
  } catch (err) {
    _isLoading = false;
    console.error('[PepEngine] Load failed:', err.message);
    throw err;
  }
}

// ── Core PEP screening function ───────────────────────────────────────────────
/**
 * Screen a name against the in-memory PEP index.
 *
 * @param {string} name           - Name to screen
 * @param {object} opts
 * @param {number} opts.threshold  - Minimum score to report (default 60)
 * @param {number} opts.maxResults - Max matches to return (default 10)
 * @returns {{ matches, topScore, result, screenedAt, durationMs }}
 */
function screen(name, opts = {}) {
  if (!name || typeof name !== 'string') {
    return { matches: [], topScore: 0, result: 'CLEAR', error: 'No name provided' };
  }

  const threshold  = opts.threshold  ?? 60;
  const maxResults = opts.maxResults ?? 10;

  const t0 = Date.now();
  const searchUpper  = name.toUpperCase().trim();
  const searchTokens = tokenize(searchUpper);

  // ── Step 1: Candidate retrieval via token index ──────────────────────────
  const candidateIds = new Set();

  if (searchTokens.length > 0) {
    for (const token of searchTokens) {
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

  // Broaden if very few candidates
  if (candidateIds.size < 20 && searchTokens.length > 0) {
    const firstTok = searchTokens[0];
    for (const [indexToken, ids] of _tokenIndex) {
      if (indexToken.includes(firstTok) || firstTok.includes(indexToken)) {
        for (const id of ids) candidateIds.add(id);
      }
    }
  }

  // ── Step 2: Score candidates ──────────────────────────────────────────────
  const scored = [];

  for (const id of candidateIds) {
    const entry = _entries.get(id);
    if (!entry) continue;

    let bestScore   = scoreName(searchUpper, entry.name);
    let matchedName = entry.name;
    let matchedVia  = 'PRIMARY';

    for (const alias of entry.aliases) {
      const aliasScore = scoreName(searchUpper, alias);
      if (aliasScore > bestScore) {
        bestScore   = aliasScore;
        matchedName = alias;
        matchedVia  = 'ALIAS';
      }
    }

    if (bestScore >= threshold) {
      scored.push({ ...entry, score: bestScore, matchedName, matchedVia });
    }
  }

  // ── Step 3: Sort by score descending ─────────────────────────────────────
  scored.sort((a, b) => b.score - a.score);

  const matches    = scored.slice(0, maxResults);
  const topScore   = matches.length > 0 ? matches[0].score : 0;
  const durationMs = Date.now() - t0;

  // ── Step 4: Determine result ──────────────────────────────────────────────
  let result;
  if      (topScore >= 90) result = 'PEP_MATCH';
  else if (topScore >= 65) result = 'PEP_POTENTIAL';
  else                     result = 'CLEAR';

  return {
    matches: matches.map(m => ({
      id:          m.id,
      name:        m.name,
      matchedName: m.matchedName,
      matchedVia:  m.matchedVia,
      score:       m.score,
      matchType:   m.score === 100 ? 'EXACT' : 'FUZZY',
      dob:         m.dob,
      countries:   m.countries,
      nationality: m.nationality,
      position:    m.position,
      party:       m.party,
      gender:      m.gender,
      dataset:     m.dataset,
      source:      m.source,
      aliases:     m.aliases,
    })),
    topScore,
    result,
    candidatesEvaluated: candidateIds.size,
    totalEntries: _entryCount,
    screenedAt:  new Date().toISOString(),
    durationMs,
  };
}

// ── Real-time cache sync ──────────────────────────────────────────────────────

/**
 * Add or replace one PEP entry in the RAM cache.
 * Call after INSERT or UPDATE in pep_entries.
 */
function upsertEntry(row) {
  if (!row || !row.id) return;

  // Remove old token index entries for this id
  const existing = _entries.get(row.id);
  if (existing) {
    for (const token of tokenize(existing.name)) {
      const ids = _tokenIndex.get(token);
      if (ids) { ids.delete(row.id); if (ids.size === 0) _tokenIndex.delete(token); }
    }
    for (const alias of existing.aliases) {
      for (const token of tokenize(alias)) {
        const ids = _tokenIndex.get(token);
        if (ids) { ids.delete(row.id); if (ids.size === 0) _tokenIndex.delete(token); }
      }
    }
    _entries.delete(row.id);
    _entryCount--;
  }

  if ((row.status || '').toUpperCase() !== 'ACTIVE') return;

  const aliases = parseAliases(row.aliases);
  const entry = {
    id:          row.id,
    name:        row.primary_name,
    aliases,
    dob:         row.birth_date,
    countries:   row.countries,
    nationality: row.nationality,
    position:    row.position,
    party:       row.political_party,
    gender:      row.gender,
    dataset:     row.dataset,
    source:      row.source,
  };

  _entries.set(row.id, entry);
  _entryCount++;

  for (const token of tokenize(row.primary_name)) {
    if (!_tokenIndex.has(token)) _tokenIndex.set(token, new Set());
    _tokenIndex.get(token).add(row.id);
  }
  for (const alias of aliases) {
    for (const token of tokenize(alias)) {
      if (!_tokenIndex.has(token)) _tokenIndex.set(token, new Set());
      _tokenIndex.get(token).add(row.id);
    }
  }

  console.log(`[PepEngine] upsert id=${row.id} name="${row.primary_name}" | total=${_entryCount}`);
}

/**
 * Remove one PEP entry from the RAM cache.
 * Call after DELETE in pep_entries.
 */
function removeEntry(id) {
  const entry = _entries.get(id);
  if (!entry) return;

  for (const token of tokenize(entry.name)) {
    const ids = _tokenIndex.get(token);
    if (ids) { ids.delete(id); if (ids.size === 0) _tokenIndex.delete(token); }
  }
  for (const alias of entry.aliases) {
    for (const token of tokenize(alias)) {
      const ids = _tokenIndex.get(token);
      if (ids) { ids.delete(id); if (ids.size === 0) _tokenIndex.delete(token); }
    }
  }

  _entries.delete(id);
  _entryCount--;
  console.log(`[PepEngine] removed id=${id} name="${entry.name}" | total=${_entryCount}`);
}

// ── Status ────────────────────────────────────────────────────────────────────
function getStatus() {
  return {
    loaded:     _entryCount > 0,
    entryCount: _entryCount,
    loadedAt:   _loadedAt,
    tokenCount: _tokenIndex.size,
    memoryMB:   Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    isLoading:  _isLoading,
  };
}

// ── Reload ────────────────────────────────────────────────────────────────────
async function reload() {
  _entries    = new Map();
  _tokenIndex = new Map();
  _entryCount = 0;
  _loadedAt   = null;
  _isLoading  = false;
  return loadEntries();
}

// ── Auto-reload every 6 hours ─────────────────────────────────────────────────
setInterval(() => {
  console.log('[PepEngine] Scheduled auto-reload triggered');
  reload().catch(err => console.error('[PepEngine] Auto-reload failed:', err.message));
}, 6 * 60 * 60 * 1000);

module.exports = { loadEntries, reload, screen, getStatus, upsertEntry, removeEntry };
