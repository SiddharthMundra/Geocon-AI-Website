# Database Setup Guide

## Recommended: PostgreSQL

### Why PostgreSQL?
- ✅ **Free** on Render/Railway (free tier)
- ✅ **Production-ready** and reliable
- ✅ **Multi-user support** - all employees share the same database
- ✅ **Admin dashboard** can query all data easily
- ✅ **Scalable** - handles growth well
- ✅ **Works great with Flask** using SQLAlchemy

---

## Quick Start: PostgreSQL Setup

### Option 1: Render (Free PostgreSQL)

1. **Create PostgreSQL Database on Render:**
   - Go to [render.com](https://render.com)
   - Click "New +" → "PostgreSQL"
   - Name it: `geocon-ai-db`
   - Select "Free" plan
   - Copy the **Internal Database URL** and **External Database URL**

2. **Add Environment Variables:**
   - In your Render web service settings
   - Add: `DATABASE_URL` = (the External Database URL from step 1)

3. **Update requirements.txt:**
   ```
   flask-sqlalchemy==3.1.1
   psycopg2-binary==2.9.9
   ```

4. **Run migrations** (see implementation below)

---

### Option 2: Railway (Free PostgreSQL)

1. **Create PostgreSQL on Railway:**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Add Database" → "PostgreSQL"
   - Copy the **DATABASE_URL** from the Variables tab

2. **Add to your app:**
   - Add `DATABASE_URL` environment variable
   - Same code as Render

---

### Option 3: SQLite (Simpler, Local Development)

For local development or very small deployments:

- No setup needed - file-based database
- Works out of the box
- **Not recommended for production** with multiple users

---

## Database Schema

### Tables Needed:

1. **users** - Store user information
   - id (primary key)
   - email (unique)
   - name
   - created_at
   - last_login

2. **conversations** - Store chat conversations
   - id (primary key)
   - user_id (foreign key to users)
   - title
   - created_at
   - updated_at

3. **messages** - Store individual messages
   - id (primary key)
   - conversation_id (foreign key to conversations)
   - role (user/assistant)
   - content
   - metadata (JSON)
   - timestamp

4. **submissions** - Store submissions for admin (denormalized for easy querying)
   - id (primary key)
   - user_id (foreign key to users)
   - conversation_id
   - prompt
   - response
   - status (safe/warning/danger)
   - check_results (JSON)
   - files_processed
   - sharepoint_searched
   - timestamp

---

## Implementation Steps

1. **Install dependencies:**
   ```bash
   pip install flask-sqlalchemy psycopg2-binary
   ```

2. **Create database models** (see `database.py` below)

3. **Create migration script** (see `init_db.py` below)

4. **Update app.py** to use database instead of localStorage

5. **Create API endpoints** for:
   - User registration/login
   - Save conversations
   - Get conversations
   - Get all submissions (admin)

6. **Update frontend** to call API instead of localStorage

---

## Migration Strategy

### Phase 1: Keep localStorage + Add Database
- Write to both localStorage AND database
- Read from database (fallback to localStorage if needed)
- Allows gradual migration

### Phase 2: Full Database
- Remove localStorage writes
- All reads from database
- Clean up old localStorage code

---

## Free Hosting Options

| Service | Database | Free Tier | Best For |
|---------|----------|-----------|----------|
| **Render** | PostgreSQL | ✅ Yes | Production |
| **Railway** | PostgreSQL | ✅ $5/month credit | Production |
| **Supabase** | PostgreSQL | ✅ Yes | Production |
| **Neon** | PostgreSQL | ✅ Yes | Production |
| **SQLite** | File-based | ✅ Always free | Development only |

---

## Next Steps

1. Choose your database provider (Render recommended)
2. Set up the database
3. Implement the database models
4. Update API endpoints
5. Update frontend to use API
6. Test thoroughly
7. Deploy!

---

## Need Help?

- Render PostgreSQL: https://render.com/docs/databases
- Railway PostgreSQL: https://docs.railway.app/databases/postgresql
- SQLAlchemy Docs: https://docs.sqlalchemy.org/
