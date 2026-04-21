/**
 * ICIJ Offshore Leaks Loader
 * ===========================
 * Uses the ICIJ Reconciliation API to bulk-fetch all entities from the
 * Offshore Leaks database (Panama Papers, Pandora Papers, Paradise Papers,
 * Bahamas Leaks, FinCEN Files) and merges them into pep_entries.
 *
 * API: https://offshoreleaks.icij.org/api/v1/reconcile/suggest/entity
 *   - cursor-based pagination, 25 records per page
 *   - returns { result: [{ id, name, description, notables }] }
 *   - description contains the source dataset name
 *
 * Runs in background — status exposed via getICIJStatus().
 */
'use strict';
const axios  = require('axios');
const { query } = require('../db/connection');

const ICIJ_SUGGEST_URL = 'https://offshoreleaks.icij.org/api/v1/reconcile/suggest/entity';
const PAGE_SIZE        = 25;
const ESTIMATED_TOTAL  = 810000; // ~810K entities in the full database

// ── Status ────────────────────────────────────────────────────────────────────
let _status = {
  status:      'idle',   // idle | running | completed | error
  startedAt:   null,
  completedAt: null,
  progress:    { loaded: 0, total: ESTIMATED_TOTAL, pct: 0 },
  stats:       { added: 0, updated: 0, total: 0 },
  error:       null,
  logs:        [],
};

function log(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), msg, level };
  console.log(`[ICIJLoader] ${msg}`);
  _status.logs.push(entry);
  if (_status.logs.length > 200) _status.logs.shift();
}

function getICIJStatus() {
  return { ..._status, logs: _status.logs.slice(-60) };
}

// ── Fetch one page ────────────────────────────────────────────────────────────
async function fetchPage(cursor) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await axios.get(ICIJ_SUGGEST_URL, {
        params: { prefix: '', cursor },
        headers: { 'Accept': 'application/json' },
        timeout: 30000,
      });
      return resp.data?.result || [];
    } catch (err) {
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
      } else {
        log(`⚠ Page at cursor ${cursor} failed after 3 attempts: ${err.message}`, 'warn');
        return null; // null = stop pagination
      }
    }
  }
  return [];
}

// ── Extract dataset label from description ────────────────────────────────────
function extractDataset(description) {
  if (!description) return 'ICIJ Offshore Leaks';
  const d = description.toLowerCase();
  if (d.includes('pandora'))  return 'Pandora Papers';
  if (d.includes('panama'))   return 'Panama Papers';
  if (d.includes('paradise')) return 'Paradise Papers';
  if (d.includes('bahamas'))  return 'Bahamas Leaks';
  if (d.includes('fincen'))   return 'FinCEN Files';
  return 'ICIJ Offshore Leaks';
}

// ── Extract node type from notables ──────────────────────────────────────────
function extractType(notables) {
  if (!Array.isArray(notables) || !notables.length) return 'Node';
  const t = notables[0]?.name || 'Node';
  return t;
}

