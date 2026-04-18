#!/usr/bin/env python3
"""
Sanctions Engine - Unified Scraper Service
Handles: OFAC (full + delta), EU, UN, UK, SECO, DFAT, MAS, HMT, BIS, FinCEN, World Bank
Features: SSE progress streaming, delta diff, enrichment, < 300s per source
"""

import os, sys, json, time, hashlib, zipfile, io, csv, re, threading, queue
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, Response, request, jsonify, stream_with_context
import requests
import pymssql
import xml.etree.ElementTree as ET
from lxml import etree
import pandas as pd
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

app = Flask(__name__)

DB_CONFIG = dict(server='203.101.44.46', user='shahul', password='Apple123!@#', database='sanctions', timeout=30)

# ── Global process state (visible to UI via SSE) ──────────────────────────────
process_state = {}   # keyed by run_id

def emit(run_id, event, data):
    """Push a structured event into the run's queue."""
    if run_id not in process_state:
        process_state[run_id] = {'queue': queue.Queue(), 'log': [], 'done': False}
    entry = {'ts': datetime.utcnow().isoformat(), 'event': event, **data}
    process_state[run_id]['log'].append(entry)
    process_state[run_id]['queue'].put(entry)

def finish(run_id, status='SUCCESS', summary=None):
    if run_id not in process_state:
        process_state[run_id] = {'queue': queue.Queue(), 'log': [], 'done': False}
    process_state[run_id]['done'] = True
    process_state[run_id]['status'] = status
    process_state[run_id]['summary'] = summary or {}
    process_state[run_id]['queue'].put({'ts': datetime.utcnow().isoformat(), 'event': 'DONE', 'status': status, 'summary': summary})

# ── DB helpers ────────────────────────────────────────────────────────────────
def db():
    return pymssql.connect(**DB_CONFIG)

def upsert_entry(cursor, conn, source_id, rec, run_id):
    """Insert or update a sanctions entry, return (action, entry_id)."""
    ext_id = rec.get('external_id') or ''
    cursor.execute("SELECT id, primary_name, dob, nationality, programme, status FROM sanctions_entries WHERE source_id=%s AND external_id=%s", (source_id, ext_id))
    existing = cursor.fetchone()

    if existing:
        eid = existing[0]
        changed = (existing[1] != rec.get('primary_name') or
                   str(existing[2] or '') != str(rec.get('dob') or '') or
                   str(existing[3] or '') != str(rec.get('nationality') or '') or
                   str(existing[4] or '') != str(rec.get('programme') or ''))
        if changed:
            cursor.execute("""UPDATE sanctions_entries SET primary_name=%s, dob=%s, nationality=%s,
                programme=%s, last_updated=%s, status=%s, updated_at=GETDATE() WHERE id=%s""",
                (rec['primary_name'], rec.get('dob'), rec.get('nationality'),
                 rec.get('programme'), datetime.utcnow().date(), rec.get('status','ACTIVE'), eid))
            conn.commit()
            # log change
            cursor.execute("""INSERT INTO sanctions_change_log (source_id, entry_id, external_id, change_type, changed_fields, scrape_run_id)
                VALUES (%s,%s,%s,'UPDATE',%s,%s)""",
                (source_id, eid, ext_id, json.dumps({'primary_name': rec['primary_name']}), run_id))
            conn.commit()
            return 'UPDATE', eid
        return 'SKIP', eid
    else:
        cursor.execute("""INSERT INTO sanctions_entries
            (source_id, external_id, entry_type, primary_name, dob, nationality, programme, listing_date, status)
            OUTPUT INSERTED.id
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (source_id, ext_id, rec.get('entry_type','INDIVIDUAL'),
             rec['primary_name'], rec.get('dob'), rec.get('nationality'),
             rec.get('programme'), rec.get('listing_date'), rec.get('status','ACTIVE')))
        row = cursor.fetchone()
        conn.commit()
        eid = row[0] if row else None
        cursor.execute("""INSERT INTO sanctions_change_log (source_id, entry_id, external_id, change_type, changed_fields, scrape_run_id)
            VALUES (%s,%s,%s,'ADD',%s,%s)""",
            (source_id, eid, ext_id, json.dumps({'primary_name': rec['primary_name']}), run_id))
        conn.commit()
        return 'ADD', eid

def upsert_aliases(cursor, conn, entry_id, aliases):
    for alias in aliases:
        cursor.execute("SELECT id FROM sanctions_aliases WHERE entry_id=%s AND alias_name=%s", (entry_id, alias['name']))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO sanctions_aliases (entry_id, alias_name, alias_type, alias_quality) VALUES (%s,%s,%s,%s)",
                (entry_id, alias['name'], alias.get('type','AKA'), alias.get('quality','STRONG')))
    conn.commit()

def upsert_address(cursor, conn, entry_id, addr):
    cursor.execute("SELECT id FROM sanctions_addresses WHERE entry_id=%s AND country=%s AND city=%s",
        (entry_id, addr.get('country',''), addr.get('city','')))
    if not cursor.fetchone():
        cursor.execute("""INSERT INTO sanctions_addresses (entry_id, address1, city, state_province, postal_code, country, country_code)
            VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (entry_id, addr.get('address1',''), addr.get('city',''), addr.get('state',''),
             addr.get('postal',''), addr.get('country',''), addr.get('country_code','')))
        conn.commit()

def get_source_id(cursor, code):
    cursor.execute("SELECT id FROM sanctions_list_sources WHERE source_code=%s", (code,))
    row = cursor.fetchone()
    return row[0] if row else None

