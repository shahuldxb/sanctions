#!/usr/bin/env python3
"""Corrected demo data population - exact column names from schema inspection"""
import pymssql
import random
import json
from datetime import datetime, timedelta

conn = pymssql.connect('203.101.44.46', 'shahul', 'Apple123!@#', 'sanctions')
cur = conn.cursor()

def exec_sql(sql):
    try:
        cur.execute(sql)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"  SQL Error: {str(e)[:150]}")

def exec_many(sql, rows):
    if not rows: return
    try:
        cur.executemany(sql, rows)
        conn.commit()
        print(f"  Inserted {len(rows)} rows OK")
    except Exception as e:
        conn.rollback()
        print(f"  Error: {str(e)[:200]}")

print("=== Populating Sanctions Engine Demo Data (v2) ===\n")

first_names = ['Omar','Hassan','Ali','Mohammed','Ahmad','Ibrahim','Khalid','Tariq','Yusuf','Samir','Elena','Natasha','Olga','Irina','Svetlana','Chen','Wang','Li','Zhang','Liu','Viktor','Sergei','Alexei','Dmitri','Boris']
last_names = ['Al-Rashidi','Petrov','Ivanov','Hassan','Khalil','Benali','Smirnov','Volkov','Kim','Park','Zhang','Al-Houthi','Nasrallah','Timchenko','Usmanov','Assad','Khamenei','Kadyrov','Mordashov','Sokolov']
countries_hi = ['IR','RU','SY','KP','IQ','LB','YE','AF','VE','BY','MM','CU','ZW','SD','LY']
currencies = ['USD','EUR','GBP','AED','SGD','JPY','AUD']

# ─── 1. Sanctions List Sources (update existing) ───────────────────────────
print("[1] Updating Sanctions List Sources...")
exec_sql("UPDATE sanctions_list_sources SET scrape_interval_hours=3, is_active=1 WHERE source_code='OFAC'")
exec_sql("UPDATE sanctions_list_sources SET scrape_interval_hours=3, is_active=1 WHERE source_code='EU'")
exec_sql("UPDATE sanctions_list_sources SET scrape_interval_hours=6, is_active=1 WHERE source_code='UN'")
exec_sql("UPDATE sanctions_list_sources SET scrape_interval_hours=6, is_active=1 WHERE source_code='UK'")
exec_sql("UPDATE sanctions_list_sources SET scrape_interval_hours=12, is_active=1 WHERE source_code='SECO'")
exec_sql("UPDATE sanctions_list_sources SET scrape_interval_hours=12, is_active=1 WHERE source_code='DFAT'")
exec_sql("UPDATE sanctions_list_sources SET scrape_interval_hours=12, is_active=1 WHERE source_code='MAS'")
# Add BIS if not exists
exec_sql("""IF NOT EXISTS (SELECT 1 FROM sanctions_list_sources WHERE source_code='BIS')
INSERT INTO sanctions_list_sources (source_code,source_name,source_url,download_url,jurisdiction,is_active,scrape_interval_hours,description)
VALUES ('BIS','BIS Entity List','https://www.bis.doc.gov/','https://www.bis.doc.gov/','US',1,24,'US Bureau of Industry and Security')""")

cur.execute("SELECT id, source_code FROM sanctions_list_sources")
source_map = {r[1]: r[0] for r in cur.fetchall()}
print(f"  Sources: {list(source_map.keys())}")

# ─── 2. Add more Sanctions Entries ────────────────────────────────────────
print("\n[2] Adding more Sanctions Entries...")
cur.execute("SELECT COUNT(*) FROM sanctions_entries")
existing = cur.fetchone()[0]
print(f"  Existing entries: {existing}")

programs_list = ['SDN','CONSOLIDATED','TALIBAN','AQIS','OFSI','SECO_LIST','DFAT_LIST','MAS_LIST','ENTITY_LIST']
types_list = ['Individual','Entity','Vessel','Aircraft']
statuses_list = ['Active','Active','Active','Delisted']

new_entries = []
for i in range(172):
    src_code = random.choice(list(source_map.keys()))
    src_id = source_map[src_code]
    ext_id = f"EXT-{src_code}-{2000+i}"
    etype = random.choice(types_list)
    fn = random.choice(first_names); ln = random.choice(last_names)
    name = f"{fn} {ln} {chr(65+i%26)}" if etype == 'Individual' else f"{fn} {random.choice(['Trading','Holdings','Corp','Ltd','Group'])} {chr(65+i%26)}"
    country = random.choice(countries_hi)
    dob = f"{random.randint(1950,1995)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}" if etype == 'Individual' else None
    program = random.choice(programs_list)
    status = random.choice(statuses_list)
    reason = random.choice(['Terrorism financing','Sanctions evasion','Weapons proliferation','Money laundering','Human rights violations','Cyber attacks','Drug trafficking','Nuclear program'])
    listing_date = (datetime.now() - timedelta(days=random.randint(100, 3000))).strftime('%Y-%m-%d')
    new_entries.append((src_id, ext_id, etype, name, None, dob, None, country, None, None, None, None, None, program, listing_date, status, reason))

exec_many("INSERT INTO sanctions_entries (source_id,external_id,entry_type,primary_name,name_original_script,dob,pob,nationality,passport_number,national_id,gender,title,position,programme,listing_date,status,remarks) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", new_entries)

