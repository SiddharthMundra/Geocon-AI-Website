# Quick Deploy to Render (5 Minutes)

## Fastest Way to Go Live

### 1. Push to GitHub (2 minutes)

```bash
# In your project folder
git init
git add .
git commit -m "Ready to deploy"
git remote add origin https://github.com/YOUR_USERNAME/geocon-ai-website.git
git push -u origin main
```

### 2. Deploy to Render (3 minutes)

1. Go to https://render.com
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Select your repository
5. Settings:
   - **Name:** `geocon-ai-website`
   - **Start Command:** `gunicorn app:app`
   - **Instance:** `Free`
6. Add Environment Variables:
   - `AZURE_OPENAI_ENDPOINT` = `https://openai-aiwebsite.cognitiveservices.azure.com/`
   - `AZURE_OPENAI_KEY` = `33xQjIc1c9OsaYY1WkOe4TVh8plFjBkYaXTbsD30uJ283hLnfqdwJQQJ99BLAC4f1cMXJ3w3AAAAACOGwcit`
   - `AZURE_OPENAI_DEPLOYMENT` = `gpt-4.1`
   - `AZURE_API_VERSION` = `2024-12-01-preview`
7. Click "Create Web Service"
8. Wait 2-5 minutes
9. **Done!** Your site is live at `https://your-app.onrender.com`

---

## What Changed?

✅ Flask now serves your HTML/CSS/JS files  
✅ API URL automatically detects production vs local  
✅ Added `gunicorn` for production server  
✅ Created `Procfile` for deployment  
✅ Created deployment guide

---

## Your Live URL

After deployment, you'll get: `https://your-app-name.onrender.com`

**Share this with your team!** 🎉


