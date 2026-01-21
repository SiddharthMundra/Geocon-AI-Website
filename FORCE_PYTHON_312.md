# Force Python 3.12 on Render

## Problem
Render is using Python 3.13 even though `runtime.txt` specifies 3.12.7.

## Solution 1: Clear Build Cache (Recommended)

1. **In Render Dashboard:**
   - Go to your web service
   - Click "Manual Deploy"
   - Select "Clear build cache & deploy"
   - This forces Render to rebuild with the correct Python version

2. **Verify in logs:**
   - Look for: `Python 3.12.7` in the build logs
   - Should NOT see: `Python 3.13`

## Solution 2: Add Environment Variable

1. **In Render Dashboard:**
   - Go to your service → Settings → Environment
   - Add new environment variable:
     - **Key:** `PYTHON_VERSION`
     - **Value:** `3.12.7`
   - Save and redeploy

## Solution 3: Verify runtime.txt Format

Make sure `runtime.txt` contains EXACTLY:
```
python-3.12.7
```

- No extra spaces
- No blank lines at the end
- File should be in the root directory

## Current Fix Applied

I've updated `requirements.txt` to use:
- `psycopg2-binary` for Python < 3.13 (works with 3.12)
- `psycopg[binary]` for Python >= 3.13 (fallback if Render uses 3.13)

This means it will work with BOTH Python 3.12 and 3.13!

## Next Steps

1. **Commit and push:**
   ```bash
   git add requirements.txt runtime.txt
   git commit -m "Add psycopg fallback for Python 3.13 compatibility"
   git push
   ```

2. **On Render:**
   - Manual Deploy → Clear build cache & deploy
   - OR wait for automatic deploy

3. **Check logs:**
   - Should see: `[OK] Database connection test successful`
   - No more psycopg2 import errors

## Why This Works

- `psycopg` (version 3) is the modern replacement for `psycopg2`
- It supports Python 3.13
- SQLAlchemy works with both psycopg2 and psycopg
- No code changes needed - it's a drop-in replacement

The app will now work whether Render uses Python 3.12 or 3.13!
