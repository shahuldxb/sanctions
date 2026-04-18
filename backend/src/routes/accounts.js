const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, customer_id = '', account_type = '', status = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (customer_id) { where += ' AND a.customer_id = @customer_id'; params.customer_id = parseInt(customer_id); }
    if (account_type) { where += ' AND UPPER(a.account_type) = UPPER(@account_type)'; params.account_type = account_type; }
    if (status) { where += ' AND UPPER(a.status) = UPPER(@status)'; params.status = status; }
    
    const count = await query(`SELECT COUNT(*) as total FROM core_accounts a ${where}`, params);
    const result = await query(`
      SELECT a.*, c.full_name as customer_name, c.customer_id as customer_ref
      FROM core_accounts a
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
      SELECT a.*, c.full_name as customer_name, c.customer_id as customer_ref, c.email as customer_email
      FROM core_accounts a
      LEFT JOIN core_customers c ON a.customer_id = c.id
      WHERE a.id = @id
    `, { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    
    const transactions = await query(`
      SELECT TOP 20 * FROM core_transactions WHERE account_id = @id ORDER BY transaction_date DESC
    `, { id: parseInt(req.params.id) });
    
    res.json({ ...result.recordset[0], recent_transactions: transactions.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customer_id, account_type, account_category, currency, interest_rate, credit_limit, branch_code, branch_name } = req.body;
    const accNum = `ACC-${String(Date.now()).slice(-8)}`;
    
    const result = await query(`
      INSERT INTO core_accounts (account_number, customer_id, account_type, account_category, currency, balance, available_balance, interest_rate, credit_limit, status, branch_code, branch_name)
      OUTPUT INSERTED.*
      VALUES (@account_number, @customer_id, @account_type, @account_category, @currency, 0, 0, @interest_rate, @credit_limit, 'ACTIVE', @branch_code, @branch_name)
    `, { account_number: accNum, customer_id: parseInt(customer_id), account_type, account_category: account_category || 'LIABILITY', currency: currency || 'USD', interest_rate: parseFloat(interest_rate) || 0, credit_limit: parseFloat(credit_limit) || 0, branch_code, branch_name });
    
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { status, freeze_reason, interest_rate, credit_limit, sanctions_hold, sanctions_hold_reason } = req.body;
    const result = await query(`
      UPDATE core_accounts SET
        status = @status, freeze_reason = @freeze_reason, interest_rate = @interest_rate,
        credit_limit = @credit_limit, sanctions_hold = @sanctions_hold,
        sanctions_hold_reason = @sanctions_hold_reason, updated_at = GETDATE()
      OUTPUT INSERTED.*
      WHERE id = @id
    `, { id: parseInt(req.params.id), status, freeze_reason, interest_rate: parseFloat(interest_rate) || 0, credit_limit: parseFloat(credit_limit) || 0, sanctions_hold: sanctions_hold ? 1 : 0, sanctions_hold_reason });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE core_accounts SET status = 'CLOSED', updated_at = GETDATE() WHERE id = @id`, { id: parseInt(req.params.id) });
    res.json({ message: 'Account closed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total_accounts,
        SUM(CASE WHEN UPPER(status) = 'ACTIVE' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN UPPER(status) = 'FROZEN' THEN 1 ELSE 0 END) as frozen,
        SUM(CASE WHEN sanctions_hold = 1 THEN 1 ELSE 0 END) as sanctions_hold,
        SUM(CASE WHEN currency = 'USD' THEN balance ELSE 0 END) as total_usd_balance,
        COUNT(DISTINCT customer_id) as unique_customers
      FROM core_accounts
    `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