cur.execute("SELECT id FROM sanctions_entries")
entry_ids = [r[0] for r in cur.fetchall()]
print(f"  Total entries now: {len(entry_ids)}")

# ─── 3. Sanctions Aliases ─────────────────────────────────────────────────
print("\n[3] Sanctions Aliases...")
exec_sql("DELETE FROM sanctions_aliases")
aliases = []
alias_types = ['AKA','FKA','NFM','LOW_QUALITY']
for eid in entry_ids[:150]:
    for j in range(random.randint(1, 3)):
        fn = random.choice(first_names); ln = random.choice(last_names)
        aliases.append((eid, f"{fn} {ln}", random.choice(alias_types), 'Good', 'Latin'))
exec_many("INSERT INTO sanctions_aliases (entry_id,alias_name,alias_type,alias_quality,script) VALUES (%s,%s,%s,%s,%s)", aliases)

# ─── 4. Sanctions Identifiers ─────────────────────────────────────────────
print("\n[4] Sanctions Identifiers...")
exec_sql("DELETE FROM sanctions_identifiers")
id_types = ['PASSPORT','NATIONAL_ID','TAX_ID','COMPANY_REG','SWIFT_BIC','IMO_NUMBER']
identifiers = []
for eid in entry_ids[:150]:
    for j in range(random.randint(1, 2)):
        id_type = random.choice(id_types)
        id_val = f"{id_type[:3]}{random.randint(100000,999999)}"
        country = random.choice(countries_hi)
        identifiers.append((eid, id_type, id_val, country, None, None))
exec_many("INSERT INTO sanctions_identifiers (entry_id,id_type,id_value,id_country,issued_date,expiry_date) VALUES (%s,%s,%s,%s,%s,%s)", identifiers)

# ─── 5. Sanctions Addresses ───────────────────────────────────────────────
print("\n[5] Sanctions Addresses...")
exec_sql("DELETE FROM sanctions_addresses")
cities_map = {'IR':'Tehran','RU':'Moscow','SY':'Damascus','KP':'Pyongyang','IQ':'Baghdad','LB':'Beirut','YE':'Sanaa','AF':'Kabul','VE':'Caracas','BY':'Minsk'}
addresses = []
for eid in entry_ids[:150]:
    country = random.choice(countries_hi)
    city = cities_map.get(country, 'Unknown')
    addresses.append((eid, f"{random.randint(1,999)} Main Street", None, city, None, f"{random.randint(10000,99999)}", country, country))
exec_many("INSERT INTO sanctions_addresses (entry_id,address1,address2,city,state_province,postal_code,country,country_code) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", addresses)

# ─── 6. Countries ─────────────────────────────────────────────────────────
print("\n[6] Countries...")
exec_sql("DELETE FROM countries")
country_data = [
    ('AF','Afghanistan','AFG','Asia','South Asia',1,1,1,0,'TALIBAN','Critical','Taliban control, terrorism hub'),
    ('BY','Belarus','BLR','Europe','Eastern Europe',1,1,0,0,'EU,US','High','Lukashenko regime'),
    ('CU','Cuba','CUB','Americas','Caribbean',1,1,0,0,'US','Medium','US embargo'),
    ('IR','Iran','IRN','Middle East','Western Asia',1,1,1,0,'OFAC,EU,UN,UK','Critical','Nuclear program, IRGC'),
    ('IQ','Iraq','IRQ','Middle East','Western Asia',0,1,0,0,'OFAC','High','Post-conflict, terrorism risk'),
    ('KP','North Korea','PRK','Asia','East Asia',1,1,1,0,'OFAC,EU,UN,UK','Critical','Nuclear weapons, DPRK'),
    ('LB','Lebanon','LBN','Middle East','Western Asia',0,1,0,0,'OFAC','High','Hezbollah presence'),
    ('LY','Libya','LBY','Africa','North Africa',1,1,0,0,'UN,EU','High','Civil war, arms embargo'),
    ('MM','Myanmar','MMR','Asia','Southeast Asia',1,1,0,0,'US,EU,UK','High','Military coup'),
    ('RU','Russia','RUS','Europe','Eastern Europe',1,1,0,0,'OFAC,EU,UK,SECO','Critical','Ukraine invasion'),
    ('SD','Sudan','SDN','Africa','East Africa',1,1,0,0,'OFAC','High','Conflict'),
    ('SY','Syria','SYR','Middle East','Western Asia',1,1,1,0,'OFAC,EU,UN','Critical','Assad regime'),
    ('VE','Venezuela','VEN','Americas','South America',1,1,0,0,'OFAC,EU','High','Maduro regime'),
    ('YE','Yemen','YEM','Middle East','Western Asia',0,1,0,0,'OFAC,UN','High','Houthi conflict'),
    ('ZW','Zimbabwe','ZWE','Africa','Southern Africa',1,1,0,0,'US,EU','Medium','Mnangagwa regime'),
    ('AE','UAE','ARE','Middle East','Western Asia',0,0,0,0,'','Low','Financial hub'),
    ('CN','China','CHN','Asia','East Asia',0,0,0,0,'BIS','Medium','Technology controls'),
    ('SA','Saudi Arabia','SAU','Middle East','Western Asia',0,0,0,0,'','Low','Regional partner'),
    ('US','United States','USA','Americas','North America',0,0,0,0,'','Low','Primary sanctions authority'),
    ('GB','United Kingdom','GBR','Europe','Northern Europe',0,0,0,0,'','Low','OFSI authority'),
    ('DE','Germany','DEU','Europe','Western Europe',0,0,0,0,'','Low','EU member'),
    ('FR','France','FRA','Europe','Western Europe',0,0,0,0,'','Low','EU member'),
    ('SG','Singapore','SGP','Asia','Southeast Asia',0,0,0,0,'','Low','MAS regulated'),
    ('AU','Australia','AUS','Oceania','Australia',0,0,0,0,'','Low','DFAT regulated'),
    ('CH','Switzerland','CHE','Europe','Western Europe',0,0,0,0,'','Low','SECO regulated'),
    ('JP','Japan','JPN','Asia','East Asia',0,0,0,0,'','Low','METI regulated'),
    ('IN','India','IND','Asia','South Asia',0,0,0,0,'','Low','Financial partner'),
    ('TR','Turkey','TUR','Europe','Western Asia',0,0,0,1,'','Medium','Circumvention risk'),
    ('PK','Pakistan','PAK','Asia','South Asia',0,1,0,1,'','High','Terror financing risk'),
    ('NG','Nigeria','NGA','Africa','West Africa',0,0,0,1,'','Medium','FATF grey list'),
    ('MA','Morocco','MAR','Africa','North Africa',0,0,0,0,'','Low','North Africa partner'),
    ('KE','Kenya','KEN','Africa','East Africa',0,0,0,0,'','Medium','East Africa hub'),
    ('MX','Mexico','MEX','Americas','North America',0,0,0,0,'','Medium','Narcotics risk'),
    ('ES','Spain','ESP','Europe','Southern Europe',0,0,0,0,'','Low','EU member'),
    ('CY','Cyprus','CYP','Europe','Southern Europe',0,0,0,0,'','Medium','Russian money flows'),
]
exec_many("INSERT INTO countries (country_code,country_name,iso_alpha3,region,sub_region,is_sanctioned,is_high_risk,is_fatf_blacklist,is_fatf_greylist,sanctions_programmes,risk_rating,risk_notes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", country_data)

