# SQL Storage Documentation

This document describes all data stored in the PostgreSQL database for the Geocon AI Website.

## Database Tables Overview

| Table Name | Purpose | Key Features |
|------------|---------|--------------|
| `users` | User accounts and authentication | Email-based login, name, last login tracking |
| `conversations` | Chat conversations | UUID-based, soft delete support, timestamps |
| `messages` | Individual messages in conversations | Full content, role, metadata, timestamps |
| `submissions` | Admin dashboard data | Denormalized prompt/response, status, SharePoint info |
| `usage` | Token usage and cost tracking | Model, tokens, latency, cost estimates |
| `audit_logs` | Security and admin access logs | Admin actions, authentication events, IP tracking |

---

## Table: `users`

**Purpose:** Store user accounts and authentication information

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER (PK) | Primary key, auto-increment |
| `email` | VARCHAR(255) | User email (unique, indexed) - must be @geoconinc.com |
| `name` | VARCHAR(255) | Display name |
| `created_at` | TIMESTAMP | Account creation time |
| `last_login` | TIMESTAMP | Last login timestamp |

**Relationships:**
- One-to-many with `conversations`
- One-to-many with `submissions`
- One-to-many with `usage`
- One-to-many with `audit_logs`

**What's Stored:**
- All user accounts
- Login timestamps
- Display names

---

## Table: `conversations`

**Purpose:** Store chat conversations between users and AI

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(255) (PK) | Conversation UUID (e.g., "chat-1769466590856-auylqxi9p") |
| `user_id` | INTEGER (FK) | Reference to `users.id` (indexed) |
| `title` | VARCHAR(500) | Conversation title (first 50 chars of first prompt) |
| `created_at` | TIMESTAMP | Conversation creation time (indexed) |
| `updated_at` | TIMESTAMP | Last update time (indexed) |
| `is_deleted` | BOOLEAN | Soft delete flag (indexed, default: false) |

**Relationships:**
- Many-to-one with `users`
- One-to-many with `messages`
- One-to-many with `submissions`
- One-to-many with `usage`

**What's Stored:**
- All chat conversations
- Conversation titles
- Creation and update timestamps
- Soft delete status (deleted conversations are marked, not removed)

---

## Table: `messages`

**Purpose:** Store individual messages in conversations (single source of truth)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER (PK) | Primary key, auto-increment |
| `conversation_id` | VARCHAR(255) (FK) | Reference to `conversations.id` (indexed) |
| `role` | VARCHAR(50) | Message role: 'user', 'assistant', 'system', 'tool' (indexed) |
| `content` | TEXT | Full message content |
| `created_at` | TIMESTAMP | Message timestamp (indexed) |
| `message_metadata` | JSON | Complete metadata (see below) |

**Message Metadata (JSON) Structure:**
```json
{
  "model": "gpt-4.1",
  "temperature": 0.7,
  "top_p": null,
  "max_output_tokens": 2000,
  "token_in": 150,
  "token_out": 500,
  "total_tokens": 650,
  "latency_ms": 1234,
  "finish_reason": "stop",
  "client_context": {
    "app_version": "1.0",
    "browser": "Chrome",
    "user_agent": "..."
  },
  "safety_flags": {
    "confidentialStatus": "safe",
    "checkResults": []
  },
  "filesProcessed": 0,
  "sharepointSearched": false,
  "sharepointResultsCount": 0,
  "timestamp": "2026-01-26T22:30:08.123Z"
}
```

**Relationships:**
- Many-to-one with `conversations`
- One-to-many with `submissions` (via user_message_id and assistant_message_id)
- One-to-one with `usage` (via assistant_message_id)

**What's Stored:**
- **ALL** user and assistant messages
- Complete message content
- Exact timestamps (preserved from client)
- Full AI metadata (model, tokens, latency, etc.)
- Safety check results
- File processing info
- SharePoint search results

---

## Table: `submissions`

**Purpose:** Admin dashboard data (denormalized for quick queries)

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(255) (PK) | Submission ID (format: "{conversation_id}-{message_id}") |
| `user_id` | INTEGER (FK) | Reference to `users.id` (indexed) |
| `conversation_id` | VARCHAR(255) (FK) | Reference to `conversations.id` (indexed) |
| `user_message_id` | INTEGER (FK) | Reference to `messages.id` (user message) (indexed) |
| `assistant_message_id` | INTEGER (FK) | Reference to `messages.id` (assistant message) (indexed) |
| `prompt` | TEXT | User prompt (denormalized for admin access) |
| `response` | TEXT | AI response (denormalized for admin access) |
| `status` | VARCHAR(50) | Confidential status: 'safe', 'warning', 'danger' (indexed) |
| `check_results` | JSON | Safety check results (array of findings) |
| `files_processed` | INTEGER | Number of files processed (default: 0) |
| `sharepoint_searched` | BOOLEAN | Whether SharePoint was searched (default: false) |
| `sharepoint_results_count` | INTEGER | Number of SharePoint results (default: 0) |
| `timestamp` | TIMESTAMP | Submission time (indexed) |

**Relationships:**
- Many-to-one with `users`
- Many-to-one with `conversations`
- Many-to-one with `messages` (user_message_id)
- Many-to-one with `messages` (assistant_message_id)

**What's Stored:**
- All AI interactions (prompt + response pairs)
- Confidential status and safety checks
- File processing statistics
- SharePoint search results
- References to source messages (single source of truth)

**Note:** Prompt and response are denormalized here for quick admin dashboard queries, but the authoritative source is the `messages` table.

