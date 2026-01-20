# Database Implementation Guide

## Overview

This guide shows how to migrate from localStorage to PostgreSQL database.

## Step 1: Set Up Database

### On Render:

1. Create PostgreSQL database
2. Copy the **External Database URL**
3. Add to environment variables: `DATABASE_URL`

### On Railway:

1. Add PostgreSQL service
2. Copy `DATABASE_URL` from variables
3. Add to your app's environment variables

## Step 2: Update app.py

Add these imports at the top:

```python
from database import db, init_db, User, Conversation, Message, Submission, get_or_create_user, update_user_last_login
```

Add database configuration:

```python
# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///geocon_ai.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
init_db(app)
```

## Step 3: Create API Endpoints

### User Endpoints:

```python
@app.route('/api/users/login', methods=['POST'])
def login_user():
    """Login or create user"""
    data = request.json
    email = data.get('email', '').strip().lower()
    name = data.get('name', '').strip()
    
    # Validate email format
    if not email.endswith('@geoconinc.com'):
        return jsonify({'error': 'Invalid email domain'}), 400
    
    # Get or create user
    user = get_or_create_user(email, name)
    update_user_last_login(user)
    
    return jsonify({
        'success': True,
        'user': user.to_dict()
    })

@app.route('/api/users/<user_id>/conversations', methods=['GET'])
def get_conversations(user_id):
    """Get all conversations for a user"""
    user = User.query.get_or_404(user_id)
    conversations = Conversation.query.filter_by(user_id=user_id).order_by(Conversation.updated_at.desc()).all()
    return jsonify([conv.to_dict() for conv in conversations])

@app.route('/api/conversations', methods=['POST'])
def create_conversation():
    """Create a new conversation"""
    data = request.json
    user_id = data.get('user_id')
    title = data.get('title', 'New Chat')
    conversation_id = data.get('id', f'chat-{datetime.now().timestamp()}')
    
    user = User.query.get_or_404(user_id)
    conversation = Conversation(
        id=conversation_id,
        user_id=user_id,
        title=title
    )
    db.session.add(conversation)
    db.session.commit()
    
    return jsonify(conversation.to_dict())

@app.route('/api/conversations/<conversation_id>/messages', methods=['POST'])
def add_message():
    """Add a message to a conversation"""
    data = request.json
    conversation_id = data.get('conversation_id')
    role = data.get('role')  # 'user' or 'assistant'
    content = data.get('content')
    metadata = data.get('metadata', {})
    
    conversation = Conversation.query.get_or_404(conversation_id)
    message = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        metadata=metadata
    )
    db.session.add(message)
    
    # Update conversation timestamp
    conversation.updated_at = datetime.utcnow()
    
    # If this is a user message followed by assistant, create submission
    if role == 'assistant':
        # Find the previous user message
        user_msg = Message.query.filter_by(
            conversation_id=conversation_id,
            role='user'
        ).order_by(Message.timestamp.desc()).first()
        
        if user_msg:
            submission = Submission(
                id=f"{conversation_id}-{user_msg.id}",
                user_id=conversation.user_id,
                conversation_id=conversation_id,
                prompt=user_msg.content,
                response=content,
                status=metadata.get('confidentialStatus', 'safe'),
                check_results=metadata.get('checkResults', []),
                files_processed=metadata.get('filesCount', 0),
                sharepoint_searched=metadata.get('sharepointSearched', False),
                sharepoint_results_count=metadata.get('sharepointResultsCount', 0)
            )
            db.session.add(submission)
    
    db.session.commit()
    return jsonify(message.to_dict())

@app.route('/api/admin/submissions', methods=['GET'])
def get_all_submissions():
    """Get all submissions for admin dashboard"""
    # Get filter parameters
    employee_filter = request.args.get('employee', 'all')
    status_filter = request.args.get('status', 'all')
    
    query = Submission.query
    
    # Apply filters
    if employee_filter != 'all':
        # Filter by user email or name
        user = User.query.filter(
            (User.email == employee_filter) | (User.name == employee_filter)
        ).first()
        if user:
            query = query.filter_by(user_id=user.id)
        else:
            return jsonify([])
    
    if status_filter != 'all':
        query = query.filter_by(status=status_filter)
    
    submissions = query.order_by(Submission.timestamp.desc()).all()
    return jsonify([sub.to_dict() for sub in submissions])

@app.route('/api/admin/stats', methods=['GET'])
def get_admin_stats():
    """Get statistics for admin dashboard"""
    total = Submission.query.count()
    flagged = Submission.query.filter(Submission.status != 'safe').count()
    danger = Submission.query.filter_by(status='danger').count()
    unique_users = db.session.query(Submission.user_id).distinct().count()
    
    return jsonify({
        'total': total,
        'flagged': flagged,
        'danger': danger,
        'employees': unique_users
    })
```

## Step 4: Update Frontend (script.js)

Replace localStorage calls with API calls:

```javascript
// Instead of: saveConversations()
async function saveConversation(conversation) {
    const response = await fetch(`${API_BASE_URL}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: currentUser.id,
            id: conversation.id,
            title: conversation.title
        })
    });
    return response.json();
}

// Instead of: saveToAdminSubmissions()
async function saveMessage(conversationId, role, content, metadata) {
    const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            conversation_id: conversationId,
            role: role,
            content: content,
            metadata: metadata
        })
    });
    return response.json();
}
```

## Step 5: Run Initialization

```bash
python init_db.py
```

This creates all database tables.

## Step 6: Migration from localStorage

Create a migration script to move existing localStorage data to database:

```python
# migrate_localstorage.py
from app import app
from database import db, User, Conversation, Message, Submission
import json

def migrate_localstorage():
    """Migrate data from localStorage to database"""
    # This would need to be run manually or via an admin endpoint
    # Read localStorage data (you'd need to export it first)
    # Then insert into database
    pass
```

## Benefits of Database Approach

1. **Centralized Data**: All users' data in one place
2. **Admin Access**: Easy to query all submissions
3. **Data Persistence**: Not lost when browser cache clears
4. **Scalability**: Can handle many users
5. **Backup**: Can backup database easily
6. **Analytics**: Easy to run queries and reports

## Testing

1. Test user login/creation
2. Test conversation creation
3. Test message saving
4. Test admin dashboard queries
5. Test filters

## Production Checklist

- [ ] Database URL set in environment variables
- [ ] Database tables created
- [ ] API endpoints tested
- [ ] Frontend updated to use API
- [ ] Error handling implemented
- [ ] Backup strategy in place
