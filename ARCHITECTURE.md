# Geocon AI Website - Architecture Overview

## System Architecture

This is a **full-stack web application** built with Flask (Python backend) and vanilla JavaScript (frontend), deployed on Render with PostgreSQL database.

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                        │
├─────────────────────────────────────────────────────────────┤
│  index.html          │  admin.html                           │
│  - User Chat UI      │  - Admin Dashboard                    │
│  - Login System      │  - Employee Management                │
│  - Settings          │  - Conversation Viewer                │
│                      │                                        │
│  script.js           │  admin.js                             │
│  - Chat Logic        │  - Admin API Calls                    │
│  - API Integration   │  - Stats Display                      │
│  - Markdown Render   │                                        │
│                      │                                        │
│  styles.css          │  admin.css                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend Layer (Flask)                   │
├─────────────────────────────────────────────────────────────┤
│  app.py                                                      │
│  ├── Flask Application Setup                                │
│  ├── Database Configuration (PostgreSQL)                    │
│  ├── Azure OpenAI Integration                                │
│  ├── SharePoint Integration (Read-Only)                     │
│  ├── Confidential Info Detection                             │
│  └── API Endpoints:                                          │
│      ├── POST /api/submit                                    │
│      ├── POST /api/users/login                               │
│      ├── POST /api/users/<id>/update-name                    │
│      ├── GET  /api/users/<id>/conversations                  │
│      ├── POST /api/conversations                             │
│      ├── POST /api/conversations/<id>/messages               │
│      ├── GET  /api/admin/stats                               │
│      ├── GET  /api/admin/employees                           │
│      └── GET  /api/admin/employees/<id>/conversations        │
│                                                              │
│  database.py                                                 │
│  ├── SQLAlchemy Models:                                      │
│  │   ├── User (id, email, name, created_at, last_login)     │
│  │   ├── Conversation (id, user_id, title, timestamps)       │
│  │   ├── Message (id, conversation_id, role, content)        │
│  │   └── Submission (id, user_id, prompt, response, status) │
│  ├── Database Initialization                                 │
│  └── Helper Functions (get_or_create_user, etc.)             │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ SQLAlchemy ORM
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer (PostgreSQL)                │
├─────────────────────────────────────────────────────────────┤
│  Render PostgreSQL Database                                   │
│  ├── users (user accounts)                                   │
│  ├── conversations (chat sessions)                           │
│  ├── messages (chat messages)                                 │
│  └── submissions (admin tracking)                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ External APIs
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                          │
├─────────────────────────────────────────────────────────────┤
│  Azure OpenAI (GPT-4.1)                                      │
│  └── Chat completions, document processing                   │
│                                                              │
│  SharePoint (Read-Only)                                      │
│  └── Document search via Microsoft Graph API                 │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Backend
- **Flask 3.0.0** - Web framework
- **Flask-SQLAlchemy 3.1.1** - ORM for database
- **Flask-CORS 4.0.0** - Cross-origin resource sharing
- **psycopg/psycopg2** - PostgreSQL adapter (auto-detects Python version)
- **Azure OpenAI SDK** - GPT-4.1 integration
- **Python 3.13** (Render) / 3.12 (local fallback)

### Frontend
- **Vanilla JavaScript** - No frameworks
- **HTML5/CSS3** - Modern web standards
- **Marked.js** (via CDN) - Markdown rendering

### Database
- **PostgreSQL 18** (Render)
- **SQLAlchemy 2.0** - ORM with connection pooling

### Deployment
- **Render** - Hosting platform
- **Gunicorn 21.2.0** - WSGI server
- **Procfile** - Process configuration

## Data Flow

### User Chat Flow
```
1. User logs in with @geoconinc.com email
   → POST /api/users/login
   → Creates/updates User record
   → Returns user data + conversations

2. User creates new chat
   → POST /api/conversations
   → Creates Conversation record
   → Returns conversation ID

3. User sends message
   → POST /api/conversations/<id>/messages
   → Saves user message to Message table
   → Calls Azure OpenAI API
   → Saves assistant response to Message table
   → Optionally searches SharePoint (read-only)
   → Checks for confidential info
   → Creates Submission record for admin tracking
   → Returns response

4. User views chat history
   → GET /api/users/<id>/conversations
   → Returns all conversations with messages
```

### Admin Dashboard Flow
```
1. Admin accesses /admin.html
   → GET /api/admin/stats
   → Returns: total users, conversations, messages

2. Admin views employees
   → GET /api/admin/employees
   → Returns: list of all users

3. Admin views employee conversations
   → GET /api/admin/employees/<id>/conversations
   → Returns: all conversations for that user
```

