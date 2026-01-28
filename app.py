from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import AzureOpenAI
import json
import os
from datetime import datetime, timedelta
import re
import requests
from urllib.parse import quote
import base64
import io
import secrets
from functools import wraps
from database import db, init_db, User, Conversation, Message, Submission, AuditLog, Usage, get_or_create_user, update_user_last_login

app = Flask(__name__, static_folder='.', static_url_path='')
# Configure CORS with security restrictions
CORS(app, resources={
    r"/api/*": {
        "origins": os.getenv('ALLOWED_ORIGINS', '*').split(','),
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-User-Email"],
        "max_age": 3600
    }
})

# Database configuration
# Use DATABASE_URL from environment variable (NEVER hardcode credentials)
# PostgreSQL ONLY - No SQLite fallback for production
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL or DATABASE_URL.strip() == '':
    print("=" * 60)
    print("FATAL ERROR: DATABASE_URL environment variable is not set!")
    print("This application requires PostgreSQL. Please set DATABASE_URL")
    print("in your environment or Render dashboard.")
    print("=" * 60)
    raise RuntimeError("DATABASE_URL environment variable is required")

# Render PostgreSQL URLs sometimes need sslmode
# Convert postgres:// to postgresql:// (SQLAlchemy prefers postgresql://)
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

# Check if we're using psycopg (v3) instead of psycopg2
# If psycopg is installed, use it; otherwise use psycopg2
try:
    import psycopg
    # Use psycopg driver (version 3) - works with Python 3.13
    if DATABASE_URL.startswith('postgresql://'):
        DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+psycopg://', 1)
    print(f"Using psycopg (v3) driver for PostgreSQL")
except ImportError:
    try:
        import psycopg2
        # Use psycopg2 driver (version 2) - works with Python < 3.13
        print(f"Using psycopg2 driver for PostgreSQL")
    except ImportError:
        print("FATAL ERROR: Neither psycopg nor psycopg2 found!")
        raise RuntimeError("PostgreSQL driver (psycopg or psycopg2) is required")

# Only print first 50 chars of database URL for security (don't log full credentials)
db_url_preview = DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL[:50]
print(f"Database URL configured: ...@{db_url_preview}")

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# PostgreSQL connection settings for production (20+ concurrent users)
connect_args = {
    'connect_timeout': 10,  # Connection timeout in seconds
    'application_name': 'geocon_ai_app',
    'sslmode': 'require'  # Render and most cloud providers require SSL
}
engine_options = {
    'pool_pre_ping': True,  # Verify connections before using
    'pool_recycle': 300,    # Recycle connections after 5 minutes
    'pool_size': 20,        # Number of connections to maintain
    'max_overflow': 10,     # Additional connections beyond pool_size
    'pool_timeout': 30,     # Timeout for getting connection from pool
    'connect_args': connect_args
}

app.config['SQLALCHEMY_ENGINE_OPTIONS'] = engine_options

# Ensure no bind key is set (use default)
# Remove SQLALCHEMY_BINDS if it exists to avoid bind key errors
if 'SQLALCHEMY_BINDS' in app.config:
    del app.config['SQLALCHEMY_BINDS']

# Explicitly set to use default bind (no bind key)
app.config.pop('SQLALCHEMY_BINDS', None)

# Initialize database
try:
    init_db(app)
    print(f"[OK] Database initialized: {app.config['SQLALCHEMY_DATABASE_URI'][:50]}...")
except Exception as e:
    print(f"WARNING: Database initialization failed: {e}")
    print("The app will continue but database features may not work.")

# Azure OpenAI Configuration
# All credentials must come from environment variables (NEVER hardcode)
AZURE_OPENAI_ENDPOINT = os.getenv('AZURE_OPENAI_ENDPOINT')
AZURE_OPENAI_KEY = os.getenv('AZURE_OPENAI_KEY')
AZURE_OPENAI_DEPLOYMENT = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'gpt-4.1')
AZURE_API_VERSION = os.getenv('AZURE_API_VERSION', '2024-12-01-preview')

# SharePoint Configuration - READ-ONLY ACCESS ONLY
# Your SharePoint: https://geoconmail.sharepoint.com/sites/GeoconCentral
SHAREPOINT_SITE_URL = os.getenv('SHAREPOINT_SITE_URL', 'https://geoconmail.sharepoint.com/sites/GeoconCentral')
SHAREPOINT_TENANT = os.getenv('SHAREPOINT_TENANT', '')  # e.g., 'geoconmail.onmicrosoft.com' or 'geoconmail.com'
SHAREPOINT_CLIENT_ID = os.getenv('SHAREPOINT_CLIENT_ID', '')  # Azure AD App Client ID
SHAREPOINT_CLIENT_SECRET = os.getenv('SHAREPOINT_CLIENT_SECRET', '')  # Azure AD App Client Secret
SHAREPOINT_USE_GRAPH_API = os.getenv('SHAREPOINT_USE_GRAPH_API', 'true').lower() == 'true'
# IMPORTANT: All operations are READ-ONLY - no modifications, deletions, or writes to SharePoint
# Only uses: GET requests, Sites.Read.All, Files.Read.All, Sites.Search.All permissions

DATA_FILE = 'submissions.json'

# Security: File upload limits
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB per file
MAX_FILES = 5  # Maximum number of files per request
ALLOWED_EXTENSIONS = {'.txt', '.pdf', '.doc', '.docx', '.csv', '.md', '.json', 
                     '.py', '.js', '.html', '.css', '.xlsx', '.xls', '.pptx', '.ppt'}

# Admin email list - only these users can access admin endpoints
ADMIN_EMAILS = ['carter@geoconinc.com', 'mundra@geoconinc.com']

# Audit Logging Functions
def get_client_ip():
    """Get client IP address from request"""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    elif request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    else:
        return request.remote_addr or 'unknown'

def log_audit_event(action_type, action_category, description, user_id=None, user_email=None, 
                   status='success', metadata=None):
    """
    Log an audit event to the database
    
    Args:
        action_type: Type of action (e.g., 'login', 'logout', 'admin_access', 'data_access')
        action_category: Category of action ('authentication', 'admin', 'data', 'security', 'system')
        description: Human-readable description
        user_id: User ID (optional)
        user_email: User email (optional, but recommended)
        status: 'success', 'failure', 'error', 'unauthorized'
        metadata: Additional context (dict)
    """
    try:
        audit_log = AuditLog(
            timestamp=datetime.utcnow(),
            actor_user_id=user_id,  # Use actor_user_id (new field)
            user_id=user_id,  # Keep for backward compatibility
            user_email=user_email,
            action=action_type,  # Use action (new field)
            action_type=action_type,  # Keep for backward compatibility
            action_category=action_category,
            description=description,
            ip_address=get_client_ip(),
            user_agent=request.headers.get('User-Agent', '')[:500],
            request_method=request.method,
            request_path=request.path[:500],
            status=status,
            audit_metadata=metadata or {}  # Use audit_metadata (metadata is reserved in SQLAlchemy)
        )
        db.session.add(audit_log)
        db.session.commit()
    except Exception as e:
        # Don't fail the request if audit logging fails
        print(f"ERROR: Failed to log audit event: {e}")
        db.session.rollback()
        # Try to log to console as fallback
        print(f"AUDIT: {action_type} | {action_category} | {user_email} | {description} | {status}")