# ─── 7. Core Customers (already inserted, just verify) ────────────────────
print("\n[7] Core Customers check...")
cur.execute("SELECT COUNT(*) FROM core_customers")
print(f"  Customers: {cur.fetchone()[0]}")

# ─── 8. Corporate Customers ───────────────────────────────────────────────
print("\n[8] Corporate Customers...")
exec_sql("DELETE FROM core_corporate_customers")
cur.execute("SELECT id FROM core_customers ORDER BY id LIMIT 10")
cust_ids = [r[0] for r in cur.fetchall()]
corporates = []
corp_data = [
    ('AE','LLC','Finance',5000000,50,'https://alfarsi.ae','None','Ahmed Al-Farsi','AE',85.0),
    ('US','Corporation','Technology',20000000,200,'https://globaltech.com','None','Sarah Johnson','US',100.0),
    ('RU','Corporation','Energy',500000000,1000,'https://easternergy.ru','Gazprom','Viktor Sokolov','RU',75.0),
    ('CN','LLC','Trade',10000000,100,'https://silkroad.cn','None','Chen Wei','CN',60.0),
    ('GR','Corporation','Shipping',50000000,500,'https://medship.gr','None','Hiroshi Tanaka','JP',100.0),
    ('IR','LLC','Trade',1000000,20,'https://tehrantrading.ir','None','Ali Khani','IR',100.0),
    ('AE','LLC','Finance',8000000,80,'https://dubaifinancial.ae','None','Abdullah Al-Saud','SA',90.0),
    ('CY','LLC','Resources',15000000,150,'https://blacksea.cy','None','Viktor Sokolov','RU',70.0),
    ('SG','Corporation','Holdings',100000000,300,'https://pacificrim.sg','None','Chen Wei','CN',100.0),
    ('ML','Corporation','Mining',25000000,400,'https://sahelmining.ml','None','Aisha Hassan','SO',80.0),
]
for i, (cid, (country, ctype, industry, turnover, employees, website, parent, ubo, ubo_nat, ubo_pct)) in enumerate(zip(cust_ids, corp_data)):
    corporates.append((cid, f"CORP{i+1:06d}", None, country, f"2010-{random.randint(1,12):02d}-01", ctype, f"IND{i+1:03d}", industry, turnover, employees, website, parent, ubo, ubo_nat, ubo_pct))
exec_many("INSERT INTO core_corporate_customers (customer_id,company_registration_number,lei_number,incorporation_country,incorporation_date,business_type,industry_code,industry_description,annual_turnover,number_of_employees,website,parent_company,ultimate_beneficial_owner,ubo_nationality,ubo_ownership_percent) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", corporates)

