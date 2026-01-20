# Database Setup Instructions

## Your PostgreSQL Database is Ready!

You've created a PostgreSQL database on Render. Here's how to connect it:

## Step 1: Add Environment Variable

### On Render (when deploying your web service):

1. Go to your Render dashboard
2. Select your web service
3. Go to "Environment" tab
4. Add this environment variable:

**Key:** `DATABASE_URL`  
**Value:** `postgresql://test_aiwebsite_sql_user:x7FrVTKtQCs1C8kdOdWsAadnpChkX1bP@dpg-d5nccmje5dus73f2rcs0-a.oregon-postgres.render.com/test_aiwebsite_sql`

⚠️ **Important:** Use the **External Database URL** (the one with `.oregon-postgres.render.com`)

## Step 2: Initialize Database Tables

### Option A: Run locally first (recommended)

1. Set environment variable locally:
   ```bash
   # Windows (PowerShell)
   $env:DATABASE_URL="postgresql://test_aiwebsite_sql_user:x7FrVTKtQCs1C8kdOdWsAadnpChkX1bP@dpg-d5nccmje5dus73f2rcs0-a.oregon-postgres.render.com/test_aiwebsite_sql"
   
   # Windows (Command Prompt)
   set DATABASE_URL=postgresql://test_aiwebsite_sql_user:x7FrVTKtQCs1C8kdOdWsAadnpChkX1bP@dpg-d5nccmje5dus73f2rcs0-a.oregon-postgres.render.com/test_aiwebsite_sql
   
   # Mac/Linux
   export DATABASE_URL="postgresql://test_aiwebsite_sql_user:x7FrVTKtQCs1C8kdOdWsAadnpChkX1bP@dpg-d5nccmje5dus73f2rcs0-a.oregon-postgres.render.com/test_aiwebsite_sql"
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Initialize database:
   ```bash
   python init_db.py
   ```

You should see: "Database tables created successfully"

### Option B: Let Flask create tables on first run

The database tables will be automatically created when you first run the Flask app (if they don't exist).

## Step 3: Test the Connection

Run your Flask app:
```bash
python app.py
```

You should see in the console:
```
Database initialized: postgresql://test_aiwebsite_sql...
```

## Step 4: Deploy to Render

1. Make sure `DATABASE_URL` is set in your Render web service environment variables
2. Deploy your code
3. The database tables will be created automatically on first run

## What's Changed

✅ **Database integration added** - `app.py` now connects to PostgreSQL  
✅ **API endpoints updated** - `/api/submit` now saves to database  
✅ **New endpoints added:**
   - `/api/users/login` - User login/creation
   - `/api/users/<id>/conversations` - Get user conversations
   - `/api/conversations` - Create conversation
   - `/api/conversations/<id>/messages` - Add message
   - `/api/admin/stats` - Get admin statistics
   - `/api/submissions` - Get all submissions (with filters)

## Database Schema

The following tables will be created:

- **users** - User accounts (email, name, login info)
- **conversations** - Chat conversations
- **messages** - Individual messages in conversations
- **submissions** - Denormalized data for admin queries

## Next Steps

1. ✅ Database is set up
2. ✅ Backend is connected
3. ⏳ Update frontend to use new API endpoints (optional - can keep localStorage for now)
4. ⏳ Test everything works
5. ⏳ Deploy!

## Troubleshooting

### Connection Error?
- Make sure you're using the **External Database URL** (not Internal)
- Check that the password is correct
- Verify the database is running on Render

### Tables Not Created?
- Run `python init_db.py` manually
- Or check Flask logs when app starts

### Import Errors?
- Make sure you ran: `pip install -r requirements.txt`
- Check that `flask-sqlalchemy` and `psycopg2-binary` are installed

## Current Status

- ✅ Database created on Render
- ✅ Backend code updated to use database
- ✅ API endpoints ready
- ⏳ Frontend still uses localStorage (can be updated later)
- ⏳ Database tables need to be initialized

The app will work with both localStorage (frontend) and database (backend) simultaneously. You can migrate the frontend to use the API later.
