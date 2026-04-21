/**
 * PEP BCP Loader — Enterprise Bulk-Copy Pipeline
 * ================================================
 * 7-stage pipeline with pause/stop/restart support:
 *
 *   Stage 1 — Download    : Stream OpenSanctions PEP CSV → disk
 *   Stage 2 — Transform   : Reorder CSV columns to match pep_staging
 *   Stage 3 — BCP Load    : bcp bulk-insert into pep_staging (TABLOCK)
 *   Stage 4 — MERGE       : Atomic MERGE pep_staging → pep_entries
 *   Stage 5 — Audit       : Write audit_log entry
 *   Stage 6 — Mem Table   : Reload pep_entries_mem (SQL In-Memory OLTP)
 *   Stage 7 — RAM Index   : Rebuild Node.js token + phonetic index
 */
'use strict';

const fs       = require('fs');
const path     = require('path');
const https    = require('https');
const http     = require('http');
const { exec, execFile } = require('child_process');
const { query } = require('../db/connection');

// ── Constants ─────────────────────────────────────────────────────────────────
const BCP_BIN      = '/opt/mssql-tools18/bin/bcp';
const SFTP_DIR     = '/data/sftp/pep-data';
const CSV_PATH     = path.join(SFTP_DIR, 'pep.csv');
const ERR_PATH     = path.join(SFTP_DIR, 'pep_bcp_errors.txt');
const PEP_CSV_URL  = 'https://data.opensanctions.org/datasets/latest/peps/targets.simple.csv';

const DB_SERVER    = '203.101.44.46';
const DB_NAME      = 'sanctions';
const DB_USER      = 'shahul';
const DB_PASS      = 'Apple123!@#';

// Expected durations per stage (seconds) — shown in UI
const STAGE_EXPECTED = {
  download:  60,
  transform: 40,
  bcp:       30,
  merge:     20,
  audit:     2,
  mem_table: 180,
  ram_index: 120,
};

// ── Control flags ─────────────────────────────────────────────────────────────
let _abortFlag  = false;   // set true to stop after current stage
let _pauseFlag  = false;   // set true to pause between stages
let _currentDownloadReq = null;  // http.ClientRequest for aborting download

// ── Status tracking ───────────────────────────────────────────────────────────
let _status = {
  status:         'idle',   // idle | running | paused | completed | error | stopped
  phase:          null,     // download | transform | bcp | merge | audit | mem_table | ram_index
  phaseStartedAt: null,     // ISO timestamp when current phase started
  startedAt:      null,
  completedAt:    null,
  timings: {
    download_ms:  0,
    transform_ms: 0,
    bcp_ms:       0,
    merge_ms:     0,
    audit_ms:     0,
    mem_table_ms: 0,
    ram_index_ms: 0,
    total_ms:     0,
  },
  stats: {
    downloaded_bytes: 0,
    rows_in_staging:  0,
    rows_merged:      0,
    rows_added:       0,
    rows_updated:     0,
  },
  error: null,
  logs:  [],
};

function log(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), msg, level };
  _status.logs.push(entry);
  if (_status.logs.length > 300) _status.logs.shift();
  console.log(`[BCPLoader] ${msg}`);
}

function setPhase(phase) {
  _status.phase          = phase;
  _status.phaseStartedAt = new Date().toISOString();
  log(`▶ Starting stage: ${phase}`);
}

// ── Persist state to DB ──────────────────────────────────────────────────────
async function persistState() {
  try {
    await query(`
      UPDATE pep_pipeline_state SET
        status       = @status,
        phase        = @phase,
        started_at   = @startedAt,
        completed_at = @completedAt,
        timings      = @timings,
        stats        = @stats,
        error        = @error,
        updated_at   = GETUTCDATE()
      WHERE id = 1
    `, {
      status:      _status.status,
      phase:       _status.phase,
      startedAt:   _status.startedAt ? new Date(_status.startedAt) : null,
      completedAt: _status.completedAt ? new Date(_status.completedAt) : null,
      timings:     JSON.stringify(_status.timings),
      stats:       JSON.stringify(_status.stats),
      error:       _status.error,
    });
  } catch (e) {
    console.log('[BCPLoader] Failed to persist state:', e.message);
  }
}