def require_admin(f):
    """Decorator to require admin access for admin endpoints"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get user email from request (either from JSON body or query params)
        user_email = None
        
        # Try to get from JSON body
        if request.is_json and request.json:
            user_email = (request.json.get('email') or '').strip().lower() if request.json else ''
        
        # Try to get from query params
        if not user_email:
            user_email = (request.args.get('email') or '').strip().lower()
        
        # Try to get from headers (for API calls)
        if not user_email:
            user_email = (request.headers.get('X-User-Email') or '').strip().lower()
        
        # Validate admin access
        if not user_email or user_email not in [email.lower() for email in ADMIN_EMAILS]:
            # Log unauthorized access attempt
            log_audit_event(
                action_type='unauthorized_admin_access',
                action_category='security',
                description=f'Unauthorized attempt to access admin endpoint: {request.path}',
                user_email=user_email or 'unknown',
                status='unauthorized',
                metadata={'endpoint': request.path, 'method': request.method}
            )
            return jsonify({
                'error': 'Unauthorized: Admin access required',
                'message': 'Only authorized administrators can access this endpoint.'
            }), 403
        
        # Log successful admin access
        log_audit_event(
            action_type='admin_access',
            action_category='admin',
            description=f'Admin accessed endpoint: {request.path}',
            user_email=user_email,
            status='success',
            metadata={'endpoint': request.path, 'method': request.method}
        )
        
        return f(*args, **kwargs)
    return decorated_function

# Initialize Azure OpenAI client
if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_KEY:
    print("ERROR: Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY")
    client = None
else:
    client = AzureOpenAI(
        api_version=AZURE_API_VERSION,
        azure_endpoint=AZURE_OPENAI_ENDPOINT.rstrip('/'),
        api_key=AZURE_OPENAI_KEY
    )
    print(f"Azure OpenAI configured")
    print(f"Endpoint: {AZURE_OPENAI_ENDPOINT}")
    print(f"Deployment: {AZURE_OPENAI_DEPLOYMENT}")
    print(f"API Version: {AZURE_API_VERSION}")

# Confidential information patterns for checking
CONFIDENTIAL_PATTERNS = [
    {
        'name': 'Social Security Numbers',
        'pattern': re.compile(r'\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b'),
        'severity': 'danger'
    },
    {
        'name': 'Credit Card Numbers',
        'pattern': re.compile(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'),
        'severity': 'danger'
    },
    {
        'name': 'Email Addresses',
        'pattern': re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),
        'severity': 'warning'
    },
    {
        'name': 'Phone Numbers',
        'pattern': re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\(\d{3}\)\s?\d{3}-\d{4}\b'),
        'severity': 'warning'
    },
    {
        'name': 'IP Addresses',
        'pattern': re.compile(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b'),
        'severity': 'warning'
    },
    {
        'name': 'Confidential Keywords',
        'pattern': re.compile(r'\b(confidential|proprietary|secret|classified|internal|private|restricted|sensitive|NDA|non-disclosure)\b', re.IGNORECASE),
        'severity': 'warning'
    },
    {
        'name': 'Financial Information',
        'pattern': re.compile(r'\b(\$[\d,]+|USD|EUR|GBP|account\s+number|routing\s+number|bank\s+account)\b', re.IGNORECASE),
        'severity': 'danger'
    },
    {
        'name': 'Passwords',
        'pattern': re.compile(r'\b(password|passwd|pwd|secret\s+key|api\s+key|access\s+token)\s*[:=]\s*\S+', re.IGNORECASE),
        'severity': 'danger'
    }
]


def check_confidential_info(text):
    """Check if text contains confidential information patterns"""
    results = []
    has_danger = False
    has_warning = False
    
    for pattern_info in CONFIDENTIAL_PATTERNS:
        matches = pattern_info['pattern'].findall(text)
        if matches:
            results.append({
                'type': pattern_info['name'],
                'matches': len(matches),
                'severity': pattern_info['severity'],
                'examples': matches[:3]
            })
            
            if pattern_info['severity'] == 'danger':
                has_danger = True
            else:
                has_warning = True
    
    status = 'danger' if has_danger else ('warning' if has_warning else 'safe')
    return status, results


def load_submissions():
    """Load submissions from JSON file"""
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []


def save_submission(submission):
    """Save a submission to JSON file"""
    submissions = load_submissions()
    submissions.append(submission)
    
    with open(DATA_FILE, 'w') as f:
        json.dump(submissions, f, indent=2)
    
    return submission


def get_sharepoint_access_token():
    """Get access token for SharePoint using client credentials"""
    if not SHAREPOINT_CLIENT_ID or not SHAREPOINT_CLIENT_SECRET or not SHAREPOINT_TENANT:
        return None
    
    try:
        token_url = f"https://login.microsoftonline.com/{SHAREPOINT_TENANT}/oauth2/v2.0/token"
        token_data = {
            'client_id': SHAREPOINT_CLIENT_ID,
            'client_secret': SHAREPOINT_CLIENT_SECRET,
            'scope': 'https://graph.microsoft.com/.default',
            'grant_type': 'client_credentials'
        }
        
        response = requests.post(token_url, data=token_data)
        if response.status_code == 200:
            return response.json().get('access_token')
        else:
            print(f"  ERROR getting SharePoint token: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"  ERROR getting SharePoint token: {str(e)}")
        return None


def search_sharepoint_documents(query, max_results=5):
    """
    Search SharePoint for relevant documents and content - READ-ONLY OPERATION
    This function ONLY reads from SharePoint - no modifications, deletions, or writes
    """
    if not SHAREPOINT_SITE_URL or not SHAREPOINT_CLIENT_ID:
        print("  WARNING: SharePoint not configured. Skipping SharePoint search.")
        return []
    
    try:
        print(f"  Searching SharePoint (READ-ONLY) for: {query[:50]}...")
        
        # Get access token
        access_token = get_sharepoint_access_token()
        if not access_token:
            print("  WARNING: Could not get SharePoint access token. Skipping search.")
            return []
        
        # Use Microsoft Graph API to search SharePoint - READ-ONLY operation
        if SHAREPOINT_USE_GRAPH_API:
            search_url = "https://graph.microsoft.com/v1.0/search/query"
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            # Build search query - READ-ONLY search operation
            search_body = {
                "requests": [{
                    "entityTypes": ["driveItem", "listItem", "site"],
                    "query": {
                        "queryString": query
                    },
                    "from": 0,
                    "size": max_results
                }]
            }
            
            # POST request for search (still read-only - just searching, not modifying)
            response = requests.post(search_url, headers=headers, json=search_body)
            
            if response.status_code == 200:
                results = response.json()
                search_results = []
                
                # Extract relevant information from search results
                if 'value' in results and len(results['value']) > 0:
                    hits = results['value'][0].get('hitsContainers', [])
                    if hits and len(hits) > 0:
                        for hit in hits[0].get('hits', [])[:max_results]:
                            resource = hit.get('resource', {})
                            title = resource.get('name', 'Untitled')
                            web_url = resource.get('webUrl', '')
                            snippet = hit.get('summary', '')
                            
                            # Try to get more content if it's a document - READ-ONLY operation
                            content = snippet
                            if 'driveItem' in resource.get('@odata.type', ''):
                                # Try to get document content - READ-ONLY GET request
                                file_id = resource.get('id', '')
                                if file_id:
                                    try:
                                        # GET request to read file content - READ-ONLY
                                        content_url = f"https://graph.microsoft.com/v1.0/drives/{resource.get('parentReference', {}).get('driveId', '')}/items/{file_id}/content"
                                        content_response = requests.get(content_url, headers=headers, stream=True)
                                        if content_response.status_code == 200:
                                            # For text files, read content (limit to first 2000 chars) - READ-ONLY
                                            content = content_response.text[:2000] if content_response.headers.get('content-type', '').startswith('text/') else snippet
                                    except:
                                        pass
                            
                            search_results.append({
                                'title': title,
                                'url': web_url,
                                'content': content or snippet,
                                'snippet': snippet
                            })
                
                print(f"  Found {len(search_results)} SharePoint results")
                return search_results
            else:
                print(f"  ERROR searching SharePoint: {response.status_code} - {response.text[:200]}")
                return []
        else:
            # Alternative: Use SharePoint REST API directly
            print("  SharePoint REST API mode not yet implemented")
            return []
            
    except Exception as e:
        print(f"  ERROR searching SharePoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return []


def build_prompt_with_sharepoint_context(user_prompt, sharepoint_results):
    """Build enhanced prompt with SharePoint context"""
    if not sharepoint_results:
        return user_prompt
    
    context_section = "\n\n--- RELEVANT INFORMATION FROM GEOCON SHAREPOINT ---\n\n"
    context_section += "The following information was found in Geocon's SharePoint that may be relevant to your question:\n\n"
    
    for i, result in enumerate(sharepoint_results, 1):
        context_section += f"[Document {i}: {result['title']}]\n"
        context_section += f"URL: {result['url']}\n"
        context_section += f"Content: {result['content'][:500]}...\n\n"
    
    context_section += "--- END SHAREPOINT INFORMATION ---\n\n"
    context_section += "Please answer the user's question using the information from SharePoint when relevant, "
    context_section += "and cite the source documents when you use information from them.\n\n"
    context_section += f"User's Question: {user_prompt}"
    
    return context_section


def validate_file(file):
    """Validate uploaded file (size and extension)"""
    if not file or not file.filename:
        return False, "No file provided"
    
    filename = file.filename
    file_ext = os.path.splitext(filename)[1].lower()
    
    # Check extension
    if file_ext not in ALLOWED_EXTENSIONS:
        return False, f"File type {file_ext} not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
    
    # Check file size
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)  # Reset file pointer
    
    if file_size > MAX_FILE_SIZE:
        return False, f"File size ({file_size / 1024 / 1024:.2f} MB) exceeds maximum ({MAX_FILE_SIZE / 1024 / 1024} MB)"
    
    if file_size == 0:
        return False, "File is empty"
    
    return True, None

def extract_file_content(file):
    """Extract text content from uploaded file"""
    filename = file.filename
    
    # Validate file first
    is_valid, error_msg = validate_file(file)
    if not is_valid:
        return f"[Error: {error_msg}]"
    
    file_ext = os.path.splitext(filename)[1].lower()
    
    try:
        # Read file content
        file_content = file.read()
        
        # Handle text files
        if file_ext in ['.txt', '.md', '.csv', '.json', '.py', '.js', '.html', '.css', '.xml', '.yaml', '.yml']:
            try:
                return file_content.decode('utf-8')
            except UnicodeDecodeError:
                try:
                    return file_content.decode('latin-1')
                except:
                    return f"[Binary file - cannot extract text]"
        
        # Handle PDF files
        elif file_ext == '.pdf':
            try:
                import PyPDF2
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
                return text.strip() if text.strip() else "[PDF file - text extraction may be limited]"
            except ImportError:
                return "[PDF file - PyPDF2 library not installed. Install with: pip install PyPDF2]"
            except Exception as e:
                return f"[PDF file - error extracting text: {str(e)}]"
        
        # Handle Word documents
        elif file_ext in ['.docx']:
            try:
                from docx import Document
                doc = Document(io.BytesIO(file_content))
                text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
                return text.strip() if text.strip() else "[Word document - text extraction may be limited]"
            except ImportError:
                return "[Word document - python-docx library not installed. Install with: pip install python-docx]"
            except Exception as e:
                return f"[Word document - error extracting text: {str(e)}]"
        
        # Handle Excel files
        elif file_ext in ['.xlsx', '.xls']:
            try:
                import pandas as pd
                excel_file = pd.ExcelFile(io.BytesIO(file_content))
                text_parts = []
                for sheet_name in excel_file.sheet_names:
                    df = pd.read_excel(excel_file, sheet_name=sheet_name)
                    text_parts.append(f"Sheet: {sheet_name}\n{df.to_string()}\n")
                return "\n".join(text_parts)
            except ImportError:
                return "[Excel file - pandas library not installed. Install with: pip install pandas openpyxl]"
            except Exception as e:
                return f"[Excel file - error extracting text: {str(e)}]"
        
        # Handle images (base64 encode for vision models)
        elif file_ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
            # For now, return a note that image was uploaded
            # Azure OpenAI vision support can be added later
            return f"[Image file: {filename} - Image content can be processed if vision model is used]"
        
        else:
            return f"[File type {file_ext} not directly supported - file name: {filename}]"
            
    except Exception as e:
        return f"[Error reading file {filename}: {str(e)}]"


def build_prompt_with_files(user_prompt, file_contents):
    """Build enhanced prompt with file content"""
    if not file_contents:
        return user_prompt
    
    file_section = "\n\n--- UPLOADED FILES CONTENT ---\n\n"
    for i, (filename, content) in enumerate(file_contents, 1):
        file_section += f"File {i}: {filename}\n"
        file_section += f"{'='*60}\n"
        file_section += f"{content}\n"
        file_section += f"{'='*60}\n\n"
    
    return user_prompt + file_section


def get_document_format(document_type):
    """Get the format template for a document type. Returns None if not found."""
    # TODO: You can provide the actual formats here or load from a file/database
    formats = {
        'proposal': """