# ─── 9. Core Assets ───────────────────────────────────────────────────────
print("\n[9] Core Assets...")
exec_sql("DELETE FROM core_assets")
cur.execute("SELECT id FROM core_customers ORDER BY id")
all_cust_ids = [r[0] for r in cur.fetchall()]
cur.execute("SELECT id FROM core_accounts ORDER BY id")
all_acc_ids = [r[0] for r in cur.fetchall()]
asset_types = ['Real Estate','Vehicle','Investment','Gold','Cryptocurrency','Bond','Equity','Art']
assets = []
for i in range(40):
    cid = random.choice(all_cust_ids)
    aid = random.choice(all_acc_ids)
    at = random.choice(asset_types)
    principal = round(random.uniform(10000, 2000000), 2)
    outstanding = round(principal * random.uniform(0.5, 1.0), 2)
    cur_c = random.choice(currencies)
    rate = round(random.uniform(2.0, 8.0), 2)
    orig_date = (datetime.now() - timedelta(days=random.randint(100, 3000))).strftime('%Y-%m-%d')
    mat_date = (datetime.now() + timedelta(days=random.randint(365, 3650))).strftime('%Y-%m-%d')
    status = random.choice(['Active','Active','Active','Non-Performing'])
    risk = random.choice(['Standard','Watch','Substandard','Doubtful'])
    assets.append((f"AST{i+1:06d}", cid, aid, at, f"{at} Asset {i+1}", principal, outstanding, cur_c, rate, orig_date, mat_date, None, 0, None, status, risk, 0))
exec_many("INSERT INTO core_assets (asset_id,customer_id,account_id,asset_type,asset_name,principal_amount,outstanding_balance,currency,interest_rate,origination_date,maturity_date,collateral_type,collateral_value,collateral_description,status,risk_classification,sanctions_flag) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", assets)

# ─── 10. Core Liabilities ─────────────────────────────────────────────────
print("\n[10] Core Liabilities...")
exec_sql("DELETE FROM core_liabilities")
liab_types = ['Mortgage','Car Loan','Personal Loan','Credit Card','Overdraft','Trade Finance','Term Loan']
liabilities = []
for i in range(40):
    cid = random.choice(all_cust_ids)
    aid = random.choice(all_acc_ids)
    lt = random.choice(liab_types)
    principal = round(random.uniform(5000, 500000), 2)
    outstanding = round(principal * random.uniform(0.3, 1.0), 2)
    cur_c = random.choice(currencies)
    rate = round(random.uniform(2.5, 12.0), 2)
    orig_date = (datetime.now() - timedelta(days=random.randint(100, 1000))).strftime('%Y-%m-%d')
    mat_date = (datetime.now() + timedelta(days=random.randint(365, 3650))).strftime('%Y-%m-%d')
    status = random.choice(['Active','Active','Active','Overdue','Closed'])
    liabilities.append((f"LIB{i+1:06d}", cid, aid, lt, f"{lt} {i+1}", principal, outstanding, cur_c, rate, orig_date, mat_date, status, 0))
exec_many("INSERT INTO core_liabilities (liability_id,customer_id,account_id,liability_type,liability_name,principal_amount,outstanding_balance,currency,interest_rate,origination_date,maturity_date,status,sanctions_flag) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", liabilities)

# ─── 11. Screening Requests ───────────────────────────────────────────────
print("\n[11] Screening Requests...")
exec_sql("DELETE FROM screening_matches")
exec_sql("DELETE FROM screening_alerts")
exec_sql("DELETE FROM screening_subjects")
exec_sql("DELETE FROM screening_requests")
screen_types = ['Customer Onboarding','Transaction','Periodic Review','Batch','Manual']
screen_statuses = ['Completed','Completed','Completed','In Progress','Failed']
screen_reqs = []
for i in range(100):
    stype = random.choice(screen_types)
    status = random.choice(screen_statuses)
    total = random.randint(1, 50)
    completed = total if status == 'Completed' else random.randint(0, total)
    result = random.choice(['Clear','Potential Match','Blocked','In Review'])
    started = (datetime.now() - timedelta(days=random.randint(0, 90))).strftime('%Y-%m-%d %H:%M:%S')
    completed_at = (datetime.now() - timedelta(days=random.randint(0, 89))).strftime('%Y-%m-%d %H:%M:%S') if status == 'Completed' else None
    screen_reqs.append((f"SCR{i+1:06d}", stype, 'Manual', random.choice(['jsmith','jdoe','bwilson','system']), random.choice(['Normal','High','Critical']), status, total, completed, result, started, completed_at, None))
exec_many("INSERT INTO screening_requests (request_id,request_type,source_system,requested_by,priority,status,total_subjects,completed_subjects,overall_result,started_at,completed_at,metadata) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", screen_reqs)

# ─── 12. Screening Subjects ───────────────────────────────────────────────
print("\n[12] Screening Subjects...")
cur.execute("SELECT id FROM screening_requests ORDER BY id")
req_ids = [r[0] for r in cur.fetchall()]
subjects = []
for i in range(200):
    req_id = random.choice(req_ids)
    stype = random.choice(['Individual','Entity','Vessel'])
    name = f"{random.choice(first_names)} {random.choice(last_names)}"
    dob = f"{random.randint(1950,1995)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}" if stype == 'Individual' else None
    country = random.choice(countries_hi + ['US','GB','AE','SG'])
    result = random.choice(['Clear','Clear','Clear','Potential Match','Blocked'])
    score = random.randint(0, 100) if result != 'Clear' else random.randint(0, 40)
    screened_at = (datetime.now() - timedelta(days=random.randint(0, 90))).strftime('%Y-%m-%d %H:%M:%S')
    subjects.append((req_id, stype, name, 'Primary', dob, country, country, 'PASSPORT', f"P{random.randint(100000,999999)}", None, result, score, screened_at))
exec_many("INSERT INTO screening_subjects (request_id,subject_type,subject_name,subject_role,dob,nationality,country,identifier_type,identifier_value,additional_info,screening_result,match_score,screened_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", subjects)

