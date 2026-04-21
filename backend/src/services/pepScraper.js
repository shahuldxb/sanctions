/**
 * PEP Data Scraper
 * ================
 * Downloads and ingests PEP data from three sources:
 *   1. OpenSanctions PEP dataset  (primary - ~700K records)
 *   2. Wikidata SPARQL            (enrichment - heads of state, ministers)
 *   3. ICIJ Offshore Leaks        (adverse links - Panama/Pandora Papers)
 *
 * All data is bulk-inserted into pep_entries and then loaded into RAM
 * via pepEngine.
 */
'use strict';

const axios   = require('axios');
const { query, getPool, sql } = require('../db/connection');
const { upsertPEPInRAM, reloadPEPs } = require('./pepEngine');
const { loadPEPIntoMemTable } = require('./pepMemLoader');

// ── State tracking ────────────────────────────────────────────────────────────
let _runStatus = {
  status:      'idle',
  startedAt:   null,
  completedAt: null,
  results:     [],
  recentLogs:  [],
};

function log(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), msg, level };
  _runStatus.recentLogs.push(entry);
  if (_runStatus.recentLogs.length > 100) _runStatus.recentLogs.shift();
  console.log(`[PEPScraper] ${msg}`);
}

// ── Bulk upsert helper ────────────────────────────────────────────────────────
async function bulkUpsertPEPs(source, entries) {
  if (!entries || entries.length === 0) return { added: 0, updated: 0 };

  // Get existing external_ids for this source
  const existingRows = await query(
    `SELECT external_id, id FROM pep_entries WHERE source = @src`,
    { src: source }
  );
  const existingMap = new Map();
  for (const r of existingRows.recordset) existingMap.set(r.external_id, r.id);

  const newEntries      = entries.filter(e => !existingMap.has(e.external_id));
  const existingEntries = entries.filter(e =>  existingMap.has(e.external_id));

  let added = 0, updated = 0;
  const CHUNK = 5000; // C — 10x larger batch for faster inserts

  // Bulk insert new entries
  for (let i = 0; i < newEntries.length; i += CHUNK) {
    const chunk = newEntries.slice(i, i + CHUNK);
    try {
      const pool  = await getPool();
      const table = new sql.Table('pep_entries');
      table.create = false;
      table.columns.add('external_id',     sql.NVarChar(200),    { nullable: false });
      table.columns.add('source',          sql.NVarChar(100),    { nullable: false });
      table.columns.add('schema_type',     sql.NVarChar(50),     { nullable: true });
      table.columns.add('primary_name',    sql.NVarChar(500),    { nullable: false });
      table.columns.add('aliases',         sql.NVarChar(sql.MAX),{ nullable: true });
      table.columns.add('birth_date',      sql.NVarChar(100),    { nullable: true });
      table.columns.add('countries',       sql.NVarChar(500),    { nullable: true });
      table.columns.add('nationality',     sql.NVarChar(500),    { nullable: true });
      table.columns.add('position',        sql.NVarChar(500),    { nullable: true });
      table.columns.add('political_party', sql.NVarChar(500),    { nullable: true });
      table.columns.add('gender',          sql.NVarChar(20),     { nullable: true });
      table.columns.add('dataset',         sql.NVarChar(200),    { nullable: true });
      table.columns.add('programme_ids',   sql.NVarChar(sql.MAX),{ nullable: true });
      table.columns.add('identifiers',     sql.NVarChar(sql.MAX),{ nullable: true });
      table.columns.add('addresses',       sql.NVarChar(sql.MAX),{ nullable: true });
      table.columns.add('emails',          sql.NVarChar(sql.MAX),{ nullable: true });
      table.columns.add('phones',          sql.NVarChar(sql.MAX),{ nullable: true });
      table.columns.add('remarks',         sql.NVarChar(sql.MAX),{ nullable: true });
      table.columns.add('wikidata_id',     sql.NVarChar(100),    { nullable: true });
      table.columns.add('first_seen',      sql.NVarChar(50),     { nullable: true });
      table.columns.add('last_seen',       sql.NVarChar(50),     { nullable: true });
      table.columns.add('last_change',     sql.NVarChar(50),     { nullable: true });
      table.columns.add('status',          sql.NVarChar(20),     { nullable: false });

      for (const e of chunk) {
        table.rows.add(
          (e.external_id || '').substring(0, 200),
          source,
          e.schema_type  || null,
          (e.primary_name || '').substring(0, 500),
          e.aliases       || null,
          e.birth_date    || null,
          e.countries     ? e.countries.substring(0, 500) : null,
          e.nationality   ? e.nationality.substring(0, 500) : null,
          e.position      ? e.position.substring(0, 500) : null,
          e.political_party ? e.political_party.substring(0, 500) : null,
          e.gender        || null,
          e.dataset       ? e.dataset.substring(0, 200) : null,
          e.programme_ids || null,
          e.identifiers   || null,
          e.addresses     || null,
          e.emails        || null,
          e.phones        || null,
          e.remarks       || null,
          e.wikidata_id   || null,
          e.first_seen    || null,
          e.last_seen     || null,
          e.last_change   || null,
          'ACTIVE'
        );
      }
      await pool.request().bulk(table);
      added += chunk.length;
    } catch (err) {
      // Fallback row-by-row
      for (const e of chunk) {
        try {
          await query(`
            INSERT INTO pep_entries
              (external_id, source, schema_type, primary_name, aliases, birth_date,
               countries, nationality, position, political_party, gender, dataset,
               programme_ids, identifiers, addresses, emails, phones, remarks,
               wikidata_id, first_seen, last_seen, last_change, status)
            VALUES
              (@eid, @src, @stype, @name, @aliases, @dob,
               @countries, @nat, @pos, @party, @gender, @dataset,
               @pids, @ids, @addr, @emails, @phones, @remarks,
               @wid, @fs, @ls, @lc, 'ACTIVE')
          `, {
            eid: (e.external_id||'').substring(0,200), src: source,
            stype: e.schema_type||null, name: (e.primary_name||'').substring(0,500),
            aliases: e.aliases||null, dob: e.birth_date||null,
            countries: e.countries ? e.countries.substring(0,500) : null,
            nat: e.nationality ? e.nationality.substring(0,500) : null,
            pos: e.position ? e.position.substring(0,500) : null,
            party: e.political_party ? e.political_party.substring(0,500) : null,
            gender: e.gender||null, dataset: e.dataset ? e.dataset.substring(0,200) : null,
            pids: e.programme_ids||null, ids: e.identifiers||null,
            addr: e.addresses||null, emails: e.emails||null, phones: e.phones||null,
            remarks: e.remarks||null, wid: e.wikidata_id||null,
            fs: e.first_seen||null, ls: e.last_seen||null, lc: e.last_change||null,
          });
          added++;
        } catch (_) {}
      }
    }
  }

  // Update existing entries (status + last_seen + position)
  for (let i = 0; i < existingEntries.length; i += CHUNK) {
    const chunk = existingEntries.slice(i, i + CHUNK);
    for (const e of chunk) {
      try {
        await query(`
          UPDATE pep_entries SET
            primary_name = @name, aliases = @aliases, birth_date = @dob,
            countries = @countries, nationality = @nat, position = @pos,
            political_party = @party, gender = @gender, dataset = @dataset,
            last_seen = @ls, last_change = @lc, status = 'ACTIVE', updated_at = GETDATE()
          WHERE source = @src AND external_id = @eid
        `, {
          name: (e.primary_name||'').substring(0,500), aliases: e.aliases||null,
          dob: e.birth_date||null,
          countries: e.countries ? e.countries.substring(0,500) : null,
          nat: e.nationality ? e.nationality.substring(0,500) : null,
          pos: e.position ? e.position.substring(0,500) : null,
          party: e.political_party ? e.political_party.substring(0,500) : null,
          gender: e.gender||null, dataset: e.dataset ? e.dataset.substring(0,200) : null,
          ls: e.last_seen||null, lc: e.last_change||null,
          src: source, eid: (e.external_id||'').substring(0,200),
        });
        updated++;
      } catch (_) {}
    }
  }

  return { added, updated };
}

