-- ============================================================
-- SANCTIONS ENGINE DATABASE SCHEMA
-- SQL Server 2025 - sanctions database
-- ============================================================

-- ============================================================
-- SECTION 1: SANCTIONS LISTS & ENTRIES
-- ============================================================

-- Sanctions List Sources
CREATE TABLE sanctions_list_sources (
    id INT IDENTITY(1,1) PRIMARY KEY,
    source_code NVARCHAR(20) NOT NULL UNIQUE,  -- OFAC, UN, EU, UK, SECO, DFAT, MAS
    source_name NVARCHAR(200) NOT NULL,
    source_url NVARCHAR(500),
    api_endpoint NVARCHAR(500),
    download_url NVARCHAR(500),
    jurisdiction NVARCHAR(100),
    currency_scope NVARCHAR(200),
    is_active BIT DEFAULT 1,
    last_scraped DATETIME2,
    last_scrape_status NVARCHAR(50),
    scrape_interval_hours INT DEFAULT 3,
    total_entries INT DEFAULT 0,
    description NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- Sanctions Entries (Master)
CREATE TABLE sanctions_entries (
    id INT IDENTITY(1,1) PRIMARY KEY,
    source_id INT NOT NULL REFERENCES sanctions_list_sources(id),
    external_id NVARCHAR(100),           -- OFAC UID, EU ref, UN QDe/QDi, UK ID
    entry_type NVARCHAR(50),             -- INDIVIDUAL, ENTITY, VESSEL, AIRCRAFT
    primary_name NVARCHAR(500) NOT NULL,
    name_original_script NVARCHAR(500),  -- Arabic, Cyrillic, Chinese etc.
    dob NVARCHAR(100),                   -- Date of birth (string for flexibility)
    pob NVARCHAR(200),                   -- Place of birth
    nationality NVARCHAR(200),
    passport_number NVARCHAR(100),
    national_id NVARCHAR(100),
    gender NVARCHAR(20),
    title NVARCHAR(100),
    position NVARCHAR(200),
    programme NVARCHAR(200),             -- SDN, SSI, IRAN, RUSSIA etc.
    listing_date DATE,
    last_updated DATE,
    delisted_date DATE,
    status NVARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, DELISTED, UPDATED
    remarks NVARCHAR(MAX),
    raw_data NVARCHAR(MAX),              -- JSON of original record
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- Sanctions Aliases (AKAs)
CREATE TABLE sanctions_aliases (
    id INT IDENTITY(1,1) PRIMARY KEY,
    entry_id INT NOT NULL REFERENCES sanctions_entries(id),
    alias_name NVARCHAR(500) NOT NULL,
    alias_type NVARCHAR(50),             -- AKA, FKA, NFM (Name for Matching)
    alias_quality NVARCHAR(50),          -- STRONG, WEAK
    script NVARCHAR(50),
    created_at DATETIME2 DEFAULT GETDATE()
);

-- Sanctions Addresses
CREATE TABLE sanctions_addresses (
    id INT IDENTITY(1,1) PRIMARY KEY,
    entry_id INT NOT NULL REFERENCES sanctions_entries(id),
    address1 NVARCHAR(500),
    address2 NVARCHAR(500),
    city NVARCHAR(200),
    state_province NVARCHAR(200),
    postal_code NVARCHAR(50),
    country NVARCHAR(100),
    country_code NVARCHAR(10),
    created_at DATETIME2 DEFAULT GETDATE()
);

-- Sanctions Identifiers (Passports, LEI, IMO, etc.)
CREATE TABLE sanctions_identifiers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    entry_id INT NOT NULL REFERENCES sanctions_entries(id),
    id_type NVARCHAR(100),               -- PASSPORT, NATIONAL_ID, LEI, IMO, VESSEL_REG, TAX_ID
    id_value NVARCHAR(200),
    id_country NVARCHAR(100),
    issued_date DATE,
    expiry_date DATE,
    created_at DATETIME2 DEFAULT GETDATE()
);

-- Sanctions Change Log (Delta tracking)
CREATE TABLE sanctions_change_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    source_id INT NOT NULL REFERENCES sanctions_list_sources(id),
    entry_id INT REFERENCES sanctions_entries(id),
    external_id NVARCHAR(100),
    change_type NVARCHAR(20),            -- ADD, UPDATE, DELETE
    changed_fields NVARCHAR(MAX),        -- JSON of what changed
    previous_values NVARCHAR(MAX),       -- JSON of old values
    new_values NVARCHAR(MAX),            -- JSON of new values
    scrape_run_id NVARCHAR(100),
    processed_at DATETIME2 DEFAULT GETDATE()
);