# ─── 13. Screening Matches ────────────────────────────────────────────────
print("\n[13] Screening Matches...")
cur.execute("SELECT id FROM screening_subjects ORDER BY id")
subj_ids = [r[0] for r in cur.fetchall()]
matches = []
for i in range(80):
    subj_id = random.choice(subj_ids)
    entry_id = random.choice(entry_ids)
    score = random.randint(60, 100)
    match_type = random.choice(['Exact','Fuzzy','Phonetic','Transliteration'])
    matched_field = random.choice(['Name','DOB','Passport','Address','Alias'])
    matched_val = f"{random.choice(first_names)} {random.choice(last_names)}"
    src = random.choice(['OFAC','EU','UN','UK','SECO'])
    prog = random.choice(['SDN','CONSOLIDATED','TALIBAN'])
    is_true = random.choice([0,0,1])
    disposition = random.choice(['True Match','False Positive','Pending Review','Escalated'])
    matches.append((subj_id, entry_id, score, match_type, matched_field, matched_val, src, prog, is_true, disposition, None, None, None))
exec_many("INSERT INTO screening_matches (subject_id,entry_id,match_score,match_type,matched_field,matched_value,list_source,programme,is_true_match,disposition,analyst_id,analyst_notes,reviewed_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", matches)

# ─── 14. Screening Alerts ─────────────────────────────────────────────────
print("\n[14] Screening Alerts...")
cur.execute("SELECT id FROM screening_subjects ORDER BY id")
subj_ids = [r[0] for r in cur.fetchall()]
cur.execute("SELECT id FROM screening_matches ORDER BY id")
match_ids = [r[0] for r in cur.fetchall()]
alert_types = ['Sanctions Match','Watchlist Hit','Country Risk','Transaction Risk','PEP Match','Adverse Media']
alert_statuses = ['New','Acknowledged','In Review','Resolved','Escalated']
alerts = []
for i in range(80):
    atype = random.choice(alert_types)
    status = random.choice(alert_statuses)
    severity = random.choice(['Low','Medium','High','Critical'])
    subject = f"{random.choice(first_names)} {random.choice(last_names)}"
    req_id = random.choice(req_ids) if req_ids else None
    subj_id = random.choice(subj_ids) if subj_ids else None
    match_id = random.choice(match_ids) if match_ids else None
    due = (datetime.now() + timedelta(days=random.randint(1, 14))).strftime('%Y-%m-%d')
    created = (datetime.now() - timedelta(days=random.randint(0, 60))).strftime('%Y-%m-%d %H:%M:%S')
    alerts.append((f"ALT{i+1:06d}", req_id, subj_id, match_id, atype, severity, f"{atype}: {subject}", f"Alert generated for {subject} - {atype}", status, random.choice(['jsmith','jdoe','bwilson','abrown']), due, None, None, created))
exec_many("INSERT INTO screening_alerts (alert_id,request_id,subject_id,match_id,alert_type,severity,title,description,status,assigned_to,due_date,resolved_at,resolution,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", alerts)

# ─── 15. Cases ────────────────────────────────────────────────────────────
print("\n[15] Cases...")
exec_sql("DELETE FROM case_notes")
exec_sql("DELETE FROM case_documents")
exec_sql("DELETE FROM cases")
case_types = ['Sanctions Match','Suspicious Transaction','PEP Review','Adverse Media','Periodic Review','Customer Complaint']
case_statuses = ['Open','In Review','Escalated','Closed','Pending Information']
priorities = ['Low','Medium','High','Critical']
cases = []
for i in range(50):
    case_num = f"CASE{2024000+i+1}"
    ctype = random.choice(case_types)
    status = random.choice(case_statuses)
    priority = random.choice(priorities)
    subject = f"{random.choice(first_names)} {random.choice(last_names)}"
    stype = random.choice(['Individual','Entity'])
    analyst = random.choice(['jsmith','jdoe','bwilson','abrown','cdavis'])
    officer = random.choice(['jsmith','jdoe'])
    created = (datetime.now() - timedelta(days=random.randint(0, 180))).strftime('%Y-%m-%d %H:%M:%S')
    closed = (datetime.now() - timedelta(days=random.randint(0, 30))).strftime('%Y-%m-%d %H:%M:%S') if status == 'Closed' else None
    due = (datetime.now() + timedelta(days=random.randint(-10, 30))).strftime('%Y-%m-%d')
    cases.append((case_num, ctype, None, subject, stype, priority, status, analyst, officer, f"Case regarding {subject} - {ctype}", None, None, 0, None, 0, 0, created, closed, due))
exec_many("INSERT INTO cases (case_number,case_type,alert_id,subject_name,subject_type,priority,status,assigned_analyst,supervising_officer,description,decision,decision_rationale,sar_filed,sar_reference,blocked_property_reported,regulatory_disclosure,opened_at,closed_at,sla_due_date) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", cases)

