"""
Reset Database Script
Wipes all data from the database and recreates tables
USE WITH CAUTION - This will delete all data!
"""

from app import app
from database import db, User, Conversation, Message, Submission

if __name__ == '__main__':
    print("="*60)
    print("WARNING: This will DELETE ALL DATA from the database!")
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
            
            # Create all tables fresh
            print("Creating fresh tables...")
            db.create_all()
            
            print("\n" + "="*60)
            print("Database reset complete!")
            print("="*60)
            print("\nAll data has been deleted and tables recreated.")
            print("You can now start fresh with the application.")
            
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
