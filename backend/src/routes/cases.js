const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

// GET all cases
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, status = '', priority = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (status) { where += ' AND c.status = @status'; params.status = status; }
    if (priority) { where += ' AND c.priority = @priority'; params.priority = priority; }
    
    const count = await query(`SELECT COUNT(*) as total FROM cases c ${where}`, params);
    const result = await query(`
      SELECT c.*, a.title as alert_title, a.severity as alert_severity
      FROM cases c
      LEFT JOIN screening_alerts a ON c.alert_id = a.id
      ${where}
      ORDER BY c.opened_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `, params);
    
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single case with notes
router.get('/:id', async (req, res) => {
  try {
    const caseData = await query(`
      SELECT c.*, a.title as alert_title, a.description as alert_description, a.severity
      FROM cases c
      LEFT JOIN screening_alerts a ON c.alert_id = a.id
      WHERE c.id = @id
    `, { id: parseInt(req.params.id) });
    
    if (!caseData.recordset.length) return res.status(404).json({ error: 'Not found' });
    
    const notes = await query('SELECT * FROM case_notes WHERE case_id = @id ORDER BY created_at ASC', { id: parseInt(req.params.id) });
    const docs = await query('SELECT * FROM case_documents WHERE case_id = @id', { id: parseInt(req.params.id) });
    
    res.json({ ...caseData.recordset[0], notes: notes.recordset, documents: docs.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create case
router.post('/', async (req, res) => {
  try {
    const { alert_id, subject_name, subject_type, priority, assigned_analyst, supervising_officer, description } = req.body;
    const caseNumber = `CASE-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    
    const result = await query(`
      INSERT INTO cases (case_number, case_type, alert_id, subject_name, subject_type, priority, status, assigned_analyst, supervising_officer, description, sla_due_date)
      OUTPUT INSERTED.*
      VALUES (@case_number, 'SANCTIONS_HIT', @alert_id, @subject_name, @subject_type, @priority, 'OPEN', @assigned_analyst, @supervising_officer, @description, DATEADD(day, 5, GETDATE()))
    `, { case_number: caseNumber, alert_id: alert_id ? parseInt(alert_id) : null, subject_name, subject_type, priority: priority || 'MEDIUM', assigned_analyst, supervising_officer, description });
    
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update case
router.put('/:id', async (req, res) => {
  try {
    const { status, priority, assigned_analyst, decision, decision_rationale, sar_filed, sar_reference } = req.body;
    const result = await query(`
      UPDATE cases SET
        status = @status, priority = @priority, assigned_analyst = @assigned_analyst,
        decision = @decision, decision_rationale = @decision_rationale,
        sar_filed = @sar_filed, sar_reference = @sar_reference,
        closed_at = CASE WHEN @status = 'CLOSED' THEN GETDATE() ELSE closed_at END,
        updated_at = GETDATE()
      OUTPUT INSERTED.*
      WHERE id = @id
    `, { id: parseInt(req.params.id), status, priority, assigned_analyst, decision, decision_rationale, sar_filed: sar_filed ? 1 : 0, sar_reference });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE case
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM case_notes WHERE case_id = @id', { id: parseInt(req.params.id) });
    await query('DELETE FROM cases WHERE id = @id', { id: parseInt(req.params.id) });
    res.json({ message: 'Case deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add note
router.post('/:id/notes', async (req, res) => {
  try {
    const { note_text, note_type, created_by } = req.body;
    const result = await query(`
      INSERT INTO case_notes (case_id, note_type, note_text, created_by)
      OUTPUT INSERTED.*
      VALUES (@case_id, @note_type, @note_text, @created_by)
    `, { case_id: parseInt(req.params.id), note_type: note_type || 'ANALYST_NOTE', note_text, created_by: created_by || 'System' });
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET case stats
router.get('/stats/summary', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('Open','OPEN','Pending','Pending Information') THEN 1 ELSE 0 END) as open_cases,
        SUM(CASE WHEN status IN ('In Review','IN_REVIEW','Escalated') THEN 1 ELSE 0 END) as in_review,
        SUM(CASE WHEN status IN ('Closed','CLOSED') THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN priority IN ('Critical','CRITICAL') THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN sar_filed = 1 THEN 1 ELSE 0 END) as sar_filed,
        SUM(CASE WHEN decision = 'TRUE_MATCH' THEN 1 ELSE 0 END) as true_matches,
        SUM(CASE WHEN decision = 'FALSE_POSITIVE' THEN 1 ELSE 0 END) as false_positives
      FROM cases
    `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
