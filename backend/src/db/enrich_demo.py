#!/usr/bin/env python3
"""Enrich demo data with correct table and column names."""
import pymssql
import random
from datetime import datetime, timedelta

conn = pymssql.connect(
    server='203.101.44.46',
    user='shahul',
    password='Apple123!@#',
    database='sanctions',
    timeout=60,
    autocommit=True
)
cursor = conn.cursor()
print("Enriching demo data...")

first_names = ['Ahmad', 'Mohammed', 'Ali', 'Hassan', 'Ibrahim', 'Khalid', 'Omar', 'Yusuf',
               'James', 'John', 'Robert', 'Michael', 'David', 'William', 'Richard', 'Charles',
               'Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao',
               'Sergei', 'Ivan', 'Nikolai', 'Dmitri', 'Vladimir', 'Alexei',
               'Carlos', 'Juan', 'Miguel', 'Jose', 'Luis', 'Pedro', 'Antonio',
               'Fatima', 'Aisha', 'Maryam', 'Sarah', 'Emma', 'Olivia', 'Sophia']
last_names = ['Al-Rashid', 'Al-Farsi', 'Al-Mansouri', 'Al-Hashimi', 'Al-Qasimi',
              'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis',
              'Wei', 'Fang', 'Guo', 'Sun', 'Ma', 'Hu', 'Luo', 'Lin',
              'Petrov', 'Ivanov', 'Sidorov', 'Kozlov', 'Novikov', 'Morozov',
              'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
              'Khalil', 'Hassan', 'Ahmed', 'Hussain', 'Rahman']
countries = ['AE', 'SA', 'US', 'GB', 'DE', 'FR', 'CN', 'RU', 'IN', 'BR', 'SG', 'HK', 'JP', 'KR', 'AU']
risk_levels = ['LOW', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'CRITICAL']
users_list = ['analyst1', 'analyst2', 'compliance1', 'officer1', 'manager1']

# ── Add more customers ──────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM core_customers")
existing = cursor.fetchone()[0]
to_add = max(0, 100 - existing)
print(f"Adding {to_add} customers (currently {existing})...")

for i in range(to_add):
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    ctype = random.choice(['Individual', 'Individual', 'Corporate', 'Corporate', 'Trust'])
    country = random.choice(countries)
    risk = random.choice(risk_levels)
    dob = f"{random.randint(1950,2000)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"
    cust_id = f"CUST{10000+existing+i:05d}"
    
    if ctype == 'Individual':
        name = f"{fn} {ln}"
        email = f"{fn.lower()}.{ln.lower().replace('-','').replace(' ','')}{random.randint(1,999)}@email.com"
    else:
        corp_names = ['Global Trading LLC', 'International Holdings', 'Capital Group', 'Resources Corp', 'Tech Solutions', 'Maritime Services']
        name = f"{ln} {random.choice(corp_names)}"
        email = f"info@{ln.lower().replace('-','').replace(' ','')}{random.randint(1,99)}.com"
    
    try:
        cursor.execute("""
            INSERT INTO core_customers (customer_id, customer_type, first_name, last_name, full_name, 
            date_of_birth, nationality, country_of_residence, email, risk_rating, sanctions_status, 
            kyc_status, pep_status, status, onboarding_date, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Active', GETDATE(), GETDATE(), GETDATE())
        """, (
            cust_id, ctype, fn if ctype == 'Individual' else '', ln if ctype == 'Individual' else '',
            name, dob if ctype == 'Individual' else None, country, country, email,
            risk,
            random.choice(['Clear', 'Clear', 'Clear', 'Pending', 'Review', 'Blocked']),
            random.choice(['Approved', 'Approved', 'Pending', 'Expired']),
            'Yes' if random.random() < 0.05 else 'No'
        ))
    except Exception as e:
        pass

conn.commit()
cursor.execute("SELECT COUNT(*) FROM core_customers")
print(f"Customers now: {cursor.fetchone()[0]}")

# ── Add more sanctions entries ──────────────────────────────────────────────
cursor.execute("SELECT id, source_code FROM sanctions_list_sources")
sources = {row[1]: row[0] for row in cursor.fetchall()}

