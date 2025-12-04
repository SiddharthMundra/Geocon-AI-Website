# SharePoint Integration Setup Guide

## What Was Implemented

I've added SharePoint search functionality to your AI Usage Monitor. When users check the "Search SharePoint" option, the system will:

1. Search through Geocon's SharePoint for relevant documents
2. Retrieve content from matching documents
3. Use that content as context for the AI response
4. The AI will cite SharePoint sources when using information from them

## How It Works

### User Flow:
1. User enters their question
2. User checks "🔍 Search Geocon SharePoint for relevant information"
3. System searches SharePoint using Microsoft Graph API
4. Finds relevant documents (up to 5)
5. Extracts content from those documents
6. Sends user question + SharePoint content to Azure OpenAI
7. AI responds using SharePoint information when relevant
8. Response shows how many SharePoint documents were found

## Configuration Required

You need to set up Azure AD App Registration to access SharePoint. Here's what you need:

### Step 1: Create Azure AD App Registration

1. Go to Azure Portal: https://portal.azure.com
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **+ New registration**
4. Name: "Geocon AI SharePoint Access"
5. Supported account types: **Accounts in this organizational directory only**
6. Redirect URI: Leave blank (not needed for this)
7. Click **Register**

### Step 2: Get Client ID and Create Secret

1. **Copy the Application (client) ID** - you'll need this
2. Go to **Certificates & secrets**
3. Click **+ New client secret**
4. Description: "SharePoint Access Secret"
5. Expires: Choose appropriate duration
6. Click **Add**
7. **IMPORTANT: Copy the secret value immediately** (you can't see it again!)

### Step 3: Grant API Permissions

1. Go to **API permissions**
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Choose **Application permissions** (not Delegated)
5. Add these permissions:
   - `Sites.Read.All` - Read all site collections
   - `Files.Read.All` - Read all files
   - `Sites.Search.All` - Search all sites
6. Click **Add permissions**
7. **IMPORTANT: Click "Grant admin consent"** (required for app permissions)

### Step 4: Get Your SharePoint Details

1. **SharePoint Site URL**: 
   - Go to your SharePoint site
   - Copy the URL (e.g., `https://geocon.sharepoint.com/sites/YourSite`)
   
2. **Tenant ID/Name**:
   - Your tenant is usually: `geocon.onmicrosoft.com` or `geoconinc.com`
   - You can find it in Azure AD → Overview → Primary domain

### Step 5: Configure in app.py

Update these environment variables or edit `app.py` directly:

```python
SHAREPOINT_SITE_URL = 'https://geocon.sharepoint.com/sites/YourSite'
SHAREPOINT_TENANT = 'geocon.onmicrosoft.com'  # or geoconinc.com
SHAREPOINT_CLIENT_ID = 'your-client-id-here'
SHAREPOINT_CLIENT_SECRET = 'your-client-secret-here'
SHAREPOINT_USE_GRAPH_API = 'true'  # Keep as 'true'
```

## Testing

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the server:**
   ```bash
   python app.py
   ```

3. **Test SharePoint search:**
   - Open the website
   - Enter a question
   - Check "Search SharePoint" checkbox
   - Submit
   - Check terminal for SharePoint search logs
   - Response should indicate if SharePoint documents were found

## How It Searches

The system uses **Microsoft Graph API Search** which:
- Searches across all SharePoint sites you have access to
- Looks in documents, lists, sites
- Returns relevant results based on your query
- Extracts content from documents when possible
- Limits to top 5 most relevant results

## Troubleshooting

### "SharePoint not configured"
- Make sure all SharePoint variables are set in `app.py`
- Check that values are not empty

### "Could not get SharePoint access token"
- Verify Client ID and Secret are correct
- Check that admin consent was granted
- Verify tenant name is correct

### "No relevant SharePoint documents found"
- This is normal if your query doesn't match any documents
- Try more specific keywords
- Check that the app has permissions to search

### "ERROR searching SharePoint"
- Check terminal for detailed error
- Verify API permissions are granted
- Make sure admin consent was clicked

## Security Notes

- Client Secret should be kept secure
- Consider using environment variables instead of hardcoding
- The app uses application permissions (service account)
- All searches are logged in the terminal

## Next Steps

1. Get SharePoint credentials from IT/Admin
2. Create Azure AD App Registration
3. Grant permissions
4. Update `app.py` with credentials
5. Test with a simple query
6. Verify SharePoint documents are being found

## Alternative: User Authentication

If you want users to search with their own permissions (instead of service account):
- Use **Delegated permissions** instead of Application permissions
- Implement MSAL.js for user authentication
- Pass user token to backend
- More complex but uses user's own access rights

