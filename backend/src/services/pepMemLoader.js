/**
 * pepMemLoader.js
 * ================
 * Loads all ACTIVE rows from pep_entries (disk) into pep_entries_mem
 * (SQL Server In-Memory OLTP table) on server startup.
 *
 * Architecture:
 *   pep_entries (disk, durable)  →  pep_entries_mem (SCHEMA_ONLY, fast reads)
 *
 * Because pep_entries_mem has DURABILITY=SCHEMA_ONLY, its data is lost on
 * SQL Server restart. This loader re-populates it every time the Node.js
 * server starts, and also after each PEP scrape run.
 *
 * Startup optimisation:
 *   If pep_entries_mem already has rows (e.g. SQL Server was NOT restarted),
 *   the loader skips the DELETE+reload and returns immediately. Pass
 *   { forceReload: true } to override this behaviour (used after a scrape run).
 *
 * Usage:
 *   const { loadPEPIntoMemTable, getPEPMemStatus } = require('./pepMemLoader');
 *   await loadPEPIntoMemTable();                      // startup (skips if populated)
 *   await loadPEPIntoMemTable(null, { forceReload: true }); // after scrape
 */
'use strict';

const { getPool, sql } = require('../db/connection');

// ── State ─────────────────────────────────────────────────────────────────────
let _status = {
  loaded:      false,
  loading:     false,
  rowCount:    0,
  startedAt:   null,
  completedAt: null,
  durationMs:  0,
  error:       null,
};
let _loadPromise = null;

function getPEPMemStatus() {
  return { ..._status };
}

/**
 * Load ACTIVE rows from pep_entries → pep_entries_mem.
 * Skips if the table already has rows (unless forceReload=true).
 */
async function loadPEPIntoMemTable(onProgress, { forceReload = false } = {}) {
  // Prevent concurrent loads
  if (_status.loading) {
    console.log('[PEPMemLoader] Load already in progress, waiting...');
    return _loadPromise;
  }

  // ── Fast path: skip if already populated ──────────────────────────────────
  if (!forceReload) {
    try {
      const pool = await getPool();
      const chk = await pool.request().query('SELECT COUNT(*) as cnt FROM pep_entries_mem');
      const existing = chk.recordset[0].cnt;
      if (existing > 0) {
        console.log(`[PEPMemLoader] pep_entries_mem already has ${existing.toLocaleString()} rows — skipping reload`);
        _status = {
          loaded:      true,
          loading:     false,
          rowCount:    existing,
          startedAt:   new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs:  0,
          error:       null,
        };
        return { rowCount: existing, durationMs: 0, skipped: true };
      }
    } catch (e) {
      console.warn('[PEPMemLoader] Could not check existing row count:', e.message);
      // Fall through to full load
    }
  }

  _loadPromise = _doLoad(onProgress);
  return _loadPromise;
}

