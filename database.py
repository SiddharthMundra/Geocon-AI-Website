"""
Database models and setup for Geocon AI Website
Uses SQLAlchemy ORM with PostgreSQL
"""

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
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

# Audit Log Model
class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)
    user_email = db.Column(db.String(255), nullable=True, index=True)  # Store email even if user deleted
    action_type = db.Column(db.String(100), nullable=False, index=True)  # 'login', 'logout', 'admin_access', 'data_access', etc.
    action_category = db.Column(db.String(50), nullable=False, index=True)  # 'authentication', 'admin', 'data', 'security', 'system'
    description = db.Column(db.Text, nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)  # IPv6 can be up to 45 chars
    user_agent = db.Column(db.String(500), nullable=True)
    request_method = db.Column(db.String(10), nullable=True)  # GET, POST, etc.
    request_path = db.Column(db.String(500), nullable=True)
    status = db.Column(db.String(50), nullable=True, index=True)  # 'success', 'failure', 'error', 'unauthorized'
    metadata = db.Column(db.JSON)  # Additional context data
    
    # Relationships
    user = db.relationship('User', backref='audit_logs', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'date': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else None,
            'user_id': self.user_id,
            'user_email': self.user_email,
            'user_name': self.user.name if self.user else None,
            'action_type': self.action_type,
            'action_category': self.action_category,
            'description': self.description,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'request_method': self.request_method,
            'request_path': self.request_path,
            'status': self.status,
            'metadata': self.metadata or {}
        }

# Helper functions
def init_db(app):
    """Initialize database with Flask app"""
    try:
        # Initialize SQLAlchemy with app (no bind key)
        db.init_app(app)
        
        with app.app_context():
            # Test connection first
            try:
                # Get the engine and test connection
                engine = db.get_engine()
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                print("[OK] Database connection test successful")
            except Exception as conn_error:
                print(f"WARNING: Database connection test failed: {conn_error}")
                print("This might be a temporary issue. Tables will still be created.")
                import traceback
                traceback.print_exc()
            
            # Create all tables
            db.create_all()
            print("[OK] Database tables created/verified successfully")
            
    except Exception as e:
        print(f"ERROR in init_db: {e}")
        import traceback
        traceback.print_exc()
        # Don't raise - let app continue but database features won't work
        print("WARNING: Database initialization failed. App will continue but database features may not work.")

def get_or_create_user(email, name=None):
    """Get existing user or create new one"""
    try:
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
    except Exception as e:
        print(f"Error in get_or_create_user: {e}")
        db.session.rollback()
        raise

def update_user_last_login(user):
    """Update user's last login timestamp"""
    try:
        user.last_login = datetime.utcnow()
        db.session.commit()
    except Exception as e:
        print(f"Error updating last login: {e}")
        db.session.rollback()
        raise
