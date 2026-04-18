#!/usr/bin/env python3
"""Comprehensive demo data population - aligned with actual schema"""
import pymssql
import random
from datetime import datetime, timedelta

conn = pymssql.connect('203.101.44.46', 'shahul', 'Apple123!@#', 'sanctions')
cur = conn.cursor()

def exec_sql(sql):
    try:
        cur.execute(sql)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"  SQL Error: {str(e)[:120]}")

def exec_many(sql, rows):
    if not rows: return
    try:
        cur.executemany(sql, rows)
        conn.commit()
        print(f"  Inserted {len(rows)} rows")
    except Exception as e:
        conn.rollback()
        print(f"  Error: {str(e)[:200]}")

print("=== Populating Sanctions Engine Demo Data ===\n")

# ─── 1. Sanctions List Sources ─────────────────────────────────────────────
print("[1] Sanctions List Sources...")
exec_sql("DELETE FROM scrape_run_history")
exec_sql("DELETE FROM sanctions_list_sources")
sources = [
    ('OFAC','OFAC SDN List','https://www.treasury.gov/ofac/downloads/sdn.xml','https://www.treasury.gov/ofac/downloads/sdn.xml','US','USD',1,'Every 3 hours','US Treasury Office of Foreign Assets Control'),
    ('EU','EU Consolidated Sanctions','https://webgate.ec.europa.eu/fsd/fsf','https://webgate.ec.europa.eu/fsd/fsf','EU','EUR',1,'Every 3 hours','European Union External Action Service'),
    ('UN','UN Security Council','https://scsanctions.un.org/resources/xml/en/consolidated.xml','https://scsanctions.un.org/resources/xml/en/consolidated.xml','UN','USD',1,'Every 6 hours','United Nations Security Council'),
    ('UK','UK OFSI Sanctions','https://assets.publishing.service.gov.uk/','https://assets.publishing.service.gov.uk/','GB','GBP',1,'Every 6 hours','UK Office of Financial Sanctions Implementation'),
    ('SECO','SECO Switzerland','https://www.seco.admin.ch/','https://www.seco.admin.ch/','CH','CHF',1,'Every 12 hours','Swiss State Secretariat for Economic Affairs'),
    ('DFAT','DFAT Australia','https://www.dfat.gov.au/','https://www.dfat.gov.au/','AU','AUD',1,'Every 12 hours','Australian Department of Foreign Affairs and Trade'),
    ('MAS','MAS Singapore','https://www.mas.gov.sg/','https://www.mas.gov.sg/','SG','SGD',1,'Every 12 hours','Monetary Authority of Singapore'),
    ('BIS','BIS Entity List','https://www.bis.doc.gov/','https://www.bis.doc.gov/','US','USD',1,'Daily','US Bureau of Industry and Security'),
]
exec_many("INSERT INTO sanctions_list_sources (source_code,source_name,source_url,download_url,jurisdiction,currency_scope,is_active,scrape_interval_hours,description) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", sources)

# Get source IDs
cur.execute("SELECT id, source_code FROM sanctions_list_sources")
source_map = {r[1]: r[0] for r in cur.fetchall()}
print(f"  Source map: {source_map}")

# ─── 2. Sanctions Entries ─────────────────────────────────────────────────
print("\n[2] Sanctions Entries (200 records)...")
exec_sql("DELETE FROM sanctions_change_log")
exec_sql("DELETE FROM sanctions_identifiers")
exec_sql("DELETE FROM sanctions_aliases")
exec_sql("DELETE FROM sanctions_addresses")
exec_sql("DELETE FROM sanctions_entries")

first_names = ['Omar','Hassan','Ali','Mohammed','Ahmad','Ibrahim','Khalid','Tariq','Yusuf','Samir','Elena','Natasha','Olga','Irina','Svetlana','Chen','Wang','Li','Zhang','Liu','Viktor','Sergei','Alexei','Dmitri','Boris']
last_names = ['Al-Rashidi','Petrov','Ivanov','Hassan','Khalil','Benali','Smirnov','Volkov','Kim','Park','Zhang','Al-Houthi','Nasrallah','Timchenko','Usmanov','Assad','Khamenei','Kadyrov','Mordashov','Sokolov']
countries_hi = ['IR','RU','SY','KP','IQ','LB','YE','AF','VE','BY','MM','CU','ZW','SD','LY']
sources_list = ['OFAC','EU','UN','UK','SECO','DFAT','MAS']
programs_list = ['SDN','CONSOLIDATED','TALIBAN','AQIS','OFSI','SECO_LIST','DFAT_LIST','MAS_LIST','ENTITY_LIST']
types_list = ['Individual','Entity','Vessel','Aircraft']
risk_levels = ['Low','Medium','High','Critical']
statuses = ['Active','Active','Active','Delisted']

