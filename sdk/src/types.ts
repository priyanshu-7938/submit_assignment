// ─────────────────────────────────────────────
//  Chat Analytics SDK — Type Definitions
// ─────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  /** Role of the message sender */
  role: MessageRole;
  /** Text content of the message */
  content: string;
  /** Unix timestamp (ms). Defaults to Date.now() if not provided */
  timestamp?: number;
  /** Optional arbitrary metadata (tokens used, model name, latency, etc.) */
  metadata?: Record<string, unknown>;
}

export interface SessionInfo {
  /** Unique session identifier — auto-generated if not provided */
  sessionId?: string;
  /** User identifier (e.g. user DB id, email hash) */
  userId?: string;
  /** Arbitrary labels to attach to the session */
  tags?: string[];
  /** Extra key/value info (app version, environment, locale, etc.) */
  attributes?: Record<string, unknown>;
}

export interface SDKConfig {
  /** Full URL of your analytics server endpoint */
  endpoint: string;
  /** API key sent in the Authorization header */
  apiKey: string;
  /** Session metadata attached to every payload */
  session?: SessionInfo;
  /**
   * How many messages to buffer before auto-flushing.
   * Set to 0 to disable auto-flush by count. Default: 20
   */
  batchSize?: number;
  /**
   * Interval in ms between automatic flushes.
   * Set to 0 to disable interval flushing. Default: 30_000 (30 s)
   */
  flushInterval?: number;
  /**
   * Whether to flush remaining messages when the page unloads
   * (uses navigator.sendBeacon). Default: true
   */
  flushOnUnload?: boolean;
  /**
   * Number of retry attempts on network failure. Default: 3
   */
  retryAttempts?: number;
  /**
   * Base delay in ms between retries (exponential back-off). Default: 500
   */
  retryDelay?: number;
  /**
   * Request timeout in ms. Default: 10_000 (10 s)
   */
  timeout?: number;
  /** Enable verbose console logging. Default: false */
  debug?: boolean;
}

export interface FlushPayload {
  sdkVersion: string;
  session: Required<Pick<SessionInfo, "sessionId">> & Omit<SessionInfo, "sessionId">;
  messages: Required<ChatMessage>[];
  flushedAt: number;
}

export interface FlushResult {
  success: boolean;
  messageCount: number;
  error?: string;
}

export type SDKEventName =
  | "message:tracked"
  | "flush:start"
  | "flush:success"
  | "flush:error"
  | "session:reset";

export type SDKEventPayload<T extends SDKEventName> =
  T extends "message:tracked" ? ChatMessage :
  T extends "flush:start"     ? { messages: ChatMessage[] } :
  T extends "flush:success"   ? FlushResult :
  T extends "flush:error"     ? { error: string; attempt: number } :
  T extends "session:reset"   ? SessionInfo :
  never;
