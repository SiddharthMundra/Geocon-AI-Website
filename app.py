from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import AzureOpenAI
import json
import os
from datetime import datetime
import re
import requests
from urllib.parse import quote
import base64
import io
from database import db, init_db, User, Conversation, Message, Submission, get_or_create_user, update_user_last_login

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)  # Enable CORS for frontend requests

# Database configuration
# Use DATABASE_URL from environment, or use the provided Render database URL
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    # Default to the Render PostgreSQL database URL
    DATABASE_URL = "postgresql://test_aiwebsite_sql_user:x7FrVTKtQCs1C8kdOdWsAadnpChkX1bP@dpg-d5nccmje5dus73f2rcs0-a.oregon-postgres.render.com/test_aiwebsite_sql"

# Render PostgreSQL URLs sometimes need sslmode
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,  # Verify connections before using
    'pool_recycle': 300,    # Recycle connections after 5 minutes
}

# Initialize database
try:
    init_db(app)
    print(f"[OK] Database initialized: {app.config['SQLALCHEMY_DATABASE_URI'][:50]}...")
except Exception as e:
    print(f"WARNING: Database initialization failed: {e}")
    print("The app will continue but database features may not work.")

# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT = os.getenv('AZURE_OPENAI_ENDPOINT', 'https://openai-aiwebsite.cognitiveservices.azure.com/')
AZURE_OPENAI_KEY = os.getenv('AZURE_OPENAI_KEY', '33xQjIc1c9OsaYY1WkOe4TVh8plFjBkYaXTbsD30uJ283hLnfqdwJQQJ99BLAC4f1cMXJ3w3AAAAACOGwcit')
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


def extract_file_content(file):
    """Extract text content from uploaded file"""
    filename = file.filename
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


