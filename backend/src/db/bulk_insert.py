#!/usr/bin/env python3
"""Fast bulk data insert with correct column types."""
import pymssql
import random

conn = pymssql.connect(
    server='203.101.44.46',
    user='shahul',
    password='Apple123!@#',
    database='sanctions',
    autocommit=True,
    timeout=60
)
cursor = conn.cursor()
print("Bulk inserting demo data...")

first_names = ['Ahmad','Mohammed','Ali','Hassan','Ibrahim','Khalid','Omar','Yusuf',
               'James','John','Robert','Michael','David','William','Richard','Charles',
               'Wang','Li','Zhang','Liu','Chen','Yang','Huang','Zhao',
               'Sergei','Ivan','Nikolai','Dmitri','Vladimir','Alexei',
               'Carlos','Juan','Miguel','Jose','Luis','Pedro','Antonio',
               'Fatima','Aisha','Maryam','Sarah','Emma','Olivia','Sophia',
               'Reza','Tariq','Nasser','Faisal','Hamad','Rashid','Saeed']
last_names = ['Al-Rashid','Al-Farsi','Al-Mansouri','Al-Hashimi','Al-Qasimi',
              'Smith','Johnson','Williams','Brown','Jones','Miller','Davis',
              'Wei','Fang','Guo','Sun','Ma','Hu','Luo','Lin',
              'Petrov','Ivanov','Sidorov','Kozlov','Novikov','Morozov',
              'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez',
              'Khalil','Hassan','Ahmed','Hussain','Rahman','Bakr','Nouri']
countries = ['AE','SA','US','GB','DE','FR','CN','RU','IN','BR','SG','HK','JP','KR','AU','CH','CA','NL','SE','NO']
users_list = ['analyst1','analyst2','compliance1','officer1','manager1']

# ── Customers ──────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM core_customers")
existing = cursor.fetchone()[0]
to_add = max(0, 120 - existing)
print(f"Adding {to_add} customers...")

for i in range(to_add):
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    ctype = random.choice(['Individual','Individual','Corporate','Corporate','Trust','Government'])
    country = random.choice(countries)
    risk = random.choice(['Low','Low','Low','Medium','Medium','High','Critical'])
    dob = f"{random.randint(1950,2000)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"
    cust_id = f"CUST{10000+existing+i:05d}"
    is_pep = 1 if random.random() < 0.05 else 0
    
    if ctype == 'Individual':
        name = f"{fn} {ln}"
        email = f"{fn.lower()}{random.randint(1,9999)}@{random.choice(['gmail.com','yahoo.com','hotmail.com','outlook.com'])}"
    else:
        corp_names = ['Global Trading LLC','International Holdings','Capital Group','Resources Corp',
                      'Tech Solutions','Maritime Services','Energy Partners','Finance International',
                      'Investment Holdings','Trade Corp','Logistics Group','Consulting Ltd']
        name = f"{ln} {random.choice(corp_names)}"
        email = f"info{random.randint(1,99)}@{ln.lower().replace('-','').replace(' ','')}.com"
    
    try:
        cursor.execute("""
            INSERT INTO core_customers (customer_id, customer_type, first_name, last_name, full_name,
            date_of_birth, nationality, country_of_residence, email, risk_rating, sanctions_status,
            kyc_status, pep_status, status, onboarding_date, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, GETDATE(), GETDATE(), GETDATE())
        """, (
            cust_id, ctype,
            fn if 'Individual' in ctype else '',
            ln if 'Individual' in ctype else '',
            name, dob if 'Individual' in ctype else None,
            country, country, email, risk,
            random.choice(['Clear','Clear','Clear','Pending','Review','Blocked']),
            random.choice(['Approved','Approved','Pending','Expired']),
            is_pep, 'Active'
        ))
    except Exception as e:
        pass  # Skip duplicates

cursor.execute("SELECT COUNT(*) FROM core_customers")
print(f"Customers: {cursor.fetchone()[0]}")

# ── Accounts ───────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM core_accounts")
existing_accts = cursor.fetchone()[0]
cursor.execute("SELECT id FROM core_customers ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY")
cust_ids = [row[0] for row in cursor.fetchall()]

acct_types = ['Current','Savings','Fixed Deposit','Call Deposit','Nostro','Vostro','Trade Finance']
currencies = ['USD','EUR','GBP','AED','SGD','JPY','CHF','AUD','CAD']

