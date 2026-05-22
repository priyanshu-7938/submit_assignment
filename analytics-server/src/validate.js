// ─────────────────────────────────────────────────────────────
//  validate.js  — lightweight payload validation (no libraries)
// ─────────────────────────────────────────────────────────────

const VALID_ROLES = new Set(["user", "assistant", "system", "tool"]);

/**
 * Validate the incoming SDK flush payload.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export function validatePayload(body) {
  if (!body || typeof body !== "object") {
    return err("Body must be a JSON object");
  }

  // Top-level required fields
  if (typeof body.sdkVersion !== "string" || !body.sdkVersion) {
    return err("Missing or invalid `sdkVersion`");
  }
  if (typeof body.flushedAt !== "number") {
    return err("Missing or invalid `flushedAt` (expected number)");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return err("`messages` must be a non-empty array");
  }
  if (body.messages.length > 500) {
    return err("`messages` array too large (max 500 per flush)");
  }

  // Session
  const s = body.session;
  if (!s || typeof s !== "object") {
    return err("Missing or invalid `session` object");
  }
  if (typeof s.sessionId !== "string" || !s.sessionId.trim()) {
    return err("`session.sessionId` must be a non-empty string");
  }

  // Messages
  for (let i = 0; i < body.messages.length; i++) {
    const m = body.messages[i];
    if (!m || typeof m !== "object") {
      return err(`messages[${i}] must be an object`);
    }
    if (!VALID_ROLES.has(m.role)) {
      return err(`messages[${i}].role must be one of: ${[...VALID_ROLES].join(", ")}`);
    }
    if (typeof m.content !== "string" || !m.content.trim()) {
      return err(`messages[${i}].content must be a non-empty string`);
    }
    if (m.content.length > 32_000) {
      return err(`messages[${i}].content exceeds 32,000 character limit`);
    }
    if (m.timestamp !== undefined && typeof m.timestamp !== "number") {
      return err(`messages[${i}].timestamp must be a number`);
    }
    if (m.metadata !== undefined && (typeof m.metadata !== "object" || Array.isArray(m.metadata))) {
      return err(`messages[${i}].metadata must be a plain object`);
    }
  }

  return { ok: true };
}

const err = (error) => ({ ok: false, error });