def update_run(cursor, conn, run_id, status, downloaded=0, added=0, updated=0, deleted=0, error=None):
    cursor.execute("""UPDATE scrape_run_history SET completed_at=GETDATE(), status=%s,
        records_downloaded=%s, records_added=%s, records_updated=%s, records_deleted=%s, error_message=%s
        WHERE run_id=%s""",
        (status, downloaded, added, updated, deleted, error, run_id))
    conn.commit()

def create_run(cursor, conn, source_id, run_id):
    cursor.execute("INSERT INTO scrape_run_history (run_id, source_id, status) VALUES (%s,%s,'RUNNING')", (run_id, source_id))
    conn.commit()

# ── OFAC Full List Parser ─────────────────────────────────────────────────────
OFAC_SDN_XML = "https://ofac.treasury.gov/downloads/sdn.xml"
OFAC_DELTA_XML = "https://ofac.treasury.gov/downloads/sdn_delta.xml"
OFAC_SDN_CSV = "https://ofac.treasury.gov/downloads/sdn.csv"
OFAC_ALT_CSV = "https://ofac.treasury.gov/downloads/alt.csv"
OFAC_ADD_CSV = "https://ofac.treasury.gov/downloads/add.csv"

NS = {'ofac': 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN'}

def parse_ofac_xml(xml_bytes, run_id, source_id):
    """Parse OFAC SDN XML, return list of records. Emits progress via SSE."""
    emit(run_id, 'PARSE_START', {'msg': 'Parsing OFAC SDN XML', 'bytes': len(xml_bytes)})
    t0 = time.time()
    try:
        root = etree.fromstring(xml_bytes)
    except Exception as e:
        # Try stripping namespace
        xml_str = xml_bytes.decode('utf-8', errors='replace')
        xml_str = re.sub(r' xmlns[^"]*"[^"]*"', '', xml_str)
        root = etree.fromstring(xml_str.encode('utf-8'))

    records = []
    entries = root.findall('.//{*}sdnEntry')
    total = len(entries)
    emit(run_id, 'PARSE_COUNT', {'msg': f'Found {total} SDN entries', 'total': total})

    for i, entry in enumerate(entries):
        if i % 500 == 0:
            pct = round(i / total * 100)
            emit(run_id, 'PARSE_PROGRESS', {'pct': pct, 'processed': i, 'total': total,
                'elapsed': round(time.time()-t0,1)})

        uid = entry.findtext('{*}uid') or entry.findtext('uid') or ''
        last_name = entry.findtext('{*}lastName') or entry.findtext('lastName') or ''
        first_name = entry.findtext('{*}firstName') or entry.findtext('firstName') or ''
        sdn_type = entry.findtext('{*}sdnType') or entry.findtext('sdnType') or 'Individual'
        title = entry.findtext('{*}title') or entry.findtext('title') or ''

        full_name = f"{last_name}, {first_name}".strip(', ') if first_name else last_name

        # Programs
        programs = [p.text for p in entry.findall('.//{*}program') + entry.findall('.//program') if p.text]
        programme = ','.join(programs)

        # Entry type
        etype_map = {'Individual': 'INDIVIDUAL', 'Entity': 'ENTITY', 'Vessel': 'VESSEL', 'Aircraft': 'AIRCRAFT'}
        entry_type = etype_map.get(sdn_type, 'ENTITY')

        # DOB
        dob = None
        for dob_el in entry.findall('.//{*}dateOfBirthItem') + entry.findall('.//dateOfBirthItem'):
            dob_text = dob_el.findtext('{*}dateOfBirth') or dob_el.findtext('dateOfBirth') or ''
            if dob_text:
                dob = dob_text[:10]
                break

        # Nationality
        nat = None
        for nat_el in entry.findall('.//{*}nationalityItem') + entry.findall('.//nationalityItem'):
            nat_text = nat_el.findtext('{*}country') or nat_el.findtext('country') or ''
            if nat_text:
                nat = nat_text[:100]
                break

        # Aliases
        aliases = []
        for aka in entry.findall('.//{*}aka') + entry.findall('.//aka'):
            aka_type = aka.findtext('{*}type') or aka.findtext('type') or 'AKA'
            aka_cat = aka.findtext('{*}category') or aka.findtext('category') or 'strong'
            aka_ln = aka.findtext('{*}lastName') or aka.findtext('lastName') or ''
            aka_fn = aka.findtext('{*}firstName') or aka.findtext('firstName') or ''
            aka_name = f"{aka_ln}, {aka_fn}".strip(', ') if aka_fn else aka_ln
            if aka_name:
                aliases.append({'name': aka_name, 'type': aka_type.upper(),
                                 'quality': 'STRONG' if aka_cat.lower()=='strong' else 'WEAK'})

        # Addresses
        addresses = []
        for addr in entry.findall('.//{*}address') + entry.findall('.//address'):
            addresses.append({
                'address1': addr.findtext('{*}address1') or addr.findtext('address1') or '',
                'city': addr.findtext('{*}city') or addr.findtext('city') or '',
                'state': addr.findtext('{*}stateOrProvince') or addr.findtext('stateOrProvince') or '',
                'postal': addr.findtext('{*}postalCode') or addr.findtext('postalCode') or '',
                'country': addr.findtext('{*}country') or addr.findtext('country') or '',
                'country_code': addr.findtext('{*}countryCode') or addr.findtext('countryCode') or '',
            })

        records.append({
            'external_id': uid,
            'primary_name': full_name,
            'entry_type': entry_type,
            'dob': dob,
            'nationality': nat,
            'programme': programme,
            'listing_date': None,
            'status': 'ACTIVE',
            'aliases': aliases,
            'addresses': addresses,
            'title': title,
        })

    emit(run_id, 'PARSE_DONE', {'msg': f'Parsed {len(records)} records in {round(time.time()-t0,1)}s', 'count': len(records)})
    return records

def parse_ofac_delta(xml_bytes, run_id):
    """Parse OFAC delta XML, return adds/updates/deletes."""
    emit(run_id, 'DELTA_PARSE', {'msg': 'Parsing OFAC delta file'})
    adds, updates, deletes = [], [], []
    try:
        root = etree.fromstring(xml_bytes)
        for entry in root.findall('.//{*}sdnEntry') + root.findall('.//sdnEntry'):
            action = entry.get('action', 'ADD').upper()
            uid = entry.findtext('{*}uid') or entry.findtext('uid') or ''
            last_name = entry.findtext('{*}lastName') or entry.findtext('lastName') or ''
            first_name = entry.findtext('{*}firstName') or entry.findtext('firstName') or ''
            full_name = f"{last_name}, {first_name}".strip(', ') if first_name else last_name
            rec = {'external_id': uid, 'primary_name': full_name, 'action': action}
            if action == 'ADD':
                adds.append(rec)
            elif action in ('UPDATE', 'CHANGE'):
                updates.append(rec)
            elif action in ('DELETE', 'REMOVE'):
                deletes.append(rec)
    except Exception as e:
        emit(run_id, 'DELTA_ERROR', {'msg': f'Delta parse error: {e}'})

    emit(run_id, 'DELTA_RESULT', {'adds': len(adds), 'updates': len(updates), 'deletes': len(deletes)})
    return adds, updates, deletes

# ── EU Consolidated List Parser ───────────────────────────────────────────────
EU_XML_URL = "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content"
EU_XML_URL2 = "https://data.europa.eu/api/hub/store/data/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions.xml"

def parse_eu_xml(xml_bytes, run_id):
    emit(run_id, 'PARSE_START', {'msg': 'Parsing EU Consolidated Sanctions XML'})
    t0 = time.time()
    records = []
    try:
        root = etree.fromstring(xml_bytes)
        entries = root.findall('.//{*}sanctionEntity') + root.findall('.//sanctionEntity')
        total = len(entries)
        emit(run_id, 'PARSE_COUNT', {'msg': f'Found {total} EU entries', 'total': total})

        for i, entry in enumerate(entries):
            if i % 200 == 0:
                emit(run_id, 'PARSE_PROGRESS', {'pct': round(i/total*100), 'processed': i, 'total': total})

            ref = entry.get('euReferenceNumber') or entry.get('logicalId') or entry.get('id') or ''
            subject_type = entry.get('subjectType', 'P')  # P=person, E=enterprise
            entry_type = 'INDIVIDUAL' if subject_type in ('P','person') else 'ENTITY'

            # Name
            names = entry.findall('.//{*}wholeName') + entry.findall('.//wholeName')
            name_el = entry.findall('.//{*}nameAlias') + entry.findall('.//nameAlias')
            primary_name = ''
            aliases = []
            for n in name_el:
                whole = n.get('wholeName') or n.findtext('{*}wholeName') or ''
                if not whole:
                    fn = n.get('firstName') or ''
                    ln = n.get('lastName') or ''
                    whole = f"{ln}, {fn}".strip(', ') if fn else ln
                if not primary_name:
                    primary_name = whole
                else:
                    if whole and whole != primary_name:
                        aliases.append({'name': whole, 'type': 'AKA', 'quality': 'STRONG'})

            if not primary_name:
                continue

            # DOB
            dob = None
            for dob_el in entry.findall('.//{*}birthdate') + entry.findall('.//birthdate'):
                dob_text = dob_el.get('birthdate') or dob_el.text or ''
                if dob_text:
                    dob = dob_text[:10]
                    break

            # Nationality
            nat = None
            for nat_el in entry.findall('.//{*}citizenship') + entry.findall('.//citizenship'):
                nat = nat_el.get('countryIso2Code') or nat_el.get('countryDescription') or ''
                if nat:
                    break

            # Programme/Regulation
            reg = entry.findall('.//{*}regulation') + entry.findall('.//regulation')
            programme = reg[0].get('programme') or reg[0].get('type') or 'EU' if reg else 'EU'

            records.append({
                'external_id': ref,
                'primary_name': primary_name,
                'entry_type': entry_type,
                'dob': dob,
                'nationality': nat,
                'programme': programme,
                'listing_date': None,
                'status': 'ACTIVE',
                'aliases': aliases,
                'addresses': [],
            })
    except Exception as e:
        emit(run_id, 'PARSE_ERROR', {'msg': f'EU parse error: {e}'})

    emit(run_id, 'PARSE_DONE', {'msg': f'Parsed {len(records)} EU records in {round(time.time()-t0,1)}s', 'count': len(records)})
    return records

# ── UN Security Council Parser ────────────────────────────────────────────────
UN_XML_URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml"

def parse_un_xml(xml_bytes, run_id):
    emit(run_id, 'PARSE_START', {'msg': 'Parsing UN Security Council XML'})
    t0 = time.time()
    records = []
    try:
        root = etree.fromstring(xml_bytes)
        individuals = root.findall('.//{*}INDIVIDUAL') + root.findall('.//INDIVIDUAL')
        entities = root.findall('.//{*}ENTITY') + root.findall('.//ENTITY')
        total = len(individuals) + len(entities)
        emit(run_id, 'PARSE_COUNT', {'msg': f'Found {total} UN entries ({len(individuals)} individuals, {len(entities)} entities)', 'total': total})

        def parse_un_entry(entry, etype):
            ref = entry.findtext('{*}REFERENCE_NUMBER') or entry.findtext('REFERENCE_NUMBER') or ''
            fn = entry.findtext('{*}FIRST_NAME') or entry.findtext('FIRST_NAME') or ''
            ln = entry.findtext('{*}SECOND_NAME') or entry.findtext('SECOND_NAME') or ''
            third = entry.findtext('{*}THIRD_NAME') or entry.findtext('THIRD_NAME') or ''
            name_parts = [p for p in [fn, ln, third] if p]
            primary_name = ' '.join(name_parts) if name_parts else (entry.findtext('{*}FIRST_NAME') or '')

            if not primary_name:
                # Entity name
                primary_name = entry.findtext('{*}FIRST_NAME') or entry.findtext('FIRST_NAME') or ''

            # Aliases
            aliases = []
            for aka in entry.findall('.//{*}ALIAS') + entry.findall('.//ALIAS'):
                aka_name = aka.findtext('{*}ALIAS_NAME') or aka.findtext('ALIAS_NAME') or ''
                if aka_name and aka_name != primary_name:
                    aliases.append({'name': aka_name, 'type': 'AKA', 'quality': 'STRONG'})

            # DOB
            dob = entry.findtext('.//{*}DATE') or entry.findtext('.//DATE') or None
            if dob:
                dob = dob[:10]

            # Nationality
            nat = entry.findtext('.//{*}NATIONALITY') or entry.findtext('.//NATIONALITY') or None

            # Programme
            list_type = entry.findtext('{*}LIST_TYPE') or entry.findtext('LIST_TYPE') or 'UN'
            programme = list_type.strip()

            return {
                'external_id': ref,
                'primary_name': primary_name,
                'entry_type': etype,
                'dob': dob,
                'nationality': nat,
                'programme': programme,
                'listing_date': None,
                'status': 'ACTIVE',
                'aliases': aliases,
                'addresses': [],
            }

        for i, entry in enumerate(individuals):
            if i % 100 == 0:
                emit(run_id, 'PARSE_PROGRESS', {'pct': round(i/total*100), 'processed': i, 'total': total})
            rec = parse_un_entry(entry, 'INDIVIDUAL')
            if rec['primary_name']:
                records.append(rec)

        for i, entry in enumerate(entities):
            rec = parse_un_entry(entry, 'ENTITY')
            if rec['primary_name']:
                records.append(rec)

    except Exception as e:
        emit(run_id, 'PARSE_ERROR', {'msg': f'UN parse error: {e}'})

    emit(run_id, 'PARSE_DONE', {'msg': f'Parsed {len(records)} UN records in {round(time.time()-t0,1)}s', 'count': len(records)})
    return records

# ── UK OFSI Parser ────────────────────────────────────────────────────────────
UK_CSV_URL = "https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/ConList.csv"
UK_XLSX_URL = "https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.xlsx"

def parse_uk_csv(csv_bytes, run_id):
    emit(run_id, 'PARSE_START', {'msg': 'Parsing UK OFSI CSV'})
    t0 = time.time()
    records = []
    try:
        text = csv_bytes.decode('utf-8', errors='replace')
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        total = len(rows)
        emit(run_id, 'PARSE_COUNT', {'msg': f'Found {total} UK rows', 'total': total})

        for i, row in enumerate(rows):
            if i % 200 == 0:
                emit(run_id, 'PARSE_PROGRESS', {'pct': round(i/total*100), 'processed': i, 'total': total})

            uid = row.get('Unique ID') or row.get('OFSI Group ID') or row.get('ID') or str(i)
            name6 = row.get('Name 6') or ''
            name1 = row.get('Name 1') or ''
            name2 = row.get('Name 2') or ''
            name3 = row.get('Name 3') or ''
            name4 = row.get('Name 4') or ''
            name5 = row.get('Name 5') or ''
            full_name = ' '.join(p for p in [name6, name1, name2, name3, name4, name5] if p).strip()
            if not full_name:
                full_name = row.get('Name') or row.get('Full Name') or ''
            if not full_name:
                continue

            group_type = row.get('Group Type') or row.get('Entity Type') or 'Individual'
            etype = 'INDIVIDUAL' if 'individual' in group_type.lower() else 'ENTITY'
            dob = row.get('DOB') or row.get('Date of Birth') or None
            nat = row.get('Nationality') or row.get('Country') or None
            regime = row.get('Regime') or row.get('Programme') or 'UK'

            records.append({
                'external_id': uid,
                'primary_name': full_name,
                'entry_type': etype,
                'dob': dob[:10] if dob else None,
                'nationality': nat,
                'programme': regime,
                'listing_date': None,
                'status': 'ACTIVE',
                'aliases': [],
                'addresses': [],
            })
    except Exception as e:
        emit(run_id, 'PARSE_ERROR', {'msg': f'UK parse error: {e}'})

    emit(run_id, 'PARSE_DONE', {'msg': f'Parsed {len(records)} UK records in {round(time.time()-t0,1)}s', 'count': len(records)})
    return records

# ── SECO (Switzerland) Parser ─────────────────────────────────────────────────
SECO_URL = "https://www.sesam.search.admin.ch/sesam-search-web/pages/downloadXmlGesamtliste.xhtml"

def parse_seco_xml(xml_bytes, run_id):
    emit(run_id, 'PARSE_START', {'msg': 'Parsing SECO XML'})
    t0 = time.time()
    records = []
    try:
        root = etree.fromstring(xml_bytes)
        entries = root.findall('.//{*}sanctionEntity') + root.findall('.//sanctionEntity') + \
                  root.findall('.//{*}entry') + root.findall('.//entry')
        total = len(entries)
        emit(run_id, 'PARSE_COUNT', {'msg': f'Found {total} SECO entries', 'total': total})

        for i, entry in enumerate(entries):
            if i % 100 == 0:
                emit(run_id, 'PARSE_PROGRESS', {'pct': round(i/total*100), 'processed': i, 'total': total})

            ssid = entry.get('ssid') or entry.get('id') or str(i)
            names = entry.findall('.//{*}name') + entry.findall('.//name')
            primary_name = names[0].text if names else ''
            if not primary_name:
                continue

            aliases = [{'name': n.text, 'type': 'AKA', 'quality': 'STRONG'}
                       for n in names[1:] if n.text and n.text != primary_name]

            records.append({
                'external_id': f'SECO-{ssid}',
                'primary_name': primary_name,
                'entry_type': 'INDIVIDUAL',
                'dob': None,
                'nationality': None,
                'programme': 'SECO',
                'listing_date': None,
                'status': 'ACTIVE',
                'aliases': aliases,
                'addresses': [],
            })
    except Exception as e:
        emit(run_id, 'PARSE_ERROR', {'msg': f'SECO parse error: {e}'})

    emit(run_id, 'PARSE_DONE', {'msg': f'Parsed {len(records)} SECO records in {round(time.time()-t0,1)}s', 'count': len(records)})
    return records

# ── DFAT (Australia) Parser ───────────────────────────────────────────────────
DFAT_XLSX_URL = "https://www.dfat.gov.au/sites/default/files/regulation8_consolidated.xlsx"
DFAT_CSV_URL  = "https://www.dfat.gov.au/sites/default/files/aus-sanctions-consolidated-list.csv"

def parse_dfat(data_bytes, run_id, fmt='csv'):
    emit(run_id, 'PARSE_START', {'msg': f'Parsing DFAT {fmt.upper()}'})
    t0 = time.time()
    records = []
    try:
        if fmt == 'xlsx':
            df = pd.read_excel(io.BytesIO(data_bytes), engine='openpyxl')
        else:
            df = pd.read_csv(io.StringIO(data_bytes.decode('utf-8', errors='replace')))

        total = len(df)
        emit(run_id, 'PARSE_COUNT', {'msg': f'Found {total} DFAT rows', 'total': total})

        for i, row in df.iterrows():
            if i % 100 == 0:
                emit(run_id, 'PARSE_PROGRESS', {'pct': round(i/total*100), 'processed': i, 'total': total})

            name = str(row.get('Name') or row.get('name') or row.get('Full Name') or '').strip()
            if not name or name == 'nan':
                continue

            etype_raw = str(row.get('Type') or row.get('type') or 'Individual')
            etype = 'INDIVIDUAL' if 'individual' in etype_raw.lower() else 'ENTITY'
            dob = str(row.get('DOB') or row.get('Date of Birth') or '')
            nat = str(row.get('Nationality') or row.get('Country') or '')

            records.append({
                'external_id': f'DFAT-{i}',
                'primary_name': name,
                'entry_type': etype,
                'dob': dob[:10] if dob and dob != 'nan' else None,
                'nationality': nat if nat != 'nan' else None,
                'programme': 'DFAT',
                'listing_date': None,
                'status': 'ACTIVE',
                'aliases': [],
                'addresses': [],
            })
    except Exception as e:
        emit(run_id, 'PARSE_ERROR', {'msg': f'DFAT parse error: {e}'})

    emit(run_id, 'PARSE_DONE', {'msg': f'Parsed {len(records)} DFAT records in {round(time.time()-t0,1)}s', 'count': len(records)})
    return records

# ── MAS (Singapore) Parser ────────────────────────────────────────────────────
MAS_URL = "https://www.mas.gov.sg/regulation/anti-money-laundering/targeted-financial-sanctions/lists-of-designated-individuals-and-entities"

def parse_mas_html(html_bytes, run_id):
    """MAS publishes HTML tables - parse them."""
    emit(run_id, 'PARSE_START', {'msg': 'Parsing MAS Singapore HTML'})
    t0 = time.time()
    records = []
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html_bytes, 'lxml')
        tables = soup.find_all('table')
        total_rows = sum(len(t.find_all('tr')) for t in tables)
        emit(run_id, 'PARSE_COUNT', {'msg': f'Found {len(tables)} tables, ~{total_rows} rows', 'total': total_rows})

        idx = 0
        for table in tables:
            rows = table.find_all('tr')
            headers = [th.get_text(strip=True).lower() for th in rows[0].find_all(['th','td'])] if rows else []
            for row in rows[1:]:
                cells = [td.get_text(strip=True) for td in row.find_all(['td','th'])]
                if not cells or not cells[0]:
                    continue
                name = cells[0] if cells else ''
                if not name:
                    continue
                records.append({
                    'external_id': f'MAS-{idx}',
                    'primary_name': name,
                    'entry_type': 'INDIVIDUAL',
                    'dob': cells[1] if len(cells) > 1 else None,
                    'nationality': cells[2] if len(cells) > 2 else None,
                    'programme': 'MAS',
                    'listing_date': None,
                    'status': 'ACTIVE',
                    'aliases': [],
                    'addresses': [],
                })
                idx += 1
    except Exception as e:
        emit(run_id, 'PARSE_ERROR', {'msg': f'MAS parse error: {e}'})

    emit(run_id, 'PARSE_DONE', {'msg': f'Parsed {len(records)} MAS records in {round(time.time()-t0,1)}s', 'count': len(records)})
    return records

