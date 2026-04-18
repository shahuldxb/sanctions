#!/usr/bin/env python3
"""
Parse OpenSanctions OFAC SDN CSV and insert into Azure SQL sanctions_entries.
Source: https://data.opensanctions.org/datasets/latest/us_ofac_sdn/targets.simple.csv
"""
import csv
import pymssql
import sys
from datetime import datetime

# ── DB credentials ────────────────────────────────────────────────────────────
SERVER   = '203.101.44.46'
DATABASE = 'sanctions'
USER     = 'shahul'
PASSWORD = 'Apple123!@#'

CSV_FILE = '/tmp/ofac_opensanctions.csv'

print("=== OFAC SDN Insert (OpenSanctions source) ===")
print(f"Source file: {CSV_FILE}")
print(f"Target DB: {SERVER}/{DATABASE}")
print()

# ── Parse CSV ─────────────────────────────────────────────────────────────────
print("[1/3] Parsing CSV...")
entries = []
skipped = 0

with open(CSV_FILE, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        schema = row.get('schema', '').strip()
        name   = row.get('name', '').strip()
        
        if not name:
            skipped += 1
            continue
        
        # Entry type
        entry_type = 'Individual'
        if schema in ('Organization', 'Company', 'LegalEntity'):
            entry_type = 'Entity'
        elif schema == 'Vessel':
            entry_type = 'Vessel'
        elif schema == 'Aircraft':
            entry_type = 'Aircraft'
        elif schema == 'Person':
            entry_type = 'Individual'
        
        # DOB
        dob = None
        dob_str = row.get('birth_date', '').strip()
        if dob_str:
            for fmt in ('%Y-%m-%d', '%Y'):
                try:
                    dob = datetime.strptime(dob_str[:10], fmt)
                    break
                except:
                    pass
        
        # Nationality (first country code)
        countries = row.get('countries', '').strip()
        nationality = None
        if countries:
            parts = [c.strip().upper() for c in countries.split(';') if c.strip()]
            if parts:
                nationality = parts[0][:10]
        
        # Programme (from sanctions field)
        sanctions_field = row.get('sanctions', '').strip()
        programme = sanctions_field[:200] if sanctions_field else 'SDN'
        
        # Aliases
        aliases = row.get('aliases', '').strip()
        
        # External ID
        ext_id = row.get('id', '').strip()
        if not ext_id:
            ext_id = f'OFAC-OS-{i+1}'
        else:
            ext_id = f'OFAC-{ext_id}'[:100]
        
        # Last seen / listing date
        listing_date = datetime(2024, 1, 1)
        first_seen = (row.get('first_seen') or '').strip()
        if first_seen:
            try:
                listing_date = datetime.strptime(first_seen[:10], '%Y-%m-%d')
            except:
                pass
        
        entries.append({
            'external_id':   ext_id,
            'entry_type':    entry_type[:50],
            'primary_name':  name[:500],
            'aliases':       aliases[:1000] if aliases else None,
            'dob':           dob,
            'nationality':   nationality,
            'programme':     programme[:200],
            'listing_date':  listing_date,
            'status':        'Active',
            'remarks':       None,
        })

print(f"  Parsed: {len(entries):,} entries  |  Skipped: {skipped}")

# ── Connect to DB ─────────────────────────────────────────────────────────────
print("[2/3] Connecting to database...")
try:
    conn = pymssql.connect(server=SERVER, user=USER, password=PASSWORD, database=DATABASE, timeout=60)
    cur  = conn.cursor()
    print("  Connected!")
except Exception as e:
    print(f"  ERROR: {e}")
    sys.exit(1)

# Get OFAC source_id
cur.execute("SELECT id FROM sanctions_list_sources WHERE source_code = 'OFAC'")
row = cur.fetchone()
if not row:
    print("  ERROR: OFAC source not found")
    sys.exit(1)
source_id = row[0]
print(f"  OFAC source_id = {source_id}")

# ── Insert ────────────────────────────────────────────────────────────────────
print(f"[3/3] Inserting {len(entries):,} entries...")

# Clear existing OFAC entries
cur.execute("DELETE FROM sanctions_entries WHERE source_id = %d" % source_id)
deleted = cur.rowcount
conn.commit()
print(f"  Cleared {deleted:,} old OFAC entries")

BATCH = 200
total_ok = 0
total_err = 0

for i in range(0, len(entries), BATCH):
    batch = entries[i:i+BATCH]
    for e in batch:
        try:
            cur.execute("""
                INSERT INTO sanctions_entries
                  (source_id, external_id, entry_type, primary_name,
                   dob, nationality, programme, listing_date, status, remarks)
                VALUES (%d, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                source_id,
                e['external_id'],
                e['entry_type'],
                e['primary_name'],
                e['dob'],
                e['nationality'],
                e['programme'],
                e['listing_date'],
                e['status'],
                e['remarks'],
            ))
            total_ok += 1
        except Exception as ex:
            total_err += 1
            if total_err <= 3:
                print(f"    Row error: {str(ex)[:100]}")
    
    conn.commit()
    pct = min((i + BATCH), len(entries)) / len(entries) * 100
    print(f"  {total_ok:,}/{len(entries):,} ({pct:.0f}%) inserted | {total_err} errors")

# Update source stats
cur.execute("""
    UPDATE sanctions_list_sources
    SET total_entries = %d,
        last_scraped = GETDATE(),
        last_scrape_status = 'SUCCESS'
    WHERE id = %d
""" % (total_ok, source_id))
conn.commit()
conn.close()

print()
print("=== COMPLETE ===")
print(f"  Inserted: {total_ok:,}")
print(f"  Errors:   {total_err}")
print(f"  OFAC SDN list now has {total_ok:,} real entries!")
