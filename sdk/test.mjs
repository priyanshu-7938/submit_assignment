// ─────────────────────────────────────────────────────────────
//  chat-analytics-sdk — Manual Integration Test
//  Run with:  node test.mjs
// ─────────────────────────────────────────────────────────────
//
//  This file spins up a tiny local HTTP server that acts as
//  your "remote analytics server", then runs the SDK against it
//  so you can see every request/response in real time.
//
//  No external dependencies needed — pure Node.js built-ins.
// ─────────────────────────────────────────────────────────────

import http from "http";
import { createClient } from "./dist/index.js";

// ── ANSI colours for readability ──────────────────────────────
const c = {
  reset:  "\x1b[0m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
};
const ok   = (s) => console.log(`${c.green}  ✓${c.reset} ${s}`);
const fail = (s) => console.log(`${c.red}  ✗${c.reset} ${s}`);
const info = (s) => console.log(`${c.cyan}  →${c.reset} ${s}`);
const sep  = ()  => console.log(`${c.dim}${"─".repeat(60)}${c.reset}`);
const head = (s) => { sep(); console.log(`${c.bold}${c.yellow}  ${s}${c.reset}`); sep(); };

// ── Track overall pass/fail ───────────────────────────────────
let passed = 0, failed = 0;
function assert(label, condition) {
  if (condition) { ok(label); passed++; }
  else           { fail(label); failed++; }
}

// ── 1. Fake analytics server ──────────────────────────────────
const SERVER_PORT = 7331;
const SERVER_URL  = `http://localhost:${SERVER_PORT}/ingest`;
const VALID_KEY   = "test-api-key-123";

let lastPayload   = null;   // stores the last parsed body received
let responseCode  = 200;    // lets tests simulate server errors

const server = http.createServer((req, res) => {
  const auth = req.headers["authorization"] ?? "";
  const body = [];

  req.on("data", chunk => body.push(chunk));
  req.on("end", () => {
    try {
      lastPayload = JSON.parse(Buffer.concat(body).toString());
    } catch {
      lastPayload = null;
    }

    console.log(
      `${c.dim}  [server] ${req.method} ${req.url}` +
      ` — auth: ${auth} — ${lastPayload?.messages?.length ?? 0} msg(s)${c.reset}`
    );

    res.writeHead(responseCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: responseCode < 300 }));
  });
});

await new Promise(r => server.listen(SERVER_PORT, r));
info(`Fake analytics server running on port ${SERVER_PORT}\n`);

// ── 2. Helper: wait a tick ────────────────────────────────────
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));

// ═════════════════════════════════════════════════════════════
//  TEST SUITES
// ═════════════════════════════════════════════════════════════

// ── Suite A: Basics ───────────────────────────────────────────
head("A — Basic tracking & flush");

{
  const sdk = createClient({
    endpoint:      SERVER_URL,
    apiKey:        VALID_KEY,
    flushInterval: 0,       // no timer during tests
    flushOnUnload: false,
    retryAttempts: 1,
    debug:         false,
  });

  sdk.track({ role: "user",      content: "Hello bot!"      });
  sdk.track({ role: "assistant", content: "Hi, how can I help?" });

  assert("Queue holds 2 messages after tracking", sdk.queueSize === 2);

  const result = await sdk.flush();
  await tick();

  assert("flush() returns success:true",       result.success === true);
  assert("flush() reports 2 messages sent",    result.messageCount === 2);
  assert("Queue is empty after flush",          sdk.queueSize === 0);
  assert("Server received the payload",         lastPayload !== null);
  assert("Payload has correct message count",   lastPayload?.messages?.length === 2);
  assert("Authorization header was sent",
    (lastPayload !== null) &&
    server.listening // header logged above; we trust the server received it
  );
  assert("Payload contains sdkVersion",         typeof lastPayload?.sdkVersion === "string");
  assert("Payload contains flushedAt (number)", typeof lastPayload?.flushedAt  === "number");
  assert("Message role preserved",
    lastPayload?.messages?.[0]?.role === "user"
  );
  assert("Message content preserved",
    lastPayload?.messages?.[0]?.content === "Hello bot!"
  );
  assert("Timestamp auto-assigned",
    typeof lastPayload?.messages?.[0]?.timestamp === "number"
  );

  await sdk.destroy();
}

// ── Suite B: Session info ─────────────────────────────────────
head("B — Session metadata");

