const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, customer_id = '', asset_type = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (customer_id) { where += ' AND a.customer_id = @customer_id'; params.customer_id = parseInt(customer_id); }
    if (asset_type) { where += ' AND a.asset_type = @asset_type'; params.asset_type = asset_type; }
    
    const count = await query(`SELECT COUNT(*) as total FROM core_assets a ${where}`, params);
    const result = await query(`
      SELECT a.*, c.full_name as customer_name, c.customer_id as customer_ref
      FROM core_assets a
      LEFT JOIN core_customers c ON a.customer_id = c.id
      ${where}
      ORDER BY a.created_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `, params);
    
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT a.*, c.full_name as customer_name, c.customer_id as customer_ref
      FROM core_assets a LEFT JOIN core_customers c ON a.customer_id = c.id
      WHERE a.id = @id
    `, { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customer_id, account_id, asset_type, asset_name, principal_amount, currency, interest_rate, origination_date, maturity_date, collateral_type, collateral_value, collateral_description } = req.body;
    const assetId = `ASSET-${String(Date.now()).slice(-6)}`;
    
    const result = await query(`
      INSERT INTO core_assets (asset_id, customer_id, account_id, asset_type, asset_name, principal_amount, outstanding_balance, currency, interest_rate, origination_date, maturity_date, collateral_type, collateral_value, collateral_description, status, risk_classification)
      OUTPUT INSERTED.*
      VALUES (@asset_id, @customer_id, @account_id, @asset_type, @asset_name, @principal_amount, @principal_amount, @currency, @interest_rate, @origination_date, @maturity_date, @collateral_type, @collateral_value, @collateral_description, 'ACTIVE', 'STANDARD')
    `, { asset_id: assetId, customer_id: parseInt(customer_id), account_id: account_id ? parseInt(account_id) : null, asset_type, asset_name, principal_amount: parseFloat(principal_amount), currency: currency || 'USD', interest_rate: parseFloat(interest_rate) || 0, origination_date, maturity_date, collateral_type, collateral_value: parseFloat(collateral_value) || 0, collateral_description });
    
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { asset_name, outstanding_balance, interest_rate, status, risk_classification, sanctions_flag } = req.body;
    const result = await query(`
      UPDATE core_assets SET asset_name = @asset_name, outstanding_balance = @outstanding_balance,
        interest_rate = @interest_rate, status = @status, risk_classification = @risk_classification,
        sanctions_flag = @sanctions_flag, updated_at = GETDATE()
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), asset_name, outstanding_balance: parseFloat(outstanding_balance) || 0, interest_rate: parseFloat(interest_rate) || 0, status, risk_classification, sanctions_flag: sanctions_flag ? 1 : 0 });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE core_assets SET status = 'CLOSED', updated_at = GETDATE() WHERE id = @id`, { id: parseInt(req.params.id) });
    res.json({ message: 'Asset closed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const result = await query(`
      SELECT COUNT(*) as total, SUM(outstanding_balance) as total_outstanding,
        SUM(CASE WHEN asset_type = 'TRADE_FINANCE' THEN outstanding_balance ELSE 0 END) as trade_finance_total,
        SUM(CASE WHEN sanctions_flag = 1 THEN 1 ELSE 0 END) as sanctioned_assets
      FROM core_assets WHERE status = 'ACTIVE'
    `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
