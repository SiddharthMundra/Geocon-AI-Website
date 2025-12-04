# Geocon AI Usage Monitor

A web application for monitoring AI/LLM usage within Geocon, featuring OpenAI ChatGPT integration and usage tracking.

## Features

- **Single-page interface** for submitting prompts to ChatGPT
- **OpenAI API integration** to get real ChatGPT responses
- **Automatic storage** of all submissions for IT administration
- **Confidential information detection** before submission
- **Real-time response display** from ChatGPT

## Setup Instructions

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure AI Provider

You can use either **OpenAI API** or **Azure OpenAI** (Microsoft Copilot backend).

#### Option A: Use OpenAI API (Default)

**Set API Key via Environment Variable (Recommended):**
```bash
# Windows PowerShell
$env:OPENAI_API_KEY="your-api-key-here"

# Windows CMD
set OPENAI_API_KEY=your-api-key-here

# Linux/Mac
export OPENAI_API_KEY=your-api-key-here
```

**Or edit app.py:**
Replace the `OPENAI_KEY` value in `app.py` with your actual API key.

#### Option B: Use Azure OpenAI (Microsoft Copilot)

Azure OpenAI is the backend that powers Microsoft Copilot. To use it:

1. **Set Environment Variables:**
```bash
# Windows PowerShell
$env:AI_PROVIDER="azure"
$env:AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
$env:AZURE_OPENAI_KEY="your-azure-key-here"
$env:AZURE_OPENAI_DEPLOYMENT="gpt-4"  # Your deployment name
$env:AZURE_API_VERSION="2024-02-15-preview"

# Linux/Mac
export AI_PROVIDER="azure"
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
export AZURE_OPENAI_KEY="your-azure-key-here"
export AZURE_OPENAI_DEPLOYMENT="gpt-4"
export AZURE_API_VERSION="2024-02-15-preview"
```

2. **Or edit app.py directly:**
```python
AI_PROVIDER = 'azure'
AZURE_OPENAI_ENDPOINT = 'https://your-resource.openai.azure.com/'
AZURE_OPENAI_KEY = 'your-azure-key-here'
AZURE_OPENAI_DEPLOYMENT = 'gpt-4'  # Your deployment name
```

**Note:** To get Azure OpenAI credentials:
- Create an Azure OpenAI resource in Azure Portal
- Get your endpoint URL and API key
- Create a deployment (e.g., gpt-4, gpt-35-turbo)

### 3. Run the Backend Server

```bash
python app.py
```

The server will start on `http://localhost:5000`

### 4. Open the Frontend

Open `index.html` in your web browser, or serve it using a local web server:

```bash
# Using Python's built-in server
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Usage

1. Enter your name and prompt in the form
2. Click "Submit to ChatGPT"
3. The system will:
   - Check for confidential information
   - Send your prompt to OpenAI's ChatGPT
   - Display the response
   - Store the submission for IT administration

## Data Storage

All submissions are stored in `submissions.json` in the project directory. This file contains:
- Employee name
- Prompt text
- ChatGPT response
- Confidential status
- Timestamp

## API Endpoints

- `POST /api/submit` - Submit a prompt and get ChatGPT response
- `GET /api/submissions` - Get all stored submissions (for IT administration)
- `GET /api/health` - Health check endpoint

## Configuration

You can modify the OpenAI model in `app.py`:
```python
model="gpt-3.5-turbo"  # Change to "gpt-4" for GPT-4
```

## Notes

- Make sure to keep your OpenAI API key secure
- The `submissions.json` file will be created automatically
- All prompts are checked for confidential information before submission
- Submissions are stored locally in JSON format
