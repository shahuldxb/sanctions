'use strict';

const express = require('express');
const router  = express.Router();
const { query } = require('../db/connection');
const { screenPEP, getPEPStatus, reloadPEPs } = require('../services/pepEngine');
const { runFullPEPLoad, getPEPRunStatus } = require('../services/pepScraper');
const { runBCPLoad, getBCPStatus, requestStop, requestPause, requestResume } = require('../services/pepBCPLoader');

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
    const total = await query("SELECT COUNT(*) as cnt FROM pep_entries WHERE status = 'ACTIVE'");
    const memTotal = await query('SELECT COUNT(*) as cnt FROM pep_entries_mem').catch(() => ({ recordset: [{ cnt: 0 }] }));
    const ramStatus = getPEPStatus();
    res.json({
      totalInDB:       total.recordset[0].cnt,
      totalInMemTable: memTotal.recordset[0].cnt,
      totalInRAM:      ramStatus.entryCount,
      loadedAt:        ramStatus.loadedAt,
      isLoading:       ramStatus.isLoading || false,
      loadProgress:    ramStatus.loadProgress || { loaded: 0, total: 0, pct: 0 },
      bySource:        bySource.recordset,
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

// ── GET /api/pep/bcp-status ───────────────────────────────────────────────────
router.get('/bcp-status', (req, res) => {
  res.json(getBCPStatus());
});

module.exports = router;
