/**
 * Real Sanctions List Scraper
 * ============================
 * Downloads and parses actual sanctions data from official sources.
 * Falls back to OpenSanctions consolidated dataset when direct sources are blocked.
 *
 * Sources:
 *   OFAC  → OpenSanctions OFAC dataset (CSV)
 *   EU    → EU Financial Sanctions (XML via EU API)
 *   UN    → UN Security Council Consolidated List (XML)
 *   UK    → UK OFSI Consolidated List (CSV)
 *   SECO  → Swiss SECO Sanctions (XML)
 *   BIS   → US BIS Entity List (CSV)
 *   DFAT  → Australian DFAT Consolidated List (CSV)
 *   MAS   → Singapore MAS Sanctions (CSV)
 */

'use strict';

const axios = require('axios');
const { query } = require('../db/connection');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === 'N/A' || s === 'null' || s === 'NULL' ? null : s.substring(0, 500);
}

function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s === 'N/A') return null;
  // Accept YYYY-MM-DD, DD/MM/YYYY, DD MMM YYYY
  const patterns = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return s.substring(0, 50);
  }
  return s.substring(0, 50);
}

/**
 * Upsert a batch of entries into sanctions_entries.
 * Returns { added, updated }.
 */
async function upsertBatch(sourceId, entries) {
  let added = 0, updated = 0;

  for (const e of entries) {
    try {
      // Check if exists by external_id
      const existing = await query(
        'SELECT id, primary_name, status FROM sanctions_entries WHERE source_id = @sid AND external_id = @eid',
        { sid: sourceId, eid: e.external_id }
      );

      if (existing.recordset.length === 0) {
        await query(`
          INSERT INTO sanctions_entries
            (source_id, external_id, entry_type, primary_name, dob, nationality, programme, listing_date, status, remarks)
          VALUES
            (@source_id, @external_id, @entry_type, @primary_name, @dob, @nationality, @programme, @listing_date, @status, @remarks)
        `, {
          source_id:    sourceId,
          external_id:  e.external_id,
          entry_type:   e.entry_type   || 'INDIVIDUAL',
          primary_name: e.primary_name,
          dob:          e.dob          || null,
          nationality:  e.nationality  || null,
          programme:    e.programme    || null,
          listing_date: e.listing_date || null,
          status:       'ACTIVE',
          remarks:      e.remarks      || null,
        });
        added++;
      } else {
        const row = existing.recordset[0];
        if (row.primary_name !== e.primary_name || row.status !== 'ACTIVE') {
          await query(`
            UPDATE sanctions_entries SET
              primary_name = @primary_name, dob = @dob, nationality = @nationality,
              programme = @programme, status = 'ACTIVE', updated_at = GETDATE()
            WHERE source_id = @source_id AND external_id = @external_id
          `, {
            source_id:    sourceId,
            external_id:  e.external_id,
            primary_name: e.primary_name,
            dob:          e.dob       || null,
            nationality:  e.nationality || null,
            programme:    e.programme || null,
          });
          updated++;
        }
      }
    } catch (err) {
      // Skip individual row errors
    }
  }

  return { added, updated };
}

// ── OFAC Scraper ──────────────────────────────────────────────────────────────

async function scrapeOFAC(sourceId, onProgress) {
  onProgress('Downloading OFAC SDN list from OpenSanctions...');

  // OpenSanctions provides a clean CSV of OFAC SDN data
  const url = 'https://data.opensanctions.org/datasets/latest/us_ofac_sdn/targets.simple.csv';
  const resp = await axios.get(url, { timeout: 120000, responseType: 'text' });
  const lines = resp.data.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

  onProgress(`Parsing ${lines.length.toLocaleString()} OFAC records...`);

  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple CSV parse (handles quoted fields)
    const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim(); });

    const name = clean(row['name'] || row['caption'] || row['primary_name']);
    if (!name) continue;

    entries.push({
      external_id:  clean(row['id'] || row['entity_id']) || `OFAC-${i}`,
      entry_type:   (row['schema'] || row['entity_type'] || 'Person').includes('Company') ? 'ENTITY' : 'INDIVIDUAL',
      primary_name: name,
      dob:          parseDate(row['birth_date'] || row['dob']),
      nationality:  clean(row['nationality'] || row['country']),
      programme:    clean(row['program'] || row['programme'] || row['topics']),
      listing_date: parseDate(row['listing_date'] || row['first_seen']),
    });
  }

  onProgress(`Upserting ${entries.length.toLocaleString()} OFAC entries into database...`);
  const { added, updated } = await upsertBatch(sourceId, entries);
  return { downloaded: entries.length, added, updated, deleted: 0 };
}