## Database Schema

### Users Table
```sql
- id (PK, Integer)
- email (Unique, String 255)
- name (String 255)
- created_at (DateTime)
- last_login (DateTime)
```

### Conversations Table
```sql
- id (PK, String 255) - UUID
- user_id (FK → users.id)
- title (String 500)
- created_at (DateTime, Indexed)
- updated_at (DateTime, Indexed)
```

### Messages Table
```sql
- id (PK, Integer)
- conversation_id (FK → conversations.id, Indexed)
- role (String 50) - 'user' or 'assistant'
- content (Text)
- message_metadata (JSON) - file info, etc.
- timestamp (DateTime, Indexed)
```

### Submissions Table
```sql
- id (PK, String 255) - UUID
- user_id (FK → users.id, Indexed)
- conversation_id (FK → conversations.id, Indexed)
- prompt (Text)
- response (Text)
- status (String 50, Indexed) - 'safe', 'warning', 'danger'
- check_results (JSON) - confidential info check results
- files_processed (Integer)
- sharepoint_searched (Boolean)
- sharepoint_results_count (Integer)
- timestamp (DateTime, Indexed)
```

## Security Features

1. **Email Validation**: Only @geoconinc.com emails allowed
2. **Confidential Info Detection**: Regex patterns for SSN, credit cards, etc.
3. **Read-Only SharePoint**: All SharePoint operations are read-only
4. **Connection Pooling**: SQLAlchemy connection pool with pre-ping
5. **CORS**: Configured for frontend-backend communication

## Configuration

### Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `AZURE_OPENAI_ENDPOINT` - Azure OpenAI endpoint
- `AZURE_OPENAI_KEY` - Azure OpenAI API key
- `AZURE_OPENAI_DEPLOYMENT` - Deployment name (gpt-4.1)
- `AZURE_API_VERSION` - API version
- `SHAREPOINT_SITE_URL` - SharePoint site URL
- `SHAREPOINT_CLIENT_ID` - Azure AD app client ID
- `SHAREPOINT_CLIENT_SECRET` - Azure AD app secret

### Files
- `requirements.txt` - Python dependencies with conditional psycopg installation
- `runtime.txt` - Python version (3.12.7)
- `Procfile` - Gunicorn startup command

## Key Features

1. **Multi-User Chat System**: Each user has isolated conversations
2. **Persistent History**: All chats saved to PostgreSQL
3. **Admin Dashboard**: View all users and their conversations
4. **File Upload Support**: PDF, DOCX, XLSX processing
5. **SharePoint Integration**: Search company documents (read-only)
6. **Confidential Info Detection**: Automatic scanning before submission
7. **Markdown Rendering**: AI responses formatted as markdown
8. **Settings Management**: Users can update display names

## Deployment

### Render Configuration
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn app:app`
- **Python Version**: 3.13.4 (auto-detected) or 3.12.7 (via runtime.txt)
- **Database**: External PostgreSQL service on Render

### Database Driver Auto-Detection
The app automatically detects which PostgreSQL driver is available:
- Python 3.13 → Uses `psycopg` (v3) with `postgresql+psycopg://`
- Python < 3.13 → Uses `psycopg2` with `postgresql://`

## File Structure

```
.
├── app.py                 # Main Flask application
├── database.py            # SQLAlchemy models and DB functions
├── index.html            # Main user interface
├── admin.html            # Admin dashboard
├── script.js             # Frontend JavaScript
├── admin.js              # Admin dashboard JavaScript
├── styles.css            # Main stylesheet
├── admin.css             # Admin stylesheet
├── logo.png              # Company logo
├── requirements.txt      # Python dependencies
├── runtime.txt           # Python version
├── Procfile              # Render deployment config
├── init_db.py            # Database initialization utility
├── reset_database.py     # Database reset utility
└── README.md             # Main documentation
```

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/login` | User login/registration |
| POST | `/api/users/<id>/update-name` | Update user display name |
| GET | `/api/users/<id>/conversations` | Get user's conversations |
| POST | `/api/conversations` | Create new conversation |
| POST | `/api/conversations/<id>/messages` | Send message in conversation |
| GET | `/api/admin/stats` | Get admin statistics |
| GET | `/api/admin/employees` | Get all employees |
| GET | `/api/admin/employees/<id>/conversations` | Get employee conversations |
| GET | `/api/health` | Health check |
| GET | `/` | Serve index.html |
| GET | `/admin.html` | Serve admin dashboard |
