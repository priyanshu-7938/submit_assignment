// ─────────────────────────────────────────────
//  Chat Analytics SDK — Public API
// ─────────────────────────────────────────────

export { ChatAnalyticsClient, SDK_VERSION } from "./client";
export type {
  SDKConfig,
  ChatMessage,
  MessageRole,
  SessionInfo,
  FlushPayload,
  FlushResult,
  SDKEventName,
  SDKEventPayload,
} from "./types";


import { ChatAnalyticsClient } from "./client";
import type { SDKConfig } from "./types";
/**
 * ```ts
 * import { createClient } from "chat-analytics-sdk";
 *
 * const analytics = createClient({
 *   endpoint: "https://analytics.yourserver.com/ingest",
 *   apiKey: "your-api-key",
 *   session: { userId: "user_123" },
 * });
 *
 * analytics.track({ role: "user", content: "Hello!" });
 * analytics.track({ role: "assistant", content: "Hi there!" });
 * ```
 */
export function createClient(config: SDKConfig): ChatAnalyticsClient {
  return new ChatAnalyticsClient(config);
}