// ── 1. OpenSanctions PEP Scraper ─────────────────────────────────────────────
async function scrapeOpenSanctionsPEP() {
  log('Downloading OpenSanctions PEP dataset...');
  const url = 'https://data.opensanctions.org/datasets/latest/peps/targets.simple.csv';

  let entries = [];
  try {
    const resp = await axios.get(url, { timeout: 120000, responseType: 'text' });
    const lines = resp.data.split('\n');
    const headers = lines[0].replace(/"/g, '').split(',').map(h => h.trim().toLowerCase());

    log(`Parsing ${lines.length.toLocaleString()} CSV lines...`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // CSV parse: handle quoted fields
      const cols = [];
      let cur = '', inQ = false;
      for (let c = 0; c < line.length; c++) {
        if (line[c] === '"') { inQ = !inQ; }
        else if (line[c] === ',' && !inQ) { cols.push(cur); cur = ''; }
        else { cur += line[c]; }
      }
      cols.push(cur);

      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });

      const name = row['name'] || row['caption'];
      if (!name) continue;

      // Extract wikidata ID from identifiers field
      let wikidataId = null;
      if (row['identifiers']) {
        const wdMatch = row['identifiers'].match(/Q\d+/);
        if (wdMatch) wikidataId = wdMatch[0];
      }

      entries.push({
        external_id:    row['id'],
        schema_type:    row['schema'] || 'Person',
        primary_name:   name,
        aliases:        row['aliases'] ? row['aliases'].replace(/;/g, '|') : null,
        birth_date:     row['birth_date'] || null,
        countries:      row['countries'] || null,
        nationality:    row['countries'] || null,
        position:       null,
        political_party: null,
        gender:         null,
        dataset:        row['dataset'] || null,
        programme_ids:  row['program_ids'] || null,
        identifiers:    row['identifiers'] || null,
        addresses:      row['addresses'] || null,
        emails:         row['emails'] || null,
        phones:         row['phones'] || null,
        remarks:        null,
        wikidata_id:    wikidataId,
        first_seen:     row['first_seen'] || null,
        last_seen:      row['last_seen'] || null,
        last_change:    row['last_change'] || null,
      });
    }
  } catch (err) {
    log(`OpenSanctions PEP download failed: ${err.message}`, 'error');
    return { downloaded: 0, added: 0, updated: 0, error: err.message };
  }

  log(`Parsed ${entries.length.toLocaleString()} PEP entries. Bulk inserting...`);
  const { added, updated } = await bulkUpsertPEPs('OPENSANCTIONS_PEP', entries);
  log(`OpenSanctions PEP: ${added} added, ${updated} updated`);

  // Update source stats
  await query(
    `UPDATE pep_sources SET total_entries = @cnt, last_scraped = GETDATE(), last_scrape_status = 'success' WHERE source_code = 'OPENSANCTIONS_PEP'`,
    { cnt: added + updated }
  );

  return { downloaded: entries.length, added, updated, error: null };
}

