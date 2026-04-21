/**
 * Wikidata SPARQL PEP Loader
 * ==========================
 * Queries the Wikidata SPARQL endpoint for politically exposed persons
 * (heads of state, ministers, MPs, judges, senior officials) and merges
 * them into pep_entries with source = 'WIKIDATA'.
 *
 * Runs in background — status exposed via getWikidataStatus().
 */
'use strict';
const axios  = require('axios');
const { query } = require('../db/connection');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT      = 'SanctionsEngine/1.0 (compliance screening; contact@example.com)';

// ── Status ────────────────────────────────────────────────────────────────────
let _status = {
  status:      'idle',   // idle | running | completed | error
  startedAt:   null,
  completedAt: null,
  progress:    { loaded: 0, total: 0, pct: 0 },
  stats:       { added: 0, updated: 0, total: 0 },
  error:       null,
  logs:        [],
};

function log(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), msg, level };
  console.log(`[WikidataLoader] ${msg}`);
  _status.logs.push(entry);
  if (_status.logs.length > 200) _status.logs.shift();
}

function getWikidataStatus() {
  return { ..._status, logs: _status.logs.slice(-60) };
}

// ── SPARQL queries — one per PEP category ─────────────────────────────────────
// Each query returns: person, personLabel, positionLabel, countryLabel, dob, genderLabel, wikidataId
const SPARQL_QUERIES = [
  {
    label: 'Heads of State & Government',
    sparql: `
SELECT DISTINCT ?person ?personLabel ?positionLabel ?countryLabel ?dob ?genderLabel WHERE {
  ?person wdt:P31 wd:Q5 .
  ?person p:P39 ?posStmt .
  ?posStmt ps:P39 ?position .
  ?position wdt:P279* wd:Q48352 .
  OPTIONAL { ?posStmt pq:P17 ?country . }
  OPTIONAL { ?person wdt:P569 ?dob . }
  OPTIONAL { ?person wdt:P21 ?gender . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 10000`
  },
  {
    label: 'Government Ministers',
    sparql: `
SELECT DISTINCT ?person ?personLabel ?positionLabel ?countryLabel ?dob ?genderLabel WHERE {
  ?person wdt:P31 wd:Q5 .
  ?person p:P39 ?posStmt .
  ?posStmt ps:P39 ?position .
  ?position wdt:P279* wd:Q83307 .
  OPTIONAL { ?posStmt pq:P17 ?country . }
  OPTIONAL { ?person wdt:P569 ?dob . }
  OPTIONAL { ?person wdt:P21 ?gender . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 15000`
  },
  {
    label: 'Members of Parliament',
    sparql: `
SELECT DISTINCT ?person ?personLabel ?positionLabel ?countryLabel ?dob ?genderLabel WHERE {
  ?person wdt:P31 wd:Q5 .
  ?person p:P39 ?posStmt .
  ?posStmt ps:P39 ?position .
  ?position wdt:P279* wd:Q486839 .
  OPTIONAL { ?posStmt pq:P17 ?country . }
  OPTIONAL { ?person wdt:P569 ?dob . }
  OPTIONAL { ?person wdt:P21 ?gender . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 20000`
  },
  {
    label: 'Judges & Senior Judiciary',
    sparql: `
SELECT DISTINCT ?person ?personLabel ?positionLabel ?countryLabel ?dob ?genderLabel WHERE {
  ?person wdt:P31 wd:Q5 .
  ?person p:P39 ?posStmt .
  ?posStmt ps:P39 ?position .
  ?position wdt:P279* wd:Q16533 .
  OPTIONAL { ?posStmt pq:P17 ?country . }
  OPTIONAL { ?person wdt:P569 ?dob . }
  OPTIONAL { ?person wdt:P21 ?gender . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 10000`
  },
  {
    label: 'Ambassadors & Diplomats',
    sparql: `
SELECT DISTINCT ?person ?personLabel ?positionLabel ?countryLabel ?dob ?genderLabel WHERE {
  ?person wdt:P31 wd:Q5 .
  ?person p:P39 ?posStmt .
  ?posStmt ps:P39 ?position .
  ?position wdt:P279* wd:Q121998 .
  OPTIONAL { ?posStmt pq:P17 ?country . }
  OPTIONAL { ?person wdt:P569 ?dob . }
  OPTIONAL { ?person wdt:P21 ?gender . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 10000`
  },
];

// ── SPARQL fetch with retry ───────────────────────────────────────────────────
async function runSparql(sparql, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await axios.get(SPARQL_ENDPOINT, {
        params: { query: sparql, format: 'json' },
        headers: {
          'Accept':     'application/sparql-results+json',
          'User-Agent': USER_AGENT,
        },
        timeout: 120000,
      });
      const bindings = resp.data?.results?.bindings || [];
      log(`✓ ${label}: ${bindings.length.toLocaleString()} results`);
      return bindings;
    } catch (err) {
      if (attempt < 3) {
        log(`⚠ ${label} attempt ${attempt} failed: ${err.message} — retrying in 10s`, 'warn');
        await new Promise(r => setTimeout(r, 10000));
      } else {
        log(`✗ ${label} failed after 3 attempts: ${err.message}`, 'error');
        return [];
      }
    }
  }
  return [];
}

