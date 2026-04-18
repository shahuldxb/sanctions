const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', is_sanctioned = '', risk_rating = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (search) { where += ' AND (vessel_name LIKE @search OR imo_number LIKE @search OR owner_name LIKE @search)'; params.search = `%${search}%`; }
    if (is_sanctioned !== '') { where += ' AND is_sanctioned = @is_sanctioned'; params.is_sanctioned = parseInt(is_sanctioned); }
    if (risk_rating) { where += ' AND risk_rating = @risk_rating'; params.risk_rating = risk_rating; }
    
    const count = await query(`SELECT COUNT(*) as total FROM vessels ${where}`, params);
    const result = await query(`SELECT * FROM vessels ${where} ORDER BY created_at DESC OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM vessels WHERE id = @id', { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { imo_number, vessel_name, vessel_type, flag_state, flag_country_code, gross_tonnage, year_built, owner_name, operator_name, call_sign, mmsi, risk_rating, notes } = req.body;
    const result = await query(`
      INSERT INTO vessels (imo_number, vessel_name, vessel_type, flag_state, flag_country_code, gross_tonnage, year_built, owner_name, operator_name, call_sign, mmsi, is_sanctioned, risk_rating, notes)
      OUTPUT INSERTED.*
      VALUES (@imo_number, @vessel_name, @vessel_type, @flag_state, @flag_country_code, @gross_tonnage, @year_built, @owner_name, @operator_name, @call_sign, @mmsi, 0, @risk_rating, @notes)
    `, { imo_number, vessel_name, vessel_type, flag_state, flag_country_code, gross_tonnage: parseFloat(gross_tonnage) || 0, year_built: parseInt(year_built) || null, owner_name, operator_name, call_sign, mmsi, risk_rating: risk_rating || 'LOW', notes });
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { vessel_name, flag_state, owner_name, operator_name, is_sanctioned, risk_rating, notes, last_known_port } = req.body;
    const result = await query(`
      UPDATE vessels SET vessel_name = @vessel_name, flag_state = @flag_state, owner_name = @owner_name,
        operator_name = @operator_name, is_sanctioned = @is_sanctioned, risk_rating = @risk_rating,
        notes = @notes, last_known_port = @last_known_port, updated_at = GETDATE()
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), vessel_name, flag_state, owner_name, operator_name, is_sanctioned: is_sanctioned ? 1 : 0, risk_rating, notes, last_known_port });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM vessels WHERE id = @id', { id: parseInt(req.params.id) });
    res.json({ message: 'Vessel deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