new_entries = [
    ('TEHRAN ENERGY CORP', 'ENTITY', 'OFAC', 'Iran', 'SDN'),
    ('PYONGYANG TRADING CO', 'ENTITY', 'OFAC', 'North Korea', 'DPRK'),
    ('HAVANA IMPORT EXPORT', 'ENTITY', 'OFAC', 'Cuba', 'CUBA'),
    ('MINSK INDUSTRIAL GROUP', 'ENTITY', 'OFAC', 'Belarus', 'BELARUS'),
    ('MOSCOW ENERGY HOLDINGS', 'ENTITY', 'OFAC', 'Russia', 'RUSSIA'),
    ('DAMASCUS TRADE FINANCE', 'ENTITY', 'OFAC', 'Syria', 'SYRIA'),
    ('CARACAS PETROLEUM SA', 'ENTITY', 'OFAC', 'Venezuela', 'VENEZUELA'),
    ('KABUL HAWALA NETWORK', 'ENTITY', 'OFAC', 'Afghanistan', 'TALIBAN'),
    ('Kim Jong-un', 'INDIVIDUAL', 'OFAC', 'North Korea', 'DPRK'),
    ('Ali Khamenei', 'INDIVIDUAL', 'OFAC', 'Iran', 'IRAN'),
    ('Alexander Lukashenko', 'INDIVIDUAL', 'OFAC', 'Belarus', 'BELARUS'),
    ('Bashar Al-Assad', 'INDIVIDUAL', 'OFAC', 'Syria', 'SYRIA'),
    ('Nicolas Maduro', 'INDIVIDUAL', 'OFAC', 'Venezuela', 'VENEZUELA'),
    ('ROSOBORONEXPORT', 'ENTITY', 'EU', 'Russia', 'RUSSIA'),
    ('GAZPROMBANK', 'ENTITY', 'EU', 'Russia', 'RUSSIA'),
    ('SBERBANK', 'ENTITY', 'EU', 'Russia', 'RUSSIA'),
    ('VTB BANK', 'ENTITY', 'EU', 'Russia', 'RUSSIA'),
    ('Igor Sechin', 'INDIVIDUAL', 'EU', 'Russia', 'RUSSIA'),
    ('Sergei Lavrov', 'INDIVIDUAL', 'EU', 'Russia', 'RUSSIA'),
    ('IRAN AIR', 'ENTITY', 'EU', 'Iran', 'IRAN'),
    ('MAHAN AIR', 'ENTITY', 'EU', 'Iran', 'IRAN'),
    ('ISLAMIC REVOLUTIONARY GUARD CORPS', 'ENTITY', 'EU', 'Iran', 'IRAN'),
    ('HAMAS POLITICAL BUREAU', 'ENTITY', 'EU', 'Palestine', 'HAMAS'),
    ('HEZBOLLAH MILITARY WING', 'ENTITY', 'EU', 'Lebanon', 'HEZBOLLAH'),
    ('ISLAMIC STATE OF IRAQ AND LEVANT', 'ENTITY', 'UN', 'Iraq', 'ISIL'),
    ('AL-NUSRA FRONT', 'ENTITY', 'UN', 'Syria', 'ALQAEDA'),
    ('BOKO HARAM', 'ENTITY', 'UN', 'Nigeria', 'ALQAEDA'),
    ('AL-SHABAAB', 'ENTITY', 'UN', 'Somalia', 'ALQAEDA'),
    ('Abu Bakr Al-Baghdadi Estate', 'INDIVIDUAL', 'UN', 'Iraq', 'ISIL'),
    ('Ayman Al-Zawahiri', 'INDIVIDUAL', 'UN', 'Egypt', 'ALQAEDA'),
    ('Sirajuddin Haqqani', 'INDIVIDUAL', 'UN', 'Afghanistan', 'TALIBAN'),
    ('Mullah Omar Estate', 'INDIVIDUAL', 'UN', 'Afghanistan', 'TALIBAN'),
    ('NORTH KOREA WEAPONS FUND', 'ENTITY', 'UN', 'North Korea', 'DPRK'),
    ('IRAN NUCLEAR PROCUREMENT', 'ENTITY', 'UN', 'Iran', 'IRAN'),
    ('MYANMAR MILITARY JUNTA', 'ENTITY', 'UK', 'Myanmar', 'MYANMAR'),
    ('WAGNER GROUP', 'ENTITY', 'UK', 'Russia', 'RUSSIA'),
    ('Yevgeny Prigozhin Estate', 'INDIVIDUAL', 'UK', 'Russia', 'RUSSIA'),
    ('ZIMBABWE MINING CORP', 'ENTITY', 'UK', 'Zimbabwe', 'ZIMBABWE'),
    ('NORTH KOREA ARMS BUREAU', 'ENTITY', 'SECO', 'North Korea', 'DPRK'),
    ('IRAN CENTRIFUGE TECH', 'ENTITY', 'SECO', 'Iran', 'IRAN'),
]

