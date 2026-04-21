-- ── AI Sentinel Chat History Schema ──────────────────────────────────────────
-- Sessions: one per conversation (browser session or named session)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ai_chat_sessions')
CREATE TABLE ai_chat_sessions (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  session_key   VARCHAR(100)  NOT NULL,          -- UUID or browser session id
  title         NVARCHAR(300) NULL,              -- auto-generated from first question
  asked_by      NVARCHAR(200) NOT NULL DEFAULT 'Compliance Officer',
  created_at    DATETIME2     NOT NULL DEFAULT GETDATE(),
  updated_at    DATETIME2     NOT NULL DEFAULT GETDATE(),
  is_active     BIT           NOT NULL DEFAULT 1
);

-- Messages: each user question + assistant answer pair
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ai_chat_messages')
CREATE TABLE ai_chat_messages (
  id              INT IDENTITY(1,1) PRIMARY KEY,
  session_id      INT           NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role            VARCHAR(20)   NOT NULL CHECK (role IN ('user','assistant','system')),
  content         NVARCHAR(MAX) NOT NULL,
  tokens_used     INT           NULL,
  feedback_score  TINYINT       NULL CHECK (feedback_score BETWEEN 1 AND 5),  -- 1-5 stars
  feedback_note   NVARCHAR(500) NULL,
  created_at      DATETIME2     NOT NULL DEFAULT GETDATE()
);

-- Sources: regulatory / document sources cited per assistant message
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ai_chat_sources')
CREATE TABLE ai_chat_sources (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  message_id  INT           NOT NULL REFERENCES ai_chat_messages(id) ON DELETE CASCADE,
  source_type VARCHAR(50)   NOT NULL DEFAULT 'REGULATION',  -- REGULATION | LIST | DOCUMENT | URL
  source_name NVARCHAR(300) NOT NULL,
  source_ref  NVARCHAR(500) NULL,   -- URL or document reference
  created_at  DATETIME2     NOT NULL DEFAULT GETDATE()
);

-- Indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ai_chat_sessions_key')
  CREATE INDEX IX_ai_chat_sessions_key ON ai_chat_sessions(session_key);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ai_chat_messages_session')
  CREATE INDEX IX_ai_chat_messages_session ON ai_chat_messages(session_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ai_chat_sources_message')
  CREATE INDEX IX_ai_chat_sources_message ON ai_chat_sources(message_id);
