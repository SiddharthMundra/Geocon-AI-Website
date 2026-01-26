"""
Reset Database Script
Wipes all data from the database and recreates tables with updated schema
USE WITH CAUTION - This will delete all data!
"""

from app import app
from database import db, User, Conversation, Message, Submission, AuditLog, Usage

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
            print("  ✓ Users table (id, email, name, created_at, last_login)")
            print("  ✓ Conversations table (id, user_id, title, created_at, updated_at, is_deleted)")
            print("  ✓ Messages table (id, conversation_id, role, content, created_at, message_metadata)")
            print("  ✓ Submissions table (references messages, includes prompt/response for admin)")
            print("  ✓ Usage table (token usage, latency, cost tracking)")
            print("  ✓ Audit logs table (admin access, security events)")
            print("  ✓ Proper indexes and relationships")
            print("\nYou can now start fresh with the application.")
            print("All conversations, messages, statistics, and metadata will be stored in SQL.")
            
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
