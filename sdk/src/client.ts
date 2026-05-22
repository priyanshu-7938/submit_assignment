// ─────────────────────────────────────────────
//  Chat Analytics SDK — Core Client
// ─────────────────────────────────────────────

import type {
  SDKConfig,
  ChatMessage,
  SessionInfo,
  FlushPayload,
  FlushResult,
  SDKEventName,
  SDKEventPayload,
} from "./types";
import { Transport } from "./transport";
import { generateUUID, Logger, cloneDeep } from "./utils";

export const SDK_VERSION = "1.0.0";

// ── Defaults ──────────────────────────────────
const DEFAULTS = {
  batchSize: 20,
  flushInterval: 30_000,
  flushOnUnload: true,
  retryAttempts: 3,
  retryDelay: 500,
  timeout: 10_000,
  debug: false,
} as const;

// ── Event Emitter (no external dep) ───────────
type AnyListener = (...args: unknown[]) => void;

class MiniEmitter {
  private listeners = new Map<string, Set<AnyListener>>();

  on<T extends SDKEventName>(
    event: T,
    listener: (payload: SDKEventPayload<T>) => void
  ): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as AnyListener);
    return () => this.listeners.get(event)?.delete(listener as AnyListener);
  }

  emit<T extends SDKEventName>(event: T, payload: SDKEventPayload<T>): void {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch {
        /* listeners must not crash the SDK */
      }
    });
  }
}

// ── Main SDK Class ─────────────────────────────
export class ChatAnalyticsClient extends MiniEmitter {
  private readonly config: Required<SDKConfig>;
  private readonly transport: Transport;
  private readonly logger: Logger;

  private queue: Required<ChatMessage>[] = [];
  private session: Required<SessionInfo>;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;

  constructor(config: SDKConfig) {
    super();

    // Validate required fields
    if (!config.endpoint) throw new Error("[ChatAnalyticsSDK] `endpoint` is required.");
    if (!config.apiKey)   throw new Error("[ChatAnalyticsSDK] `apiKey` is required.");

    this.config = {
      ...DEFAULTS,
      ...config,
      session: config.session ?? {},
    } as Required<SDKConfig>;

    this.logger = new Logger(this.config.debug);

    this.session = this.buildSession(this.config.session ?? {});

    this.transport = new Transport({
      endpoint:      this.config.endpoint,
      apiKey:        this.config.apiKey,
      retryAttempts: this.config.retryAttempts,
      retryDelay:    this.config.retryDelay,
      timeout:       this.config.timeout,
      logger:        this.logger,
    });

    this.startIntervalFlush();
    this.registerUnloadHook();

    this.logger.log("Initialized. Session:", this.session.sessionId);
  }

  // ── Public API ─────────────────────────────

  /**
   * Track a single chat message.
   * Automatically flushes when the queue reaches `batchSize`.
   */
  track(message: ChatMessage): this {
    const normalized: Required<ChatMessage> = {
      role:      message.role,
      content:   message.content,
      timestamp: message.timestamp ?? Date.now(),
      metadata:  message.metadata ?? {},
    };

    this.queue.push(normalized);
    this.logger.log("Tracked message:", normalized.role, `(queue: ${this.queue.length})`);
    this.emit("message:tracked", normalized);

    if (this.config.batchSize > 0 && this.queue.length >= this.config.batchSize) {
      this.flush().catch((err) => this.logger.error("Auto-flush failed:", err));
    }

    return this; // chainable
  }

  /**
   * Track multiple messages at once.
   */
  trackBatch(messages: ChatMessage[]): this {
    messages.forEach((m) => this.track(m));
    return this;
  }

  /**
   * Flush the current queue to the remote server immediately.
   * Resolves with a FlushResult regardless of success/failure.
   */
  async flush(): Promise<FlushResult> {
    if (this.queue.length === 0) {
      this.logger.log("Flush called but queue is empty — skipping.");
      return { success: true, messageCount: 0 };
    }

    if (this.isFlushing) {
      this.logger.warn("Flush already in progress — skipping concurrent flush.");
      return { success: false, messageCount: 0, error: "Flush already in progress" };
    }

    this.isFlushing = true;

    // Snapshot & drain the queue atomically
    const snapshot = cloneDeep(this.queue);
    this.queue = [];

    const payload: FlushPayload = {
      sdkVersion: SDK_VERSION,
      session:    this.session,
      messages:   snapshot,
      flushedAt:  Date.now(),
    };

    this.emit("flush:start", { messages: snapshot });

    try {
      await this.transport.send(payload);
      const result: FlushResult = { success: true, messageCount: snapshot.length };
      this.emit("flush:success", result);
      return result;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error("Flush failed:", errorMsg);

      // Re-queue the messages that failed to send (prepend to preserve order)
      this.queue = [...snapshot, ...this.queue];

      const result: FlushResult = { success: false, messageCount: 0, error: errorMsg };
      this.emit("flush:error", { error: errorMsg, attempt: this.config.retryAttempts });
      return result;

    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Update session info (e.g. after user logs in).
   * Flushes the current queue first to preserve session boundaries.
   */
  async resetSession(newSession?: Partial<SessionInfo>): Promise<void> {
    await this.flush();
    this.session = this.buildSession(newSession ?? {});
    this.logger.log("Session reset. New ID:", this.session.sessionId);
    this.emit("session:reset", this.session);
  }

  /** Returns a read-only snapshot of the current message queue. */
  getQueue(): Readonly<Required<ChatMessage>[]> {
    return cloneDeep(this.queue);
  }

  /** Returns the active session info. */
  getSession(): Readonly<Required<SessionInfo>> {
    return { ...this.session };
  }

  /** Returns how many messages are waiting in the queue. */
  get queueSize(): number {
    return this.queue.length;
  }

  /**
   * Flush remaining messages and tear down all timers/hooks.
   * Call this when your app unmounts or the chatbot is destroyed.
   */
  async destroy(): Promise<void> {
    this.stopIntervalFlush();
    await this.flush();
    this.logger.log("SDK destroyed.");
  }

  // ── Private Helpers ────────────────────────

  private buildSession(info: Partial<SessionInfo>): Required<SessionInfo> {
    return {
      sessionId:  info.sessionId  ?? generateUUID(),
      userId:     info.userId     ?? "",
      tags:       info.tags       ?? [],
      attributes: info.attributes ?? {},
    };
  }

  private startIntervalFlush(): void {
    if (this.config.flushInterval <= 0) return;
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => this.logger.error("Interval flush failed:", err));
    }, this.config.flushInterval);
  }

  private stopIntervalFlush(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private registerUnloadHook(): void {
    if (!this.config.flushOnUnload) return;
    if (typeof window === "undefined") return;

    window.addEventListener("beforeunload", () => {
      if (this.queue.length === 0) return;
      const payload: FlushPayload = {
        sdkVersion: SDK_VERSION,
        session:    this.session,
        messages:   cloneDeep(this.queue),
        flushedAt:  Date.now(),
      };
      this.queue = [];
      this.transport.sendBeacon(payload);
    });
  }
}