entries = []
# Key named entries
named_entries = [
    (source_map.get('OFAC',1),'EXT-OFAC-001','Individual','Ahmad Khalil Al-Rashidi','أحمد خليل الراشدي','1965-03-15','Baghdad','IQ','P12345678','IQ11223344','Male','Mr','Senior Official','SDN','2015-01-15','High','Active','Terrorism financing, Al-Qaeda network'),
    (source_map.get('OFAC',1),'EXT-OFAC-002','Individual','Fatima Zahra Benali','فاطمة زهرة بنعلي','1978-07-22','Casablanca','MA','MA87654321',None,'Female','Ms','Financial Facilitator','SDN','2016-03-20','High','Active','IRGC-QF financial facilitator'),
    (source_map.get('OFAC',1),'EXT-OFAC-003','Individual','Viktor Alexandrov Petrov',None,'1970-11-08','Moscow','RU','RU55667788',None,'Male','Mr','Businessman','SDN','2022-02-24','Critical','Active','Russian oligarch, Ukraine sanctions'),
    (source_map.get('EU',2),'EXT-EU-001','Individual','Sergei Nikolaevich Ivanov',None,'1968-09-14','St Petersburg','RU','RU22334455',None,'Male','Mr','Former Minister','CONSOLIDATED','2022-03-01','High','Active','Russian defense sector'),
    (source_map.get('UN',3),'EXT-UN-001','Individual','Abdul Razaq Talib',None,'1975-06-12','Kandahar','AF','AF11223344',None,'Male','Mullah','Senior Official','TALIBAN','2001-01-25','High','Active','Taliban senior official'),
    (source_map.get('OFAC',1),'EXT-OFAC-004','Entity','Mahan Air',None,None,'Tehran','IR',None,None,None,None,'Airline','SDN','2011-10-12','High','Active','IRGC-linked airline'),
    (source_map.get('EU',2),'EXT-EU-002','Entity','Rosoboronexport',None,None,'Moscow','RU',None,None,None,None,'Arms Exporter','CONSOLIDATED','2022-02-28','High','Active','Russian arms exporter'),
    (source_map.get('OFAC',1),'EXT-OFAC-005','Entity','Bank Mellat',None,None,'Tehran','IR',None,None,None,None,'Bank','SDN','2012-02-06','Critical','Active','Iranian state bank'),
    (source_map.get('UN',3),'EXT-UN-002','Entity','Haqqani Network',None,None,'Khost','AF',None,None,None,None,'Terrorist Organization','AQIS','2012-09-07','Critical','Active','Afghan terrorist network'),
    (source_map.get('OFAC',1),'EXT-OFAC-006','Vessel','MV IRAN SHAHED',None,None,'Bandar Abbas','IR',None,None,None,None,'Oil Tanker','SDN','2019-05-10','High','Active','Iranian oil tanker, sanctions evasion'),
    (source_map.get('OFAC',1),'EXT-OFAC-007','Individual','Hassan Nasrallah',None,'1960-08-31','Beirut','LB','LB99887766',None,'Male','Sheikh','Secretary-General','SDN','2013-06-21','Critical','Active','Hezbollah Secretary-General'),
    (source_map.get('OFAC',1),'EXT-OFAC-008','Individual','Bashar Hafez al-Assad',None,'1965-09-11','Damascus','SY','SY11223344',None,'Male','President','Head of State','SDN','2011-05-18','Critical','Active','Syrian President'),
    (source_map.get('EU',2),'EXT-EU-003','Individual','Ramzan Akhmadovich Kadyrov',None,'1976-10-05','Grozny','RU','RU44556677',None,'Male','Mr','Head of Republic','CONSOLIDATED','2022-03-15','High','Active','Head of Chechen Republic'),
    (source_map.get('UK',4),'EXT-UK-001','Individual','Alexei Borisovich Mordashov',None,'1965-09-26','St Petersburg','RU','RU66778899',None,'Male','Mr','Businessman','OFSI','2022-03-01','High','Active','Russian steel oligarch'),
    (source_map.get('OFAC',1),'EXT-OFAC-009','Individual','Gennady Timchenko',None,'1952-11-09','Geneva','CH','CH11223344',None,'Male','Mr','Businessman','SDN','2014-03-20','High','Active','Putin associate, energy sector'),
    (source_map.get('OFAC',1),'EXT-OFAC-010','Entity','Islamic Revolutionary Guard Corps',None,None,'Tehran','IR',None,None,None,None,'Military Organization','SDN','2007-10-25','Critical','Active','Iranian military organization'),
    (source_map.get('EU',2),'EXT-EU-004','Entity','Gazprombank',None,None,'Moscow','RU',None,None,None,None,'Bank','CONSOLIDATED','2022-06-03','High','Active','Russian state bank'),
    (source_map.get('UK',4),'EXT-UK-002','Entity','VTB Bank',None,None,'Moscow','RU',None,None,None,None,'Bank','OFSI','2022-02-24','High','Active','Russian state-owned bank'),
    (source_map.get('SECO',5),'EXT-SECO-001','Entity','Sberbank',None,None,'Moscow','RU',None,None,None,None,'Bank','SECO_LIST','2022-03-01','High','Active','Russian state bank'),
    (source_map.get('BIS',8),'EXT-BIS-001','Entity','Huawei Technologies Co Ltd',None,None,'Shenzhen','CN',None,None,None,None,'Technology Company','ENTITY_LIST','2019-05-16','High','Active','Chinese telecom company'),
]
for e in named_entries:
    entries.append(e)

# Generate additional random entries
for i in range(180):
    src_code = random.choice(sources_list)
    src_id = source_map.get(src_code, 1)
    ext_id = f"EXT-{src_code}-{1000+i}"
    etype = random.choice(types_list)
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    name = f"{fn} {ln} {chr(65+i%26)}" if etype == 'Individual' else f"{fn} {random.choice(['Trading','Holdings','Corp','Ltd','Group'])} {chr(65+i%26)}"
    country = random.choice(countries_hi)
    dob = f"{random.randint(1950,1995)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}" if etype == 'Individual' else None
    program = random.choice(programs_list)
    risk = random.choice(risk_levels)
    status = random.choice(statuses)
    reason = random.choice(['Terrorism financing','Sanctions evasion','Weapons proliferation','Money laundering','Human rights violations','Cyber attacks','Drug trafficking','Nuclear program'])
    entries.append((src_id, ext_id, etype, name, None, dob, None, country, None, None, None, None, None, program, None, risk, status, reason))