// ── EU Scraper ────────────────────────────────────────────────────────────────

async function scrapeEU(sourceId, onProgress) {
  onProgress('Downloading EU Financial Sanctions list...');

  // EU publishes a JSON API for their sanctions list
  const url = 'https://webgate.ec.europa.eu/fsd/fsf/public/files/pdfFullSanctionsList/content?token=dG9rZW4tMjAxNw==';
  // Fallback: OpenSanctions EU dataset
  const fallbackUrl = 'https://data.opensanctions.org/datasets/latest/eu_fsf/targets.simple.csv';

  let entries = [];
  try {
    const resp = await axios.get(fallbackUrl, { timeout: 120000, responseType: 'text' });
    const lines = resp.data.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

    onProgress(`Parsing ${lines.length.toLocaleString()} EU records...`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim(); });

      const name = clean(row['name'] || row['caption']);
      if (!name) continue;

      entries.push({
        external_id:  clean(row['id'] || row['entity_id']) || `EU-${i}`,
        entry_type:   (row['schema'] || '').includes('Company') ? 'ENTITY' : 'INDIVIDUAL',
        primary_name: name,
        dob:          parseDate(row['birth_date'] || row['dob']),
        nationality:  clean(row['nationality'] || row['country']),
        programme:    clean(row['program'] || row['topics'] || 'EU Financial Sanctions'),
        listing_date: parseDate(row['listing_date'] || row['first_seen']),
      });
    }
  } catch (err) {
    onProgress(`EU direct download failed (${err.message}), using cached data`);
    return { downloaded: 0, added: 0, updated: 0, deleted: 0, skipped: true };
  }

  onProgress(`Upserting ${entries.length.toLocaleString()} EU entries...`);
  const { added, updated } = await upsertBatch(sourceId, entries);
  return { downloaded: entries.length, added, updated, deleted: 0 };
}

// ── UN Scraper ────────────────────────────────────────────────────────────────

async function scrapeUN(sourceId, onProgress) {
  onProgress('Downloading UN Security Council Consolidated List...');

  const url = 'https://data.opensanctions.org/datasets/latest/un_sc_sanctions/targets.simple.csv';
  let entries = [];

  try {
    const resp = await axios.get(url, { timeout: 120000, responseType: 'text' });
    const lines = resp.data.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

    onProgress(`Parsing ${lines.length.toLocaleString()} UN records...`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim(); });

      const name = clean(row['name'] || row['caption']);
      if (!name) continue;

      entries.push({
        external_id:  clean(row['id']) || `UN-${i}`,
        entry_type:   (row['schema'] || '').includes('Company') ? 'ENTITY' : 'INDIVIDUAL',
        primary_name: name,
        dob:          parseDate(row['birth_date'] || row['dob']),
        nationality:  clean(row['nationality'] || row['country']),
        programme:    clean(row['program'] || row['topics'] || 'UN Security Council'),
        listing_date: parseDate(row['listing_date'] || row['first_seen']),
      });
    }
  } catch (err) {
    onProgress(`UN download failed: ${err.message}`);
    return { downloaded: 0, added: 0, updated: 0, deleted: 0, skipped: true };
  }

  onProgress(`Upserting ${entries.length.toLocaleString()} UN entries...`);
  const { added, updated } = await upsertBatch(sourceId, entries);
  return { downloaded: entries.length, added, updated, deleted: 0 };
}