// ── Restore state from DB on startup ─────────────────────────────────────────
async function restoreStateFromDB() {
  try {
    const r = await query('SELECT TOP 1 * FROM pep_pipeline_state WHERE id = 1');
    const row = r.recordset?.[0];
    if (!row || row.status === 'idle') return;
    _status.status      = row.status;
    _status.phase       = row.phase;
    _status.startedAt   = row.started_at ? new Date(row.started_at).toISOString() : null;
    _status.completedAt = row.completed_at ? new Date(row.completed_at).toISOString() : null;
    _status.error       = row.error;
    if (row.timings)  try { _status.timings = JSON.parse(row.timings); } catch (_) {}
    if (row.stats)    try { _status.stats   = JSON.parse(row.stats);   } catch (_) {}
    console.log(`[BCPLoader] Restored pipeline state from DB: ${row.status}`);
  } catch (e) {
    console.log('[BCPLoader] Could not restore state from DB:', e.message);
  }
}
// Restore on module load (async, non-blocking)
restoreStateFromDB().catch(() => {});

function getBCPStatus() {
  return {
    ..._status,
    logs:           _status.logs.slice(-60),
    stageExpected:  STAGE_EXPECTED,
    abortRequested: _abortFlag,
    pauseRequested: _pauseFlag,
  };
}

// ── Reset status to idle (clears stage badges to WAITING before re-run) ───────
function resetBCPStatus() {
  if (_status.status === 'running' || _status.status === 'paused') return; // safety: don't reset while running
  _abortFlag = false;
  _pauseFlag = false;
  _status = {
    status:         'idle',
    phase:          null,
    phaseStartedAt: null,
    startedAt:      null,
    completedAt:    null,
    timings: { download_ms: 0, transform_ms: 0, bcp_ms: 0, merge_ms: 0, audit_ms: 0, mem_table_ms: 0, ram_index_ms: 0, total_ms: 0 },
    stats:   { downloaded_bytes: 0, rows_in_staging: 0, rows_merged: 0, rows_added: 0, rows_updated: 0 },
    error:   null,
    logs:    [],
  };
}

// ── Abort/pause helpers ───────────────────────────────────────────────────────
function requestStop() {
  _abortFlag = true;
  _pauseFlag = false;
  log('⛔ Stop requested — will halt after current stage completes', 'warn');
  // If still downloading, abort the HTTP request immediately
  if (_currentDownloadReq) {
    try { _currentDownloadReq.destroy(new Error('Aborted by user')); } catch (_) {}
  }
}

function requestPause() {
  if (_status.status !== 'running') return;
  _pauseFlag = true;
  log('⏸ Pause requested — will pause after current stage completes', 'warn');
}

function requestResume() {
  if (_status.status !== 'paused') return;
  _pauseFlag = false;
  _status.status = 'running';
  log('▶ Resumed');
}

// Wait while paused — resolves when resumed or aborted
async function checkPauseOrAbort(label) {
  if (_abortFlag) throw new Error(`Stopped by user before stage: ${label}`);
  if (_pauseFlag) {
    _status.status = 'paused';
    log(`⏸ Paused before stage: ${label}`);
    await new Promise(resolve => {
      const iv = setInterval(() => {
        if (!_pauseFlag || _abortFlag) { clearInterval(iv); resolve(); }
      }, 500);
    });
    if (_abortFlag) throw new Error(`Stopped by user before stage: ${label}`);
    _status.status = 'running';
    log(`▶ Resuming stage: ${label}`);
  }
}

