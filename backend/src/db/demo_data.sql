-- ============================================================
-- DEMO DATA FOR SANCTIONS ENGINE
-- ============================================================

-- ============================================================
-- SANCTIONS LIST SOURCES
-- ============================================================
INSERT INTO sanctions_list_sources (source_code, source_name, source_url, download_url, jurisdiction, currency_scope, scrape_interval_hours, description) VALUES
('OFAC', 'OFAC Specially Designated Nationals', 'https://ofac.treasury.gov', 'https://ofac.treasury.gov/downloads/sdn.xml', 'United States', 'USD and all currencies via correspondent banking', 3, 'US Treasury Office of Foreign Assets Control - SDN, SSI, and country-level embargoes'),
('EU', 'EU Consolidated Financial Sanctions List', 'https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions', 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content', 'European Union', 'EUR and EU-incorporated entities', 3, 'European Union consolidated sanctions list covering all EU sanctions regimes'),
('UN', 'UN Security Council Consolidated List', 'https://www.un.org/securitycouncil/content/un-sc-consolidated-list', 'https://scsanctions.un.org/resources/xml/en/consolidated.xml', 'United Nations', 'All currencies - binding on all UN member states', 6, 'UN Security Council sanctions including ISIL/Al-Qaida, DPRK, Iran, Sudan, Somalia'),
('UK', 'UK OFSI Consolidated Sanctions List', 'https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets', 'https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/ConList.csv', 'United Kingdom', 'GBP and UK-incorporated entities', 3, 'HM Treasury Office of Financial Sanctions Implementation - post-Brexit UK autonomous list'),
('SECO', 'SECO Swiss Sanctions List', 'https://www.seco.admin.ch/seco/en/home/Aussenwirtschaftspolitik_Wirtschaftliche_Zusammenarbeit/Wirtschaftsbeziehungen/exportkontrollen-und-sanktionen/sanktionen-embargos.html', 'https://www.sesam.search.admin.ch/sesam-search-web/pages/downloadXmlGesamtliste.xhtml', 'Switzerland', 'CHF and Swiss entities', 6, 'Swiss State Secretariat for Economic Affairs sanctions list'),
('DFAT', 'DFAT Australia Consolidated Sanctions List', 'https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list', 'https://www.dfat.gov.au/sites/default/files/regulation8_consolidated.xlsx', 'Australia', 'AUD and Australian entities', 6, 'Australian Department of Foreign Affairs and Trade autonomous sanctions'),
('MAS', 'MAS Singapore Sanctions List', 'https://www.mas.gov.sg/regulation/anti-money-laundering/targeted-financial-sanctions', 'https://www.mas.gov.sg/regulation/anti-money-laundering/targeted-financial-sanctions/lists-of-designated-individuals-and-entities', 'Singapore', 'SGD and Singapore entities', 6, 'Monetary Authority of Singapore - implements UN designations plus autonomous MAS designations');

-- ============================================================
-- COUNTRIES
-- ============================================================
INSERT INTO countries (country_code, country_name, iso_alpha3, region, is_sanctioned, is_high_risk, is_fatf_blacklist, is_fatf_greylist, sanctions_programmes, risk_rating) VALUES
('IR', 'Iran', 'IRN', 'Middle East', 1, 1, 1, 0, 'OFAC-IRAN,EU-IRAN,UN-IRAN,UK-IRAN', 'PROHIBITED'),
('KP', 'North Korea', 'PRK', 'East Asia', 1, 1, 1, 0, 'OFAC-DPRK,EU-DPRK,UN-DPRK,UK-DPRK', 'PROHIBITED'),
('SY', 'Syria', 'SYR', 'Middle East', 1, 1, 0, 0, 'OFAC-SYRIA,EU-SYRIA,UN-SYRIA', 'PROHIBITED'),
('CU', 'Cuba', 'CUB', 'Caribbean', 1, 1, 0, 0, 'OFAC-CUBA', 'PROHIBITED'),
('RU', 'Russia', 'RUS', 'Eastern Europe', 0, 1, 0, 0, 'OFAC-RUSSIA,EU-RUSSIA,UK-RUSSIA', 'HIGH'),
('BY', 'Belarus', 'BLR', 'Eastern Europe', 0, 1, 0, 0, 'OFAC-BELARUS,EU-BELARUS,UK-BELARUS', 'HIGH'),
('MM', 'Myanmar', 'MMR', 'Southeast Asia', 0, 1, 0, 1, 'OFAC-BURMA,EU-MYANMAR', 'HIGH'),
('SD', 'Sudan', 'SDN', 'Africa', 0, 1, 0, 0, 'OFAC-SUDAN,UN-SUDAN', 'HIGH'),
('VE', 'Venezuela', 'VEN', 'South America', 0, 1, 0, 0, 'OFAC-VENEZUELA', 'HIGH'),
('LY', 'Libya', 'LBY', 'North Africa', 0, 1, 0, 0, 'OFAC-LIBYA,EU-LIBYA,UN-LIBYA', 'HIGH'),
('YE', 'Yemen', 'YEM', 'Middle East', 0, 1, 0, 0, 'OFAC-YEMEN,UN-YEMEN', 'HIGH'),
('AF', 'Afghanistan', 'AFG', 'South Asia', 0, 1, 0, 1, 'OFAC-TALIBAN,UN-TALIBAN', 'HIGH'),
('PK', 'Pakistan', 'PAK', 'South Asia', 0, 0, 0, 1, '', 'MEDIUM'),
('US', 'United States', 'USA', 'North America', 0, 0, 0, 0, '', 'LOW'),
('GB', 'United Kingdom', 'GBR', 'Western Europe', 0, 0, 0, 0, '', 'LOW'),
('DE', 'Germany', 'DEU', 'Western Europe', 0, 0, 0, 0, '', 'LOW'),
('FR', 'France', 'FRA', 'Western Europe', 0, 0, 0, 0, '', 'LOW'),
('AE', 'United Arab Emirates', 'ARE', 'Middle East', 0, 0, 0, 0, '', 'LOW'),
('SG', 'Singapore', 'SGP', 'Southeast Asia', 0, 0, 0, 0, '', 'LOW'),
('IN', 'India', 'IND', 'South Asia', 0, 0, 0, 0, '', 'LOW'),
('CN', 'China', 'CHN', 'East Asia', 0, 0, 0, 0, '', 'MEDIUM'),
('HK', 'Hong Kong', 'HKG', 'East Asia', 0, 0, 0, 0, '', 'LOW'),
('CH', 'Switzerland', 'CHE', 'Western Europe', 0, 0, 0, 0, '', 'LOW'),
('JP', 'Japan', 'JPN', 'East Asia', 0, 0, 0, 0, '', 'LOW'),
('AU', 'Australia', 'AUS', 'Oceania', 0, 0, 0, 0, '', 'LOW');

-- ============================================================
-- SANCTIONS ENTRIES - OFAC SDN (Demo)
-- ============================================================
INSERT INTO sanctions_entries (source_id, external_id, entry_type, primary_name, dob, nationality, programme, listing_date, status, remarks) VALUES
(1, '36', 'ENTITY', 'AL-QAIDA', NULL, 'AF', 'SDGT', '2001-10-12', 'ACTIVE', 'Global terrorist organization'),
(1, '6365', 'INDIVIDUAL', 'AL-BAGHDADI, Abu Bakr', '1971-07-28', 'IQ', 'SDGT', '2004-02-24', 'ACTIVE', 'Former leader of ISIL/ISIS'),
(1, '9702', 'INDIVIDUAL', 'ZARIF, Mohammad Javad', '1960-01-08', 'IR', 'IRAN', '2019-07-31', 'ACTIVE', 'Former Iranian Foreign Minister'),
(1, '15148', 'ENTITY', 'MAHAN AIR', NULL, 'IR', 'IRAN', '2011-10-12', 'ACTIVE', 'Iranian airline providing support to IRGC-QF'),
(1, '22543', 'INDIVIDUAL', 'PUTIN, Vladimir Vladimirovich', '1952-10-07', 'RU', 'RUSSIA', '2022-03-11', 'ACTIVE', 'President of the Russian Federation'),
(1, '23891', 'ENTITY', 'SBERBANK OF RUSSIA', NULL, 'RU', 'RUSSIA', '2022-02-24', 'ACTIVE', 'Largest Russian state-owned bank'),
(1, '18234', 'VESSEL', 'FORTUNE', NULL, NULL, 'IRAN', '2020-05-25', 'ACTIVE', 'Iranian tanker vessel'),
(1, '19456', 'INDIVIDUAL', 'KIM, Jong Un', '1984-01-08', 'KP', 'DPRK', '2017-09-21', 'ACTIVE', 'Supreme Leader of North Korea'),
(1, '21234', 'ENTITY', 'KOREA MINING DEVELOPMENT TRADING CORPORATION', NULL, 'KP', 'DPRK', '2009-04-24', 'ACTIVE', 'DPRK arms dealer'),
(1, '24567', 'INDIVIDUAL', 'MADURO, Nicolas', '1962-11-23', 'VE', 'VENEZUELA', '2019-01-28', 'ACTIVE', 'President of Venezuela');

-- OFAC Aliases
INSERT INTO sanctions_aliases (entry_id, alias_name, alias_type, alias_quality) VALUES
(1, 'AL-QAEDA', 'AKA', 'STRONG'),
(1, 'THE BASE', 'AKA', 'STRONG'),
(1, 'ISLAMIC SALVATION FOUNDATION', 'AKA', 'WEAK'),
(2, 'ABU BAKR AL-BAGHDADI', 'AKA', 'STRONG'),
(2, 'IBRAHIM AWAD IBRAHIM ALI AL-BADRI AL-SAMARRAI', 'AKA', 'STRONG'),
(2, 'CALIPH IBRAHIM', 'AKA', 'WEAK'),
(5, 'PUTIN, Vladimir', 'AKA', 'STRONG'),
(5, 'ПУТИН, Владимир Владимирович', 'AKA', 'STRONG'),
(8, 'KIM JONG-UN', 'AKA', 'STRONG'),
(8, 'KIM JONG UN', 'AKA', 'STRONG'),
(9, 'KOMID', 'AKA', 'STRONG'),
(9, 'KOREA MINING DEVELOPMENT CORPORATION', 'AKA', 'STRONG');

-- OFAC Addresses
INSERT INTO sanctions_addresses (entry_id, city, country, country_code) VALUES
(1, 'Kandahar', 'Afghanistan', 'AF'),
(3, 'Tehran', 'Iran', 'IR'),
(4, 'Tehran', 'Iran', 'IR'),
(5, 'Moscow', 'Russia', 'RU'),
(6, 'Moscow', 'Russia', 'RU'),
(8, 'Pyongyang', 'North Korea', 'KP'),
(9, 'Pyongyang', 'North Korea', 'KP');

-- OFAC Identifiers
INSERT INTO sanctions_identifiers (entry_id, id_type, id_value, id_country) VALUES
(3, 'PASSPORT', 'D9004878', 'IR'),
(5, 'PASSPORT', '710021', 'RU'),
(8, 'NATIONAL_ID', 'NK-KJU-001', 'KP'),
(4, 'AIRCRAFT_REG', 'EP-MHD', 'IR');

-- EU Sanctions Entries
INSERT INTO sanctions_entries (source_id, external_id, entry_type, primary_name, dob, nationality, programme, listing_date, status) VALUES
(2, 'EU.5765.26', 'INDIVIDUAL', 'LUKASHENKO, Alexander Grigoryevich', '1954-08-30', 'BY', 'BELARUS', '2020-11-06', 'ACTIVE'),
(2, 'EU.8901.14', 'ENTITY', 'WAGNER GROUP', NULL, 'RU', 'RUSSIA', '2023-01-23', 'ACTIVE'),
(2, 'EU.3421.89', 'INDIVIDUAL', 'DERIPASKA, Oleg Vladimirovich', '1968-01-02', 'RU', 'RUSSIA', '2022-03-15', 'ACTIVE');

-- UN Sanctions Entries
INSERT INTO sanctions_entries (source_id, external_id, entry_type, primary_name, dob, nationality, programme, listing_date, status) VALUES
(3, 'QDe.011', 'ENTITY', 'AL-QAIDA IN THE ISLAMIC MAGHREB', NULL, 'DZ', 'ISIL_ALQAIDA', '2006-10-06', 'ACTIVE'),
(3, 'QDi.001', 'INDIVIDUAL', 'BIN LADEN, Usama Muhammad Awad', '1957-03-10', 'SA', 'ISIL_ALQAIDA', '2001-10-17', 'ACTIVE'),
(3, 'KNe.001', 'ENTITY', 'RECONNAISSANCE GENERAL BUREAU', NULL, 'KP', 'DPRK', '2009-04-24', 'ACTIVE');

-- UK Sanctions Entries
INSERT INTO sanctions_entries (source_id, external_id, entry_type, primary_name, dob, nationality, programme, listing_date, status) VALUES
(4, 'AFG0001', 'INDIVIDUAL', 'OMAR, Mohammed', '1960-01-01', 'AF', 'TALIBAN', '2000-10-19', 'ACTIVE'),
(4, 'RUS0045', 'INDIVIDUAL', 'ABRAMOVICH, Roman Arkadyevich', '1966-10-24', 'RU', 'RUSSIA', '2022-03-10', 'ACTIVE'),
(4, 'RUS0046', 'ENTITY', 'GAZPROM', NULL, 'RU', 'RUSSIA', '2022-04-08', 'ACTIVE');

-- ============================================================
-- VESSELS
-- ============================================================
INSERT INTO vessels (imo_number, vessel_name, vessel_type, flag_state, flag_country_code, gross_tonnage, year_built, owner_name, operator_name, is_sanctioned, risk_rating) VALUES
('9187786', 'FORTUNE', 'OIL TANKER', 'Iran', 'IR', 115000, 2003, 'National Iranian Tanker Company', 'NITC', 1, 'HIGH'),
('9321483', 'PACIFIC BRAVO', 'BULK CARRIER', 'Panama', 'PA', 45000, 2008, 'Pacific Shipping LLC', 'Pacific Shipping LLC', 0, 'MEDIUM'),
('9456789', 'ARCTIC EXPLORER', 'LNG CARRIER', 'Marshall Islands', 'MH', 95000, 2015, 'Arctic LNG Ltd', 'Arctic LNG Ltd', 0, 'LOW'),
('9234567', 'DARK STAR', 'OIL TANKER', 'Belize', 'BZ', 78000, 2001, 'Unknown', 'Unknown', 1, 'HIGH'),
('9876543', 'GLOBAL TRADER', 'CONTAINER SHIP', 'Singapore', 'SG', 55000, 2012, 'Global Shipping Pte Ltd', 'Maersk', 0, 'LOW'),
('9111222', 'IRAN SHAHID RAJAEE', 'GENERAL CARGO', 'Iran', 'IR', 12000, 1998, 'Islamic Republic of Iran Shipping Lines', 'IRISL', 1, 'HIGH');

-- ============================================================
-- CORE CUSTOMERS
-- ============================================================
INSERT INTO core_customers (customer_id, customer_type, title, first_name, last_name, full_name, date_of_birth, gender, nationality, country_of_residence, id_type, id_number, email, phone, mobile, address_line1, city, country, occupation, annual_income, kyc_status, kyc_date, risk_rating, pep_status, sanctions_status, segment, relationship_manager) VALUES
('CUST-001', 'INDIVIDUAL', 'Mr', 'James', 'Richardson', 'James Richardson', '1975-03-15', 'MALE', 'GB', 'GB', 'PASSPORT', 'GB123456789', 'james.richardson@email.com', '+44-20-7946-0958', '+44-7700-900123', '42 Baker Street', 'London', 'GB', 'Investment Banker', 350000, 'VERIFIED', '2024-01-15', 'LOW', 0, 'CLEAR', 'PRIVATE', 'Sarah Mitchell'),
('CUST-002', 'INDIVIDUAL', 'Ms', 'Priya', 'Sharma', 'Priya Sharma', '1982-07-22', 'FEMALE', 'IN', 'AE', 'PASSPORT', 'IN987654321', 'priya.sharma@email.com', '+971-4-555-0123', '+971-50-555-0456', 'Villa 15, Palm Jumeirah', 'Dubai', 'AE', 'Technology Executive', 280000, 'VERIFIED', '2024-02-20', 'LOW', 0, 'CLEAR', 'PREMIUM', 'Ahmed Al-Rashid'),
('CUST-003', 'CORPORATE', NULL, NULL, NULL, 'MERIDIAN TRADING CORPORATION', NULL, NULL, 'AE', 'AE', 'COMPANY_REG', 'AE-DXB-2019-45678', 'compliance@meridiantrading.ae', '+971-4-555-7890', NULL, 'Office 2301, DIFC', 'Dubai', 'AE', NULL, 5000000, 'VERIFIED', '2024-01-10', 'MEDIUM', 0, 'CLEAR', 'CORPORATE', 'Ahmed Al-Rashid'),
('CUST-004', 'INDIVIDUAL', 'Dr', 'Mohammed', 'Al-Hassan', 'Mohammed Al-Hassan', '1968-11-30', 'MALE', 'SA', 'SA', 'NATIONAL_ID', 'SA1234567890', 'malhassan@email.com', '+966-11-555-0789', '+966-50-555-0321', 'Al-Olaya District', 'Riyadh', 'SA', 'Government Official', 180000, 'VERIFIED', '2024-03-05', 'MEDIUM', 1, 'CLEAR', 'PREMIUM', 'Fatima Al-Zahra'),
('CUST-005', 'CORPORATE', NULL, NULL, NULL, 'PHOENIX IMPORT EXPORT LTD', NULL, NULL, 'SG', 'SG', 'COMPANY_REG', 'SG-202012345A', 'info@phoenixie.sg', '+65-6555-0123', NULL, '1 Raffles Place #20-01', 'Singapore', 'SG', NULL, 8500000, 'VERIFIED', '2024-01-25', 'LOW', 0, 'CLEAR', 'CORPORATE', 'David Tan'),
('CUST-006', 'INDIVIDUAL', 'Mr', 'Ivan', 'Petrov', 'Ivan Petrov', '1979-05-14', 'MALE', 'RU', 'CY', 'PASSPORT', 'RU7654321098', 'ipetrov@email.com', '+357-22-555-0456', '+357-99-555-0789', '25 Makarios Avenue', 'Nicosia', 'CY', 'Business Owner', 750000, 'PENDING', '2024-04-01', 'HIGH', 0, 'FLAGGED', 'PREMIUM', 'Elena Stavros'),
('CUST-007', 'CORPORATE', NULL, NULL, NULL, 'GLOBAL COMMODITIES TRADING FZE', NULL, NULL, 'AE', 'AE', 'COMPANY_REG', 'AE-JAFZA-2020-78901', 'info@globalcommodities.ae', '+971-4-555-2345', NULL, 'Jebel Ali Free Zone', 'Dubai', 'AE', NULL, 25000000, 'VERIFIED', '2024-02-15', 'MEDIUM', 0, 'CLEAR', 'CORPORATE', 'Ahmed Al-Rashid'),
('CUST-008', 'INDIVIDUAL', 'Mrs', 'Li', 'Wei', 'Li Wei', '1985-09-08', 'FEMALE', 'CN', 'HK', 'PASSPORT', 'CN123456789HK', 'liwei@email.com', '+852-2555-0678', '+852-9555-0901', 'Flat 12A, The Peak', 'Hong Kong', 'HK', 'Entrepreneur', 500000, 'VERIFIED', '2024-03-12', 'LOW', 0, 'CLEAR', 'PRIVATE', 'Kevin Wong'),
('CUST-009', 'CORPORATE', NULL, NULL, NULL, 'ATLAS SHIPPING & LOGISTICS LLC', NULL, NULL, 'AE', 'AE', 'COMPANY_REG', 'AE-DXB-2018-23456', 'ops@atlasshipping.ae', '+971-4-555-3456', NULL, 'Port Saeed, Deira', 'Dubai', 'AE', NULL, 12000000, 'VERIFIED', '2024-01-30', 'MEDIUM', 0, 'CLEAR', 'CORPORATE', 'Ahmed Al-Rashid'),
('CUST-010', 'INDIVIDUAL', 'Mr', 'Ahmad', 'Karimi', 'Ahmad Karimi', '1972-04-18', 'MALE', 'IR', 'TR', 'PASSPORT', 'IR98765432', 'akarimi@email.com', '+90-212-555-0234', '+90-532-555-0567', 'Beyoglu District', 'Istanbul', 'TR', 'Trader', 95000, 'PENDING', '2024-04-10', 'HIGH', 0, 'FLAGGED', 'RETAIL', 'Mehmet Yilmaz'),
('CUST-011', 'CORPORATE', NULL, NULL, NULL, 'SUNRISE ELECTRONICS MANUFACTURING', NULL, NULL, 'CN', 'CN', 'COMPANY_REG', 'CN-SZ-2015-567890', 'trade@sunriseelec.cn', '+86-755-555-0345', NULL, 'Shenzhen Export Zone', 'Shenzhen', 'CN', NULL, 45000000, 'VERIFIED', '2024-02-28', 'LOW', 0, 'CLEAR', 'CORPORATE', 'Jennifer Liu'),
('CUST-012', 'INDIVIDUAL', 'Mr', 'Robert', 'Mueller', 'Robert Mueller', '1980-12-05', 'MALE', 'DE', 'DE', 'PASSPORT', 'DE456789012', 'rmueller@email.com', '+49-30-555-0456', '+49-171-555-0789', 'Unter den Linden 15', 'Berlin', 'DE', 'Engineer', 120000, 'VERIFIED', '2024-01-20', 'LOW', 0, 'CLEAR', 'RETAIL', 'Klaus Weber');

-- Corporate Customer Extensions
INSERT INTO core_corporate_customers (customer_id, company_registration_number, lei_number, incorporation_country, incorporation_date, business_type, industry_code, annual_turnover, number_of_employees, ultimate_beneficial_owner, ubo_nationality, ubo_ownership_percent) VALUES
(3, 'AE-DXB-2019-45678', '5493001KJTIIGC8Y1R12', 'AE', '2019-03-15', 'TRADING', '4600', 5000000, 45, 'Khalid Al-Maktoum', 'AE', 85.00),
(5, 'SG-202012345A', '213800WSGIIZCXF1P572', 'SG', '2020-06-01', 'IMPORT_EXPORT', '4600', 8500000, 120, 'Chen Wei Liang', 'SG', 100.00),
(7, 'AE-JAFZA-2020-78901', '549300MLUDYVRQOOXS23', 'AE', '2020-01-15', 'COMMODITIES', '4690', 25000000, 85, 'Mohammed Al-Farsi', 'AE', 70.00),
(9, 'AE-DXB-2018-23456', '549300KGCL7WJRDPXB49', 'AE', '2018-07-20', 'SHIPPING', '5200', 12000000, 230, 'Rashid Al-Mansoori', 'AE', 100.00),
(11, 'CN-SZ-2015-567890', '300300E2X5XBAMJYAM93', 'CN', '2015-04-10', 'MANUFACTURING', '2610', 45000000, 1500, 'Zhang Wei', 'CN', 60.00);

-- ============================================================
-- CORE ACCOUNTS
-- ============================================================
INSERT INTO core_accounts (account_number, customer_id, account_type, account_category, currency, balance, available_balance, interest_rate, status, opened_date, branch_code, branch_name) VALUES
('ACC-001-001', 1, 'CURRENT', 'LIABILITY', 'USD', 125000.00, 125000.00, 0.10, 'ACTIVE', '2020-01-15', 'LON001', 'London Main Branch'),
('ACC-001-002', 1, 'SAVINGS', 'LIABILITY', 'GBP', 350000.00, 350000.00, 2.50, 'ACTIVE', '2020-01-15', 'LON001', 'London Main Branch'),
('ACC-002-001', 2, 'CURRENT', 'LIABILITY', 'USD', 85000.00, 85000.00, 0.10, 'ACTIVE', '2021-03-20', 'DXB001', 'Dubai Main Branch'),
('ACC-002-002', 2, 'SAVINGS', 'LIABILITY', 'AED', 450000.00, 450000.00, 2.00, 'ACTIVE', '2021-03-20', 'DXB001', 'Dubai Main Branch'),
('ACC-003-001', 3, 'CURRENT', 'LIABILITY', 'USD', 2500000.00, 2500000.00, 0.25, 'ACTIVE', '2019-05-10', 'DXB001', 'Dubai Main Branch'),
('ACC-003-002', 3, 'CURRENT', 'LIABILITY', 'AED', 1800000.00, 1800000.00, 0.25, 'ACTIVE', '2019-05-10', 'DXB001', 'Dubai Main Branch'),
('ACC-004-001', 4, 'CURRENT', 'LIABILITY', 'USD', 95000.00, 95000.00, 0.10, 'ACTIVE', '2022-01-10', 'RYD001', 'Riyadh Branch'),
('ACC-005-001', 5, 'CURRENT', 'LIABILITY', 'USD', 5500000.00, 5500000.00, 0.25, 'ACTIVE', '2020-07-15', 'SIN001', 'Singapore Branch'),
('ACC-006-001', 6, 'CURRENT', 'LIABILITY', 'EUR', 380000.00, 380000.00, 0.10, 'FROZEN', '2023-02-20', 'NIC001', 'Nicosia Branch'),
('ACC-007-001', 7, 'CURRENT', 'LIABILITY', 'USD', 12000000.00, 12000000.00, 0.25, 'ACTIVE', '2020-03-01', 'DXB001', 'Dubai Main Branch'),
('ACC-008-001', 8, 'CURRENT', 'LIABILITY', 'HKD', 2800000.00, 2800000.00, 0.10, 'ACTIVE', '2021-09-15', 'HKG001', 'Hong Kong Branch'),
('ACC-009-001', 9, 'CURRENT', 'LIABILITY', 'USD', 8500000.00, 8500000.00, 0.25, 'ACTIVE', '2018-08-01', 'DXB001', 'Dubai Main Branch'),
('ACC-010-001', 10, 'CURRENT', 'LIABILITY', 'USD', 45000.00, 45000.00, 0.10, 'ACTIVE', '2023-05-20', 'IST001', 'Istanbul Branch'),
('ACC-011-001', 11, 'CURRENT', 'LIABILITY', 'USD', 18000000.00, 18000000.00, 0.25, 'ACTIVE', '2015-06-01', 'SHG001', 'Shanghai Branch'),
('ACC-012-001', 12, 'CURRENT', 'LIABILITY', 'EUR', 65000.00, 65000.00, 0.10, 'ACTIVE', '2022-03-15', 'BER001', 'Berlin Branch');

-- ============================================================
-- CORE ASSETS (Loans, Mortgages, Trade Finance)
-- ============================================================
INSERT INTO core_assets (asset_id, customer_id, account_id, asset_type, asset_name, principal_amount, outstanding_balance, currency, interest_rate, origination_date, maturity_date, collateral_type, collateral_value, status, risk_classification) VALUES
('ASSET-001', 1, 1, 'MORTGAGE', 'Residential Mortgage - Baker Street', 1500000.00, 1245000.00, 'GBP', 3.25, '2020-01-15', '2045-01-15', 'PROPERTY', 2200000.00, 'ACTIVE', 'STANDARD'),
('ASSET-002', 2, 3, 'PERSONAL_LOAN', 'Personal Loan - Vehicle Finance', 150000.00, 87500.00, 'USD', 6.50, '2022-06-01', '2027-06-01', 'VEHICLE', 120000.00, 'ACTIVE', 'STANDARD'),
('ASSET-003', 3, 5, 'TRADE_FINANCE', 'LC Facility - Import Finance', 5000000.00, 3200000.00, 'USD', 4.75, '2023-01-10', '2024-01-10', 'INVENTORY', 6000000.00, 'ACTIVE', 'STANDARD'),
('ASSET-004', 5, 8, 'TRADE_FINANCE', 'LC Facility - Export Finance', 8000000.00, 5500000.00, 'USD', 4.50, '2023-03-15', '2024-03-15', 'RECEIVABLES', 9000000.00, 'ACTIVE', 'STANDARD'),
('ASSET-005', 7, 11, 'OVERDRAFT', 'Corporate Overdraft Facility', 3000000.00, 1200000.00, 'USD', 7.25, '2023-06-01', '2024-06-01', 'CASH', 3000000.00, 'ACTIVE', 'WATCH'),
('ASSET-006', 9, 13, 'TRADE_FINANCE', 'Shipping Finance Facility', 15000000.00, 12000000.00, 'USD', 5.25, '2022-09-01', '2027-09-01', 'VESSEL', 18000000.00, 'ACTIVE', 'STANDARD'),
('ASSET-007', 11, 15, 'TRADE_FINANCE', 'Export LC Facility - Electronics', 20000000.00, 15000000.00, 'USD', 4.25, '2023-01-01', '2024-01-01', 'INVENTORY', 25000000.00, 'ACTIVE', 'STANDARD'),
('ASSET-008', 4, 7, 'PERSONAL_LOAN', 'Investment Property Loan', 500000.00, 420000.00, 'USD', 5.75, '2021-04-01', '2031-04-01', 'PROPERTY', 750000.00, 'ACTIVE', 'STANDARD');

-- ============================================================
-- CORE LIABILITIES (Deposits, Fixed Deposits)
-- ============================================================
INSERT INTO core_liabilities (liability_id, customer_id, account_id, liability_type, liability_name, principal_amount, outstanding_balance, currency, interest_rate, origination_date, maturity_date, status) VALUES
('LIAB-001', 1, 2, 'SAVINGS', 'Premium Savings Account', 350000.00, 350000.00, 'GBP', 2.50, '2020-01-15', NULL, 'ACTIVE'),
('LIAB-002', 2, 4, 'SAVINGS', 'High Yield Savings', 450000.00, 450000.00, 'AED', 2.00, '2021-03-20', NULL, 'ACTIVE'),
('LIAB-003', 3, 6, 'FIXED_DEPOSIT', 'Corporate Fixed Deposit 12M', 1800000.00, 1800000.00, 'AED', 3.75, '2024-01-01', '2025-01-01', 'ACTIVE'),
('LIAB-004', 5, 8, 'FIXED_DEPOSIT', 'Corporate Fixed Deposit 6M', 2000000.00, 2000000.00, 'USD', 4.00, '2024-04-01', '2024-10-01', 'ACTIVE'),
('LIAB-005', 7, 11, 'FIXED_DEPOSIT', 'Commodities Reserve Deposit', 5000000.00, 5000000.00, 'USD', 4.25, '2024-01-15', '2025-01-15', 'ACTIVE'),
('LIAB-006', 8, 12, 'SAVINGS', 'HKD Savings Account', 2800000.00, 2800000.00, 'HKD', 1.50, '2021-09-15', NULL, 'ACTIVE'),
('LIAB-007', 11, 15, 'FIXED_DEPOSIT', 'Export Proceeds Deposit', 8000000.00, 8000000.00, 'USD', 4.50, '2024-02-01', '2025-02-01', 'ACTIVE'),
('LIAB-008', 12, 16, 'SAVINGS', 'EUR Savings Account', 65000.00, 65000.00, 'EUR', 1.75, '2022-03-15', NULL, 'ACTIVE');

-- ============================================================
-- CORE TRANSACTIONS (Sample)
-- ============================================================
INSERT INTO core_transactions (transaction_id, account_id, transaction_type, transaction_category, amount, currency, description, counterparty_name, counterparty_bank, counterparty_country, channel, status, sanctions_screened, sanctions_result, value_date) VALUES
('TXN-2024-001', 5, 'DEBIT', 'TRADE_PAYMENT', 2500000.00, 'USD', 'LC Payment - Meridian Trading vs Sunrise Electronics', 'SUNRISE ELECTRONICS MANUFACTURING', 'Bank of China', 'CN', 'SWIFT', 'COMPLETED', 1, 'CLEAR', '2024-01-15'),
('TXN-2024-002', 8, 'CREDIT', 'EXPORT_PROCEEDS', 3200000.00, 'USD', 'Export LC Proceeds - Phoenix IE', 'MERIDIAN TRADING CORPORATION', 'Emirates NBD', 'AE', 'SWIFT', 'COMPLETED', 1, 'CLEAR', '2024-01-20'),
('TXN-2024-003', 13, 'DEBIT', 'TRADE_PAYMENT', 850000.00, 'USD', 'Freight Payment - Atlas Shipping', 'MAERSK LINE', 'Danske Bank', 'DK', 'SWIFT', 'COMPLETED', 1, 'CLEAR', '2024-02-01'),
('TXN-2024-004', 9, 'DEBIT', 'WIRE_TRANSFER', 120000.00, 'EUR', 'Wire Transfer - Petrov Ivan', 'UNKNOWN ENTITY CYPRUS', 'Bank of Cyprus', 'CY', 'WIRE', 'BLOCKED', 1, 'FLAGGED', '2024-02-15'),
('TXN-2024-005', 14, 'DEBIT', 'TRADE_PAYMENT', 45000.00, 'USD', 'Goods Payment - Ahmad Karimi', 'TEHRAN TRADING CO', 'Unknown Bank', 'IR', 'WIRE', 'BLOCKED', 1, 'BLOCKED', '2024-03-01'),
('TXN-2024-006', 3, 'CREDIT', 'SALARY', 29166.67, 'USD', 'Monthly Salary - James Richardson', 'BARCLAYS BANK PLC', 'Barclays', 'GB', 'ACH', 'COMPLETED', 1, 'CLEAR', '2024-03-31'),
('TXN-2024-007', 11, 'DEBIT', 'TRADE_PAYMENT', 5500000.00, 'USD', 'Commodities Purchase - Global Commodities', 'PETRO TRADING LLC', 'Gazprombank', 'RU', 'SWIFT', 'PENDING', 1, 'FLAGGED', '2024-04-01'),
('TXN-2024-008', 15, 'CREDIT', 'EXPORT_PROCEEDS', 8000000.00, 'USD', 'Electronics Export Proceeds', 'TECH IMPORTS USA LLC', 'JPMorgan Chase', 'US', 'SWIFT', 'COMPLETED', 1, 'CLEAR', '2024-04-05');

-- ============================================================
-- TRADE FINANCE LCs
-- ============================================================
INSERT INTO trade_finance_lc (lc_number, lc_type, applicant_id, applicant_name, beneficiary_name, beneficiary_country, advising_bank, issuing_bank, amount, currency, expiry_date, latest_shipment_date, port_of_loading, port_of_discharge, goods_description, hs_codes, vessel_name, imo_number, incoterms, status, sanctions_status) VALUES
('LC-2024-001', 'IMPORT', 3, 'MERIDIAN TRADING CORPORATION', 'SUNRISE ELECTRONICS MANUFACTURING', 'CN', 'Bank of China Shanghai', 'Emirates NBD', 2500000.00, 'USD', '2024-06-30', '2024-06-15', 'Shanghai Port', 'Jebel Ali Port', 'Consumer Electronics - Laptops and Tablets', '8471.30, 8471.41', 'GLOBAL TRADER', '9876543', 'CIF', 'ACTIVE', 'CLEAR'),
('LC-2024-002', 'EXPORT', 5, 'PHOENIX IMPORT EXPORT LTD', 'TECHNO IMPORTS EUROPE GmbH', 'DE', 'Deutsche Bank Frankfurt', 'DBS Bank Singapore', 3200000.00, 'USD', '2024-07-31', '2024-07-15', 'Singapore Port', 'Hamburg Port', 'Industrial Machinery Parts', '8412.21, 8412.29', 'PACIFIC BRAVO', '9321483', 'FOB', 'ACTIVE', 'CLEAR'),
('LC-2024-003', 'IMPORT', 7, 'GLOBAL COMMODITIES TRADING FZE', 'PETRO TRADING LLC', 'RU', 'Gazprombank Moscow', 'Emirates NBD', 5500000.00, 'USD', '2024-05-31', '2024-05-15', 'Novorossiysk Port', 'Fujairah Port', 'Crude Oil - 50,000 MT', '2709.00', 'DARK STAR', '9234567', 'CFR', 'UNDER_REVIEW', 'FLAGGED'),
('LC-2024-004', 'IMPORT', 9, 'ATLAS SHIPPING & LOGISTICS LLC', 'MAERSK SUPPLY SERVICE', 'DK', 'Danske Bank Copenhagen', 'Emirates NBD', 850000.00, 'USD', '2024-08-31', '2024-08-15', 'Copenhagen Port', 'Dubai Port', 'Marine Equipment and Spare Parts', '8906.90, 8907.90', 'ARCTIC EXPLORER', '9456789', 'CIF', 'ACTIVE', 'CLEAR'),
('LC-2024-005', 'IMPORT', 11, 'SUNRISE ELECTRONICS MANUFACTURING', 'SEMICONDUCTOR CORP USA', 'US', 'JPMorgan Chase New York', 'Bank of China', 8000000.00, 'USD', '2024-09-30', '2024-09-15', 'Los Angeles Port', 'Shenzhen Port', 'Advanced Semiconductors - Dual Use', '8542.31, 8542.32', 'GLOBAL TRADER', '9876543', 'CIF', 'UNDER_REVIEW', 'PENDING');

-- ============================================================
-- SCREENING REQUESTS
-- ============================================================
INSERT INTO screening_requests (request_id, request_type, source_system, requested_by, priority, status, total_subjects, completed_subjects, overall_result, started_at, completed_at) VALUES
('SCR-2024-001', 'TRANSACTION', 'TRADE_FINANCE', 'System Auto-Screen', 'HIGH', 'COMPLETED', 8, 8, 'CLEAR', '2024-01-15 09:00:00', '2024-01-15 09:00:45'),
('SCR-2024-002', 'TRANSACTION', 'TRADE_FINANCE', 'System Auto-Screen', 'HIGH', 'COMPLETED', 6, 6, 'POTENTIAL_MATCH', '2024-03-01 14:30:00', '2024-03-01 14:31:20'),
('SCR-2024-003', 'INDIVIDUAL', 'MANUAL', 'Ahmed Al-Rashid', 'NORMAL', 'COMPLETED', 1, 1, 'POTENTIAL_MATCH', '2024-02-15 10:00:00', '2024-02-15 10:00:30'),
('SCR-2024-004', 'ENTITY', 'CORE_BANKING', 'System Auto-Screen', 'HIGH', 'COMPLETED', 3, 3, 'BLOCKED', '2024-04-01 11:00:00', '2024-04-01 11:01:15'),
('SCR-2024-005', 'BATCH', 'MANUAL', 'Sarah Mitchell', 'NORMAL', 'COMPLETED', 50, 50, 'CLEAR', '2024-04-10 08:00:00', '2024-04-10 08:05:30');

-- Screening Subjects
INSERT INTO screening_subjects (request_id, subject_type, subject_name, subject_role, nationality, country, screening_result, match_score, screened_at) VALUES
(1, 'ENTITY', 'MERIDIAN TRADING CORPORATION', 'APPLICANT', 'AE', 'AE', 'CLEAR', 5.00, '2024-01-15 09:00:10'),
(1, 'ENTITY', 'SUNRISE ELECTRONICS MANUFACTURING', 'BENEFICIARY', 'CN', 'CN', 'CLEAR', 3.00, '2024-01-15 09:00:15'),
(1, 'ENTITY', 'BANK OF CHINA', 'ADVISING_BANK', 'CN', 'CN', 'CLEAR', 2.00, '2024-01-15 09:00:20'),
(2, 'INDIVIDUAL', 'AHMAD KARIMI', 'APPLICANT', 'IR', 'TR', 'POTENTIAL_MATCH', 72.50, '2024-03-01 14:30:30'),
(2, 'ENTITY', 'TEHRAN TRADING CO', 'BENEFICIARY', 'IR', 'IR', 'BLOCKED', 95.00, '2024-03-01 14:30:45'),
(3, 'INDIVIDUAL', 'IVAN PETROV', 'CUSTOMER', 'RU', 'CY', 'POTENTIAL_MATCH', 68.00, '2024-02-15 10:00:15'),
(4, 'ENTITY', 'PETRO TRADING LLC', 'COUNTERPARTY', 'RU', 'RU', 'BLOCKED', 88.00, '2024-04-01 11:00:30'),
(4, 'VESSEL', 'DARK STAR', 'VESSEL', NULL, NULL, 'BLOCKED', 100.00, '2024-04-01 11:00:45');

-- Screening Matches
INSERT INTO screening_matches (subject_id, entry_id, match_score, match_type, matched_field, matched_value, list_source, programme, disposition) VALUES
(4, 10, 72.50, 'FUZZY', 'PRIMARY_NAME', 'Ahmad Karimi vs Ahmad Karimi (OFAC)', 'OFAC', 'IRAN', 'PENDING'),
(5, 3, 95.00, 'EXACT', 'COUNTRY', 'Iran - Sanctioned Country', 'OFAC', 'IRAN', 'TRUE_MATCH'),
(6, 5, 68.00, 'FUZZY', 'PRIMARY_NAME', 'Ivan Petrov vs Petrov Ivan', 'OFAC', 'RUSSIA', 'FALSE_POSITIVE'),
(7, 6, 88.00, 'ENTITY', 'COUNTERPARTY_BANK', 'Gazprombank - Sanctioned Entity', 'OFAC', 'RUSSIA', 'TRUE_MATCH'),
(8, 7, 100.00, 'EXACT', 'VESSEL_NAME', 'DARK STAR - Sanctioned Vessel', 'OFAC', 'IRAN', 'TRUE_MATCH');

-- ============================================================
-- SCREENING ALERTS
-- ============================================================
INSERT INTO screening_alerts (alert_id, request_id, subject_id, match_id, alert_type, severity, title, description, status, assigned_to, due_date) VALUES
('ALERT-2024-001', 2, 4, 1, 'POTENTIAL_MATCH', 'HIGH', 'Potential OFAC Match - Ahmad Karimi', 'Customer Ahmad Karimi (CUST-010) has a 72.5% match with OFAC SDN entry for Iran programme. Iranian national attempting wire transfer to Tehran Trading Co.', 'IN_REVIEW', 'Fatima Al-Zahra', '2024-03-03'),
('ALERT-2024-002', 2, 5, 2, 'BLOCKED', 'CRITICAL', 'Transaction BLOCKED - Iran Sanctioned Entity', 'Transaction to Tehran Trading Co blocked. Entity located in Iran - OFAC comprehensive sanctions programme. Transaction value USD 45,000.', 'CLOSED', 'Fatima Al-Zahra', '2024-03-02'),
('ALERT-2024-003', 3, 6, 3, 'POTENTIAL_MATCH', 'MEDIUM', 'Potential Match - Ivan Petrov (Russian National)', 'Customer Ivan Petrov has a 68% name match with OFAC Russia programme entry. Further investigation required.', 'CLOSED', 'Elena Stavros', '2024-02-17'),
('ALERT-2024-004', 4, 7, 4, 'BLOCKED', 'CRITICAL', 'LC BLOCKED - Gazprombank Counterparty', 'LC-2024-003 blocked due to Gazprombank (sanctioned Russian entity) as advising bank. Commodity: Crude Oil from Russia.', 'IN_REVIEW', 'Ahmed Al-Rashid', '2024-04-03'),
('ALERT-2024-005', 4, 8, 5, 'BLOCKED', 'CRITICAL', 'Vessel BLOCKED - DARK STAR (Sanctioned IMO)', 'Vessel DARK STAR (IMO: 9234567) is on OFAC SDN list. LC-2024-003 involves this vessel for crude oil transport from Russia.', 'IN_REVIEW', 'Ahmed Al-Rashid', '2024-04-03');

-- ============================================================
-- CASES
-- ============================================================
INSERT INTO cases (case_number, case_type, alert_id, subject_name, subject_type, priority, status, assigned_analyst, supervising_officer, description, decision, decision_rationale, opened_at, closed_at) VALUES
('CASE-2024-001', 'SANCTIONS_HIT', 2, 'TEHRAN TRADING CO', 'ENTITY', 'CRITICAL', 'CLOSED', 'Fatima Al-Zahra', 'Mohammed Al-Compliance', 'Transaction blocked to Tehran Trading Co - Iranian entity under OFAC comprehensive sanctions. Customer Ahmad Karimi (Iranian national) attempted USD 45,000 wire transfer.', 'TRUE_MATCH', 'Entity is located in Iran which is under OFAC comprehensive sanctions programme. Transaction blocked and customer account flagged. SAR filed with FinCEN.', '2024-03-01', '2024-03-05'),
('CASE-2024-002', 'FALSE_POSITIVE', 3, 'IVAN PETROV', 'INDIVIDUAL', 'MEDIUM', 'CLOSED', 'Elena Stavros', 'Mohammed Al-Compliance', 'Name match investigation for Ivan Petrov - Russian national, Cyprus resident. 68% match with OFAC Russia programme entry.', 'FALSE_POSITIVE', 'After thorough investigation, Ivan Petrov (DOB: 1979-05-14, Cypriot resident) does not match the sanctioned individual. Different date of birth, different passport number, different address. Case closed as false positive.', '2024-02-15', '2024-02-20'),
('CASE-2024-003', 'SANCTIONS_HIT', 4, 'GLOBAL COMMODITIES TRADING FZE / LC-2024-003', 'ENTITY', 'CRITICAL', 'IN_REVIEW', 'Ahmed Al-Rashid', 'Mohammed Al-Compliance', 'LC-2024-003 flagged for multiple sanctions concerns: (1) Gazprombank as advising bank - OFAC SDN entity, (2) DARK STAR vessel - OFAC SDN vessel, (3) Crude oil from Russia - sectoral sanctions. LC value USD 5.5M.', NULL, NULL, '2024-04-01', NULL),
('CASE-2024-004', 'INVESTIGATION', 1, 'AHMAD KARIMI', 'INDIVIDUAL', 'HIGH', 'IN_REVIEW', 'Fatima Al-Zahra', 'Mohammed Al-Compliance', 'Iranian national Ahmad Karimi, Turkey resident. Account flagged. 72.5% match with OFAC Iran programme. Enhanced due diligence in progress.', NULL, NULL, '2024-03-01', NULL);

-- Case Notes
INSERT INTO case_notes (case_id, note_type, note_text, created_by) VALUES
(1, 'ANALYST_NOTE', 'Initial review: Customer Ahmad Karimi is an Iranian national residing in Turkey. Attempted wire transfer of USD 45,000 to Tehran Trading Co in Iran. Iran is under OFAC comprehensive sanctions. Transaction blocked automatically.', 'Fatima Al-Zahra'),
(1, 'DECISION', 'Decision: TRUE MATCH. Tehran Trading Co is an Iranian entity. Transaction blocked. SAR filed with FinCEN reference SAR-2024-0301-001. Customer account flagged for enhanced monitoring.', 'Fatima Al-Zahra'),
(2, 'ANALYST_NOTE', 'Reviewed Ivan Petrov profile. Russian national, Cyprus resident since 2018. Passport RU7654321098 - does not match any OFAC entry. DOB 1979-05-14 - different from sanctioned individual. Name match was coincidental.', 'Elena Stavros'),
(2, 'DECISION', 'FALSE POSITIVE confirmed. Ivan Petrov is a legitimate customer. Account unfrozen. Enhanced monitoring applied due to Russian nationality and Cyprus residency pattern. Review in 6 months.', 'Elena Stavros'),
(3, 'ANALYST_NOTE', 'LC-2024-003 has three compounding sanctions concerns: Gazprombank (OFAC SDN), DARK STAR vessel (OFAC SDN), and crude oil from Russia (sectoral sanctions). Escalated to Compliance Officer.', 'Ahmed Al-Rashid'),
(3, 'ANALYST_NOTE', 'Contacted Global Commodities Trading FZE management. They claim no knowledge of vessel sanctions status. Requested alternative vessel and advising bank. Awaiting response.', 'Ahmed Al-Rashid'),
(4, 'ANALYST_NOTE', 'Ahmad Karimi - enhanced due diligence initiated. Requested source of funds documentation, purpose of transfer, business relationship with Tehran Trading Co.', 'Fatima Al-Zahra');

-- ============================================================
-- SCREENING RULES
-- ============================================================
INSERT INTO screening_rules (rule_code, rule_name, rule_type, description, match_threshold, auto_block_threshold, review_threshold, applies_to, lists_to_check, is_active, priority) VALUES
('RULE-001', 'Exact Name Match', 'EXACT', 'Exact string match on primary name and all aliases', 100.00, 100.00, 95.00, '["INDIVIDUAL","ENTITY","VESSEL"]', '["OFAC","EU","UN","UK"]', 1, 1),
('RULE-002', 'Fuzzy Name Match - High', 'FUZZY', 'Levenshtein distance fuzzy matching for name variants', 85.00, 90.00, 75.00, '["INDIVIDUAL","ENTITY"]', '["OFAC","EU","UN","UK","SECO","DFAT","MAS"]', 1, 2),
('RULE-003', 'Phonetic Match', 'PHONETIC', 'Soundex/Metaphone phonetic matching for name pronunciation variants', 80.00, 88.00, 70.00, '["INDIVIDUAL"]', '["OFAC","EU","UN","UK"]', 1, 3),
('RULE-004', 'Country Embargo Check', 'THRESHOLD', 'Block all transactions involving embargoed countries', 100.00, 100.00, 85.00, '["COUNTRY","TRANSACTION"]', '["OFAC","EU","UN","UK"]', 1, 1),
('RULE-005', 'Vessel IMO Match', 'EXACT', 'Exact IMO number match for vessel screening', 100.00, 100.00, 90.00, '["VESSEL"]', '["OFAC","EU","UN","UK"]', 1, 1),
('RULE-006', 'Transliteration Match', 'FUZZY', 'Arabic, Cyrillic, Chinese script transliteration matching', 78.00, 85.00, 65.00, '["INDIVIDUAL","ENTITY"]', '["OFAC","EU","UN","UK"]', 1, 4),
('RULE-007', 'LEI/Registration Match', 'EXACT', 'Legal Entity Identifier and company registration number matching', 100.00, 100.00, 95.00, '["ENTITY"]', '["OFAC","EU","UN","UK"]', 1, 1),
('RULE-008', 'HS Code Dual-Use Check', 'THRESHOLD', 'Check harmonized system codes against restricted goods lists', 90.00, 95.00, 80.00, '["GOODS"]', '["OFAC","EU"]', 1, 2);

-- ============================================================
-- INTERNAL WATCHLIST
-- ============================================================
INSERT INTO internal_watchlist (watchlist_type, entity_type, entity_name, dob, nationality, country, reason, source, risk_level, added_by, status) VALUES
('PEP', 'INDIVIDUAL', 'Mohammed Al-Hassan', '1968-11-30', 'SA', 'SA', 'Saudi Government Official - Senior Position', 'Customer Onboarding KYC', 'HIGH', 'Fatima Al-Zahra', 'ACTIVE'),
('ADVERSE_MEDIA', 'INDIVIDUAL', 'Ivan Petrov', '1979-05-14', 'RU', 'CY', 'Adverse media: Linked to Russian oligarch network. Cyprus residency pattern common in sanctions evasion.', 'Reuters Investigation 2023', 'HIGH', 'Elena Stavros', 'ACTIVE'),
('INTERNAL_BLACKLIST', 'ENTITY', 'TEHRAN TRADING CO', NULL, 'IR', 'IR', 'Iranian entity - OFAC comprehensive sanctions. Transaction blocked 2024-03-01.', 'Internal Compliance', 'CRITICAL', 'Fatima Al-Zahra', 'ACTIVE'),
('GREYLIST', 'ENTITY', 'PETRO TRADING LLC', NULL, 'RU', 'RU', 'Russian commodities trader with links to Gazprombank. Under enhanced monitoring.', 'Compliance Review', 'HIGH', 'Ahmed Al-Rashid', 'ACTIVE'),
('PEP', 'INDIVIDUAL', 'Ahmad Karimi', '1972-04-18', 'IR', 'TR', 'Iranian national with suspected links to sanctioned entities. Enhanced monitoring.', 'Compliance Investigation', 'HIGH', 'Fatima Al-Zahra', 'ACTIVE');

-- ============================================================
-- APP USERS
-- ============================================================
INSERT INTO app_users (username, full_name, email, role, department, is_active) VALUES
('admin', 'System Administrator', 'admin@sanctionsengine.com', 'ADMIN', 'IT', 1),
('sarah.mitchell', 'Sarah Mitchell', 'sarah.mitchell@sanctionsengine.com', 'ANALYST', 'Compliance', 1),
('ahmed.alrashid', 'Ahmed Al-Rashid', 'ahmed.alrashid@sanctionsengine.com', 'OFFICER', 'Compliance', 1),
('fatima.alzahra', 'Fatima Al-Zahra', 'fatima.alzahra@sanctionsengine.com', 'ANALYST', 'Compliance', 1),
('elena.stavros', 'Elena Stavros', 'elena.stavros@sanctionsengine.com', 'ANALYST', 'Compliance', 1),
('mohammed.compliance', 'Mohammed Al-Compliance', 'mohammed@sanctionsengine.com', 'OFFICER', 'Compliance', 1),
('david.tan', 'David Tan', 'david.tan@sanctionsengine.com', 'ANALYST', 'Compliance', 1),
('viewer.user', 'View Only User', 'viewer@sanctionsengine.com', 'VIEWER', 'Operations', 1);

-- ============================================================
-- AUDIT LOG (Sample entries)
-- ============================================================
INSERT INTO audit_log (event_type, entity_type, entity_id, action, performed_by, description) VALUES
('SCREENING', 'TRANSACTION', 'TXN-2024-005', 'SCREEN', 'System', 'Transaction TXN-2024-005 screened - BLOCKED - Iran sanctions'),
('CASE_UPDATE', 'CASE', 'CASE-2024-001', 'UPDATE', 'Fatima Al-Zahra', 'Case closed as TRUE MATCH - SAR filed'),
('CASE_UPDATE', 'CASE', 'CASE-2024-002', 'UPDATE', 'Elena Stavros', 'Case closed as FALSE POSITIVE - Account unfrozen'),
('SANCTIONS_UPDATE', 'SANCTIONS_LIST', 'OFAC', 'UPDATE', 'System', 'OFAC SDN list updated - 3 new entries, 1 delisted'),
('ACCOUNT_FREEZE', 'ACCOUNT', 'ACC-006-001', 'UPDATE', 'System', 'Account frozen pending sanctions investigation'),
('SCREENING', 'LC', 'LC-2024-003', 'SCREEN', 'System', 'LC screened - FLAGGED - Multiple sanctions concerns'),
('LIST_SCRAPE', 'SANCTIONS_LIST', 'OFAC', 'CREATE', 'System', 'OFAC list scrape completed - 12,543 records downloaded');
