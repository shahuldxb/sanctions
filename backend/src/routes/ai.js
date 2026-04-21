const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { OpenAI } = require('openai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

// Azure OpenAI client
const azureClient = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_CHAT_DEPLOYMENT}`,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview' },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extract regulatory source citations from an AI response */
function extractSources(text) {
  const sources = [];
  const patterns = [
    { re: /\bOFAC\b/g,                   name: 'OFAC – Office of Foreign Assets Control',                   ref: 'https://ofac.treasury.gov/', type: 'REGULATION' },
    { re: /\bSDN\b/g,                     name: 'OFAC SDN – Specially Designated Nationals List',            ref: 'https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists', type: 'LIST' },
    { re: /\bUN\s+Security\s+Council\b|\bUNSC\b/gi, name: 'UN Security Council Consolidated List',          ref: 'https://www.un.org/securitycouncil/content/un-sc-consolidated-list', type: 'LIST' },
    { re: /\bEU\s+Consolidated\b|\bEU\s+sanctions\b/gi, name: 'EU Consolidated Sanctions List',             ref: 'https://eeas.europa.eu/topics/sanctions-policy/8442/consolidated-list-of-sanctions_en', type: 'LIST' },
    { re: /\bOFSI\b|\bUK\s+sanctions\b/gi, name: 'UK OFSI – Office of Financial Sanctions Implementation',  ref: 'https://www.gov.uk/government/organisations/office-of-financial-sanctions-implementation', type: 'REGULATION' },
    { re: /\bSECO\b/g,                    name: 'SECO – Swiss State Secretariat for Economic Affairs',       ref: 'https://www.seco.admin.ch/seco/en/home/Aussenwirtschaftspolitik_Wirtschaftliche_Zusammenarbeit/Wirtschaftsbeziehungen/exportkontrollen-und-sanktionen/sanktionen-embargos.html', type: 'REGULATION' },
    { re: /\bDFAT\b/g,                    name: 'DFAT – Australian Department of Foreign Affairs and Trade', ref: 'https://www.dfat.gov.au/international-relations/security/sanctions', type: 'REGULATION' },
    { re: /\bMAS\b/g,                     name: 'MAS – Monetary Authority of Singapore',                    ref: 'https://www.mas.gov.sg/regulation/anti-money-laundering/targeted-financial-sanctions', type: 'REGULATION' },
    { re: /\bFATF\b/g,                    name: 'FATF – Financial Action Task Force',                        ref: 'https://www.fatf-gafi.org/', type: 'REGULATION' },
    { re: /\bBIS\b/g,                     name: 'BIS – Bureau of Industry and Security (Entity List)',       ref: 'https://www.bis.doc.gov/index.php/policy-guidance/lists-of-parties-of-concern', type: 'LIST' },
    { re: /\bSAR\b/g,                     name: 'SAR – Suspicious Activity Report (FinCEN)',                 ref: 'https://www.fincen.gov/resources/filing-financial-crimes-reports/suspicious-activity-report', type: 'DOCUMENT' },
    { re: /\b50%\s+rule\b|\bfifty\s+percent\s+rule\b/gi, name: 'OFAC 50% Rule – Ownership Aggregation',    ref: 'https://ofac.treasury.gov/faqs/topic/1541', type: 'DOCUMENT' },
    { re: /\bAML\b/g,                     name: 'AML – Anti-Money Laundering Framework',                    ref: 'https://www.fatf-gafi.org/en/topics/aml-cft.html', type: 'REGULATION' },
    { re: /\bKYC\b/g,                     name: 'KYC – Know Your Customer Requirements',                    ref: 'https://www.fatf-gafi.org/en/topics/fatf-recommendations.html', type: 'REGULATION' },
  ];
  const seen = new Set();
  for (const p of patterns) {
    if (p.re.test(text) && !seen.has(p.name)) {
      seen.add(p.name);
      sources.push({ source_type: p.type, source_name: p.name, source_ref: p.ref });
    }
    p.re.lastIndex = 0; // reset global regex
  }
  return sources;
}

/** Ensure a session row exists; return its id */
async function ensureSession(sessionKey, askedBy) {
  const existing = await query(
    `SELECT id FROM ai_chat_sessions WHERE session_key = @key`,
    { key: sessionKey }
  );
  if (existing.recordset.length) return existing.recordset[0].id;
  const ins = await query(
    `INSERT INTO ai_chat_sessions (session_key, asked_by) OUTPUT INSERTED.id VALUES (@key, @by)`,
    { key: sessionKey, by: askedBy || 'Compliance Officer' }
  );
  return ins.recordset[0].id;
}

// ── GET /ai/sessions – list all sessions (history sidebar) ────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const r = await query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM ai_chat_messages m WHERE m.session_id = s.id AND m.role = 'user') AS message_count,
        (SELECT TOP 1 content FROM ai_chat_messages m WHERE m.session_id = s.id AND m.role = 'user' ORDER BY m.created_at ASC) AS first_question,
        (SELECT TOP 1 created_at FROM ai_chat_messages m WHERE m.session_id = s.id ORDER BY m.created_at DESC) AS last_message_at,
        (SELECT AVG(CAST(feedback_score AS FLOAT)) FROM ai_chat_messages m WHERE m.session_id = s.id AND m.feedback_score IS NOT NULL) AS avg_feedback
      FROM ai_chat_sessions s
      ORDER BY s.updated_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY
    `);
    const cnt = await query(`SELECT COUNT(*) as total FROM ai_chat_sessions`);
    res.json({ data: r.recordset, total: cnt.recordset[0].total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /ai/sessions/:id/messages – load full conversation ────────────────────
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    const msgs = await query(`
      SELECT m.*,
        (SELECT (SELECT source_type, source_name, source_ref FROM ai_chat_sources WHERE message_id = m.id FOR JSON PATH) ) AS sources_json
      FROM ai_chat_messages m
      WHERE m.session_id = @id
      ORDER BY m.created_at ASC
    `, { id: parseInt(req.params.id) });
    const rows = msgs.recordset.map(m => ({
      ...m,
      sources: m.sources_json ? JSON.parse(m.sources_json) : []
    }));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /ai/sessions/:id – delete a session ────────────────────────────────
router.delete('/sessions/:id', async (req, res) => {
  try {
    await query(`DELETE FROM ai_chat_sessions WHERE id = @id`, { id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /ai/messages/:id/feedback – submit star rating + note ───────────────
router.patch('/messages/:id/feedback', async (req, res) => {
  try {
    const { score, note } = req.body;
    if (!score || score < 1 || score > 5) return res.status(400).json({ error: 'score must be 1-5' });
    await query(
      `UPDATE ai_chat_messages SET feedback_score = @score, feedback_note = @note WHERE id = @id`,
      { id: parseInt(req.params.id), score: parseInt(score), note: note || null }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /ai/chat – main chat endpoint (now persists everything) ──────────────
router.post('/chat', async (req, res) => {
  try {
    const { message, messages: msgArray, history = [], session_key, asked_by } = req.body;
    const userMessage = message || (msgArray && msgArray[msgArray.length - 1]?.content) || '';
    const chatHistory = history.length ? history : (msgArray ? msgArray.slice(0, -1) : []);

    const sessionKey = session_key || `anon-${Date.now()}`;
    const askedBy = asked_by || 'Compliance Officer';

    // Ensure session exists
    const sessionId = await ensureSession(sessionKey, askedBy);

    // Persist user message
    const userMsgRes = await query(
      `INSERT INTO ai_chat_messages (session_id, role, content) OUTPUT INSERTED.id VALUES (@sid, 'user', @content)`,
      { sid: sessionId, content: userMessage }
    );
    const userMsgId = userMsgRes.recordset[0].id;

    // Update session title from first question (if not set yet)
    await query(`
      UPDATE ai_chat_sessions SET updated_at = GETDATE(),
        title = CASE WHEN title IS NULL THEN LEFT(@title, 280) ELSE title END
      WHERE id = @id
    `, { id: sessionId, title: userMessage });

    // Build OpenAI messages
    const openAIMessages = [
      { role: 'system', content: `You are SENTINEL, an AI-powered sanctions compliance assistant for the Sanctions Engine platform.
You have expert knowledge of:
- OFAC SDN, SSI, and country-specific sanctions programmes
- EU Consolidated Sanctions List
- UN Security Council Consolidated List
- UK OFSI sanctions
- SECO, DFAT, MAS sanctions
- Trade Finance sanctions screening (LCs, bills of lading, vessel screening)
- Fuzzy matching, transliteration, and entity resolution techniques
- SAR filing requirements and regulatory disclosures
- False positive analysis and case management
Answer questions accurately and cite specific regulatory frameworks. Be professional and concise.
When citing sources, mention the specific list or regulation name (e.g. OFAC SDN, FATF, EU Consolidated List).` },
      ...chatHistory.slice(-10),
      { role: 'user', content: userMessage }
    ];

    const completion = await azureClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
      messages: openAIMessages,
      max_tokens: 1000,
      temperature: 0.3
    });

    const aiResponse = completion.choices[0].message.content;
    const tokensUsed = completion.usage?.total_tokens || null;

    // Persist assistant message
    const asstMsgRes = await query(
      `INSERT INTO ai_chat_messages (session_id, role, content, tokens_used) OUTPUT INSERTED.id VALUES (@sid, 'assistant', @content, @tokens)`,
      { sid: sessionId, content: aiResponse, tokens: tokensUsed }
    );
    const asstMsgId = asstMsgRes.recordset[0].id;

    // Extract and persist sources
    const sources = extractSources(aiResponse);
    for (const src of sources) {
      await query(
        `INSERT INTO ai_chat_sources (message_id, source_type, source_name, source_ref) VALUES (@mid, @type, @name, @ref)`,
        { mid: asstMsgId, type: src.source_type, name: src.source_name, ref: src.source_ref }
      );
    }

    res.json({
      response: aiResponse,
      tokens_used: completion.usage,
      session_id: sessionId,
      message_id: asstMsgId,
      user_message_id: userMsgId,
      sources
    });
  } catch (err) {
    console.error('AI chat error:', err.message);
    res.json({
      response: 'I apologize, the AI assistant is temporarily unavailable. Please consult your compliance documentation or contact your compliance officer.',
      error: err.message,
      sources: []
    });
  }
});

// ── AI-powered sanctions analysis ─────────────────────────────────────────────
router.post('/analyze', async (req, res) => {
  try {
    const { subject_name, subject_type, context, matches } = req.body;
    const systemPrompt = `You are an expert sanctions compliance analyst at a major international bank.
    You have deep knowledge of OFAC, EU, UN, UK, SECO, DFAT, and MAS sanctions regimes.
    Analyze the provided screening results and give a professional compliance assessment.
    Be concise, factual, and reference specific sanctions programmes where relevant.
    Format your response as JSON with fields: risk_level, recommendation, reasoning, regulatory_basis, next_steps.`;
    const userPrompt = `Analyze this sanctions screening result:
    Subject: ${subject_name} (${subject_type})
    Context: ${context || 'Manual screening'}
    Potential Matches Found:
    ${JSON.stringify(matches, null, 2)}
    Provide a compliance assessment and recommendation.`;
    const completion = await azureClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens: 1000, temperature: 0.1, response_format: { type: 'json_object' }
    });
    const analysis = JSON.parse(completion.choices[0].message.content);
    res.json({ analysis, tokens_used: completion.usage });
  } catch (err) {
    res.json({ analysis: { risk_level: 'REVIEW_REQUIRED', recommendation: 'Manual review required - AI analysis unavailable', reasoning: 'Please review the match details manually against sanctions lists', regulatory_basis: 'OFAC, EU, UN sanctions frameworks', next_steps: ['Review match details', 'Verify entity identity', 'Consult compliance officer'] }, error: err.message });
  }
});

// ── AI-powered case narrative generation ──────────────────────────────────────
router.post('/generate-narrative', async (req, res) => {
  try {
    const { case_id, case_data } = req.body;
    const completion = await azureClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a senior compliance officer writing formal case narratives for regulatory purposes. Write professional, factual, and legally sound case narratives suitable for regulatory examination. Include all relevant facts, the investigation process, and the final determination.' },
        { role: 'user', content: `Generate a formal case narrative for:\nCase Number: ${case_data.case_number}\nSubject: ${case_data.subject_name} (${case_data.subject_type})\nPriority: ${case_data.priority}\nStatus: ${case_data.status}\nDescription: ${case_data.description}\nDecision: ${case_data.decision || 'Pending'}\n\nWrite a 2-3 paragraph formal narrative suitable for regulatory examination.` }
      ],
      max_tokens: 800, temperature: 0.2
    });
    res.json({ narrative: completion.choices[0].message.content, tokens_used: completion.usage });
  } catch (err) {
    res.json({ narrative: `Case ${case_data?.case_number || ''}: Manual narrative required. AI service unavailable.`, error: err.message });
  }
});

// ── AI-powered name transliteration ───────────────────────────────────────────
router.post('/transliterate', async (req, res) => {
  try {
    const { name, source_script, target_script } = req.body;
    const completion = await azureClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert in name transliteration for sanctions screening. Provide all common romanization variants of the given name. Return JSON with field "variants" as array of strings.' },
        { role: 'user', content: `Transliterate this name and provide all common variants: "${name}" (from ${source_script || 'unknown script'} to ${target_script || 'Latin/Roman'}). Include phonetic variants, common misspellings, and alternative romanizations used in sanctions lists.` }
      ],
      max_tokens: 300, temperature: 0.1, response_format: { type: 'json_object' }
    });
    const result = JSON.parse(completion.choices[0].message.content);
    res.json(result);
  } catch (err) {
    res.json({ variants: [req.body.name], error: err.message });
  }
});

// ── AI-powered risk assessment ─────────────────────────────────────────────────
router.post('/risk-assessment', async (req, res) => {
  try {
    const { entity_name, entity_type, country, industry, transaction_details } = req.body;
    const completion = await azureClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a sanctions risk assessment expert. Provide structured risk assessments in JSON format with fields: overall_risk (LOW/MEDIUM/HIGH/CRITICAL), risk_factors (array), mitigating_factors (array), recommended_action, confidence_score (0-100).' },
        { role: 'user', content: `Assess sanctions risk for: Entity: ${entity_name}, Type: ${entity_type}, Country: ${country}, Industry: ${industry || 'Unknown'}, Transaction: ${JSON.stringify(transaction_details || {})}` }
      ],
      max_tokens: 600, temperature: 0.1, response_format: { type: 'json_object' }
    });
    const assessment = JSON.parse(completion.choices[0].message.content);
    res.json(assessment);
  } catch (err) {
    res.json({ overall_risk: 'REVIEW_REQUIRED', risk_factors: ['AI assessment unavailable'], mitigating_factors: [], recommended_action: 'Manual review', confidence_score: 0, error: err.message });
  }
});

module.exports = router;
