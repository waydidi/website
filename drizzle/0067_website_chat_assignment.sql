CREATE TABLE IF NOT EXISTS website_chat_assignments (
 conversation_id TEXT PRIMARY KEY REFERENCES website_conversations(id) ON DELETE CASCADE,
 staff_id TEXT NOT NULL REFERENCES staff_accounts(id), staff_name TEXT NOT NULL, assigned_at TEXT NOT NULL
);
