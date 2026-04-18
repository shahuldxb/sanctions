const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

// ── In-memory engine (loaded at startup) ──────────────────────────────────────
let _engine = null;
function getEngine() {
  if (!_engine) {
    try { _engine = require('../services/sanctionsEngine'); } catch (e) { /* not loaded yet */ }
  }
  return _engine;
}

// ── GET all screening requests (root path) ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, status = '', source_system = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (status) { where += ' AND status = @status'; params.status = status; }
    if (source_system) { where += ' AND source_system = @source_system'; params.source_system = source_system; }
    const count = await query(`SELECT COUNT(*) as total FROM screening_requests ${where}`, params);
    const result = await query(`SELECT * FROM screening_requests ${where} ORDER BY started_at DESC OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET all screening requests ────────────────────────────────────────────────
router.get('/requests', async (req, res) => {
  try {
    const { page = 1, limit = 50, status = '', source_system = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (status) { where += ' AND status = @status'; params.status = status; }
    if (source_system) { where += ' AND source_system = @source_system'; params.source_system = source_system; }
    const count = await query(`SELECT COUNT(*) as total FROM screening_requests ${where}`, params);
    const result = await query(`
      SELECT * FROM screening_requests ${where}
      ORDER BY started_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `, params);
    res.json({ data: result.recordset, total: count.recordset[0].total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET single request with subjects and matches ──────────────────────────────
router.get('/requests/:id', async (req, res) => {
  try {
    const request = await query('SELECT * FROM screening_requests WHERE id = @id', { id: parseInt(req.params.id) });
    if (!request.recordset.length) return res.status(404).json({ error: 'Not found' });
    const subjects = await query(`
      SELECT s.*, m.match_score as top_match_score, m.list_source as top_list_source
      FROM screening_subjects s
      LEFT JOIN screening_matches m ON s.id = m.subject_id AND m.match_score = (
        SELECT MAX(match_score) FROM screening_matches WHERE subject_id = s.id
      )
      WHERE s.request_id = @id
    `, { id: parseInt(req.params.id) });
    res.json({ ...request.recordset[0], subjects: subjects.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET engine status ─────────────────────────────────────────────────────────
router.get('/engine-status', (req, res) => {
  const eng = getEngine();
  if (!eng) return res.json({ loaded: false, message: 'Engine not initialized' });
  res.json(eng.getStatus());
});

// ── POST reload engine ────────────────────────────────────────────────────────
router.post('/engine-reload', async (req, res) => {
  const eng = getEngine();
  if (!eng) return res.status(503).json({ error: 'Engine not available' });
  try {
    const result = await eng.reload();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST new screening request (uses in-memory engine) ───────────────────────
router.post('/screen', async (req, res) => {
  try {
    const { subjects, source_system = 'MANUAL', requested_by = 'API', priority = 'NORMAL' } = req.body;
    if (!subjects || !subjects.length) return res.status(400).json({ error: 'subjects required' });

    const requestId = `SCR-${Date.now()}`;
    const eng = getEngine();

    // Create screening request record
    const reqResult = await query(`
      INSERT INTO screening_requests (request_id, request_type, source_system, requested_by, priority, status, total_subjects)
      OUTPUT INSERTED.*
      VALUES (@request_id, @request_type, @source_system, @requested_by, @priority, 'SCREENING', @total_subjects)
    `, {
      request_id: requestId,
      request_type: subjects.length > 1 ? 'BATCH' : subjects[0]?.subject_type || 'INDIVIDUAL',
      source_system, requested_by, priority,
      total_subjects: subjects.length
    });

    const screeningRequest = reqResult.recordset[0];
    const results = [];

    // Screen each subject
    for (const subject of subjects) {
      // Insert subject record
      const subjectResult = await query(`
        INSERT INTO screening_subjects (request_id, subject_type, subject_name, subject_role, dob, nationality, country, identifier_type, identifier_value)
        OUTPUT INSERTED.*
        VALUES (@request_id, @subject_type, @subject_name, @subject_role, @dob, @nationality, @country, @identifier_type, @identifier_value)
      `, {
        request_id: screeningRequest.id,
        subject_type: subject.subject_type || 'INDIVIDUAL',
        subject_name: subject.subject_name,
        subject_role: subject.subject_role || 'SUBJECT',
        dob: subject.dob || null,
        nationality: subject.nationality || null,
        country: subject.country || null,
        identifier_type: subject.identifier_type || null,
        identifier_value: subject.identifier_value || null
      });

      const newSubject = subjectResult.recordset[0];

      // ── Use in-memory engine if available, else fall back to DB ──────────
      let matches = [];
      let topScore = 0;
      let screeningResult = 'CLEAR';
      let engineUsed = 'DB_FALLBACK';

      if (eng && eng.getStatus().loaded) {
        // Fast in-memory screening
        const engineResult = eng.screen(subject.subject_name, { threshold: 60, maxResults: 10 });
        matches = engineResult.matches.map(m => ({
          entry_id:      m.entryId,
          score:         m.score,
          match_type:    m.matchType,
          matched_field: 'PRIMARY_NAME',
          matched_value: m.name,
          list_source:   m.listSource,
          programme:     m.programme,
        }));
        topScore = engineResult.topScore;
        screeningResult = engineResult.result;
        engineUsed = `IN_MEMORY (${engineResult.durationMs}ms, ${engineResult.candidatesEvaluated}/${engineResult.totalEntries} candidates)`;
      } else {
        // DB fallback
        matches = await performFuzzyMatchDB(subject.subject_name);
        for (const m of matches) { if (m.score > topScore) topScore = m.score; }
        if (topScore >= 90) screeningResult = 'BLOCKED';
        else if (topScore >= 65) screeningResult = 'POTENTIAL_MATCH';
        else screeningResult = 'CLEAR';
      }

      // Persist matches
      for (const match of matches) {
        await query(`
          INSERT INTO screening_matches (subject_id, entry_id, match_score, match_type, matched_field, matched_value, list_source, programme, disposition)
          VALUES (@subject_id, @entry_id, @match_score, @match_type, @matched_field, @matched_value, @list_source, @programme, 'PENDING')
        `, {
          subject_id:    newSubject.id,
          entry_id:      match.entry_id,
          match_score:   match.score,
          match_type:    match.match_type,
          matched_field: match.matched_field,
          matched_value: match.matched_value,
          list_source:   match.list_source,
          programme:     match.programme
        });
      }

      // Update subject result
      await query(`
        UPDATE screening_subjects SET screening_result = @result, match_score = @score, screened_at = GETDATE()
        WHERE id = @id
      `, { result: screeningResult, score: topScore, id: newSubject.id });

      results.push({
        subject: subject.subject_name,
        result: screeningResult,
        score: topScore,
        matches: matches.length,
        engineUsed
      });
    }

    // Overall result
    const overallResult = results.some(r => r.result === 'BLOCKED') ? 'BLOCKED' :
                          results.some(r => r.result === 'POTENTIAL_MATCH') ? 'POTENTIAL_MATCH' : 'CLEAR';

    await query(`
      UPDATE screening_requests SET status = 'COMPLETED', overall_result = @overall_result,
      completed_subjects = @completed, completed_at = GETDATE()
      WHERE id = @id
    `, { overall_result: overallResult, completed: subjects.length, id: screeningRequest.id });

    // Create alert if needed
    if (overallResult !== 'CLEAR') {
      const alertId = `ALERT-${Date.now()}`;
      await query(`
        INSERT INTO screening_alerts (alert_id, request_id, alert_type, severity, title, description, status)
        VALUES (@alert_id, @request_id, @alert_type, @severity, @title, @description, 'OPEN')
      `, {
        alert_id:    alertId,
        request_id:  screeningRequest.id,
        alert_type:  overallResult === 'BLOCKED' ? 'BLOCKED' : 'POTENTIAL_MATCH',
        severity:    overallResult === 'BLOCKED' ? 'CRITICAL' : 'HIGH',
        title:       `${overallResult}: ${subjects.map(s => s.subject_name).join(', ')}`,
        description: `Screening request ${requestId} resulted in ${overallResult}. ${results.filter(r => r.result !== 'CLEAR').length} subject(s) flagged.`
      });
    }

    res.json({ requestId, overallResult, results, screeningRequestId: screeningRequest.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET matches for a subject ─────────────────────────────────────────────────
router.get('/subjects/:id/matches', async (req, res) => {
  try {
    const result = await query(`
      SELECT m.*, e.primary_name as entry_name, e.entry_type, e.dob as entry_dob,
             e.nationality as entry_nationality, e.programme, e.remarks,
             s.source_code, s.source_name
      FROM screening_matches m
      LEFT JOIN sanctions_entries e ON m.entry_id = e.id
      LEFT JOIN sanctions_list_sources s ON e.source_id = s.id
      WHERE m.subject_id = @id
      ORDER BY m.match_score DESC
    `, { id: parseInt(req.params.id) });
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT update match disposition ──────────────────────────────────────────────
router.put('/matches/:id', async (req, res) => {
  try {
    const { disposition, analyst_notes, is_true_match } = req.body;
    const result = await query(`
      UPDATE screening_matches SET
        disposition = @disposition, analyst_notes = @analyst_notes,
        is_true_match = @is_true_match, reviewed_at = GETDATE()
      OUTPUT INSERTED.*
      WHERE id = @id
    `, { id: parseInt(req.params.id), disposition, analyst_notes, is_true_match: is_true_match ? 1 : 0 });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET screening statistics ──────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM screening_requests) as total_requests,
        (SELECT COUNT(*) FROM screening_requests WHERE overall_result = 'CLEAR') as clear_count,
        (SELECT COUNT(*) FROM screening_requests WHERE overall_result = 'POTENTIAL_MATCH') as potential_match_count,
        (SELECT COUNT(*) FROM screening_requests WHERE overall_result = 'BLOCKED') as blocked_count,
        (SELECT COUNT(*) FROM screening_requests WHERE status = 'PENDING') as pending_count,
        (SELECT COUNT(*) FROM screening_matches WHERE disposition = 'PENDING') as pending_reviews,
        (SELECT COUNT(*) FROM screening_matches WHERE is_true_match = 1) as true_matches,
        (SELECT COUNT(*) FROM screening_matches WHERE is_true_match = 0 AND disposition = 'FALSE_POSITIVE') as false_positives
    `);
    // Also include engine status
    const eng = getEngine();
    const engineStatus = eng ? eng.getStatus() : { loaded: false };
    res.json({ ...result.recordset[0], engineStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST fuzzy test (uses in-memory engine) ───────────────────────────────────
router.post('/fuzzy-test', async (req, res) => {
  try {
    const { name, threshold = 70, limit = 20, algorithm = 'IN_MEMORY' } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const eng = getEngine();

    if (eng && eng.getStatus().loaded) {
      // Fast in-memory path
      const result = eng.screen(name, { threshold: parseInt(threshold), maxResults: parseInt(limit) });
      const matches = result.matches.map(m => ({
        entry_id:     m.entryId,
        matched_name: m.name,
        entity_type:  m.type,
        source_code:  m.listSource,
        nationality:  m.nationality,
        score:        m.score,
        match_type:   m.matchType,
        programme:    m.programme,
        algorithm:    'IN_MEMORY_TOKEN_INDEX',
      }));
      return res.json({
        matches,
        total: matches.length,
        query: name,
        threshold,
        algorithm: 'IN_MEMORY_TOKEN_INDEX',
        durationMs: result.durationMs,
        candidatesEvaluated: result.candidatesEvaluated,
        totalEntries: result.totalEntries,
        engineLoaded: true,
      });
    }

    // DB fallback (limited to TOP 1000 for performance)
    const entries = await query(`
      SELECT TOP 1000 e.id, e.primary_name, e.entry_type, s.source_code, e.nationality, e.dob
      FROM sanctions_entries e
      LEFT JOIN sanctions_list_sources s ON e.source_id = s.id
      WHERE e.status IN ('Active','ACTIVE')
    `);

    const matches = [];
    const queryUpper = name.toUpperCase().trim();
    for (const entry of entries.recordset) {
      const entryName = (entry.primary_name || '').toUpperCase().trim();
      if (!entryName) continue;
      const score = levenshteinScore(queryUpper, entryName);
      if (score >= threshold) {
        matches.push({
          entry_id: entry.id, matched_name: entry.primary_name,
          entity_type: entry.entry_type, source_code: entry.source_code,
          nationality: entry.nationality, score: Math.round(score), algorithm: 'DB_LEVENSHTEIN',
        });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    res.json({ matches: matches.slice(0, limit), total: matches.length, query: name, threshold, algorithm: 'DB_LEVENSHTEIN', engineLoaded: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET screening history ─────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 50, source_code = '', result = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = {};
    if (source_code) { where += ' AND source_system = @source'; params.source = source_code; }
    if (result) { where += ' AND overall_result = @result'; params.result = result; }
    const count = await query(`SELECT COUNT(*) as total FROM screening_requests ${where}`, params);
    const result2 = await query(`SELECT * FROM screening_requests ${where} ORDER BY started_at DESC OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`, params);
    res.json({ data: result2.recordset, total: count.recordset[0].total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

// ── DB fallback fuzzy match (used when engine not loaded) ─────────────────────
async function performFuzzyMatchDB(name) {
  if (!name) return [];
  const entries = await query(`
    SELECT e.id as entry_id, e.primary_name, e.dob, e.nationality, e.programme, e.entry_type,
           s.source_code as list_source
    FROM sanctions_entries e
    LEFT JOIN sanctions_list_sources s ON e.source_id = s.id
    WHERE e.status IN ('Active','ACTIVE')
  `);
  const matches = [];
  const searchName = name.toUpperCase().trim();
  for (const entry of entries.recordset) {
    const entryName = (entry.primary_name || '').toUpperCase().trim();
    const score = levenshteinScore(searchName, entryName);
    if (score >= 60) {
      matches.push({
        entry_id: entry.entry_id, score,
        match_type: score === 100 ? 'EXACT' : 'FUZZY',
        matched_field: 'PRIMARY_NAME', matched_value: entry.primary_name,
        list_source: entry.list_source, programme: entry.programme,
      });
    }
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, 10);
}

function levenshteinScore(str1, str2) {
  if (str1 === str2) return 100;
  if (!str1 || !str2) return 0;
  const len1 = str1.length, len2 = str2.length;
  if (str1.includes(str2) || str2.includes(str1)) {
    return Math.round((Math.min(len1, len2) / Math.max(len1, len2)) * 95);
  }
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const ind = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + ind);
    }
  }
  const maxLen = Math.max(len1, len2);
  return Math.round(((maxLen - matrix[len2][len1]) / maxLen) * 100);
}