def call_azure_openai(prompt, sharepoint_context=None, file_contents=None):
    """Call Azure OpenAI API to get response"""
    if not client:
        raise Exception("Azure OpenAI client not configured. Please set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY.")
    
    try:
        # Build prompt with file content if provided
        if file_contents:
            prompt = build_prompt_with_files(prompt, file_contents)
        
        # Build prompt with SharePoint context if provided
        final_prompt = build_prompt_with_sharepoint_context(prompt, sharepoint_context) if sharepoint_context else prompt
        
        print(f"  Deployment: {AZURE_OPENAI_DEPLOYMENT}")
        print(f"  Max completion tokens: 2000")  # Increased for longer responses with context
        print(f"  Temperature: 0.7")
        if sharepoint_context:
            print(f"  SharePoint context: {len(sharepoint_context)} documents")
        if file_contents:
            print(f"  File content: {len(file_contents)} files")
        
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "You are a helpful AI assistant for Geocon, a geotechnical consulting firm. When you use information from SharePoint documents or uploaded files, always cite the source. Be accurate and professional."},
                {"role": "user", "content": final_prompt}
            ],
            max_completion_tokens=2000,  # Increased for longer responses
            temperature=0.7
        )
        
        result = response.choices[0].message.content.strip()
        print(f"  API call successful")
        return result
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
            employee_name = data.get('employeeName', '').strip() if data else ''
            prompt = data.get('prompt', '').strip() if data else ''
            search_sharepoint = data.get('searchSharePoint', False)
            files = []
        else:
            # FormData request (may have files)
            employee_name = request.form.get('employeeName', '').strip()
            prompt = request.form.get('prompt', '').strip()
            search_sharepoint = request.form.get('searchSharePoint', 'false').lower() == 'true'
            files = request.files.getlist('files')
        
        print(f"Request data received: {bool(employee_name and prompt)}")
        print(f"Employee: {employee_name}")
        print(f"Prompt length: {len(prompt)} characters")
        print(f"Search SharePoint: {search_sharepoint}")
        print(f"Files uploaded: {len(files)}")
        
        if not employee_name or not prompt:
            error_msg = 'Employee name and prompt are required'
            print(f"ERROR: {error_msg}")
            return jsonify({'error': error_msg}), 400
        
        # Process uploaded files
        file_contents = []
        if files:
            print("Processing uploaded files...")
            for file in files:
                if file.filename:
                    print(f"  Processing file: {file.filename}")
                    content = extract_file_content(file)
                    file_contents.append((file.filename, content))
                    print(f"  Extracted {len(content)} characters from {file.filename}")
        
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
        
        # Call Azure OpenAI API
        print("Calling Azure OpenAI API...")
        try:
            chatgpt_response = call_azure_openai(
                prompt, 
                sharepoint_results if sharepoint_results else None,
                file_contents if file_contents else None
            )
            print(f"Azure OpenAI response received: {len(chatgpt_response)} characters")
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
            'filesProcessed': len(file_contents) if file_contents else 0
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
def get_admin_stats():
    """Get statistics for admin dashboard"""
    try:
        total = Submission.query.count()
        flagged = Submission.query.filter(Submission.status != 'safe').count()
        danger = Submission.query.filter_by(status='danger').count()
        unique_users = db.session.query(Submission.user_id).distinct().count()
        
        return jsonify({
            'total': total,
            'flagged': flagged,
            'danger': danger,
            'employees': unique_users
        })
    except Exception as e:
        print(f"Error getting stats: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/login', methods=['POST'])
def login_user():
    """Login or create user"""
    try:
        data = request.json
        email = data.get('email', '').strip().lower()
        name = data.get('name', '').strip()
        password = data.get('password', '')
        
        # Validate email format
        if not email.endswith('@geoconinc.com'):
            return jsonify({'error': 'Email must be a @geoconinc.com address'}), 400
        
        # Validate password
        DEFAULT_PASSWORD = 'geocon123'
        if password != DEFAULT_PASSWORD:
            return jsonify({'error': 'Invalid password'}), 401
        
        # Get or create user
        user = get_or_create_user(email, name)
        update_user_last_login(user)
        
        return jsonify({
            'success': True,
            'user': user.to_dict()
        })
    except Exception as e:
        print(f"Error in login: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>/conversations', methods=['GET'])
def get_user_conversations(user_id):
    """Get all conversations for a user"""
    try:
        user = User.query.get_or_404(user_id)
        conversations = Conversation.query.filter_by(user_id=user_id).order_by(Conversation.updated_at.desc()).all()
        return jsonify([conv.to_dict() for conv in conversations])
    except Exception as e:
        print(f"Error getting conversations: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/conversations', methods=['POST'])
def create_conversation():
    """Create a new conversation"""
    try:
        data = request.json
        user_id = data.get('user_id')
        title = data.get('title', 'New Chat')
        conversation_id = data.get('id', f'chat-{datetime.now().timestamp()}')
        
        user = User.query.get_or_404(user_id)
        conversation = Conversation(
            id=conversation_id,
            user_id=user_id,
            title=title
        )
        db.session.add(conversation)
        db.session.commit()
        
        return jsonify(conversation.to_dict())
    except Exception as e:
        print(f"Error creating conversation: {e}")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/conversations/<conversation_id>/messages', methods=['POST'])
def add_message():
    """Add a message to a conversation"""
    try:
        data = request.json
        conversation_id = data.get('conversation_id') or conversation_id
        role = data.get('role')  # 'user' or 'assistant'
        content = data.get('content')
        metadata = data.get('metadata', {})
        
        conversation = Conversation.query.get_or_404(conversation_id)
        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            message_metadata=metadata  # Use message_metadata (metadata is reserved in SQLAlchemy)
        )
        db.session.add(message)
        
        # Update conversation timestamp
        conversation.updated_at = datetime.utcnow()
        
        # If this is an assistant message, create submission record
        if role == 'assistant':
            # Find the previous user message in this conversation
            user_msg = Message.query.filter_by(
                conversation_id=conversation_id,
                role='user'
            ).order_by(Message.timestamp.desc()).first()
            
            if user_msg:
                submission_id = f"{conversation_id}-{user_msg.id}"
                submission = Submission(
                    id=submission_id,
                    user_id=conversation.user_id,
                    conversation_id=conversation_id,
                    prompt=user_msg.content,
                    response=content,
                    status=metadata.get('confidentialStatus', 'safe'),
                    check_results=metadata.get('checkResults', []),
                    files_processed=metadata.get('filesCount', 0),
                    sharepoint_searched=metadata.get('sharepointSearched', False),
                    sharepoint_results_count=metadata.get('sharepointResultsCount', 0)
                )
                db.session.add(submission)
        
        db.session.commit()
        return jsonify(message.to_dict())
    except Exception as e:
        print(f"Error adding message: {e}")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Geocon AI Usage Monitor API is running'})


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
    # Security: Only serve files from allowed extensions
    allowed_extensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.json']
    if any(path.endswith(ext) for ext in allowed_extensions):
        return send_from_directory('.', path)
    return jsonify({'error': 'File not found'}), 404


if __name__ == '__main__':
    print("\n" + "="*60)
    print("Geocon AI Usage Monitor - Starting Server")
    print("="*60)
    print(f"AI Provider: Azure OpenAI")
    print(f"Endpoint: {AZURE_OPENAI_ENDPOINT if AZURE_OPENAI_ENDPOINT else 'Not configured'}")
    print(f"Deployment: {AZURE_OPENAI_DEPLOYMENT}")
    print(f"API Version: {AZURE_API_VERSION}")
    print(f"API Key configured: {'Yes' if AZURE_OPENAI_KEY and len(AZURE_OPENAI_KEY) > 20 else 'No'}")
    print(f"\nSharePoint Integration:")
    print(f"  Site URL: {SHAREPOINT_SITE_URL if SHAREPOINT_SITE_URL else 'Not configured'}")
    print(f"  Tenant: {SHAREPOINT_TENANT if SHAREPOINT_TENANT else 'Not configured'}")
    print(f"  Client ID: {'Configured' if SHAREPOINT_CLIENT_ID else 'Not configured'}")
    print(f"  Client Secret: {'Configured' if SHAREPOINT_CLIENT_SECRET else 'Not configured'}")
    print(f"  Using Graph API: {SHAREPOINT_USE_GRAPH_API}")
    if not SHAREPOINT_SITE_URL or not SHAREPOINT_CLIENT_ID:
        print(f"  WARNING: SharePoint search will be disabled until configured")
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