insert_entry = """INSERT INTO sanctions_entries 
    (source_id,external_id,entry_type,primary_name,name_original_script,dob,pob,nationality,passport_number,national_id,gender,title,position,programme,listing_date,status,remarks)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
# Named entries have 19 fields, random have 18 - fix
fixed_entries = []
for e in entries:
    if len(e) == 19:
        fixed_entries.append(e[:17])  # drop risk_level for now
    else:
        fixed_entries.append(e)

exec_many(insert_entry, fixed_entries)

cur.execute("SELECT id, primary_name FROM sanctions_entries")
db_entries = cur.fetchall()
entry_ids = [r[0] for r in db_entries]
print(f"  Total entries: {len(entry_ids)}")

# ─── 3. Aliases ───────────────────────────────────────────────────────────
print("\n[3] Sanctions Aliases...")
aliases = []
alias_types = ['AKA','FKA','NFM','LOW_QUALITY']
lang_codes = ['en','ar','ru','zh','fa','fr']
for eid in entry_ids[:100]:
    for j in range(random.randint(1, 3)):
        fn = random.choice(first_names); ln = random.choice(last_names)
        aliases.append((eid, f"{fn} {ln}", random.choice(alias_types), random.choice(lang_codes)))
exec_many("INSERT INTO sanctions_aliases (entry_id,alias_name,alias_type,language_code) VALUES (%s,%s,%s,%s)", aliases)

# ─── 4. Identifiers ───────────────────────────────────────────────────────
print("\n[4] Sanctions Identifiers...")
id_types = ['PASSPORT','NATIONAL_ID','TAX_ID','COMPANY_REG','SWIFT_BIC','IMO_NUMBER']
identifiers = []
for eid in entry_ids[:120]:
    for j in range(random.randint(1, 2)):
        id_type = random.choice(id_types)
        id_num = f"{id_type[:3]}{random.randint(100000,999999)}"
        country = random.choice(countries_hi)
        identifiers.append((eid, id_type, id_num, country))
exec_many("INSERT INTO sanctions_identifiers (entry_id,id_type,id_number,issuing_country) VALUES (%s,%s,%s,%s)", identifiers)

# ─── 5. Addresses ─────────────────────────────────────────────────────────
print("\n[5] Sanctions Addresses...")
cities_map = {'IR':'Tehran','RU':'Moscow','SY':'Damascus','KP':'Pyongyang','IQ':'Baghdad','LB':'Beirut','YE':'Sanaa','AF':'Kabul','VE':'Caracas','BY':'Minsk'}
addresses = []
for eid in entry_ids[:100]:
    country = random.choice(countries_hi)
    city = cities_map.get(country, 'Unknown')
    addresses.append((eid, f"{random.randint(1,999)} Main Street", city, country, f"{random.randint(10000,99999)}"))
exec_many("INSERT INTO sanctions_addresses (entry_id,street,city,country_code,postal_code) VALUES (%s,%s,%s,%s,%s)", addresses)

# ─── 6. Countries ─────────────────────────────────────────────────────────
print("\n[6] Countries...")
exec_sql("DELETE FROM countries")
country_data = [
    ('AF','Afghanistan','AFG','Asia','High','High',1,'Taliban control, terrorism hub'),
    ('BY','Belarus','BLR','Europe','High','High',1,'Lukashenko regime, EU/US sanctions'),
    ('CU','Cuba','CUB','Americas','Medium','Medium',1,'US embargo'),
    ('IR','Iran','IRN','Middle East','Critical','Critical',1,'Nuclear program, IRGC'),
    ('IQ','Iraq','IRQ','Middle East','High','High',0,'Post-conflict, terrorism risk'),
    ('KP','North Korea','PRK','Asia','Critical','Critical',1,'Nuclear weapons, DPRK'),
    ('LB','Lebanon','LBN','Middle East','High','High',0,'Hezbollah presence'),
    ('LY','Libya','LBY','Africa','High','High',1,'Civil war, arms embargo'),
    ('MM','Myanmar','MMR','Asia','High','High',1,'Military coup, human rights'),
    ('RU','Russia','RUS','Europe','Critical','Critical',1,'Ukraine invasion, comprehensive sanctions'),
    ('SD','Sudan','SDN','Africa','High','High',1,'Conflict, human rights'),
    ('SY','Syria','SYR','Middle East','Critical','Critical',1,'Assad regime, chemical weapons'),
    ('VE','Venezuela','VEN','Americas','High','High',1,'Maduro regime, narcotics'),
    ('YE','Yemen','YEM','Middle East','High','High',1,'Houthi conflict'),
    ('ZW','Zimbabwe','ZWE','Africa','Medium','Medium',1,'Mnangagwa regime'),
    ('AE','UAE','ARE','Middle East','Low','Low',0,'Financial hub, transit risk'),
    ('CN','China','CHN','Asia','Medium','Low',0,'Technology controls, Xinjiang'),
    ('SA','Saudi Arabia','SAU','Middle East','Low','Low',0,'Regional partner'),
    ('US','United States','USA','Americas','Low','Low',0,'Primary sanctions authority'),
    ('GB','United Kingdom','GBR','Europe','Low','Low',0,'OFSI sanctions authority'),
    ('DE','Germany','DEU','Europe','Low','Low',0,'EU member state'),
    ('FR','France','FRA','Europe','Low','Low',0,'EU member state'),
    ('SG','Singapore','SGP','Asia','Low','Low',0,'MAS regulated jurisdiction'),
    ('AU','Australia','AUS','Oceania','Low','Low',0,'DFAT regulated jurisdiction'),
    ('CH','Switzerland','CHE','Europe','Low','Low',0,'SECO regulated jurisdiction'),
    ('JP','Japan','JPN','Asia','Low','Low',0,'METI regulated jurisdiction'),
    ('IN','India','IND','Asia','Low','Low',0,'Financial partner'),
    ('TR','Turkey','TUR','Europe','Medium','Medium',0,'Sanctions circumvention risk'),
    ('PK','Pakistan','PAK','Asia','High','Medium',0,'Terror financing risk'),
    ('NG','Nigeria','NGA','Africa','Medium','Medium',0,'Corruption, FATF grey list'),
    ('MA','Morocco','MAR','Africa','Low','Low',0,'North Africa partner'),
    ('KE','Kenya','KEN','Africa','Medium','Low',0,'East Africa hub'),
    ('MX','Mexico','MEX','Americas','Medium','Medium',0,'Narcotics risk'),
    ('ES','Spain','ESP','Europe','Low','Low',0,'EU member state'),
    ('CY','Cyprus','CYP','Europe','Medium','Medium',0,'Russian money flows'),
]
exec_many("INSERT INTO countries (iso2,country_name,iso3,region,risk_level,sanctions_risk,is_sanctioned,notes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", country_data)

# ─── 7. Core Customers ────────────────────────────────────────────────────
print("\n[7] Core Customers...")
exec_sql("DELETE FROM core_transactions")
exec_sql("DELETE FROM core_liabilities")
exec_sql("DELETE FROM core_assets")
exec_sql("DELETE FROM core_accounts")
exec_sql("DELETE FROM core_corporate_customers")
exec_sql("DELETE FROM core_customers")

customers = [
    ('CUST001','Individual','Mr','Ahmed','Al-Farsi','Ahmed Al-Farsi','1975-06-15','Male','AE','AE','Passport','P12345678','2030-01-01',None,'ahmed.alfarsi@email.com','+971501234567','+971501234567','123 Sheikh Zayed Rd',None,'Dubai',None,'00000','AE','Banker',None,250000.00,'Verified','2024-01-15','2027-01-15','Low',0,'CLEAR','2024-01-15','James Smith','Premium','Active','2024-01-15','Retail banking customer'),
    ('CUST002','Individual','Ms','Sarah','Johnson','Sarah Johnson','1985-03-22','Female','US','US','Passport','US98765432','2029-06-01',None,'sarah.j@email.com','+12125551234','+12125551234','456 Park Ave',None,'New York',None,'10001','US','Attorney',None,180000.00,'Verified','2023-06-01','2026-06-01','Low',0,'CLEAR','2024-01-10','Jane Doe','Standard','Active','2023-06-01','Premium banking customer'),
    ('CUST003','Individual','Mr','Mohammed','Al-Rashidi','Mohammed Al-Rashidi','1968-11-30','Male','IQ','IQ','Passport','IQ11223344','2026-12-31',None,'m.rashidi@email.com','+9647701234567','+9647701234567','789 Al-Rashid St',None,'Baghdad',None,'10001','IQ','Businessman',None,500000.00,'Pending','2024-01-20','2027-01-20','High',0,'POTENTIAL_MATCH','2024-01-20','Bob Wilson','High Risk','Review','2024-01-20','High risk - country of origin, name similarity'),
    ('CUST004','Individual','Ms','Elena','Petrovskaya','Elena Petrovskaya','1990-07-14','Female','RU','RU','Passport','RU55667788','2028-07-14',None,'elena.p@email.com','+74951234567','+74951234567','10 Tverskaya St',None,'Moscow',None,'125009','RU','Executive',None,300000.00,'Pending','2024-02-01','2027-02-01','High',0,'POTENTIAL_MATCH','2024-02-01','Bob Wilson','High Risk','Review','2024-02-01','Russian national - enhanced due diligence'),
    ('CUST005','Individual','Mr','Chen','Wei','Chen Wei','1982-09-05','Male','CN','SG','Passport','CN99887766','2027-09-05',None,'chen.wei@email.com','+6591234567','+6591234567','25 Marina Bay',None,'Singapore',None,'018956','SG','Engineer',None,120000.00,'Verified','2023-03-15','2026-03-15','Low',0,'CLEAR','2024-01-05','Alice Brown','Standard','Active','2023-03-15','Singapore resident'),
    ('CUST006','Individual','Ms','Fatima','Zahra','Fatima Zahra','1979-12-20','Female','MA','GB','Passport','MA44556677','2027-12-20',None,'fatima.z@email.com','+447712345678','+447712345678','22 Baker Street',None,'London',None,'W1U 3BW','GB','Teacher',None,45000.00,'Verified','2023-09-01','2026-09-01','Medium',0,'CLEAR','2024-01-08','Jane Doe','Standard','Active','2023-09-01','UK resident, Moroccan national'),
    ('CUST007','Individual','Mr','Viktor','Sokolov','Viktor Sokolov','1965-04-18','Male','RU','CY','Passport','RU22334455','2026-04-18',None,'viktor.s@email.com','+35799123456','+35799123456','5 Makarios Ave',None,'Nicosia',None,'1065','CY','Investor',None,5000000.00,'Pending','2024-01-25','2027-01-25','High',1,'POTENTIAL_MATCH','2024-01-25','Bob Wilson','VIP','Review','2024-01-25','Russian oligarch network - PEP'),
    ('CUST008','Individual','Ms','Aisha','Hassan','Aisha Hassan','1992-08-25','Female','SO','KE','National ID','KE12345678','2028-08-25',None,'aisha.h@email.com','+254712345678','+254712345678','15 Kenyatta Ave',None,'Nairobi',None,'00100','KE','Nurse',None,25000.00,'Verified','2023-11-01','2026-11-01','Medium',0,'CLEAR','2024-01-12','Alice Brown','Standard','Active','2023-11-01','Kenyan resident'),
    ('CUST009','Individual','Mr','James','Williams','James Williams','1978-01-10','Male','US','US','Drivers License','DL98765432','2027-01-10',None,'james.w@email.com','+13105551234','+13105551234','789 Sunset Blvd',None,'Los Angeles',None,'90028','US','Actor',None,200000.00,'Verified','2023-05-20','2026-05-20','Low',0,'CLEAR','2024-01-03','Jane Doe','Standard','Active','2023-05-20','Retail customer'),
    ('CUST010','Individual','Mr','Hiroshi','Tanaka','Hiroshi Tanaka','1970-05-28','Male','JP','JP','Passport','JP11223344','2027-05-28',None,'h.tanaka@email.com','+81312345678','+81312345678','1-1 Marunouchi',None,'Tokyo',None,'100-0005','JP','Executive',None,350000.00,'Verified','2023-07-15','2026-07-15','Low',0,'CLEAR','2024-01-06','James Smith','Premium','Active','2023-07-15','Japanese corporate executive'),
    ('CUST011','Individual','Mr','Omar','Al-Houthi','Omar Al-Houthi','1985-02-14','Male','YE','YE','Passport','YE99887766','2026-02-14',None,'omar.h@email.com','+9671234567','+9671234567','45 Al-Houthi St',None,'Sanaa',None,'00000','YE','Unknown',None,0.00,'Rejected','2024-01-30','2024-01-30','Critical',0,'BLOCKED','2024-01-30','Bob Wilson','Blocked','Blocked','2024-01-30','BLOCKED - Name match Houthi connection'),
    ('CUST012','Individual','Ms','Natasha','Ivanova','Natasha Ivanova','1988-10-03','Female','RU','DE','Passport','RU33445566','2027-10-03',None,'natasha.i@email.com','+4930123456','+4930123456','10 Unter den Linden',None,'Berlin',None,'10117','DE','Designer',None,65000.00,'Verified','2023-08-10','2026-08-10','Medium',0,'CLEAR','2024-01-09','Jane Doe','Standard','Active','2023-08-10','Russian expat, Germany resident'),
    ('CUST013','Individual','Mr','Carlos','Rodriguez','Carlos Rodriguez','1975-07-19','Male','MX','MX','Passport','MX77889900','2027-07-19',None,'carlos.r@email.com','+5255123456','+5255123456','25 Reforma Ave',None,'Mexico City',None,'06600','MX','Businessman',None,150000.00,'Verified','2023-04-05','2026-04-05','Medium',0,'CLEAR','2024-01-07','Alice Brown','Standard','Active','2023-04-05','Business owner'),
    ('CUST014','Individual','Ms','Priya','Sharma','Priya Sharma','1991-03-08','Female','IN','IN','Passport','IN55667788','2028-03-08',None,'priya.s@email.com','+911234567890','+911234567890','100 MG Road',None,'Mumbai',None,'400001','IN','Engineer',None,80000.00,'Verified','2023-10-20','2026-10-20','Low',0,'CLEAR','2024-01-04','Alice Brown','Standard','Active','2023-10-20','IT professional'),
    ('CUST015','Individual','Mr','Abdullah','Al-Saud','Abdullah Al-Saud','1960-11-22','Male','SA','SA','Passport','SA11223344','2026-11-22',None,'a.saud@email.com','+966501234567','+966501234567','1 King Fahd Road',None,'Riyadh',None,'11564','SA','Prince',None,10000000.00,'Verified','2023-02-14','2026-02-14','Low',1,'CLEAR','2024-01-11','James Smith','VIP','Active','2023-02-14','Saudi royal family - PEP'),
    ('CUST016','Individual','Ms','Yuki','Nakamura','Yuki Nakamura','1983-06-30','Female','JP','AU','Passport','JP44556677','2027-06-30',None,'yuki.n@email.com','+61412345678','+61412345678','50 George St',None,'Sydney',None,'2000','AU','Architect',None,110000.00,'Verified','2023-12-01','2026-12-01','Low',0,'CLEAR','2024-01-13','Alice Brown','Standard','Active','2023-12-01','Japan-Australia dual resident'),
    ('CUST017','Individual','Mr','Ivan','Volkov','Ivan Volkov','1972-09-15','Male','RU','RU','Passport','RU88990011','2026-09-15',None,'ivan.v@email.com','+74991234567','+74991234567','5 Nevsky Prospect',None,'St Petersburg',None,'190000','RU','Oligarch',None,2000000.00,'Pending','2024-01-28','2027-01-28','High',0,'POTENTIAL_MATCH','2024-01-28','Bob Wilson','High Risk','Review','2024-01-28','Possible sanctions connection'),
    ('CUST018','Individual','Ms','Maria','Garcia','Maria Garcia','1986-04-25','Female','ES','ES','Passport','ES22334455','2028-04-25',None,'maria.g@email.com','+34912345678','+34912345678','10 Gran Via',None,'Madrid',None,'28013','ES','Teacher',None,40000.00,'Verified','2023-07-01','2026-07-01','Low',0,'CLEAR','2024-01-02','Jane Doe','Standard','Active','2023-07-01','Spanish national'),
    ('CUST019','Individual','Mr','Ali','Khani','Ali Khani','1977-08-12','Male','IR','TR','Passport','IR66778899','2026-08-12',None,'ali.k@email.com','+905301234567','+905301234567','15 Istiklal Caddesi',None,'Istanbul',None,'34430','TR','Trader',None,200000.00,'Pending','2024-01-22','2027-01-22','High',0,'POTENTIAL_MATCH','2024-01-22','Bob Wilson','High Risk','Review','2024-01-22','Iranian national, Turkey resident'),
    ('CUST020','Individual','Ms','Sophie','Dubois','Sophie Dubois','1994-01-17','Female','FR','FR','Passport','FR00112233','2028-01-17',None,'sophie.d@email.com','+33123456789','+33123456789','25 Champs-Elysees',None,'Paris',None,'75008','FR','Student',None,20000.00,'Verified','2024-01-01','2027-01-01','Low',0,'CLEAR','2024-01-01','Jane Doe','Standard','Active','2024-01-01','French national'),
]
exec_many("""INSERT INTO core_customers 
    (customer_id,customer_type,title,first_name,last_name,full_name,date_of_birth,gender,nationality,country_of_residence,id_type,id_number,id_expiry,tax_id,email,phone,mobile,address_line1,address_line2,city,state,postal_code,country,occupation,employer,annual_income,kyc_status,kyc_date,kyc_expiry,risk_rating,pep_status,sanctions_status,last_screened,relationship_manager,segment,status,onboarding_date,notes)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", customers)

