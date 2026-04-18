const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, entity_type = '', action = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (entity_type) { where += ' AND entity_type = @entity_type'; params.entity_type = entity_type; }
    if (action) { where += ' AND action = @action'; params.action = action; }
    
    const count = await query(`SELECT COUNT(*) as total FROM audit_log ${where}`, params);
    const result = await query(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { event_type, entity_type, entity_id, action, performed_by, description, old_values, new_values } = req.body;
    const result = await query(`
      INSERT INTO audit_log (event_type, entity_type, entity_id, action, performed_by, description, old_values, new_values)
      OUTPUT INSERTED.*
      VALUES (@event_type, @entity_type, @entity_id, @action, @performed_by, @description, @old_values, @new_values)
    `, { event_type, entity_type, entity_id, action, performed_by: performed_by || 'System', description, old_values: old_values ? JSON.stringify(old_values) : null, new_values: new_values ? JSON.stringify(new_values) : null });
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
