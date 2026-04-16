export type VoiceSecretaryStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface VoiceSecretaryTurnState {
  state?: string;
  text?: string;
  asr_segment?: string;
  asr_buffer?: string;
  [key: string]: unknown;
}

export interface VoiceSecretaryScreenCard {
  kind?: string;
  title?: string;
  summary?: string;
  originalText?: string;
  targetAgentId?: string;
  routeResult?: string;
  traceId?: string;
  reply?: string;
  iap?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VoiceSecretaryAudioPayload {
  data?: string;
  mime_type?: string;
  mimeType?: string;
  provider?: string;
  voice?: string;
  text?: string;
  sample_rate?: number;
  channels?: number;
  format?: string;
  seq?: number;
  is_final?: boolean;
  event?: string;
  [key: string]: unknown;
}

export interface VoiceSecretaryStreamAudioStart {
  provider?: string;
  voice?: string;
  mime_type?: string;
  format?: string;
  sample_rate?: number;
  channels?: number;
}

export interface VoiceSecretaryStreamAudioChunk {
  seq?: number;
  data?: string;
  is_final?: boolean;
}

export interface VoiceSecretaryResult {
  spoken?: string;
  screen?: VoiceSecretaryScreenCard;
  audio?: VoiceSecretaryAudioPayload;
  trace_id?: string;
  traceId?: string;
  route_result?: string;
  routeResult?: string;
  target_agent_id?: string;
  targetAgentId?: string;
  duplicate?: boolean;
  iap_item?: Record<string, unknown>;
  iapItem?: Record<string, unknown>;
}