# ─── 8. Corporate Customers ───────────────────────────────────────────────
print("\n[8] Corporate Customers...")
exec_sql("DELETE FROM core_corporate_customers")
corporates = [
    ('CORP001','Al-Farsi Trading LLC','LLC','AE','TRN123456789','AE12345678','Active','Low','Trade finance, import/export'),
    ('CORP002','Global Tech Solutions Inc','Corporation','US','EIN987654321','US98765432','Active','Low','Technology services'),
    ('CORP003','Eastern Energy Corp','Corporation','RU','INN123456789','RU11223344','Review','High','Russian energy company'),
    ('CORP004','Silk Road Import Export','LLC','CN','USCC123456','CN99887766','Active','Medium','China-UAE trade'),
    ('CORP005','Mediterranean Shipping Co','Corporation','GR','GR123456789','GR55667788','Active','Low','Shipping and logistics'),
    ('CORP006','Tehran Trading House','LLC','IR','IR123456789','IR44556677','Blocked','Critical','Iranian entity - OFAC match'),
    ('CORP007','Dubai Financial Services','LLC','AE','TRN987654321','AE22334455','Active','Low','Financial services'),
    ('CORP008','Black Sea Resources Ltd','LLC','CY','CY123456789','CY11223344','Review','High','Cyprus-Russia connection'),
    ('CORP009','Pacific Rim Holdings','Corporation','SG','UEN123456789','SG99887766','Active','Low','Singapore holding company'),
    ('CORP010','Sahel Mining Corp','Corporation','ML','ML123456789','ML55667788','Review','Medium','West Africa mining'),
]
exec_many("INSERT INTO core_corporate_customers (company_number,company_name,company_type,country_of_incorporation,tax_id,registration_number,status,risk_rating,business_description) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", corporates)