// ── Merge batch into pep_entries ──────────────────────────────────────────────
async function mergeBatch(rows) {
  if (!rows.length) return { added: 0, updated: 0 };

  // Build VALUES list
  const vals = rows.map(r => {
    const eid   = r.wikidataId.replace(/'/g, "''");
    const name  = (r.name || '').replace(/'/g, "''").substring(0, 500);
    const pos   = (r.position || '').replace(/'/g, "''").substring(0, 500);
    const ctry  = (r.country || '').replace(/'/g, "''").substring(0, 200);
    const dob   = (r.dob || '').replace(/'/g, "''").substring(0, 50);
    const gen   = (r.gender || '').replace(/'/g, "''").substring(0, 20);
    const wdid  = (r.wikidataId || '').replace(/'/g, "''").substring(0, 100);
    const ds    = 'Wikidata SPARQL';
    const today = new Date().toISOString().split('T')[0];
    return `('${eid}','WIKIDATA','Person','${name}','','${dob}','${ctry}','','${pos}','','${gen}','${ds}','','','','','','','','${wdid}','','${today}','${today}','${today}','ACTIVE')`;
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
ON target.external_id = source.external_id AND target.source = 'WIKIDATA'
WHEN MATCHED AND target.primary_name <> source.primary_name THEN
  UPDATE SET
    primary_name = source.primary_name,
    position     = source.position,
    countries    = source.countries,
    last_change  = source.last_change,
    updated_at   = GETDATE()
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
  const added   = result.rowsAffected?.[0] || 0;
  return { added, updated: 0 };
}

// ── Main load function ────────────────────────────────────────────────────────
async function loadWikidata() {
  if (_status.status === 'running') {
    throw new Error('Wikidata loader is already running');
  }

  _status = {
    status:      'running',
    startedAt:   new Date().toISOString(),
    completedAt: null,
    progress:    { loaded: 0, total: SPARQL_QUERIES.length, pct: 0 },
    stats:       { added: 0, updated: 0, total: 0 },
    error:       null,
    logs:        [],
  };

  log(`🚀 Starting Wikidata SPARQL load — ${SPARQL_QUERIES.length} queries`);

  try {
    // First pass: collect all rows
    const allRows = [];
    for (let i = 0; i < SPARQL_QUERIES.length; i++) {
      const q = SPARQL_QUERIES[i];
      log(`📡 Query ${i + 1}/${SPARQL_QUERIES.length}: ${q.label}`);
      const bindings = await runSparql(q.sparql, q.label);

      // Map SPARQL bindings to row objects
      for (const b of bindings) {
        const wikidataId = b.person?.value?.replace('http://www.wikidata.org/entity/', '') || '';
        if (!wikidataId) continue;
        allRows.push({
          wikidataId,
          name:     b.personLabel?.value   || '',
          position: b.positionLabel?.value || '',
          country:  b.countryLabel?.value  || '',
          dob:      b.dob?.value?.split('T')[0] || '',
          gender:   b.genderLabel?.value   || '',
        });
      }

      _status.progress = {
        loaded: i + 1,
        total:  SPARQL_QUERIES.length,
        pct:    Math.round(((i + 1) / SPARQL_QUERIES.length) * 100),
      };

      // Polite delay between queries to respect Wikidata rate limits
      if (i < SPARQL_QUERIES.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Deduplicate by wikidataId
    const seen = new Set();
    const unique = allRows.filter(r => {
      if (!r.wikidataId || seen.has(r.wikidataId)) return false;
      seen.add(r.wikidataId);
      return true;
    });
    log(`📊 Collected ${unique.length.toLocaleString()} unique PEPs from Wikidata`);

    // Merge in batches of 500
    const BATCH = 500;
    let totalAdded = 0;
    for (let i = 0; i < unique.length; i += BATCH) {
      const batch = unique.slice(i, i + BATCH);
      const { added } = await mergeBatch(batch);
      totalAdded += added;
      _status.stats.added   = totalAdded;
      _status.stats.total   = unique.length;
      _status.progress.pct  = Math.round(((i + BATCH) / unique.length) * 100);
      if (i % 5000 === 0) {
        log(`💾 Merged ${Math.min(i + BATCH, unique.length).toLocaleString()} / ${unique.length.toLocaleString()} rows...`);
      }
    }

    _status.stats.total   = unique.length;
    _status.status        = 'completed';
    _status.completedAt   = new Date().toISOString();
    _status.progress.pct  = 100;
    log(`✅ Wikidata load complete — ${unique.length.toLocaleString()} entries merged (${totalAdded.toLocaleString()} new/updated)`);

    // Trigger RAM index rebuild
    try {
      const { reloadPEPs } = require('./pepEngine');
      reloadPEPs().catch(e => log(`⚠ RAM reload error: ${e.message}`, 'warn'));
      log('🔄 RAM index rebuild triggered');
    } catch (_) {}

  } catch (err) {
    _status.status = 'error';
    _status.error  = err.message;
    log(`❌ Wikidata load failed: ${err.message}`, 'error');
    throw err;
  }
}

module.exports = { loadWikidata, getWikidataStatus };