PROJECT PROPOSAL FORMAT:

1. COVER PAGE
   - Project Title
   - Client Name
   - Date
   - Prepared by: [Your Name/Company]

2. EXECUTIVE SUMMARY
   - Brief overview of the project
   - Key objectives
   - Expected outcomes

3. PROJECT SCOPE
   - Detailed description of work to be performed
   - Deliverables
   - Timeline

4. METHODOLOGY
   - Approach and methods
   - Tools and resources
   - Quality assurance

5. TEAM AND QUALIFICATIONS
   - Key personnel
   - Relevant experience
   - Certifications

6. BUDGET AND COST BREAKDOWN
   - Itemized costs
   - Payment terms
   - Total project cost

7. TIMELINE
   - Project phases
   - Milestones
   - Completion date

8. TERMS AND CONDITIONS
   - Contract terms
   - Liability
   - Intellectual property

9. APPENDICES
   - Supporting documents
   - References
   - Additional information
""",
        'letter': """
BUSINESS LETTER FORMAT:

1. HEADER
   - Your Company Name and Address
   - Date
   - Recipient Name and Address

2. SALUTATION
   - Formal greeting (Dear [Name/Title])

3. BODY
   - Opening paragraph: Purpose of the letter
   - Middle paragraphs: Main content, details, and information
   - Closing paragraph: Next steps or call to action

