const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/summary', async (req, res) => {
  try {
    const [screening, cases, alerts, sanctions, banking, scraping] = await Promise.all([
      query(`SELECT 
        COUNT(*) as total_screenings,
        SUM(CASE WHEN overall_result = 'CLEAR' THEN 1 ELSE 0 END) as clear,
        SUM(CASE WHEN overall_result = 'POTENTIAL_MATCH' THEN 1 ELSE 0 END) as potential_matches,
        SUM(CASE WHEN overall_result = 'BLOCKED' THEN 1 ELSE 0 END) as blocked
        FROM screening_requests`),
      query(`SELECT 
        COUNT(*) as total_cases,
        SUM(CASE WHEN status IN ('Open','OPEN','Pending','Pending Information') THEN 1 ELSE 0 END) as open_cases,
        SUM(CASE WHEN status IN ('In Review','IN_REVIEW','Escalated') THEN 1 ELSE 0 END) as in_review,
        SUM(CASE WHEN priority IN ('Critical','CRITICAL') THEN 1 ELSE 0 END) as critical_cases
        FROM cases`),
      query(`SELECT 
        COUNT(*) as total_alerts,
        SUM(CASE WHEN status IN ('New','OPEN','Acknowledged') THEN 1 ELSE 0 END) as open_alerts,
        SUM(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) as critical_alerts
        FROM screening_alerts`),
      query(`SELECT 
        COUNT(*) as total_sanctions_entries,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_entries,
        SUM(CASE WHEN entry_type = 'INDIVIDUAL' THEN 1 ELSE 0 END) as individuals,
        SUM(CASE WHEN entry_type = 'ENTITY' THEN 1 ELSE 0 END) as entities,
        SUM(CASE WHEN entry_type = 'VESSEL' THEN 1 ELSE 0 END) as vessels
        FROM sanctions_entries`),
      query(`SELECT 
        (SELECT COUNT(*) FROM core_customers WHERE status = 'ACTIVE') as total_customers,
        (SELECT COUNT(*) FROM core_accounts WHERE status = 'ACTIVE') as total_accounts,
        (SELECT COUNT(*) FROM core_transactions WHERE CAST(transaction_date AS DATE) = CAST(GETDATE() AS DATE)) as today_transactions,
        (SELECT COUNT(*) FROM core_transactions WHERE sanctions_result = 'BLOCKED') as blocked_transactions,
        (SELECT SUM(balance) FROM core_accounts WHERE currency = 'USD') as total_usd_balance`),
      query(`SELECT TOP 5 r.*, s.source_code FROM scrape_run_history r LEFT JOIN sanctions_list_sources s ON r.source_id = s.id ORDER BY r.started_at DESC`)
    ]);
    
    const recentAlerts = await query(`
      SELECT TOP 10 a.*, s.subject_name FROM screening_alerts a
      LEFT JOIN screening_subjects s ON a.subject_id = s.id
      WHERE a.status IN ('New','OPEN','Acknowledged','In Review','IN_REVIEW','Escalated') ORDER BY a.created_at DESC
    `);
    
    const recentCases = await query(`SELECT TOP 5 * FROM cases WHERE status != 'CLOSED' ORDER BY opened_at DESC`);
    
    const screeningTrend = await query(`
      SELECT CAST(started_at AS DATE) as date, COUNT(*) as count, 
        SUM(CASE WHEN overall_result = 'BLOCKED' THEN 1 ELSE 0 END) as blocked
      FROM screening_requests
      WHERE started_at >= DATEADD(day, -30, GETDATE())
      GROUP BY CAST(started_at AS DATE)
      ORDER BY date
    `);
    
    res.json({
      screening: screening.recordset[0],
      cases: cases.recordset[0],
      alerts: alerts.recordset[0],
      sanctions: sanctions.recordset[0],
      banking: banking.recordset[0],
      recentScrapes: scraping.recordset,
      recentAlerts: recentAlerts.recordset,
      recentCases: recentCases.recordset,
      screeningTrend: screeningTrend.recordset
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
