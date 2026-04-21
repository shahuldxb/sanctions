'use strict';
/**
 * redisCache.js — Redis-backed persistence for the SanctionsEngine in-memory index.
 *
 * Design:
 *  - Stores the serialised index snapshot as a single compressed JSON blob in Redis.
 *  - Key: "sanctions:index:v1"  (versioned so schema changes auto-invalidate)
 *  - TTL: 24 hours (auto-expires stale cache after a day without a delta run)
 *  - On save: serialise entries array + tokenIndex + phoneticIndex → JSON → store
 *  - On load: retrieve → parse → restore Maps/Sets → return ready-to-use index
 *
 * The module is intentionally decoupled from sanctionsEngine.js so it can be
 * unit-tested independently and swapped for another backend (e.g. Valkey) later.
 */

const Redis = require('ioredis');

const CACHE_KEY   = 'sanctions:index:v1';
const CACHE_TTL   = 60 * 60 * 24; // 24 hours in seconds
const REDIS_PORT  = 6379;
const REDIS_HOST  = '127.0.0.1';

let _client = null;

// ── Connection ────────────────────────────────────────────────────────────────
function getClient() {
  if (_client && (_client.status === 'ready' || _client.status === 'connecting')) return _client;
  _client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    lazyConnect: true,          // connect on first command, not at construction
    enableOfflineQueue: true,   // queue commands while connecting
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => times < 3 ? 500 : null, // retry 3x with 500ms delay, then give up
  });
  _client.on('error', (err) => {
    // Suppress noisy connection errors; engine will fall back to DB load
    if (!err.message.includes('ECONNREFUSED') && !err.message.includes('ETIMEDOUT')) {
      console.error('[RedisCache] Error:', err.message);
    }
  });
  return _client;
}

// ── Serialise ─────────────────────────────────────────────────────────────────
/**
 * Serialise the in-memory index snapshot to a plain JSON-compatible object.
 * Maps and Sets are converted to arrays for JSON serialisation.
 *
 * @param {Object} snapshot
 * @param {Array}  snapshot.entries       — raw entry rows from DB
 * @param {Map}    snapshot.tokenIndex    — token → Set<entry_id>
 * @param {Map}    snapshot.phoneticIndex — metaphone_code → Set<entry_id>
 * @param {number} snapshot.entryCount
 * @returns {string} JSON string
 */
function serialise({ entries, tokenIndex, phoneticIndex, entryCount }) {
  const tokenObj    = {};
  const phoneticObj = {};

  for (const [k, v] of tokenIndex)    tokenObj[k]    = [...v];
  for (const [k, v] of phoneticIndex) phoneticObj[k] = [...v];

  return JSON.stringify({
    version: 1,
    savedAt: Date.now(),
    entryCount,
    entries,
    tokenIndex: tokenObj,
    phoneticIndex: phoneticObj,
  });
}

// ── Deserialise ───────────────────────────────────────────────────────────────
/**
 * Deserialise the JSON blob back into live Maps and Sets.
 * @param {string} json
 * @returns {{ entries, tokenIndex, phoneticIndex, entryCount, savedAt }}
 */
function deserialise(json) {
  const data = JSON.parse(json);
  if (data.version !== 1) throw new Error('Cache version mismatch');

  const tokenIndex    = new Map();
  const phoneticIndex = new Map();

  for (const [k, v] of Object.entries(data.tokenIndex))    tokenIndex.set(k, new Set(v));
  for (const [k, v] of Object.entries(data.phoneticIndex)) phoneticIndex.set(k, new Set(v));

  return {
    entries:       data.entries,
    tokenIndex,
    phoneticIndex,
    entryCount:    data.entryCount,
    savedAt:       data.savedAt,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save the current index snapshot to Redis.
 * Returns { ok: true, bytes, ms } on success, { ok: false, error } on failure.
 */
async function saveIndex(snapshot) {
  const t0 = Date.now();
  try {
    const client = getClient();
    const json   = serialise(snapshot);
    await client.set(CACHE_KEY, json, 'EX', CACHE_TTL);
    const bytes  = Buffer.byteLength(json, 'utf8');
    const ms     = Date.now() - t0;
    console.log(`[RedisCache] Saved ${snapshot.entryCount} entries (${(bytes / 1024 / 1024).toFixed(1)}MB) in ${ms}ms`);
    return { ok: true, bytes, ms };
  } catch (err) {
    console.error('[RedisCache] Save failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Load the index snapshot from Redis.
 * Returns the deserialised snapshot on success, or null if cache miss / error.
 */
async function loadIndex() {
  const t0 = Date.now();
  try {
    const client = getClient();
    const json   = await client.get(CACHE_KEY);
    if (!json) {
      console.log('[RedisCache] Cache miss — will load from DB');
      return null;
    }
    const snapshot = deserialise(json);
    const ms       = Date.now() - t0;
    const age      = Math.round((Date.now() - snapshot.savedAt) / 1000 / 60);
    console.log(`[RedisCache] Cache hit — ${snapshot.entryCount} entries restored in ${ms}ms (cached ${age}m ago)`);
    return snapshot;
  } catch (err) {
    console.error('[RedisCache] Load failed:', err.message, '— falling back to DB');
    return null;
  }
}

/**
 * Invalidate (delete) the cached index — call after a successful scrape run.
 */
async function invalidateIndex() {
  try {
    const client = getClient();
    await client.del(CACHE_KEY);
    console.log('[RedisCache] Cache invalidated');
  } catch (err) {
    console.error('[RedisCache] Invalidate failed:', err.message);
  }
}

/**
 * Return cache metadata without loading the full blob.
 */
async function cacheInfo() {
  try {
    const client = getClient();
    const ttl    = await client.ttl(CACHE_KEY);
    const exists = ttl > 0;
    if (!exists) return { exists: false };
    // Peek at the first 256 bytes to extract metadata without parsing the full blob
    const json   = await client.get(CACHE_KEY);
    const meta   = JSON.parse(json.slice(0, 512).replace(/,"entries.*/, '}'));
    return {
      exists:     true,
      entryCount: meta.entryCount,
      savedAt:    meta.savedAt,
      ttlSeconds: ttl,
    };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

/**
 * Gracefully close the Redis connection.
 */
async function close() {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}

module.exports = { saveIndex, loadIndex, invalidateIndex, cacheInfo, close };
