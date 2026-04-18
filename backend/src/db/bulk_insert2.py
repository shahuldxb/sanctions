#!/usr/bin/env python3
"""Bulk insert with exact column types for all tables."""
import pymssql, random, sys

conn = pymssql.connect(server='203.101.44.46', user='shahul', password='Apple123!@#',
                       database='sanctions', autocommit=True, timeout=60)
cursor = conn.cursor()

first_names = ['Ahmad','Mohammed','Ali','Hassan','Ibrahim','Khalid','Omar','Yusuf',
               'James','John','Robert','Michael','David','William','Richard','Charles',
               'Wang','Li','Zhang','Liu','Chen','Yang','Huang','Zhao',
               'Sergei','Ivan','Nikolai','Dmitri','Vladimir','Alexei',
               'Carlos','Juan','Miguel','Jose','Luis','Pedro','Antonio',
               'Fatima','Aisha','Maryam','Sarah','Emma','Olivia','Sophia',
               'Reza','Tariq','Nasser','Faisal','Hamad','Rashid','Saeed',
               'Anwar','Basim','Dawud','Emir','Farouk','Ghazi','Hani']
last_names = ['Al-Rashid','Al-Farsi','Al-Mansouri','Al-Hashimi','Al-Qasimi',
              'Smith','Johnson','Williams','Brown','Jones','Miller','Davis',
              'Wei','Fang','Guo','Sun','Ma','Hu','Luo','Lin',
              'Petrov','Ivanov','Sidorov','Kozlov','Novikov','Morozov',
              'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez',
              'Khalil','Hassan','Ahmed','Hussain','Rahman','Bakr','Nouri',
              'Tanaka','Yamamoto','Nakamura','Kobayashi','Ito','Watanabe']
countries = ['AE','SA','US','GB','DE','FR','CN','RU','IN','BR','SG','HK','JP','KR','AU','CH','CA','NL','SE','NO','QA','KW','BH','OM']
users_list = ['analyst1','analyst2','compliance1','officer1','manager1']

def rname():
    return f"{random.choice(first_names)} {random.choice(last_names)}"

# ── Fix customers (pep_status is bit) ─────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM core_customers")
existing = cursor.fetchone()[0]
to_add = max(0, 150 - existing)
print(f"Adding {to_add} customers (currently {existing})...")

for i in range(to_add):
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    ctype = random.choice(['Individual','Individual','Corporate','Corporate','Trust','Government'])
    country = random.choice(countries)
    risk = random.choice(['Low','Low','Low','Medium','Medium','High','Critical'])
    cust_id = f"CUST{20000+existing+i:05d}"
    is_pep = 1 if random.random() < 0.05 else 0
    
    if 'Individual' in ctype:
        name = f"{fn} {ln}"
        email = f"{fn.lower()}{random.randint(1,9999)}@{random.choice(['gmail.com','yahoo.com','hotmail.com'])}"
        dob = f"{random.randint(1950,2000)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"
    else:
        corp_names = ['Global Trading LLC','International Holdings','Capital Group','Resources Corp',
                      'Tech Solutions','Maritime Services','Energy Partners','Finance International']
        name = f"{ln} {random.choice(corp_names)}"
        email = f"info{random.randint(1,99)}@{ln.lower().replace('-','').replace(' ','')}.com"
        dob = None
    
    try:
        cursor.execute("""
            INSERT INTO core_customers (customer_id, customer_type, first_name, last_name, full_name,
            date_of_birth, nationality, country_of_residence, email, risk_rating, sanctions_status,
            kyc_status, pep_status, status, onboarding_date, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%d,%s,GETDATE(),GETDATE(),GETDATE())
        """, (cust_id, ctype, fn if 'Individual' in ctype else '', ln if 'Individual' in ctype else '',
              name, dob, country, country, email, risk,
              random.choice(['Clear','Clear','Clear','Pending','Review','Blocked']),
              random.choice(['Approved','Approved','Pending','Expired']),
              is_pep, 'Active'))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM core_customers")
print(f"Customers: {cursor.fetchone()[0]}")

# ── Accounts ───────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM core_accounts")
existing_accts = cursor.fetchone()[0]
cursor.execute("SELECT id FROM core_customers ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 80 ROWS ONLY")
cust_ids = [row[0] for row in cursor.fetchall()]