// ── Stage 1: Download CSV ─────────────────────────────────────────────────────
function downloadCSV(url, destPath) {
  return new Promise((resolve, reject) => {
    log(`⬇ Downloading PEP CSV from ${url}`);
    const file = fs.createWriteStream(destPath);
    let bytes = 0;
    let lastLogBytes = 0;

    function doGet(currentUrl, redirectCount = 0) {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      const lib = currentUrl.startsWith('https') ? https : http;
      const req = lib.get(currentUrl, { headers: { 'User-Agent': 'SanctionsEngine/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          return doGet(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} from ${currentUrl}`));
        }
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes - lastLogBytes > 10 * 1024 * 1024) {
            log(`  ⬇ Downloaded ${(bytes / 1024 / 1024).toFixed(1)} MB...`);
            lastLogBytes = bytes;
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          _currentDownloadReq = null;
          _status.stats.downloaded_bytes = bytes;
          log(`✓ Download complete: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
          resolve(bytes);
        });
        file.on('error', reject);
        res.on('error', reject);
      });
      req.on('error', reject);
      _currentDownloadReq = req;
    }

    doGet(url);
  });
}

// ── Stage 2: BCP bulk load into pep_staging ───────────────────────────────────
function runBCP(csvPath) {
  return new Promise((resolve, reject) => {
    // Use execFile with args array — avoids shell interpretation of special chars in password (!, @, #)
    const args = [
      `${DB_NAME}.dbo.pep_staging`,
      'in', csvPath,
      '-S', DB_SERVER,
      '-U', DB_USER,
      '-P', DB_PASS,
      '-c', '-t\t', '-r\n',
      '-F', '2',
      '-b', '10000',
      '-h', 'TABLOCK',
      '-u',
      '-e', ERR_PATH,
    ];

    log(`⚡ Running BCP bulk load into pep_staging...`);

    execFile(BCP_BIN, args, { maxBuffer: 10 * 1024 * 1024, timeout: 600000 }, (err, stdout, stderr) => {
      const output = (stdout || '') + (stderr || '');
      const match = output.match(/(\d[\d,]*)\s+rows copied/i);
      if (match) {
        const rows = parseInt(match[1].replace(/,/g, ''));
        _status.stats.rows_in_staging = rows;
        log(`✓ BCP complete: ${rows.toLocaleString()} rows loaded into pep_staging`);
        resolve(rows);
      } else if (err) {
        log(`BCP error: ${err.message}`, 'error');
        reject(new Error(`BCP failed: ${err.message}`));
      } else {
        log(`BCP unexpected output: ${output.slice(0, 300)}`, 'warn');
        reject(new Error('BCP returned no row count'));
      }
    });
  });
}

// ── Stage 3: Transform CSV ────────────────────────────────────────────────────
async function transformCSV(srcPath, destPath) {
  return new Promise((resolve, reject) => {
    log('⚙ Transforming CSV to match pep_staging column layout...');
    const readline = require('readline');
    const inStream  = fs.createReadStream(srcPath, { encoding: 'utf8' });
    const outStream = fs.createWriteStream(destPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: inStream, crlfDelay: Infinity });

    let headers = null;
    let rowCount = 0;
    let lineCount = 0;

    // Use tab delimiter — BCP -c mode does NOT handle RFC 4180 quoted CSV fields.
    // Commas inside quoted fields (e.g. "Kim, PBS, PPA") cause column shifts.
    // Tab is safe because none of the PEP data contains tab characters.
    outStream.write(
      'external_id\tsource\tschema_type\tprimary_name\taliases\tbirth_date\t' +
      'countries\tnationality\tposition\tpolitical_party\tgender\tdataset\t' +
      'programme_ids\tidentifiers\taddresses\temails\tphones\tremarks\t' +
      'adverse_links\twikidata_id\ticij_node_id\tfirst_seen\tlast_seen\t' +
      'last_change\tstatus\n'
    );

    rl.on('line', (line) => {
      lineCount++;
      if (lineCount === 1) { headers = parseCSVLine(line).map(h => h.toLowerCase().trim()); return; }
      if (!line.trim()) return;

      const cols = parseCSVLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = (cols[i] || '').trim(); });

      const name = row['caption'] || row['name'] || '';
      if (!name) return;

      let wikidataId = '';
      if (row['identifiers']) {
        const wdMatch = row['identifiers'].match(/Q\d+/);
        if (wdMatch) wikidataId = wdMatch[0];
      }

      const fields = [
        row['id'] || '', 'OPENSANCTIONS_PEP', row['schema'] || 'Person', name,
        row['aliases'] || '', row['birth_date'] || '', row['countries'] || '',
        row['countries'] || '', '', '', '', row['dataset'] || '',
        row['program_ids'] || '', row['identifiers'] || '', row['addresses'] || '',
        row['emails'] || '', row['phones'] || '', '', '', wikidataId, '',
        row['first_seen'] || '', row['last_seen'] || '', row['last_change'] || '', 'ACTIVE',
      ];

      // Replace any tabs in field values with a space (safety measure)
      const escaped = fields.map(f => f.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ''));

      outStream.write(escaped.join('\t') + '\n');
      rowCount++;
      if (rowCount % 100000 === 0) log(`  ⚙ Transformed ${rowCount.toLocaleString()} rows...`);
    });

    rl.on('close', () => {
      outStream.end(() => {
        log(`✓ Transform complete: ${rowCount.toLocaleString()} rows written`);
        resolve(rowCount);
      });
    });
    rl.on('error', reject);
    inStream.on('error', reject);
  });
}

function parseCSVLine(line) {
  const cols = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
    else { cur += c; }
  }
  cols.push(cur);
  return cols;
}

// ── Stage 4: MERGE pep_staging → pep_entries ─────────────────────────────────
async function mergeStagingToProduction() {
  log('🔀 Running MERGE pep_staging → pep_entries...');
  const t0 = Date.now();

  const mergeSQL = `
    MERGE pep_entries AS target
    USING pep_staging AS source
      ON target.external_id = source.external_id AND target.source = source.source
    WHEN MATCHED AND (
      target.primary_name <> source.primary_name OR
      ISNULL(target.last_change,'') <> ISNULL(source.last_change,'')
    ) THEN UPDATE SET
      primary_name = source.primary_name, aliases = source.aliases,
      birth_date = source.birth_date, countries = source.countries,
      nationality = source.nationality, position = source.position,
      dataset = source.dataset, identifiers = source.identifiers,
      wikidata_id = source.wikidata_id, first_seen = source.first_seen,
      last_seen = source.last_seen, last_change = source.last_change,
      status = source.status, updated_at = GETDATE()
    WHEN NOT MATCHED BY TARGET THEN
      INSERT (external_id, source, schema_type, primary_name, aliases,
              birth_date, countries, nationality, position, political_party,
              gender, dataset, programme_ids, identifiers, addresses, emails,
              phones, remarks, adverse_links, wikidata_id, icij_node_id,
              first_seen, last_seen, last_change, status)
      VALUES (source.external_id, source.source, source.schema_type,
              source.primary_name, source.aliases, source.birth_date,
              source.countries, source.nationality, source.position,
              source.political_party, source.gender, source.dataset,
              source.programme_ids, source.identifiers, source.addresses,
              source.emails, source.phones, source.remarks,
              source.adverse_links, source.wikidata_id, source.icij_node_id,
              source.first_seen, source.last_seen, source.last_change, source.status)
    WHEN NOT MATCHED BY SOURCE AND target.source = 'OPENSANCTIONS_PEP' THEN
      UPDATE SET status = 'DELISTED', updated_at = GETDATE()
    OUTPUT $action;
  `;

  const result = await query(mergeSQL);
  const merge_ms = Date.now() - t0;

  let added = 0, updated = 0;
  if (result.recordset) {
    for (const row of result.recordset) {
      if (row[''] === 'INSERT') added++;
      else if (row[''] === 'UPDATE') updated++;
    }
  }

  const countResult = await query(
    "SELECT COUNT(*) as cnt FROM pep_entries WHERE source = 'OPENSANCTIONS_PEP' AND status = 'ACTIVE'"
  );
  const totalActive = countResult.recordset[0].cnt;

  _status.stats.rows_merged  = totalActive;
  _status.stats.rows_added   = added;
  _status.stats.rows_updated = updated;
  _status.timings.merge_ms   = merge_ms;

  log(`✓ MERGE complete in ${merge_ms.toLocaleString()}ms — +${added.toLocaleString()} added, ~${updated.toLocaleString()} updated, ${totalActive.toLocaleString()} total active`);
  return { added, updated, totalActive, merge_ms };
}

// ── Stage 5: Audit log ────────────────────────────────────────────────────────
async function writeAuditLog(timings, stats, error) {
  try {
    await query(`
      INSERT INTO audit_log (action, entity_type, entity_id, user_id, details, created_at)
      VALUES (@action, @entity_type, @entity_id, @user_id, @details, GETDATE())
    `, {
      action:      error ? 'PEP_BCP_LOAD_FAILED' : 'PEP_BCP_LOAD_SUCCESS',
      entity_type: 'PEP_DATA',
      entity_id:   'OPENSANCTIONS_PEP',
      user_id:     'SYSTEM',
      details:     JSON.stringify({ source: 'OPENSANCTIONS_PEP', method: 'BCP_BULK_LOAD', ...timings, ...stats, error: error || null }),
    });
    log('✓ Audit log entry written');
  } catch (e) {
    log(`Audit log write failed: ${e.message}`, 'warn');
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function runBCPLoad() {
  if (_status.status === 'running' || _status.status === 'paused') {
    throw new Error('BCP load already running');
  }

  _abortFlag = false;
  _pauseFlag = false;
  _currentDownloadReq = null;

  _status = {
    status:         'running',
    phase:          'download',
    phaseStartedAt: new Date().toISOString(),
    startedAt:      new Date().toISOString(),
    completedAt:    null,
    timings:        { download_ms: 0, transform_ms: 0, bcp_ms: 0, merge_ms: 0, audit_ms: 0, mem_table_ms: 0, ram_index_ms: 0, total_ms: 0 },
    stats:          { downloaded_bytes: 0, rows_in_staging: 0, rows_merged: 0, rows_added: 0, rows_updated: 0 },
    error:          null,
    logs:           [],
  };

  const t0 = Date.now();
  const rawCSV     = path.join(SFTP_DIR, 'pep_raw.csv');
  const stagingCSV = path.join(SFTP_DIR, 'pep_staging.csv');

  try {
    // ── Stage 1: Download ──────────────────────────────────────────────────
    setPhase('download');
    const t1 = Date.now();
    await downloadCSV(PEP_CSV_URL, rawCSV);
    _status.timings.download_ms = Date.now() - t1;
    await checkPauseOrAbort('transform');

    // ── Stage 2: Transform ─────────────────────────────────────────────────
    setPhase('transform');
    const t2 = Date.now();
    await transformCSV(rawCSV, stagingCSV);
    _status.timings.transform_ms = Date.now() - t2;
    await checkPauseOrAbort('bcp');

    // ── Stage 3: BCP Bulk Load ─────────────────────────────────────────────
    setPhase('bcp');
    log('Truncating pep_staging...');
    await query('TRUNCATE TABLE pep_staging');
    const t3 = Date.now();
    await runBCP(stagingCSV);
    _status.timings.bcp_ms = Date.now() - t3;
    await checkPauseOrAbort('merge');

    // ── Stage 4: MERGE ────────────────────────────────────────────────────
    setPhase('merge');
    const mergeResult = await mergeStagingToProduction();
    _status.timings.merge_ms = mergeResult.merge_ms;
    await checkPauseOrAbort('audit');

    // ── Stage 5: Audit ────────────────────────────────────────────────────
    setPhase('audit');
    const t5 = Date.now();
    await writeAuditLog(_status.timings, _status.stats, null);
    await query(`
      UPDATE pep_sources SET total_entries = @cnt, last_scraped = GETDATE(), last_scrape_status = 'success'
      WHERE source_code = 'OPENSANCTIONS_PEP'
    `, { cnt: _status.stats.rows_merged });
    _status.timings.audit_ms = Date.now() - t5;
    await checkPauseOrAbort('mem_table');

    // ── Stage 6: Reload In-Memory Table ───────────────────────────────────
    setPhase('mem_table');
    log('🗄 Reloading pep_entries_mem (SQL Server In-Memory OLTP)...');
    const t6 = Date.now();
    try {
      const { loadPEPIntoMemTable } = require('./pepMemLoader');
      await loadPEPIntoMemTable();
      _status.timings.mem_table_ms = Date.now() - t6;
      log(`✓ In-memory table loaded in ${(_status.timings.mem_table_ms / 1000).toFixed(1)}s`);
    } catch (e) {
      log(`In-memory table reload failed (non-fatal): ${e.message}`, 'warn');
      _status.timings.mem_table_ms = Date.now() - t6;
    }
    await checkPauseOrAbort('ram_index');

    // ── Stage 7: Rebuild RAM Index ─────────────────────────────────────────
    setPhase('ram_index');
    log('🧠 Rebuilding Node.js RAM index (token + phonetic)...');
    const t7 = Date.now();
    try {
      const { reloadPEPs } = require('./pepEngine');
      await reloadPEPs();
      _status.timings.ram_index_ms = Date.now() - t7;
      log(`✓ RAM index built in ${(_status.timings.ram_index_ms / 1000).toFixed(1)}s — engine ready for screening`);
    } catch (e) {
      log(`RAM index rebuild failed (non-fatal): ${e.message}`, 'warn');
      _status.timings.ram_index_ms = Date.now() - t7;
    }

    // ── Complete ───────────────────────────────────────────────────────────
    _status.timings.total_ms = Date.now() - t0;
    _status.status           = 'completed';
    _status.completedAt      = new Date().toISOString();
    _status.phase            = null;
    _status.phaseStartedAt   = null;

    log(`✅ BCP pipeline complete in ${(_status.timings.total_ms / 1000).toFixed(1)}s — ${_status.stats.rows_merged.toLocaleString()} PEP entries ready for screening`);
    await persistState();

    try { fs.unlinkSync(rawCSV); } catch (_) {}

    return { status: 'completed', timings: _status.timings, stats: _status.stats };

  } catch (err) {
    const stopped = err.message.startsWith('Stopped by user');
    _status.status           = stopped ? 'stopped' : 'error';
    _status.error            = err.message;
    _status.completedAt      = new Date().toISOString();
    _status.phase            = null;
    _status.phaseStartedAt   = null;
    _status.timings.total_ms = Date.now() - t0;
    log(stopped ? `⛔ Pipeline stopped by user` : `❌ BCP pipeline failed: ${err.message}`, stopped ? 'warn' : 'error');
    await persistState();
    if (!stopped) await writeAuditLog(_status.timings, _status.stats, err.message).catch(() => {});
    if (!stopped) throw err;
  }
}

module.exports = { runBCPLoad, getBCPStatus, resetBCPStatus, requestStop, requestPause, requestResume };