4. CLOSING
   - Professional closing (Sincerely, Best regards, etc.)
   - Your Name
   - Your Title
   - Company Name
   - Contact Information

5. ENCLOSURES (if applicable)
   - List of attached documents
""",
        'report': """
REPORT FORMAT:

1. TITLE PAGE
   - Report Title
   - Subtitle (if applicable)
   - Author(s)
   - Date
   - Organization

2. TABLE OF CONTENTS
   - List of sections with page numbers

3. EXECUTIVE SUMMARY
   - Key findings
   - Recommendations
   - Conclusions

4. INTRODUCTION
   - Background
   - Objectives
   - Scope

5. METHODOLOGY
   - Data collection methods
   - Analysis approach
   - Tools used

6. FINDINGS/RESULTS
   - Detailed findings
   - Data analysis
   - Observations

7. DISCUSSION
   - Interpretation of results
   - Implications
   - Limitations

8. CONCLUSIONS
   - Summary of key points
   - Main conclusions

9. RECOMMENDATIONS
   - Action items
   - Next steps
   - Suggestions

10. REFERENCES
    - Citations
    - Sources

11. APPENDICES
    - Supporting data
    - Additional materials
    - Charts and graphs
"""
    }
    return formats.get(document_type.lower())


@app.route('/api/document-format/<document_type>', methods=['GET'])
def get_document_format_api(document_type):
    """Return the template/format for a given document type so the UI can prepopulate the prompt."""
    try:
        template = get_document_format(document_type)
        if not template:
            return jsonify({'error': 'Unknown document type'}), 404
        
        return jsonify({
            'type': document_type,
            'template': template
        })
    except Exception as e:
        print(f"Error getting document format for {document_type}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

def call_azure_openai(prompt, sharepoint_context=None, file_contents=None):
    """Call Azure OpenAI API to get response with timeout. Returns (response_text, metadata_dict)"""
    if not client:
        raise Exception("Azure OpenAI client not configured. Please set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY.")
    
    if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_KEY:
        raise Exception("Azure OpenAI credentials not configured. Please set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY environment variables.")
    
    try:
        # Build prompt with file content if provided
        if file_contents:
            prompt = build_prompt_with_files(prompt, file_contents)
        
        # Build prompt with SharePoint context if provided
        final_prompt = build_prompt_with_sharepoint_context(prompt, sharepoint_context) if sharepoint_context else prompt
        
        # Validate final prompt length
        if len(final_prompt) > 200000:  # ~200KB max
            raise Exception("Total prompt size exceeds maximum allowed size")
        
        print(f"  Deployment: {AZURE_OPENAI_DEPLOYMENT}")
        print(f"  Max completion tokens: 2000")  # Increased for longer responses with context
        print(f"  Temperature: 0.7")
        if sharepoint_context:
            print(f"  SharePoint context: {len(sharepoint_context)} documents")
        if file_contents:
            print(f"  File content: {len(file_contents)} files")
        
        # Call with timeout (Azure OpenAI SDK handles timeouts internally)
        import time
        start_time = time.time()
        
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "You are a helpful AI assistant for Geocon, a geotechnical consulting firm. When you use information from SharePoint documents or uploaded files, always cite the source. Be accurate and professional."},
                {"role": "user", "content": final_prompt}
            ],
            max_completion_tokens=2000,  # Increased for longer responses
            temperature=0.7,
            timeout=60.0  # 60 second timeout
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        if not response or not response.choices or len(response.choices) == 0:
            raise Exception("Empty response from Azure OpenAI")
        
        result = response.choices[0].message.content.strip()
        if not result:
            raise Exception("Empty content in response")
        
        # Extract metadata from response
        usage = response.usage if hasattr(response, 'usage') else None
        finish_reason = response.choices[0].finish_reason if hasattr(response.choices[0], 'finish_reason') else None
        
        # Get client context from request
        client_context = {
            'user_agent': request.headers.get('User-Agent', 'Unknown'),
            'ip_address': get_client_ip(),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        metadata = {
            'model': AZURE_OPENAI_DEPLOYMENT,
            'temperature': 0.7,
            'max_completion_tokens': 2000,
            'token_in': usage.prompt_tokens if usage else None,
            'token_out': usage.completion_tokens if usage else None,
            'total_tokens': usage.total_tokens if usage else None,
            'latency_ms': latency_ms,
            'finish_reason': finish_reason,
            'client_context': client_context,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        print(f"  API call successful (latency: {latency_ms}ms, tokens: {metadata.get('total_tokens', 'N/A')})")
        return result, metadata
    except Exception as e:
        error_details = f"Azure OpenAI API error: {str(e)}"
        print(f"  ERROR: {error_details}")
        print(f"  Error type: {type(e).__name__}")
        # Check for specific error types
        if hasattr(e, 'status_code'):
            print(f"  HTTP Status: {e.status_code}")
        if hasattr(e, 'response'):
            print(f"  Response: {e.response}")
        raise Exception(error_details)


@app.route('/api/submit', methods=['POST'])
def submit_prompt():
    """Handle prompt submission with optional file uploads"""
    try:
        print("\n" + "="*60)
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] New submission received")
        print("="*60)
        
        # Handle both JSON and FormData requests
        if request.is_json:
            # JSON request (no files)
            data = request.json
            if not data:
                return jsonify({'error': 'Request body is required'}), 400
            employee_name = (data.get('employeeName') or '').strip()
            prompt = (data.get('prompt') or '').strip()
            search_sharepoint = data.get('searchSharePoint', False) if data else False
            document_type = (data.get('documentType') or '').strip()
            files = []
        else:
            # FormData request (may have files)
            employee_name = (request.form.get('employeeName') or '').strip()
            prompt = (request.form.get('prompt') or '').strip()
            search_sharepoint = request.form.get('searchSharePoint', 'false').lower() == 'true'
            document_type = (request.form.get('documentType') or '').strip()
            files = request.files.getlist('files')
        
        print(f"Request data received: {bool(employee_name and prompt)}")
        print(f"Employee: {employee_name}")
        print(f"Prompt length: {len(prompt)} characters")
        print(f"Search SharePoint: {search_sharepoint}")
        print(f"Files uploaded: {len(files)}")
        
        # Input validation
        if not employee_name or not prompt:
            error_msg = 'Employee name and prompt are required'
            print(f"ERROR: {error_msg}")
            return jsonify({'error': error_msg}), 400
        
        # Validate input lengths to prevent DoS
        if len(prompt) > 50000:  # 50KB max prompt
            error_msg = 'Prompt is too long (maximum 50,000 characters)'
            print(f"ERROR: {error_msg}")
            return jsonify({'error': error_msg}), 400
        
        if len(employee_name) > 255:
            error_msg = 'Employee name is too long (maximum 255 characters)'
            print(f"ERROR: {error_msg}")
            return jsonify({'error': error_msg}), 400
        
        # Process uploaded files with validation
        file_contents = []
        if files:
            if len(files) > MAX_FILES:
                error_msg = f'Maximum {MAX_FILES} files allowed per request'
                print(f"ERROR: {error_msg}")
                # Log file upload violation
                log_audit_event(
                    action_type='file_upload_violation',
                    action_category='security',
                    description=f'File upload limit exceeded: {len(files)} files (max: {MAX_FILES})',
                    user_email=employee_name if '@' in employee_name else f"{employee_name}@geoconinc.com",
                    status='failure',
                    metadata={'files_count': len(files), 'max_allowed': MAX_FILES}
                )
                return jsonify({'error': error_msg}), 400
            
            print("Processing uploaded files...")
            for file in files:
                if file.filename:
                    print(f"  Processing file: {file.filename}")
                    content = extract_file_content(file)
                    if content.startswith("[Error:"):
                        # File validation failed
                        log_audit_event(
                            action_type='file_upload_error',
                            action_category='security',
                            description=f'File validation failed: {file.filename} - {content}',
                            user_email=employee_name if '@' in employee_name else f"{employee_name}@geoconinc.com",
                            status='failure',
                            metadata={'filename': file.filename, 'error': content}
                        )
                        return jsonify({'error': content}), 400
                    file_contents.append((file.filename, content))
                    print(f"  Extracted {len(content)} characters from {file.filename}")
            
            # Log successful file upload
            log_audit_event(
                action_type='file_upload',
                action_category='data',
                description=f'Files uploaded: {len(file_contents)} file(s)',
                user_email=employee_name if '@' in employee_name else f"{employee_name}@geoconinc.com",
                status='success',
                metadata={'files_count': len(file_contents), 'filenames': [f[0] for f in file_contents]}
            )
        
        # Check for confidential information (in prompt and file contents)
        print("Checking for confidential information...")
        all_text_to_check = prompt
        if file_contents:
            all_text_to_check += "\n\n" + "\n\n".join([content for _, content in file_contents])
        
        status, check_results = check_confidential_info(all_text_to_check)
        print(f"Confidential status: {status}")
        if check_results:
            print(f"Found {len(check_results)} potential issues")
        
        # Search SharePoint if enabled
        sharepoint_results = []
        if search_sharepoint:
            print("Searching SharePoint for relevant information...")
            sharepoint_results = search_sharepoint_documents(prompt, max_results=5)
            if sharepoint_results:
                print(f"Found {len(sharepoint_results)} relevant SharePoint documents")
            else:
                print("No relevant SharePoint documents found")
        
        # Get document format if document type is specified
        document_format = None
        if document_type:
            document_format = get_document_format(document_type)
            if document_format:
                print(f"Document type: {document_type}")
                # Enhance prompt with document format instructions
                prompt = f"""Generate a {document_type} based on the following information and requirements.

