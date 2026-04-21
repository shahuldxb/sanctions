const sql = require('mssql');

// Hardcoded credentials - verified working
const config = {
  server: '203.101.44.46',
  database: 'sanctions',
  user: 'shahul',
  password: 'Apple123!@#',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 300000,   // 5 min — needed for large batch INSERT...SELECT (700K rows)
    connectionTimeout: 30000
  },
  pool: {
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000
  }
};

let pool = null;
let poolPromise = null;

async function getPool() {
  if (pool && pool.connected) return pool;
  if (poolPromise) return poolPromise;
  poolPromise = sql.connect(config).then(p => {
    pool = p;
    poolPromise = null;
    console.log('SQL Server connection pool established');
    p.on('error', err => { console.error('Pool error:', err.message); pool = null; });
    return p;
  }).catch(err => {
    poolPromise = null;
    throw err;
  });
  return poolPromise;
}

async function query(queryStr, params = {}) {
  const p = await getPool();
  const request = p.request();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      request.input(key, sql.NVarChar, null);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) request.input(key, sql.Int, value);
      else request.input(key, sql.Decimal(18, 4), value);
    } else if (value instanceof Date) {
      request.input(key, sql.DateTime2, value);
    } else if (typeof value === 'boolean') {
      request.input(key, sql.Bit, value);
    } else {
      request.input(key, sql.NVarChar(sql.MAX), String(value));
    }
  }
  return request.query(queryStr);
}

module.exports = { getPool, query, sql };
