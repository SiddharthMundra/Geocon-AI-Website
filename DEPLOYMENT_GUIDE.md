# Free Hosting Deployment Guide

This guide will help you deploy your Geocon AI website to **Render** (recommended) or other free hosting platforms.

## 🎯 Recommended: Render (Easiest & Most Reliable)

### Why Render?
- ✅ **100% Free** for web services
- ✅ **Easy setup** - connect GitHub and deploy
- ✅ **Automatic HTTPS** (secure connection)
- ✅ **Auto-deploy** on code changes
- ✅ **Free SSL certificate**
- ✅ **No credit card required**

### Step 1: Prepare Your Code

1. **Make sure all files are ready:**
   - ✅ `app.py` - Your Flask backend
   - ✅ `index.html`, `admin.html` - Frontend pages
   - ✅ `script.js`, `styles.css`, `admin.js`, `admin.css` - Frontend assets
   - ✅ `requirements.txt` - Python dependencies
   - ✅ `Procfile` - Tells Render how to run your app
   - ✅ `runtime.txt` - Python version
   - ✅ `logo.png` - Your logo (if you have one)

2. **Remove hardcoded API keys from `app.py`:**
   - The code already uses environment variables, but double-check
   - Make sure no API keys are hardcoded in the file

### Step 2: Create a GitHub Repository

1. **Install Git** (if not already installed): https://git-scm.com/downloads

2. **Initialize Git repository:**
   ```bash
   cd "C:\Users\mundra s\OneDrive - Geocon, Inc\Desktop\Geocon\Projects\Geocon AI Website"
   git init
   ```

3. **Add all files:**
   ```bash
   git add .
   ```

4. **Commit files:**
   ```bash
   git commit -m "Initial commit - Geocon AI Website"
   ```