-- Scrape Run History
CREATE TABLE scrape_run_history (
    id INT IDENTITY(1,1) PRIMARY KEY,
    run_id NVARCHAR(100) NOT NULL UNIQUE,
    source_id INT NOT NULL REFERENCES sanctions_list_sources(id),
    started_at DATETIME2 DEFAULT GETDATE(),
    completed_at DATETIME2,
    status NVARCHAR(50),                 -- RUNNING, SUCCESS, FAILED, PARTIAL
    records_downloaded INT DEFAULT 0,
    records_added INT DEFAULT 0,
    records_updated INT DEFAULT 0,
    records_deleted INT DEFAULT 0,
    error_message NVARCHAR(MAX),
    file_path NVARCHAR(500),
    file_hash NVARCHAR(100)
);

-- ============================================================
-- SECTION 2: SCREENING ENGINE
-- ============================================================

-- Screening Requests
CREATE TABLE screening_requests (
    id INT IDENTITY(1,1) PRIMARY KEY,
    request_id NVARCHAR(100) NOT NULL UNIQUE,
    request_type NVARCHAR(50),           -- INDIVIDUAL, ENTITY, VESSEL, TRANSACTION, BATCH
    source_system NVARCHAR(100),         -- TRADE_FINANCE, CORE_BANKING, MANUAL, API
    requested_by NVARCHAR(200),
    priority NVARCHAR(20) DEFAULT 'NORMAL', -- HIGH, NORMAL, LOW
    status NVARCHAR(50) DEFAULT 'PENDING',  -- PENDING, SCREENING, COMPLETED, FAILED
    total_subjects INT DEFAULT 0,
    completed_subjects INT DEFAULT 0,
    overall_result NVARCHAR(50),         -- CLEAR, POTENTIAL_MATCH, BLOCKED, REVIEW
    started_at DATETIME2 DEFAULT GETDATE(),
    completed_at DATETIME2,
    metadata NVARCHAR(MAX)               -- JSON
);

-- Screening Subjects
CREATE TABLE screening_subjects (
    id INT IDENTITY(1,1) PRIMARY KEY,
    request_id INT NOT NULL REFERENCES screening_requests(id),
    subject_type NVARCHAR(50),           -- INDIVIDUAL, ENTITY, VESSEL, COUNTRY, BANK
    subject_name NVARCHAR(500) NOT NULL,
    subject_role NVARCHAR(100),          -- APPLICANT, BENEFICIARY, VESSEL, PORT, etc.
    dob NVARCHAR(100),
    nationality NVARCHAR(100),
    country NVARCHAR(100),
    identifier_type NVARCHAR(100),
    identifier_value NVARCHAR(200),
    additional_info NVARCHAR(MAX),       -- JSON
    screening_result NVARCHAR(50),       -- CLEAR, POTENTIAL_MATCH, BLOCKED
    match_score DECIMAL(5,2),
    screened_at DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE()
);

-- Screening Matches (Hits)
CREATE TABLE screening_matches (
    id INT IDENTITY(1,1) PRIMARY KEY,
    subject_id INT NOT NULL REFERENCES screening_subjects(id),
    entry_id INT NOT NULL REFERENCES sanctions_entries(id),
    match_score DECIMAL(5,2) NOT NULL,
    match_type NVARCHAR(50),             -- EXACT, FUZZY, PHONETIC, ALIAS, TRANSLITERATION
    matched_field NVARCHAR(100),         -- PRIMARY_NAME, ALIAS, IDENTIFIER
    matched_value NVARCHAR(500),
    list_source NVARCHAR(50),
    programme NVARCHAR(200),
    is_true_match BIT,
    disposition NVARCHAR(50),            -- PENDING, TRUE_MATCH, FALSE_POSITIVE, ESCALATED
    analyst_id NVARCHAR(100),
    analyst_notes NVARCHAR(MAX),
    reviewed_at DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE()
);