for i in range(max(0, 200 - existing_accts)):
    if not cust_ids:
        break
    acct_num = f"ACC{random.randint(1000000000,9999999999)}"
    try:
        cursor.execute("""
            INSERT INTO core_accounts (account_number, customer_id, account_type, currency, balance,
            available_balance, status, opened_date, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, GETDATE(), GETDATE(), GETDATE())
        """, (
            acct_num, random.choice(cust_ids),
            random.choice(acct_types),
            random.choice(currencies),
            round(random.uniform(1000, 10000000), 2),
            round(random.uniform(500, 5000000), 2),
            random.choice(['Active','Active','Active','Dormant','Frozen'])
        ))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM core_accounts")
print(f"Accounts: {cursor.fetchone()[0]}")

# ── Transactions ───────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM core_transactions")
existing_txns = cursor.fetchone()[0]
cursor.execute("SELECT id FROM core_accounts ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 60 ROWS ONLY")
acct_ids = [row[0] for row in cursor.fetchall()]

txn_types = ['Wire Transfer','SWIFT','ACH','SEPA','Cash Deposit','Cash Withdrawal','Trade Payment','Internal Transfer','Cheque']
hi_risk_countries = ['RU','IR','KP','SY','CU','SD','MM','BY']
all_countries = countries + hi_risk_countries

for i in range(max(0, 2000 - existing_txns)):
    if not acct_ids:
        break
    acct_id = random.choice(acct_ids)
    amount = round(random.uniform(500, 2000000), 2)
    currency = random.choice(currencies)
    cparty_country = random.choice(all_countries)
    is_flagged = cparty_country in hi_risk_countries
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    txn_id = f"TXN{random.randint(100000000,999999999)}"
    
    try:
        cursor.execute("""
            INSERT INTO core_transactions (transaction_id, account_id, transaction_type, amount, currency,
            counterparty_name, counterparty_country, counterparty_bank, reference_number,
            sanctions_result, transaction_date, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, DATEADD(day, -%s, GETDATE()), GETDATE())
        """, (
            txn_id, acct_id,
            random.choice(txn_types),
            amount, currency,
            f"{fn} {ln}",
            cparty_country,
            f"{'SBERBANK' if cparty_country=='RU' else 'STANDARD CHARTERED'} {cparty_country}",
            f"REF{random.randint(10000000,99999999)}",
            'Flagged' if is_flagged else random.choice(['Clear','Clear','Clear','Pending']),
            str(random.randint(0, 730))
        ))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM core_transactions")
print(f"Transactions: {cursor.fetchone()[0]}")

# ── Alerts ─────────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM screening_alerts")
existing_alerts = cursor.fetchone()[0]

alert_types = ['SANCTIONS_MATCH','SANCTIONS_MATCH','HIGH_RISK_COUNTRY','PEP_MATCH','ADVERSE_MEDIA','TRANSACTION_PATTERN','VELOCITY_CHECK']
severities = ['Critical','High','High','Medium','Low']

for i in range(max(0, 200 - existing_alerts)):
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    src = random.choice(['OFAC','EU','UN','UK','SECO','DFAT','MAS'])
    score = random.randint(75, 100)
    try:
        cursor.execute("""
            INSERT INTO screening_alerts (alert_type, severity, title, description, status, assigned_to, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, DATEADD(day, -%s, GETDATE()), GETDATE())
        """, (
            random.choice(alert_types),
            random.choice(severities),
            f"Potential {src} match: {fn} {ln}",
            f"Screening detected {fn} {ln} matches {src} list with {score}% confidence. Requires review.",
            random.choice(['Open','Open','In Review','Resolved','False Positive']),
            random.choice(users_list),
            str(random.randint(0, 180))
        ))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM screening_alerts")
print(f"Alerts: {cursor.fetchone()[0]}")

# ── Cases ──────────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM cases")
existing_cases = cursor.fetchone()[0]

case_types = ['SANCTIONS_HIT','SANCTIONS_HIT','PEP_REVIEW','HIGH_RISK','ADVERSE_MEDIA','TRANSACTION_MONITORING','KYC_REVIEW']
case_statuses = ['Open','Open','In Review','Escalated','Closed','Closed','Pending']

for i in range(max(0, 150 - existing_cases)):
    case_num = f"CASE-{2024+random.randint(0,1)}-{random.randint(10000,99999)}"
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    try:
        cursor.execute("""
            INSERT INTO cases (case_number, case_type, subject_name, subject_type, priority, status,
            assigned_analyst, description, opened_at, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, DATEADD(day, -%s, GETDATE()), GETDATE(), GETDATE())
        """, (
            case_num,
            random.choice(case_types),
            f"{fn} {ln}",
            random.choice(['Individual','Corporate','Vessel']),
            random.choice(['Critical','High','Medium','Low']),
            random.choice(case_statuses),
            random.choice(users_list),
            f"Case opened following sanctions screening match. Requires investigation and disposition.",
            str(random.randint(0, 365))
        ))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM cases")
