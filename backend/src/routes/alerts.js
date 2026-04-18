const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, status = '', severity = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    // Handle status filter - map frontend values to DB values
    if (status && status !== 'All Statuses') {
      if (status === 'OPEN') {
        where += " AND a.status IN ('New', 'OPEN', 'Acknowledged')";
      } else if (status === 'IN_REVIEW') {
        where += " AND a.status IN ('In Review', 'IN_REVIEW', 'Escalated')";
      } else if (status === 'RESOLVED') {
        where += " AND a.status IN ('Resolved', 'RESOLVED', 'CLOSED')";
      } else {
        where += ' AND a.status = @status'; params.status = status;
      }
    }
    if (severity && severity !== 'All Severities') { where += ' AND a.severity = @severity'; params.severity = severity; }
    
    const count = await query(`SELECT COUNT(*) as total FROM screening_alerts a ${where}`, params);
    const result = await query(`
      SELECT a.*, r.request_id, r.source_system, s.subject_name
      FROM screening_alerts a
      LEFT JOIN screening_requests r ON a.request_id = r.id
      LEFT JOIN screening_subjects s ON a.subject_id = s.id
      ${where} ORDER BY a.created_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT a.*, r.request_id, s.subject_name, s.subject_type, m.match_score, m.match_type, m.matched_value
      FROM screening_alerts a
      LEFT JOIN screening_requests r ON a.request_id = r.id
      LEFT JOIN screening_subjects s ON a.subject_id = s.id
      LEFT JOIN screening_matches m ON a.match_id = m.id
      WHERE a.id = @id
    `, { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { alert_type, severity, title, description, assigned_to, due_date } = req.body;
    const alertId = `ALERT-${Date.now()}`;
    const result = await query(`
      INSERT INTO screening_alerts (alert_id, alert_type, severity, title, description, status, assigned_to, due_date)
      OUTPUT INSERTED.*
      VALUES (@alert_id, @alert_type, @severity, @title, @description, 'OPEN', @assigned_to, @due_date)
    `, { alert_id: alertId, alert_type, severity: severity || 'HIGH', title, description, assigned_to, due_date });
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { status, assigned_to, resolution } = req.body;
    const result = await query(`
      UPDATE screening_alerts SET status = @status, assigned_to = @assigned_to, resolution = @resolution,
        resolved_at = CASE WHEN @status = 'CLOSED' THEN GETDATE() ELSE resolved_at END, updated_at = GETDATE()
      OUTPUT INSERTED.* WHERE id = @id
    `, { id: parseInt(req.params.id), status, assigned_to, resolution });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE screening_alerts SET status = 'CLOSED', updated_at = GETDATE() WHERE id = @id`, { id: parseInt(req.params.id) });
    res.json({ message: 'Alert closed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const result = await query(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status IN ('New', 'OPEN', 'Acknowledged') THEN 1 ELSE 0 END) as open_alerts,
        SUM(CASE WHEN status IN ('In Review', 'IN_REVIEW', 'Escalated') THEN 1 ELSE 0 END) as in_review,
        SUM(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'HIGH' THEN 1 ELSE 0 END) as high_severity,
        SUM(CASE WHEN alert_type = 'BLOCKED' THEN 1 ELSE 0 END) as blocked_alerts,
        SUM(CASE WHEN CAST(created_at AS DATE) = CAST(GETDATE() AS DATE) AND status IN ('Resolved','RESOLVED','CLOSED') THEN 1 ELSE 0 END) as resolved_today
      FROM screening_alerts
    `);
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