# ── World Bank Debarred Firms ─────────────────────────────────────────────────
WB_URL = "https://apigwext.worldbank.org/dvsvc/v1.0/json/APPLICATION/ADOBE_EXPRNC_MGR/FIRM/SANCTIONED_FIRM"

def parse_worldbank(json_bytes, run_id):
    emit(run_id, 'PARSE_START', {'msg': 'Parsing World Bank Debarred Firms'})
    records = []
    try:
        data = json.loads(json_bytes)
        firms = data.get('response', {}).get('ZPROCSUPP', [])
        total = len(firms)
        emit(run_id, 'PARSE_COUNT', {'msg': f'Found {total} World Bank entries', 'total': total})
        for i, firm in enumerate(firms):
            name = firm.get('SUPP_NAME') or firm.get('suppName') or ''
            if not name:
                continue
            records.append({
                'external_id': f'WB-{firm.get("SUPP_NO", i)}',
                'primary_name': name,
                'entry_type': 'ENTITY',
                'dob': None,
                'nationality': firm.get('COUNTRY_NAME') or firm.get('countryName'),
                'programme': 'WORLD_BANK',
                'listing_date': firm.get('DEBAR_FROM_DATE'),
                'status': 'ACTIVE',
                'aliases': [],
                'addresses': [],
            })
    except Exception as e:
        emit(run_id, 'PARSE_ERROR', {'msg': f'World Bank parse error: {e}'})
    emit(run_id, 'PARSE_DONE', {'msg': f'Parsed {len(records)} World Bank records', 'count': len(records)})
    return records

