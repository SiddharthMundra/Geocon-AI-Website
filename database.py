"""
Database models and setup for Geocon AI Website
Uses SQLAlchemy ORM with PostgreSQL
"""

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text, Numeric
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
    session_token = db.Column(db.String(255), nullable=True, index=True)  # Session token for persistent login
    session_expires = db.Column(db.DateTime, nullable=True)  # Token expiration time
    
    # Relationships
    conversations = db.relationship('Conversation', backref='user', lazy=True, cascade='all, delete-orphan')
    submissions = db.relationship('Submission', backref='user', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'session_token': self.session_token  # Include token in response
        }

# Conversation Model
class Conversation(db.Model):
    __tablename__ = 'conversations'
    
    id = db.Column(db.String(255), primary_key=True)  # UUID
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    title = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    is_deleted = db.Column(db.Boolean, default=False, index=True)  # Soft delete
    
    # Relationships
    messages = db.relationship('Message', backref='conversation', lazy=True, cascade='all, delete-orphan', order_by='Message.created_at')
    
    def to_dict(self):
        result = {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'employeeName': self.user.name,
            'employeeEmail': self.user.email,
            'messages': [msg.to_dict() for msg in self.messages]
        }
        # Only include is_deleted if column exists
        try:
            result['is_deleted'] = self.is_deleted
            # Filter messages only if is_deleted exists
            if self.is_deleted:
                result['messages'] = []
        except AttributeError:
            # Column doesn't exist, skip
            pass
        return result

# Message Model
class Message(db.Model):
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.String(255), db.ForeignKey('conversations.id'), nullable=False, index=True)
    role = db.Column(db.String(50), nullable=False, index=True)  # 'user', 'assistant', 'system', 'tool'
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Message metadata stored as JSON with all required fields:
    # model, temperature, top_p, max_output_tokens, token_in, token_out, total_tokens,
    # latency_ms, finish_reason, client_context, safety_flags
    message_metadata = db.Column(db.JSON)
    
    def to_dict(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'role': self.role,
            'content': self.content,
            'metadata': self.message_metadata or {},  # Return as 'metadata' in API
            'timestamp': self.created_at.isoformat() if self.created_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

# Submission Model (for admin dashboard - references messages for single source of truth)
class Submission(db.Model):
    __tablename__ = 'submissions'
    
    id = db.Column(db.String(255), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    conversation_id = db.Column(db.String(255), db.ForeignKey('conversations.id'), nullable=True, index=True)
    user_message_id = db.Column(db.Integer, db.ForeignKey('messages.id'), nullable=True, index=True)  # Reference to user message
    assistant_message_id = db.Column(db.Integer, db.ForeignKey('messages.id'), nullable=True, index=True)  # Reference to assistant message
    prompt = db.Column(db.Text, nullable=False)  # Denormalized for quick admin access
    response = db.Column(db.Text, nullable=False)  # Denormalized for quick admin access
    status = db.Column(db.String(50), default='safe', index=True)  # 'safe', 'warning', 'danger'
    check_results = db.Column(db.JSON)  # Store check results as JSON (safety_flags)
    files_processed = db.Column(db.Integer, default=0)
    sharepoint_searched = db.Column(db.Boolean, default=False)
    sharepoint_results_count = db.Column(db.Integer, default=0)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    user_msg = db.relationship('Message', foreign_keys=[user_message_id], backref='submission_as_user')
    assistant_msg = db.relationship('Message', foreign_keys=[assistant_message_id], backref='submission_as_assistant')
    
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

# Audit Log Model (for admin access tracking and security)
class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    actor_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)  # Renamed from user_id for clarity
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)  # Keep for backward compatibility
    user_email = db.Column(db.String(255), nullable=True, index=True)  # Store email even if user deleted
    action = db.Column(db.String(100), nullable=False, index=True)  # 'ADMIN_VIEW_CONVERSATION', 'EXPORT', 'ROLE_CHANGE', etc.
    action_type = db.Column(db.String(100), nullable=True, index=True)  # Keep for backward compatibility
    action_category = db.Column(db.String(50), nullable=True, index=True)  # Keep for backward compatibility
    object_type = db.Column(db.String(50), nullable=True, index=True)  # 'conversation', 'message', 'user', etc.
    object_id = db.Column(db.String(255), nullable=True, index=True)  # ID of the object acted upon
    description = db.Column(db.Text, nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)  # IPv6 can be up to 45 chars
    user_agent = db.Column(db.String(500), nullable=True)
    request_method = db.Column(db.String(10), nullable=True)  # GET, POST, etc.
    request_path = db.Column(db.String(500), nullable=True)
    status = db.Column(db.String(50), nullable=True, index=True)  # 'success', 'failure', 'error', 'unauthorized'
    audit_metadata = db.Column(db.JSON)  # Additional context data (renamed from 'metadata' - reserved word)
    
    # Relationships
    actor = db.relationship('User', foreign_keys=[actor_user_id], backref='audit_logs_as_actor', lazy=True)
    user = db.relationship('User', foreign_keys=[user_id], backref='audit_logs', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'date': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else None,
            'actor_user_id': self.actor_user_id or self.user_id,  # Use actor_user_id if available
            'user_id': self.user_id,
            'user_email': self.user_email,
            'user_name': (self.actor.name if self.actor else None) or (self.user.name if self.user else None),
            'action': self.action or self.action_type,  # Use action if available
            'action_type': self.action_type,
            'action_category': self.action_category,
            'object_type': self.object_type,
            'object_id': self.object_id,
            'description': self.description,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'request_method': self.request_method,
            'request_path': self.request_path,
            'status': self.status,
            'metadata': self.audit_metadata or {}  # Return as 'metadata' in API
        }