// ── 2. Wikidata SPARQL PEP Scraper ────────────────────────────────────────────
async function scrapeWikidata() {
  log('Querying Wikidata SPARQL for political figures...');

  // SPARQL query: heads of state, prime ministers, ministers, parliamentarians
  const sparql = `
    SELECT DISTINCT ?person ?personLabel ?dob ?genderLabel ?countryLabel ?positionLabel ?partyLabel WHERE {
      ?person wdt:P31 wd:Q5 .
      ?person p:P39 ?posStmt .
      ?posStmt ps:P39 ?position .
      ?position wdt:P279* wd:Q82955 .
      OPTIONAL { ?person wdt:P569 ?dob }
      OPTIONAL { ?person wdt:P21 ?gender }
      OPTIONAL { ?person wdt:P27 ?country }
      OPTIONAL { ?posStmt pq:P102 ?party }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    LIMIT 50000
  `;

  let entries = [];
  try {
    const resp = await axios.get('https://query.wikidata.org/sparql', {
      params: { query: sparql, format: 'json' },
      headers: { 'User-Agent': 'SanctionsEngine/1.0 (compliance screening tool)' },
      timeout: 60000,
    });

    const bindings = resp.data?.results?.bindings || [];
    log(`Wikidata returned ${bindings.length.toLocaleString()} results`);

    const seen = new Set();
    for (const b of bindings) {
      const wikidataId = b.person?.value?.split('/').pop();
      if (!wikidataId || seen.has(wikidataId)) continue;
      seen.add(wikidataId);

      const name = b.personLabel?.value;
      if (!name || name.startsWith('Q')) continue; // skip unlabelled

      entries.push({
        external_id:    `WD-${wikidataId}`,
        schema_type:    'Person',
        primary_name:   name,
        aliases:        null,
        birth_date:     b.dob?.value ? b.dob.value.substring(0, 10) : null,
        countries:      b.countryLabel?.value || null,
        nationality:    b.countryLabel?.value || null,
        position:       b.positionLabel?.value || null,
        political_party: b.partyLabel?.value || null,
        gender:         b.genderLabel?.value || null,
        dataset:        'Wikidata Political Figures',
        programme_ids:  null,
        identifiers:    wikidataId,
        addresses:      null,
        emails:         null,
        phones:         null,
        remarks:        null,
        wikidata_id:    wikidataId,
        first_seen:     null,
        last_seen:      new Date().toISOString().substring(0, 10),
        last_change:    null,
      });
    }
  } catch (err) {
    log(`Wikidata query failed: ${err.message}`, 'error');
    return { downloaded: 0, added: 0, updated: 0, error: err.message };
  }

  log(`Parsed ${entries.length.toLocaleString()} Wikidata PEPs. Bulk inserting...`);
  const { added, updated } = await bulkUpsertPEPs('WIKIDATA_PEP', entries);
  log(`Wikidata PEP: ${added} added, ${updated} updated`);

  await query(
    `UPDATE pep_sources SET total_entries = @cnt, last_scraped = GETDATE(), last_scrape_status = 'success' WHERE source_code = 'WIKIDATA_PEP'`,
    { cnt: added + updated }
  );

  return { downloaded: entries.length, added, updated, error: null };
}