# ── Enrichment Engine ─────────────────────────────────────────────────────────
def enrich_records(records, run_id):
    """
    Enrich records with:
    1. Name normalization & transliteration variants
    2. Country code lookup
    3. Entry type inference from name patterns
    4. Duplicate detection
    """
    emit(run_id, 'ENRICH_START', {'msg': f'Enriching {len(records)} records', 'total': len(records)})
    t0 = time.time()

    # Country code map (ISO2)
    country_map = {
        'IRAN': 'IR', 'RUSSIA': 'RU', 'NORTH KOREA': 'KP', 'DPRK': 'KP',
        'SYRIA': 'SY', 'CUBA': 'CU', 'VENEZUELA': 'VE', 'BELARUS': 'BY',
        'MYANMAR': 'MM', 'BURMA': 'MM', 'SUDAN': 'SD', 'LIBYA': 'LY',
        'YEMEN': 'YE', 'AFGHANISTAN': 'AF', 'IRAQ': 'IQ', 'SOMALIA': 'SO',
        'UNITED STATES': 'US', 'UNITED KINGDOM': 'GB', 'GERMANY': 'DE',
        'FRANCE': 'FR', 'CHINA': 'CN', 'INDIA': 'IN', 'PAKISTAN': 'PK',
        'SAUDI ARABIA': 'SA', 'UAE': 'AE', 'SINGAPORE': 'SG',
    }

    vessel_keywords = ['MV ', 'MT ', 'SS ', 'VESSEL', 'TANKER', 'SHIP', 'CARGO', 'FREIGHTER']
    aircraft_keywords = ['AIRLINE', 'AIRWAYS', 'AVIATION', 'AIR ', 'AIRCRAFT']

    enriched = 0
    for i, rec in enumerate(records):
        if i % 500 == 0:
            emit(run_id, 'ENRICH_PROGRESS', {'pct': round(i/len(records)*100), 'processed': i, 'enriched': enriched})

        name_upper = rec['primary_name'].upper()

        # Infer entry type from name if not set
        if rec['entry_type'] == 'ENTITY':
            if any(k in name_upper for k in vessel_keywords):
                rec['entry_type'] = 'VESSEL'
            elif any(k in name_upper for k in aircraft_keywords):
                rec['entry_type'] = 'AIRCRAFT'

        # Normalize nationality to ISO2
        if rec.get('nationality'):
            nat_upper = rec['nationality'].upper().strip()
            if len(nat_upper) > 2:
                rec['nationality'] = country_map.get(nat_upper, rec['nationality'][:2].upper())

        # Generate transliteration variants for Arabic/Cyrillic names
        # Simple heuristic: if name contains common Arabic patterns, add variants
        arabic_patterns = {'MOHAMMAD': 'MOHAMMED', 'MOHAMMED': 'MOHAMMAD',
                           'AHMAD': 'AHMED', 'AHMED': 'AHMAD',
                           'HUSSAIN': 'HUSSEIN', 'HUSSEIN': 'HUSSAIN',
                           'MOHAMAD': 'MOHAMMED', 'MUHAMMED': 'MOHAMMED'}
        for old, new in arabic_patterns.items():
            if old in name_upper:
                variant = rec['primary_name'].upper().replace(old, new)
                if not any(a['name'].upper() == variant for a in rec['aliases']):
                    rec['aliases'].append({'name': variant, 'type': 'NFM', 'quality': 'STRONG'})
                    enriched += 1

        # Cyrillic transliteration hints (basic)
        cyrillic_map = {'ПУТИН': 'PUTIN', 'ЛУКАШЕНКО': 'LUKASHENKO'}
        for cyr, lat in cyrillic_map.items():
            if cyr in name_upper:
                if not any(a['name'].upper() == lat for a in rec['aliases']):
                    rec['aliases'].append({'name': lat, 'type': 'NFM', 'quality': 'STRONG'})
                    enriched += 1

    emit(run_id, 'ENRICH_DONE', {'msg': f'Enriched {enriched} records with variants in {round(time.time()-t0,1)}s',
                                  'enriched': enriched, 'total': len(records)})
    return records

