const sql = require('mssql');
const config = {
  server: '203.101.44.46', database: 'sanctions', user: 'shahul', password: 'Apple123!@#',
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
};

const steps = [
  {
    name: 'CREATE ai_chat_sessions',
    sql: `
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ai_chat_sessions')
      CREATE TABLE ai_chat_sessions (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        session_key VARCHAR(100)  NOT NULL,
        title       NVARCHAR(300) NULL,
        asked_by    NVARCHAR(200) NOT NULL DEFAULT 'Compliance Officer',
        created_at  DATETIME2     NOT NULL DEFAULT GETDATE(),
        updated_at  DATETIME2     NOT NULL DEFAULT GETDATE(),
        is_active   BIT           NOT NULL DEFAULT 1
      )`
  },
  {
    name: 'CREATE ai_chat_messages',
    sql: `
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ai_chat_messages')
      CREATE TABLE ai_chat_messages (
        id             INT IDENTITY(1,1) PRIMARY KEY,
        session_id     INT           NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
        role           VARCHAR(20)   NOT NULL,
        content        NVARCHAR(MAX) NOT NULL,
        tokens_used    INT           NULL,
        feedback_score TINYINT       NULL,
        feedback_note  NVARCHAR(500) NULL,
        created_at     DATETIME2     NOT NULL DEFAULT GETDATE()
      )`
  },
  {
    name: 'CREATE ai_chat_sources',
    sql: `
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ai_chat_sources')
      CREATE TABLE ai_chat_sources (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        message_id  INT           NOT NULL REFERENCES ai_chat_messages(id) ON DELETE CASCADE,
        source_type VARCHAR(50)   NOT NULL DEFAULT 'REGULATION',
        source_name NVARCHAR(300) NOT NULL,
        source_ref  NVARCHAR(500) NULL,
        created_at  DATETIME2     NOT NULL DEFAULT GETDATE()
      )`
  },
  {
    name: 'INDEX sessions key',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ai_chat_sessions_key' AND object_id=OBJECT_ID('ai_chat_sessions'))
          CREATE INDEX IX_ai_chat_sessions_key ON ai_chat_sessions(session_key)`
  },
  {
    name: 'INDEX messages session',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ai_chat_messages_session' AND object_id=OBJECT_ID('ai_chat_messages'))
          CREATE INDEX IX_ai_chat_messages_session ON ai_chat_messages(session_id)`
  },
  {
    name: 'INDEX sources message',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ai_chat_sources_message' AND object_id=OBJECT_ID('ai_chat_sources'))
          CREATE INDEX IX_ai_chat_sources_message ON ai_chat_sources(message_id)`
  }
];

async function run() {
  const pool = await sql.connect(config);
  for (const step of steps) {
    try {
      await pool.request().query(step.sql);
      console.log('✓', step.name);
    } catch (e) {
      console.error('✗', step.name, '-', e.message);
    }
  }
  const r = await pool.request().query("SELECT name FROM sys.tables WHERE name LIKE 'ai_%' ORDER BY name");
  console.log('\nAI tables now in DB:', r.recordset.map(x => x.name).join(', '));
  await pool.close();
}
run().catch(console.error);
