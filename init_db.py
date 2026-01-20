"""
Database initialization script
Run this once to create all database tables
"""

from app import app
from database import db, init_db

if __name__ == '__main__':
    print("Initializing database...")
    init_db(app)
    print("Database initialized successfully!")
    print("\nYou can now start your Flask app.")