for name, etype, source_code, country, prog in new_entries:
    src_id = sources.get(source_code, list(sources.values())[0])
    ext_id = f"{source_code}-{random.randint(10000,99999)}"
    try:
        cursor.execute("""
            INSERT INTO sanctions_entries (source_id, external_id, primary_name, entry_type, status,
            country_of_origin, programme, listing_date, created_at)
            VALUES (%s, %s, %s, %s, 'ACTIVE', %s, %s, GETDATE(), GETDATE())
        """, (src_id, ext_id, name, etype, country, prog))
    except Exception:
        pass

conn.commit()
cursor.execute("SELECT COUNT(*) FROM sanctions_entries")
print(f"Sanctions entries now: {cursor.fetchone()[0]}")

# ── Add more alerts ─────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM screening_alerts")
existing_alerts = cursor.fetchone()[0]
print(f"Current alerts: {existing_alerts}")

alert_types = ['SANCTIONS_MATCH', 'SANCTIONS_MATCH', 'HIGH_RISK_COUNTRY', 'PEP_MATCH', 'ADVERSE_MEDIA', 'TRANSACTION_PATTERN']
severities = ['CRITICAL', 'HIGH', 'HIGH', 'MEDIUM', 'LOW']

for i in range(max(0, 150 - existing_alerts)):
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    try:
        cursor.execute("""
            INSERT INTO screening_alerts (alert_type, severity, title, description, status, assigned_to, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, DATEADD(day, -%s, GETDATE()), GETDATE())
        """, (
            random.choice(alert_types),
            random.choice(severities),
            f"Potential match: {fn} {ln}",
            f"Sanctions screening detected a potential match for {fn} {ln} against {random.choice(['OFAC SDN', 'EU Consolidated', 'UN Security Council', 'UK OFSI'])} list with {random.randint(75,100)}% confidence.",
            random.choice(['Open', 'Open', 'In Review', 'Resolved', 'False Positive']),
            random.choice(users_list),
            str(random.randint(0, 90))
        ))
    except Exception as e:
        pass

conn.commit()
cursor.execute("SELECT COUNT(*) FROM screening_alerts")
print(f"Alerts now: {cursor.fetchone()[0]}")

# ── Add more cases ──────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM cases")
existing_cases = cursor.fetchone()[0]
print(f"Current cases: {existing_cases}")

case_types = ['SANCTIONS_HIT', 'SANCTIONS_HIT', 'PEP_REVIEW', 'HIGH_RISK', 'ADVERSE_MEDIA', 'TRANSACTION_MONITORING']
case_statuses = ['Open', 'Open', 'In Review', 'Escalated', 'Closed', 'Closed']

for i in range(max(0, 100 - existing_cases)):
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
            random.choice(['Individual', 'Corporate']),
            random.choice(['Critical', 'High', 'Medium', 'Low']),
            random.choice(case_statuses),
            random.choice(users_list),
            f"Case opened following sanctions screening match. Requires investigation and disposition.",
            str(random.randint(0, 180))
        ))
    except Exception as e:
        pass

conn.commit()
cursor.execute("SELECT COUNT(*) FROM cases")
print(f"Cases now: {cursor.fetchone()[0]}")

# ── Add more transactions ───────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM core_transactions")
existing_txns = cursor.fetchone()[0]
print(f"Current transactions: {existing_txns}")

cursor.execute("SELECT id FROM core_accounts ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 30 ROWS ONLY")
account_ids = [row[0] for row in cursor.fetchall()]

txn_types = ['Wire Transfer', 'SWIFT', 'ACH', 'SEPA', 'Cash Deposit', 'Trade Payment', 'Internal Transfer']
currencies = ['USD', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'CHF']
counterparty_countries = ['US', 'GB', 'DE', 'AE', 'SG', 'HK', 'CN', 'RU', 'IR', 'KP', 'SY', 'CU']