acct_types = ['Current','Savings','Fixed Deposit','Call Deposit','Nostro','Vostro','Trade Finance','Investment']
currencies = ['USD','EUR','GBP','AED','SGD','JPY','CHF','AUD','CAD','SAR']
branches = [('BR001','Dubai Main'),('BR002','Abu Dhabi'),('BR003','London'),('BR004','New York'),('BR005','Singapore')]

for i in range(max(0, 300 - existing_accts)):
    if not cust_ids: break
    acct_num = f"ACC{random.randint(1000000000,9999999999)}"
    br = random.choice(branches)
    balance = round(random.uniform(1000, 10000000), 2)
    sanctions_hold = 1 if random.random() < 0.05 else 0
    try:
        cursor.execute("""
            INSERT INTO core_accounts (account_number, customer_id, account_type, currency, balance,
            available_balance, interest_rate, status, opened_date, branch_code, branch_name,
            sanctions_hold, created_at, updated_at)
            VALUES (%s,%d,%s,%s,%s,%s,%s,%s,GETDATE(),%s,%s,%d,GETDATE(),GETDATE())
        """, (acct_num, random.choice(cust_ids), random.choice(acct_types),
              random.choice(currencies), balance, round(balance * 0.9, 2),
              round(random.uniform(0.5, 8.5), 2),
              random.choice(['Active','Active','Active','Dormant','Frozen']),
              br[0], br[1], sanctions_hold))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM core_accounts")
print(f"Accounts: {cursor.fetchone()[0]}")

# ── Transactions ───────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM core_transactions")
existing_txns = cursor.fetchone()[0]
cursor.execute("SELECT id FROM core_accounts ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY")
acct_ids = [row[0] for row in cursor.fetchall()]

txn_types = ['Wire Transfer','SWIFT','ACH','SEPA','Cash Deposit','Cash Withdrawal','Trade Payment','Internal Transfer','Cheque','RTGS']
hi_risk = ['RU','IR','KP','SY','CU','SD','MM','BY','VE','LY']
all_ctry = countries + hi_risk
currencies2 = ['USD','EUR','GBP','AED','SGD','JPY','CHF']

for i in range(max(0, 2000 - existing_txns)):
    if not acct_ids: break
    acct_id = random.choice(acct_ids)
    amount = round(random.uniform(500, 2000000), 2)
    cparty_country = random.choice(all_ctry)
    is_flagged = cparty_country in hi_risk
    txn_id = f"TXN{random.randint(100000000,999999999)}"
    
    try:
        cursor.execute("""
            INSERT INTO core_transactions (transaction_id, account_id, transaction_type, amount, currency,
            counterparty_name, counterparty_country, counterparty_bank, reference_number,
            sanctions_result, transaction_date, created_at)
            VALUES (%s,%d,%s,%s,%s,%s,%s,%s,%s,%s,DATEADD(day,-%d,GETDATE()),GETDATE())
        """, (txn_id, acct_id, random.choice(txn_types), amount, random.choice(currencies2),
              rname(), cparty_country,
              f"{'SBERBANK' if cparty_country=='RU' else 'STD CHARTERED'} {cparty_country}",
              f"REF{random.randint(10000000,99999999)}",
              'Flagged' if is_flagged else random.choice(['Clear','Clear','Clear','Pending']),
              random.randint(0, 730)))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM core_transactions")
print(f"Transactions: {cursor.fetchone()[0]}")

# ── Alerts ─────────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM screening_alerts")
existing_alerts = cursor.fetchone()[0]

alert_types = ['SANCTIONS_MATCH','SANCTIONS_MATCH','HIGH_RISK_COUNTRY','PEP_MATCH','ADVERSE_MEDIA','TRANSACTION_PATTERN','VELOCITY_CHECK','NAME_SIMILARITY']
severities = ['Critical','High','High','Medium','Low']

for i in range(max(0, 250 - existing_alerts)):
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    src = random.choice(['OFAC','EU','UN','UK','SECO','DFAT','MAS'])
    score = random.randint(75, 100)
    try:
        cursor.execute("""
            INSERT INTO screening_alerts (alert_type, severity, title, description, status, assigned_to, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,DATEADD(day,-%d,GETDATE()),GETDATE())
        """, (random.choice(alert_types), random.choice(severities),
              f"Potential {src} match: {fn} {ln}",
              f"Screening detected {fn} {ln} matches {src} list with {score}% confidence. Requires review.",
              random.choice(['Open','Open','In Review','Resolved','False Positive']),
              random.choice(users_list), random.randint(0, 180)))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM screening_alerts")
print(f"Alerts: {cursor.fetchone()[0]}")

