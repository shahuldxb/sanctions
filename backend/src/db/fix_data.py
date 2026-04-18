#!/usr/bin/env python3
"""Fix and add additional demo data"""
import pymssql

DB_CONFIG = {
    'server': '203.101.44.46',
    'user': 'shahul',
    'password': 'Apple123!@#',
    'database': 'sanctions',
    'timeout': 30
}

conn = pymssql.connect(**DB_CONFIG)
cursor = conn.cursor()

# Fix liabilities - use correct account IDs
liabilities = [
    ('LIAB-001', 1, 2, 'SAVINGS', 'Premium Savings Account', 350000.00, 350000.00, 'GBP', 2.50, '2020-01-15', None, 'ACTIVE'),
    ('LIAB-002', 2, 4, 'SAVINGS', 'High Yield Savings', 450000.00, 450000.00, 'AED', 2.00, '2021-03-20', None, 'ACTIVE'),
    ('LIAB-003', 3, 6, 'FIXED_DEPOSIT', 'Corporate Fixed Deposit 12M', 1800000.00, 1800000.00, 'AED', 3.75, '2024-01-01', '2025-01-01', 'ACTIVE'),
    ('LIAB-004', 5, 8, 'FIXED_DEPOSIT', 'Corporate Fixed Deposit 6M', 2000000.00, 2000000.00, 'USD', 4.00, '2024-04-01', '2024-10-01', 'ACTIVE'),
    ('LIAB-005', 7, 11, 'FIXED_DEPOSIT', 'Commodities Reserve Deposit', 5000000.00, 5000000.00, 'USD', 4.25, '2024-01-15', '2025-01-15', 'ACTIVE'),
    ('LIAB-006', 8, 12, 'SAVINGS', 'HKD Savings Account', 2800000.00, 2800000.00, 'HKD', 1.50, '2021-09-15', None, 'ACTIVE'),
    ('LIAB-007', 11, 15, 'FIXED_DEPOSIT', 'Export Proceeds Deposit', 8000000.00, 8000000.00, 'USD', 4.50, '2024-02-01', '2025-02-01', 'ACTIVE'),
    ('LIAB-008', 12, 16, 'SAVINGS', 'EUR Savings Account', 65000.00, 65000.00, 'EUR', 1.75, '2022-03-15', None, 'ACTIVE'),
]

# Check which account IDs exist
cursor.execute("SELECT id, account_number, customer_id FROM core_accounts ORDER BY id")
accounts = cursor.fetchall()
print("Existing accounts:")
for a in accounts:
    print(f"  ID={a[0]}, Number={a[1]}, Customer={a[2]}")