# ─── 9. Core Accounts ─────────────────────────────────────────────────────
print("\n[9] Core Accounts...")
cur.execute("SELECT id FROM core_customers ORDER BY id")
all_cust_ids = [r[0] for r in cur.fetchall()]
acc_types = ['Current','Savings','Fixed Deposit','Investment','Nostro','Vostro']
currencies = ['USD','EUR','GBP','AED','SGD','JPY','AUD']
accounts = []
acc_num = 1000
for cid in all_cust_ids:
    for j in range(random.randint(1, 3)):
        acc_num += 1
        an = f"ACC{acc_num:06d}"
        at = random.choice(acc_types)
        cur_c = random.choice(currencies)
        bal = round(random.uniform(1000, 5000000), 2)
        avail = round(bal * random.uniform(0.8, 1.0), 2)
        status = random.choice(['Active','Active','Active','Dormant','Frozen'])
        iban = f"AE{random.randint(10,99)}{random.randint(1000000000,9999999999)}"
        swift = f"NBAD{random.choice(['AE','US','GB','SG'])}XX"
        sanctions_hold = 1 if status == 'Frozen' else 0
        accounts.append((an, cid, at, 'Personal', cur_c, bal, avail, 0, 0, 0, status, None, datetime.now().strftime('%Y-%m-%d'), None, 'MAIN', 'Main Branch', iban, swift, sanctions_hold, 'Sanctions hold' if sanctions_hold else None, None))