# ── Cases ──────────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM cases")
existing_cases = cursor.fetchone()[0]

case_types = ['SANCTIONS_HIT','SANCTIONS_HIT','PEP_REVIEW','HIGH_RISK','ADVERSE_MEDIA','TRANSACTION_MONITORING','KYC_REVIEW','AML_INVESTIGATION']
case_statuses = ['Open','Open','In Review','Escalated','Closed','Closed','Pending']

for i in range(max(0, 200 - existing_cases)):
    case_num = f"CASE-{2024+random.randint(0,2)}-{random.randint(10000,99999)}"
    try:
        cursor.execute("""
            INSERT INTO cases (case_number, case_type, subject_name, subject_type, priority, status,
            assigned_analyst, description, opened_at, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,DATEADD(day,-%d,GETDATE()),GETDATE(),GETDATE())
        """, (case_num, random.choice(case_types), rname(),
              random.choice(['Individual','Corporate','Vessel']),
              random.choice(['Critical','High','Medium','Low']),
              random.choice(case_statuses), random.choice(users_list),
              f"Case opened following sanctions screening match. Requires investigation.",
              random.randint(0, 365)))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM cases")
print(f"Cases: {cursor.fetchone()[0]}")

# ── Audit Log ──────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM audit_log")
existing_audit = cursor.fetchone()[0]

actions = ['CREATE','UPDATE','DELETE','VIEW','SCREEN','APPROVE','REJECT','EXPORT','LOGIN','LOGOUT','ESCALATE','BLOCK','UNBLOCK']
entities = ['Customer','Account','Transaction','Case','Alert','SanctionEntry','ScreeningRequest','Rule','User','Report','Vessel']

for i in range(max(0, 2000 - existing_audit)):
    action = random.choice(actions)
    entity = random.choice(entities)
    try:
        cursor.execute("""
            INSERT INTO audit_log (event_type, entity_type, entity_id, action, performed_by, ip_address, description, created_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,DATEADD(minute,-%d,GETDATE()))
        """, (action, entity, str(random.randint(1, 500)), action,
              random.choice(users_list),
              f"192.168.{random.randint(1,10)}.{random.randint(1,254)}",
              f"User {action.lower()}d {entity} #{random.randint(1,500)}",
              random.randint(0, 525600)))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM audit_log")
print(f"Audit log: {cursor.fetchone()[0]}")

# ── Watchlist ──────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM internal_watchlist")
existing_wl = cursor.fetchone()[0]

for i in range(max(0, 150 - existing_wl)):
    try:
        cursor.execute("""
            INSERT INTO internal_watchlist (watchlist_type, entity_type, entity_name, reason, risk_level,
            source, added_by, status, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'Active',DATEADD(day,-%d,GETDATE()),GETDATE())
        """, (random.choice(['Sanctions','PEP','Adverse Media','Internal','Regulatory']),
              random.choice(['Individual','Corporate','Vessel','Account']),
              rname(),
              random.choice(['Sanctions match','PEP identified','Adverse media','High risk country','Suspicious activity']),
              random.choice(['High','High','Medium','Critical','Low']),
              random.choice(['OFAC','EU','UN','UK','Internal']),
              random.choice(users_list), random.randint(0, 730)))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM internal_watchlist")
print(f"Watchlist: {cursor.fetchone()[0]}")

# ── Case Notes ─────────────────────────────────────────────────────────────
cursor.execute("SELECT id FROM cases ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 80 ROWS ONLY")
case_ids = [row[0] for row in cursor.fetchall()]

note_texts = [
    "Initial review completed. Subject matches OFAC SDN list with 87% confidence.",
    "Customer contacted for additional documentation. Awaiting response.",
    "Enhanced due diligence initiated. Reviewing 3-year transaction history.",
    "Escalated to senior compliance officer for review.",
    "False positive confirmed. Name similarity only - different DOB and nationality.",
    "SAR filing initiated. Suspicious activity confirmed.",
    "Case closed - no sanctions match confirmed after full investigation.",
    "Transaction blocked pending further review.",
    "Regulatory disclosure filed with relevant authority.",
    "Additional aliases identified. Expanding search scope.",
    "Reviewed transaction history. No suspicious patterns identified.",
    "Customer provided satisfactory explanation for flagged transactions.",
    "Referred to law enforcement. Evidence preserved.",
    "Risk rating upgraded to High following investigation findings.",
    "Account frozen pending regulatory guidance.",
    "Second-level review completed. Escalating to compliance committee.",
    "Beneficial ownership structure reviewed. No sanctions concerns.",
    "Correspondent bank notified of potential sanctions exposure.",
]