Document Format Requirements:
{document_format}

User Information and Requirements:
{prompt}

Please generate a complete, professional {document_type} following the format requirements above. Ensure all sections are properly formatted and the document is ready for use."""
        
        # Call Azure OpenAI API
        print("Calling Azure OpenAI API...")
        try:
            chatgpt_response, ai_metadata = call_azure_openai(
                prompt, 
                sharepoint_results if sharepoint_results else None,
                file_contents if file_contents else None
            )
            print(f"Azure OpenAI response received: {len(chatgpt_response)} characters")
            print(f"  Tokens: {ai_metadata.get('total_tokens', 'N/A')}, Latency: {ai_metadata.get('latency_ms', 'N/A')}ms")
        except Exception as e:
            error_msg = f'Failed to get ChatGPT response: {str(e)}'
            print(f"ERROR: {error_msg}")
            print(f"Exception type: {type(e).__name__}")
            import traceback
            print("Traceback:")
            traceback.print_exc()
            return jsonify({
                'error': error_msg,
                'confidentialStatus': status,
                'checkResults': check_results
            }), 500
        
        # Save to database
        try:
            # Get or create user
            # Extract email from employee_name if it's an email, otherwise we need email from request
            employee_email = request.json.get('employeeEmail', '') if request.is_json else request.form.get('employeeEmail', '')
            if not employee_email and '@' in employee_name:
                employee_email = employee_name
                employee_name = employee_name.split('@')[0]
            
            # For now, use employee_name as identifier if no email
            if not employee_email:
                employee_email = f"{employee_name}@geoconinc.com"
            
            user = get_or_create_user(employee_email, employee_name)
            update_user_last_login(user)
            
            # Generate submission ID
            submission_id = f"sub-{datetime.now().timestamp()}-{user.id}"
            
            # Save submission to database
            submission = Submission(
                id=submission_id,
                user_id=user.id,
                prompt=prompt,
                response=chatgpt_response,
                status=status,
                check_results=check_results,
                files_processed=len(file_contents) if file_contents else 0,
                sharepoint_searched=search_sharepoint,
                sharepoint_results_count=len(sharepoint_results) if sharepoint_results else 0
            )
            db.session.add(submission)
            db.session.commit()
            print(f"Submission saved to database with ID: {submission_id}")
            
            # Log AI interaction
            log_audit_event(
                action_type='ai_interaction',
                action_category='data',
                description=f'AI interaction completed - Status: {status}, Files: {len(file_contents)}, SharePoint: {search_sharepoint}',
                user_id=user.id,
                user_email=employee_email,
                status='success',
                metadata={
                    'submission_id': submission_id,
                    'confidential_status': status,
                    'files_processed': len(file_contents) if file_contents else 0,
                    'sharepoint_searched': search_sharepoint,
                    'prompt_length': len(prompt),
                    'response_length': len(chatgpt_response)
                }
            )
        except Exception as db_error:
            print(f"WARNING: Failed to save to database: {db_error}")
            # Continue even if database save fails
            submission_id = int(datetime.now().timestamp() * 1000)
        
        print("="*60 + "\n")
        
        return jsonify({
            'success': True,
            'chatgptResponse': chatgpt_response,
            'confidentialStatus': status,
            'checkResults': check_results,
            'submissionId': submission_id,
            'sharepointSearched': search_sharepoint,
            'sharepointResultsCount': len(sharepoint_results) if sharepoint_results else 0,
            'filesProcessed': len(file_contents) if file_contents else 0,
            'aiMetadata': ai_metadata  # Include AI metadata (tokens, latency, etc.)
        })
        
    except Exception as e:
        error_msg = f'Server error: {str(e)}'
        print(f"\nCRITICAL ERROR: {error_msg}")
        print(f"Exception type: {type(e).__name__}")
        import traceback
        print("Full traceback:")
        traceback.print_exc()
        print("="*60 + "\n")
        return jsonify({'error': error_msg}), 500


@app.route('/api/submissions', methods=['GET'])
def get_submissions():
    """Get all submissions (for admin dashboard) - now from database"""
    try:
        # Get filter parameters
        employee_filter = request.args.get('employee', 'all')
        status_filter = request.args.get('status', 'all')
        
        query = Submission.query
        
        # Apply filters
        if employee_filter != 'all':
            user = User.query.filter(
                (User.email == employee_filter) | (User.name == employee_filter)
            ).first()
            if user:
                query = query.filter_by(user_id=user.id)
            else:
                return jsonify([])
        
        if status_filter != 'all':
            query = query.filter_by(status=status_filter)
        
        submissions = query.order_by(Submission.timestamp.desc()).all()
        return jsonify([sub.to_dict() for sub in submissions])
    except Exception as e:
        print(f"Error getting submissions: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to load submissions: {str(e)}'}), 500

@app.route('/api/admin/stats', methods=['GET'])
@require_admin
def get_admin_stats():
    """Get statistics for admin dashboard - Admin only"""
    try:
        total = Submission.query.count()
        flagged = Submission.query.filter(Submission.status != 'safe').count()
        danger = Submission.query.filter_by(status='danger').count()
        # Count all users in database (not just those with submissions)
        total_employees = User.query.count()
        # Count users with submissions
        users_with_submissions = db.session.query(Submission.user_id).distinct().count()
        
        return jsonify({
            'total': total,
            'flagged': flagged,
            'danger': danger,
            'employees': total_employees  # Total employees who have logged in
        })
    except Exception as e:
        print(f"Error getting stats: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/admin/employees', methods=['GET'])
@require_admin
def get_all_employees():
    """Get all employees with their stats - Admin only"""
    try:
        employees = User.query.order_by(User.name).all()
        employee_list = []
        
        for user in employees:
            # Get stats for this user
            submissions_count = Submission.query.filter_by(user_id=user.id).count()
            flagged_count = Submission.query.filter_by(user_id=user.id).filter(Submission.status != 'safe').count()
            danger_count = Submission.query.filter_by(user_id=user.id).filter_by(status='danger').count()
            conversations_count = Conversation.query.filter_by(user_id=user.id).count()
            
            employee_list.append({
                'id': user.id,
                'email': user.email,
                'name': user.name,
                'created_at': user.created_at.isoformat() if user.created_at else None,
                'last_login': user.last_login.isoformat() if user.last_login else None,
                'submissions_count': submissions_count,
                'flagged_count': flagged_count,
                'danger_count': danger_count,
                'conversations_count': conversations_count
            })
        
        return jsonify(employee_list)
    except Exception as e:
        print(f"Error getting employees: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/audit-logs', methods=['GET'])
@require_admin
def get_audit_logs():
    """Get audit logs - Admin only"""
    try:
        # Get filter parameters
        action_type = request.args.get('action_type', 'all')
        action_category = request.args.get('category', 'all')
        user_email = request.args.get('user_email', '')
        status = request.args.get('status', 'all')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        
        query = AuditLog.query
        
        # Apply filters
        if action_type != 'all':
            query = query.filter_by(action_type=action_type)
        
        if action_category != 'all':
            query = query.filter_by(action_category=action_category)
        
        if user_email:
            query = query.filter_by(user_email=user_email)
        
        if status != 'all':
            query = query.filter_by(status=status)
        
        # Order by timestamp (newest first) and paginate
        logs = query.order_by(AuditLog.timestamp.desc()).limit(limit).offset(offset).all()
        total = query.count()
        
        return jsonify({
            'logs': [log.to_dict() for log in logs],
            'total': total,
            'limit': limit,
            'offset': offset
        })
    except Exception as e:
        print(f"Error getting audit logs: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/employees/<int:user_id>/conversations', methods=['GET'])
@require_admin
def get_employee_conversations(user_id):
    """Get all conversations for a specific employee - Admin only"""
    try:
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Log admin data access
        admin_email = (request.args.get('email') or '').strip().lower()
        log_audit_event(
            action_type='admin_data_access',
            action_category='admin',
            description=f'Admin viewed conversations for user: {user.email}',
            user_email=admin_email,
            status='success',
            metadata={'target_user_id': user_id, 'target_user_email': user.email}
        )
        
        # Only get non-deleted conversations (handle missing column gracefully)
        try:
            # Try to query with is_deleted filter
            conversations = Conversation.query.filter_by(
                user_id=user_id,
                is_deleted=False
            ).order_by(Conversation.updated_at.desc()).all()
        except Exception as e:
            # If is_deleted column doesn't exist yet, get all conversations
            print(f"Warning: is_deleted column not found, getting all conversations: {e}")
            db.session.rollback()  # Rollback the failed transaction
            try:
                conversations = Conversation.query.filter_by(
                    user_id=user_id
                ).order_by(Conversation.updated_at.desc()).all()
            except Exception as e2:
                print(f"Error getting conversations: {e2}")
                db.session.rollback()
                conversations = []
        
        # Get submission stats for each conversation
        conversation_list = []
        for conv in conversations:
            messages_count = Message.query.filter_by(conversation_id=conv.id).count()
            submissions_count = Submission.query.filter_by(conversation_id=conv.id).count()
            
            conversation_list.append({
                'id': conv.id,
                'title': conv.title,
                'created_at': conv.created_at.isoformat() if conv.created_at else None,
                'updated_at': conv.updated_at.isoformat() if conv.updated_at else None,
                'messages_count': messages_count,
                'submissions_count': submissions_count,
                'messages': [msg.to_dict() for msg in conv.messages[:10]]  # First 10 messages as preview
            })
        
        return jsonify({
            'user': user.to_dict(),
            'conversations': conversation_list
        })
    except Exception as e:
        print(f"Error getting employee conversations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/login', methods=['POST'])
def login_user():
    """Login or create user (email-only, no password required)"""
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        email = (data.get('email') or '').strip().lower()
        name = (data.get('name') or '').strip()
        
        # Input validation and sanitization
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        if len(email) > 255:
            return jsonify({'error': 'Email is too long'}), 400
        
        # Validate email format
        if not email.endswith('@geoconinc.com'):
            log_audit_event(
                action_type='login',
                action_category='authentication',
                description=f'Login attempt with invalid email domain: {email}',
                user_email=email,
                status='failure',
                metadata={'reason': 'invalid_domain'}
            )
            return jsonify({'error': 'Email must be a @geoconinc.com address'}), 400
        
        # Basic email format validation
        import re
        email_pattern = r'^[a-zA-Z0-9._%+-]+@geoconinc\.com$'
        if not re.match(email_pattern, email):
            log_audit_event(
                action_type='login',
                action_category='authentication',
                description=f'Login attempt with invalid email format: {email}',
                user_email=email,
                status='failure',
                metadata={'reason': 'invalid_format'}
            )
            return jsonify({'error': 'Invalid email format'}), 400
        
        # Validate name if provided
        if name and len(name) > 255:
            return jsonify({'error': 'Name is too long (max 255 characters)'}), 400
        
        # Get or create user (no password check)
        # Flask routes already run in app context, so no need to wrap
        user = get_or_create_user(email, name)
        update_user_last_login(user)
        
        # Generate session token (valid for 30 days)
        session_token = secrets.token_urlsafe(32)
        user.session_token = session_token
        user.session_expires = datetime.utcnow() + timedelta(days=30)
        db.session.commit()
        
        # Log successful login
        log_audit_event(
            action_type='login',
            action_category='authentication',
            description=f'User logged in: {email}',
            user_id=user.id,
            user_email=email,
            status='success',
            metadata={'is_new_user': user.created_at == user.last_login if user.created_at else False}
        )
        
        return jsonify({
            'success': True,
            'user': user.to_dict(),
            'session_token': session_token  # Return token for client to store
        })
    except Exception as e:
        print(f"Error in login: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Login failed: {str(e)}'}), 500

@app.route('/api/users/<int:user_id>/update-name', methods=['POST'])
def update_user_name(user_id):
    """Update user's display name"""
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        new_name = (data.get('name') or '').strip()
        
        if not new_name:
            return jsonify({'error': 'Name is required'}), 400
        
        # Get user - return JSON error if not found instead of HTML 404
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': f'User with ID {user_id} not found'}), 404
        
        # Only update name, preserve email
        original_email = user.email
        user.name = new_name
        db.session.commit()
        
        # Verify email wasn't changed
        if user.email != original_email:
            print(f"WARNING: Email was changed during name update! Restoring...")
            user.email = original_email
            db.session.commit()
        
        print(f"Updated user {user.email} name to: {new_name} (email preserved)")
        
        # Log name update
        log_audit_event(
            action_type='update_name',
            action_category='data',
            description=f'User updated display name to: {new_name}',
            user_id=user_id,
            user_email=user.email,
            status='success',
            metadata={'old_name': user.name, 'new_name': new_name}
        )
        
        return jsonify({
            'success': True,
            'user': user.to_dict()
        })
    except Exception as e:
        print(f"Error updating user name: {e}")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>/conversations', methods=['GET'])