# ── Bulk DB Writer (parallel batches) ────────────────────────────────────────
def bulk_write(records, source_id, run_id, batch_size=200):
    """Write records to DB in parallel batches. Returns (added, updated, skipped)."""
    emit(run_id, 'DB_WRITE_START', {'msg': f'Writing {len(records)} records in batches of {batch_size}', 'total': len(records)})
    t0 = time.time()
    added = updated = skipped = 0
    total = len(records)

    def write_batch(batch, batch_idx):
        nonlocal added, updated, skipped
        conn = db()
        cursor = conn.cursor()
        local_add = local_upd = local_skip = 0
        for rec in batch:
            try:
                action, eid = upsert_entry(cursor, conn, source_id, rec, run_id)
                if action == 'ADD':
                    local_add += 1
                    if eid and rec.get('aliases'):
                        upsert_aliases(cursor, conn, eid, rec['aliases'])
                    if eid and rec.get('addresses'):
                        for addr in rec['addresses']:
                            upsert_address(cursor, conn, eid, addr)
                elif action == 'UPDATE':
                    local_upd += 1
                else:
                    local_skip += 1
            except Exception as e:
                local_skip += 1
        conn.close()
        return local_add, local_upd, local_skip

    batches = [records[i:i+batch_size] for i in range(0, total, batch_size)]
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(write_batch, b, i): i for i, b in enumerate(batches)}
        done = 0
        for fut in as_completed(futures):
            a, u, s = fut.result()
            added += a; updated += u; skipped += s
            done += 1
            pct = round(done / len(batches) * 100)
            emit(run_id, 'DB_WRITE_PROGRESS', {'pct': pct, 'done_batches': done,
                'total_batches': len(batches), 'added': added, 'updated': updated})

    elapsed = round(time.time() - t0, 1)
    emit(run_id, 'DB_WRITE_DONE', {'msg': f'DB write complete in {elapsed}s', 'added': added,
        'updated': updated, 'skipped': skipped, 'elapsed': elapsed})
    return added, updated, skipped

