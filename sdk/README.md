# chat-analytics-sdk

> Lightweight, zero-dependency SDK to collect chat history from any chatbot application and stream it to your remote analytics server.

[![npm version](https://img.shields.io/npm/v/chat-analytics-sdk)](https://www.npmjs.com/package/chat-analytics-sdk)
[![license](https://img.shields.io/npm/l/chat-analytics-sdk)](LICENSE)

---

## Features

- 📦 **Tiny** — zero runtime dependencies, ~3 KB gzipped
- 🔄 **Smart batching** — auto-flushes by message count or time interval
- 🔁 **Retry + back-off** — resilient delivery with exponential retry
- 🚀 **Beacon support** — uses `navigator.sendBeacon` on page unload so no messages are lost
- 🎯 **Typed** — full TypeScript definitions included
- 🪝 **Event hooks** — subscribe to `flush:success`, `flush:error`, etc.
- 🔐 **Auth** — API key sent as `Authorization: Bearer <key>` on every request
- 🌐 **Universal** — works in any browser-based chatbot (React, Vue, plain JS, etc.)

---

## Installation

```bash
npm install chat-analytics-sdk
# or
yarn add chat-analytics-sdk
# or
pnpm add chat-analytics-sdk
```

---

## Quick Start

```ts
import { createClient } from "chat-analytics-sdk";

const analytics = createClient({
  endpoint: "https://analytics.yourserver.com/ingest",
  apiKey:   "your-api-key",
  session:  { userId: "user_abc123" },
});

// Track messages as the conversation progresses
analytics.track({ role: "user",      content: "What is the weather today?" });
analytics.track({ role: "assistant", content: "It's 22 °C and sunny!" });

// Flush manually at any time
await analytics.flush();

// Clean up when the chatbot is unmounted
await analytics.destroy();
```

---

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `endpoint` | `string` | **required** | Full URL of your analytics ingest endpoint |
| `apiKey` | `string` | **required** | Bearer token sent in `Authorization` header |
| `session` | `SessionInfo` | `{}` | Session metadata (userId, tags, attributes) |
| `batchSize` | `number` | `20` | Auto-flush after N messages (0 = disabled) |
| `flushInterval` | `number` | `30000` | Auto-flush every N ms (0 = disabled) |
| `flushOnUnload` | `boolean` | `true` | Send remaining messages on page unload via Beacon |
| `retryAttempts` | `number` | `3` | Max retry attempts on network failure |
| `retryDelay` | `number` | `500` | Base delay (ms) for exponential back-off |
| `timeout` | `number` | `10000` | Request timeout in ms |
| `debug` | `boolean` | `false` | Enable verbose console logging |

---

## API Reference

### `createClient(config)` → `ChatAnalyticsClient`

Factory function — the recommended way to create the client.

---

### `client.track(message)` → `this`

Track a single message. Chainable.

```ts
analytics
  .track({ role: "user",      content: "Hi!" })
  .track({ role: "assistant", content: "Hello!" });
```

**Message fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | `"user" \| "assistant" \| "system" \| "tool"` | ✅ | Sender role |
| `content` | `string` | ✅ | Message text |
| `timestamp` | `number` | — | Unix ms. Defaults to `Date.now()` |
| `metadata` | `object` | — | Arbitrary data (tokens, latency, model, etc.) |

---

### `client.trackBatch(messages[])` → `this`

Track multiple messages at once.

```ts
analytics.trackBatch(conversationHistory);
```

---

### `client.flush()` → `Promise<FlushResult>`

Immediately send all queued messages to the server.

```ts
const result = await analytics.flush();
// { success: true, messageCount: 5 }
```

---

### `client.resetSession(newSession?)` → `Promise<void>`

Flush current messages, then start a new session (new `sessionId`).

```ts
// E.g. when a new user logs in
await analytics.resetSession({ userId: "user_xyz" });
```

---

### `client.destroy()` → `Promise<void>`

Flush, clear timers, and shut down the client.

```ts
// In React: useEffect(() => { return () => { analytics.destroy(); }; }, []);
```

---

### `client.on(event, listener)` → `() => void`

Subscribe to SDK events. Returns an unsubscribe function.

```ts
const off = analytics.on("flush:success", ({ messageCount }) => {
  console.log(`Sent ${messageCount} messages`);
});

// Later:
off(); // unsubscribe
```

**Available events:**

| Event | Payload |
|---|---|
| `message:tracked` | `ChatMessage` |
| `flush:start` | `{ messages: ChatMessage[] }` |
| `flush:success` | `{ success: true, messageCount: number }` |
| `flush:error` | `{ error: string, attempt: number }` |
| `session:reset` | `SessionInfo` |

---

## Server Payload Format

Each flush sends a `POST` request with `Content-Type: application/json`:

```json
{
  "sdkVersion": "1.0.0",
  "flushedAt": 1718000000000,
  "session": {
    "sessionId": "a1b2c3d4-...",
    "userId": "user_abc123",
    "tags": ["premium"],
    "attributes": { "appVersion": "2.4.1" }
  },
  "messages": [
    {
      "role": "user",
      "content": "What is the weather today?",
      "timestamp": 1718000000000,
      "metadata": {}
    },
    {
      "role": "assistant",
      "content": "It's 22 °C and sunny!",
      "timestamp": 1718000001234,
      "metadata": { "model": "gpt-4o", "latencyMs": 420 }
    }
  ]
}
```

---

## Usage with React

```tsx
import { useEffect, useRef } from "react";
import { createClient, ChatAnalyticsClient } from "chat-analytics-sdk";

function ChatApp() {
  const analyticsRef = useRef<ChatAnalyticsClient | null>(null);

  useEffect(() => {
    analyticsRef.current = createClient({
      endpoint: process.env.REACT_APP_ANALYTICS_ENDPOINT!,
      apiKey:   process.env.REACT_APP_ANALYTICS_KEY!,
      session:  { userId: currentUser.id },
    });

    return () => {
      analyticsRef.current?.destroy();
    };
  }, []);

  const handleSend = (userMessage: string, botReply: string) => {
    analyticsRef.current
      ?.track({ role: "user",      content: userMessage })
       .track({ role: "assistant", content: botReply });
  };

  // ...
}
```

---

## Publishing to npm

```bash
# 1. Build
npm run build

# 2. Login to npm
npm login

# 3. Publish
npm publish --access public
```

---

## License

MIT © Your Name
