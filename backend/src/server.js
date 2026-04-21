const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  originAgentCluster: false
}));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(morgan('combined'));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/sanctions', require('./routes/sanctions'));
app.use('/api/screening', require('./routes/screening'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/liabilities', require('./routes/liabilities'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/trade-finance', require('./routes/tradeFinance'));
app.use('/api/vessels', require('./routes/vessels'));
app.use('/api/countries', require('./routes/countries'));
app.use('/api/watchlist', require('./routes/watchlist'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/scraper', require('./routes/scraper'));
app.use('/api/pep', require('./routes/pep'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/rules', require('./routes/rules'));
app.use('/api/users', require('./routes/users'));
app.use('/api/pep',   require('./routes/pep'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Sanctions Engine API' });
});

// Serve React frontend
// Strategy: hashed asset files (JS/CSS) get long-term cache; index.html never cached.
// This prevents stale chunk errors when a new build is deployed.
const frontendBuild = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendBuild, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // index.html must never be cached — it references hashed chunk filenames
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(filePath)) {
      // Hashed JS/CSS chunks are immutable — safe to cache for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // Other static files (fonts, images) — moderate cache
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));
app.get('/{*path}', (req, res) => {
  // SPA fallback — always serve fresh index.html
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(frontendBuild, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.API_PORT || 5000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Sanctions Engine API running on port ${PORT}`);

  // ── Load sanctions entries into RAM ──────────────────────────────────────
  try {
    const sanctionsEngine = require('./services/sanctionsEngine');
    const result = await sanctionsEngine.loadEntries();
    console.log(`[Startup] Sanctions engine ready: ${result.count.toLocaleString()} entries loaded in ${result.elapsed}ms`);
  } catch (err) {
    console.error('[Startup] Sanctions engine load failed (will use DB fallback):', err.message);
  }

  // ── Load PEP entries into RAM (non-blocking — runs in background) ─────────
  try {
    const pepEngine = require('./services/pepEngine');
    console.log('[Startup] PEP engine loading in background (700k+ records)...');
    pepEngine.loadEntries().then(result => {
      console.log(`[Startup] PEP engine ready: ${result.count.toLocaleString()} entries loaded in ${result.elapsed}ms`);
    }).catch(err => {
      console.error('[Startup] PEP engine load failed:', err.message);
    });
  } catch (err) {
    console.error('[Startup] PEP engine init failed:', err.message);
  }
  // Load PEP data: populate pep_entries_mem (SQL Server In-Memory OLTP) from
  // pep_entries (disk), then build the Node.js RAM index for fast screening.
  try {
    const { loadPEPIntoMemTable } = require('./services/pepMemLoader');
    const { loadPEPs } = require('./services/pepEngine');
    console.log('[Startup] Loading PEP data into SQL Server In-Memory table (pep_entries_mem)...');
    const memResult = await loadPEPIntoMemTable();
    console.log(`[Startup] pep_entries_mem ready: ${memResult.rowCount.toLocaleString()} rows in ${(memResult.durationMs/1000).toFixed(1)}s`);
    console.log('[Startup] Building PEP RAM index from pep_entries_mem...');
    const pepResult = await loadPEPs();
    console.log(`[Startup] PEP RAM index ready: ${pepResult.count.toLocaleString()} entries in ${pepResult.elapsed}ms`);
  } catch (err) {
    console.error('[Startup] PEP load failed (screening unavailable until /api/pep/load is called):', err.message);
  }
});

module.exports = app;
// This is appended - static serving already handled by vite config proxy
