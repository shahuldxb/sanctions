#!/usr/bin/env python3
"""
Sanctions Engine - Python Screening Microservice
Advanced fuzzy matching, phonetic matching, transliteration
"""

from flask import Flask, request, jsonify
import pymssql
import re
import unicodedata
from difflib import SequenceMatcher
import os
from datetime import datetime
import json

app = Flask(__name__)

DB_CONFIG = {
    'server': '203.101.44.46',
    'user': 'shahul',
    'password': 'Apple123!@#',
    'database': 'sanctions',
    'timeout': 30
}

def get_conn():
    return pymssql.connect(**DB_CONFIG)

def levenshtein_distance(s1, s2):
    """Calculate Levenshtein distance between two strings"""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    
    return previous_row[-1]

def similarity_score(s1, s2):
    """Calculate similarity score 0-100"""
    if not s1 or not s2:
        return 0
    s1 = s1.upper().strip()
    s2 = s2.upper().strip()
    
    if s1 == s2:
        return 100
    
    max_len = max(len(s1), len(s2))
    if max_len == 0:
        return 100
    
    dist = levenshtein_distance(s1, s2)
    score = round(((max_len - dist) / max_len) * 100)
    
    # Boost score if one contains the other
    if s1 in s2 or s2 in s1:
        shorter = min(len(s1), len(s2))
        longer = max(len(s1), len(s2))
        containment_score = round((shorter / longer) * 95)
        score = max(score, containment_score)
    
    return score

def soundex(name):
    """Generate Soundex code for phonetic matching"""
    if not name:
        return ''
    name = name.upper()
    codes = {'BFPV': '1', 'CGJKQSXYZ': '2', 'DT': '3', 'L': '4', 'MN': '5', 'R': '6'}
    
    result = name[0]
    prev_code = ''
    
    for char in name[1:]:
        code = ''
        for key, val in codes.items():
            if char in key:
                code = val
                break
        
        if code and code != prev_code:
            result += code
        prev_code = code
        
        if len(result) == 4:
            break
    
    return result.ljust(4, '0')

def phonetic_match(name1, name2):
    """Check if two names have similar phonetic codes"""
    s1 = soundex(name1)
    s2 = soundex(name2)
    return s1 == s2

def normalize_name(name):
    """Normalize name for comparison"""
    if not name:
        return ''
    # Remove diacritics
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    # Uppercase and remove extra spaces
    name = re.sub(r'\s+', ' ', name.upper().strip())
    # Remove common prefixes/suffixes
    name = re.sub(r'\b(MR|MRS|MS|DR|PROF|AL|BIN|ABU|UMM|SHEIKH|SHAIKH)\b', '', name)
    return name.strip()

def screen_name(name, dob=None, nationality=None, threshold=60):
    """Screen a name against all sanctions lists"""
    conn = get_conn()
    cursor = conn.cursor(as_dict=True)
    
    # Get all active entries
    cursor.execute("""
        SELECT e.id, e.primary_name, e.dob, e.nationality, e.programme, e.entry_type,
               s.source_code
        FROM sanctions_entries e
        LEFT JOIN sanctions_list_sources s ON e.source_id = s.id
        WHERE e.status = 'ACTIVE'
    """)
    entries = cursor.fetchall()
    
    # Get all aliases
    cursor.execute("""
        SELECT a.entry_id, a.alias_name, e.programme, s.source_code
        FROM sanctions_aliases a
        LEFT JOIN sanctions_entries e ON a.entry_id = e.id
        LEFT JOIN sanctions_list_sources s ON e.source_id = s.id
        WHERE e.status = 'ACTIVE'
    """)
    aliases = cursor.fetchall()
    conn.close()
    
    normalized_search = normalize_name(name)
    matches = []
    
    # Check primary names
    for entry in entries:
        normalized_entry = normalize_name(entry['primary_name'])
        score = similarity_score(normalized_search, normalized_entry)
        
        # Phonetic boost
        if phonetic_match(normalized_search, normalized_entry) and score < 75:
            score = max(score, 70)
        
        if score >= threshold:
            match_type = 'EXACT' if score == 100 else 'FUZZY'
            if phonetic_match(normalized_search, normalized_entry) and score < 85:
                match_type = 'PHONETIC'
            
            # DOB boost/penalty
            if dob and entry['dob']:
                if str(dob)[:4] == str(entry['dob'])[:4]:  # Year match
                    score = min(100, score + 5)
                else:
                    score = max(0, score - 10)
            
            # Nationality boost
            if nationality and entry['nationality']:
                if nationality.upper() == entry['nationality'].upper():
                    score = min(100, score + 5)
            
            matches.append({
                'entry_id': entry['id'],
                'entry_name': entry['primary_name'],
                'entry_type': entry['entry_type'],
                'score': score,
                'match_type': match_type,
                'matched_field': 'PRIMARY_NAME',
                'matched_value': entry['primary_name'],
                'list_source': entry['source_code'],
                'programme': entry['programme'],
                'dob': entry['dob'],
                'nationality': entry['nationality']
            })
    
    # Check aliases
    for alias in aliases:
        normalized_alias = normalize_name(alias['alias_name'])
        score = similarity_score(normalized_search, normalized_alias)
        
        if phonetic_match(normalized_search, normalized_alias) and score < 75:
            score = max(score, 68)
        
        if score >= threshold:
            existing = next((m for m in matches if m['entry_id'] == alias['entry_id']), None)
            if existing:
                if score > existing['score']:
                    existing['score'] = score
                    existing['match_type'] = 'ALIAS'
                    existing['matched_field'] = 'ALIAS'
                    existing['matched_value'] = alias['alias_name']
            else:
                matches.append({
                    'entry_id': alias['entry_id'],
                    'entry_name': alias['alias_name'],
                    'entry_type': 'UNKNOWN',
                    'score': score,
                    'match_type': 'ALIAS',
                    'matched_field': 'ALIAS',
                    'matched_value': alias['alias_name'],
                    'list_source': alias['source_code'],
                    'programme': alias['programme'],
                    'dob': None,
                    'nationality': None
                })
    
    # Sort by score descending
    matches.sort(key=lambda x: x['score'], reverse=True)
    return matches[:10]

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'Sanctions Screening Microservice', 'timestamp': datetime.now().isoformat()})

