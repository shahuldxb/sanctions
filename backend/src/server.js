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
app.use('/api/ai', require('./routes/ai'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/rules', require('./routes/rules'));
app.use('/api/users', require('./routes/users'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Sanctions Engine API' });
});

// Serve React frontend - no caching to prevent stale chunk issues
const frontendBuild = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendBuild, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.get('/{*path}', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
  // Load all sanctions entries into RAM for fast in-memory screening
  try {
    const sanctionsEngine = require('./services/sanctionsEngine');
    const result = await sanctionsEngine.loadEntries();
    console.log(`[Startup] In-memory engine ready: ${result.count.toLocaleString()} entries loaded in ${result.elapsed}ms`);
  } catch (err) {
    console.error('[Startup] In-memory engine load failed (will use DB fallback):', err.message);
  }
});

module.exports = app;
// This is appended - static serving already handled by vite config proxy
