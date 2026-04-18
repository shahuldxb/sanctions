const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM reports ORDER BY created_at DESC');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM reports WHERE id = @id', { id: parseInt(req.params.id) });
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/generate', async (req, res) => {
  try {
    const { report_type, report_name, generated_by, parameters } = req.body;
    const reportId = `RPT-${Date.now()}`;
    
    let data = [];
    let rowCount = 0;
    
    switch (report_type) {
      case 'SCREENING_SUMMARY':
        const screening = await query(`
          SELECT r.overall_result, COUNT(*) as count, r.source_system
          FROM screening_requests r GROUP BY r.overall_result, r.source_system
        `);
        data = screening.recordset;
        rowCount = data.length;
        break;
      case 'CASE_STATUS':
        const cases = await query(`SELECT case_number, subject_name, status, priority, assigned_analyst, opened_at FROM cases ORDER BY opened_at DESC`);
        data = cases.recordset;
        rowCount = data.length;
        break;
      case 'SANCTIONS_LIST_UPDATE':
        const updates = await query(`SELECT r.*, s.source_code FROM scrape_run_history r LEFT JOIN sanctions_list_sources s ON r.source_id = s.id ORDER BY r.started_at DESC`);
        data = updates.recordset;
        rowCount = data.length;
        break;
      case 'FALSE_POSITIVE':
        const fp = await query(`SELECT m.*, s.subject_name FROM screening_matches m LEFT JOIN screening_subjects s ON m.subject_id = s.id WHERE m.disposition = 'FALSE_POSITIVE'`);
        data = fp.recordset;
        rowCount = data.length;
        break;
      default:
        data = [];
        rowCount = 0;
    }
    
    const result = await query(`
      INSERT INTO reports (report_id, report_type, report_name, generated_by, parameters, status, row_count, generated_at)
      OUTPUT INSERTED.*
      VALUES (@report_id, @report_type, @report_name, @generated_by, @parameters, 'COMPLETED', @row_count, GETDATE())
    `, { report_id: reportId, report_type, report_name: report_name || report_type, generated_by: generated_by || 'System', parameters: JSON.stringify(parameters || {}), row_count: rowCount });
    
    res.json({ report: result.recordset[0], data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { report_name, status } = req.body;
    const result = await query(`UPDATE reports SET report_name = @report_name, status = @status OUTPUT INSERTED.* WHERE id = @id`, { id: parseInt(req.params.id), report_name, status });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM reports WHERE id = @id', { id: parseInt(req.params.id) });
    res.json({ message: 'Report deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

// GET report by type name (for direct URL access like /reports/screening_summary)
router.get('/:reportType/download', async (req, res) => {
  const { date_from, date_to, format = 'CSV' } = req.query;
  const type = req.params.reportType.toUpperCase().replace(/-/g, '_');
  try {
    let data = [];
    if (type === 'SCREENING_SUMMARY') {
      const r = await query(`SELECT overall_result, COUNT(*) as count FROM screening_requests WHERE started_at >= @from AND started_at <= @to GROUP BY overall_result`, { from: date_from || '2020-01-01', to: date_to || '2030-01-01' });
      data = r.recordset;
    } else if (type === 'CASE_STATUS') {
      const r = await query(`SELECT case_number, subject_name, status, priority FROM cases WHERE opened_at >= @from ORDER BY opened_at DESC`, { from: date_from || '2020-01-01' });
      data = r.recordset;
    } else if (type === 'AUDIT_TRAIL') {
      const r = await query(`SELECT TOP 1000 * FROM audit_log ORDER BY event_time DESC`);
      data = r.recordset;
    } else {
      data = [{ message: 'No data for this report type' }];
    }
    
    if (format === 'JSON') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_${date_from}_${date_to}.json"`);
      res.send(JSON.stringify(data, null, 2));
    } else {
      // CSV
      const headers = data.length > 0 ? Object.keys(data[0]).join(',') : '';
      const rows = data.map(row => Object.values(row).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_${date_from}_${date_to}.csv"`);
      res.send([headers, ...rows].join('\n'));
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});
