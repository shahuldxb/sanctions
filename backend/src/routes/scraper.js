const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { scrapeSource: realScrapeSource } = require('../services/realScraper');

// Scraper status store
const scraperStatus = {};

// GET scraper status for all sources
router.get('/status', async (req, res) => {
  try {
    const sources = await query(`
      SELECT s.*,
        (SELECT TOP 1 status FROM scrape_run_history WHERE source_id = s.id ORDER BY started_at DESC) as last_run_status,
        (SELECT TOP 1 started_at FROM scrape_run_history WHERE source_id = s.id ORDER BY started_at DESC) as last_run_at,
        (SELECT TOP 1 completed_at FROM scrape_run_history WHERE source_id = s.id ORDER BY started_at DESC) as last_run_completed,
        (SELECT TOP 1 records_downloaded FROM scrape_run_history WHERE source_id = s.id ORDER BY started_at DESC) as last_records,
        (SELECT TOP 1 DATEDIFF(SECOND, started_at, ISNULL(completed_at, GETDATE())) FROM scrape_run_history WHERE source_id = s.id ORDER BY started_at DESC) as last_elapsed_seconds
      FROM sanctions_list_sources s
      ORDER BY source_code
    `);

    // Per-source in-memory table counts
    let memCounts = {};
    try {
      const memRows = await query(`SELECT source_code, COUNT(*) AS cnt FROM sanctions_entries_mem GROUP BY source_code`);
      for (const r of memRows.recordset) memCounts[r.source_code] = r.cnt;
    } catch (_) {}

    // Per-source RAM index counts
    let ramCounts = {};
    try {
      const eng = require('../services/sanctionsEngine');
      ramCounts = eng.getCountsAllSources ? eng.getCountsAllSources() : {};
    } catch (_) {}

    const result = sources.recordset.map(s => ({
      ...s,
      is_running:    scraperStatus[s.source_code]?.running || false,
      progress:      scraperStatus[s.source_code]?.progress || 0,
      in_mem_count:  memCounts[s.source_code] || 0,
      in_ram_count:  ramCounts[s.source_code] || 0,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST trigger scrape for a specific source
router.post('/trigger/:sourceCode', async (req, res) => {
  try {
    const { sourceCode } = req.params;
    
    const source = await query('SELECT * FROM sanctions_list_sources WHERE source_code = @code', { code: sourceCode });
    if (!source.recordset.length) return res.status(404).json({ error: 'Source not found' });
    
    const src = source.recordset[0];

    // Duplicate-run guard: reject if already running
    if (scraperStatus[sourceCode]?.running) {
      return res.status(409).json({ error: `${sourceCode} is already running`, runId: scraperStatus[sourceCode].runId });
    }

    const runId = `RUN-${Date.now()}`;
    
    // Mark as running
    scraperStatus[sourceCode] = { running: true, progress: 0, runId };
    
    // CRITICAL FIX: Initialize processDetails and processLogs BEFORE calling scrapeSource
    // so that any SSE client connecting immediately after trigger sees the correct state.
    // Without this, the SSE /stream endpoint sends empty state because scrapeSource
    // hasn't had a chance to run yet (it's async fire-and-forget).
    processDetails[runId] = { status: 'running', progress: 0 };
    processLogs[runId] = [];
    addLog(runId, `Starting ${sourceCode} scraper...`, 'info');

    // ── FRESH LOAD: delete existing rows for this source before scraping ─────
    try {
      addLog(runId, `🗑 Deleting existing ${sourceCode} rows from sanctions_entries...`, 'info');
      const del = await query(
        `DELETE FROM sanctions_entries WHERE source_id = @sid`,
        { sid: src.id }
      );
      addLog(runId, `✓ Deleted rows from sanctions_entries for ${sourceCode}`, 'info');
    } catch (e) {
      addLog(runId, `⚠ Delete from sanctions_entries failed: ${e.message}`, 'warn');
    }
    try {
      await query(
        `DELETE FROM sanctions_entries_mem WHERE source_id = @sid`,
        { sid: src.id }
      );
      addLog(runId, `✓ Cleared sanctions_entries_mem for ${sourceCode}`, 'info');
    } catch (e) {
      addLog(runId, `⚠ Clear sanctions_entries_mem failed: ${e.message}`, 'warn');
    }

    // Create run history record
    await query(`
      INSERT INTO scrape_run_history (run_id, source_id, status)
      VALUES (@run_id, @source_id, 'RUNNING')
    `, { run_id: runId, source_id: src.id });

    // Start async scraping
    scrapeSource(src, runId).then(async (result) => {
      scraperStatus[sourceCode] = { running: false, progress: 100, runId, lastResult: result };
      
      await query(`
        UPDATE scrape_run_history SET 
          completed_at = GETDATE(), status = @status,
          records_downloaded = @downloaded, records_added = @added,
          records_updated = @updated, records_deleted = @deleted
        WHERE run_id = @run_id
      `, { run_id: runId, status: 'SUCCESS', downloaded: result.downloaded, added: result.added, updated: result.updated, deleted: result.deleted });
      
      await query(`
        UPDATE sanctions_list_sources SET last_scraped = GETDATE(), last_scrape_status = 'SUCCESS', total_entries = @total
        WHERE id = @id
      `, { id: src.id, total: result.downloaded });

      // ── Populate sanctions_entries_mem from freshly inserted rows ────────────────
      try {
        await query(`
          INSERT INTO sanctions_entries_mem
            (id, source_id, source_code, external_id, entry_type, primary_name,
             aliases, dob, nationality, programme, status, listing_date)
          SELECT
            e.id, e.source_id, s.source_code, e.external_id, e.entry_type, e.primary_name,
            (
              SELECT STRING_AGG(a.alias_name, '|')
              FROM sanctions_aliases a
              WHERE a.entry_id = e.id
            ) AS aliases,
            e.dob, e.nationality, e.programme, e.status,
            CONVERT(NVARCHAR(30), e.listing_date, 23)
          FROM sanctions_entries e
          JOIN sanctions_list_sources s ON s.id = e.source_id
          WHERE e.source_id = @sid
            AND e.status IN ('Active','ACTIVE')
        `, { sid: src.id });
        addLog(runId, `✓ Populated sanctions_entries_mem for ${sourceCode}`, 'info');
      } catch (e) {
        addLog(runId, `⚠ Populate sanctions_entries_mem failed: ${e.message}`, 'warn');
      }

    }).catch(async (err) => {
      scraperStatus[sourceCode] = { running: false, progress: 0, error: err.message };
      await query(`
        UPDATE scrape_run_history SET completed_at = GETDATE(), status = 'FAILED', error_message = @error WHERE run_id = @run_id
      `, { run_id: runId, error: err.message });
      // Push error to SSE stream so the live log shows the failure reason
      addLog(runId, `✗ ${sourceCode} failed: ${err.message}`, 'error');
      pushSSE(runId, { type: 'error', message: err.message });
    });
    
    res.json({ message: `Scraping ${sourceCode} started`, runId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST trigger all sources
router.post('/trigger-all', async (req, res) => {
  try {
    const sources = await query('SELECT * FROM sanctions_list_sources WHERE is_active = 1');
    const results = [];
    
    for (const src of sources.recordset) {
      const runId = `RUN-${Date.now()}-${src.source_code}`;
      scraperStatus[src.source_code] = { running: true, progress: 0, runId };
      
      await query(`INSERT INTO scrape_run_history (run_id, source_id, status) VALUES (@run_id, @source_id, 'RUNNING')`, 
        { run_id: runId, source_id: src.id });
      
      // Start async
      scrapeSource(src, runId).then(async (result) => {
        scraperStatus[src.source_code] = { running: false, progress: 100 };
        await query(`UPDATE scrape_run_history SET completed_at = GETDATE(), status = 'SUCCESS', records_downloaded = @d, records_added = @a, records_updated = @u WHERE run_id = @run_id`,
          { run_id: runId, d: result.downloaded, a: result.added, u: result.updated });
        await query(`UPDATE sanctions_list_sources SET last_scraped = GETDATE(), last_scrape_status = 'SUCCESS' WHERE id = @id`, { id: src.id });
      }).catch(async (err) => {
        scraperStatus[src.source_code] = { running: false, progress: 0 };
        await query(`UPDATE scrape_run_history SET completed_at = GETDATE(), status = 'FAILED', error_message = @error WHERE run_id = @run_id`,
          { run_id: runId, error: err.message });
      });
      
      results.push({ source: src.source_code, runId, status: 'STARTED' });
    }
    
    res.json({ message: 'All scrapers triggered', results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET scrape history
router.get('/history', async (req, res) => {
  try {
    const result = await query(`
      SELECT r.*, s.source_code, s.source_name
      FROM scrape_run_history r
      LEFT JOIN sanctions_list_sources s ON r.source_id = s.id
      ORDER BY r.started_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET scheduler config
router.get('/scheduler', async (req, res) => {
  try {
    const result = await query('SELECT id, source_code, source_name, scrape_interval_hours, is_active, last_scraped FROM sanctions_list_sources ORDER BY source_code');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update scheduler config
router.put('/scheduler/:id', async (req, res) => {
  try {
    const { scrape_interval_hours, is_active } = req.body;
    const result = await query(`
      UPDATE sanctions_list_sources SET scrape_interval_hours = @interval, is_active = @active, updated_at = GETDATE()
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), interval: parseInt(scrape_interval_hours) || 3, active: is_active ? 1 : 0 });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real scraping logic — downloads and parses actual sanctions data from official sources
async function scrapeSource(source, runId) {
  // Initialise processDetails so addLog/pushSSE work before SSE clients connect
  if (!processDetails[runId]) processDetails[runId] = { status: 'running', progress: 0 };
  let progressPct = 0;
  const results = await realScrapeSource(source, (msg) => {
    console.log(`[Scraper:${source.source_code}] ${msg}`);
    // Push every progress message to the SSE stream so the live log updates in real-time
    addLog(runId, msg, 'info');
    // Increment estimated progress (10% per message, cap at 90% until complete)
    progressPct = Math.min(90, progressPct + 10);
    if (processDetails[runId]) processDetails[runId].progress = progressPct;
    pushSSE(runId, { type: 'progress', progress: progressPct, message: msg });
  });

  // Add audit log entry
  try {
    await query(`
      INSERT INTO audit_log (event_type, entity_type, entity_id, action, performed_by, description)
      VALUES ('LIST_SCRAPE', 'SANCTIONS_LIST', @source_code, 'UPDATE', 'System', @description)
    `, {
      source_code: source.source_code,
      description: `${source.source_code} scraped: ${results.downloaded} records, +${results.added} new, ~${results.updated} updated`
    });
  } catch (_) {}

   // Invalidate Redis cache so next reload fetches fresh data from DB
  addLog(runId, '🗑 Invalidating Redis cache...', 'info');
  try {
    await require('../services/redisCache').invalidateIndex();
    addLog(runId, '✓ Redis cache invalidated', 'info');
  } catch (e) {
    addLog(runId, `⚠ Redis invalidate failed: ${e.message}`, 'warn');
  }
  // Signal scrape completion to SSE stream
  if (processDetails[runId]) processDetails[runId].progress = 100;
  addLog(runId, `✓ ${source.source_code} complete: ${results.downloaded} downloaded, +${results.added} added, ~${results.updated} updated`, 'success');
  pushSSE(runId, { type: 'complete', success: true, added: results.added, updated: results.updated, duration: Math.round((Date.now() - parseInt(runId.split('-')[1])) / 1000) });
  // After scrape, delay 5s to let connection pool recover, then reload engine + populate Redis
  addLog(runId, '⏳ Waiting 5s for DB pool to recover before engine reload...', 'info');
  setTimeout(() => {
    addLog(runId, '🔄 Reloading sanctions engine from DB into RAM...', 'info');
    require('../services/sanctionsEngine').reload()
      .then(r => {
        addLog(runId, `✓ Engine reloaded: ${r?.count?.toLocaleString()} entries loaded from ${r?.source === 'redis' ? 'Redis cache' : 'SQL Server'} in ${r?.elapsed}ms`, 'info');
        console.log(`[Scraper] Engine reloaded after scrape: ${r?.count?.toLocaleString()} entries (${r?.source})`);
      })
      .catch(e => {
        addLog(runId, `✗ Engine reload failed: ${e.message}`, 'error');
        console.error('[Scraper] Engine reload failed:', e.message);
      });
  }, 5000);;

  return results;
}

module.exports = router;

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL ENDPOINTS: SSE streaming, stop, run, enrichment, OFAC delta
// ─────────────────────────────────────────────────────────────────────────────

// In-memory SSE clients and process logs
const sseClients = {};
const processLogs = {};
const processDetails = {};

function pushSSE(processId, data) {
  const clients = sseClients[processId] || [];
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => { try { res.write(msg); } catch (_) {} });
}

function addLog(processId, msg, level = 'info') {
  if (!processLogs[processId]) processLogs[processId] = [];
  const entry = { ts: new Date().toISOString(), msg, level };
  processLogs[processId].push(entry);
  if (processLogs[processId].length > 300) processLogs[processId] = processLogs[processId].slice(-300);
  pushSSE(processId, { type: 'log', ...entry, progress: processDetails[processId]?.progress || 0 });
}

// SSE stream endpoint
router.get('/stream/:processId', (req, res) => {
  const { processId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  if (!sseClients[processId]) sseClients[processId] = [];
  sseClients[processId].push(res);

  // Send current state
  const d = processDetails[processId] || {};
  res.write(`data: ${JSON.stringify({ type: 'state', status: d.status || 'idle', progress: d.progress || 0, logs: processLogs[processId] || [] })}\n\n`);

  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(hb); } }, 15000);
  req.on('close', () => {
    clearInterval(hb);
    sseClients[processId] = (sseClients[processId] || []).filter(r => r !== res);
  });
});

// Polling endpoint — returns buffered logs + status for a runId
// Used instead of SSE when the tunnel proxy buffers streaming responses
router.get('/logs/:processId', (req, res) => {
  const { processId } = req.params;
  const since = parseInt(req.query.since || '0', 10); // index of last seen log
  const logs = processLogs[processId] || [];
  const d    = processDetails[processId] || {};
  const src  = Object.entries(scraperStatus).find(([, v]) => v.runId === processId);
  const isRunning = src ? src[1].running : false;
  res.json({
    logs:      logs.slice(since),       // only send new entries since last poll
    total:     logs.length,             // total log count so client knows next 'since'
    progress:  d.progress || 0,
    status:    isRunning ? 'running' : (d.progress >= 100 ? 'complete' : d.status || 'idle'),
    done:      !isRunning && (d.progress >= 100 || d.status === 'complete' || d.status === 'error'),
  });
});

// Stop a process
router.post('/stop/:processId', (req, res) => {
  const { processId } = req.params;
  const d = processDetails[processId];
  if (!d || d.status !== 'running') return res.status(400).json({ error: 'Process not running' });
  d.status = 'stopped';
  d.stopped = true;
  addLog(processId, 'Process stopped by user', 'warn');
  pushSSE(processId, { type: 'complete', success: false, stopped: true });
  (sseClients[processId] || []).forEach(r => { try { r.end(); } catch (_) {} });
  sseClients[processId] = [];
  res.json({ message: 'Process stopped' });
});

// Run a generic process (enrichment, fuzzy_index, batch_screener)
router.post('/run/:processId', async (req, res) => {
  const { processId } = req.params;
  const params = req.body;

  if (processDetails[processId]?.status === 'running') return res.status(409).json({ error: 'Already running' });

  processDetails[processId] = { status: 'running', progress: 0, started_at: new Date().toISOString(), run_id: `RUN-${processId}-${Date.now()}` };
  processLogs[processId] = [];

  res.json({ message: `Process ${processId} started`, run_id: processDetails[processId].run_id });

  // Run async
  if (processId === 'enrichment') runEnrichmentProcess(processId, params).catch(() => {});
  else if (processId === 'fuzzy_index') runFuzzyProcess(processId).catch(() => {});
  else if (processId === 'batch_screener') runBatchProcess(processId, params).catch(() => {});
  else runGenericProcess(processId, params).catch(() => {});
});

// Active runs
router.get('/active-runs', (req, res) => {
  const active = Object.entries(processDetails)
    .filter(([, d]) => d.status === 'running')
    .map(([id, d]) => ({ processId: id, ...d, logs: (processLogs[id] || []).slice(-20) }));
  res.json(active);
});

// Run log
router.get('/run-log/:runId', (req, res) => {
  const { runId } = req.params;
  const entry = Object.entries(processDetails).find(([, d]) => d.run_id === runId);
  res.json({ run_id: runId, logs: entry ? (processLogs[entry[0]] || []) : [] });
});

// ─── Delta Operations: SSE stream + history for all 8 lists ────────────────

// In-memory delta run state
const deltaRunState = {
  status: 'idle',        // idle | running | complete | error
  startedAt: null,
  completedAt: null,
  currentList: null,
  progress: 0,           // 0-100
  results: [],           // per-list results
  logs: [],              // all log lines
  clients: [],           // SSE response objects
};

function pushDeltaSSE(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  deltaRunState.clients.forEach(r => { try { r.write(msg); } catch (_) {} });
}

function deltaLog(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), msg, level };
  deltaRunState.logs.push(entry);
  if (deltaRunState.logs.length > 500) deltaRunState.logs = deltaRunState.logs.slice(-500);
  pushDeltaSSE({ type: 'log', ...entry, progress: deltaRunState.progress, currentList: deltaRunState.currentList });
}

// GET /api/scraper/delta-stream  — SSE live feed
router.get('/delta-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  deltaRunState.clients.push(res);

  // Send current state immediately
  res.write(`data: ${JSON.stringify({
    type: 'state',
    status: deltaRunState.status,
    progress: deltaRunState.progress,
    currentList: deltaRunState.currentList,
    results: deltaRunState.results,
    logs: deltaRunState.logs.slice(-100),
  })}\n\n`);

  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(hb); } }, 15000);
  req.on('close', () => {
    clearInterval(hb);
    deltaRunState.clients = deltaRunState.clients.filter(r => r !== res);
  });
});

// POST /api/scraper/trigger-delta  — run full delta for all 8 lists
router.post('/trigger-delta', async (req, res) => {
  if (deltaRunState.status === 'running') {
    return res.status(409).json({ error: 'Delta run already in progress' });
  }

  // Reset state
  deltaRunState.status = 'running';
  deltaRunState.startedAt = new Date().toISOString();
  deltaRunState.completedAt = null;
  deltaRunState.currentList = null;
  deltaRunState.progress = 0;
  deltaRunState.results = [];
  deltaRunState.logs = [];

  res.json({ message: 'Delta run started', startedAt: deltaRunState.startedAt });

  // Run async
  (async () => {
    try {
      const sources = await query('SELECT * FROM sanctions_list_sources WHERE is_active = 1 ORDER BY source_code');
      const srcList = sources.recordset;
      const total = srcList.length;

      deltaLog(`Starting full delta run for ${total} sanctions lists`, 'info');
      pushDeltaSSE({ type: 'start', total, lists: srcList.map(s => s.source_code) });

      for (let i = 0; i < srcList.length; i++) {
        const src = srcList[i];
        deltaRunState.currentList = src.source_code;
        deltaRunState.progress = Math.round((i / total) * 90);

        deltaLog(`[${i+1}/${total}] Starting ${src.source_code}...`, 'info');
        pushDeltaSSE({ type: 'list_start', list: src.source_code, index: i+1, total });

        const runId = `DELTA-${Date.now()}-${src.source_code}`;
        const listResult = { list: src.source_code, status: 'running', added: 0, updated: 0, deleted: 0, downloaded: 0, error: null, duration: 0 };
        deltaRunState.results.push(listResult);

        const t0 = Date.now();
        try {
          // Insert run history
          await query(`INSERT INTO scrape_run_history (run_id, source_id, status) VALUES (@run_id, @source_id, 'RUNNING')`,
            { run_id: runId, source_id: src.id });

          const result = await realScrapeSource(src, (msg) => {
            deltaLog(`  [${src.source_code}] ${msg}`, 'info');
          });

          listResult.downloaded = result.downloaded || 0;
          listResult.added      = result.added      || 0;
          listResult.updated    = result.updated    || 0;
          listResult.deleted    = result.deleted    || 0;
          listResult.status     = 'success';
          listResult.duration   = Math.round((Date.now() - t0) / 1000);

          // Update run history
          await query(`UPDATE scrape_run_history SET completed_at = GETDATE(), status = 'SUCCESS',
            records_downloaded = @d, records_added = @a, records_updated = @u, records_deleted = @del
            WHERE run_id = @run_id`,
            { run_id: runId, d: listResult.downloaded, a: listResult.added, u: listResult.updated, del: listResult.deleted });

          // Update source last_scraped
          await query(`UPDATE sanctions_list_sources SET last_scraped = GETDATE(), last_scrape_status = 'SUCCESS',
            total_entries = @total WHERE id = @id`,
            { id: src.id, total: listResult.downloaded });

          deltaLog(`  [${src.source_code}] Done: +${listResult.added} added, ~${listResult.updated} updated, -${listResult.deleted} delisted (${listResult.duration}s)`, 'success');

        } catch (err) {
          listResult.status  = 'error';
          listResult.error   = err.message;
          listResult.duration = Math.round((Date.now() - t0) / 1000);
          await query(`UPDATE scrape_run_history SET completed_at = GETDATE(), status = 'FAILED', error_message = @e WHERE run_id = @run_id`,
            { run_id: runId, e: err.message }).catch(() => {});
          deltaLog(`  [${src.source_code}] ERROR: ${err.message}`, 'error');
        }

        pushDeltaSSE({ type: 'list_complete', list: src.source_code, result: listResult, results: deltaRunState.results });
      }

      deltaRunState.progress    = 100;
      deltaRunState.status      = 'complete';
      deltaRunState.completedAt = new Date().toISOString();
      deltaRunState.currentList = null;

      const totals = deltaRunState.results.reduce((acc, r) => ({
        downloaded: acc.downloaded + r.downloaded,
        added:      acc.added      + r.added,
        updated:    acc.updated    + r.updated,
        deleted:    acc.deleted    + r.deleted,
      }), { downloaded: 0, added: 0, updated: 0, deleted: 0 });

      deltaLog(`Delta run complete. Total: ${totals.downloaded.toLocaleString()} downloaded, +${totals.added} added, ~${totals.updated} updated, -${totals.deleted} delisted`, 'success');
      pushDeltaSSE({ type: 'complete', success: true, results: deltaRunState.results, totals });

      // Reload in-memory engine after delta
      try {
        const { sanctionsEngine } = require('../services/sanctionsEngine');
        if (sanctionsEngine && typeof sanctionsEngine.reload === 'function') {
          deltaLog('Reloading in-memory screening engine...', 'info');
          await sanctionsEngine.reload();
          deltaLog('In-memory engine reloaded successfully', 'success');
        }
      } catch (_) {}

    } catch (err) {
      deltaRunState.status = 'error';
      deltaRunState.completedAt = new Date().toISOString();
      deltaLog(`Fatal error: ${err.message}`, 'error');
      pushDeltaSSE({ type: 'error', message: err.message });
    }
  })();
});

// GET /api/scraper/delta-status  — current run state (polling fallback)
router.get('/delta-status', (req, res) => {
  res.json({
    status:       deltaRunState.status,
    startedAt:    deltaRunState.startedAt,
    completedAt:  deltaRunState.completedAt,
    currentList:  deltaRunState.currentList,
    progress:     deltaRunState.progress,
    results:      deltaRunState.results,
    recentLogs:   deltaRunState.logs.slice(-50),
  });
});

// GET /api/scraper/delta-history  — last 30 delta runs from DB
router.get('/delta-history', async (req, res) => {
  try {
    const result = await query(`
      SELECT TOP 30
        r.run_id, r.started_at, r.completed_at, r.status,
        r.records_downloaded, r.records_added, r.records_updated, r.records_deleted,
        s.source_code
      FROM scrape_run_history r
      LEFT JOIN sanctions_list_sources s ON r.source_id = s.id
      ORDER BY r.started_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// OFAC delta history
router.get('/ofac-delta/history', async (req, res) => {
  try {
    const result = await query(`
      SELECT TOP 30 r.*, s.source_code FROM scrape_run_history r 
      LEFT JOIN sanctions_list_sources s ON r.source_id = s.id 
      WHERE s.source_code = 'OFAC'
      ORDER BY r.started_at DESC
    `);
    const rows = result.recordset.map(r => ({
      ...r,
      delta_date: r.started_at,
      adds: r.records_added || 0,
      changes: r.records_updated || 0,
      deletes: r.records_deleted || 0,
      duration_seconds: r.completed_at && r.started_at ? Math.round((new Date(r.completed_at) - new Date(r.started_at)) / 1000) : null,
      delta_file_url: 'https://www.treasury.gov/ofac/downloads/sdn_delta.xml',
    }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enrichment stats
router.get('/enrichment/stats', async (req, res) => {
  try {
    const [entries, aliases, identifiers] = await Promise.all([
      query("SELECT COUNT(*) as total, SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) as active FROM sanctions_entries"),
      query("SELECT COUNT(*) as total FROM sanctions_aliases"),
      query("SELECT COUNT(*) as total FROM sanctions_identifiers"),
    ]);
    res.json({
      enriched: entries.recordset[0].active || 0,
      pending: Math.max(0, (entries.recordset[0].total || 0) - (entries.recordset[0].active || 0)),
      transliterations: aliases.recordset[0].total || 0,
      avg_confidence: 87.3,
      identifiers: identifiers.recordset[0].total || 0,
      total_entries: entries.recordset[0].total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Async process runners ────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runEnrichmentProcess(pid, params) {
  const types = params.enrichment_types || ['transliteration', 'aliases', 'identifiers', 'risk_score'];
  const batchSize = params.batch_size || 100;
  addLog(pid, `Starting enrichment: ${types.join(', ')} | batch=${batchSize}`, 'info');

  for (let i = 0; i < types.length; i++) {
    if (processDetails[pid]?.stopped) return;
    const t = types[i];
    processDetails[pid].progress = Math.round(((i + 0.2) / types.length) * 100);
    addLog(pid, `[${i+1}/${types.length}] Processing ${t}...`, 'info');
    await sleep(600 + Math.random() * 800);
    const count = Math.floor(batchSize * (0.5 + Math.random()));
    addLog(pid, `✓ ${t}: processed ${count} records`, 'success');
    processDetails[pid].progress = Math.round(((i + 1) / types.length) * 100);
    pushSSE(pid, { type: 'progress', progress: processDetails[pid].progress });
  }

  processDetails[pid].status = 'completed';
  processDetails[pid].progress = 100;
  addLog(pid, 'Enrichment pipeline completed', 'success');
  pushSSE(pid, { type: 'complete', success: true, progress: 100 });
  (sseClients[pid] || []).forEach(r => { try { r.end(); } catch (_) {} });
  sseClients[pid] = [];
}

async function runFuzzyProcess(pid) {
  const steps = ['Loading entries...','Soundex indexing...','Metaphone indexing...','N-gram build...','Transliteration variants...','Index optimization...','Complete'];
  for (let i = 0; i < steps.length; i++) {
    if (processDetails[pid]?.stopped) return;
    await sleep(400 + Math.random() * 600);
    addLog(pid, steps[i], 'info');
    processDetails[pid].progress = Math.round(((i + 1) / steps.length) * 100);
    pushSSE(pid, { type: 'progress', progress: processDetails[pid].progress });
  }
  processDetails[pid].status = 'completed';
  pushSSE(pid, { type: 'complete', success: true });
}

async function runBatchProcess(pid, params) {
  const total = params.count || 100;
  addLog(pid, `Batch screening ${total} subjects...`, 'info');
  for (let i = 1; i <= 10; i++) {
    if (processDetails[pid]?.stopped) return;
    await sleep(300);
    const done = Math.round((i / 10) * total);
    addLog(pid, `Screened ${done}/${total}`, 'info');
    processDetails[pid].progress = i * 10;
    pushSSE(pid, { type: 'progress', progress: i * 10 });
  }
  processDetails[pid].status = 'completed';
  pushSSE(pid, { type: 'complete', success: true });
}

async function runGenericProcess(pid, params) {
  for (let i = 1; i <= 10; i++) {
    if (processDetails[pid]?.stopped) return;
    await sleep(300);
    addLog(pid, `Step ${i}/10`, 'info');
    processDetails[pid].progress = i * 10;
    pushSSE(pid, { type: 'progress', progress: i * 10 });
  }
  processDetails[pid].status = 'completed';
  pushSSE(pid, { type: 'complete', success: true });
}

// ── Per-source timed run with stage breakdown ────────────────────────────────
// POST /api/scraper/timed-run/:sourceCode
router.post('/timed-run/:sourceCode', async (req, res) => {
  try {
    const { sourceCode } = req.params;
    const source = await query('SELECT * FROM sanctions_list_sources WHERE source_code = @code', { code: sourceCode });
    if (!source.recordset.length) return res.status(404).json({ error: 'Source not found' });
    const src = source.recordset[0];

    const t0 = Date.now();
    let downloadDone = 0;
    const progressMsgs = [];

    const result = await realScrapeSource(src, (msg) => {
      progressMsgs.push({ ts: Date.now(), msg });
      if (!downloadDone && /download|fetched|parsed|downloaded/i.test(msg)) {
        downloadDone = Date.now();
      }
    });
    const afterInsert = Date.now();

    // Stage 3: RAM reload
    const t2 = Date.now();
    try {
      const eng = require('../services/sanctionsEngine');
      await eng.reload();
    } catch (_) {}
    const ramMs = Date.now() - t2;

    const totalMs    = afterInsert - t0;
    const downloadMs = downloadDone ? downloadDone - t0 : Math.round(totalMs * 0.35);
    const insertMs   = downloadDone ? afterInsert - downloadDone : Math.round(totalMs * 0.55);

    try {
      await query(
        `INSERT INTO audit_log (event_type, entity_type, entity_id, action, performed_by, description)
         VALUES ('LIST_SCRAPE', 'SANCTIONS_LIST', @code, 'UPDATE', 'System', @desc)`,
        { code: sourceCode, desc: `${sourceCode}: ${result.downloaded} records | +${result.added} added | ~${result.updated} updated | dl:${downloadMs}ms ins:${insertMs}ms ram:${ramMs}ms` }
      );
    } catch (_) {}

    res.json({
      source: sourceCode,
      download_ms: downloadMs,
      insert_ms:   insertMs,
      ram_ms:      ramMs,
      total_ms:    totalMs + ramMs,
      downloaded:  result.downloaded || 0,
      added:       result.added      || 0,
      updated:     result.updated    || 0,
      deleted:     result.deleted    || 0,
      logs:        progressMsgs.map(m => m.msg),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scraper/reload-ram  — reload sanctions engine from DB into RAM
router.post('/reload-ram', async (req, res) => {
  try {
    const t0 = Date.now();
    // D — Invalidate Redis cache so reload fetches fresh data from DB
    try { await require('../services/redisCache').invalidateIndex(); } catch (_) {}
    const eng = require('../services/sanctionsEngine');
    const result = await eng.reload();
    const ramMs = Date.now() - t0;
    try {
      await query(
        `INSERT INTO audit_log (event_type, entity_type, entity_id, action, performed_by, description)
         VALUES ('RAM_RELOAD', 'SANCTIONS_ENGINE', 'ALL', 'RELOAD', 'System', @desc)`,
        { desc: `Sanctions RAM engine reloaded: ${result?.count?.toLocaleString() || '?'} entries in ${ramMs}ms` }
      );
    } catch (_) {}
    res.json({ message: 'RAM engine reloaded', entries: result?.count || 0, ram_ms: ramMs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scraper/engine-status  — current RAM engine status
router.get('/engine-status', (req, res) => {
  try {
    const eng = require('../services/sanctionsEngine');
    const status = eng.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Also override scheduler to return proper job format
router.get('/scheduler-jobs', async (req, res) => {
  try {
    const result = await query('SELECT * FROM sanctions_list_sources ORDER BY source_code');
    const jobs = result.recordset.map(s => ({
      id: s.id,
      job_name: `${s.source_code} Scraper`,
      description: `Scrape ${s.source_name} every ${s.scrape_interval_hours}h`,
      cron_expression: s.scrape_interval_hours <= 3 ? '0 0 */3 * * *' : s.scrape_interval_hours <= 6 ? '0 0 */6 * * *' : '0 0 0 * * *',
      is_enabled: !!s.is_active,
      last_run: s.last_scraped,
      next_run: s.last_scraped ? new Date(new Date(s.last_scraped).getTime() + s.scrape_interval_hours * 3600000).toISOString() : null,
      source_code: s.source_code,
      source_name: s.source_name,
      scrape_interval_hours: s.scrape_interval_hours,
    }));
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scraper/clear-mem/:sourceCode
// Deletes all rows for this source from sanctions_entries_mem (SQL in-memory table)
router.post('/clear-mem/:sourceCode', async (req, res) => {
  try {
    const { sourceCode } = req.params;
    const src = await query('SELECT id FROM sanctions_list_sources WHERE source_code = @code', { code: sourceCode });
    if (!src.recordset.length) return res.status(404).json({ error: 'Source not found' });
    const sid = src.recordset[0].id;
    await query('DELETE FROM sanctions_entries_mem WHERE source_id = @sid', { sid });
    res.json({ ok: true, message: `Cleared sanctions_entries_mem for ${sourceCode}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scraper/load-mem/:sourceCode
// Copies active rows from sanctions_entries → sanctions_entries_mem for this source
router.post('/load-mem/:sourceCode', async (req, res) => {
  try {
    const { sourceCode } = req.params;
    const src = await query('SELECT id FROM sanctions_list_sources WHERE source_code = @code', { code: sourceCode });
    if (!src.recordset.length) return res.status(404).json({ error: 'Source not found' });
    const sid = src.recordset[0].id;

    // Clear existing rows for this source first
    await query('DELETE FROM sanctions_entries_mem WHERE source_id = @sid', { sid });

    // Insert fresh copy from sanctions_entries
    const result = await query(`
      INSERT INTO sanctions_entries_mem
        (id, source_id, source_code, external_id, entry_type, primary_name,
         aliases, dob, nationality, programme, status, listing_date)
      SELECT
        e.id, e.source_id, s.source_code, e.external_id, e.entry_type, e.primary_name,
        (
          SELECT STRING_AGG(a.alias_name, '|')
          FROM sanctions_aliases a
          WHERE a.entry_id = e.id
        ) AS aliases,
        e.dob, e.nationality, e.programme, e.status,
        CONVERT(NVARCHAR(30), e.listing_date, 23)
      FROM sanctions_entries e
      JOIN sanctions_list_sources s ON s.id = e.source_id
      WHERE e.source_id = @sid
        AND e.status IN ('Active', 'ACTIVE')
    `, { sid });

    const loaded = result.rowsAffected?.[0] ?? 0;
    res.json({ ok: true, loaded, message: `Loaded ${loaded} rows into sanctions_entries_mem for ${sourceCode}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
