const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, customer_id = '', liability_type = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (customer_id) { where += ' AND l.customer_id = @customer_id'; params.customer_id = parseInt(customer_id); }
    if (liability_type) { where += ' AND l.liability_type = @liability_type'; params.liability_type = liability_type; }
    
    const count = await query(`SELECT COUNT(*) as total FROM core_liabilities l ${where}`, params);
    const result = await query(`
      SELECT l.*, c.full_name as customer_name, c.customer_id as customer_ref
      FROM core_liabilities l LEFT JOIN core_customers c ON l.customer_id = c.id
      ${where} ORDER BY l.created_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT l.*, c.full_name as customer_name FROM core_liabilities l
      LEFT JOIN core_customers c ON l.customer_id = c.id WHERE l.id = @id
    `, { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { customer_id, account_id, liability_type, liability_name, principal_amount, currency, interest_rate, origination_date, maturity_date } = req.body;
    const liabId = `LIAB-${String(Date.now()).slice(-6)}`;
    const result = await query(`
      INSERT INTO core_liabilities (liability_id, customer_id, account_id, liability_type, liability_name, principal_amount, outstanding_balance, currency, interest_rate, origination_date, maturity_date, status)
      OUTPUT INSERTED.*
      VALUES (@liability_id, @customer_id, @account_id, @liability_type, @liability_name, @principal_amount, @principal_amount, @currency, @interest_rate, @origination_date, @maturity_date, 'ACTIVE')
    `, { liability_id: liabId, customer_id: parseInt(customer_id), account_id: account_id ? parseInt(account_id) : null, liability_type, liability_name, principal_amount: parseFloat(principal_amount), currency: currency || 'USD', interest_rate: parseFloat(interest_rate) || 0, origination_date, maturity_date });
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { liability_name, outstanding_balance, interest_rate, status, sanctions_flag } = req.body;
    const result = await query(`
      UPDATE core_liabilities SET liability_name = @liability_name, outstanding_balance = @outstanding_balance,
        interest_rate = @interest_rate, status = @status, sanctions_flag = @sanctions_flag, updated_at = GETDATE()
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), liability_name, outstanding_balance: parseFloat(outstanding_balance) || 0, interest_rate: parseFloat(interest_rate) || 0, status, sanctions_flag: sanctions_flag ? 1 : 0 });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE core_liabilities SET status = 'CLOSED', updated_at = GETDATE() WHERE id = @id`, { id: parseInt(req.params.id) });
    res.json({ message: 'Liability closed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