# Insert liabilities with correct account IDs
for liab in liabilities:
    lid, cust_id, acc_id, ltype, lname, princ, bal, curr, rate, orig, mat, stat = liab
    
    # Check if account exists
    cursor.execute("SELECT id FROM core_accounts WHERE id = %s", (acc_id,))
    if cursor.fetchone():
        try:
            if mat:
                cursor.execute("""
                    INSERT INTO core_liabilities (liability_id, customer_id, account_id, liability_type, liability_name, 
                    principal_amount, outstanding_balance, currency, interest_rate, origination_date, maturity_date, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (lid, cust_id, acc_id, ltype, lname, princ, bal, curr, rate, orig, mat, stat))
            else:
                cursor.execute("""
                    INSERT INTO core_liabilities (liability_id, customer_id, account_id, liability_type, liability_name, 
                    principal_amount, outstanding_balance, currency, interest_rate, origination_date, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (lid, cust_id, acc_id, ltype, lname, princ, bal, curr, rate, orig, stat))
            conn.commit()
            print(f"  Inserted liability: {lid}")
        except Exception as e:
            print(f"  Error inserting {lid}: {e}")
    else:
        print(f"  Account {acc_id} not found for liability {lid}")

# Add more sanctions entries for comprehensive demo
more_entries = [
    (1, '25001', 'INDIVIDUAL', 'KHAMENEI, Ali', '1939-07-17', 'IR', 'IRAN', '2019-06-24', 'ACTIVE'),
    (1, '25002', 'ENTITY', 'ISLAMIC REVOLUTIONARY GUARD CORPS', None, 'IR', 'IRAN', '2007-10-25', 'ACTIVE'),
    (1, '25003', 'INDIVIDUAL', 'SHOIGU, Sergei Kuzhugetovich', '1965-05-21', 'RU', 'RUSSIA', '2022-03-11', 'ACTIVE'),
    (1, '25004', 'ENTITY', 'ROSNEFT', None, 'RU', 'RUSSIA-SSI', '2014-09-12', 'ACTIVE'),
    (1, '25005', 'VESSEL', 'IRAN SHAHID RAJAEE', None, None, 'IRAN', '2012-01-23', 'ACTIVE'),
    (2, 'EU.9012.33', 'INDIVIDUAL', 'SECHIN, Igor Ivanovich', '1960-09-07', 'RU', 'RUSSIA', '2022-03-28', 'ACTIVE'),
    (2, 'EU.9013.44', 'ENTITY', 'BANK ROSSIYA', None, 'RU', 'RUSSIA', '2022-03-28', 'ACTIVE'),
    (3, 'QDi.150', 'INDIVIDUAL', 'AL-ZAWAHIRI, Ayman', '1951-06-19', 'EG', 'ISIL_ALQAIDA', '2001-10-17', 'ACTIVE'),
    (4, 'RUS0089', 'INDIVIDUAL', 'MILLER, Alexei Borisovich', '1962-01-31', 'RU', 'RUSSIA', '2022-04-08', 'ACTIVE'),
]

for entry in more_entries:
    src_id, ext_id, etype, pname, dob, nat, prog, ldate, stat = entry
    try:
        if dob:
            cursor.execute("""
                INSERT INTO sanctions_entries (source_id, external_id, entry_type, primary_name, dob, nationality, programme, listing_date, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (src_id, ext_id, etype, pname, dob, nat, prog, ldate, stat))
        else:
            cursor.execute("""
                INSERT INTO sanctions_entries (source_id, external_id, entry_type, primary_name, nationality, programme, listing_date, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (src_id, ext_id, etype, pname, nat, prog, ldate, stat))
        conn.commit()
        print(f"  Added entry: {pname}")
    except Exception as e:
        print(f"  Error adding {pname}: {e}")

# Add more scrape run history
cursor.execute("""
    INSERT INTO scrape_run_history (run_id, source_id, started_at, completed_at, status, records_downloaded, records_added, records_updated, records_deleted)
    VALUES 
    ('RUN-2024-001', 1, '2024-04-17 00:00:00', '2024-04-17 00:02:30', 'SUCCESS', 12543, 3, 2, 0),
    ('RUN-2024-002', 2, '2024-04-17 00:00:00', '2024-04-17 00:03:15', 'SUCCESS', 8921, 1, 0, 0),
    ('RUN-2024-003', 3, '2024-04-17 00:00:00', '2024-04-17 00:01:45', 'SUCCESS', 3421, 0, 1, 0),
    ('RUN-2024-004', 4, '2024-04-17 00:00:00', '2024-04-17 00:02:00', 'SUCCESS', 5678, 2, 1, 0),
    ('RUN-2024-005', 1, '2024-04-17 03:00:00', '2024-04-17 03:02:45', 'SUCCESS', 12546, 0, 0, 0),
    ('RUN-2024-006', 1, '2024-04-17 06:00:00', '2024-04-17 06:02:30', 'SUCCESS', 12546, 0, 0, 0),
    ('RUN-2024-007', 5, '2024-04-17 00:00:00', '2024-04-17 00:04:00', 'SUCCESS', 2341, 0, 0, 0),
    ('RUN-2024-008', 6, '2024-04-17 00:00:00', '2024-04-17 00:03:30', 'SUCCESS', 1892, 0, 0, 0)
""")
conn.commit()
print("  Added scrape run history")

# Add change log entries
cursor.execute("""
    INSERT INTO sanctions_change_log (source_id, entry_id, external_id, change_type, changed_fields, scrape_run_id)
    VALUES 
    (1, 5, '22543', 'ADD', '{"primary_name":"PUTIN, Vladimir Vladimirovich","programme":"RUSSIA"}', 'RUN-2024-001'),
    (1, 6, '23891', 'ADD', '{"primary_name":"SBERBANK OF RUSSIA","entry_type":"ENTITY"}', 'RUN-2024-001'),
    (2, 11, 'EU.5765.26', 'UPDATE', '{"remarks":"Updated address information"}', 'RUN-2024-002'),
    (4, 18, 'AFG0001', 'ADD', '{"primary_name":"OMAR, Mohammed","programme":"TALIBAN"}', 'RUN-2024-004'),
    (4, 19, 'RUS0045', 'ADD', '{"primary_name":"ABRAMOVICH, Roman Arkadyevich","programme":"RUSSIA"}', 'RUN-2024-004')
""")
conn.commit()
print("  Added change log entries")

# Add reports
cursor.execute("""
    INSERT INTO reports (report_id, report_type, report_name, generated_by, status, row_count, generated_at)
    VALUES 
    ('RPT-2024-001', 'SCREENING_SUMMARY', 'Monthly Screening Summary - March 2024', 'ahmed.alrashid', 'COMPLETED', 156, '2024-04-01 08:00:00'),
    ('RPT-2024-002', 'CASE_STATUS', 'Open Cases Report - April 2024', 'sarah.mitchell', 'COMPLETED', 4, '2024-04-10 09:00:00'),
    ('RPT-2024-003', 'SANCTIONS_LIST_UPDATE', 'Sanctions List Update Log - Q1 2024', 'admin', 'COMPLETED', 89, '2024-04-01 07:00:00'),
    ('RPT-2024-004', 'FALSE_POSITIVE', 'False Positive Analysis Report', 'fatima.alzahra', 'COMPLETED', 23, '2024-04-05 10:00:00'),
    ('RPT-2024-005', 'REGULATORY_DISCLOSURE', 'Regulatory Disclosure Report - Q1 2024', 'mohammed.compliance', 'PENDING', NULL, NULL)
""")
conn.commit()
print("  Added reports")

conn.close()
print("\nData fix complete!")
