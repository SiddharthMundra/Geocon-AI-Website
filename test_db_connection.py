"""
Test database connection and initialize tables
Run this to verify your database connection works
"""

import os
from app import app
from database import db, init_db, User, Conversation, Message, Submission

# Set database URL
DATABASE_URL = "postgresql://test_aiwebsite_sql_user:x7FrVTKtQCs1C8kdOdWsAadnpChkX1bP@dpg-d5nccmje5dus73f2rcs0-a.oregon-postgres.render.com/test_aiwebsite_sql"
os.environ['DATABASE_URL'] = DATABASE_URL

if __name__ == '__main__':
    print("="*60)
    print("Testing Database Connection...")
    print("="*60)
    
    try:
        with app.app_context():
            # Test connection
            print("\n1. Testing database connection...")
            db.engine.connect()
            print("   [OK] Connection successful!")
            
            # Create tables
            print("\n2. Creating database tables...")
            db.create_all()
            print("   [OK] Tables created successfully!")
            
            # Verify tables exist
            print("\n3. Verifying tables...")
            from sqlalchemy import inspect
            inspector = inspect(db.engine)
            tables = inspector.get_table_names()
            print(f"   Found {len(tables)} tables:")
            for table in tables:
                print(f"     - {table}")
            
            # Test insert
            print("\n4. Testing database operations...")
            test_user = User.query.filter_by(email='test@geoconinc.com').first()
            if not test_user:
                test_user = User(email='test@geoconinc.com', name='Test User')
                db.session.add(test_user)
                db.session.commit()
                print("   [OK] Test user created!")
            else:
                print("   [OK] Test user already exists")
            
            print("\n" + "="*60)
            print("[SUCCESS] Database setup complete!")
            print("="*60)
            print("\nYour database is ready to use!")
            print("You can now run: python app.py")
            
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        print("\nTroubleshooting:")
        print("1. Check your internet connection")
        print("2. Verify the database URL is correct")
        print("3. Make sure the database is running on Render")