for i in range(max(0, 1000 - existing_txns)):
    if not account_ids:
        break
    acct_id = random.choice(account_ids)
    amount = round(random.uniform(1000, 5000000), 2)
    currency = random.choice(currencies)
    cparty_country = random.choice(counterparty_countries)
    is_high_risk = cparty_country in ['RU', 'IR', 'KP', 'SY', 'CU']
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    txn_id = f"TXN{random.randint(10000000,99999999)}"
    
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
            f"{'SBERBANK' if cparty_country == 'RU' else 'STANDARD CHARTERED'} {cparty_country}",
            f"REF{random.randint(10000000,99999999)}",
            'Flagged' if is_high_risk else random.choice(['Clear', 'Clear', 'Clear', 'Pending']),
            str(random.randint(0, 365))
        ))
    except Exception as e:
        pass

conn.commit()
cursor.execute("SELECT COUNT(*) FROM core_transactions")
print(f"Transactions now: {cursor.fetchone()[0]}")

# ── Add audit log entries ───────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM audit_log")
existing_audit = cursor.fetchone()[0]
print(f"Current audit entries: {existing_audit}")

actions = ['CREATE', 'UPDATE', 'DELETE', 'VIEW', 'SCREEN', 'APPROVE', 'REJECT', 'EXPORT', 'LOGIN', 'LOGOUT']
entities = ['Customer', 'Account', 'Transaction', 'Case', 'Alert', 'SanctionEntry', 'ScreeningRequest', 'Rule', 'User']

for i in range(max(0, 500 - existing_audit)):
    try:
        cursor.execute("""
            INSERT INTO audit_log (event_type, entity_type, entity_id, action, performed_by, ip_address, description, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, DATEADD(minute, -%s, GETDATE()))
        """, (
            random.choice(actions),
            random.choice(entities),
            str(random.randint(1, 500)),
            random.choice(actions),
            random.choice(users_list),
            f"192.168.{random.randint(1,10)}.{random.randint(1,254)}",
            f"User performed operation on {random.choice(entities)}",
            str(random.randint(0, 43200))
        ))
    except Exception as e:
        pass

conn.commit()
cursor.execute("SELECT COUNT(*) FROM audit_log")
print(f"Audit log now: {cursor.fetchone()[0]}")

# ── Add watchlist entries ───────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM internal_watchlist")
existing_wl = cursor.fetchone()[0]
print(f"Current watchlist: {existing_wl}")

for i in range(max(0, 50 - existing_wl)):
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    try:
        cursor.execute("""
            INSERT INTO internal_watchlist (watchlist_type, entity_type, entity_name, reason, risk_level, 
            source, added_by, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'Active', DATEADD(day, -%s, GETDATE()), GETDATE())
        """, (
            random.choice(['Sanctions', 'PEP', 'Adverse Media', 'Internal']),
            random.choice(['Individual', 'Corporate', 'Vessel']),
            f"{fn} {ln}",
            random.choice(['Sanctions match', 'PEP', 'Adverse media', 'High risk country', 'Suspicious activity']),
            random.choice(['High', 'High', 'Medium', 'Critical']),
            random.choice(['OFAC', 'EU', 'UN', 'Internal']),
            random.choice(users_list),
            str(random.randint(0, 365))
        ))
    except Exception as e:
        pass

conn.commit()
cursor.execute("SELECT COUNT(*) FROM internal_watchlist")
print(f"Watchlist now: {cursor.fetchone()[0]}")

# ── Add case notes ──────────────────────────────────────────────────────────
cursor.execute("SELECT COUNT(*) FROM case_notes")
existing_notes = cursor.fetchone()[0]
cursor.execute("SELECT id FROM cases ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT 30 ROWS ONLY")
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
]

for i in range(max(0, 200 - existing_notes)):
    if not case_ids:
        break
    try:
        cursor.execute("""
            INSERT INTO case_notes (case_id, note_type, note_text, created_by, created_at)
            VALUES (%s, %s, %s, %s, DATEADD(day, -%s, GETDATE()))
        """, (
            random.choice(case_ids),
            random.choice(['Investigation', 'Decision', 'Communication', 'System']),
            random.choice(note_texts),
            random.choice(users_list),
            str(random.randint(0, 90))
        ))
    except Exception as e:
        pass

conn.commit()
cursor.execute("SELECT COUNT(*) FROM case_notes")
print(f"Case notes now: {cursor.fetchone()[0]}")

cursor.close()
conn.close()
print("\nDemo data enrichment complete!")