# ─── 16. Case Notes ───────────────────────────────────────────────────────
print("\n[16] Case Notes...")
cur.execute("SELECT id FROM cases ORDER BY id")
case_ids = [r[0] for r in cur.fetchall()]
note_types = ['Investigation','Decision','Escalation','Customer Contact','Regulatory','Internal']
notes = []
for cid in case_ids:
    for j in range(random.randint(1, 4)):
        ntype = random.choice(note_types)
        user = random.choice(['jsmith','jdoe','bwilson','abrown','cdavis'])
        created = (datetime.now() - timedelta(days=random.randint(0, 30))).strftime('%Y-%m-%d %H:%M:%S')
        note_text = random.choice([
            'Initial review completed. Subject matches found on OFAC SDN list.',
            'Customer contacted for additional documentation.',
            'False positive confirmed - different person with similar name.',
            'Case escalated to senior compliance officer for review.',
            'SAR filed with FinCEN reference number pending.',
            'Enhanced due diligence completed. Risk rating updated.',
            'Transaction blocked pending further investigation.',
            'Regulatory disclosure submitted to relevant authority.',
            'Customer provided satisfactory explanation. Case closed.',
            'Ongoing monitoring enhanced. Next review in 90 days.',
        ])
        notes.append((cid, ntype, note_text, user, created))
exec_many("INSERT INTO case_notes (case_id,note_type,note_text,created_by,created_at) VALUES (%s,%s,%s,%s,%s)", notes)

# ─── 17. Internal Watchlist ───────────────────────────────────────────────
print("\n[17] Internal Watchlist...")
exec_sql("DELETE FROM internal_watchlist")
watchlist = [
    ('PEP','Individual','Ahmad Khalil','Ahmad Khalil | Ahmad K','1965-01-01','IQ','IQ','Internal PEP watch','Internal','High','jsmith',None,'Active'),
    ('Sanctions','Entity','Tehran Trading House',None,None,'IR','IR','Suspected OFAC link','Compliance','Critical','bwilson',None,'Active'),
    ('Sanctions','Individual','Viktor Sokolov','Viktor S',None,'RU','CY','Russian oligarch network','AML','High','jdoe',None,'Active'),
    ('Sanctions','Vessel','MV IRAN STAR',None,None,'IR','IR','Suspected Iranian oil tanker','Sanctions','High','bwilson',None,'Active'),
    ('Sanctions','Entity','Eastern Energy Corp',None,None,'RU','RU','Russian energy company','Sanctions','High','jsmith',None,'Active'),
    ('Sanctions','Individual','Omar Al-Houthi','Omar Houthi | O. Al-Houthi',None,'YE','YE','Name match - Houthi connection','Sanctions','Critical','bwilson',None,'Active'),
    ('AML','Entity','Black Sea Resources',None,None,'CY','CY','Cyprus-Russia connection','AML','High','jdoe',None,'Active'),
    ('Sanctions','Individual','Ali Khani',None,None,'IR','TR','Iranian national, Turkey resident','Sanctions','High','bwilson',None,'Active'),
    ('Sanctions','Individual','Ivan Volkov',None,None,'RU','RU','Possible sanctions connection','Sanctions','High','jsmith',None,'Active'),
    ('AML','Entity','Silk Road Import Export',None,None,'CN','AE','China-UAE trade monitoring','AML','Medium','abrown',None,'Active'),
    ('Sanctions','Individual','Mohammed Al-Rashidi',None,'1968-11-30','IQ','IQ','Name similarity to SDN entry','Compliance','High','bwilson',None,'Active'),
    ('PEP','Individual','Abdullah Al-Saud',None,'1960-11-22','SA','SA','Saudi royal family member','PEP','Medium','jsmith',None,'Active'),
]
exec_many("INSERT INTO internal_watchlist (watchlist_type,entity_type,entity_name,aliases,dob,nationality,country,reason,source,risk_level,added_by,review_date,status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", watchlist)

# ─── 18. Screening Rules ──────────────────────────────────────────────────
print("\n[18] Screening Rules...")
exec_sql("DELETE FROM screening_rules")
rules = [
    ('OFAC_SDN_EXACT','OFAC SDN Exact Match','Exact Match','Exact match against OFAC SDN list',100,100,85,'All','OFAC',1,1),
    ('OFAC_SDN_FUZZY','OFAC SDN Fuzzy Match','Fuzzy Match','Fuzzy match against OFAC SDN list (85% threshold)',85,100,85,'All','OFAC',1,2),
    ('EU_EXACT','EU Consolidated Exact','Exact Match','Exact match against EU consolidated list',100,100,80,'All','EU',1,3),
    ('EU_FUZZY','EU Consolidated Fuzzy','Fuzzy Match','Fuzzy match against EU list (80% threshold)',80,100,80,'All','EU',1,4),
    ('UN_EXACT','UN Security Council Exact','Exact Match','Exact match against UN Security Council list',100,100,85,'All','UN',1,5),
    ('UK_EXACT','UK OFSI Exact','Exact Match','Exact match against UK OFSI list',100,100,85,'All','UK',1,6),
    ('COUNTRY_HIGH','High Risk Country Check','Country Check','Flag transactions to/from high-risk countries',0,0,0,'All','ALL',1,7),
    ('COUNTRY_CRITICAL','Critical Country Block','Country Check','Block transactions to/from sanctioned countries',0,100,0,'All','ALL',1,8),
    ('PEP_CHECK','PEP Database Check','PEP Match','Check against PEP database',70,0,70,'All','ALL',1,9),
    ('ADVERSE_MEDIA','Adverse Media Check','Media Check','Adverse media screening',0,0,0,'All','ALL',1,10),
    ('VESSEL_IMO','Vessel IMO Check','Vessel Check','Check vessel IMO numbers against sanctions',100,100,85,'Vessel','OFAC',1,11),
    ('TRANSLITERATION','Name Transliteration','Transliteration','Match transliterated name variants',75,0,75,'All','ALL',1,12),
    ('PHONETIC_MATCH','Phonetic Name Match','Phonetic','Phonetic name matching (Soundex/Metaphone)',80,0,80,'All','ALL',1,13),
    ('FIFTY_PCT_RULE','50% Ownership Rule','Ownership','Apply OFAC 50% ownership rule',50,100,50,'Entity','OFAC',1,14),
    ('BATCH_DAILY','Daily Batch Screening','Batch Screen','Daily batch screening of all customers',0,0,0,'All','ALL',1,15),
]
exec_many("INSERT INTO screening_rules (rule_code,rule_name,rule_type,description,match_threshold,auto_block_threshold,review_threshold,applies_to,lists_to_check,is_active,priority) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", rules)