print(f"Cases: {cursor.fetchone()[0]}")

# ── Audit Log ──────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM audit_log")
existing_audit = cursor.fetchone()[0]

actions = ['CREATE','UPDATE','DELETE','VIEW','SCREEN','APPROVE','REJECT','EXPORT','LOGIN','LOGOUT','ESCALATE']
entities = ['Customer','Account','Transaction','Case','Alert','SanctionEntry','ScreeningRequest','Rule','User','Report']

for i in range(max(0, 1000 - existing_audit)):
    action = random.choice(actions)
    entity = random.choice(entities)
    try:
        cursor.execute("""
            INSERT INTO audit_log (event_type, entity_type, entity_id, action, performed_by, ip_address, description, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, DATEADD(minute, -%s, GETDATE()))
        """, (
            action, entity, str(random.randint(1, 500)), action,
            random.choice(users_list),
            f"192.168.{random.randint(1,10)}.{random.randint(1,254)}",
            f"User {action.lower()}d {entity} record #{random.randint(1,500)}",
            str(random.randint(0, 525600))
        ))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM audit_log")
print(f"Audit log: {cursor.fetchone()[0]}")

# ── Watchlist ──────────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM internal_watchlist")
existing_wl = cursor.fetchone()[0]

for i in range(max(0, 100 - existing_wl)):
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    try:
        cursor.execute("""
            INSERT INTO internal_watchlist (watchlist_type, entity_type, entity_name, reason, risk_level,
            source, added_by, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'Active', DATEADD(day, -%s, GETDATE()), GETDATE())
        """, (
            random.choice(['Sanctions','PEP','Adverse Media','Internal','Regulatory']),
            random.choice(['Individual','Corporate','Vessel','Account']),
            f"{fn} {ln}",
            random.choice(['Sanctions match','PEP identified','Adverse media','High risk country','Suspicious activity','Regulatory requirement']),
            random.choice(['High','High','Medium','Critical','Low']),
            random.choice(['OFAC','EU','UN','UK','Internal','Regulatory']),
            random.choice(users_list),
            str(random.randint(0, 730))
        ))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM internal_watchlist")
print(f"Watchlist: {cursor.fetchone()[0]}")

# ── Case Notes ─────────────────────────────────────────────────────────────
cursor.execute("SELECT id FROM cases ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY")
case_ids = [row[0] for row in cursor.fetchall()]

note_texts = [
    "Initial review completed. Subject matches OFAC SDN list entry with 87% confidence.",
    "Customer contacted for additional documentation. Awaiting response.",
    "Enhanced due diligence initiated. Reviewing transaction history.",
    "Escalated to senior compliance officer for review.",
    "False positive confirmed. Name similarity only - different DOB and nationality.",
    "SAR filing initiated. Suspicious activity confirmed.",
    "Case closed - no sanctions match confirmed after full investigation.",
    "Transaction blocked pending further review.",
    "Regulatory disclosure filed with relevant authority.",
    "Additional aliases identified. Expanding search scope.",
    "Reviewed 3 years of transaction history. No suspicious patterns identified.",
    "Customer provided satisfactory explanation for flagged transactions.",
    "Referred to law enforcement. Evidence preserved.",
    "Risk rating upgraded to High following investigation findings.",
    "Account frozen pending regulatory guidance.",
]

cursor.execute("SELECT COUNT(*) FROM case_notes")
existing_notes = cursor.fetchone()[0]

for i in range(max(0, 300 - existing_notes)):
    if not case_ids:
        break
    try:
        cursor.execute("""
            INSERT INTO case_notes (case_id, note_type, note_text, created_by, created_at)
            VALUES (%s, %s, %s, %s, DATEADD(day, -%s, GETDATE()))
        """, (
            random.choice(case_ids),
            random.choice(['Investigation','Decision','Communication','System','Escalation']),
            random.choice(note_texts),
            random.choice(users_list),
            str(random.randint(0, 180))
        ))
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
                'MV TEHRAN EXPRESS','MV PYONGYANG TRADER','MV HAVANA STAR','MV DAMASCUS ROSE']
vessel_types = ['Bulk Carrier','Container Ship','Tanker','General Cargo','RoRo','LNG Carrier','VLCC','Feeder']
flag_states = ['Panama','Liberia','Marshall Islands','Bahamas','Malta','Cyprus','Singapore','Hong Kong','Iran','North Korea','Russia']

