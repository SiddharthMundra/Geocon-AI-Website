"""
Database models and setup for Geocon AI Website
Uses SQLAlchemy ORM with PostgreSQL
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()

# User Model
class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    # Relationships
    conversations = db.relationship('Conversation', backref='user', lazy=True, cascade='all, delete-orphan')
    submissions = db.relationship('Submission', backref='user', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }

# Conversation Model
class Conversation(db.Model):
    __tablename__ = 'conversations'
    
    id = db.Column(db.String(255), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    title = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    
    # Relationships
    messages = db.relationship('Message', backref='conversation', lazy=True, cascade='all, delete-orphan', order_by='Message.timestamp')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'employeeName': self.user.name,
            'employeeEmail': self.user.email,
            'messages': [msg.to_dict() for msg in self.messages]
        }

# Message Model
class Message(db.Model):
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.String(255), db.ForeignKey('conversations.id'), nullable=False, index=True)
    role = db.Column(db.String(50), nullable=False)  # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    message_metadata = db.Column(db.JSON)  # Store metadata as JSON (renamed from 'metadata' - reserved word)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'role': self.role,
            'content': self.content,
            'metadata': self.message_metadata,  # Return as 'metadata' in API
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }

# Submission Model (for admin dashboard - denormalized for easy querying)
class Submission(db.Model):
    __tablename__ = 'submissions'
    
    id = db.Column(db.String(255), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    conversation_id = db.Column(db.String(255), db.ForeignKey('conversations.id'), nullable=True, index=True)
    prompt = db.Column(db.Text, nullable=False)
    response = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(50), default='safe', index=True)  # 'safe', 'warning', 'danger'
    check_results = db.Column(db.JSON)  # Store check results as JSON
    files_processed = db.Column(db.Integer, default=0)
    sharepoint_searched = db.Column(db.Boolean, default=False)
    sharepoint_results_count = db.Column(db.Integer, default=0)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'employeeName': self.user.name,
            'employeeEmail': self.user.email,
            'prompt': self.prompt,
            'chatgptResponse': self.response,
            'status': self.status,
            'checkResults': self.check_results or [],
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'date': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else None,
            'filesProcessed': self.files_processed,
            'sharepointSearched': self.sharepoint_searched,
            'sharepointResultsCount': self.sharepoint_results_count,
            'conversationId': self.conversation_id
        }

# Helper functions
def init_db(app):
    """Initialize database with Flask app"""
    db.init_app(app)
    with app.app_context():
        db.create_all()
        print("Database tables created successfully")

def get_or_create_user(email, name=None):
    """Get existing user or create new one"""
    user = User.query.filter_by(email=email).first()
    if not user:
        user = User(email=email, name=name or email.split('@')[0])
        db.session.add(user)
        db.session.commit()
    elif name and user.name != name:
        # Update name if provided and different
        user.name = name
        db.session.commit()
    return user

def update_user_last_login(user):
    """Update user's last login timestamp"""
    user.last_login = datetime.utcnow()
    db.session.commit()
