#!/usr/bin/env python3
"""
Database initialization script for Sanctions Engine
Creates all tables and populates with demo data
"""

import pymssql
import sys
import os

# Database connection config
DB_CONFIG = {
    'server': '203.101.44.46',
    'user': 'shahul',
    'password': 'Apple123!@#',
    'database': 'sanctions',
    'timeout': 30
}

def get_connection():
    return pymssql.connect(**DB_CONFIG)

def execute_sql_file(conn, filepath):
    """Execute a SQL file, splitting on GO statements"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split on GO statements or semicolons for SQL Server
    # Remove comments
    lines = []
    for line in content.split('\n'):
        stripped = line.strip()
        if not stripped.startswith('--'):
            lines.append(line)
    
    sql_content = '\n'.join(lines)
    
    # Split statements by semicolon
    statements = [s.strip() for s in sql_content.split(';') if s.strip()]
    
    cursor = conn.cursor()
    success_count = 0
    error_count = 0
    
    for stmt in statements:
        if not stmt or stmt.startswith('--'):
            continue
        try:
            cursor.execute(stmt)
            conn.commit()
            success_count += 1
        except Exception as e:
            error_msg = str(e)
            # Ignore "already exists" errors
            if 'already exists' in error_msg.lower() or 'duplicate' in error_msg.lower():
                print(f"  [SKIP] Already exists: {stmt[:60]}...")
            else:
                print(f"  [ERROR] {error_msg[:100]}")
                print(f"  Statement: {stmt[:80]}...")
                error_count += 1
    
    return success_count, error_count

def drop_all_tables(conn):
    """Drop all existing tables in correct order"""
    cursor = conn.cursor()
    
    drop_order = [
        'audit_log', 'case_documents', 'case_notes', 'cases',
        'screening_alerts', 'screening_matches', 'screening_subjects',
        'screening_requests', 'trade_finance_lc', 'core_transactions',
        'core_liabilities', 'core_assets', 'core_accounts',
        'core_corporate_customers', 'core_customers',
        'internal_watchlist', 'screening_rules', 'reports', 'app_users',
        'vessels', 'sanctions_identifiers', 'sanctions_addresses',
        'sanctions_aliases', 'sanctions_change_log', 'scrape_run_history',
        'sanctions_entries', 'sanctions_list_sources', 'countries'
    ]
    
    for table in drop_order:
        try:
            cursor.execute(f"IF OBJECT_ID('{table}', 'U') IS NOT NULL DROP TABLE {table}")
            conn.commit()
            print(f"  Dropped: {table}")
        except Exception as e:
            print(f"  Could not drop {table}: {e}")

def main():
    print("=" * 60)
    print("SANCTIONS ENGINE - DATABASE INITIALIZATION")
    print("=" * 60)
    
    print("\n1. Connecting to SQL Server...")
    try:
        conn = get_connection()
        print("   Connected successfully!")
    except Exception as e:
        print(f"   ERROR: {e}")
        sys.exit(1)
    
    print("\n2. Dropping existing tables...")
    drop_all_tables(conn)
    
    schema_file = os.path.join(os.path.dirname(__file__), 'schema.sql')
    demo_file = os.path.join(os.path.dirname(__file__), 'demo_data.sql')
    
    print("\n3. Creating schema...")
    success, errors = execute_sql_file(conn, schema_file)
    print(f"   Schema: {success} statements executed, {errors} errors")
    
    print("\n4. Loading demo data...")
    success, errors = execute_sql_file(conn, demo_file)
    print(f"   Demo data: {success} statements executed, {errors} errors")
    
    print("\n5. Verifying tables...")
    cursor = conn.cursor()
    cursor.execute("""
        SELECT TABLE_NAME, 
               (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = t.TABLE_NAME) as col_count
        FROM INFORMATION_SCHEMA.TABLES t
        WHERE TABLE_TYPE='BASE TABLE' 
        ORDER BY TABLE_NAME
    """)
    tables = cursor.fetchall()
    print(f"   Created {len(tables)} tables:")
    for table in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table[0]}")
            row_count = cursor.fetchone()[0]
            print(f"   - {table[0]} ({table[1]} cols, {row_count} rows)")
        except:
            print(f"   - {table[0]} ({table[1]} cols)")
    
    conn.close()
    print("\n" + "=" * 60)
    print("DATABASE INITIALIZATION COMPLETE!")
    print("=" * 60)

if __name__ == '__main__':
    main()