exec_many("INSERT INTO core_accounts (account_number,customer_id,account_type,account_category,currency,balance,available_balance,hold_amount,interest_rate,credit_limit,status,freeze_reason,opened_date,maturity_date,branch_code,branch_name,iban,swift_bic,sanctions_hold,sanctions_hold_reason,last_transaction_date) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", accounts)

# ─── 10. Core Assets ──────────────────────────────────────────────────────
print("\n[10] Core Assets...")
cur.execute("SELECT id FROM core_accounts ORDER BY id")
all_acc_ids = [r[0] for r in cur.fetchall()]
asset_types = ['Real Estate','Vehicle','Investment','Gold','Cryptocurrency','Bond','Equity','Art']
assets = []
for i, aid in enumerate(all_acc_ids[:35]):
    at = random.choice(asset_types)
    val = round(random.uniform(10000, 2000000), 2)
    cur_c = random.choice(currencies)
    assets.append((aid, at, f"{at} Asset {i+1}", val, cur_c, 'Active'))
exec_many("INSERT INTO core_assets (account_id,asset_type,asset_name,current_value,currency,status) VALUES (%s,%s,%s,%s,%s,%s)", assets)

# ─── 11. Core Liabilities ─────────────────────────────────────────────────
print("\n[11] Core Liabilities...")
liab_types = ['Mortgage','Car Loan','Personal Loan','Credit Card','Overdraft','Trade Finance']
liabilities = []
for i, aid in enumerate(all_acc_ids[:30]):
    lt = random.choice(liab_types)
    amt = round(random.uniform(5000, 500000), 2)
    cur_c = random.choice(currencies)
    rate = round(random.uniform(2.5, 12.0), 2)
    liabilities.append((aid, lt, f"{lt} {i+1}", amt, cur_c, rate, 'Active'))
exec_many("INSERT INTO core_liabilities (account_id,liability_type,description,outstanding_balance,currency,interest_rate,status) VALUES (%s,%s,%s,%s,%s,%s,%s)", liabilities)

