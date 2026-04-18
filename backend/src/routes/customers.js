const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', customer_type = '', sanctions_status = '', risk_rating = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (search) { where += ' AND (full_name LIKE @search OR customer_id LIKE @search OR email LIKE @search)'; params.search = `%${search}%`; }
    if (customer_type) { where += ' AND customer_type = @customer_type'; params.customer_type = customer_type; }
    if (sanctions_status) { where += ' AND sanctions_status = @sanctions_status'; params.sanctions_status = sanctions_status; }
    if (risk_rating) { where += ' AND risk_rating = @risk_rating'; params.risk_rating = risk_rating; }
    
    const count = await query(`SELECT COUNT(*) as total FROM core_customers ${where}`, params);
    const result = await query(`
      SELECT * FROM core_customers ${where}
      ORDER BY created_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `, params);
    
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const customer = await query('SELECT * FROM core_customers WHERE id = @id', { id: parseInt(req.params.id) });
    if (!customer.recordset.length) return res.status(404).json({ error: 'Not found' });
    
    const accounts = await query('SELECT * FROM core_accounts WHERE customer_id = @id', { id: parseInt(req.params.id) });
    const assets = await query('SELECT * FROM core_assets WHERE customer_id = @id', { id: parseInt(req.params.id) });
    const liabilities = await query('SELECT * FROM core_liabilities WHERE customer_id = @id', { id: parseInt(req.params.id) });
    const corporate = await query('SELECT * FROM core_corporate_customers WHERE customer_id = @id', { id: parseInt(req.params.id) });
    
    res.json({ 
      ...customer.recordset[0], 
      accounts: accounts.recordset,
      assets: assets.recordset,
      liabilities: liabilities.recordset,
      corporate: corporate.recordset[0] || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customer_type, title, first_name, last_name, full_name, date_of_birth, gender, nationality, country_of_residence, id_type, id_number, email, phone, mobile, address_line1, city, country, occupation, annual_income, kyc_status, risk_rating, pep_status, segment, relationship_manager } = req.body;
    const customerId = `CUST-${String(Date.now()).slice(-6)}`;
    
    const result = await query(`
      INSERT INTO core_customers (customer_id, customer_type, title, first_name, last_name, full_name, date_of_birth, gender, nationality, country_of_residence, id_type, id_number, email, phone, mobile, address_line1, city, country, occupation, annual_income, kyc_status, risk_rating, pep_status, segment, relationship_manager, sanctions_status)
      OUTPUT INSERTED.*
      VALUES (@customer_id, @customer_type, @title, @first_name, @last_name, @full_name, @date_of_birth, @gender, @nationality, @country_of_residence, @id_type, @id_number, @email, @phone, @mobile, @address_line1, @city, @country, @occupation, @annual_income, @kyc_status, @risk_rating, @pep_status, @segment, @relationship_manager, 'CLEAR')
    `, { customer_id: customerId, customer_type, title, first_name, last_name, full_name: full_name || `${first_name || ''} ${last_name || ''}`.trim(), date_of_birth, gender, nationality, country_of_residence, id_type, id_number, email, phone, mobile, address_line1, city, country, occupation, annual_income: parseFloat(annual_income) || 0, kyc_status: kyc_status || 'PENDING', risk_rating: risk_rating || 'LOW', pep_status: pep_status ? 1 : 0, segment, relationship_manager });
    
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { full_name, email, phone, mobile, address_line1, city, country, occupation, annual_income, kyc_status, risk_rating, pep_status, sanctions_status, segment, relationship_manager, status } = req.body;
    const result = await query(`
      UPDATE core_customers SET
        full_name = @full_name, email = @email, phone = @phone, mobile = @mobile,
        address_line1 = @address_line1, city = @city, country = @country,
        occupation = @occupation, annual_income = @annual_income, kyc_status = @kyc_status,
        risk_rating = @risk_rating, pep_status = @pep_status, sanctions_status = @sanctions_status,
        segment = @segment, relationship_manager = @relationship_manager, status = @status,
        updated_at = GETDATE()
      OUTPUT INSERTED.*
      WHERE id = @id
    `, { id: parseInt(req.params.id), full_name, email, phone, mobile, address_line1, city, country, occupation, annual_income: parseFloat(annual_income) || 0, kyc_status, risk_rating, pep_status: pep_status ? 1 : 0, sanctions_status, segment, relationship_manager, status: status || 'ACTIVE' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE core_customers SET status = 'INACTIVE', updated_at = GETDATE() WHERE id = @id`, { id: parseInt(req.params.id) });
    res.json({ message: 'Customer deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Screen customer
router.post('/:id/screen', async (req, res) => {
  try {
    const customer = await query('SELECT * FROM core_customers WHERE id = @id', { id: parseInt(req.params.id) });
    if (!customer.recordset.length) return res.status(404).json({ error: 'Not found' });
    const c = customer.recordset[0];
    
    // Redirect to screening endpoint
    const axios = require('axios');
    const response = await axios.post('http://localhost:5000/api/screening/screen', {
      subjects: [{ subject_name: c.full_name, subject_type: c.customer_type === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'ENTITY', dob: c.date_of_birth, nationality: c.nationality }],
      source_system: 'CORE_BANKING',
      requested_by: 'Customer Screen'
    });
    
    // Update customer last screened
    await query(`UPDATE core_customers SET last_screened = GETDATE(), sanctions_status = @status, updated_at = GETDATE() WHERE id = @id`, 
      { id: parseInt(req.params.id), status: response.data.overallResult === 'CLEAR' ? 'CLEAR' : 'FLAGGED' });
    
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN customer_type = 'INDIVIDUAL' THEN 1 ELSE 0 END) as individuals,
        SUM(CASE WHEN customer_type = 'CORPORATE' THEN 1 ELSE 0 END) as corporates,
        SUM(CASE WHEN sanctions_status = 'FLAGGED' THEN 1 ELSE 0 END) as flagged,
        SUM(CASE WHEN sanctions_status = 'BLOCKED' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN risk_rating = 'HIGH' THEN 1 ELSE 0 END) as high_risk,
        SUM(CASE WHEN pep_status = 1 THEN 1 ELSE 0 END) as pep_customers,
        SUM(CASE WHEN kyc_status = 'PENDING' THEN 1 ELSE 0 END) as pending_kyc
      FROM core_customers WHERE status = 'ACTIVE'
    `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
