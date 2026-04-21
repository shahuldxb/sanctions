const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const config = {
  server: '203.101.44.46',
  database: 'sanctions',
  user: 'shahul',
  password: 'Apple123!@#',
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
};

async function run() {
  const pool = await sql.connect(config);
  const schemaSQL = fs.readFileSync(path.join(__dirname, 'src/db/ai_sentinel_schema.sql'), 'utf8');
  // Split on GO or run as batches separated by IF NOT EXISTS blocks
  const statements = schemaSQL.split(/;\s*\n/).filter(s => s.trim());
  for (const stmt of statements) {
    const clean = stmt.trim();
    if (!clean || clean.startsWith('--')) continue;
    try {
      await pool.request().query(clean);
      console.log('OK:', clean.substring(0, 60).replace(/\n/g, ' '));
    } catch (e) {
      console.error('ERR:', e.message, '\nSQL:', clean.substring(0, 80));
    }
  }
  await pool.close();
  console.log('Done.');
}
run().catch(console.error);
