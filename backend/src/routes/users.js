const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', role = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (search) { where += ' AND (full_name LIKE @search OR username LIKE @search OR email LIKE @search)'; params.search = `%${search}%`; }
    if (role) { where += ' AND role = @role'; params.role = role; }
    const count = await query(`SELECT COUNT(*) as total FROM app_users ${where}`, params);
    const result = await query(`SELECT * FROM app_users ${where} ORDER BY full_name OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM app_users WHERE id = @id', { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { username, full_name, email, role, department } = req.body;
    const result = await query(`
      INSERT INTO app_users (username, full_name, email, role, department, is_active)
      OUTPUT INSERTED.*
      VALUES (@username, @full_name, @email, @role, @department, 1)
    `, { username, full_name, email, role: role || 'ANALYST', department });
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { full_name, email, role, department, is_active } = req.body;
    const result = await query(`
      UPDATE app_users SET full_name = @full_name, email = @email, role = @role, department = @department, is_active = @is_active
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), full_name, email, role, department, is_active: is_active ? 1 : 0 });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('UPDATE app_users SET is_active = 0 WHERE id = @id', { id: parseInt(req.params.id) });
    res.json({ message: 'User deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
