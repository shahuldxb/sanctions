const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, status = '', sanctions_status = '', lc_type = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (status) { where += ' AND l.status = @status'; params.status = status; }
    if (sanctions_status) { where += ' AND l.sanctions_status = @sanctions_status'; params.sanctions_status = sanctions_status; }
    if (lc_type) { where += ' AND l.lc_type = @lc_type'; params.lc_type = lc_type; }
    
    const count = await query(`SELECT COUNT(*) as total FROM trade_finance_lc l ${where}`, params);
    const result = await query(`
      SELECT l.*, c.full_name as applicant_full_name
      FROM trade_finance_lc l
      LEFT JOIN core_customers c ON l.applicant_id = c.id
      ${where} ORDER BY l.created_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT l.*, c.full_name as applicant_full_name, c.email as applicant_email
      FROM trade_finance_lc l
      LEFT JOIN core_customers c ON l.applicant_id = c.id
      WHERE l.id = @id
    `, { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { lc_type, applicant_id, applicant_name, beneficiary_name, beneficiary_country, advising_bank, confirming_bank, issuing_bank, amount, currency, expiry_date, latest_shipment_date, port_of_loading, port_of_discharge, transshipment_ports, goods_description, hs_codes, vessel_name, imo_number, incoterms } = req.body;
    const lcNumber = `LC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    
    const result = await query(`
      INSERT INTO trade_finance_lc (lc_number, lc_type, applicant_id, applicant_name, beneficiary_name, beneficiary_country, advising_bank, confirming_bank, issuing_bank, amount, currency, expiry_date, latest_shipment_date, port_of_loading, port_of_discharge, transshipment_ports, goods_description, hs_codes, vessel_name, imo_number, incoterms, status, sanctions_status)
      OUTPUT INSERTED.*
      VALUES (@lc_number, @lc_type, @applicant_id, @applicant_name, @beneficiary_name, @beneficiary_country, @advising_bank, @confirming_bank, @issuing_bank, @amount, @currency, @expiry_date, @latest_shipment_date, @port_of_loading, @port_of_discharge, @transshipment_ports, @goods_description, @hs_codes, @vessel_name, @imo_number, @incoterms, 'DRAFT', 'PENDING')
    `, { lc_number: lcNumber, lc_type, applicant_id: applicant_id ? parseInt(applicant_id) : null, applicant_name, beneficiary_name, beneficiary_country, advising_bank, confirming_bank, issuing_bank, amount: parseFloat(amount) || 0, currency: currency || 'USD', expiry_date, latest_shipment_date, port_of_loading, port_of_discharge, transshipment_ports, goods_description, hs_codes, vessel_name, imo_number, incoterms });
    
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { status, sanctions_status, vessel_name, imo_number, goods_description } = req.body;
    const result = await query(`
      UPDATE trade_finance_lc SET status = @status, sanctions_status = @sanctions_status,
        vessel_name = @vessel_name, imo_number = @imo_number, goods_description = @goods_description, updated_at = GETDATE()
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), status, sanctions_status, vessel_name, imo_number, goods_description });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE trade_finance_lc SET status = 'CANCELLED', updated_at = GETDATE() WHERE id = @id`, { id: parseInt(req.params.id) });
    res.json({ message: 'LC cancelled' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Screen LC
router.post('/:id/screen', async (req, res) => {
  try {
    const lc = await query('SELECT * FROM trade_finance_lc WHERE id = @id', { id: parseInt(req.params.id) });
    if (!lc.recordset.length) return res.status(404).json({ error: 'Not found' });
    const l = lc.recordset[0];
    
    const subjects = [
      { subject_name: l.applicant_name, subject_type: 'ENTITY', subject_role: 'APPLICANT' },
      { subject_name: l.beneficiary_name, subject_type: 'ENTITY', subject_role: 'BENEFICIARY' },
    ];
    if (l.vessel_name) subjects.push({ subject_name: l.vessel_name, subject_type: 'VESSEL', subject_role: 'VESSEL' });
    if (l.advising_bank) subjects.push({ subject_name: l.advising_bank, subject_type: 'ENTITY', subject_role: 'ADVISING_BANK' });
    
    const axios = require('axios');
    const response = await axios.post('http://localhost:5000/api/screening/screen', {
      subjects,
      source_system: 'TRADE_FINANCE',
      requested_by: 'LC Screen'
    });
    
    const newStatus = response.data.overallResult === 'BLOCKED' ? 'BLOCKED' : 
                      response.data.overallResult === 'POTENTIAL_MATCH' ? 'FLAGGED' : 'CLEAR';
    
    await query(`UPDATE trade_finance_lc SET sanctions_status = @status, screening_request_id = @req_id, updated_at = GETDATE() WHERE id = @id`, 
      { id: parseInt(req.params.id), status: newStatus, req_id: response.data.screeningRequestId });
    
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const result = await query(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN sanctions_status = 'FLAGGED' THEN 1 ELSE 0 END) as flagged,
        SUM(CASE WHEN sanctions_status = 'BLOCKED' THEN 1 ELSE 0 END) as blocked,
        SUM(amount) as total_value
      FROM trade_finance_lc
    `);
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