async function _doLoad(onProgress) {
  const t0 = Date.now();
  _status = { loaded: false, loading: true, rowCount: 0, startedAt: new Date().toISOString(), completedAt: null, durationMs: 0, error: null };

  const log = (msg) => {
    console.log(`[PEPMemLoader] ${msg}`);
    if (typeof onProgress === 'function') onProgress(msg);
  };

  try {
    const pool = await getPool();

    // ── Step 1: Truncate the memory table ──────────────────────────────────────
    log('Truncating pep_entries_mem...');
    await pool.request().query('DELETE FROM pep_entries_mem');
    log('✓ pep_entries_mem cleared');

    // ── Step 2: Count rows to load ─────────────────────────────────────────────
    const cntRes = await pool.request().query(
      "SELECT COUNT(*) as cnt FROM pep_entries WHERE status = 'ACTIVE'"
    );
    const totalRows = cntRes.recordset[0].cnt;
    log(`Loading ${totalRows.toLocaleString()} ACTIVE rows from pep_entries → pep_entries_mem...`);

    // ── Step 3: Batch INSERT using T-SQL INSERT INTO ... SELECT ────────────────
    // We use server-side batching (OFFSET/FETCH) to avoid sending 700K rows
    // over the wire. Each batch is a single INSERT...SELECT on the server.
    const BATCH = 10000;
    let offset = 0;
    let loaded = 0;

    while (offset < totalRows) {
      // Get a fresh pool connection for every batch to avoid 5-min socket timeout
      let batchPool;
      try {
        batchPool = await getPool();
      } catch (connErr) {
        log(`Reconnecting... (${connErr.message})`);
        await new Promise(r => setTimeout(r, 3000));
        batchPool = await getPool();
      }

      try {
        await batchPool.request().query(`
          INSERT INTO pep_entries_mem
            (id, external_id, source, schema_type, primary_name, aliases,
             birth_date, countries, nationality, position, political_party,
             gender, dataset, remarks, adverse_links, wikidata_id,
             icij_node_id, first_seen, last_seen, status)
          SELECT
            id, external_id, source, schema_type,
            ISNULL(primary_name, ''),
            aliases, birth_date, countries, nationality, position,
            political_party, gender, dataset, remarks, adverse_links,
            wikidata_id, icij_node_id, first_seen, last_seen, status
          FROM pep_entries
          WHERE status = 'ACTIVE'
          ORDER BY id
          OFFSET ${offset} ROWS FETCH NEXT ${BATCH} ROWS ONLY
        `);
      } catch (batchErr) {
        // Retry once with fresh connection on socket error
        log(`Batch ${offset} error: ${batchErr.message}, retrying...`);
        await new Promise(r => setTimeout(r, 3000));
        const retryPool = await getPool();
        await retryPool.request().query(`
          INSERT INTO pep_entries_mem
            (id, external_id, source, schema_type, primary_name, aliases,
             birth_date, countries, nationality, position, political_party,
             gender, dataset, remarks, adverse_links, wikidata_id,
             icij_node_id, first_seen, last_seen, status)
          SELECT
            id, external_id, source, schema_type,
            ISNULL(primary_name, ''),
            aliases, birth_date, countries, nationality, position,
            political_party, gender, dataset, remarks, adverse_links,
            wikidata_id, icij_node_id, first_seen, last_seen, status
          FROM pep_entries
          WHERE status = 'ACTIVE'
          ORDER BY id
          OFFSET ${offset} ROWS FETCH NEXT ${BATCH} ROWS ONLY
        `);
      }

      loaded  += BATCH;
      offset  += BATCH;
      const pct = Math.min(100, Math.round((offset / totalRows) * 100));
      if (offset % 50000 === 0 || offset >= totalRows) {
        log(`  ↳ ${Math.min(loaded, totalRows).toLocaleString()} / ${totalRows.toLocaleString()} rows loaded (${pct}%)`);
      }
    }

    // ── Step 4: Verify ─────────────────────────────────────────────────────────
    const verPool = await getPool();
    const verRes  = await verPool.request().query('SELECT COUNT(*) as cnt FROM pep_entries_mem');
    const memCount = verRes.recordset[0].cnt;
    const elapsed  = Date.now() - t0;

    log(`✓ pep_entries_mem loaded: ${memCount.toLocaleString()} rows in ${(elapsed / 1000).toFixed(1)}s`);

    _status = {
      loaded:      true,
      loading:     false,
      rowCount:    memCount,
      startedAt:   _status.startedAt,
      completedAt: new Date().toISOString(),
      durationMs:  elapsed,
      error:       null,
    };
    _loadPromise = null;
    return { rowCount: memCount, durationMs: elapsed };

  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`[PEPMemLoader] FATAL: ${err.message}`);
    _status = {
      loaded:      false,
      loading:     false,
      rowCount:    0,
      startedAt:   _status.startedAt,
      completedAt: new Date().toISOString(),
      durationMs:  elapsed,
      error:       err.message,
    };
    _loadPromise = null;
    throw err;
  }
}

module.exports = { loadPEPIntoMemTable, getPEPMemStatus };
