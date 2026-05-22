// ─────────────────────────────────────────────────────────────
//  server.js  — Chat Analytics Ingestion + Query API
//
//  POST /ingest              ← SDK sends flush payloads here
//  GET  /api/stats           ← overview counts
//  GET  /api/sessions        ← recent sessions list
//  GET  /api/sessions/:id    ← full conversation for a session
//  GET  /api/messages        ← messages (filter by ?role=)
//  GET  /api/log             ← ingestion audit trail
//  GET  /health              ← liveness probe
// ─────────────────────────────────────────────────────────────

import express           from "express";
import fs                from "fs";
import cors from "cors";
import path              from "path";
import { fileURLToPath } from "url";
import { prisma, storeFlush, queries } from "./db.js";
import { validatePayload }             from "./validate.js";
import dotenv from "dotenv";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(__dirname, "../data"), { recursive: true });

const PORT    = process.env.PORT    || 4000;
const API_KEY = process.env.API_KEY || "test-api-key-123";

// ── Boot DB then start server ──────────────────────────────────
// await initDB();

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
}));
app.use(express.json({ limit: "1mb" }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}]  ${req.method.padEnd(5)} ${req.path}`);
  next();
});


function requireAuth(req, res, next) {
  // 1. Check for the custom x-api-key header
  const apiKey = req.headers["x-api-key"];

  // 2. Safely grab the Authorization header and strip out the "Bearer " prefix
  const authHeader = req.headers["authorization"];
  const bearerToken = authHeader && authHeader.startsWith("Bearer ") 
    ? authHeader.split(" ")[1] 
    : undefined;

  // 3. Compare both options against your secret API_KEY
  // (Assuming API_KEY is defined globally or imported in your server.js)
  if (apiKey !== API_KEY && bearerToken !== API_KEY) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  next();
}
// ─────────────────────────────────────────────────────────────
//  POST /ingest
// ─────────────────────────────────────────────────────────────
app.post("/ingest", requireAuth, (req, res) => {
  const check = validatePayload(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });

  try {
    storeFlush({ payload: req.body, ip: req.ip ?? "", receivedAt: Date.now() });
  } catch (err) {
    console.error("  ✗", err.message);
    return res.status(500).json({ error: "Storage error" });
  }

  const count = req.body.messages.length;
  console.log(`  ✓ stored ${count} msg(s)  session=${req.body.session.sessionId}`);
  return res.status(201).json({ ok: true, stored: count });
});

// // ─────────────────────────────────────────────────────────────
// //  GET /api/stats
// // ─────────────────────────────────────────────────────────────
// app.get("/api/stats", (_req, res) => {
//   res.json({ totals: queries.stats(), by_role: queries.byRole() });
// });

// // ─────────────────────────────────────────────────────────────
// //  GET /api/sessions?limit=20
// // ─────────────────────────────────────────────────────────────
// app.get("/api/sessions", (req, res) => {
//   const limit = Math.min(Number(req.query.limit) || 20, 100);
//   res.json(queries.recentSessions(limit));
// });

// // ─────────────────────────────────────────────────────────────
// //  GET /api/sessions/:id
// // ─────────────────────────────────────────────────────────────
// app.get("/api/sessions/:id", (req, res) => {
//   const rows = queries.sessionMessages(req.params.id);
//   if (rows.length === 0) return res.status(404).json({ error: "Session not found" });
//   res.json({ session_id: req.params.id, messages: rows });
// });

// // ─────────────────────────────────────────────────────────────
// //  GET /api/messages?role=user&limit=50
// // ─────────────────────────────────────────────────────────────
// const VALID_ROLES = ["user", "assistant", "system", "tool"];

// app.get("/api/messages", (req, res) => {
//   const limit = Math.min(Number(req.query.limit) || 50, 200);
//   const role  = VALID_ROLES.includes(req.query.role) ? req.query.role : null;
//   res.json(queries.messages(role, limit));
// });

// // ─────────────────────────────────────────────────────────────
// //  GET /api/log?limit=50
// // ─────────────────────────────────────────────────────────────
// app.get("/api/log", (req, res) => {
//   const limit = Math.min(Number(req.query.limit) || 50, 200);
//   res.json(queries.ingestionLog(limit));
// });

// // ─────────────────────────────────────────────────────────────
// //  GET /health
// // ─────────────────────────────────────────────────────────────
// app.get("/health", (_req, res) => {
//   res.json({ status: "ok", ts: new Date().toISOString() });
// });
// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────
function serializeBigInt(obj) {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

// ─────────────────────────────────────────────────────────────
//  GET /api/stats
// ─────────────────────────────────────────────────────────────
app.get("/api/stats", async (_req, res) => {
  const totals = await queries.stats();
  const by_role = await queries.byRole();

  res.json(
    serializeBigInt({
      totals,
      by_role,
    })
  );
});

// ─────────────────────────────────────────────────────────────
//  GET /api/sessions?limit=20
// ─────────────────────────────────────────────────────────────
app.get("/api/sessions", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const sessions = await queries.recentSessions(limit);

  res.json(serializeBigInt(sessions));
});

// ─────────────────────────────────────────────────────────────
//  GET /api/sessions/:id
// ─────────────────────────────────────────────────────────────
app.get("/api/sessions/:id", async (req, res) => {
  const rows = await queries.sessionMessages(req.params.id);

  if (rows.length === 0) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json(
    serializeBigInt({
      session_id: req.params.id,
      messages: rows,
    })
  );
});

// ─────────────────────────────────────────────────────────────
//  GET /api/messages?role=user&limit=50
// ─────────────────────────────────────────────────────────────
const VALID_ROLES = ["user", "assistant", "system", "tool"];

app.get("/api/messages", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const role = VALID_ROLES.includes(req.query.role)
    ? req.query.role
    : null;

  const messages = await queries.messages(role, limit);

  res.json(serializeBigInt(messages));
});

// ─────────────────────────────────────────────────────────────
//  GET /api/log?limit=50
// ─────────────────────────────────────────────────────────────
app.get("/api/log", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const log = await queries.ingestionLog(limit);

  res.json(serializeBigInt(log));
});

// ─────────────────────────────────────────────────────────────
//  GET /health
// ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    ts: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`\n :: Chat Server  →  http://localhost:${PORT}`);
  console.log(`   POST /ingest            SDK endpoint (Bearer auth)`);
  console.log(`   GET  /api/stats         overview counts + by-role`);
  console.log(`   GET  /api/sessions      recent sessions`);
  console.log(`   GET  /api/sessions/:id  full conversation`);
  console.log(`   GET  /api/messages      all messages (filter by role)`);
  console.log(`   GET  /api/log           ingestion audit trail`);
  console.log(`   GET  /health            liveness\n`);
});