---

## Table: `usage`

**Purpose:** Token usage and cost tracking

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER (PK) | Primary key, auto-increment |
| `user_id` | INTEGER (FK) | Reference to `users.id` (indexed) |
| `conversation_id` | VARCHAR(255) (FK) | Reference to `conversations.id` (indexed) |
| `assistant_message_id` | INTEGER (FK) | Reference to `messages.id` (indexed) |
| `model` | VARCHAR(100) | Model name (e.g., 'gpt-4.1') (indexed) |
| `token_in` | INTEGER | Input tokens |
| `token_out` | INTEGER | Output tokens |
| `total_tokens` | INTEGER | Total tokens (indexed) |
| `latency_ms` | INTEGER | Response latency in milliseconds |
| `cost_estimate_usd` | NUMERIC(10,6) | Estimated cost in USD |
| `created_at` | TIMESTAMP | Record creation time (indexed) |

**Relationships:**
- Many-to-one with `users`
- Many-to-one with `conversations`
- One-to-one with `messages` (assistant_message_id)

**What's Stored:**
- Token usage for every AI response
- Model information
- Response latency
- Cost estimates (when calculated)
- Per-user and per-conversation statistics

---

## Table: `audit_logs`

**Purpose:** Security and admin access tracking

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER (PK) | Primary key, auto-increment |
| `timestamp` | TIMESTAMP | Event timestamp (indexed) |
| `actor_user_id` | INTEGER (FK) | User who performed the action (indexed) |
| `user_id` | INTEGER (FK) | Backward compatibility (indexed) |
| `user_email` | VARCHAR(255) | User email (indexed, preserved even if user deleted) |
| `action` | VARCHAR(100) | Action type: 'ADMIN_VIEW_CONVERSATION', 'EXPORT', 'ROLE_CHANGE', etc. (indexed) |
| `action_type` | VARCHAR(100) | Backward compatibility (indexed) |
| `action_category` | VARCHAR(50) | Category: 'authentication', 'admin', 'data', 'security', 'system' (indexed) |
| `object_type` | VARCHAR(50) | Object type: 'conversation', 'message', 'user', etc. (indexed) |
| `object_id` | VARCHAR(255) | ID of the object acted upon (indexed) |
| `description` | TEXT | Human-readable description |
| `ip_address` | VARCHAR(45) | Client IP address (IPv4 or IPv6) |
| `user_agent` | VARCHAR(500) | Browser/user agent string |
| `request_method` | VARCHAR(10) | HTTP method: 'GET', 'POST', etc. |
| `request_path` | VARCHAR(500) | Request path |
| `status` | VARCHAR(50) | Status: 'success', 'failure', 'error', 'unauthorized' (indexed) |
| `audit_metadata` | JSON | Additional context data |

**Relationships:**
- Many-to-one with `users` (actor_user_id)
- Many-to-one with `users` (user_id)

**What's Stored:**
- All admin access events
- User login/logout events
- Security events (unauthorized access attempts)
- Data access events
- IP addresses and user agents
- Request details
- Action metadata

---

## Data Flow

### Message Creation Flow

1. **User sends message:**
   - Message saved to `messages` table with `role='user'`
   - `created_at` timestamp preserved from client
   - Metadata includes file info, etc.

2. **AI responds:**
   - Message saved to `messages` table with `role='assistant'`
   - Full metadata stored (model, tokens, latency, etc.)
   - `Usage` record created for cost tracking
   - `Submission` record created for admin dashboard
   - Both reference the message IDs

3. **Conversation updated:**
   - `conversations.updated_at` updated
   - Title set from first prompt if new conversation

### Statistics Calculation

All statistics are calculated from SQL queries:

- **Total conversations:** `SELECT COUNT(*) FROM conversations WHERE user_id = ? AND is_deleted = false`
- **Total messages:** `SELECT COUNT(*) FROM messages WHERE conversation_id = ?`
- **Total tokens used:** `SELECT SUM(total_tokens) FROM usage WHERE user_id = ?`
- **Average latency:** `SELECT AVG(latency_ms) FROM usage WHERE user_id = ?`
- **Cost estimate:** `SELECT SUM(cost_estimate_usd) FROM usage WHERE user_id = ?`

---

## What is NOT Stored in SQL

- **File contents:** Files are processed in memory, only metadata stored
- **SharePoint document content:** Only search results and URLs stored
- **Session data:** Handled by browser localStorage (for offline access)
- **Temporary data:** All temporary data is stored in SQL

---

## Indexes

All tables have proper indexes for performance:

- Primary keys (automatic)
- Foreign keys (indexed)
- Frequently queried columns (user_id, conversation_id, created_at, etc.)
- Status columns (is_deleted, status, etc.)

---

## Soft Delete

Conversations use soft delete (`is_deleted` flag):
- Deleted conversations are marked, not removed
- Messages remain in database
- Can be restored if needed
- Admin can see all conversations regardless of delete status

---

## Summary

**Everything is stored in SQL:**
- ✅ All user accounts
- ✅ All conversations
- ✅ All messages (user and assistant)
- ✅ All message metadata (tokens, latency, model, etc.)
- ✅ All timestamps (preserved from client)
- ✅ All statistics (calculated from SQL)
- ✅ All admin access logs
- ✅ All cost/usage tracking
- ✅ All safety check results
- ✅ All file processing info
- ✅ All SharePoint search results

**Nothing is stored only in localStorage:**
- localStorage is used only for offline access and UI state
- All authoritative data is in PostgreSQL
