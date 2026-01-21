"""
Simple database connection test
Run this to verify your database connection works
"""

import os
import sys

# Set database URL
DATABASE_URL = "postgresql://test_aiwebsite_sql_user:x7FrVTKtQCs1C8kdOdWsAadnpChkX1bP@dpg-d5nccmje5dus73f2rcs0-a.oregon-postgres.render.com/test_aiwebsite_sql"

print("="*60)
print("Testing Database Connection")
print("="*60)

# Test 1: Check if psycopg2 can be imported
print("\n1. Testing psycopg2 import...")
try:
    import psycopg2
    print("   [OK] psycopg2 imported successfully")
    print(f"   Version: {psycopg2.__version__}")
except ImportError as e:
    print(f"   [ERROR] Failed to import psycopg2: {e}")
    print("\n   Trying psycopg (newer version)...")
    try:
        import psycopg
        print("   [OK] psycopg imported successfully")
        print(f"   Version: {psycopg.__version__}")
    except ImportError as e2:
        print(f"   [ERROR] Failed to import psycopg: {e2}")
        sys.exit(1)

# Test 2: Test direct connection
print("\n2. Testing direct database connection...")
try:
    # Try psycopg2 first
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()
        print(f"   [OK] Connected to PostgreSQL")
        print(f"   Database version: {version[0][:50]}...")
        cursor.close()
        conn.close()
    except NameError:
        # Try psycopg (newer version)
        import psycopg
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT version();")
                version = cursor.fetchone()
                print(f"   [OK] Connected to PostgreSQL")
                print(f"   Database version: {version[0][:50]}...")
except Exception as e:
    print(f"   [ERROR] Connection failed: {e}")
    sys.exit(1)

# Test 3: Test SQLAlchemy
print("\n3. Testing SQLAlchemy connection...")
try:
    from sqlalchemy import create_engine, text
    
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        print("   [OK] SQLAlchemy connection successful")
        print(f"   Result: {result.fetchone()}")
except Exception as e:
    print(f"   [ERROR] SQLAlchemy connection failed: {e}")
    sys.exit(1)

print("\n" + "="*60)
print("[SUCCESS] All database tests passed!")
print("="*60)
print("\nYour database connection is working correctly.")
