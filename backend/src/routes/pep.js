'use strict';

/**
 * PEP (Politically Exposed Persons) Routes
 * ==========================================
 * Exposes the in-memory PEP engine via REST endpoints.
 *
 * Endpoints:
 *   GET  /api/pep/status          - Engine status (count, memory, loadedAt)
 *   POST /api/pep/reload          - Flush and reload PEP RAM cache from DB
 *   POST /api/pep/screen          - Screen one or more names against PEP RAM index
 *   GET  /api/pep/search          - Quick name search (query param: ?name=)
 */

const express = require('express');
const router  = express.Router();

// ── Lazy-load PEP engine ──────────────────────────────────────────────────────
let _pepEngine = null;
function getPepEngine() {
  if (!_pepEngine) {
    try { _pepEngine = require('../services/pepEngine'); } catch (e) { /* not loaded yet */ }
  }
  return _pepEngine;
}

// ── GET /api/pep/status ───────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  const eng = getPepEngine();
  if (!eng) return res.json({ loaded: false, message: 'PEP engine not initialized' });
  res.json(eng.getStatus());
});

// ── POST /api/pep/reload ──────────────────────────────────────────────────────
router.post('/reload', async (req, res) => {
  const eng = getPepEngine();
  if (!eng) return res.status(503).json({ error: 'PEP engine not available' });
  try {
    // Respond immediately so the caller is not blocked for the full reload duration
    res.json({ success: true, message: 'PEP RAM reload started. Use GET /api/pep/status to monitor progress.' });
    eng.reload().then(result => {
      console.log(`[PepEngine] Reload complete: ${result.count.toLocaleString()} entries in ${result.elapsed}ms`);
    }).catch(err => {
      console.error('[PepEngine] Reload error:', err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pep/reload-sync ─────────────────────────────────────────────────
// Synchronous version — waits for completion before responding (may take minutes)
router.post('/reload-sync', async (req, res) => {
  const eng = getPepEngine();
  if (!eng) return res.status(503).json({ error: 'PEP engine not available' });
  try {
    const result = await eng.reload();
    res.json({ success: true, count: result.count, elapsed: result.elapsed, loadedAt: result.loadedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pep/screen ──────────────────────────────────────────────────────
/**
 * Body: { subjects: [{ name, dob?, nationality? }], threshold?: 60, maxResults?: 10 }
 * Response: { results: [{ name, result, topScore, matches[] }] }
 */
router.post('/screen', async (req, res) => {
  const eng = getPepEngine();
  if (!eng) return res.status(503).json({ error: 'PEP engine not available' });

  const status = eng.getStatus();
  if (!status.loaded) {
    return res.status(503).json({
      error: 'PEP engine not yet loaded',
      isLoading: status.isLoading,
      message: 'Engine is still loading PEP records into RAM. Please retry shortly.'
    });
  }

  try {
    const { subjects, threshold = 60, maxResults = 10 } = req.body;
    if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ error: 'subjects array is required' });
    }

    const results = subjects.map(subject => {
      const name = subject.name || subject.subject_name;
      if (!name) return { error: 'name is required', subject };

      const engineResult = eng.screen(name, { threshold, maxResults });
      return {
        name,
        result:              engineResult.result,
        topScore:            engineResult.topScore,
        matches:             engineResult.matches,
        candidatesEvaluated: engineResult.candidatesEvaluated,
        totalEntries:        engineResult.totalEntries,
        durationMs:          engineResult.durationMs,
        screenedAt:          engineResult.screenedAt,
      };
    });

    const overallResult = results.some(r => r.result === 'PEP_MATCH')      ? 'PEP_MATCH' :
                          results.some(r => r.result === 'PEP_POTENTIAL')   ? 'PEP_POTENTIAL' : 'CLEAR';

    res.json({ overallResult, results });
  } catch (err) {
    console.error('[PEP Screen]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/pep/search?name=<name>&threshold=60&maxResults=10 ────────────────
router.get('/search', (req, res) => {
  const eng = getPepEngine();
  if (!eng) return res.status(503).json({ error: 'PEP engine not available' });

  const { name, threshold = 60, maxResults = 10 } = req.query;
  if (!name) return res.status(400).json({ error: 'name query parameter is required' });

  const status = eng.getStatus();
  if (!status.loaded) {
    return res.status(503).json({
      error: 'PEP engine not yet loaded',
      isLoading: status.isLoading,
    });
  }

  try {
    const result = eng.screen(name, {
      threshold:  parseInt(threshold, 10),
      maxResults: parseInt(maxResults, 10),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