# ─── 19. Trade Finance ────────────────────────────────────────────────────
print("\n[19] Trade Finance...")
exec_sql("DELETE FROM trade_finance_lc")
tf_statuses = ['Draft','Issued','Confirmed','Amended','Utilized','Expired','Cancelled']
tf_records = []
for i in range(30):
    lc_num = f"LC{2024000+i+1}"
    applicant = random.choice(['Al-Farsi Trading LLC','Global Tech Solutions','Silk Road Import Export','Mediterranean Shipping Co','Pacific Rim Holdings'])
    bene = random.choice(['Eastern Supplier Ltd','Western Goods Corp','Pacific Exports Inc','Atlantic Trade Co','Indian Textiles Ltd'])
    bene_country = random.choice(countries_hi + ['IN','CN','DE','US'])
    amount = round(random.uniform(50000, 2000000), 2)
    cur_c = random.choice(['USD','EUR','GBP'])
    status = random.choice(tf_statuses)
    origin = random.choice(['AE','US','GB','SG','DE'])
    dest = random.choice(countries_hi)
    expiry = (datetime.now() + timedelta(days=random.randint(30, 180))).strftime('%Y-%m-%d')
    ship_date = (datetime.now() + timedelta(days=random.randint(15, 90))).strftime('%Y-%m-%d')
    goods = random.choice(['Electronics','Machinery','Chemicals','Textiles','Food Products','Oil Products','Steel','Pharmaceuticals'])
    screen_status = random.choice(['Clear','Pending','Flagged'])
    tf_records.append((lc_num, 'Irrevocable', None, applicant, bene, bene_country, 'NBAD AE', 'Citi US', 'NBAD AE', amount, cur_c, expiry, ship_date, origin, dest, None, goods, None, None, None, 'CIF', status, screen_status, None))
exec_many("INSERT INTO trade_finance_lc (lc_number,lc_type,applicant_id,applicant_name,beneficiary_name,beneficiary_country,advising_bank,confirming_bank,issuing_bank,amount,currency,expiry_date,latest_shipment_date,port_of_loading,port_of_discharge,transshipment_ports,goods_description,hs_codes,vessel_name,imo_number,incoterms,status,sanctions_status,screening_request_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", tf_records)

# ─── 20. Vessels ──────────────────────────────────────────────────────────
print("\n[20] Vessels...")
exec_sql("DELETE FROM vessels")
vessel_types = ['Tanker','Container','Bulk Carrier','General Cargo','Passenger','Fishing','Naval']
vessel_flags = ['IR','RU','KP','SY','VE','PA','LR','MH','BS','CY']
vessel_names = ['IRAN SHAHED','NORD STREAM PIONEER','DALI STAR','GRACE 1','ADMIRAL KUZNETSOV','PERSIAN GULF STAR','BLACK SEA TRADER','PACIFIC HORIZON','ATLANTIC EAGLE','EASTERN DRAGON']
vessels_data = []
for i in range(40):
    imo = f"9{random.randint(100000,999999)}"
    name = f"MV {vessel_names[i]}" if i < len(vessel_names) else f"MV {random.choice(['STAR','EAGLE','FALCON','DRAGON','TIGER','LION','PHOENIX'])} {chr(65+i%26)}"
    vtype = random.choice(vessel_types)
    flag = random.choice(vessel_flags)
    gt = random.randint(5000, 200000)
    year = random.randint(1990, 2020)
    owner = random.choice(['Iranian Shipping Lines','Black Sea Shipping','Pacific Maritime','Atlantic Carriers','Eastern Fleet','IRISL Group','Sovcomflot'])
    call_sign = ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=4))
    mmsi = str(random.randint(100000000, 999999999))
    is_sanctioned = 1 if flag in ['IR','KP','SY'] else 0
    risk = random.choice(['Low','Medium','High','Critical'])
    vessels_data.append((imo, name, vtype, flag, flag, gt, year, owner, owner, owner, call_sign, mmsi, is_sanctioned, None, None, None, risk, f"Vessel monitoring - {vtype}"))
exec_many("INSERT INTO vessels (imo_number,vessel_name,vessel_type,flag_state,flag_country_code,gross_tonnage,year_built,owner_name,operator_name,manager_name,call_sign,mmsi,is_sanctioned,sanctions_entry_id,last_known_port,last_known_position,risk_rating,notes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", vessels_data)