-- Screening Alerts
CREATE TABLE screening_alerts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    alert_id NVARCHAR(100) NOT NULL UNIQUE,
    request_id INT REFERENCES screening_requests(id),
    subject_id INT REFERENCES screening_subjects(id),
    match_id INT REFERENCES screening_matches(id),
    alert_type NVARCHAR(50),             -- POTENTIAL_MATCH, BLOCKED, REVIEW_REQUIRED
    severity NVARCHAR(20),               -- CRITICAL, HIGH, MEDIUM, LOW
    title NVARCHAR(500),
    description NVARCHAR(MAX),
    status NVARCHAR(50) DEFAULT 'OPEN',  -- OPEN, IN_REVIEW, CLOSED, ESCALATED
    assigned_to NVARCHAR(200),
    due_date DATE,
    resolved_at DATETIME2,
    resolution NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 3: CASE MANAGEMENT
-- ============================================================

-- Cases
CREATE TABLE cases (
    id INT IDENTITY(1,1) PRIMARY KEY,
    case_number NVARCHAR(50) NOT NULL UNIQUE,
    case_type NVARCHAR(50),              -- SANCTIONS_HIT, FALSE_POSITIVE, INVESTIGATION
    alert_id INT REFERENCES screening_alerts(id),
    subject_name NVARCHAR(500),
    subject_type NVARCHAR(50),
    priority NVARCHAR(20) DEFAULT 'MEDIUM',
    status NVARCHAR(50) DEFAULT 'OPEN',  -- OPEN, IN_REVIEW, PENDING_APPROVAL, CLOSED, ESCALATED
    assigned_analyst NVARCHAR(200),
    supervising_officer NVARCHAR(200),
    description NVARCHAR(MAX),
    decision NVARCHAR(50),               -- TRUE_MATCH, FALSE_POSITIVE, INCONCLUSIVE
    decision_rationale NVARCHAR(MAX),
    sar_filed BIT DEFAULT 0,
    sar_reference NVARCHAR(100),
    blocked_property_reported BIT DEFAULT 0,
    regulatory_disclosure NVARCHAR(MAX),
    opened_at DATETIME2 DEFAULT GETDATE(),
    closed_at DATETIME2,
    sla_due_date DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- Case Notes
CREATE TABLE case_notes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    case_id INT NOT NULL REFERENCES cases(id),
    note_type NVARCHAR(50),              -- ANALYST_NOTE, DECISION, ESCALATION, SYSTEM
    note_text NVARCHAR(MAX) NOT NULL,
    created_by NVARCHAR(200),
    created_at DATETIME2 DEFAULT GETDATE()
);

