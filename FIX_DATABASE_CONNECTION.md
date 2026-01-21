# Fix Database Connection Issue

## Problem
You're getting this error on Render:
```
ImportError: /opt/render/project/src/.venv/lib/python3.13/site-packages/psycopg2/_psycopg.cpython-313-x86_64-linux-gnu.so: undefined symbol: _PyInterpreterState_Get
```

## Root Cause
**psycopg2-binary doesn't support Python 3.13 yet!** Render is using Python 3.13, which is incompatible with psycopg2-binary.

## Solution

### Option 1: Use Python 3.12 (Recommended)

1. **Update `runtime.txt`:**
   ```
   python-3.12.7
   ```

2. **Redeploy on Render:**
   - Render will automatically use Python 3.12.7
   - psycopg2-binary will work correctly

### Option 2: Use psycopg (Newer Version)

If you must use Python 3.13, update `requirements.txt`:
```
psycopg[binary]==3.2.0
```

But you'll also need to update the code to use `psycopg` instead of `psycopg2`.

## How to Test Database Connection

### Locally:
```bash
python test_db_simple.py
```

This will test:
1. ✅ psycopg2 import
2. ✅ Direct PostgreSQL connection
3. ✅ SQLAlchemy connection

### On Render:
Check the logs when your app starts. You should see:
```
[OK] Database connection test successful
[OK] Database tables created/verified successfully
```

## Current Status

✅ **Fixed:**
- Updated `runtime.txt` to Python 3.12.7
- Removed bind key configuration
- Added connection testing
- Better error handling

## Next Steps

1. **Commit and push your changes:**
   ```bash
   git add runtime.txt requirements.txt app.py database.py
   git commit -m "Fix database connection for Python 3.12"
   git push
   ```

2. **Redeploy on Render:**
   - Render will automatically rebuild with Python 3.12
   - Database connection should work

3. **Verify:**
   - Check Render logs for "[OK] Database connection test successful"
   - Try logging in to your app

## Troubleshooting

### If still getting errors:

1. **Check Python version in Render logs:**
   - Look for "Python 3.12" in startup logs
   - If it says "Python 3.13", Render might be caching

2. **Force rebuild:**
   - In Render dashboard → Manual Deploy → Clear build cache & deploy

3. **Check database URL:**
   - Verify `DATABASE_URL` environment variable is set correctly
   - Make sure it's the External Database URL

4. **Test connection manually:**
   ```bash
   python test_db_simple.py
   ```

## Summary

The issue is **Python 3.13 compatibility**. By using Python 3.12.7, psycopg2-binary will work correctly and your database connection will be fixed!
