// ─────────────────────────────────────────────
//  Chat Analytics SDK — Tests
// ─────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient, ChatAnalyticsClient } from "../src/index";

// ── Mock fetch ────────────────────────────────
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function mockOkResponse() {
  mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => "" });
}

function mockErrorResponse(status = 500, body = "Server Error") {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    statusText: body,
    text: async () => body,
  });
}

// ── Helpers ───────────────────────────────────
function makeClient(overrides = {}) {
  return createClient({
    endpoint: "https://analytics.example.com/ingest",
    apiKey: "test-key-123",
    flushInterval: 0,     // disable timer in tests
    flushOnUnload: false, // disable unload hook in tests
    retryAttempts: 1,     // fast tests
    debug: false,
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────
describe("ChatAnalyticsClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Construction
  it("throws if endpoint is missing", () => {
    expect(() => new ChatAnalyticsClient({ endpoint: "", apiKey: "k" })).toThrow();
  });

  it("throws if apiKey is missing", () => {
    expect(() => new ChatAnalyticsClient({ endpoint: "https://x.com", apiKey: "" })).toThrow();
  });

  it("creates a client with a session ID", () => {
    const client = makeClient();
    expect(client.getSession().sessionId).toBeTruthy();
  });

  it("respects a provided sessionId", () => {
    const client = makeClient({ session: { sessionId: "my-session" } });
    expect(client.getSession().sessionId).toBe("my-session");
  });

  // Tracking
  it("track() adds a message to the queue", () => {
    const client = makeClient();
    client.track({ role: "user", content: "Hello" });
    expect(client.queueSize).toBe(1);
  });

  it("track() normalizes timestamp and metadata", () => {
    const client = makeClient();
    client.track({ role: "user", content: "Hi" });
    const msg = client.getQueue()[0];
    expect(typeof msg.timestamp).toBe("number");
    expect(msg.metadata).toEqual({});
  });

  it("trackBatch() adds multiple messages", () => {
    const client = makeClient();
    client.trackBatch([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "World" },
    ]);
    expect(client.queueSize).toBe(2);
  });

  it("track() is chainable", () => {
    const client = makeClient();
    const result = client.track({ role: "user", content: "a" });
    expect(result).toBe(client);
  });

  // Auto-flush by batch size
  it("auto-flushes when batchSize is reached", async () => {
    mockOkResponse();
    const client = makeClient({ batchSize: 2 });
    client.track({ role: "user", content: "msg1" });
    client.track({ role: "user", content: "msg2" }); // triggers flush
    await vi.runAllTimersAsync();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // Manual flush
  it("flush() sends messages and clears the queue", async () => {
    mockOkResponse();
    const client = makeClient();
    client.track({ role: "user", content: "test" });
    const result = await client.flush();
    expect(result.success).toBe(true);
    expect(result.messageCount).toBe(1);
    expect(client.queueSize).toBe(0);
  });

  it("flush() sends correct payload structure", async () => {
    mockOkResponse();
    const client = makeClient({ session: { userId: "u1" } });
    client.track({ role: "user", content: "hi" });
    await client.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      sdkVersion: expect.any(String),
      session: { userId: "u1" },
      messages: [{ role: "user", content: "hi" }],
      flushedAt: expect.any(Number),
    });
  });

  it("flush() sends Authorization header", async () => {
    mockOkResponse();
    const client = makeClient();
    client.track({ role: "user", content: "x" });
    await client.flush();

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBe("Bearer test-key-123");
  });

  it("flush() returns success:false and re-queues on network error", async () => {
    mockErrorResponse(500);
    const client = makeClient({ retryAttempts: 1 });
    client.track({ role: "user", content: "x" });
    const result = await client.flush();
    expect(result.success).toBe(false);
    expect(client.queueSize).toBe(1); // re-queued
  });

  it("flush() on empty queue returns early without fetching", async () => {
    const client = makeClient();
    const result = await client.flush();
    expect(result.success).toBe(true);
    expect(result.messageCount).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Events
  it("emits message:tracked event", () => {
    const client = makeClient();
    const listener = vi.fn();
    client.on("message:tracked", listener);
    client.track({ role: "user", content: "hey" });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", content: "hey" })
    );
  });

  it("emits flush:success event", async () => {
    mockOkResponse();
    const client = makeClient();
    const listener = vi.fn();
    client.on("flush:success", listener);
    client.track({ role: "user", content: "x" });
    await client.flush();
    expect(listener).toHaveBeenCalledWith({ success: true, messageCount: 1 });
  });

  // Session reset
  it("resetSession() flushes and generates a new sessionId", async () => {
    mockOkResponse();
    const client = makeClient();
    const oldId = client.getSession().sessionId;
    client.track({ role: "user", content: "before reset" });
    await client.resetSession({ userId: "new-user" });
    expect(client.getSession().sessionId).not.toBe(oldId);
    expect(client.getSession().userId).toBe("new-user");
    expect(client.queueSize).toBe(0);
  });

  // Destroy
  it("destroy() flushes remaining messages", async () => {
    mockOkResponse();
    const client = makeClient();
    client.track({ role: "user", content: "last message" });
    await client.destroy();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(client.queueSize).toBe(0);
  });
});
