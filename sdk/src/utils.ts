// ─────────────────────────────────────────────
//  Chat Analytics SDK — Utilities
// ─────────────────────────────────────────────

/** Generate a lightweight UUID v4 (no external dependency) */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Sleep helper for retry back-off */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Simple logger that respects the debug flag */
export class Logger {
  private readonly prefix = "[ChatAnalyticsSDK]";
  constructor(private debug: boolean) {}

  log(...args: unknown[]): void {
    if (this.debug) console.log(this.prefix, ...args);
  }

  warn(...args: unknown[]): void {
    if (this.debug) console.warn(this.prefix, ...args);
  }

  error(...args: unknown[]): void {
    // Errors are always logged (not gated by debug flag)
    console.error(this.prefix, ...args);
  }
}

/** Deep-clone a plain object (no circular refs, no functions) */
export function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