cursor.execute("SELECT COUNT(*) FROM case_notes")
existing_notes = cursor.fetchone()[0]

for i in range(max(0, 500 - existing_notes)):
    if not case_ids: break
    try:
        cursor.execute("""
            INSERT INTO case_notes (case_id, note_type, note_text, created_by, created_at)
            VALUES (%d,%s,%s,%s,DATEADD(day,-%d,GETDATE()))
        """, (random.choice(case_ids),
              random.choice(['Investigation','Decision','Communication','System','Escalation','Review']),
              random.choice(note_texts), random.choice(users_list), random.randint(0, 180)))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM case_notes")
print(f"Case notes: {cursor.fetchone()[0]}")

# ── Vessels ────────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM vessels")
existing_vessels = cursor.fetchone()[0]

vessel_names = ['MV PACIFIC STAR','MV ATLANTIC GLORY','MV INDIAN OCEAN','MV ARCTIC WIND',
                'MV GOLDEN DRAGON','MV SILVER MOON','MV BLACK SEA','MV RED STAR',
                'MV CASPIAN EAGLE','MV PERSIAN GULF','MV ARABIAN SEA','MV CORAL REEF',
                'MV NORTHERN LIGHT','MV SOUTHERN CROSS','MV EASTERN PROMISE','MV WESTERN SPIRIT',
                'MV FREEDOM','MV LIBERTY','MV JUSTICE','MV PROSPERITY',
                'MV TEHRAN EXPRESS','MV PYONGYANG TRADER','MV HAVANA STAR','MV DAMASCUS ROSE',
                'MV MINSK GLORY','MV CARACAS WIND','MV TRIPOLI STAR','MV KHARTOUM TRADER']
vessel_types = ['Bulk Carrier','Container Ship','Tanker','General Cargo','RoRo','LNG Carrier','VLCC','Feeder','Chemical Tanker']
flag_states = ['Panama','Liberia','Marshall Islands','Bahamas','Malta','Cyprus','Singapore','Hong Kong','Iran','North Korea','Russia','Belize','Togo','Cameroon']

for i in range(max(0, 120 - existing_vessels)):
    flag = random.choice(flag_states)
    is_sanctioned = 1 if flag in ['Iran','North Korea'] else (1 if random.random() < 0.1 else 0)
    imo = f"IMO{random.randint(1000000,9999999)}"
    try:
        cursor.execute("""
            INSERT INTO vessels (vessel_name, imo_number, mmsi_number, vessel_type, flag_state,
            gross_tonnage, year_built, owner_name, operator_name, is_sanctioned, sanctions_reason,
            created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%d,%d,%s,%s,%d,%s,GETDATE(),GETDATE())
        """, (random.choice(vessel_names) + f" {random.randint(1,99)}", imo,
              str(random.randint(100000000,999999999)),
              random.choice(vessel_types), flag,
              random.randint(5000, 300000), random.randint(1990, 2023),
              f"{random.choice(last_names)} Shipping Co",
              f"{random.choice(last_names)} Maritime Ops",
              is_sanctioned,
              'Flag state under sanctions' if is_sanctioned else None))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM vessels")
print(f"Vessels: {cursor.fetchone()[0]}")

# ── Trade Finance ──────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM trade_finance_lc")
existing_tf = cursor.fetchone()[0]
cursor.execute("SELECT id FROM core_customers ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY")
cust_ids_tf = [row[0] for row in cursor.fetchall()]

tf_types = ['Letter of Credit','Standby LC','Bank Guarantee','Documentary Collection','Trade Loan','Supply Chain Finance','Export Credit']
goods_types = ['Electronics','Machinery','Chemicals','Petroleum','Food & Agriculture','Textiles','Steel','Pharmaceuticals','Weapons','Dual-Use Goods']