@app.route('/screen', methods=['POST'])
def screen():
    data = request.json
    name = data.get('name', '')
    dob = data.get('dob')
    nationality = data.get('nationality')
    threshold = data.get('threshold', 60)
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    
    matches = screen_name(name, dob, nationality, threshold)
    
    # Determine result
    if not matches:
        result = 'CLEAR'
    elif matches[0]['score'] >= 90:
        result = 'BLOCKED'
    elif matches[0]['score'] >= 65:
        result = 'POTENTIAL_MATCH'
    else:
        result = 'CLEAR'
    
    return jsonify({
        'name': name,
        'result': result,
        'top_score': matches[0]['score'] if matches else 0,
        'matches': matches,
        'screened_at': datetime.now().isoformat()
    })

@app.route('/batch-screen', methods=['POST'])
def batch_screen():
    data = request.json
    subjects = data.get('subjects', [])
    threshold = data.get('threshold', 60)
    
    results = []
    for subject in subjects:
        name = subject.get('name', '')
        if not name:
            continue
        
        matches = screen_name(name, subject.get('dob'), subject.get('nationality'), threshold)
        
        if not matches:
            result = 'CLEAR'
        elif matches[0]['score'] >= 90:
            result = 'BLOCKED'
        elif matches[0]['score'] >= 65:
            result = 'POTENTIAL_MATCH'
        else:
            result = 'CLEAR'
        
        results.append({
            'name': name,
            'result': result,
            'top_score': matches[0]['score'] if matches else 0,
            'match_count': len(matches),
            'top_match': matches[0] if matches else None
        })
    
    return jsonify({'results': results, 'total': len(results), 'screened_at': datetime.now().isoformat()})

@app.route('/phonetic-variants', methods=['POST'])
def phonetic_variants():
    """Generate phonetic variants of a name"""
    data = request.json
    name = data.get('name', '')
    
    variants = set()
    variants.add(name.upper())
    
    # Common substitutions for sanctions screening
    substitutions = [
        ('PH', 'F'), ('F', 'PH'),
        ('C', 'K'), ('K', 'C'),
        ('I', 'Y'), ('Y', 'I'),
        ('U', 'OO'), ('OO', 'U'),
        ('AH', 'A'), ('A', 'AH'),
        ('EI', 'AY'), ('AY', 'EI'),
        ('MOHAMMED', 'MOHAMMAD'), ('MOHAMMAD', 'MOHAMMED'),
        ('MUHAMMAD', 'MOHAMMED'), ('AHMED', 'AHMAD'),
        ('AHMAD', 'AHMED'), ('HUSSAIN', 'HUSSEIN'),
        ('HUSSEIN', 'HUSSAIN'), ('ALI', 'ALIE'),
    ]
    
    name_upper = name.upper()
    for old, new in substitutions:
        if old in name_upper:
            variants.add(name_upper.replace(old, new))
    
    return jsonify({'name': name, 'variants': list(variants), 'soundex': soundex(name)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