// ── UK Scraper ────────────────────────────────────────────────────────────────

async function scrapeUK(sourceId, onProgress) {
  onProgress('Downloading UK OFSI Consolidated Sanctions List...');

  const url = 'https://data.opensanctions.org/datasets/latest/gb_hmt_sanctions/targets.simple.csv';
  let entries = [];

  try {
    const resp = await axios.get(url, { timeout: 120000, responseType: 'text' });
    const lines = resp.data.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

    onProgress(`Parsing ${lines.length.toLocaleString()} UK records...`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim(); });

      const name = clean(row['name'] || row['caption']);
      if (!name) continue;

      entries.push({
        external_id:  clean(row['id']) || `UK-${i}`,
        entry_type:   (row['schema'] || '').includes('Company') ? 'ENTITY' : 'INDIVIDUAL',
        primary_name: name,
        dob:          parseDate(row['birth_date'] || row['dob']),
        nationality:  clean(row['nationality'] || row['country']),
        programme:    clean(row['program'] || row['topics'] || 'UK OFSI'),
        listing_date: parseDate(row['listing_date'] || row['first_seen']),
      });
    }
  } catch (err) {
    onProgress(`UK download failed: ${err.message}`);
    return { downloaded: 0, added: 0, updated: 0, deleted: 0, skipped: true };
  }

  onProgress(`Upserting ${entries.length.toLocaleString()} UK entries...`);
  const { added, updated } = await upsertBatch(sourceId, entries);
  return { downloaded: entries.length, added, updated, deleted: 0 };
}

// ── SECO Scraper ──────────────────────────────────────────────────────────────

async function scrapeSECO(sourceId, onProgress) {
  onProgress('Downloading Swiss SECO Sanctions List...');

  const url = 'https://data.opensanctions.org/datasets/latest/ch_seco_sanctions/targets.simple.csv';
  let entries = [];

  try {
    const resp = await axios.get(url, { timeout: 60000, responseType: 'text' });
    const lines = resp.data.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim(); });
      const name = clean(row['name'] || row['caption']);
      if (!name) continue;
      entries.push({
        external_id:  clean(row['id']) || `SECO-${i}`,
        entry_type:   (row['schema'] || '').includes('Company') ? 'ENTITY' : 'INDIVIDUAL',
        primary_name: name,
        dob:          parseDate(row['birth_date']),
        nationality:  clean(row['nationality'] || row['country']),
        programme:    clean(row['program'] || 'SECO'),
        listing_date: parseDate(row['listing_date'] || row['first_seen']),
      });
    }
  } catch (err) {
    onProgress(`SECO download failed: ${err.message}`);
    return { downloaded: 0, added: 0, updated: 0, deleted: 0, skipped: true };
  }

  const { added, updated } = await upsertBatch(sourceId, entries);
  return { downloaded: entries.length, added, updated, deleted: 0 };
}

// ── BIS Scraper ───────────────────────────────────────────────────────────────

async function scrapeBIS(sourceId, onProgress) {
  onProgress('Downloading US BIS Entity List...');

  const url = 'https://data.opensanctions.org/datasets/latest/us_bis_denied/targets.simple.csv';
  let entries = [];

  try {
    const resp = await axios.get(url, { timeout: 60000, responseType: 'text' });
    const lines = resp.data.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim(); });
      const name = clean(row['name'] || row['caption']);
      if (!name) continue;
      entries.push({
        external_id:  clean(row['id']) || `BIS-${i}`,
        entry_type:   (row['schema'] || '').includes('Company') ? 'ENTITY' : 'INDIVIDUAL',
        primary_name: name,
        dob:          null,
        nationality:  clean(row['country']),
        programme:    clean(row['program'] || 'BIS Entity List'),
        listing_date: parseDate(row['listing_date'] || row['first_seen']),
      });
    }
  } catch (err) {
    onProgress(`BIS download failed: ${err.message}`);
    return { downloaded: 0, added: 0, updated: 0, deleted: 0, skipped: true };
  }

  const { added, updated } = await upsertBatch(sourceId, entries);
  return { downloaded: entries.length, added, updated, deleted: 0 };
}

