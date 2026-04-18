#!/usr/bin/env python3
import pymssql

conn = pymssql.connect(server='203.101.44.46', user='shahul', password='Apple123!@#', database='sanctions', port=1433, autocommit=True)
cursor = conn.cursor()

# Create users table
cursor.execute("""
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(100) NOT NULL UNIQUE,
    full_name NVARCHAR(200) NOT NULL,
    email NVARCHAR(200) NOT NULL,
    role NVARCHAR(50) DEFAULT 'ANALYST',
    department NVARCHAR(100),
    status NVARCHAR(20) DEFAULT 'ACTIVE',
    last_login DATETIME,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
)
""")
print("Users table created/verified")

# Insert demo users
users = [
    ('admin', 'System Administrator', 'admin@sanctionsengine.com', 'ADMIN', 'IT', 'ACTIVE'),
    ('jsmith', 'John Smith', 'jsmith@sanctionsengine.com', 'SENIOR_ANALYST', 'Compliance', 'ACTIVE'),
    ('mwilliams', 'Mary Williams', 'mwilliams@sanctionsengine.com', 'ANALYST', 'Compliance', 'ACTIVE'),
    ('rjohnson', 'Robert Johnson', 'rjohnson@sanctionsengine.com', 'ANALYST', 'AML', 'ACTIVE'),
    ('sbrown', 'Sarah Brown', 'sbrown@sanctionsengine.com', 'SENIOR_ANALYST', 'Compliance', 'ACTIVE'),
    ('djones', 'David Jones', 'djones@sanctionsengine.com', 'ANALYST', 'Trade Finance', 'ACTIVE'),
    ('lmiller', 'Lisa Miller', 'lmiller@sanctionsengine.com', 'MANAGER', 'Compliance', 'ACTIVE'),
    ('twilson', 'Thomas Wilson', 'twilson@sanctionsengine.com', 'ANALYST', 'AML', 'ACTIVE'),
    ('amoore', 'Amanda Moore', 'amoore@sanctionsengine.com', 'ANALYST', 'Compliance', 'ACTIVE'),
    ('ctaylor', 'Christopher Taylor', 'ctaylor@sanctionsengine.com', 'SENIOR_ANALYST', 'Sanctions', 'ACTIVE'),
    ('panderson', 'Patricia Anderson', 'panderson@sanctionsengine.com', 'ANALYST', 'KYC', 'ACTIVE'),
    ('mthomas', 'Michael Thomas', 'mthomas@sanctionsengine.com', 'ANALYST', 'Trade Finance', 'ACTIVE'),
    ('bjackson', 'Barbara Jackson', 'bjackson@sanctionsengine.com', 'MANAGER', 'AML', 'ACTIVE'),
    ('wwhite', 'William White', 'wwhite@sanctionsengine.com', 'ANALYST', 'Compliance', 'INACTIVE'),
    ('eharris', 'Elizabeth Harris', 'eharris@sanctionsengine.com', 'SENIOR_ANALYST', 'Sanctions', 'ACTIVE'),
    ('jmartin', 'James Martin', 'jmartin@sanctionsengine.com', 'ANALYST', 'KYC', 'ACTIVE'),
    ('lthompson', 'Linda Thompson', 'lthompson@sanctionsengine.com', 'ANALYST', 'AML', 'ACTIVE'),
    ('cgarcia', 'Charles Garcia', 'cgarcia@sanctionsengine.com', 'SENIOR_ANALYST', 'Compliance', 'ACTIVE'),
    ('pmartinez', 'Patricia Martinez', 'pmartinez@sanctionsengine.com', 'ANALYST', 'Trade Finance', 'ACTIVE'),
    ('drobinson', 'Daniel Robinson', 'drobinson@sanctionsengine.com', 'MANAGER', 'Sanctions', 'ACTIVE'),
]

for u in users:
    try:
        cursor.execute("""
            IF NOT EXISTS (SELECT 1 FROM users WHERE username = %s)
            INSERT INTO users (username, full_name, email, role, department, status, last_login)
            VALUES (%s, %s, %s, %s, %s, %s, DATEADD(day, -%s, GETDATE()))
        """, (u[0], u[0], u[1], u[2], u[3], u[4], u[5], len(u[0])))
    except Exception as e:
        print(f"Error inserting user {u[0]}: {e}")

cursor.execute("SELECT COUNT(*) FROM users")
count = cursor.fetchone()[0]
print(f"Users table has {count} records")
conn.close()
print("Done!")