-- Case Documents
CREATE TABLE case_documents (
    id INT IDENTITY(1,1) PRIMARY KEY,
    case_id INT NOT NULL REFERENCES cases(id),
    document_name NVARCHAR(300),
    document_type NVARCHAR(100),
    file_path NVARCHAR(500),
    uploaded_by NVARCHAR(200),
    uploaded_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 4: AUDIT TRAIL
-- ============================================================

CREATE TABLE audit_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    event_type NVARCHAR(100),
    entity_type NVARCHAR(100),
    entity_id NVARCHAR(100),
    action NVARCHAR(50),                 -- CREATE, READ, UPDATE, DELETE, SCREEN, APPROVE
    performed_by NVARCHAR(200),
    ip_address NVARCHAR(50),
    old_values NVARCHAR(MAX),
    new_values NVARCHAR(MAX),
    description NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 5: VESSELS & MARITIME
-- ============================================================

CREATE TABLE vessels (
    id INT IDENTITY(1,1) PRIMARY KEY,
    imo_number NVARCHAR(20) UNIQUE,
    vessel_name NVARCHAR(300) NOT NULL,
    vessel_type NVARCHAR(100),
    flag_state NVARCHAR(100),
    flag_country_code NVARCHAR(10),
    gross_tonnage DECIMAL(12,2),
    year_built INT,
    owner_name NVARCHAR(300),
    operator_name NVARCHAR(300),
    manager_name NVARCHAR(300),
    call_sign NVARCHAR(50),
    mmsi NVARCHAR(20),
    is_sanctioned BIT DEFAULT 0,
    sanctions_entry_id INT REFERENCES sanctions_entries(id),
    last_known_port NVARCHAR(200),
    last_known_position NVARCHAR(200),
    risk_rating NVARCHAR(20),            -- HIGH, MEDIUM, LOW
    notes NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 6: COUNTRIES & JURISDICTIONS
-- ============================================================

CREATE TABLE countries (
    id INT IDENTITY(1,1) PRIMARY KEY,
    country_code NVARCHAR(10) NOT NULL UNIQUE,
    country_name NVARCHAR(200) NOT NULL,
    iso_alpha3 NVARCHAR(10),
    region NVARCHAR(100),
    sub_region NVARCHAR(100),
    is_sanctioned BIT DEFAULT 0,
    is_high_risk BIT DEFAULT 0,
    is_fatf_blacklist BIT DEFAULT 0,
    is_fatf_greylist BIT DEFAULT 0,
    sanctions_programmes NVARCHAR(500),  -- Comma-separated
    risk_rating NVARCHAR(20),            -- PROHIBITED, HIGH, MEDIUM, LOW
    risk_notes NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 7: CORE BANKING - CUSTOMERS
-- ============================================================

CREATE TABLE core_customers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id NVARCHAR(50) NOT NULL UNIQUE,
    customer_type NVARCHAR(50),          -- INDIVIDUAL, CORPORATE, SME, GOVERNMENT
    title NVARCHAR(20),
    first_name NVARCHAR(200),
    last_name NVARCHAR(200),
    full_name NVARCHAR(500) NOT NULL,
    date_of_birth DATE,
    gender NVARCHAR(20),
    nationality NVARCHAR(100),
    country_of_residence NVARCHAR(100),
    id_type NVARCHAR(50),
    id_number NVARCHAR(100),
    id_expiry DATE,
    tax_id NVARCHAR(100),
    email NVARCHAR(300),
    phone NVARCHAR(50),
    mobile NVARCHAR(50),
    address_line1 NVARCHAR(300),
    address_line2 NVARCHAR(300),
    city NVARCHAR(100),
    state NVARCHAR(100),
    postal_code NVARCHAR(20),
    country NVARCHAR(100),
    occupation NVARCHAR(200),
    employer NVARCHAR(300),
    annual_income DECIMAL(18,2),
    kyc_status NVARCHAR(50) DEFAULT 'PENDING', -- PENDING, VERIFIED, EXPIRED, REJECTED
    kyc_date DATE,
    kyc_expiry DATE,
    risk_rating NVARCHAR(20) DEFAULT 'LOW',
    pep_status BIT DEFAULT 0,
    sanctions_status NVARCHAR(50) DEFAULT 'CLEAR', -- CLEAR, FLAGGED, BLOCKED
    last_screened DATETIME2,
    relationship_manager NVARCHAR(200),
    segment NVARCHAR(50),                -- RETAIL, PREMIUM, PRIVATE, CORPORATE
    status NVARCHAR(20) DEFAULT 'ACTIVE',
    onboarding_date DATE DEFAULT GETDATE(),
    notes NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- Corporate Customers (Extended)
CREATE TABLE core_corporate_customers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES core_customers(id),
    company_registration_number NVARCHAR(100),
    lei_number NVARCHAR(50),             -- Legal Entity Identifier
    incorporation_country NVARCHAR(100),
    incorporation_date DATE,
    business_type NVARCHAR(100),
    industry_code NVARCHAR(20),
    industry_description NVARCHAR(200),
    annual_turnover DECIMAL(18,2),
    number_of_employees INT,
    website NVARCHAR(300),
    parent_company NVARCHAR(300),
    ultimate_beneficial_owner NVARCHAR(500),
    ubo_nationality NVARCHAR(100),
    ubo_ownership_percent DECIMAL(5,2),
    created_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 8: CORE BANKING - ACCOUNTS
-- ============================================================

CREATE TABLE core_accounts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    account_number NVARCHAR(50) NOT NULL UNIQUE,
    customer_id INT NOT NULL REFERENCES core_customers(id),
    account_type NVARCHAR(50),           -- CURRENT, SAVINGS, FIXED_DEPOSIT, LOAN, CREDIT
    account_category NVARCHAR(50),       -- ASSET, LIABILITY
    currency NVARCHAR(10) DEFAULT 'USD',
    balance DECIMAL(18,2) DEFAULT 0,
    available_balance DECIMAL(18,2) DEFAULT 0,
    hold_amount DECIMAL(18,2) DEFAULT 0,
    interest_rate DECIMAL(8,4),
    credit_limit DECIMAL(18,2),
    status NVARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, DORMANT, FROZEN, CLOSED
    freeze_reason NVARCHAR(500),
    opened_date DATE DEFAULT GETDATE(),
    maturity_date DATE,
    branch_code NVARCHAR(20),
    branch_name NVARCHAR(200),
    iban NVARCHAR(50),
    swift_bic NVARCHAR(20),
    sanctions_hold BIT DEFAULT 0,
    sanctions_hold_reason NVARCHAR(500),
    last_transaction_date DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 9: CORE BANKING - ASSETS
-- ============================================================

CREATE TABLE core_assets (
    id INT IDENTITY(1,1) PRIMARY KEY,
    asset_id NVARCHAR(50) NOT NULL UNIQUE,
    customer_id INT NOT NULL REFERENCES core_customers(id),
    account_id INT REFERENCES core_accounts(id),
    asset_type NVARCHAR(100),            -- LOAN, MORTGAGE, OVERDRAFT, TRADE_FINANCE, INVESTMENT
    asset_name NVARCHAR(300),
    principal_amount DECIMAL(18,2),
    outstanding_balance DECIMAL(18,2),
    currency NVARCHAR(10) DEFAULT 'USD',
    interest_rate DECIMAL(8,4),
    origination_date DATE,
    maturity_date DATE,
    collateral_type NVARCHAR(100),
    collateral_value DECIMAL(18,2),
    collateral_description NVARCHAR(500),
    status NVARCHAR(50) DEFAULT 'ACTIVE',
    risk_classification NVARCHAR(50),    -- STANDARD, WATCH, SUBSTANDARD, DOUBTFUL, LOSS
    sanctions_flag BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 10: CORE BANKING - LIABILITIES
-- ============================================================

CREATE TABLE core_liabilities (
    id INT IDENTITY(1,1) PRIMARY KEY,
    liability_id NVARCHAR(50) NOT NULL UNIQUE,
    customer_id INT NOT NULL REFERENCES core_customers(id),
    account_id INT REFERENCES core_accounts(id),
    liability_type NVARCHAR(100),        -- DEPOSIT, SAVINGS, FIXED_DEPOSIT, BOND, BORROWING
    liability_name NVARCHAR(300),
    principal_amount DECIMAL(18,2),
    outstanding_balance DECIMAL(18,2),
    currency NVARCHAR(10) DEFAULT 'USD',
    interest_rate DECIMAL(8,4),
    origination_date DATE,
    maturity_date DATE,
    status NVARCHAR(50) DEFAULT 'ACTIVE',
    sanctions_flag BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 11: CORE BANKING - TRANSACTIONS
-- ============================================================

CREATE TABLE core_transactions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    transaction_id NVARCHAR(100) NOT NULL UNIQUE,
    account_id INT NOT NULL REFERENCES core_accounts(id),
    transaction_type NVARCHAR(50),       -- DEBIT, CREDIT, TRANSFER, PAYMENT
    transaction_category NVARCHAR(100),
    amount DECIMAL(18,2) NOT NULL,
    currency NVARCHAR(10) DEFAULT 'USD',
    exchange_rate DECIMAL(12,6) DEFAULT 1,
    amount_usd DECIMAL(18,2),
    description NVARCHAR(500),
    reference_number NVARCHAR(100),
    counterparty_name NVARCHAR(300),
    counterparty_account NVARCHAR(100),
    counterparty_bank NVARCHAR(300),
    counterparty_country NVARCHAR(100),
    originating_country NVARCHAR(100),
    destination_country NVARCHAR(100),
    channel NVARCHAR(50),                -- SWIFT, ACH, WIRE, INTERNAL, TRADE
    status NVARCHAR(50) DEFAULT 'PENDING',
    sanctions_screened BIT DEFAULT 0,
    sanctions_result NVARCHAR(50),       -- CLEAR, FLAGGED, BLOCKED
    screening_request_id INT REFERENCES screening_requests(id),
    value_date DATE,
    transaction_date DATETIME2 DEFAULT GETDATE(),
    created_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 12: TRADE FINANCE
-- ============================================================

CREATE TABLE trade_finance_lc (
    id INT IDENTITY(1,1) PRIMARY KEY,
    lc_number NVARCHAR(50) NOT NULL UNIQUE,
    lc_type NVARCHAR(50),                -- IMPORT, EXPORT, STANDBY, TRANSFERABLE
    applicant_id INT REFERENCES core_customers(id),
    applicant_name NVARCHAR(300),
    beneficiary_name NVARCHAR(300),
    beneficiary_country NVARCHAR(100),
    advising_bank NVARCHAR(300),
    confirming_bank NVARCHAR(300),
    issuing_bank NVARCHAR(300),
    amount DECIMAL(18,2),
    currency NVARCHAR(10),
    expiry_date DATE,
    latest_shipment_date DATE,
    port_of_loading NVARCHAR(200),
    port_of_discharge NVARCHAR(200),
    transshipment_ports NVARCHAR(500),
    goods_description NVARCHAR(MAX),
    hs_codes NVARCHAR(500),
    vessel_name NVARCHAR(300),
    imo_number NVARCHAR(20),
    incoterms NVARCHAR(20),
    status NVARCHAR(50) DEFAULT 'DRAFT',
    sanctions_status NVARCHAR(50) DEFAULT 'PENDING',
    screening_request_id INT REFERENCES screening_requests(id),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 13: WATCHLISTS (Internal)
-- ============================================================

CREATE TABLE internal_watchlist (
    id INT IDENTITY(1,1) PRIMARY KEY,
    watchlist_type NVARCHAR(50),         -- PEP, ADVERSE_MEDIA, INTERNAL_BLACKLIST, GREYLIST
    entity_type NVARCHAR(50),
    entity_name NVARCHAR(500) NOT NULL,
    aliases NVARCHAR(MAX),
    dob NVARCHAR(100),
    nationality NVARCHAR(100),
    country NVARCHAR(100),
    reason NVARCHAR(MAX),
    source NVARCHAR(200),
    risk_level NVARCHAR(20),
    added_by NVARCHAR(200),
    review_date DATE,
    status NVARCHAR(20) DEFAULT 'ACTIVE',
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 14: CONFIGURATION & RULES
-- ============================================================

CREATE TABLE screening_rules (
    id INT IDENTITY(1,1) PRIMARY KEY,
    rule_code NVARCHAR(50) NOT NULL UNIQUE,
    rule_name NVARCHAR(200) NOT NULL,
    rule_type NVARCHAR(50),              -- THRESHOLD, FUZZY, EXACT, PHONETIC
    description NVARCHAR(MAX),
    match_threshold DECIMAL(5,2),        -- 0-100 score
    auto_block_threshold DECIMAL(5,2),
    review_threshold DECIMAL(5,2),
    applies_to NVARCHAR(200),            -- JSON array of entity types
    lists_to_check NVARCHAR(500),        -- JSON array of source codes
    is_active BIT DEFAULT 1,
    priority INT DEFAULT 100,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 15: REPORTS
-- ============================================================

CREATE TABLE reports (
    id INT IDENTITY(1,1) PRIMARY KEY,
    report_id NVARCHAR(100) NOT NULL UNIQUE,
    report_type NVARCHAR(100),
    report_name NVARCHAR(300),
    generated_by NVARCHAR(200),
    parameters NVARCHAR(MAX),            -- JSON
    status NVARCHAR(50) DEFAULT 'PENDING',
    file_path NVARCHAR(500),
    row_count INT,
    generated_at DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- SECTION 16: USERS & ROLES (Basic)
-- ============================================================

CREATE TABLE app_users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(100) NOT NULL UNIQUE,
    full_name NVARCHAR(300),
    email NVARCHAR(300),
    role NVARCHAR(50),                   -- ADMIN, ANALYST, OFFICER, VIEWER
    department NVARCHAR(100),
    is_active BIT DEFAULT 1,
    last_login DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_sanctions_entries_source ON sanctions_entries(source_id);
CREATE INDEX idx_sanctions_entries_type ON sanctions_entries(entry_type);
CREATE INDEX idx_sanctions_entries_status ON sanctions_entries(status);
CREATE INDEX idx_sanctions_entries_name ON sanctions_entries(primary_name);
CREATE INDEX idx_sanctions_aliases_entry ON sanctions_aliases(entry_id);
CREATE INDEX idx_sanctions_aliases_name ON sanctions_aliases(alias_name);
CREATE INDEX idx_screening_requests_status ON screening_requests(status);
CREATE INDEX idx_screening_subjects_request ON screening_subjects(request_id);
CREATE INDEX idx_screening_matches_subject ON screening_matches(subject_id);
CREATE INDEX idx_screening_alerts_status ON screening_alerts(status);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_core_customers_id ON core_customers(customer_id);
CREATE INDEX idx_core_accounts_customer ON core_accounts(customer_id);
CREATE INDEX idx_core_transactions_account ON core_transactions(account_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
