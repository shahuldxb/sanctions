'use strict';
/**
 * unified.js — Unified Screening API Routes
 * Exposes the unifiedEngine (PEP + Sanctions) via REST endpoints.
 */

const express = require('express');
const router  = express.Router();
const {
  loadUnified,
  screenUnified,
  screenUnifiedDB,
  getUnifiedStatus,
  reloadCategory,
  clearRAM,
} = require('../services/unifiedEngine');

// ── GET /api/unified/status ───────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json(getUnifiedStatus());
});

// ── POST /api/unified/load ────────────────────────────────────────────────────
// Trigger a full reload of all sources into RAM
router.post('/load', async (req, res) => {
  try {
    loadUnified().catch(e => console.error('[unified/load]', e.message));
    res.json({ started: true, message: 'Unified RAM index load started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/unified/reload-category ────────────────────────────────────────
// Reload only PEP or SANCTIONS entries
router.post('/reload-category', async (req, res) => {
  const { category } = req.body;
  if (!['PEP', 'SANCTIONS'].includes(category)) {
    return res.status(400).json({ error: 'category must be PEP or SANCTIONS' });
  }
  try {
    reloadCategory(category).catch(e => console.error('[unified/reload-category]', e.message));
    res.json({ started: true, category, message: `Reloading ${category} entries into RAM` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/unified/clear ───────────────────────────────────────────────────
router.post('/clear', (req, res) => {
  try {
    clearRAM();
    res.json({ success: true, message: 'Unified RAM index cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/unified/screen ──────────────────────────────────────────────────────────────────
// Main unified screening endpoint
router.post('/screen', async (req, res) => {
  try {
    const {
      name,
      threshold    = 70,
      maxResults   = 20,
      filterSource = null,
      filterList   = null,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const t0 = Date.now();
    // Try RAM index first; fall back to DB if index not loaded
    let result = screenUnified(name.trim(), {
      threshold:    parseInt(threshold),
      maxResults:   parseInt(maxResults),
      filterSource,
      filterList,
    });
    if (!result) {
      result = await screenUnifiedDB(name.trim(), {
        threshold:  parseInt(threshold),
        maxResults: parseInt(maxResults),
      });
    }
    const durationMs = Date.now() - t0;

    res.json({ ...result, durationMs, threshold });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/unified/stats ────────────────────────────────────────────────────
// Per-source breakdown of what is in the unified index
router.get('/stats', async (req, res) => {
  try {
    const { query } = require('../db/connection');
    const [pepStats, sanctStats] = await Promise.all([
      query(`
        SELECT source AS source_code,
          COUNT(*) AS total,
          SUM(CASE WHEN position IS NOT NULL AND position <> '' THEN 1 ELSE 0 END) AS with_position,
          SUM(CASE WHEN birth_date IS NOT NULL AND birth_date <> '' THEN 1 ELSE 0 END) AS with_dob,
          SUM(CASE WHEN wikidata_id IS NOT NULL AND wikidata_id <> '' THEN 1 ELSE 0 END) AS with_wikidata_id,
          SUM(CASE WHEN adverse_links IS NOT NULL AND adverse_links <> '' THEN 1 ELSE 0 END) AS with_adverse_links,
          MAX(updated_at) AS last_updated
        FROM pep_entries
        WHERE status IN ('ACTIVE','DELISTED')
        GROUP BY source
      `),
      query(`
        SELECT s.source_code, s.source_name,
          COUNT(*) AS total,
          SUM(CASE WHEN e.nationality IS NOT NULL THEN 1 ELSE 0 END) AS with_nationality,
          SUM(CASE WHEN e.dob IS NOT NULL THEN 1 ELSE 0 END) AS with_dob,
          MAX(e.updated_at) AS last_updated
        FROM sanctions_entries e
        JOIN sanctions_list_sources s ON e.source_id = s.id
        WHERE e.status IN ('ACTIVE','DELISTED')
        GROUP BY s.source_code, s.source_name
      `),
    ]);

    const status = getUnifiedStatus();
    res.json({
      ram: status,
      pep: pepStats.recordset,
      sanctions: sanctStats.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
