const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { search = '', is_sanctioned = '', risk_rating = '', page = 1, limit = 200 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (search) { where += ' AND (country_name LIKE @search OR country_code LIKE @search)'; params.search = `%${search}%`; }
    if (is_sanctioned !== '') { where += ' AND is_sanctioned = @is_sanctioned'; params.is_sanctioned = parseInt(is_sanctioned); }
    if (risk_rating) { where += ' AND risk_rating = @risk_rating'; params.risk_rating = risk_rating; }
    const count = await query(`SELECT COUNT(*) as total FROM countries ${where}`, params);
    const result = await query(`SELECT * FROM countries ${where} ORDER BY country_name OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM countries WHERE id = @id', { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { country_code, country_name, iso_alpha3, region, is_sanctioned, is_high_risk, is_fatf_blacklist, is_fatf_greylist, sanctions_programmes, risk_rating, risk_notes } = req.body;
    const result = await query(`
      INSERT INTO countries (country_code, country_name, iso_alpha3, region, is_sanctioned, is_high_risk, is_fatf_blacklist, is_fatf_greylist, sanctions_programmes, risk_rating, risk_notes)
      OUTPUT INSERTED.*
      VALUES (@country_code, @country_name, @iso_alpha3, @region, @is_sanctioned, @is_high_risk, @is_fatf_blacklist, @is_fatf_greylist, @sanctions_programmes, @risk_rating, @risk_notes)
    `, { country_code, country_name, iso_alpha3, region, is_sanctioned: is_sanctioned ? 1 : 0, is_high_risk: is_high_risk ? 1 : 0, is_fatf_blacklist: is_fatf_blacklist ? 1 : 0, is_fatf_greylist: is_fatf_greylist ? 1 : 0, sanctions_programmes, risk_rating: risk_rating || 'LOW', risk_notes });
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { is_sanctioned, is_high_risk, is_fatf_blacklist, is_fatf_greylist, sanctions_programmes, risk_rating, risk_notes } = req.body;
    const result = await query(`
      UPDATE countries SET is_sanctioned = @is_sanctioned, is_high_risk = @is_high_risk,
        is_fatf_blacklist = @is_fatf_blacklist, is_fatf_greylist = @is_fatf_greylist,
        sanctions_programmes = @sanctions_programmes, risk_rating = @risk_rating, risk_notes = @risk_notes, updated_at = GETDATE()
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), is_sanctioned: is_sanctioned ? 1 : 0, is_high_risk: is_high_risk ? 1 : 0, is_fatf_blacklist: is_fatf_blacklist ? 1 : 0, is_fatf_greylist: is_fatf_greylist ? 1 : 0, sanctions_programmes, risk_rating, risk_notes });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM countries WHERE id = @id', { id: parseInt(req.params.id) });
    res.json({ message: 'Country deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