// ── 3. ICIJ Offshore Leaks Scraper ────────────────────────────────────────────
async function scrapeICIJ() {
  log('Downloading ICIJ Offshore Leaks officers data...');

  // ICIJ provides bulk CSV downloads
  const url = 'https://offshoreleaks-data.icij.org/offshoreleaks/csv/csv_officers.zip';
  let entries = [];

  try {
    const resp = await axios.get(url, {
      timeout: 120000,
      responseType: 'arraybuffer',
    });

    // Unzip in memory
    const AdmZip = require('adm-zip');
    const zip    = new AdmZip(Buffer.from(resp.data));
    const csvEntry = zip.getEntries().find(e => e.entryName.endsWith('.csv'));
    if (!csvEntry) throw new Error('No CSV found in ICIJ zip');

    const csvText = csvEntry.getData().toString('utf8');
    const lines   = csvText.split('\n');
    const headers = lines[0].replace(/"/g, '').split(',').map(h => h.trim().toLowerCase());

    log(`Parsing ${lines.length.toLocaleString()} ICIJ officer records...`);

    const seen = new Set();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
      const row  = {};
      headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });

      const name = row['name'] || row['node_id'];
      if (!name || seen.has(name.toUpperCase())) continue;
      seen.add(name.toUpperCase());

      const nodeId    = row['node_id'] || row['id'] || '';
      const countries = row['countries'] || row['country_codes'] || '';
      const sourceId  = row['sourceID'] || row['source_id'] || '';

      const adverseLink = `ICIJ Offshore Leaks | Node: ${nodeId} | Source: ${sourceId} | Countries: ${countries}`;

      entries.push({
        external_id:    `ICIJ-${nodeId || i}`,
        schema_type:    'Person',
        primary_name:   name.substring(0, 500),
        aliases:        null,
        birth_date:     null,
        countries:      countries.substring(0, 500) || null,
        nationality:    countries.substring(0, 500) || null,
        position:       row['role'] || null,
        political_party: null,
        gender:         null,
        dataset:        `ICIJ Offshore Leaks (${sourceId})`,
        programme_ids:  null,
        identifiers:    nodeId || null,
        addresses:      null,
        emails:         null,
        phones:         null,
        remarks:        adverseLink,
        wikidata_id:    null,
        first_seen:     null,
        last_seen:      new Date().toISOString().substring(0, 10),
        last_change:    null,
      });
    }
  } catch (err) {
    // adm-zip may not be installed — try installing it
    if (err.message.includes("Cannot find module 'adm-zip'")) {
      log('Installing adm-zip...', 'info');
      const { execSync } = require('child_process');
      try {
        execSync('cd /home/ubuntu/sanctions/backend && npm install adm-zip --no-save', { stdio: 'pipe' });
        return scrapeICIJ(); // retry
      } catch (e2) {
        log(`Failed to install adm-zip: ${e2.message}`, 'error');
      }
    }
    log(`ICIJ download failed: ${err.message}`, 'error');
    return { downloaded: 0, added: 0, updated: 0, error: err.message };
  }

  log(`Parsed ${entries.length.toLocaleString()} ICIJ officers. Bulk inserting...`);
  const { added, updated } = await bulkUpsertPEPs('ICIJ_OFFSHORE', entries);
  log(`ICIJ: ${added} added, ${updated} updated`);

  await query(
    `UPDATE pep_sources SET total_entries = @cnt, last_scraped = GETDATE(), last_scrape_status = 'success' WHERE source_code = 'ICIJ_OFFSHORE'`,
    { cnt: added + updated }
  );

  return { downloaded: entries.length, added, updated, error: null };
}