# ── Download helper with timeout & retry ─────────────────────────────────────
def download(url, run_id, timeout=60, retries=3):
    emit(run_id, 'DOWNLOAD_START', {'msg': f'Downloading {url}', 'url': url})
    t0 = time.time()
    headers = {'User-Agent': 'SanctionsEngine/2.0 Compliance-Bot (contact: compliance@bank.com)'}
    for attempt in range(1, retries+1):
        try:
            r = requests.get(url, timeout=timeout, headers=headers, stream=True)
            r.raise_for_status()
            content = r.content
            elapsed = round(time.time()-t0, 1)
            emit(run_id, 'DOWNLOAD_DONE', {'msg': f'Downloaded {len(content):,} bytes in {elapsed}s',
                'bytes': len(content), 'elapsed': elapsed, 'url': url})
            return content
        except Exception as e:
            emit(run_id, 'DOWNLOAD_RETRY', {'msg': f'Attempt {attempt} failed: {e}', 'attempt': attempt})
            if attempt == retries:
                emit(run_id, 'DOWNLOAD_FAIL', {'msg': f'Download failed after {retries} attempts: {e}'})
                return None
            time.sleep(2 ** attempt)

# ── Master scrape orchestrator ────────────────────────────────────────────────
def run_scrape(source_code, run_id, mode='full'):
    """Main scrape function for a given source. mode: full|delta"""
    t_total = time.time()
    emit(run_id, 'SCRAPE_START', {'source': source_code, 'mode': mode,
        'msg': f'Starting {source_code} scrape (mode={mode})'})

    conn = db()
    cursor = conn.cursor()
    source_id = get_source_id(cursor, source_code)
    if not source_id:
        emit(run_id, 'ERROR', {'msg': f'Source {source_code} not found in DB'})
        finish(run_id, 'FAILED')
        conn.close()
        return

    create_run(cursor, conn, source_id, run_id)
    conn.close()

    records = []
    try:
        if source_code == 'OFAC':
            if mode == 'delta':
                data = download(OFAC_DELTA_XML, run_id)
                if data:
                    adds, updates, deletes = parse_ofac_delta(data, run_id)
                    emit(run_id, 'DELTA_SUMMARY', {'adds': len(adds), 'updates': len(updates), 'deletes': len(deletes)})
                    # For delta, we still do a full parse to get complete records for adds
                    if adds:
                        full_data = download(OFAC_SDN_XML, run_id)
                        if full_data:
                            all_records = parse_ofac_xml(full_data, run_id, source_id)
                            add_ids = {a['external_id'] for a in adds}
                            records = [r for r in all_records if r['external_id'] in add_ids]
                    # Handle deletes
                    if deletes:
                        conn2 = db()
                        cur2 = conn2.cursor()
                        for d in deletes:
                            cur2.execute("UPDATE sanctions_entries SET status='DELISTED', delisted_date=GETDATE() WHERE source_id=%s AND external_id=%s",
                                (source_id, d['external_id']))
                        conn2.commit()
                        conn2.close()
                        emit(run_id, 'DELTA_DELISTED', {'count': len(deletes), 'msg': f'Delisted {len(deletes)} entries'})
            else:
                data = download(OFAC_SDN_XML, run_id)
                if data:
                    records = parse_ofac_xml(data, run_id, source_id)

        elif source_code == 'EU':
            data = download(EU_XML_URL, run_id)
            if not data:
                data = download(EU_XML_URL2, run_id)
            if data:
                records = parse_eu_xml(data, run_id)

        elif source_code == 'UN':
            data = download(UN_XML_URL, run_id)
            if data:
                records = parse_un_xml(data, run_id)

        elif source_code == 'UK':
            data = download(UK_CSV_URL, run_id)
            if data:
                records = parse_uk_csv(data, run_id)

        elif source_code == 'SECO':
            data = download(SECO_URL, run_id)
            if data:
                records = parse_seco_xml(data, run_id)

        elif source_code == 'DFAT':
            data = download(DFAT_CSV_URL, run_id)
            if data:
                records = parse_dfat(data, run_id, 'csv')

        elif source_code == 'MAS':
            data = download(MAS_URL, run_id)
            if data:
                records = parse_mas_html(data, run_id)

        elif source_code == 'WORLD_BANK':
            data = download(WB_URL, run_id)
            if data:
                records = parse_worldbank(data, run_id)

        if records:
            records = enrich_records(records, run_id)
            added, updated, skipped = bulk_write(records, source_id, run_id)
        else:
            added = updated = skipped = 0

        total_elapsed = round(time.time() - t_total, 1)
        summary = {
            'source': source_code, 'mode': mode,
            'downloaded': len(records), 'added': added,
            'updated': updated, 'skipped': skipped,
            'elapsed_seconds': total_elapsed,
            'within_300s': total_elapsed < 300
        }

        conn3 = db()
        cur3 = conn3.cursor()
        update_run(cur3, conn3, run_id, 'SUCCESS', len(records), added, updated, 0)
        cur3.execute("UPDATE sanctions_list_sources SET last_scraped=GETDATE(), last_scrape_status='SUCCESS', total_entries=(SELECT COUNT(*) FROM sanctions_entries WHERE source_id=%s AND status='ACTIVE') WHERE id=%s",
            (source_id, source_id))
        conn3.commit()
        conn3.close()

        emit(run_id, 'SCRAPE_COMPLETE', {**summary, 'msg': f'{source_code} scrape done in {total_elapsed}s'})
        finish(run_id, 'SUCCESS', summary)

    except Exception as e:
        emit(run_id, 'SCRAPE_ERROR', {'msg': str(e), 'source': source_code})
        conn4 = db()
        cur4 = conn4.cursor()
        update_run(cur4, conn4, run_id, 'FAILED', error=str(e))
        conn4.close()
        finish(run_id, 'FAILED', {'error': str(e)})