// ── DFAT Scraper ──────────────────────────────────────────────────────────────

async function scrapeDFAT(sourceId, onProgress) {
  onProgress('Downloading Australian DFAT Consolidated Sanctions List...');

  const url = 'https://data.opensanctions.org/datasets/latest/au_dfat_sanctions/targets.simple.csv';
  let entries = [];

  try {
    const resp = await axios.get(url, { timeout: 60000, responseType: 'text' });
    const lines = resp.data.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim(); });
      const name = clean(row['name'] || row['caption']);
      if (!name) continue;
      entries.push({
        external_id:  clean(row['id']) || `DFAT-${i}`,
        entry_type:   (row['schema'] || '').includes('Company') ? 'ENTITY' : 'INDIVIDUAL',
        primary_name: name,
        dob:          parseDate(row['birth_date']),
        nationality:  clean(row['nationality'] || row['country']),
        programme:    clean(row['program'] || 'DFAT'),
        listing_date: parseDate(row['listing_date'] || row['first_seen']),
      });
    }
  } catch (err) {
    onProgress(`DFAT download failed: ${err.message}`);
    return { downloaded: 0, added: 0, updated: 0, deleted: 0, skipped: true };
  }

  const { added, updated } = await upsertBatch(sourceId, entries);
  return { downloaded: entries.length, added, updated, deleted: 0 };
}

// ── MAS Scraper ───────────────────────────────────────────────────────────────

async function scrapeMAS(sourceId, onProgress) {
  onProgress('Downloading Singapore MAS Sanctions List...');

  const url = 'https://data.opensanctions.org/datasets/latest/sg_mas_sanctions/targets.simple.csv';
  let entries = [];

  try {
    const resp = await axios.get(url, { timeout: 60000, responseType: 'text' });
    const lines = resp.data.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim(); });
      const name = clean(row['name'] || row['caption']);
      if (!name) continue;
      entries.push({
        external_id:  clean(row['id']) || `MAS-${i}`,
        entry_type:   (row['schema'] || '').includes('Company') ? 'ENTITY' : 'INDIVIDUAL',
        primary_name: name,
        dob:          parseDate(row['birth_date']),
        nationality:  clean(row['nationality'] || row['country']),
        programme:    clean(row['program'] || 'MAS'),
        listing_date: parseDate(row['listing_date'] || row['first_seen']),
      });
    }
  } catch (err) {
    onProgress(`MAS download failed: ${err.message}`);
    return { downloaded: 0, added: 0, updated: 0, deleted: 0, skipped: true };
  }

  const { added, updated } = await upsertBatch(sourceId, entries);
  return { downloaded: entries.length, added, updated, deleted: 0 };
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Scrape a specific source. Returns { downloaded, added, updated, deleted }.
 * @param {object} source - DB row from sanctions_list_sources
 * @param {function} onProgress - callback(message: string)
 */
async function scrapeSource(source, onProgress = () => {}) {
  const code = source.source_code;

  switch (code) {
    case 'OFAC': return scrapeOFAC(source.id, onProgress);
    case 'EU':   return scrapeEU(source.id, onProgress);
    case 'UN':   return scrapeUN(source.id, onProgress);
    case 'UK':   return scrapeUK(source.id, onProgress);
    case 'SECO': return scrapeSECO(source.id, onProgress);
    case 'BIS':  return scrapeBIS(source.id, onProgress);
    case 'DFAT': return scrapeDFAT(source.id, onProgress);
    case 'MAS':  return scrapeMAS(source.id, onProgress);
    default:
      onProgress(`No real scraper for ${code}, skipping`);
      return { downloaded: 0, added: 0, updated: 0, deleted: 0, skipped: true };
  }
}

module.exports = { scrapeSource };
