#!/usr/bin/env python3
"""
Real OFAC SDN Scraper
Downloads the official OFAC SDN XML from US Treasury and inserts all entries
into the Azure SQL sanctions_entries table.
"""
import urllib.request
import xml.etree.ElementTree as ET
import pymssql
import sys
import os
from datetime import datetime

# ── DB credentials ────────────────────────────────────────────────────────────
SERVER   = '203.101.44.46'
DATABASE = 'sanctions'
USER     = 'shahul'
PASSWORD = 'Apple123!@#'

# Read from .env if available
env_path = os.path.join(os.path.dirname(__file__), '../../.env')
try:
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k == 'MSSQL_SERVER':   SERVER   = v
                elif k == 'MSSQL_DATABASE': DATABASE = v
                elif k == 'MSSQL_USER':   USER     = v
                elif k == 'MSSQL_PASSWORD': PASSWORD = v
except Exception as e:
    print(f"[warn] Could not read .env: {e}")

OFAC_SDN_URL = 'https://www.treasury.gov/ofac/downloads/sdn.xml'
OFAC_ALT_URL = 'https://www.treasury.gov/ofac/downloads/sdnlist.txt'

print(f"=== Real OFAC SDN Scraper ===")
print(f"Target DB: {SERVER}/{DATABASE}")
print(f"Downloading from: {OFAC_SDN_URL}")
print()