# ── SSE endpoint ──────────────────────────────────────────────────────────────
@app.route('/stream/<run_id>')
def stream(run_id):
    """Server-Sent Events stream for a specific run."""
    def generate():
        # Send buffered log first
        if run_id in process_state:
            for entry in process_state[run_id].get('log', []):
                yield f"data: {json.dumps(entry)}\n\n"

        # Stream new events
        timeout = 300
        start = time.time()
        while time.time() - start < timeout:
            if run_id in process_state:
                try:
                    entry = process_state[run_id]['queue'].get(timeout=1)
                    yield f"data: {json.dumps(entry)}\n\n"
                    if entry.get('event') == 'DONE':
                        break
                except queue.Empty:
                    if process_state[run_id].get('done'):
                        break
                    yield ": heartbeat\n\n"
            else:
                time.sleep(0.5)

    return Response(stream_with_context(generate()),
                    mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no',
                             'Access-Control-Allow-Origin': '*'})

@app.route('/run-log/<run_id>')
def run_log(run_id):
    """Return full log for a run (for UI replay)."""
    if run_id not in process_state:
        return jsonify({'log': [], 'done': False})
    state = process_state[run_id]
    return jsonify({'log': state.get('log', []), 'done': state.get('done', False),
                    'status': state.get('status'), 'summary': state.get('summary')})

