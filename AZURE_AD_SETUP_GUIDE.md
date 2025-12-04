# Complete Azure AD Setup Guide for SharePoint READ-ONLY Access

## ⚠️ CRITICAL: READ-ONLY ACCESS ONLY

This setup ensures **100% READ-ONLY** access to SharePoint. The application will:
- ✅ **SEARCH** SharePoint documents
- ✅ **READ** document content
- ❌ **NEVER** modify, delete, create, or write anything
- ❌ **NEVER** change permissions
- ❌ **NEVER** update metadata

All operations use **READ-ONLY** permissions only.

---

## Your SharePoint Information

**SharePoint Site:** `https://geoconmail.sharepoint.com/sites/GeoconCentral`

---

## What I Need From You (After Setup)

Once you complete the setup below, provide me with these **4 pieces of information**:

1. **Tenant Name**: Usually `geoconmail.onmicrosoft.com` or `geoconmail.com`
2. **Client ID**: The Application (client) ID (looks like: `12345678-1234-1234-1234-123456789abc`)
3. **Client Secret**: The secret value (looks like: `abc123~XYZ...`)
4. **Confirm Site URL**: `https://geoconmail.sharepoint.com/sites/GeoconCentral`

---

## Step-by-Step Instructions

### STEP 1: Go to Azure Portal

1. Open your browser
2. Go to: **https://portal.azure.com**
3. Sign in with your **Geocon Microsoft account** (the one with admin access)

### STEP 2: Find Azure Active Directory

1. In the **search bar at the top**, type: `Azure Active Directory`
2. Click on **"Azure Active Directory"** from the results
3. You should see the Azure AD overview page

### STEP 3: Create App Registration

1. In the **left menu**, click **"App registrations"**
2. Click the **"+ New registration"** button (usually top left, blue button)

### STEP 4: Fill in App Details

