const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, account_id = '', sanctions_result = '', status = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (account_id) { where += ' AND t.account_id = @account_id'; params.account_id = parseInt(account_id); }
    if (sanctions_result) { where += ' AND t.sanctions_result = @sanctions_result'; params.sanctions_result = sanctions_result; }
    if (status) { where += ' AND t.status = @status'; params.status = status; }
    
    const count = await query(`SELECT COUNT(*) as total FROM core_transactions t ${where}`, params);
    const result = await query(`
      SELECT t.*, a.account_number, c.full_name as customer_name
      FROM core_transactions t
      LEFT JOIN core_accounts a ON t.account_id = a.id
      LEFT JOIN core_customers c ON a.customer_id = c.id
      ${where} ORDER BY t.transaction_date DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT t.*, a.account_number, c.full_name as customer_name
      FROM core_transactions t
      LEFT JOIN core_accounts a ON t.account_id = a.id
      LEFT JOIN core_customers c ON a.customer_id = c.id
      WHERE t.id = @id
    `, { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { account_id, transaction_type, transaction_category, amount, currency, description, counterparty_name, counterparty_bank, counterparty_country, channel, value_date } = req.body;
    const txnId = `TXN-${Date.now()}`;
    
    const result = await query(`
      INSERT INTO core_transactions (transaction_id, account_id, transaction_type, transaction_category, amount, currency, description, counterparty_name, counterparty_bank, counterparty_country, channel, status, sanctions_screened, value_date)
      OUTPUT INSERTED.*
      VALUES (@transaction_id, @account_id, @transaction_type, @transaction_category, @amount, @currency, @description, @counterparty_name, @counterparty_bank, @counterparty_country, @channel, 'PENDING', 0, @value_date)
    `, { transaction_id: txnId, account_id: parseInt(account_id), transaction_type, transaction_category, amount: parseFloat(amount), currency: currency || 'USD', description, counterparty_name, counterparty_bank, counterparty_country, channel: channel || 'WIRE', value_date });
    
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { status, sanctions_result } = req.body;
    const result = await query(`
      UPDATE core_transactions SET status = @status, sanctions_result = @sanctions_result
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), status, sanctions_result });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE core_transactions SET status = 'CANCELLED' WHERE id = @id`, { id: parseInt(req.params.id) });
    res.json({ message: 'Transaction cancelled' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const result = await query(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN sanctions_result = 'BLOCKED' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN sanctions_result = 'FLAGGED' THEN 1 ELSE 0 END) as flagged,
        SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END) as total_volume,
        SUM(CASE WHEN status = 'BLOCKED' THEN amount ELSE 0 END) as blocked_volume
      FROM core_transactions
    `);
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