# ── Download SDN XML ──────────────────────────────────────────────────────────
print("[1/4] Downloading OFAC SDN XML...")
try:
    req = urllib.request.Request(
        OFAC_SDN_URL,
        headers={'User-Agent': 'Mozilla/5.0 (Sanctions Compliance System)'}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        xml_data = resp.read()
    print(f"  Downloaded {len(xml_data):,} bytes")
except Exception as e:
    print(f"  ERROR downloading: {e}")
    sys.exit(1)

# ── Parse XML ─────────────────────────────────────────────────────────────────
print("[2/4] Parsing XML...")
try:
    root = ET.fromstring(xml_data)
    # Handle namespace
    ns = ''
    if root.tag.startswith('{'):
        ns = root.tag.split('}')[0] + '}'
    
    entries = []
    
    def txt(el, tag):
        """Get text from child element, handling namespace."""
        child = el.find(f'{ns}{tag}')
        return child.text.strip() if child is not None and child.text else None
    
    def get_aliases(el):
        """Collect all name aliases."""
        aliases = []
        for aka in el.findall(f'.//{ns}aka'):
            fn = txt(aka, 'firstName') or ''
            ln = txt(aka, 'lastName') or ''
            name = f"{fn} {ln}".strip()
            if name:
                aliases.append(name)
        return '; '.join(aliases[:5]) if aliases else None  # limit to 5
    
    for sdn in root.findall(f'.//{ns}sdnEntry'):
        uid        = txt(sdn, 'uid')
        last_name  = txt(sdn, 'lastName') or ''
        first_name = txt(sdn, 'firstName') or ''
        sdn_type   = txt(sdn, 'sdnType') or 'Individual'
        title      = txt(sdn, 'title')
        remarks    = txt(sdn, 'remarks')
        
        # Build primary name
        if first_name:
            primary_name = f"{first_name} {last_name}".strip()
        else:
            primary_name = last_name
        
        if not primary_name:
            continue
        
        # Entry type mapping
        entry_type = 'Individual'
        if sdn_type in ('Entity', 'Organization', 'Aircraft', 'Vessel'):
            entry_type = sdn_type
        elif sdn_type == 'Individual':
            entry_type = 'Individual'
        
        # Programme (from programList)
        programmes = []
        for prog in sdn.findall(f'.//{ns}program'):
            if prog.text:
                programmes.append(prog.text.strip())
        programme = ', '.join(programmes[:3]) if programmes else 'SDN'
        
        # Nationality / citizenship
        nationality = None
        for citizenship in sdn.findall(f'.//{ns}citizenship'):
            uid_c = txt(citizenship, 'uid')
            country = txt(citizenship, 'country')
            if country:
                nationality = country[:2].upper() if len(country) >= 2 else country
                break
        if not nationality:
            for nationality_el in sdn.findall(f'.//{ns}nationality'):
                country = txt(nationality_el, 'country')
                if country:
                    nationality = country[:2].upper() if len(country) >= 2 else country
                    break
        
        # DOB
        dob = None
        for dob_el in sdn.findall(f'.//{ns}dateOfBirth'):
            dob_text = txt(dob_el, 'dateOfBirth') or (dob_el.text or '').strip()
            if dob_text and len(dob_text) >= 4:
                # Try to parse various date formats
                for fmt in ('%d %b %Y', '%Y', '%b %Y', '%Y-%m-%d'):
                    try:
                        dob = datetime.strptime(dob_text[:len(fmt.replace('%d','01').replace('%b','Jan').replace('%Y','2000').replace('%m','01'))], fmt)
                        break
                    except:
                        pass
                if dob is None and len(dob_text) == 4:
                    try:
                        dob = datetime(int(dob_text), 1, 1)
                    except:
                        pass
                break
        
        # Passport
        passport = None
        for id_el in sdn.findall(f'.//{ns}id'):
            id_type = txt(id_el, 'idType') or ''
            if 'Passport' in id_type:
                passport = txt(id_el, 'idNumber')
                break
        
        # Listing date - use publication date from header or default
        listing_date = datetime(2024, 1, 1)  # default
        
        external_id = f'OFAC-SDN-{uid}' if uid else f'OFAC-SDN-{len(entries)+1}'
        
        entries.append({
            'external_id': external_id,
            'entry_type': entry_type[:50],
            'primary_name': primary_name[:500],
            'dob': dob,
            'nationality': (nationality or '')[:10],
            'passport': (passport or '')[:100],
            'programme': programme[:200],
            'listing_date': listing_date,
            'status': 'Active',
            'remarks': (remarks or '')[:1000],
        })
    
    print(f"  Parsed {len(entries):,} SDN entries")

except Exception as e:
    print(f"  ERROR parsing XML: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)

# ── Connect to DB ─────────────────────────────────────────────────────────────
print("[3/4] Connecting to database...")
try:
    conn = pymssql.connect(server=SERVER, user=USER, password=PASSWORD, database=DATABASE, timeout=30)
    cur = conn.cursor()
    print("  Connected!")
except Exception as e:
    print(f"  ERROR connecting: {e}")
    sys.exit(1)

# Get OFAC source_id
cur.execute("SELECT id FROM sanctions_list_sources WHERE source_code = 'OFAC'")
row = cur.fetchone()
if not row:
    print("  ERROR: OFAC source not found in sanctions_list_sources")
    sys.exit(1)
source_id = row[0]
print(f"  OFAC source_id = {source_id}")

# ── Insert entries ────────────────────────────────────────────────────────────
print(f"[4/4] Inserting {len(entries):,} entries into sanctions_entries...")

# First, delete existing OFAC entries to avoid duplicates
print("  Clearing existing OFAC entries...")
cur.execute("DELETE FROM sanctions_entries WHERE source_id = %d" % source_id)
deleted = cur.rowcount
conn.commit()
print(f"  Deleted {deleted:,} old OFAC entries")

# Insert in batches of 500
BATCH_SIZE = 500
total_inserted = 0
errors = 0

for i in range(0, len(entries), BATCH_SIZE):
    batch = entries[i:i+BATCH_SIZE]
    inserted_batch = 0
    for entry in batch:
        try:
            cur.execute("""
                INSERT INTO sanctions_entries 
                (source_id, external_id, entry_type, primary_name, dob, nationality, 
                 passport_number, programme, listing_date, status, remarks)
                VALUES (%d, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                source_id,
                entry['external_id'],
                entry['entry_type'],
                entry['primary_name'],
                entry['dob'],
                entry['nationality'] or None,
                entry['passport'] or None,
                entry['programme'],
                entry['listing_date'],
                entry['status'],
                entry['remarks'] or None,
            ))
            inserted_batch += 1
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"    Row error: {e} | name={entry['primary_name'][:40]}")
    
    conn.commit()
    total_inserted += inserted_batch
    pct = (i + len(batch)) / len(entries) * 100
    print(f"  Progress: {total_inserted:,}/{len(entries):,} ({pct:.0f}%) | errors: {errors}")

# Update total_entries in sanctions_list_sources
cur.execute(
    "UPDATE sanctions_list_sources SET total_entries = %d, last_scraped = GETDATE(), last_scrape_status = 'SUCCESS' WHERE id = %d" 
    % (total_inserted, source_id)
)
conn.commit()
conn.close()

print()
print("=== DONE ===")
print(f"  Total inserted: {total_inserted:,}")
print(f"  Errors skipped: {errors}")
print(f"  OFAC SDN list is now populated with real data!")
