import { type IAgentScopeRuntimeWebUISession } from "@agentscope-ai/chat";
import type { ChatMeta, Message } from "../../../api";

export interface ContentItem {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface OutputMessage extends Omit<Message, "role"> {
  role: string;
  metadata: Record<string, unknown> | null;
  sequence_number?: number;
}

export interface ExtendedSession extends IAgentScopeRuntimeWebUISession {
  sessionId: string;
  userId: string;
  channel: string;
  meta: ChatMeta;
  createdAt?: string;
  updatedAt?: string;
  realId?: string;
}

export const normalizeSessionId = (value: unknown): string =>
  String(value || "").trim();

export const isLocalTimestamp = (id: string): boolean => /^\d+$/.test(id);