# ─── 12. Core Transactions ────────────────────────────────────────────────
print("\n[12] Core Transactions (500 records)...")
tx_types = ['Wire Transfer','SWIFT','ACH','Trade Payment','Cash Deposit','Withdrawal','FX Conversion','SEPA']
tx_statuses = ['Completed','Completed','Completed','Pending','Flagged','Blocked']
tx_cats = ['International','Domestic','Trade Finance','Investment','Retail']
beneficiaries = ['Al-Rashidi Trading','Global Tech','Eastern Energy','Silk Road','Mediterranean Shipping','Tehran Trading','Dubai Financial','Pacific Rim','Sahel Mining','Black Sea Resources','Mahan Air','Rosoboronexport']
transactions = []
for i in range(500):
    from_acc = random.choice(all_acc_ids)
    tx_type = random.choice(tx_types)
    amount = round(random.uniform(100, 500000), 2)
    cur_c = random.choice(currencies)
    rate = round(random.uniform(0.8, 1.5), 4)
    amount_usd = round(amount * rate, 2)
    status = random.choice(tx_statuses)
    days_ago = random.randint(0, 180)
    tx_date = (datetime.now() - timedelta(days=days_ago)).strftime('%Y-%m-%d %H:%M:%S')
    ref = f"TXN{i+1:06d}"
    bene = random.choice(beneficiaries)
    bene_country = random.choice(countries_hi + ['US','GB','DE','SG','AE'])
    orig_country = random.choice(['US','GB','AE','SG','DE'])
    screened = 1 if random.random() > 0.3 else 0
    screen_result = random.choice(['CLEAR','CLEAR','CLEAR','POTENTIAL_MATCH','BLOCKED']) if screened else None
    transactions.append((f"TXN{i+1:010d}", from_acc, tx_type, random.choice(tx_cats), amount, cur_c, rate, amount_usd, f"Payment to {bene}", ref, bene, f"ACCT{random.randint(100000,999999)}", f"SWIFT{random.randint(1000,9999)}", bene_country, orig_country, bene_country, 'Online', status, screened, screen_result, None, tx_date, tx_date))
exec_many("INSERT INTO core_transactions (transaction_id,account_id,transaction_type,transaction_category,amount,currency,exchange_rate,amount_usd,description,reference_number,counterparty_name,counterparty_account,counterparty_bank,counterparty_country,originating_country,destination_country,channel,status,sanctions_screened,sanctions_result,screening_request_id,value_date,transaction_date) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", transactions)

# ─── 13. Screening Requests ───────────────────────────────────────────────
print("\n[13] Screening Requests...")
exec_sql("DELETE FROM screening_matches")
exec_sql("DELETE FROM screening_alerts")
exec_sql("DELETE FROM screening_requests")
screen_types = ['Customer Onboarding','Transaction','Periodic Review','Batch','Manual']
screen_statuses = ['Clear','Potential Match','Blocked','In Review']
screen_reqs = []
for i in range(100):
    name = f"{random.choice(first_names)} {random.choice(last_names)}"
    etype = random.choice(['Individual','Entity','Vessel'])
    stype = random.choice(screen_types)
    status = random.choice(screen_statuses)
    score = random.randint(0, 100)
    source = random.choice(['OFAC','EU','UN','UK','ALL'])
    created = (datetime.now() - timedelta(days=random.randint(0, 90))).strftime('%Y-%m-%d %H:%M:%S')
    screen_reqs.append((f"SCR{i+1:06d}", name, etype, stype, status, score, source, created))
exec_many("INSERT INTO screening_requests (request_id,subject_name,entity_type,screening_type,status,match_score,source_list,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", screen_reqs)

# ─── 14. Screening Alerts ─────────────────────────────────────────────────
print("\n[14] Screening Alerts...")
cur.execute("SELECT id FROM screening_requests ORDER BY id")
req_ids = [r[0] for r in cur.fetchall()]
alert_types = ['Sanctions Match','Watchlist Hit','Country Risk','Transaction Risk','PEP Match','Adverse Media']
alert_statuses = ['New','Acknowledged','In Review','Resolved','Escalated']
alerts = []
for i in range(80):
    atype = random.choice(alert_types)
    status = random.choice(alert_statuses)
    severity = random.choice(['Low','Medium','High','Critical'])
    subject = f"{random.choice(first_names)} {random.choice(last_names)}"
    req_id = random.choice(req_ids) if req_ids else None
    score = random.randint(50, 100)
    source = random.choice(['OFAC','EU','UN','UK','SECO','DFAT','MAS'])
    created = (datetime.now() - timedelta(days=random.randint(0, 60))).strftime('%Y-%m-%d %H:%M:%S')
    due = (datetime.now() + timedelta(days=random.randint(1, 14))).strftime('%Y-%m-%d')
    alerts.append((f"ALT{i+1:06d}", req_id, None, None, atype, severity, f"{atype}: {subject}", f"Alert generated for {subject} - {atype}", status, random.choice(['jsmith','jdoe','bwilson','abrown']), due, None, None, created))
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
    due = (datetime.now() + timedelta(days=random.randint(-10, 30))).strftime('%Y-%m-%d')
    cases.append((case_num, ctype, None, subject, stype, priority, status, analyst, officer, f"Case regarding {subject} - {ctype}", None, None, 0, None, 0, 0, created, None, due))
exec_many("INSERT INTO cases (case_number,case_type,alert_id,subject_name,subject_type,priority,status,assigned_analyst,supervising_officer,description,decision,decision_rationale,sar_filed,sar_reference,blocked_property_reported,regulatory_disclosure,opened_at,closed_at,sla_due_date) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", cases)

# ─── 16. Screening Rules ──────────────────────────────────────────────────
print("\n[16] Screening Rules...")
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
]
exec_many("INSERT INTO internal_watchlist (watchlist_type,entity_type,entity_name,aliases,dob,nationality,country,reason,source,risk_level,added_by,review_date,status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", watchlist)

# ─── 18. Trade Finance ────────────────────────────────────────────────────
print("\n[18] Trade Finance...")
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
    issued = (datetime.now() - timedelta(days=random.randint(0, 365))).strftime('%Y-%m-%d')
    expiry = (datetime.now() + timedelta(days=random.randint(30, 180))).strftime('%Y-%m-%d')
    ship_date = (datetime.now() + timedelta(days=random.randint(15, 90))).strftime('%Y-%m-%d')
    goods = random.choice(['Electronics','Machinery','Chemicals','Textiles','Food Products','Oil Products','Steel','Pharmaceuticals'])
    screen_status = random.choice(['Clear','Pending','Flagged'])
    tf_records.append((lc_num, 'Irrevocable', None, applicant, bene, bene_country, 'NBAD AE', 'Citi US', 'NBAD AE', amount, cur_c, expiry, ship_date, origin, dest, None, goods, None, None, None, 'CIF', status, screen_status, None))