# ─── 21. App Users ────────────────────────────────────────────────────────
print("\n[21] App Users...")
exec_sql("DELETE FROM app_users")
users = [
    ('admin','System Administrator','admin@sanctionsengine.com','Admin','IT',1),
    ('jsmith','John Smith','j.smith@sanctionsengine.com','Compliance Officer','Compliance',1),
    ('jdoe','Jane Doe','j.doe@sanctionsengine.com','Compliance Officer','Compliance',1),
    ('bwilson','Bob Wilson','b.wilson@sanctionsengine.com','Analyst','Risk',1),
    ('abrown','Alice Brown','a.brown@sanctionsengine.com','Analyst','AML',1),
    ('cdavis','Charlie Davis','c.davis@sanctionsengine.com','Analyst','Sanctions',1),
    ('mlee','Michael Lee','m.lee@sanctionsengine.com','Viewer','Operations',1),
    ('swong','Susan Wong','s.wong@sanctionsengine.com','Auditor','Audit',1),
    ('rpatel','Raj Patel','r.patel@sanctionsengine.com','Viewer','IT',1),
    ('lkhan','Lisa Khan','l.khan@sanctionsengine.com','Compliance Officer','Compliance',1),
]
exec_many("INSERT INTO app_users (username,full_name,email,role,department,is_active) VALUES (%s,%s,%s,%s,%s,%s)", users)

# ─── 22. Audit Log ────────────────────────────────────────────────────────
print("\n[22] Audit Log...")
exec_sql("DELETE FROM audit_log")
event_types = ['CREATE','UPDATE','DELETE','VIEW','SCREEN','APPROVE','REJECT','EXPORT','LOGIN','LOGOUT']
entities_list = ['sanctions_entries','core_customers','cases','screening_requests','screening_alerts','trade_finance_lc','vessels','app_users']
audit_entries = []
for i in range(200):
    user = random.choice(['admin','jsmith','jdoe','bwilson','abrown','cdavis'])
    event = random.choice(event_types)
    entity = random.choice(entities_list)
    entity_id = str(random.randint(1, 100))
    created = (datetime.now() - timedelta(days=random.randint(0, 90), hours=random.randint(0, 23))).strftime('%Y-%m-%d %H:%M:%S')
    ip = f"192.168.{random.randint(1,10)}.{random.randint(1,254)}"
    audit_entries.append((event, entity, entity_id, event, user, ip, None, None, f"{event} on {entity} #{entity_id}"))
exec_many("INSERT INTO audit_log (event_type,entity_type,entity_id,action,performed_by,ip_address,old_values,new_values,description) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", audit_entries)

# ─── 23. Reports ──────────────────────────────────────────────────────────
print("\n[23] Reports...")
exec_sql("DELETE FROM reports")
report_types = ['Sanctions Screening','Compliance Summary','Risk Report','Audit Trail','Customer Risk','Transaction Monitoring','Regulatory']
report_statuses = ['Generated','Pending','Failed','Scheduled']
reports = []
for i in range(20):
    rtype = random.choice(report_types)
    status = random.choice(report_statuses)
    created = (datetime.now() - timedelta(days=random.randint(0, 90))).strftime('%Y-%m-%d %H:%M:%S')
    params = json.dumps({"period":"monthly","format":"PDF"})
    reports.append((f"RPT{2024000+i+1}", rtype, f"{rtype} - {datetime.now().strftime('%Y-%m')}", random.choice(['jsmith','jdoe','admin']), params, status, None, 0, created))
exec_many("INSERT INTO reports (report_id,report_type,report_name,generated_by,parameters,status,file_path,row_count,generated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", reports)

# ─── 24. Scrape Run History ───────────────────────────────────────────────
print("\n[24] Scrape Run History...")
exec_sql("DELETE FROM scrape_run_history")
scrape_runs = []
for src_code, src_id in source_map.items():
    for i in range(5):
        started = (datetime.now() - timedelta(days=i*3, hours=random.randint(0,12))).strftime('%Y-%m-%d %H:%M:%S')
        completed = (datetime.now() - timedelta(days=i*3, hours=random.randint(0,11))).strftime('%Y-%m-%d %H:%M:%S')
        downloaded = random.randint(1000, 50000)
        added = random.randint(0, 50)
        updated = random.randint(0, 20)
        deleted = random.randint(0, 5)
        status = random.choice(['Completed','Completed','Completed','Failed'])
        scrape_runs.append((f"RUN{src_code}{i+1:04d}", src_id, started, completed, status, downloaded, added, updated, deleted, None if status == 'Completed' else 'Connection timeout', None, None))
exec_many("INSERT INTO scrape_run_history (run_id,source_id,started_at,completed_at,status,records_downloaded,records_added,records_updated,records_deleted,error_message,file_path,file_hash) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", scrape_runs)

print("\n=== Summary ===")
summary_tables = ['sanctions_entries','sanctions_aliases','sanctions_identifiers','core_customers','core_accounts','core_transactions','core_assets','core_liabilities','cases','case_notes','screening_alerts','screening_requests','screening_subjects','screening_matches','trade_finance_lc','vessels','app_users','countries','audit_log','internal_watchlist','screening_rules','reports','scrape_run_history']
for t in summary_tables:
    try:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        count = cur.fetchone()[0]
        print(f"  {t}: {count} rows")
    except Exception as e:
        print(f"  {t}: ERROR - {str(e)[:60]}")

conn.close()
print("\n=== Demo Data Population Complete! ===")