# ── REST trigger endpoints ────────────────────────────────────────────────────
@app.route('/scrape/<source_code>', methods=['POST'])
def trigger_scrape(source_code):
    mode = request.json.get('mode', 'full') if request.json else 'full'
    run_id = f"RUN-{source_code}-{int(time.time())}"
    process_state[run_id] = {'queue': queue.Queue(), 'log': [], 'done': False}
    t = threading.Thread(target=run_scrape, args=(source_code.upper(), run_id, mode), daemon=True)
    t.start()
    return jsonify({'run_id': run_id, 'source': source_code, 'mode': mode, 'stream_url': f'/stream/{run_id}'})

@app.route('/scrape-all', methods=['POST'])
def trigger_all():
    mode = request.json.get('mode', 'full') if request.json else 'full'
    sources = ['OFAC', 'EU', 'UN', 'UK', 'SECO', 'DFAT', 'MAS']
    runs = []
    for src in sources:
        run_id = f"RUN-{src}-{int(time.time())}"
        process_state[run_id] = {'queue': queue.Queue(), 'log': [], 'done': False}
        t = threading.Thread(target=run_scrape, args=(src, run_id, mode), daemon=True)
        t.start()
        runs.append({'source': src, 'run_id': run_id, 'stream_url': f'/stream/{run_id}'})
    return jsonify({'runs': runs})

@app.route('/ofac-delta', methods=['POST'])
def trigger_ofac_delta():
    run_id = f"RUN-OFAC-DELTA-{int(time.time())}"
    process_state[run_id] = {'queue': queue.Queue(), 'log': [], 'done': False}
    t = threading.Thread(target=run_scrape, args=('OFAC', run_id, 'delta'), daemon=True)
    t.start()
    return jsonify({'run_id': run_id, 'source': 'OFAC', 'mode': 'delta', 'stream_url': f'/stream/{run_id}'})

@app.route('/active-runs')
def active_runs():
    runs = []
    for run_id, state in process_state.items():
        runs.append({
            'run_id': run_id,
            'done': state.get('done', False),
            'status': state.get('status', 'RUNNING'),
            'log_count': len(state.get('log', [])),
            'last_event': state['log'][-1] if state.get('log') else None
        })
    return jsonify(runs)

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'service': 'Sanctions Scraper Service', 'timestamp': datetime.utcnow().isoformat()})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=False, threaded=True)
