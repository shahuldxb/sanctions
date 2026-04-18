const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, search = '', rule_type = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (search) { where += ' AND (rule_name LIKE @search OR rule_code LIKE @search)'; params.search = `%${search}%`; }
    if (rule_type) { where += ' AND rule_type = @rule_type'; params.rule_type = rule_type; }
    const count = await query(`SELECT COUNT(*) as total FROM screening_rules ${where}`, params);
    const result = await query(`SELECT * FROM screening_rules ${where} ORDER BY priority ASC OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM screening_rules WHERE id = @id', { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { rule_code, rule_name, rule_type, description, match_threshold, auto_block_threshold, review_threshold, applies_to, lists_to_check, priority } = req.body;
    const result = await query(`
      INSERT INTO screening_rules (rule_code, rule_name, rule_type, description, match_threshold, auto_block_threshold, review_threshold, applies_to, lists_to_check, is_active, priority)
      OUTPUT INSERTED.*
      VALUES (@rule_code, @rule_name, @rule_type, @description, @match_threshold, @auto_block_threshold, @review_threshold, @applies_to, @lists_to_check, 1, @priority)
    `, { rule_code, rule_name, rule_type, description, match_threshold: parseFloat(match_threshold) || 80, auto_block_threshold: parseFloat(auto_block_threshold) || 90, review_threshold: parseFloat(review_threshold) || 70, applies_to: JSON.stringify(applies_to || []), lists_to_check: JSON.stringify(lists_to_check || []), priority: parseInt(priority) || 100 });
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { rule_name, description, match_threshold, auto_block_threshold, review_threshold, is_active, priority } = req.body;
    const result = await query(`
      UPDATE screening_rules SET rule_name = @rule_name, description = @description,
        match_threshold = @match_threshold, auto_block_threshold = @auto_block_threshold,
        review_threshold = @review_threshold, is_active = @is_active, priority = @priority, updated_at = GETDATE()
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), rule_name, description, match_threshold: parseFloat(match_threshold) || 80, auto_block_threshold: parseFloat(auto_block_threshold) || 90, review_threshold: parseFloat(review_threshold) || 70, is_active: is_active ? 1 : 0, priority: parseInt(priority) || 100 });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE screening_rules SET is_active = 0, updated_at = GETDATE() WHERE id = @id`, { id: parseInt(req.params.id) });
    res.json({ message: 'Rule deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