for i in range(max(0, 200 - existing_tf)):
    if not cust_ids_tf: break
    ref = f"LC{random.randint(2024,2026)}{random.randint(100000,999999)}"
    applicant_country = random.choice(countries)
    beneficiary_country = random.choice(countries + hi_risk)
    is_flagged = beneficiary_country in hi_risk
    try:
        cursor.execute("""
            INSERT INTO trade_finance_lc (lc_reference, lc_type, applicant_id, applicant_name,
            applicant_country, beneficiary_name, beneficiary_country, beneficiary_bank,
            amount, currency, goods_description, screening_status, created_at, updated_at)
            VALUES (%s,%s,%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,GETDATE(),GETDATE())
        """, (ref, random.choice(tf_types), random.choice(cust_ids_tf),
              rname() + ' Trading',
              applicant_country,
              rname() + ' Corp',
              beneficiary_country,
              f"{'SBERBANK' if beneficiary_country=='RU' else 'STD CHARTERED'} {beneficiary_country}",
              round(random.uniform(50000, 50000000), 2),
              random.choice(['USD','EUR','GBP','AED']),
              random.choice(goods_types),
              'Flagged' if is_flagged else random.choice(['Clear','Clear','Pending'])))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM trade_finance_lc")
print(f"Trade Finance: {cursor.fetchone()[0]}")

# ── Scrape Run History ─────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM scrape_run_history")
existing_scrape = cursor.fetchone()[0]

sources_list = ['OFAC','EU','UN','UK','SECO','DFAT','MAS','BIS']
run_statuses = ['Completed','Completed','Completed','Failed','Partial']

for i in range(max(0, 200 - existing_scrape)):
    src = random.choice(sources_list)
    status = random.choice(run_statuses)
    records = random.randint(100, 5000) if status != 'Failed' else 0
    dur = random.randint(30, 290)
    try:
        cursor.execute("""
            INSERT INTO scrape_run_history (source_code, run_type, status, records_fetched, records_new,
            records_updated, records_deleted, duration_seconds, started_at, completed_at, created_at)
            VALUES (%s,%s,%s,%d,%d,%d,%d,%d,
            DATEADD(day,-%d,GETDATE()),
            DATEADD(second,%d,DATEADD(day,-%d,GETDATE())),
            GETDATE())
        """, (src, random.choice(['Full','Delta','Manual']),
              status, records, int(records*0.1), int(records*0.05), int(records*0.02),
              dur, random.randint(0,90), dur, random.randint(0,90)))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM scrape_run_history")
print(f"Scrape history: {cursor.fetchone()[0]}")

# ── Assets ─────────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM core_assets")
existing_assets = cursor.fetchone()[0]
cursor.execute("SELECT id FROM core_customers ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY")
cust_ids_a = [row[0] for row in cursor.fetchall()]

asset_types = ['Real Estate','Vehicle','Investment Portfolio','Business Interest','Precious Metals','Art & Collectibles','Intellectual Property','Cryptocurrency']

for i in range(max(0, 200 - existing_assets)):
    if not cust_ids_a: break
    try:
        cursor.execute("""
            INSERT INTO core_assets (customer_id, asset_type, asset_description, estimated_value, currency,
            country_of_location, is_frozen, created_at, updated_at)
            VALUES (%d,%s,%s,%s,%s,%s,%d,GETDATE(),GETDATE())
        """, (random.choice(cust_ids_a), random.choice(asset_types),
              f"{random.choice(asset_types)} - {random.choice(countries)}",
              round(random.uniform(10000, 50000000), 2),
              random.choice(['USD','EUR','GBP','AED']),
              random.choice(countries),
              1 if random.random() < 0.05 else 0))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM core_assets")
print(f"Assets: {cursor.fetchone()[0]}")

# ── Liabilities ────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM core_liabilities")
existing_liab = cursor.fetchone()[0]
cursor.execute("SELECT id FROM core_customers ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY")
cust_ids_l = [row[0] for row in cursor.fetchall()]

liab_types = ['Mortgage','Personal Loan','Business Loan','Credit Card','Overdraft','Trade Finance','Guarantee','Bond']

for i in range(max(0, 200 - existing_liab)):
    if not cust_ids_l: break
    try:
        cursor.execute("""
            INSERT INTO core_liabilities (customer_id, liability_type, description, principal_amount, outstanding_balance,
            currency, interest_rate, status, created_at, updated_at)
            VALUES (%d,%s,%s,%s,%s,%s,%s,%s,GETDATE(),GETDATE())
        """, (random.choice(cust_ids_l), random.choice(liab_types),
              f"{random.choice(liab_types)} facility",
              round(random.uniform(10000, 10000000), 2),
              round(random.uniform(5000, 9000000), 2),
              random.choice(['USD','EUR','GBP','AED']),
              round(random.uniform(2.5, 15.0), 2),
              random.choice(['Active','Active','Overdue','Settled','Default'])))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM core_liabilities")
print(f"Liabilities: {cursor.fetchone()[0]}")

cursor.close()
conn.close()
print("\nBulk insert 2 complete!")
