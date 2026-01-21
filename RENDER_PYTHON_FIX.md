# Fix Python 3.13 Issue on Render

## Problem
Render is still using Python 3.13 even though `runtime.txt` specifies Python 3.12.7.

## Solution: Use psycopg instead of psycopg2-binary

Since Render might be ignoring `runtime.txt` or caching Python 3.13, we'll use `psycopg` which supports Python 3.13.

## What Changed

1. **Updated `requirements.txt`:**
   - Uses `psycopg2-binary` for Python < 3.13
   - Uses `psycopg[binary]` for Python >= 3.13
   - This ensures compatibility with both versions

2. **No code changes needed:**
   - SQLAlchemy works with both psycopg2 and psycopg
   - The connection string format is the same

## How to Deploy

1. **Commit and push:**
   ```bash
   git add requirements.txt
   git commit -m "Add psycopg support for Python 3.13"
   git push
   ```

2. **On Render:**
   - Go to your service dashboard
   - Click "Manual Deploy" → "Clear build cache & deploy"
   - This forces a fresh build

3. **Verify:**
   - Check logs for: `[OK] Database connection test successful`
   - No more psycopg2 import errors

## Alternative: Force Python 3.12 in Render

If you want to force Python 3.12 instead:

1. **In Render Dashboard:**
   - Go to your service
   - Settings → Environment
   - Add environment variable:
     - Key: `PYTHON_VERSION`
     - Value: `3.12.7`

2. **Or update `runtime.txt` format:**
   Make sure it's exactly:
   ```
   python-3.12.7
   ```
   (No extra spaces, no blank lines)

## Testing

After deployment, check Render logs. You should see:
```
[OK] Database connection test successful
[OK] Database tables created/verified successfully
```

If you still see errors, the psycopg fallback will handle Python 3.13 automatically.