# Usage/Cost Tracking Model (for token usage and cost estimation)
class Usage(db.Model):
    __tablename__ = 'usage'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    conversation_id = db.Column(db.String(255), db.ForeignKey('conversations.id'), nullable=True, index=True)
    assistant_message_id = db.Column(db.Integer, db.ForeignKey('messages.id'), nullable=True, index=True)  # Reference to message
    model = db.Column(db.String(100), nullable=False, index=True)  # Model name (e.g., 'gpt-4.1')
    token_in = db.Column(db.Integer, nullable=True)  # Input tokens
    token_out = db.Column(db.Integer, nullable=True)  # Output tokens
    total_tokens = db.Column(db.Integer, nullable=True, index=True)  # Total tokens
    latency_ms = db.Column(db.Integer, nullable=True)  # Response latency in milliseconds
    cost_estimate_usd = db.Column(Numeric(10, 6), nullable=True)  # Estimated cost in USD
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Relationships
    user = db.relationship('User', backref='usage_records', lazy=True)
    conversation = db.relationship('Conversation', backref='usage_records', lazy=True)
    message = db.relationship('Message', backref='usage_record', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'conversation_id': self.conversation_id,
            'assistant_message_id': self.assistant_message_id,
            'model': self.model,
            'token_in': self.token_in,
            'token_out': self.token_out,
            'total_tokens': self.total_tokens,
            'latency_ms': self.latency_ms,
            'cost_estimate_usd': float(self.cost_estimate_usd) if self.cost_estimate_usd else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
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
            
            # Migrate: Add is_deleted column if it doesn't exist
            try:
                # Check if conversations table exists and if is_deleted column exists
                with engine.connect() as conn:
                    # Detect database type
                    db_url = str(engine.url)
                    is_postgresql = 'postgresql' in db_url or 'postgres' in db_url
                    is_sqlite = 'sqlite' in db_url
                    
                    column_exists = False
                    
                    if is_postgresql:
                        # PostgreSQL: Use information_schema
                        check_query = text("""
                            SELECT column_name 
                            FROM information_schema.columns 
                            WHERE table_name='conversations' AND column_name='is_deleted'
                        """)
                        result = conn.execute(check_query)
                        column_exists = result.fetchone() is not None
                    elif is_sqlite:
                        # SQLite: Use PRAGMA table_info
                        result = conn.execute(text("PRAGMA table_info(conversations)"))
                        columns = result.fetchall()
                        # Check if 'is_deleted' column exists
                        column_exists = any(col[1] == 'is_deleted' for col in columns)
                    else:
                        # Unknown database type, skip migration check
                        print("[INFO] Unknown database type, skipping migration check")
                        column_exists = True  # Assume column exists to skip migration
                    
                    if not column_exists:
                        print("Migrating: Adding is_deleted column to conversations table...")
                        try:
                            # Add column (works for both PostgreSQL and SQLite)
                            # Use DEFAULT FALSE for PostgreSQL, DEFAULT 0 for SQLite
                            if is_postgresql:
                                # PostgreSQL: Try to add column (will fail if exists, but that's OK)
                                try:
                                    conn.execute(text("""
                                        ALTER TABLE conversations 
                                        ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE
                                    """))
                                    conn.commit()
                                except Exception as add_col_error:
                                    # Column might already exist (race condition), check again
                                    error_str = str(add_col_error).lower()
                                    if 'already exists' in error_str or 'duplicate' in error_str:
                                        print("  [INFO] Column already exists (race condition)")
                                        conn.rollback()
                                    else:
                                        raise
                            else:
                                # SQLite: Add column
                                conn.execute(text("""
                                    ALTER TABLE conversations 
                                    ADD COLUMN is_deleted BOOLEAN DEFAULT 0
                                """))
                                conn.commit()
                            
                            # Create index (only for PostgreSQL, SQLite doesn't support IF NOT EXISTS in CREATE INDEX)
                            if is_postgresql:
                                try:
                                    conn.execute(text("""
                                        CREATE INDEX IF NOT EXISTS ix_conversations_is_deleted 
                                        ON conversations(is_deleted)
                                    """))
                                    conn.commit()
                                except Exception as idx_error:
                                    # Index might already exist, that's OK
                                    print(f"  [INFO] Index creation: {idx_error}")
                            
                            # Update existing rows to set is_deleted = FALSE
                            if is_postgresql:
                                conn.execute(text("""
                                    UPDATE conversations 
                                    SET is_deleted = FALSE 
                                    WHERE is_deleted IS NULL
                                """))
                            else:
                                conn.execute(text("""
                                    UPDATE conversations 
                                    SET is_deleted = 0 
                                    WHERE is_deleted IS NULL
                                """))
                            conn.commit()
                            
                            print("[OK] Migration complete: is_deleted column added and existing rows updated")
                        except Exception as migration_error:
                            print(f"  [ERROR] Migration failed: {migration_error}")
                            conn.rollback()
                            raise
                    else:
                        print("[OK] is_deleted column already exists")
            except Exception as migrate_error:
                # Table might not exist yet (first run), that's OK
                # But if it's a column check error, try to add the column anyway
                error_str = str(migrate_error).lower()
                if 'no such table' not in error_str and 'does not exist' not in error_str:
                    # Table exists but migration check failed, try to add column anyway
                    try:
                        print("Migration check failed, attempting to add column anyway...")
                        with engine.connect() as conn:
                            db_url = str(engine.url)
                            is_postgresql = 'postgresql' in db_url or 'postgres' in db_url
                            if is_postgresql:
                                conn.execute(text("""
                                    ALTER TABLE conversations 
                                    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE
                                """))
                            else:
                                conn.execute(text("""
                                    ALTER TABLE conversations 
                                    ADD COLUMN is_deleted BOOLEAN DEFAULT 0
                                """))
                            conn.commit()
                            print("[OK] Column added via fallback migration")
                    except Exception as fallback_error:
                        print(f"[INFO] Fallback migration also failed: {fallback_error}")
                else:
                    print(f"[INFO] Migration check: {migrate_error}")
            
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
