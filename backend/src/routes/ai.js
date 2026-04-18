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

// AI-powered sanctions analysis
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
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
    
    const analysis = JSON.parse(completion.choices[0].message.content);
    res.json({ analysis, tokens_used: completion.usage });
  } catch (err) {
    console.error('AI analysis error:', err.message);
    // Fallback response if AI fails
    res.json({
      analysis: {
        risk_level: 'REVIEW_REQUIRED',
        recommendation: 'Manual review required - AI analysis unavailable',
        reasoning: 'Please review the match details manually against sanctions lists',
        regulatory_basis: 'OFAC, EU, UN sanctions frameworks',
        next_steps: ['Review match details', 'Verify entity identity', 'Consult compliance officer']
      },
      error: err.message
    });
  }
});

// AI-powered case narrative generation
router.post('/generate-narrative', async (req, res) => {
  try {
    const { case_id, case_data } = req.body;
    
    const systemPrompt = `You are a senior compliance officer writing formal case narratives for regulatory purposes.
    Write professional, factual, and legally sound case narratives suitable for regulatory examination.
    Include all relevant facts, the investigation process, and the final determination.`;
    
    const userPrompt = `Generate a formal case narrative for:
    Case Number: ${case_data.case_number}
    Subject: ${case_data.subject_name} (${case_data.subject_type})
    Priority: ${case_data.priority}
    Status: ${case_data.status}
    Description: ${case_data.description}
    Decision: ${case_data.decision || 'Pending'}
    
    Write a 2-3 paragraph formal narrative suitable for regulatory examination.`;
    
    const completion = await azureClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 800,
      temperature: 0.2
    });
    
    res.json({ narrative: completion.choices[0].message.content, tokens_used: completion.usage });
  } catch (err) {
    res.json({ narrative: `Case ${case_data?.case_number || ''}: Manual narrative required. AI service unavailable.`, error: err.message });
  }
});

// AI-powered name transliteration
router.post('/transliterate', async (req, res) => {
  try {
    const { name, source_script, target_script } = req.body;
    
    const completion = await azureClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert in name transliteration for sanctions screening. Provide all common romanization variants of the given name. Return JSON with field "variants" as array of strings.' },
        { role: 'user', content: `Transliterate this name and provide all common variants: "${name}" (from ${source_script || 'unknown script'} to ${target_script || 'Latin/Roman'}). Include phonetic variants, common misspellings, and alternative romanizations used in sanctions lists.` }
      ],
      max_tokens: 300,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
    
    const result = JSON.parse(completion.choices[0].message.content);
    res.json(result);
  } catch (err) {
    res.json({ variants: [req.body.name], error: err.message });
  }
});

// AI-powered risk assessment
router.post('/risk-assessment', async (req, res) => {
  try {
    const { entity_name, entity_type, country, industry, transaction_details } = req.body;
    
    const completion = await azureClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a sanctions risk assessment expert. Provide structured risk assessments in JSON format with fields: overall_risk (LOW/MEDIUM/HIGH/CRITICAL), risk_factors (array), mitigating_factors (array), recommended_action, confidence_score (0-100).' },
        { role: 'user', content: `Assess sanctions risk for: Entity: ${entity_name}, Type: ${entity_type}, Country: ${country}, Industry: ${industry || 'Unknown'}, Transaction: ${JSON.stringify(transaction_details || {})}` }
      ],
      max_tokens: 600,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
    
    const assessment = JSON.parse(completion.choices[0].message.content);
    res.json(assessment);
  } catch (err) {
    res.json({ overall_risk: 'REVIEW_REQUIRED', risk_factors: ['AI assessment unavailable'], mitigating_factors: [], recommended_action: 'Manual review', confidence_score: 0, error: err.message });
  }
});

// AI Chat assistant for compliance queries
router.post('/chat', async (req, res) => {
  try {
    const { message, messages: msgArray, history = [] } = req.body;
    // Support both {message, history} and {messages: [...]} formats
    const userMessage = message || (msgArray && msgArray[msgArray.length - 1]?.content) || '';
    const chatHistory = history.length ? history : (msgArray ? msgArray.slice(0, -1) : []);
    
    const messages = [
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
      Answer questions accurately and cite specific regulatory frameworks. Be professional and concise.` },
      ...chatHistory.slice(-10),
      { role: 'user', content: userMessage }
    ];
    
    const completion = await azureClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o',
      messages,
      max_tokens: 1000,
      temperature: 0.3
    });
    
    res.json({ response: completion.choices[0].message.content, tokens_used: completion.usage });
  } catch (err) {
    res.json({ response: 'I apologize, the AI assistant is temporarily unavailable. Please consult your compliance documentation or contact your compliance officer.', error: err.message });
  }
});

module.exports = router;