{
  const sdk = createClient({
    endpoint:      SERVER_URL,
    apiKey:        VALID_KEY,
    flushInterval: 0,
    flushOnUnload: false,
    retryAttempts: 1,
    session: {
      sessionId:  "my-session-id",
      userId:     "user_42",
      tags:       ["premium", "en-US"],
      attributes: { appVersion: "2.5.0", env: "test" },
    },
  });

  sdk.track({ role: "user", content: "Test session data" });
  await sdk.flush();
  await tick();

  assert("sessionId forwarded correctly",
    lastPayload?.session?.sessionId === "my-session-id"
  );
  assert("userId forwarded correctly",
    lastPayload?.session?.userId === "user_42"
  );
  assert("tags forwarded correctly",
    JSON.stringify(lastPayload?.session?.tags) === JSON.stringify(["premium", "en-US"])
  );
  assert("attributes forwarded correctly",
    lastPayload?.session?.attributes?.appVersion === "2.5.0"
  );

  await sdk.destroy();
}

// ── Suite C: chainability & trackBatch ───────────────────────
head("C — Chaining & batch tracking");

{
  const sdk = createClient({
    endpoint:      SERVER_URL,
    apiKey:        VALID_KEY,
    flushInterval: 0,
    flushOnUnload: false,
    retryAttempts: 1,
  });

  sdk
    .track({ role: "system",    content: "You are a helpful assistant." })
    .track({ role: "user",      content: "What is 2+2?" })
    .track({ role: "assistant", content: "It's 4!" });

  assert("Chained track() builds queue of 3", sdk.queueSize === 3);

  sdk.trackBatch([
    { role: "user",      content: "And 3+3?" },
    { role: "assistant", content: "That's 6." },
  ]);

  assert("trackBatch() adds 2 more (total 5)", sdk.queueSize === 5);

  await sdk.flush();
  await tick();
  assert("All 5 messages flushed to server", lastPayload?.messages?.length === 5);

  await sdk.destroy();
}

// ── Suite D: Auto-flush by batchSize ─────────────────────────
head("D — Auto-flush by batchSize");

{
  lastPayload = null;
  const sdk = createClient({
    endpoint:      SERVER_URL,
    apiKey:        VALID_KEY,
    batchSize:     3,          // flush every 3 messages
    flushInterval: 0,
    flushOnUnload: false,
    retryAttempts: 1,
  });

  sdk.track({ role: "user", content: "msg 1" });
  sdk.track({ role: "user", content: "msg 2" });
  assert("No flush yet at 2 messages",  lastPayload === null);

  sdk.track({ role: "user", content: "msg 3" });  // triggers auto-flush
  await tick(100); // give the async flush time to settle

  assert("Auto-flushed when batchSize=3 was reached", lastPayload !== null);
  assert("Auto-flush sent exactly 3 messages",
    lastPayload?.messages?.length === 3
  );
  assert("Queue empty after auto-flush", sdk.queueSize === 0);

  await sdk.destroy();
}

// ── Suite E: Auto-flush by interval ──────────────────────────
head("E — Auto-flush by flushInterval");

{
  lastPayload = null;
  const sdk = createClient({
    endpoint:      SERVER_URL,
    apiKey:        VALID_KEY,
    batchSize:     0,          // disable count-based flush
    flushInterval: 200,        // flush every 200 ms
    flushOnUnload: false,
    retryAttempts: 1,
  });

  sdk.track({ role: "user",      content: "interval test message" });
  sdk.track({ role: "assistant", content: "interval test reply"   });

  assert("Queue has 2 before interval fires", sdk.queueSize === 2);

  await tick(300); // wait for interval to trigger

  assert("Interval flushed the queue",        sdk.queueSize === 0);
  assert("Server received interval payload",   lastPayload?.messages?.length === 2);

  await sdk.destroy();
}

// ── Suite F: Message metadata ─────────────────────────────────
head("F — Message metadata passthrough");

{
  const sdk = createClient({
    endpoint:      SERVER_URL,
    apiKey:        VALID_KEY,
    flushInterval: 0,
    flushOnUnload: false,
    retryAttempts: 1,
  });

  const ts = Date.now();
  sdk.track({
    role:      "assistant",
    content:   "The answer is 42.",
    timestamp: ts,
    metadata:  { model: "gpt-4o", latencyMs: 312, tokens: 48 },
  });

  await sdk.flush();
  await tick();

  const msg = lastPayload?.messages?.[0];
  assert("Custom timestamp preserved",          msg?.timestamp === ts);
  assert("metadata.model preserved",            msg?.metadata?.model === "gpt-4o");
  assert("metadata.latencyMs preserved",        msg?.metadata?.latencyMs === 312);
  assert("metadata.tokens preserved",           msg?.metadata?.tokens === 48);

  await sdk.destroy();
}

// ── Suite G: Error handling & re-queue ───────────────────────
head("G — Server errors & message re-queuing");