**Name:**
```
Geocon AI SharePoint Reader
```
(You can use any name, but make it clear it's for reading only)

**Supported account types:**
- Click the dropdown
- Select: **"Accounts in this organizational directory only (Single tenant - geoconmail only)"**
- This ensures only Geocon employees can use it

**Redirect URI:**
- **Leave this completely BLANK** (not needed for this type of app)
- Don't select any platform

Click the **"Register"** button (blue button at bottom)

### STEP 5: Copy the Client ID

1. After clicking Register, you'll see the app overview page
2. Look for **"Application (client) ID"**
3. It's a long string like: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
4. **Click the copy icon** next to it
5. **Save this somewhere safe** - you'll need it!

### STEP 6: Create Client Secret

1. In the **left menu**, click **"Certificates & secrets"**
2. Click **"+ New client secret"** button
3. Fill in:
   - **Description**: `SharePoint Read-Only Access`
   - **Expires**: Choose **"24 months"** (or "Never" for testing)
4. Click **"Add"**
5. **⚠️ CRITICAL STEP:**
   - You'll see a new secret appear in the list
   - **Click the copy icon** in the "Value" column (NOT the Secret ID!)
   - **Copy it immediately** - you can only see it once!
   - It looks like: `abc123~XYZ789...` (long string with special characters)
   - **Save this securely!**

### STEP 7: Add READ-ONLY API Permissions

1. In the **left menu**, click **"API permissions"**
2. You'll see some default permissions - that's okay
3. Click **"+ Add a permission"** button
4. Select **"Microsoft Graph"**
5. **IMPORTANT:** Select **"Application permissions"** (NOT "Delegated permissions")
6. In the search box, search for and add these **READ-ONLY** permissions:

   **Permission 1:**
   - Search: `Sites.Read.All`
   - Check the box next to it
   - Description: "Read items in all site collections"

   **Permission 2:**
   - Search: `Files.Read.All`
   - Check the box next to it
   - Description: "Read all files that the app can access"

   **Permission 3:**
   - Search: `Sites.Search.All`
   - Check the box next to it
   - Description: "Search all sites"

7. **DO NOT ADD** any permissions with "Write" in the name!
8. Click **"Add permissions"** button

### STEP 8: Grant Admin Consent (REQUIRED!)

1. After adding permissions, you'll see them in a table
2. Look for a button that says: **"Grant admin consent for [Your Organization]"**
3. **Click that button**
4. A popup will ask "Are you sure?" - Click **"Yes"**
5. Wait a few seconds
6. You should see:
   - ✅ Green checkmarks next to each permission
   - Status column shows: **"Granted for [Your Organization]"**
   - A green checkmark in the "Status" column

**⚠️ THIS STEP IS CRITICAL - Without admin consent, the app won't work!**

### STEP 9: Find Your Tenant Name

1. Go back to **Azure Active Directory** (click it in the breadcrumb or search)
2. Click **"Overview"** in the left menu
3. Look for **"Primary domain"** or **"Tenant ID"**
4. Your tenant is usually:
   - `geoconmail.onmicrosoft.com` (most common)
   - Or `geoconmail.com`
   - Or check the "Primary domain" field

**Write this down!**

---

## STEP 10: Update app.py

Once you have all 4 pieces of information, I'll update `app.py` with:

```python
SHAREPOINT_SITE_URL = 'https://geoconmail.sharepoint.com/sites/GeoconCentral'
SHAREPOINT_TENANT = 'geoconmail.onmicrosoft.com'  # Your tenant from Step 9
SHAREPOINT_CLIENT_ID = 'your-client-id-from-step-5'
SHAREPOINT_CLIENT_SECRET = 'your-client-secret-from-step-6'
```

---

## Verification Checklist

Before testing, verify:

- ✅ App registration created successfully
- ✅ Client ID copied and saved
- ✅ Client Secret created and **Value** copied (not Secret ID!)
- ✅ **READ-ONLY** permissions added:
  - ✅ Sites.Read.All
  - ✅ Files.Read.All
  - ✅ Sites.Search.All
- ✅ **NO Write permissions** added
- ✅ Admin consent granted (green checkmarks ✅)
- ✅ Tenant name identified
- ✅ All 4 values ready to provide

---

## Security Guarantees

✅ **100% READ-ONLY Operations:**
- Only uses GET requests (read operations)
- Only uses READ permissions
- Never uses POST/PUT/DELETE for modifications
- Never writes to SharePoint
- Never deletes anything
- Never creates new items

✅ **Permissions Used:**
- `Sites.Read.All` - Read sites only
- `Files.Read.All` - Read files only
- `Sites.Search.All` - Search only

❌ **Permissions NOT Used:**
- Sites.ReadWrite.All
- Files.ReadWrite.All
- Any permission with "Write" in the name

---

## Testing After Setup

1. **Update app.py** with your credentials
2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Run server:**
   ```bash
   python app.py
   ```
4. **Check terminal output:**
   - Should show SharePoint configuration
   - Should show "SharePoint search will be enabled"
5. **Test in browser:**
   - Enter a question
   - Check "Search SharePoint" box
   - Submit
   - Check terminal for SharePoint search logs

---

## Troubleshooting

### "Could not get SharePoint access token"
- ✅ Verify Client ID is correct (no extra spaces)
- ✅ Verify Client Secret is correct (the Value, not the Secret ID)
- ✅ Check that admin consent was granted (green checkmarks)
- ✅ Verify tenant name is correct

### "Insufficient privileges" or "Access denied"
- ✅ Make sure you selected **Application permissions** (not Delegated)
- ✅ Verify admin consent was granted
- ✅ Check that all 3 READ-ONLY permissions are added
- ✅ Wait a few minutes after granting consent (can take time to propagate)

### "No relevant SharePoint documents found"
- ✅ This is normal if your query doesn't match documents
- ✅ Try more specific keywords
- ✅ Check that the app has access to the SharePoint site
- ✅ Verify SharePoint site URL is correct

---

## What to Send Me

After completing all steps, send me:

1. **Tenant**: `geoconmail.onmicrosoft.com` (or whatever yours is)
2. **Client ID**: `a1b2c3d4-e5f6-7890-abcd-ef1234567890` (your actual ID)
3. **Client Secret**: `abc123~XYZ...` (your actual secret value)
4. **Site URL**: `https://geoconmail.sharepoint.com/sites/GeoconCentral` (confirm this is correct)

I'll update the code immediately!

---

## Quick Reference

**Your SharePoint:** `https://geoconmail.sharepoint.com/sites/GeoconCentral`

**Required Permissions (READ-ONLY):**
- Sites.Read.All
- Files.Read.All
- Sites.Search.All

**What the App Does:**
- Searches SharePoint for relevant documents
- Reads document content
- Uses that content to answer questions
- **NEVER modifies anything**

---

## Need Help?

If you get stuck on any step:
1. Take a screenshot of where you are
2. Check the troubleshooting section
3. Make sure admin consent was granted (most common issue)
4. Verify you copied the Secret **Value**, not the Secret ID
