/**
 * create_pep_mem_table.js
 * ========================
 * One-time setup script:
 *   1. Adds MEMORY_OPTIMIZED_DATA filegroup to the sanctions database
 *   2. Creates pep_entries_mem as an In-Memory OLTP table (SCHEMA_ONLY durability)
 *
 * Run once: node scripts/create_pep_mem_table.js
 */
'use strict';

const sql = require('mssql');

const config = {
  server: '203.101.44.46',
  database: 'sanctions',
  user: 'shahul',
  password: 'Apple123!@#',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 120000,
    connectionTimeout: 30000,
  },
};

async function run() {
  console.log('[Setup] Connecting to SQL Server...');
  const pool = await sql.connect(config);

  // ── Step 1: Add MEMORY_OPTIMIZED_DATA filegroup if not present ──────────────
  console.log('[Setup] Checking for MEMORY_OPTIMIZED_DATA filegroup...');
  const fgCheck = await pool.request().query(
    "SELECT COUNT(*) as cnt FROM sys.filegroups WHERE type = 'FX'"
  );
  if (fgCheck.recordset[0].cnt === 0) {
    console.log('[Setup] Adding MEMORY_OPTIMIZED_DATA filegroup...');
    // Get the DB data path to place the container
    const pathRes = await pool.request().query(
      "SELECT physical_name FROM sys.database_files WHERE type = 0"
    );
    const dataPath = pathRes.recordset[0]?.physical_name || 'C:\\SQLData';
    const dirPath  = dataPath.substring(0, dataPath.lastIndexOf('\\') + 1);
    const containerPath = dirPath + 'sanctions_mem_container';

    await pool.request().query(`
      ALTER DATABASE sanctions
      ADD FILEGROUP sanctions_mem_fg CONTAINS MEMORY_OPTIMIZED_DATA
    `);
    console.log('[Setup] Filegroup added. Adding container file...');
    await pool.request().query(`
      ALTER DATABASE sanctions
      ADD FILE (
        NAME = 'sanctions_mem_file',
        FILENAME = '${containerPath}'
      )
      TO FILEGROUP sanctions_mem_fg
    `);
    console.log('[Setup] ✓ MEMORY_OPTIMIZED_DATA filegroup ready');
  } else {
    console.log('[Setup] ✓ MEMORY_OPTIMIZED_DATA filegroup already exists');
  }

  // ── Step 2: Drop and recreate pep_entries_mem ───────────────────────────────
  console.log('[Setup] Dropping pep_entries_mem if exists...');
  await pool.request().query(`
    IF OBJECT_ID('pep_entries_mem', 'U') IS NOT NULL
      DROP TABLE pep_entries_mem
  `);

  console.log('[Setup] Creating pep_entries_mem (MEMORY_OPTIMIZED, SCHEMA_ONLY)...');
  await pool.request().query(`
    CREATE TABLE pep_entries_mem (
      id              INT             NOT NULL,
      external_id     NVARCHAR(200)   COLLATE Latin1_General_100_BIN2 NOT NULL,
      source          NVARCHAR(100)   COLLATE Latin1_General_100_BIN2 NOT NULL,
      schema_type     NVARCHAR(50)    NULL,
      primary_name    NVARCHAR(500)   COLLATE Latin1_General_100_BIN2 NOT NULL,
      aliases         NVARCHAR(4000)  NULL,
      birth_date      NVARCHAR(100)   NULL,
      countries       NVARCHAR(500)   NULL,
      nationality     NVARCHAR(500)   NULL,
      position        NVARCHAR(1000)  NULL,
      political_party NVARCHAR(500)   NULL,
      gender          NVARCHAR(20)    NULL,
      dataset         NVARCHAR(200)   NULL,
      remarks         NVARCHAR(4000)  NULL,
      adverse_links   NVARCHAR(2000)  NULL,
      wikidata_id     NVARCHAR(100)   NULL,
      icij_node_id    NVARCHAR(100)   NULL,
      first_seen      NVARCHAR(50)    NULL,
      last_seen       NVARCHAR(50)    NULL,
      status          NVARCHAR(20)    COLLATE Latin1_General_100_BIN2 NOT NULL,
      CONSTRAINT PK_pep_entries_mem PRIMARY KEY NONCLUSTERED HASH (id) WITH (BUCKET_COUNT = 1048576),
      INDEX IX_pep_mem_ext_id  NONCLUSTERED HASH (external_id) WITH (BUCKET_COUNT = 1048576),
      INDEX IX_pep_mem_name    NONCLUSTERED (primary_name),
      INDEX IX_pep_mem_source  NONCLUSTERED (source)
    ) WITH (MEMORY_OPTIMIZED = ON, DURABILITY = SCHEMA_ONLY)
  `);
  console.log('[Setup] ✓ pep_entries_mem created successfully');

  // ── Step 3: Verify ──────────────────────────────────────────────────────────
  const verify = await pool.request().query(
    "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'pep_entries_mem'"
  );
  console.log('[Setup] Table exists:', verify.recordset[0].cnt > 0 ? 'YES ✓' : 'NO ✗');

  await pool.close();
  console.log('[Setup] Done.');
}

run().catch(err => {
  console.error('[Setup] FATAL:', err.message);
  process.exit(1);
});