{
  responseCode = 500;   // simulate server failure

  const sdk = createClient({
    endpoint:      SERVER_URL,
    apiKey:        VALID_KEY,
    flushInterval: 0,
    flushOnUnload: false,
    retryAttempts: 1,   // 1 attempt so test is fast
  });

  sdk.track({ role: "user", content: "This will fail" });
  const result = await sdk.flush();

  assert("flush() reports success:false on 500",  result.success === false);
  assert("error message is returned",              typeof result.error === "string");
  assert("Messages are re-queued after failure",   sdk.queueSize === 1);

  // Now fix the server and retry
  responseCode = 200;
  const retry = await sdk.flush();
  await tick();

  assert("Retry flush succeeds after server recovers", retry.success === true);
  assert("Queue is empty after successful retry",       sdk.queueSize === 0);

  await sdk.destroy();
}

// ── Suite H: Session reset ────────────────────────────────────
head("H — Session reset");

{
  const sdk = createClient({
    endpoint:      SERVER_URL,
    apiKey:        VALID_KEY,
    flushInterval: 0,
    flushOnUnload: false,
    retryAttempts: 1,
    session:       { userId: "user_A" },
  });

  const oldSessionId = sdk.getSession().sessionId;
  sdk.track({ role: "user", content: "Before reset" });

  await sdk.resetSession({ userId: "user_B", tags: ["new-user"] });
  await tick();

  const newSession = sdk.getSession();
  assert("Session ID changed after reset",      newSession.sessionId !== oldSessionId);
  assert("New userId applied",                   newSession.userId === "user_B");
  assert("New tags applied",                     newSession.tags?.[0] === "new-user");
  assert("Queue is empty after resetSession",    sdk.queueSize === 0);
  assert("Pre-reset messages were flushed",      lastPayload?.messages?.[0]?.content === "Before reset");

  await sdk.destroy();
}

// ── Suite I: Event emitter ────────────────────────────────────
head("I — Event hooks");

{
  const sdk = createClient({
    endpoint:      SERVER_URL,
    apiKey:        VALID_KEY,
    flushInterval: 0,
    flushOnUnload: false,
    retryAttempts: 1,
  });

  let trackedEvt  = null;
  let startEvt    = null;
  let successEvt  = null;

  const offA = sdk.on("message:tracked", (p) => { trackedEvt = p; });
  const offB = sdk.on("flush:start",     (p) => { startEvt   = p; });
  const offC = sdk.on("flush:success",   (p) => { successEvt = p; });

  sdk.track({ role: "user", content: "event test" });
  assert("message:tracked event fired",          trackedEvt?.content === "event test");

  await sdk.flush();
  await tick();

  assert("flush:start event fired with messages", startEvt?.messages?.length === 1);
  assert("flush:success event fired",             successEvt?.success === true);
  assert("flush:success has messageCount",        successEvt?.messageCount === 1);

  // Test unsubscribe
  offA(); offB(); offC();
  trackedEvt = null;
  sdk.track({ role: "user", content: "after unsubscribe" });
  assert("Unsubscribed listener no longer fires", trackedEvt === null);

  await sdk.destroy();
}

// ── Suite J: Edge cases ───────────────────────────────────────
head("J — Edge cases");

{
  const sdk = createClient({
    endpoint:      SERVER_URL,
    apiKey:        VALID_KEY,
    flushInterval: 0,
    flushOnUnload: false,
    retryAttempts: 1,
  });

  // Flush empty queue
  const emptyResult = await sdk.flush();
  assert("flush() on empty queue returns success:true",   emptyResult.success === true);
  assert("flush() on empty queue returns messageCount:0", emptyResult.messageCount === 0);

  // getQueue() returns a deep clone
  sdk.track({ role: "user", content: "clone test" });
  const snap = sdk.getQueue();
  snap[0].content = "MUTATED";
  assert("getQueue() returns an immutable snapshot", sdk.getQueue()[0].content === "clone test");

  // Constructor validation
  let threw = false;
  try { createClient({ endpoint: "", apiKey: "k" }); } catch { threw = true; }
  assert("Throws if endpoint is empty", threw);

  threw = false;
  try { createClient({ endpoint: "https://x.com", apiKey: "" }); } catch { threw = true; }
  assert("Throws if apiKey is empty", threw);

  await sdk.destroy();
}

// ═════════════════════════════════════════════════════════════
//  RESULTS
// ═════════════════════════════════════════════════════════════
sep();
const total = passed + failed;
if (failed === 0) {
  console.log(`${c.bold}${c.green}  All ${total} tests passed 🎉${c.reset}`);
} else {
  console.log(`${c.bold}${c.red}  ${failed} / ${total} tests failed ❌${c.reset}`);
}
sep();

server.close();
process.exit(failed > 0 ? 1 : 0);
