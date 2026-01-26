"""
Reset Database Script
Wipes all data from the database and recreates tables with updated schema
USE WITH CAUTION - This will delete all data!
"""

from app import app
from database import db, User, Conversation, Message, Submission, AuditLog

if __name__ == '__main__':
    print("="*60)
    print("WARNING: This will DELETE ALL DATA from the database!")
    print("="*60)
    print("This will:")
    print("  - Drop all existing tables")
    print("  - Create fresh tables with updated schema")
    print("  - Include: is_deleted flag, proper message metadata, etc.")
    print("="*60)
    
    response = input("Are you sure you want to continue? Type 'YES' to confirm: ")
    
    if response != 'YES':
        print("Operation cancelled.")
        exit(0)
    
    print("\nResetting database...")
    
    try:
        with app.app_context():
            # Drop all tables
            print("Dropping all tables...")
            db.drop_all()
            print("  [OK] All tables dropped")
            
            # Create all tables fresh with new schema
            print("Creating fresh tables with updated schema...")
            db.create_all()
            print("  [OK] All tables created")
            
            # Verify tables
            from sqlalchemy import inspect
            inspector = inspect(db.get_engine())
            tables = inspector.get_table_names()
            print(f"\nCreated {len(tables)} tables:")
            for table in sorted(tables):
                print(f"  - {table}")
            
            print("\n" + "="*60)
            print("Database reset complete!")
            print("="*60)
            print("\nAll data has been deleted and tables recreated with:")
            print("  ✓ Conversations table with is_deleted (soft delete)")
            print("  ✓ Messages table with created_at and message_metadata")
            print("  ✓ Proper indexes and relationships")
            print("  ✓ Audit logs table")
            print("\nYou can now start fresh with the application.")
            print("All new conversations and messages will be stored in SQL.")
            
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