for i in range(max(0, 80 - existing_vessels)):
    imo = f"IMO{random.randint(1000000,9999999)}"
    mmsi = f"{random.randint(100000000,999999999)}"
    flag = random.choice(flag_states)
    is_sanctioned = 1 if flag in ['Iran','North Korea'] else (1 if random.random() < 0.1 else 0)
    try:
        cursor.execute("""
            INSERT INTO vessels (vessel_name, imo_number, mmsi_number, vessel_type, flag_state,
            gross_tonnage, year_built, owner_name, operator_name, is_sanctioned, sanctions_reason,
            created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, GETDATE(), GETDATE())
        """, (
            random.choice(vessel_names) + f" {random.randint(1,99)}",
            imo, mmsi,
            random.choice(vessel_types),
            flag,
            random.randint(5000, 300000),
            random.randint(1990, 2023),
            f"{random.choice(last_names)} Shipping Co",
            f"{random.choice(last_names)} Maritime Ops",
            is_sanctioned,
            'Flag state under sanctions' if is_sanctioned else None
        ))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM vessels")
print(f"Vessels: {cursor.fetchone()[0]}")

# ── Trade Finance ──────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM trade_finance_lc")
existing_tf = cursor.fetchone()[0]
cursor.execute("SELECT id FROM core_customers ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 30 ROWS ONLY")
cust_ids_tf = [row[0] for row in cursor.fetchall()]

tf_types = ['Letter of Credit','Standby LC','Bank Guarantee','Documentary Collection','Trade Loan','Supply Chain Finance']
goods_types = ['Electronics','Machinery','Chemicals','Petroleum','Food & Agriculture','Textiles','Steel','Pharmaceuticals']

for i in range(max(0, 100 - existing_tf)):
    if not cust_ids_tf:
        break
    ref = f"LC{random.randint(2024,2026)}{random.randint(100000,999999)}"
    applicant_country = random.choice(countries)
    beneficiary_country = random.choice(countries + ['RU','IR','KP','SY'])
    is_flagged = beneficiary_country in ['RU','IR','KP','SY']
    try:
        cursor.execute("""
            INSERT INTO trade_finance_lc (lc_reference, lc_type, applicant_id, applicant_name, 
            applicant_country, beneficiary_name, beneficiary_country, beneficiary_bank,
            amount, currency, goods_description, screening_status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, GETDATE(), GETDATE())
        """, (
            ref,
            random.choice(tf_types),
            random.choice(cust_ids_tf),
            f"{random.choice(first_names)} {random.choice(last_names)} Trading",
            applicant_country,
            f"{random.choice(first_names)} {random.choice(last_names)} Corp",
            beneficiary_country,
            f"{'SBERBANK' if beneficiary_country=='RU' else 'STANDARD CHARTERED'} {beneficiary_country}",
            round(random.uniform(50000, 50000000), 2),
            random.choice(['USD','EUR','GBP','AED']),
            random.choice(goods_types),
            'Flagged' if is_flagged else random.choice(['Clear','Clear','Pending'])
        ))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM trade_finance_lc")
print(f"Trade Finance: {cursor.fetchone()[0]}")

# ── Scrape Run History ─────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM scrape_run_history")
existing_scrape = cursor.fetchone()[0]

sources_list = ['OFAC','EU','UN','UK','SECO','DFAT','MAS','BIS']
statuses = ['Completed','Completed','Completed','Failed','Partial']

for i in range(max(0, 100 - existing_scrape)):
    src = random.choice(sources_list)
    status = random.choice(statuses)
    records = random.randint(100, 5000) if status != 'Failed' else 0
    try:
        cursor.execute("""
            INSERT INTO scrape_run_history (source_code, run_type, status, records_fetched, records_new,
            records_updated, records_deleted, duration_seconds, started_at, completed_at, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 
            DATEADD(day, -%s, GETDATE()), 
            DATEADD(second, %s, DATEADD(day, -%s, GETDATE())),
            GETDATE())
        """, (
            src,
            random.choice(['Full','Delta','Manual']),
            status, records,
            int(records * 0.1), int(records * 0.05), int(records * 0.02),
            random.randint(30, 290),
            str(random.randint(0, 90)),
            str(random.randint(30, 290)),
            str(random.randint(0, 90))
        ))
    except Exception as e:
        pass

cursor.execute("SELECT COUNT(*) FROM scrape_run_history")
print(f"Scrape history: {cursor.fetchone()[0]}")

cursor.close()
conn.close()
print("\nBulk data insert complete!")
