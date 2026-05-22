// ─────────────────────────────────────────────
//  Chat Analytics SDK — Transport Layer
// ─────────────────────────────────────────────

import type { FlushPayload } from "./types";
import { sleep, Logger } from "./utils";

interface TransportOptions {
  endpoint: string;
  apiKey: string;
  retryAttempts: number;
  retryDelay: number;
  timeout: number;
  logger: Logger;
}

export class Transport {
  constructor(private readonly opts: TransportOptions) {}

  /**
   * Send payload via fetch with exponential back-off retries.
   * Returns true on success, throws on final failure.
   */
  async send(payload: FlushPayload): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.opts.apiKey}`,
      "X-SDK-Version": payload.sdkVersion,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.opts.retryAttempts; attempt++) {
      try {
        this.opts.logger.log(
          `Sending payload (attempt ${attempt}/${this.opts.retryAttempts})`,
          `messages: ${payload.messages.length}`
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.opts.timeout
        );

        const response = await fetch(this.opts.endpoint, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(
            `HTTP ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`
          );
        }

        this.opts.logger.log("Payload delivered successfully.");
        return; // ✅ success — exit retry loop

      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on abort (timeout) or 4xx client errors
        const isAbort = lastError.message.toLowerCase().includes("abort");
        const is4xx = lastError.message.match(/HTTP 4\d\d/);
        if (isAbort || is4xx) {
          this.opts.logger.error("Non-retryable error:", lastError.message);
          throw lastError;
        }

        if (attempt < this.opts.retryAttempts) {
          const delay = this.opts.retryDelay * 2 ** (attempt - 1); // exponential back-off
          this.opts.logger.warn(
            `Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms…`
          );
          await sleep(delay);
        }
      }
    }

    throw lastError ?? new Error("Unknown transport error");
  }

  /**
   * Best-effort fire-and-forget via navigator.sendBeacon (page unload).
   * Falls back to a synchronous XHR if Beacon API is unavailable.
   */
  sendBeacon(payload: FlushPayload): void {
    const body = JSON.stringify(payload);

    // Try Beacon API first (non-blocking, survives page unload)
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(
        `${this.opts.endpoint}?apiKey=${encodeURIComponent(this.opts.apiKey)}`,
        blob
      );
      if (ok) {
        this.opts.logger.log("Beacon sent on unload.");
        return;
      }
    }

    // Fallback: synchronous XHR (last resort — blocks briefly during unload)
    if (typeof XMLHttpRequest !== "undefined") {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", this.opts.endpoint, false); // false = synchronous
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Authorization", `Bearer ${this.opts.apiKey}`);
      try {
        xhr.send(body);
      } catch {
        /* swallow — page is unloading anyway */
      }
    }
  }
}
