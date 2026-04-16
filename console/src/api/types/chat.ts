export interface PushSessionMeta {
  push_source_user_id?: string;
  push_source_user_name?: string;
  push_conversation_key?: string;
  push_session_id?: string;
  push_chat_id?: string;
  push_trace_id?: string;
  push_intent_type?: string;
  push_message_id?: string;
  source_agent_id?: string;
  target_agent_id?: string;
}

export interface PartySessionMeta {
  biz_domain?: string;
  module?: string;
  task_id?: string;
  status?: string;
  party_module?: string;
  party_item_id?: string;
  party_title?: string;
  party_status?: string;
  party_stage?: string;
  party_priority?: string;
  party_reminder_status?: string;
  party_receipt_status?: string;
  party_deadline?: string;
  conversation_key?: string;
  session_id?: string;
  trace_id?: string;
}

export type ChatMeta = Record<string, unknown> & PushSessionMeta & PartySessionMeta;

export interface ChatSpec {
  id: string;
  session_id: string;
  user_id: string;
  channel: string;
  created_at: string | null;
  updated_at: string | null;
  meta?: ChatMeta;
}

export interface Message {
  role: string;
  content: unknown;
  [key: string]: unknown;
}

export interface ChatHistory {
  messages: Message[];
}

export interface ChatDeleteResponse {
  success: boolean;
  chat_id: string;
}

export type Session = ChatSpec;