// ── Full PEP run ──────────────────────────────────────────────────────────────
async function runFullPEPLoad() {
  if (_runStatus.status === 'running') {
    return { error: 'PEP load already running' };
  }

  _runStatus = {
    status:      'running',
    startedAt:   new Date().toISOString(),
    completedAt: null,
    results:     [],
    recentLogs:  [],
  };

  log('Starting full PEP data load from all sources');

  const sources = [
    { name: 'OpenSanctions PEP', fn: scrapeOpenSanctionsPEP },
    { name: 'Wikidata',          fn: scrapeWikidata },
    { name: 'ICIJ Offshore',     fn: scrapeICIJ },
  ];

  for (const src of sources) {
    log(`[${src.name}] Starting...`);
    const t0 = Date.now();
    try {
      const result = await src.fn();
      _runStatus.results.push({
        source:   src.name,
        status:   result.error ? 'error' : 'success',
        ...result,
        duration: Date.now() - t0,
      });
      log(`[${src.name}] Done: ${result.added} added, ${result.updated} updated`);
    } catch (err) {
      log(`[${src.name}] Failed: ${err.message}`, 'error');
      _runStatus.results.push({
        source: src.name, status: 'error', error: err.message,
        downloaded: 0, added: 0, updated: 0, duration: Date.now() - t0,
      });
    }
  }

  // Step 1: Reload pep_entries_mem (SQL Server In-Memory OLTP) from pep_entries (disk)
  log('Reloading pep_entries_mem (SQL Server In-Memory table) from pep_entries...');
  try {
    const memResult = await loadPEPIntoMemTable((msg) => log(msg));
    log(`pep_entries_mem reloaded: ${memResult.rowCount.toLocaleString()} rows in ${(memResult.durationMs/1000).toFixed(1)}s`);
  } catch (err) {
    log(`pep_entries_mem reload failed: ${err.message}`, 'error');
  }
  // Step 2: Reload Node.js RAM index from pep_entries_mem
  log('Reloading PEP RAM index from pep_entries_mem...');
  try {
    const { count } = await reloadPEPs();
    log(`PEP RAM index ready: ${count.toLocaleString()} entries`);
  } catch (err) {
    log(`PEP RAM reload failed: ${err.message}`, 'error');
  }

  _runStatus.status      = 'complete';
  _runStatus.completedAt = new Date().toISOString();

  const total = _runStatus.results.reduce((s, r) => s + (r.added || 0), 0);
  log(`Full PEP load complete. Total added: ${total.toLocaleString()}`);

  return _runStatus;
}

function getPEPRunStatus() { return _runStatus; }

module.exports = { runFullPEPLoad, getPEPRunStatus, scrapeOpenSanctionsPEP, scrapeWikidata, scrapeICIJ };
