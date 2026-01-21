# Database Reset Instructions

## ⚠️ WARNING
This will **DELETE ALL DATA** from your PostgreSQL database including:
- All users
- All conversations
- All messages
- All submissions

## Steps to Reset Database

### 1. Stop Your Flask App
If your Flask app is running, stop it (Ctrl+C in terminal).

### 2. Run the Reset Script

```bash
python reset_database.py
```

You will be prompted to type `YES` to confirm.

### 3. Restart Your App

```bash
python app.py
```

## What Happens

1. **All tables are dropped** - All data is deleted
2. **Fresh tables are created** - Empty tables with the same structure
3. **Database is ready** - You can start using the app fresh

## After Reset

- All users will need to log in again
- All conversations will be empty
- All chat history will be lost
- Admin dashboard will show 0 submissions

## Alternative: Keep Data, Just Fix Issues

If you want to keep your data but fix issues, you can:

1. **Backup your data first:**
   - Export from admin dashboard
   - Or backup the database on Render

2. **Fix the code issues** (already done):
   - Name update now has better error handling
   - Conversations now save to database
   - Old chats will be loaded from database

3. **Test without resetting:**
   - Just restart your app
   - Old chats should now load from database
   - New chats will save to database

## Troubleshooting

If reset fails:
- Check database connection
- Make sure Flask app is stopped
- Check that you have write permissions
- Verify DATABASE_URL is correct