// ── Merge batch into pep_entries ──────────────────────────────────────────────
async function mergeBatch(rows) {
  if (!rows.length) return { added: 0 };

  const vals = rows.map(r => {
    const eid   = `ICIJ_${r.icijId}`.replace(/'/g, "''").substring(0, 100);
    const name  = (r.name || 'Unknown').replace(/'/g, "''").substring(0, 500);
    const ds    = (r.dataset || 'ICIJ').replace(/'/g, "''").substring(0, 500);
    const adv   = (r.adverseLinks || '').replace(/'/g, "''").substring(0, 500);
    const icij  = String(r.icijId || '').replace(/'/g, "''").substring(0, 100);
    const today = new Date().toISOString().split('T')[0];
    return `('${eid}','ICIJ','Person','${name}','','','','','','','','${ds}','','','','','','','${adv}','','${icij}','${today}','${today}','${today}','ACTIVE')`;
  }).join(',\n');

  const sql = `
MERGE pep_entries AS target
USING (VALUES ${vals}) AS source (
  external_id, source, schema_type, primary_name, aliases,
  birth_date, countries, nationality, position, political_party,
  gender, dataset, programme_ids, identifiers, addresses, emails,
  phones, remarks, adverse_links, wikidata_id, icij_node_id,
  first_seen, last_seen, last_change, status
)
ON target.external_id = source.external_id AND target.source = 'ICIJ'
WHEN MATCHED AND target.primary_name <> source.primary_name THEN
  UPDATE SET
    primary_name  = source.primary_name,
    adverse_links = source.adverse_links,
    last_change   = source.last_change,
    updated_at    = GETDATE()
WHEN NOT MATCHED THEN
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
          source.first_seen, source.last_seen, source.last_change, source.status);
`;
  const result = await query(sql);
  const added = result.rowsAffected?.[0] || 0;
  return { added };
}

// ── Main load function ────────────────────────────────────────────────────────
async function loadICIJ() {
  if (_status.status === 'running') {
    throw new Error('ICIJ loader is already running');
  }

  _status = {
    status:      'running',
    startedAt:   new Date().toISOString(),
    completedAt: null,
    progress:    { loaded: 0, total: ESTIMATED_TOTAL, pct: 0 },
    stats:       { added: 0, updated: 0, total: 0 },
    error:       null,
    logs:        [],
  };

  log(`🚀 Starting ICIJ Offshore Leaks load (~${ESTIMATED_TOTAL.toLocaleString()} entities)`);
  log(`📡 API: ${ICIJ_SUGGEST_URL} (cursor pagination, 25/page)`);

  try {
    let cursor    = 0;
    let totalFetched = 0;
    let totalAdded   = 0;
    let batch        = [];
    const BATCH_SIZE = 500;
    let emptyCount   = 0;

    while (true) {
      const items = await fetchPage(cursor);

      // null means a hard failure — stop
      if (items === null) {
        log(`⚠ Stopping at cursor ${cursor} due to repeated fetch failures`, 'warn');
        break;
      }

      // Empty result means end of data
      if (items.length === 0) {
        emptyCount++;
        if (emptyCount >= 3) {
          log(`✅ Reached end of data at cursor ${cursor}`);
          break;
        }
        cursor += PAGE_SIZE;
        continue;
      }
      emptyCount = 0;

      // Map items to row objects
      for (const item of items) {
        batch.push({
          icijId:       item.id,
          name:         item.name || '',
          dataset:      extractDataset(item.description),
          adverseLinks: `ICIJ ${extractDataset(item.description)}`,
          nodeType:     extractType(item.notables),
        });
      }

      totalFetched += items.length;
      cursor       += PAGE_SIZE;

      // Flush batch
      if (batch.length >= BATCH_SIZE) {
        const { added } = await mergeBatch(batch);
        totalAdded += added;
        batch = [];
        _status.stats.added   = totalAdded;
        _status.stats.total   = totalFetched;
        _status.progress.loaded = totalFetched;
        _status.progress.pct  = Math.min(99, Math.round((totalFetched / ESTIMATED_TOTAL) * 100));
      }

      // Log progress every 5000 records
      if (totalFetched % 5000 === 0) {
        log(`📊 Fetched ${totalFetched.toLocaleString()} / ~${ESTIMATED_TOTAL.toLocaleString()} (${_status.progress.pct}%)`);
      }

      // Polite delay every 100 pages
      if ((cursor / PAGE_SIZE) % 100 === 0) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Flush remaining batch
    if (batch.length > 0) {
      const { added } = await mergeBatch(batch);
      totalAdded += added;
    }

    _status.stats.added   = totalAdded;
    _status.stats.total   = totalFetched;
    _status.status        = 'completed';
    _status.completedAt   = new Date().toISOString();
    _status.progress.loaded = totalFetched;
    _status.progress.pct  = 100;
    log(`✅ ICIJ load complete — ${totalFetched.toLocaleString()} entities fetched, ${totalAdded.toLocaleString()} new/updated`);

    // Trigger RAM index rebuild
    try {
      const { reloadPEPs } = require('./pepEngine');
      reloadPEPs().catch(e => log(`⚠ RAM reload error: ${e.message}`, 'warn'));
      log('🔄 RAM index rebuild triggered');
    } catch (_) {}

  } catch (err) {
    _status.status = 'error';
    _status.error  = err.message;
    log(`❌ ICIJ load failed: ${err.message}`, 'error');
    throw err;
  }
}

module.exports = { loadICIJ, getICIJStatus };
