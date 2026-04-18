const express = require('express');
const router = express.Router();
const { query, sql, getPool } = require('../db/connection');

// In-memory engine sync helper — fires after every DB write
function syncEngine(action, rowOrId) {
  try {
    const eng = require('../services/sanctionsEngine');
    if (!eng.getStatus().loaded) return; // engine not ready yet, skip
    if (action === 'upsert' && rowOrId) eng.upsertEntry(rowOrId);
    else if (action === 'remove' && rowOrId) eng.removeEntry(rowOrId);
    else if (action === 'patch' && rowOrId) eng.patchEntry(rowOrId.id, rowOrId.fields);
  } catch (e) {
    console.error('[sanctions route] engine sync error:', e.message);
  }
}

// GET all sanctions entries (root path - maps to /entries)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', source = '', source_code = '', entry_type = '', status = '', programme = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = 'WHERE 1=1';
    const params = {};
    const srcFilter = source_code || source;
    if (search) { whereClause += ` AND (e.primary_name LIKE @search OR e.external_id LIKE @search OR e.programme LIKE @search)`; params.search = `%${search}%`; }
    if (srcFilter) { whereClause += ` AND s.source_code = @source`; params.source = srcFilter; }
    if (entry_type) { whereClause += ` AND e.entry_type = @entry_type`; params.entry_type = entry_type; }
    if (status) { whereClause += ` AND e.status = @status`; params.status = status; }
    if (programme) { whereClause += ` AND e.programme LIKE @programme`; params.programme = `%${programme}%`; }
    const countResult = await query(`SELECT COUNT(DISTINCT e.id) as total FROM sanctions_entries e LEFT JOIN sanctions_list_sources s ON e.source_id = s.id ${whereClause}`, params);
    const result = await query(`SELECT DISTINCT e.*, s.source_code, s.source_name FROM sanctions_entries e LEFT JOIN sanctions_list_sources s ON e.source_id = s.id ${whereClause} ORDER BY e.id DESC OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`, params);
    res.json({ data: result.recordset, total: countResult.recordset[0].total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET all sanctions list sources
router.get('/sources', async (req, res) => {
  try {
    const result = await query('SELECT * FROM sanctions_list_sources ORDER BY source_code');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single source
router.get('/sources/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM sanctions_list_sources WHERE id = @id', { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create source
router.post('/sources', async (req, res) => {
  try {
    const { source_code, source_name, source_url, download_url, jurisdiction, currency_scope, scrape_interval_hours, description } = req.body;
    const result = await query(`
      INSERT INTO sanctions_list_sources (source_code, source_name, source_url, download_url, jurisdiction, currency_scope, scrape_interval_hours, description)
      OUTPUT INSERTED.*
      VALUES (@source_code, @source_name, @source_url, @download_url, @jurisdiction, @currency_scope, @scrape_interval_hours, @description)
    `, { source_code, source_name, source_url, download_url, jurisdiction, currency_scope, scrape_interval_hours: parseInt(scrape_interval_hours) || 3, description });
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update source
router.put('/sources/:id', async (req, res) => {
  try {
    const { source_name, source_url, download_url, jurisdiction, currency_scope, scrape_interval_hours, description, is_active } = req.body;
    const result = await query(`
      UPDATE sanctions_list_sources SET
        source_name = @source_name, source_url = @source_url, download_url = @download_url,
        jurisdiction = @jurisdiction, currency_scope = @currency_scope,
        scrape_interval_hours = @scrape_interval_hours, description = @description,
        is_active = @is_active, updated_at = GETDATE()
      OUTPUT INSERTED.*
      WHERE id = @id
    `, { id: parseInt(req.params.id), source_name, source_url, download_url, jurisdiction, currency_scope, scrape_interval_hours: parseInt(scrape_interval_hours) || 3, description, is_active: is_active ? 1 : 0 });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE source
router.delete('/sources/:id', async (req, res) => {
  try {
    await query('UPDATE sanctions_list_sources SET is_active = 0 WHERE id = @id', { id: parseInt(req.params.id) });
    res.json({ message: 'Deactivated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all entries with pagination and filtering
router.get('/entries', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', source = '', entry_type = '', status = 'ACTIVE', programme = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let whereClause = 'WHERE 1=1';
    const params = {};
    
    if (search) {
      whereClause += ` AND (e.primary_name LIKE @search OR e.external_id LIKE @search OR a.alias_name LIKE @search)`;
      params.search = `%${search}%`;
    }
    if (source) {
      whereClause += ` AND s.source_code = @source`;
      params.source = source;
    }
    if (entry_type) {
      whereClause += ` AND e.entry_type = @entry_type`;
      params.entry_type = entry_type;
    }
    if (status) {
      whereClause += ` AND e.status = @status`;
      params.status = status;
    }
    if (programme) {
      whereClause += ` AND e.programme LIKE @programme`;
      params.programme = `%${programme}%`;
    }
    
    const countResult = await query(`
      SELECT COUNT(DISTINCT e.id) as total
      FROM sanctions_entries e
      LEFT JOIN sanctions_list_sources s ON e.source_id = s.id
      LEFT JOIN sanctions_aliases a ON e.id = a.entry_id
      ${whereClause}
    `, params);
    
    const result = await query(`
      SELECT DISTINCT e.*, s.source_code, s.source_name
      FROM sanctions_entries e
      LEFT JOIN sanctions_list_sources s ON e.source_id = s.id
      LEFT JOIN sanctions_aliases a ON e.id = a.entry_id
      ${whereClause}
      ORDER BY e.id DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `, params);
    
    res.json({
      data: result.recordset,
      total: countResult.recordset[0].total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single entry with full details
router.get('/entries/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entry = await query(`
      SELECT e.*, s.source_code, s.source_name 
      FROM sanctions_entries e
      LEFT JOIN sanctions_list_sources s ON e.source_id = s.id
      WHERE e.id = @id
    `, { id });
    
    if (!entry.recordset.length) return res.status(404).json({ error: 'Not found' });
    
    const aliases = await query('SELECT * FROM sanctions_aliases WHERE entry_id = @id', { id });
    const addresses = await query('SELECT * FROM sanctions_addresses WHERE entry_id = @id', { id });
    const identifiers = await query('SELECT * FROM sanctions_identifiers WHERE entry_id = @id', { id });
    
    res.json({
      ...entry.recordset[0],
      aliases: aliases.recordset,
      addresses: addresses.recordset,
      identifiers: identifiers.recordset
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create entry
router.post('/entries', async (req, res) => {
  try {
    const { source_id, external_id, entry_type, primary_name, dob, nationality, programme, listing_date, status, remarks, aliases, addresses } = req.body;
    
    const result = await query(`
      INSERT INTO sanctions_entries (source_id, external_id, entry_type, primary_name, dob, nationality, programme, listing_date, status, remarks)
      OUTPUT INSERTED.*
      VALUES (@source_id, @external_id, @entry_type, @primary_name, @dob, @nationality, @programme, @listing_date, @status, @remarks)
    `, { source_id: parseInt(source_id), external_id, entry_type, primary_name, dob, nationality, programme, listing_date, status: status || 'ACTIVE', remarks });
    
    const newEntry = result.recordset[0];

    // Insert aliases if provided
    if (aliases && aliases.length) {
      for (const alias of aliases) {
        await query(`
          INSERT INTO sanctions_aliases (entry_id, alias_name, alias_type, alias_quality)
          VALUES (@entry_id, @alias_name, @alias_type, @alias_quality)
        `, { entry_id: newEntry.id, alias_name: alias.alias_name, alias_type: alias.alias_type || 'AKA', alias_quality: alias.alias_quality || 'STRONG' });
      }
    }

    // Sync in-memory engine: fetch source_code for the new entry
    try {
      const srcRow = await query('SELECT source_code, source_name FROM sanctions_list_sources WHERE id = @id', { id: newEntry.source_id });
      const src = srcRow.recordset[0] || {};
      syncEngine('upsert', { ...newEntry, source_code: src.source_code, source_name: src.source_name });
    } catch (_) {}

    res.status(201).json(newEntry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update entry
router.put('/entries/:id', async (req, res) => {
  try {
    const { primary_name, dob, nationality, programme, listing_date, status, remarks } = req.body;
    const result = await query(`
      UPDATE sanctions_entries SET
        primary_name = @primary_name, dob = @dob, nationality = @nationality,
        programme = @programme, listing_date = @listing_date, status = @status,
        remarks = @remarks, updated_at = GETDATE()
      OUTPUT INSERTED.*
      WHERE id = @id
    `, { id: parseInt(req.params.id), primary_name, dob, nationality, programme, listing_date, status, remarks });

    const updated = result.recordset[0];
    // Sync in-memory engine with the updated row
    try {
      const srcRow = await query('SELECT source_code, source_name FROM sanctions_list_sources WHERE id = @id', { id: updated.source_id });
      const src = srcRow.recordset[0] || {};
      syncEngine('upsert', { ...updated, source_code: src.source_code, source_name: src.source_name });
    } catch (_) {}

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE entry (soft delete — marks as DELISTED, removes from screening index)
router.delete('/entries/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await query(`UPDATE sanctions_entries SET status = 'DELISTED', delisted_date = GETDATE(), updated_at = GETDATE() WHERE id = @id`, { id });
    // Remove from in-memory engine immediately
    syncEngine('remove', id);
    res.json({ message: 'Entry delisted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET aliases for entry
router.get('/entries/:id/aliases', async (req, res) => {
  try {
    const result = await query('SELECT * FROM sanctions_aliases WHERE entry_id = @id', { id: parseInt(req.params.id) });
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add alias
router.post('/entries/:id/aliases', async (req, res) => {
  try {
    const { alias_name, alias_type, alias_quality } = req.body;
    const result = await query(`
      INSERT INTO sanctions_aliases (entry_id, alias_name, alias_type, alias_quality)
      OUTPUT INSERTED.*
      VALUES (@entry_id, @alias_name, @alias_type, @alias_quality)
    `, { entry_id: parseInt(req.params.id), alias_name, alias_type: alias_type || 'AKA', alias_quality: alias_quality || 'STRONG' });
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE alias
router.delete('/aliases/:id', async (req, res) => {
  try {
    await query('DELETE FROM sanctions_aliases WHERE id = @id', { id: parseInt(req.params.id) });
    res.json({ message: 'Alias deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET change log
router.get('/changes', async (req, res) => {
  try {
    const { page = 1, limit = 50, source = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let whereClause = 'WHERE 1=1';
    const params = {};
    if (source) {
      whereClause += ' AND s.source_code = @source';
      params.source = source;
    }
    
    const result = await query(`
      SELECT c.*, s.source_code, s.source_name, e.primary_name
      FROM sanctions_change_log c
      LEFT JOIN sanctions_list_sources s ON c.source_id = s.id
      LEFT JOIN sanctions_entries e ON c.entry_id = e.id
      ${whereClause}
      ORDER BY c.processed_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `, params);
    
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET scrape history
router.get('/scrape-history', async (req, res) => {
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

// GET statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM sanctions_entries WHERE status = 'ACTIVE') as total_active,
        (SELECT COUNT(*) FROM sanctions_entries WHERE status = 'DELISTED') as total_delisted,
        (SELECT COUNT(*) FROM sanctions_entries WHERE entry_type = 'INDIVIDUAL') as total_individuals,
        (SELECT COUNT(*) FROM sanctions_entries WHERE entry_type = 'ENTITY') as total_entities,
        (SELECT COUNT(*) FROM sanctions_entries WHERE entry_type = 'VESSEL') as total_vessels,
        (SELECT COUNT(*) FROM sanctions_list_sources WHERE is_active = 1) as active_sources,
        (SELECT COUNT(*) FROM sanctions_aliases) as total_aliases,
        (SELECT TOP 1 last_scraped FROM sanctions_list_sources WHERE last_scraped IS NOT NULL ORDER BY last_scraped DESC) as last_updated
    `);
    
    const bySource = await query(`
      SELECT s.source_code, s.source_name, COUNT(e.id) as entry_count, s.last_scraped, s.last_scrape_status
      FROM sanctions_list_sources s
      LEFT JOIN sanctions_entries e ON s.id = e.source_id AND e.status = 'ACTIVE'
      GROUP BY s.id, s.source_code, s.source_name, s.last_scraped, s.last_scrape_status
      ORDER BY entry_count DESC
    `);
    
    res.json({ ...stats.recordset[0], bySource: bySource.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