5. **Create a GitHub account** (if you don't have one): https://github.com

6. **Create a new repository on GitHub:**
   - Go to https://github.com/new
   - Name it: `geocon-ai-website` (or any name)
   - Make it **Private** (recommended for security)
   - Don't initialize with README
   - Click "Create repository"

7. **Push your code to GitHub:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/geocon-ai-website.git
   git branch -M main
   git push -u origin main
   ```
   (Replace `YOUR_USERNAME` with your GitHub username)

### Step 3: Deploy to Render

1. **Sign up for Render:**
   - Go to https://render.com
   - Click "Get Started for Free"
   - Sign up with GitHub (easiest way)

2. **Create a New Web Service:**
   - Click "New +" → "Web Service"
   - Connect your GitHub account if not already connected
   - Select your repository: `geocon-ai-website`

3. **Configure the Service:**
   - **Name:** `geocon-ai-website` (or any name)
   - **Region:** Choose closest to you (e.g., `Oregon (US West)`)
   - **Branch:** `main`
   - **Root Directory:** Leave empty (or `.` if needed)
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
   - **Instance Type:** `Free` (512 MB RAM)

4. **Add Environment Variables:**
   Click "Advanced" → "Add Environment Variable" and add:

   ```
   AZURE_OPENAI_ENDPOINT=https://openai-aiwebsite.cognitiveservices.azure.com/
   AZURE_OPENAI_KEY=33xQjIc1c9OsaYY1WkOe4TVh8plFjBkYaXTbsD30uJ283hLnfqdwJQQJ99BLAC4f1cMXJ3w3AAAAACOGwcit
   AZURE_OPENAI_DEPLOYMENT=gpt-4.1
   AZURE_API_VERSION=2024-12-01-preview
   ```

   **Optional (for SharePoint):**
   ```
   SHAREPOINT_SITE_URL=https://geoconmail.sharepoint.com/sites/GeoconCentral
   SHAREPOINT_TENANT=geoconmail.onmicrosoft.com
   SHAREPOINT_CLIENT_ID=your-client-id
   SHAREPOINT_CLIENT_SECRET=your-client-secret
   SHAREPOINT_USE_GRAPH_API=true
   ```

5. **Deploy:**
   - Click "Create Web Service"
   - Render will automatically:
     - Clone your repository
     - Install dependencies
     - Start your app
   - Wait 2-5 minutes for deployment

6. **Get Your URL:**
   - Once deployed, you'll get a URL like: `https://geocon-ai-website.onrender.com`
   - **This is your live website!** 🎉

### Step 4: Test Your Deployment

1. **Visit your URL:** `https://your-app-name.onrender.com`
2. **Test the main page** - should load `index.html`
3. **Test submitting a prompt** - should work!
4. **Test admin page:** `https://your-app-name.onrender.com/admin.html`

---

## 🔄 Alternative: Railway (Also Free)

### Why Railway?
- ✅ **Free tier** with $5 credit monthly
- ✅ **Easy deployment**
- ✅ **Good for Python apps**

### Steps:

1. **Sign up:** https://railway.app
2. **New Project** → "Deploy from GitHub repo"
3. **Select your repository**
4. **Add environment variables** (same as Render)
5. **Deploy!**

Railway will auto-detect Python and deploy.

---

## 🔄 Alternative: Fly.io (Also Free)

### Why Fly.io?
- ✅ **Free tier** available
- ✅ **Good performance**
- ✅ **Global deployment**

### Steps:

1. **Install Fly CLI:**
   ```bash
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. **Sign up:** https://fly.io
3. **Login:**
   ```bash
   fly auth login
   ```

4. **Create app:**
   ```bash
   fly launch
   ```

5. **Add secrets (environment variables):**
   ```bash
   fly secrets set AZURE_OPENAI_ENDPOINT="https://openai-aiwebsite.cognitiveservices.azure.com/"
   fly secrets set AZURE_OPENAI_KEY="your-key"
   fly secrets set AZURE_OPENAI_DEPLOYMENT="gpt-4.1"
   fly secrets set AZURE_API_VERSION="2024-12-01-preview"
   ```

6. **Deploy:**
   ```bash
   fly deploy
   ```

---

## 🔄 Alternative: PythonAnywhere (Also Free)

### Why PythonAnywhere?
- ✅ **Free tier** available
- ✅ **Python-focused**
- ✅ **Simple setup**

### Steps:

1. **Sign up:** https://www.pythonanywhere.com
2. **Upload files** via web interface
3. **Create web app** → Flask
4. **Set environment variables** in web app config
5. **Reload web app**

---

## 📝 Important Notes

### Security:
- ✅ **Never commit API keys** to GitHub
- ✅ Use environment variables (already set up)
- ✅ Keep your repository **private** if possible

### Free Tier Limitations:
- **Render:** App sleeps after 15 minutes of inactivity (wakes up on first request)
- **Railway:** $5 credit monthly (usually enough for small apps)
- **Fly.io:** Limited resources on free tier
- **PythonAnywhere:** Limited CPU time on free tier

### Updating Your App:
1. **Make changes** to your code
2. **Commit and push to GitHub:**
   ```bash
   git add .
   git commit -m "Update description"
   git push
   ```
3. **Render/Railway will auto-deploy** (if auto-deploy is enabled)

### Custom Domain (Optional):
- Render, Railway, and Fly.io all support custom domains
- You can add your own domain (e.g., `ai.geocon.com`) later

---

## 🐛 Troubleshooting

### App won't start:
- Check logs in Render dashboard
- Verify all environment variables are set
- Check `requirements.txt` has all dependencies

### 404 errors:
- Make sure `Procfile` exists and has: `web: gunicorn app:app`
- Check that `gunicorn` is in `requirements.txt`

### API errors:
- Verify environment variables are correct
- Check Azure OpenAI credentials
- Look at Render logs for detailed errors

### Static files not loading:
- The app now serves static files automatically
- Check file paths in HTML (should be relative, like `styles.css`)

---

## ✅ Checklist Before Deploying

- [ ] All files committed to Git
- [ ] Pushed to GitHub
- [ ] No hardcoded API keys in code
- [ ] `requirements.txt` has all dependencies
- [ ] `Procfile` exists with `web: gunicorn app:app`
- [ ] `runtime.txt` exists (optional but recommended)
- [ ] Environment variables ready to add
- [ ] Tested locally that app works

---

## 🎉 After Deployment

Your website will be live at: `https://your-app-name.onrender.com`

**Share this URL with your team!** Everyone can now access it from anywhere.

---

## Need Help?

- **Render Docs:** https://render.com/docs
- **Railway Docs:** https://docs.railway.app
- **Fly.io Docs:** https://fly.io/docs