def get_user_conversations(user_id):
    """Get all conversations for a user"""
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Only get non-deleted conversations (handle missing column gracefully)
        try:
            # Try to query with is_deleted filter
            conversations = Conversation.query.filter_by(
                user_id=user_id, 
                is_deleted=False
            ).order_by(Conversation.updated_at.desc()).all()
        except Exception as e:
            # If is_deleted column doesn't exist yet, get all conversations
            print(f"Warning: is_deleted column not found, getting all conversations: {e}")
            db.session.rollback()  # Rollback the failed transaction
            try:
                conversations = Conversation.query.filter_by(
                    user_id=user_id
                ).order_by(Conversation.updated_at.desc()).all()
            except Exception as e2:
                print(f"Error getting conversations: {e2}")
                db.session.rollback()
                conversations = []
        return jsonify([conv.to_dict() for conv in conversations])
    except Exception as e:
        print(f"Error getting conversations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/conversations', methods=['POST'])
def create_conversation():
    """Create a new conversation (or update if exists)"""
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        user_id = data.get('user_id')
        title = data.get('title', 'New Chat')
        conversation_id = data.get('id', f'chat-{datetime.now().timestamp()}')
        
        # Input validation
        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400
        
        if not isinstance(user_id, int):
            try:
                user_id = int(user_id)
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid user_id format'}), 400
        
        if title and len(title) > 500:
            return jsonify({'error': 'Title is too long (max 500 characters)'}), 400
        
        if conversation_id and len(conversation_id) > 255:
            return jsonify({'error': 'Conversation ID is too long'}), 400
        
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Check if conversation already exists
        conversation = Conversation.query.get(conversation_id)
        
        if conversation:
            # Verify ownership
            if conversation.user_id != user_id:
                return jsonify({'error': 'Unauthorized access to conversation'}), 403
            # Update existing conversation (restore if was deleted)
            conversation.title = title[:500]  # Ensure length limit
            conversation.updated_at = datetime.utcnow()
            # Only set is_deleted if column exists
            try:
                if hasattr(conversation, 'is_deleted') and conversation.is_deleted:
                    conversation.is_deleted = False  # Restore if it was soft-deleted
            except:
                pass  # Column doesn't exist, skip
        else:
            # Create new conversation
            # Try to create with is_deleted, fallback if column doesn't exist
            try:
                conversation = Conversation(
                    id=conversation_id[:255],  # Ensure length limit
                    user_id=user_id,
                    title=title[:500],  # Ensure length limit
                    is_deleted=False  # Explicitly set to False for new conversations
                )
            except Exception:
                # If is_deleted column doesn't exist, create without it
                conversation = Conversation(
                    id=conversation_id[:255],
                    user_id=user_id,
                    title=title[:500]
                )
            db.session.add(conversation)
        
        db.session.commit()
        
        return jsonify(conversation.to_dict())
    except Exception as e:
        print(f"Error creating/updating conversation: {e}")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/conversations/<conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    """Delete a conversation (soft delete)"""
    try:
        # Get user_id from request (query param or JSON body)
        user_id = request.args.get('user_id')
        if not user_id and request.is_json:
            user_id = request.json.get('user_id') if request.json else None
        
        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400
        
        try:
            user_id = int(user_id)
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid user_id format'}), 400
        
        # Get conversation
        conversation = Conversation.query.get(conversation_id)
        if not conversation:
            return jsonify({'error': 'Conversation not found'}), 404
        
        # Verify ownership
        if conversation.user_id != user_id:
            return jsonify({'error': 'Unauthorized: You can only delete your own conversations'}), 403
        
        # Soft delete - always set is_deleted flag
        conversation.is_deleted = True
        conversation.updated_at = datetime.utcnow()
        db.session.commit()
        
        # Log deletion
        log_audit_event(
            action_type='conversation_deleted',
            action_category='data',
            description=f'User deleted conversation: {conversation_id}',
            user_id=user_id,
            user_email=conversation.user.email,
            status='success',
            metadata={'conversation_id': conversation_id, 'title': conversation.title}
        )
        
        return jsonify({'success': True, 'message': 'Conversation deleted'})
    except Exception as e:
        print(f"Error deleting conversation: {e}")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/conversations/<conversation_id>/messages', methods=['POST'])
def add_message(conversation_id):
    """Add a message to a conversation"""
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Use conversation_id from URL, fallback to body if needed
        conversation_id = conversation_id or data.get('conversation_id')
        role = data.get('role')  # 'user' or 'assistant'
        content = data.get('content')
        metadata = data.get('metadata', {})
        
        # Input validation
        if not conversation_id:
            return jsonify({'error': 'conversation_id is required'}), 400
        
        if not role or role not in ['user', 'assistant']:
            return jsonify({'error': 'role must be "user" or "assistant"'}), 400
        
        if not content:
            return jsonify({'error': 'content is required'}), 400
        
        if len(content) > 100000:  # 100KB max message
            return jsonify({'error': 'Message content is too long (max 100,000 characters)'}), 400
        
        if len(conversation_id) > 255:
            return jsonify({'error': 'Conversation ID is too long'}), 400
        
        conversation = Conversation.query.get(conversation_id)
        if not conversation:
            return jsonify({'error': 'Conversation not found'}), 404
        
        # Parse timestamp from metadata if available, otherwise use current time
        message_timestamp = datetime.utcnow()
        if isinstance(metadata, dict) and metadata.get('timestamp'):
            try:
                # Try parsing ISO format timestamp
                timestamp_str = metadata['timestamp']
                if 'T' in timestamp_str:
                    # ISO format: 2026-01-21T20:44:59.123Z
                    message_timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                else:
                    # Try other formats
                    message_timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
            except:
                pass  # Use current time if parsing fails
        
        message = Message(
            conversation_id=conversation_id[:255],  # Ensure length limit
            role=role,
            content=content[:100000],  # Ensure length limit
            created_at=message_timestamp,  # Use parsed or current timestamp
            message_metadata=metadata if isinstance(metadata, dict) else {}  # Use message_metadata (metadata is reserved in SQLAlchemy)
        )
        db.session.add(message)
        db.session.flush()  # Flush to get message.id without committing
        
        # Update conversation timestamp
        conversation.updated_at = datetime.utcnow()
        
        # If this is an assistant message, create submission and usage records
        if role == 'assistant':
            # Find the previous user message in this conversation
            user_msg = Message.query.filter_by(
                conversation_id=conversation_id,
                role='user'
            ).order_by(Message.created_at.desc()).first()
            
            if user_msg:
                submission_id = f"{conversation_id}-{user_msg.id}"[:255]  # Ensure length limit
                submission = Submission(
                    id=submission_id,
                    user_id=conversation.user_id,
                    conversation_id=conversation_id[:255],
                    user_message_id=user_msg.id,  # Reference to user message
                    assistant_message_id=message.id,  # Reference to assistant message (available after flush)
                    prompt=user_msg.content[:50000],  # Limit prompt size (denormalized)
                    response=content[:50000],  # Limit response size (denormalized)
                    status=metadata.get('confidentialStatus', 'safe')[:50] if isinstance(metadata, dict) else 'safe',
                    check_results=metadata.get('checkResults', []) if isinstance(metadata, dict) else [],
                    files_processed=metadata.get('filesCount', 0) if isinstance(metadata, dict) else 0,
                    sharepoint_searched=metadata.get('sharepointSearched', False) if isinstance(metadata, dict) else False,
                    sharepoint_results_count=metadata.get('sharepointResultsCount', 0) if isinstance(metadata, dict) else 0
                )
                db.session.add(submission)
            
            # Create Usage record for cost tracking
            if isinstance(metadata, dict) and metadata.get('total_tokens'):
                usage = Usage(
                    user_id=conversation.user_id,
                    conversation_id=conversation_id[:255],
                    assistant_message_id=message.id,  # Available after flush
                    model=metadata.get('model', AZURE_OPENAI_DEPLOYMENT),
                    token_in=metadata.get('token_in'),
                    token_out=metadata.get('token_out'),
                    total_tokens=metadata.get('total_tokens'),
                    latency_ms=metadata.get('latency_ms')
                )
                db.session.add(usage)
        
        db.session.commit()
        return jsonify(message.to_dict())
    except Exception as e:
        print(f"Error adding message: {e}")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/users/verify-session', methods=['POST'])
def verify_session():
    """Verify session token and return user info"""
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.json
        session_token = data.get('session_token')
        
        if not session_token:
            return jsonify({'error': 'session_token is required'}), 400
        
        # Find user by session token
        user = User.query.filter_by(session_token=session_token).first()
        
        if not user:
            return jsonify({'error': 'Invalid session token'}), 401
        
        # Check if token is expired
        if user.session_expires and user.session_expires < datetime.utcnow():
            # Clear expired token
            user.session_token = None
            user.session_expires = None
            db.session.commit()
            return jsonify({'error': 'Session expired'}), 401
        
        # Update last login
        update_user_last_login(user)
        
        return jsonify({
            'success': True,
            'user': user.to_dict()
        })
    except Exception as e:
        print(f"Error verifying session: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Geocon AI Usage Monitor API is running'})

@app.route('/api/model-info', methods=['GET'])
def get_model_info():
    """Get information about the AI model being used"""
    try:
        # Get deployment name (this is what you configure in Azure OpenAI)
        deployment_name = AZURE_OPENAI_DEPLOYMENT
        
        # Try to get model info from Azure OpenAI
        model_info = {
            'deployment_name': deployment_name,
            'endpoint': AZURE_OPENAI_ENDPOINT if AZURE_OPENAI_ENDPOINT else 'Not configured',
            'api_version': AZURE_API_VERSION,
            'configured': bool(AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY),
            'note': 'The deployment name is what you set in Azure OpenAI. The actual model (GPT-4, GPT-3.5, etc.) depends on what model you assigned to this deployment in Azure Portal.'
        }
        
        # Try to get actual model info if client is available
        if client:
            try:
                # Make a test call to get model information
                # Note: Azure OpenAI doesn't directly expose model name, but we can infer from deployment
                model_info['client_configured'] = True
                model_info['inference'] = 'The deployment name "' + deployment_name + '" is used. Check Azure Portal to see which model (GPT-4, GPT-4 Turbo, GPT-3.5, etc.) is assigned to this deployment.'
            except Exception as e:
                model_info['client_error'] = str(e)
        else:
            model_info['client_configured'] = False
        
        return jsonify(model_info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Serve static files (HTML, CSS, JS)
@app.route('/')
def index():
    """Serve the main index page"""
    return send_from_directory('.', 'index.html')


@app.route('/admin.html')
def admin():
    """Serve the admin page"""
    return send_from_directory('.', 'admin.html')


@app.route('/<path:path>')
def serve_static(path):
    """Serve static files (CSS, JS, images, etc.)"""
    # Don't catch API routes - they should be handled by their specific routes
    if path.startswith('api/'):
        return jsonify({'error': 'API endpoint not found'}), 404
    
    # Security: Only serve files from allowed extensions
    allowed_extensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.json']
    if any(path.endswith(ext) for ext in allowed_extensions):
        return send_from_directory('.', path)
    return jsonify({'error': 'File not found'}), 404


# Global error handler
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    try:
        db.session.rollback()
    except:
        pass  # Ignore if rollback fails
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(413)
def request_too_large(error):
    return jsonify({'error': 'Request payload too large'}), 413

# Request timeout handler (handled by gunicorn in production)
@app.before_request
def before_request():
    # Set request timeout (handled by gunicorn in production)
    pass

if __name__ == '__main__':
    print("\n" + "="*60)
    print("Geocon AI Usage Monitor - Starting Server")
    print("="*60)
    print(f"AI Provider: Azure OpenAI")
    print(f"Endpoint: {AZURE_OPENAI_ENDPOINT if AZURE_OPENAI_ENDPOINT else 'Not configured'}")
    print(f"Deployment: {AZURE_OPENAI_DEPLOYMENT}")
    print(f"API Version: {AZURE_API_VERSION}")
    print(f"API Key configured: {'Yes' if AZURE_OPENAI_KEY and len(AZURE_OPENAI_KEY) > 20 else 'No'}")
    print(f"\nDatabase Configuration:")
    print(f"  Connection Pool Size: 20")
    print(f"  Max Overflow: 10")
    print(f"  Pool Timeout: 30s")
    print(f"\nSharePoint Integration:")
    print(f"  Site URL: {SHAREPOINT_SITE_URL if SHAREPOINT_SITE_URL else 'Not configured'}")
    print(f"  Tenant: {SHAREPOINT_TENANT if SHAREPOINT_TENANT else 'Not configured'}")
    print(f"  Client ID: {'Configured' if SHAREPOINT_CLIENT_ID else 'Not configured'}")
    print(f"  Client Secret: {'Configured' if SHAREPOINT_CLIENT_SECRET else 'Not configured'}")
    print(f"  Using Graph API: {SHAREPOINT_USE_GRAPH_API}")
    if not SHAREPOINT_SITE_URL or not SHAREPOINT_CLIENT_ID:
        print(f"  WARNING: SharePoint search will be disabled until configured")
    print(f"\nSecurity Settings:")
    print(f"  Max File Size: {MAX_FILE_SIZE / 1024 / 1024} MB")
    print(f"  Max Files per Request: {MAX_FILES}")
    print(f"  Max Prompt Length: 50,000 characters")
    print(f"\nServer URL: http://localhost:5000")
    print(f"API Endpoint: http://localhost:5000/api/submit")
    print("="*60)
    print("Waiting for requests...\n")
    
    # Get port from environment variable (for production) or use 5000 (for local)
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    try:
        app.run(debug=debug, host='0.0.0.0', port=port)
    except Exception as e:
        print(f"\nFATAL ERROR starting server: {e}")
        import traceback
        traceback.print_exc()

