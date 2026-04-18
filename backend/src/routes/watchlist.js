const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, watchlist_type = '', risk_level = '', search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (watchlist_type) { where += ' AND watchlist_type = @watchlist_type'; params.watchlist_type = watchlist_type; }
    if (risk_level) { where += ' AND risk_level = @risk_level'; params.risk_level = risk_level; }
    if (search) { where += ' AND entity_name LIKE @search'; params.search = `%${search}%`; }
    
    const count = await query(`SELECT COUNT(*) as total FROM internal_watchlist ${where}`, params);
    const result = await query(`SELECT * FROM internal_watchlist ${where} ORDER BY created_at DESC OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM internal_watchlist WHERE id = @id', { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { watchlist_type, entity_type, entity_name, aliases, dob, nationality, country, reason, source, risk_level, added_by, review_date } = req.body;
    const result = await query(`
      INSERT INTO internal_watchlist (watchlist_type, entity_type, entity_name, aliases, dob, nationality, country, reason, source, risk_level, added_by, review_date, status)
      OUTPUT INSERTED.*
      VALUES (@watchlist_type, @entity_type, @entity_name, @aliases, @dob, @nationality, @country, @reason, @source, @risk_level, @added_by, @review_date, 'ACTIVE')
    `, { watchlist_type, entity_type, entity_name, aliases, dob, nationality, country, reason, source, risk_level: risk_level || 'MEDIUM', added_by: added_by || 'System', review_date });
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { entity_name, reason, risk_level, status, review_date } = req.body;
    const result = await query(`
      UPDATE internal_watchlist SET entity_name = @entity_name, reason = @reason,
        risk_level = @risk_level, status = @status, review_date = @review_date, updated_at = GETDATE()
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), entity_name, reason, risk_level, status, review_date });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE internal_watchlist SET status = 'INACTIVE', updated_at = GETDATE() WHERE id = @id`, { id: parseInt(req.params.id) });
    res.json({ message: 'Removed from watchlist' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