exec_many("INSERT INTO trade_finance_lc (lc_number,lc_type,applicant_id,applicant_name,beneficiary_name,beneficiary_country,advising_bank,confirming_bank,issuing_bank,amount,currency,expiry_date,latest_shipment_date,port_of_loading,port_of_discharge,transshipment_ports,goods_description,hs_codes,vessel_name,imo_number,incoterms,status,sanctions_status,screening_request_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", tf_records)

# ─── 19. Vessels ──────────────────────────────────────────────────────────
print("\n[19] Vessels...")
exec_sql("DELETE FROM vessels")
vessel_types = ['Tanker','Container','Bulk Carrier','General Cargo','Passenger','Fishing','Naval']
vessel_flags = ['IR','RU','KP','SY','VE','PA','LR','MH','BS','CY']
risk_levels_v = ['Low','Medium','High','Critical']
vessels_data = []
vessel_names = ['IRAN SHAHED','NORD STREAM PIONEER','DALI STAR','GRACE 1','ADMIRAL KUZNETSOV','PERSIAN GULF STAR','BLACK SEA TRADER','PACIFIC HORIZON','ATLANTIC EAGLE','EASTERN DRAGON']
for i in range(40):
    imo = f"9{random.randint(100000,999999)}"
    if i < len(vessel_names):
        name = f"MV {vessel_names[i]}"
    else:
        name = f"MV {random.choice(['STAR','EAGLE','FALCON','DRAGON','TIGER','LION','PHOENIX'])} {chr(65+i%26)}"
    vtype = random.choice(vessel_types)
    flag = random.choice(vessel_flags)
    flag_code = flag
    gt = random.randint(5000, 200000)
    year = random.randint(1990, 2020)
    owner = random.choice(['Iranian Shipping Lines','Black Sea Shipping','Pacific Maritime','Atlantic Carriers','Eastern Fleet','IRISL Group','Sovcomflot'])
    operator = owner
    call_sign = f"{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=4))}"
    mmsi = str(random.randint(100000000, 999999999))
    is_sanctioned = 1 if flag in ['IR','KP','SY'] else 0
    risk = random.choice(risk_levels_v)
    vessels_data.append((imo, name, vtype, flag, flag_code, gt, year, owner, operator, owner, call_sign, mmsi, is_sanctioned, None, None, None, risk, f"Vessel monitoring - {vtype}"))
exec_many("INSERT INTO vessels (imo_number,vessel_name,vessel_type,flag_state,flag_country_code,gross_tonnage,year_built,owner_name,operator_name,manager_name,call_sign,mmsi,is_sanctioned,sanctions_entry_id,last_known_port,last_known_position,risk_rating,notes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", vessels_data)

# ─── 20. App Users ────────────────────────────────────────────────────────
print("\n[20] App Users...")
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

# ─── 21. Audit Log ────────────────────────────────────────────────────────
print("\n[21] Audit Log...")
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

# ─── 22. Reports ──────────────────────────────────────────────────────────
print("\n[22] Reports...")
exec_sql("DELETE FROM reports")
report_types = ['Sanctions Screening','Compliance Summary','Risk Report','Audit Trail','Customer Risk','Transaction Monitoring','Regulatory']
report_statuses = ['Generated','Pending','Failed','Scheduled']
reports = []
for i in range(20):
    rtype = random.choice(report_types)
    status = random.choice(report_statuses)
    created = (datetime.now() - timedelta(days=random.randint(0, 90))).strftime('%Y-%m-%d %H:%M:%S')
    params = '{"period":"monthly","format":"PDF"}'
    reports.append((f"RPT{2024000+i+1}", rtype, f"{rtype} - {datetime.now().strftime('%Y-%m')}", random.choice(['jsmith','jdoe','admin']), params, status, None, 0, created))
exec_many("INSERT INTO reports (report_id,report_type,report_name,generated_by,parameters,status,file_path,row_count,generated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", reports)

# ─── 23. Scrape Run History ───────────────────────────────────────────────
print("\n[23] Scrape Run History...")
exec_sql("DELETE FROM scrape_run_history")
scrape_runs = []
for src_code, src_id in source_map.items():
    for i in range(5):
        started = (datetime.now() - timedelta(days=i*3, hours=random.randint(0,12))).strftime('%Y-%m-%d %H:%M:%S')
        completed = (datetime.now() - timedelta(days=i*3, hours=random.randint(0,11))).strftime('%Y-%m-%d %H:%M:%S')
        duration_s = random.randint(30, 280)
        downloaded = random.randint(1000, 50000)
        added = random.randint(0, 50)
        updated = random.randint(0, 20)
        deleted = random.randint(0, 5)
        status = random.choice(['Completed','Completed','Completed','Failed'])
        scrape_runs.append((f"RUN{src_code}{i+1:04d}", src_id, started, completed, status, downloaded, added, updated, deleted, None if status == 'Completed' else 'Connection timeout', None, None))
exec_many("INSERT INTO scrape_run_history (run_id,source_id,started_at,completed_at,status,records_downloaded,records_added,records_updated,records_deleted,error_message,file_path,file_hash) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", scrape_runs)

print("\n=== Summary ===")
summary_tables = ['sanctions_entries','sanctions_aliases','sanctions_identifiers','core_customers','core_accounts','core_transactions','cases','screening_alerts','screening_requests','trade_finance_lc','vessels','app_users','countries','audit_log','internal_watchlist','screening_rules']
for t in summary_tables:
    try:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        count = cur.fetchone()[0]
        print(f"  {t}: {count} rows")
    except Exception as e:
        print(f"  {t}: ERROR - {e}")

conn.close()
print("\n=== Demo Data Population Complete! ===")
