'use strict';

const express = require('express');
const router  = express.Router();
const { query } = require('../db/connection');
const { screenPEP, getPEPStatus, reloadPEPs, loadSourceIntoRAM, getRAMCountBySource } = require('../services/pepEngine');
const { runFullPEPLoad, getPEPRunStatus } = require('../services/pepScraper');
const { runBCPLoad, getBCPStatus, resetBCPStatus, requestStop, requestPause, requestResume } = require('../services/pepBCPLoader');
const { loadWikidata, getWikidataStatus } = require('../services/wikidataLoader');
const { loadICIJ, getICIJStatus }         = require('../services/icijLoader');

// ── GET /api/pep/status ───────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json(getPEPStatus());
});

// ── GET /api/pep/sources ──────────────────────────────────────────────────────
router.get('/sources', async (req, res) => {
  try {
    const result = await query('SELECT * FROM pep_sources ORDER BY id');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pep/screen ──────────────────────────────────────────────────────
// Body: { name, threshold?, maxResults? }
router.post('/screen', (req, res) => {
  const { name, threshold, maxResults } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = screenPEP(name, { threshold, maxResults });
  res.json(result);
});

// ── GET /api/pep/search?q=... ─────────────────────────────────────────────────
router.get('/search', (req, res) => {
  const { q, threshold, maxResults } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });
  const result = screenPEP(q, {
    threshold:  threshold  ? parseInt(threshold)  : 60,
    maxResults: maxResults ? parseInt(maxResults) : 20,
  });
  res.json(result);
});

// ── GET /api/pep/entry/:id ────────────────────────────────────────────────────
router.get('/entry/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM pep_entries WHERE id = @id',
      { id: parseInt(req.params.id) }
    );
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/pep/list?page=1&limit=50&source=&search= ────────────────────────
router.get('/list', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || '1'));
    const limit  = Math.min(200, parseInt(req.query.limit || '50'));
    const offset = (page - 1) * limit;
    const source = req.query.source || null;
    const search = req.query.search || null;

    let where = "WHERE status = 'ACTIVE'";
    const params = { limit, offset };

    if (source) { where += ' AND source = @source'; params.source = source; }
    if (search) {
      where += ' AND (primary_name LIKE @search OR aliases LIKE @search)';
      params.search = `%${search}%`;
    }

    const countResult = await query(
      `SELECT COUNT(*) as cnt FROM pep_entries ${where}`, params
    );
    const total = countResult.recordset[0].cnt;

    const dataResult = await query(
      `SELECT id, external_id, source, schema_type, primary_name, aliases,
              birth_date, countries, nationality, position, political_party,
              gender, dataset, remarks, adverse_links, wikidata_id, icij_node_id,
              first_seen, last_seen, status
       FROM pep_entries ${where}
       ORDER BY id
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      data:  dataResult.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pep/load ────────────────────────────────────────────────────────
// Trigger full PEP data load from all sources
router.post('/load', async (req, res) => {
  const status = getPEPRunStatus();
  if (status.status === 'running') {
    return res.status(409).json({ error: 'PEP load already running', status });
  }
  // Start async — don't await
  runFullPEPLoad().catch(err => console.error('[PEP Load Error]', err.message));
  res.json({ message: 'PEP load started', status: 'running' });
});

// ── GET /api/pep/load-status ──────────────────────────────────────────────────
router.get('/load-status', (req, res) => {
  res.json(getPEPRunStatus());
});

// ── POST /api/pep/reload ──────────────────────────────────────────────────────
// Reload PEP engine from DB into RAM without re-scraping
router.post('/reload', async (req, res) => {
  try {
    const result = await reloadPEPs();
    res.json({ message: 'PEP engine reloaded', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/pep/stats ────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const bySource = await query(`
      SELECT source, COUNT(*) as cnt, 
             SUM(CASE WHEN wikidata_id IS NOT NULL THEN 1 ELSE 0 END) as with_wikidata,
             SUM(CASE WHEN adverse_links IS NOT NULL THEN 1 ELSE 0 END) as with_adverse_links,
             SUM(CASE WHEN birth_date IS NOT NULL THEN 1 ELSE 0 END) as with_dob,
             SUM(CASE WHEN position IS NOT NULL THEN 1 ELSE 0 END) as with_position
      FROM pep_entries WHERE status = 'ACTIVE'
      GROUP BY source ORDER BY cnt DESC
    `);
    const bySourceMem = await query(`
      SELECT source, COUNT(*) as cnt
      FROM pep_entries_mem
      GROUP BY source
    `).catch(() => ({ recordset: [] }));
    const total = await query("SELECT COUNT(*) as cnt FROM pep_entries WHERE status = 'ACTIVE'");
    const memTotal = await query('SELECT COUNT(*) as cnt FROM pep_entries_mem').catch(() => ({ recordset: [{ cnt: 0 }] }));
    const ramStatus = getPEPStatus();
    const ramBySource = getRAMCountBySource();
    // Build per-source mem counts map
    const memBySource = {};
    for (const row of (bySourceMem.recordset || [])) {
      memBySource[row.source] = row.cnt;
    }
    // Merge mem and RAM counts into bySource rows
    const bySourceEnriched = bySource.recordset.map(row => ({
      ...row,
      in_mem_table: memBySource[row.source] || 0,
      in_ram:       ramBySource[row.source] || 0,
    }));
    res.json({
      totalInDB:       total.recordset[0].cnt,
      totalInMemTable: memTotal.recordset[0].cnt,
      totalInRAM:      ramStatus.entryCount,
      loadedAt:        ramStatus.loadedAt,
      isLoading:       ramStatus.isLoading || false,
      loadProgress:    ramStatus.loadProgress || { loaded: 0, total: 0, pct: 0 },
      bySource:        bySourceEnriched,
      ramBySource,
      memBySource,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pep/bcp-load ───────────────────────────────────────────────────
router.post('/bcp-load', async (req, res) => {
  const status = getBCPStatus();
  if (status.status === 'running' || status.status === 'paused') {
    return res.status(409).json({ error: 'BCP load already running or paused', status });
  }
  runBCPLoad().catch(err => console.error('[BCP Load Error]', err.message));
  res.json({ message: 'BCP pipeline started', status: 'running' });
});

// ── POST /api/pep/bcp-stop ────────────────────────────────────────────────────
router.post('/bcp-stop', (req, res) => {
  const status = getBCPStatus();
  if (status.status !== 'running' && status.status !== 'paused') {
    return res.status(400).json({ error: 'No active BCP load to stop' });
  }
  requestStop();
  res.json({ message: 'Stop requested — pipeline will halt after current stage' });
});

// ── POST /api/pep/bcp-pause ───────────────────────────────────────────────────
router.post('/bcp-pause', (req, res) => {
  const status = getBCPStatus();
  if (status.status !== 'running') {
    return res.status(400).json({ error: 'Pipeline is not running' });
  }
  requestPause();
  res.json({ message: 'Pause requested — pipeline will pause after current stage' });
});

// ── POST /api/pep/bcp-resume ──────────────────────────────────────────────────
router.post('/bcp-resume', (req, res) => {
  const status = getBCPStatus();
  if (status.status !== 'paused') {
    return res.status(400).json({ error: 'Pipeline is not paused' });
  }
  requestResume();
  res.json({ message: 'Pipeline resumed' });
});

// ── POST /api/pep/bcp-reset ─────────────────────────────────────────────────────────────────────
router.post('/bcp-reset', (req, res) => {
  resetBCPStatus();
  res.json({ message: 'BCP status reset to idle', status: getBCPStatus() });
});
// ── GET /api/pep/bcp-status ─────────────────────────────────────────────────────────────────────
router.get('/bcp-status', (req, res) => {
  res.json(getBCPStatus());
});

// ── POST /api/pep/wikidata-load ──────────────────────────────────────────────
router.post('/wikidata-load', (req, res) => {
  const st = getWikidataStatus();
  if (st.status === 'running') {
    return res.status(409).json({ error: 'Wikidata loader is already running', status: st });
  }
  // Fire and forget — client polls /wikidata-status
  loadWikidata().catch(e => console.error('[WikidataLoader] Fatal:', e.message));
  res.json({ message: 'Wikidata load started', status: 'running' });
});

// ── GET /api/pep/wikidata-status ──────────────────────────────────────────────
router.get('/wikidata-status', (req, res) => {
  res.json(getWikidataStatus());
});

// ── POST /api/pep/icij-load ───────────────────────────────────────────────────
router.post('/icij-load', (req, res) => {
  const st = getICIJStatus();
  if (st.status === 'running') {
    return res.status(409).json({ error: 'ICIJ loader is already running', status: st });
  }
  // Fire and forget — client polls /icij-status
  loadICIJ().catch(e => console.error('[ICIJLoader] Fatal:', e.message));
  res.json({ message: 'ICIJ load started', status: 'running' });
});

// ── GET /api/pep/icij-status ──────────────────────────────────────────────────
router.get('/icij-status', (req, res) => {
  res.json(getICIJStatus());
});

// ── POST /api/pep/reload-source ── reload RAM for a specific source only ──────
router.post('/reload-source', async (req, res) => {
  const { source } = req.body;
  const validSources = ['OPENSANCTIONS_PEP', 'WIKIDATA', 'ICIJ', 'ALL'];
  if (!source || !validSources.includes(source)) {
    return res.status(400).json({ error: `source must be one of: ${validSources.join(', ')}` });
  }
  try {
    if (source === 'ALL') {
      reloadPEPs().catch(e => console.error('[PEPEngine] Reload error:', e.message));
      return res.json({ message: 'Full RAM reload started', source });
    }
    loadSourceIntoRAM(source).catch(e => console.error(`[PEPEngine] Source reload error (${source}):`, e.message));
    res.json({ message: `RAM reload started for source: ${source}`, source });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/pep/source-stats/:source ── per-source detailed stats ────────────
router.get('/source-stats/:source', async (req, res) => {
  const { source } = req.params;
  try {
    const { getPool } = require('../db/connection');
    const pool = await getPool();
    const safe = source.replace(/[^A-Z0-9_]/gi, '');
    const result = await pool.request().query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN wikidata_id IS NOT NULL THEN 1 ELSE 0 END) as with_wikidata_id,
        SUM(CASE WHEN adverse_links IS NOT NULL THEN 1 ELSE 0 END) as with_adverse_links,
        SUM(CASE WHEN birth_date IS NOT NULL THEN 1 ELSE 0 END) as with_dob,
        SUM(CASE WHEN position IS NOT NULL THEN 1 ELSE 0 END) as with_position,
        SUM(CASE WHEN countries IS NOT NULL THEN 1 ELSE 0 END) as with_countries,
        SUM(CASE WHEN dataset IS NOT NULL THEN 1 ELSE 0 END) as with_dataset,
        COUNT(DISTINCT dataset) as dataset_count,
        MIN(first_seen) as first_seen,
        MAX(last_seen) as last_seen
      FROM pep_entries
      WHERE status = 'ACTIVE' AND source = '${safe}'
    `);
    const ramStatus = getPEPStatus();
    res.json({ source, ...result.recordset[0], ramTotal: ramStatus.entryCount || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/pep/mem-status ── get pepMemLoader status ──────────────────────────────
router.get('/mem-status', (req, res) => {
  try {
    const { getPEPMemStatus } = require('../services/pepMemLoader');
    res.json(getPEPMemStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pep/clear-ram ── clear Node.js in-memory index ──────────────────────
router.post('/clear-ram', (req, res) => {
  try {
    const { clearRAM } = require('../services/pepEngine');
    const result = clearRAM();
    res.json({ success: true, message: `RAM index cleared. ${result.cleared.toLocaleString()} entries removed.`, cleared: result.cleared });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pep/clear-mem-table ── truncate pep_entries_mem SQL table ──────────────
router.post('/clear-mem-table', async (req, res) => {
  try {
    const { getPool } = require('../db/connection');
    const pool = await getPool();
    // Count before truncate
    const countRes = await pool.request().query('SELECT COUNT(*) as cnt FROM pep_entries_mem');
    const before = countRes.recordset[0].cnt;
    await pool.request().query('TRUNCATE TABLE pep_entries_mem');
    res.json({ success: true, message: `In-memory table cleared. ${before.toLocaleString()} rows removed.`, cleared: before });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── POST /api/pep/load-ram ── rebuild full Node.js RAM index from DB ─────────────────
router.post('/load-ram', (req, res) => {
  try {
    const { reloadPEPs, getPEPStatus } = require('../services/pepEngine');
    const st = getPEPStatus();
    if (st.isLoading) return res.status(409).json({ error: 'RAM index is already loading' });
    reloadPEPs().catch(e => console.error('[PEPEngine] RAM reload error:', e.message));
    res.json({ success: true, message: 'RAM index reload started. Poll /api/pep/stats for progress.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pep/load-mem-table ── reload pep_entries_mem from pep_entries ─────────
router.post('/load-mem-table', async (req, res) => {
  try {
    const { loadPEPIntoMemTable, getPEPMemStatus } = require('../services/pepMemLoader');
    const st = getPEPMemStatus();
    if (st.loading) return res.status(409).json({ error: 'In-memory table is already loading' });
    loadPEPIntoMemTable(null, { forceReload: true }).catch(e => console.error('[MemLoader] Error:', e.message));
    res.json({ success: true, message: 'In-memory table reload started. Poll /api/pep/stats for progress.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pep/clear-source-table ── DELETE all pep_entries rows for a source ──
router.post('/clear-source-table', async (req, res) => {
  const { source } = req.body;
  const validSources = ['OPENSANCTIONS_PEP', 'WIKIDATA', 'ICIJ'];
  if (!source || !validSources.includes(source)) {
    return res.status(400).json({ error: `source must be one of: ${validSources.join(', ')}` });
  }
  try {
    const { getPool } = require('../db/connection');
    const pool = await getPool();
    const countRes = await pool.request().query(`SELECT COUNT(*) as cnt FROM pep_entries WHERE source = '${source}'`);
    const before = countRes.recordset[0].cnt;
    await pool.request().query(`DELETE FROM pep_entries WHERE source = '${source}'`);
    res.json({ success: true, message: `Cleared ${before.toLocaleString()} rows from pep_entries for source: ${source}`, cleared: before, source });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pep/clear-source-mem-table ── DELETE pep_entries_mem rows for a source ──
router.post('/clear-source-mem-table', async (req, res) => {
  const { source } = req.body;
  const validSources = ['OPENSANCTIONS_PEP', 'WIKIDATA', 'ICIJ'];
  if (!source || !validSources.includes(source)) {
    return res.status(400).json({ error: `source must be one of: ${validSources.join(', ')}` });
  }
  try {
    const { getPool } = require('../db/connection');
    const pool = await getPool();
    const countRes = await pool.request().query(`SELECT COUNT(*) as cnt FROM pep_entries_mem WHERE source = '${source}'`);
    const before = countRes.recordset[0].cnt;
    await pool.request().query(`DELETE FROM pep_entries_mem WHERE source = '${source}'`);
    res.json({ success: true, message: `Cleared ${before.toLocaleString()} rows from pep_entries_mem for source: ${source}`, cleared: before, source });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
