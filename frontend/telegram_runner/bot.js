/**
 * Telegram Deployment Bot
 * 
 * Setup:
 *   npm install node-telegram-bot-api
 * 
 * Run:
 *   BOT_TOKEN=your_token CHAT_ID=your_chat_id node bot.js
 *   or via pm2: pm2 start bot.js --name deploy-bot
 * 
 * Onboard a new service:
 *   /new <name> <absolute/path/to/dir>
 *   The dir must contain a deploy.sh script.
 *   deploy.sh is responsible for installing deps and starting the app via pm2.
 *   Example deploy.sh:
 *     #!/bin/bash
 *     cd "$(dirname "$0")"
 *     npm install
 *     pm2 start index.js --name my-service
 * 
 * Commands:
 *   /list              - List all managed services and their pm2 status
 *   /new <name> <dir>  - Onboard a new service (runs deploy.sh, registers it)
 *   /deploy <name>     - Re-run deploy.sh for a service (redeploy)
 *   /down <name>       - pm2 stop + delete the service
 *   /remove <name>     - Remove service from bot control (does not stop it)
 *   /status <name>     - Show pm2 status for a single service
 *   /help              - Show this help
 */

const TelegramBot = require("node-telegram-bot-api");
const { execSync, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

// ── Config ────────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;   // Only this chat can control the bot
const STATE_FILE = path.resolve(__dirname, "deployments.json");
const POLL_INTERVAL_MS = 30_000;         // How often to check pm2 health

if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN environment variable.");
  process.exit(1);
}
if (!CHAT_ID) {
  console.error("Missing CHAT_ID environment variable.");
  process.exit(1);
}

// ── State ─────────────────────────────────────────────────────────────────────

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── PM2 helpers ───────────────────────────────────────────────────────────────

function pm2List() {
  try {
    const out = execSync("pm2 jlist", { encoding: "utf8" });
    return JSON.parse(out);
  } catch {
    return [];
  }
}

function pm2Find(name) {
  return pm2List().find((p) => p.name === name) || null;
}

function pm2Status(name) {
  const proc = pm2Find(name);
  if (!proc) return "not found";
  return proc.pm2_env.status; // online | stopped | errored | stopping | launching
}

// ── Bot ───────────────────────────────────────────────────────────────────────

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function send(text) {
  return bot.sendMessage(CHAT_ID, text, { parse_mode: "Markdown" });
}

// Guard: ignore messages from other chats
bot.on("message", (msg) => {
  if (String(msg.chat.id) !== String(CHAT_ID)) return;
});

// ── /help ─────────────────────────────────────────────────────────────────────

bot.onText(/\/help/, () => {
  send(
    "*Deployment Bot Commands*\n\n" +
    "`/list` — List managed services\n" +
    "`/new <name> <dir>` — Onboard service (runs deploy.sh)\n" +
    "`/deploy <name>` — Redeploy a service\n" +
    "`/down <name>` — Stop & remove from pm2\n" +
    "`/remove <name>` — Remove from bot control only\n" +
    "`/status <name>` — Show pm2 status\n"
  );
});

// ── /list ─────────────────────────────────────────────────────────────────────

bot.onText(/\/list/, (msg) => {
  if (String(msg.chat.id) !== String(CHAT_ID)) return;

  const state = loadState();
  const names = Object.keys(state);
  if (names.length === 0) {
    send("No services under bot control. Use `/new` to onboard one.");
    return;
  }

  const lines = names.map((name) => {
    const { dir } = state[name];
    const status = pm2Status(name);
    const icon = status === "online" ? "🟢" : status === "errored" ? "🔴" : "🟡";
    return `${icon} *${name}* — \`${status}\`\n   📁 ${dir}`;
  });

  send("*Managed Services*\n\n" + lines.join("\n\n"));
});

// ── /new <name> <dir> ─────────────────────────────────────────────────────────

bot.onText(/\/new (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== String(CHAT_ID)) return;

  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 2) {
    send("Usage: `/new <name> <absolute-dir>`");
    return;
  }

  const [name, ...dirParts] = parts;
  const dir = dirParts.join(" ");

  if (!fs.existsSync(dir)) {
    send(`❌ Directory not found: \`${dir}\``);
    return;
  }

  const scriptPath = path.join(dir, "deploy.sh");
  if (!fs.existsSync(scriptPath)) {
    send(`❌ No \`deploy.sh\` found in \`${dir}\``);
    return;
  }

  const state = loadState();
  if (state[name]) {
    send(`⚠️ *${name}* is already registered. Use \`/deploy ${name}\` to redeploy.`);
    return;
  }

  send(`⏳ Onboarding *${name}*...`);

  exec(`bash "${scriptPath}" ${name}`, { cwd: dir }, (err, stdout, stderr) => {
    if (err) {
      send(`❌ deploy.sh failed for *${name}*:\n\`\`\`\n${stderr || err.message}\n\`\`\``);
      return;
    }

    state[name] = { dir };
    saveState(state);

    const status = pm2Status(name);
    send(
      `✅ *${name}* onboarded successfully!\n` +
      `pm2 status: \`${status}\`\n` +
      `📁 ${dir}`
    );
  });
});

// ── /deploy <name> ────────────────────────────────────────────────────────────

bot.onText(/\/deploy (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== String(CHAT_ID)) return;

  const name = match[1].trim();
  const state = loadState();

  if (!state[name]) {
    send(`❌ *${name}* is not managed by this bot. Use \`/new\` to onboard it.`);
    return;
  }

  const { dir } = state[name];
  const scriptPath = path.join(dir, "deploy.sh");

  if (!fs.existsSync(scriptPath)) {
    send(`❌ deploy.sh not found in \`${dir}\``);
    return;
  }

  send(`⏳ Redeploying *${name}*...`);

  exec(`bash "${scriptPath}"`, { cwd: dir }, (err, stdout, stderr) => {
    if (err) {
      send(`❌ Redeploy failed for *${name}*:\n\`\`\`\n${stderr || err.message}\n\`\`\``);
      return;
    }

    const status = pm2Status(name);
    send(`✅ *${name}* redeployed. pm2 status: \`${status}\``);
  });
});

// ── /down <name> ──────────────────────────────────────────────────────────────

bot.onText(/\/down (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== String(CHAT_ID)) return;

  const name = match[1].trim();
  const state = loadState();

  if (!state[name]) {
    send(`❌ *${name}* is not managed by this bot.`);
    return;
  }

  try {
    execSync(`pm2 stop ${name} && pm2 delete ${name}`, { encoding: "utf8" });
  } catch (e) {
    // Process may not exist in pm2 at all — that's fine
  }

  delete state[name];
  saveState(state);

  send(`🛑 *${name}* stopped, removed from pm2, and unregistered from bot.`);
});

// ── /remove <name> ────────────────────────────────────────────────────────────

bot.onText(/\/remove (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== String(CHAT_ID)) return;

  const name = match[1].trim();
  const state = loadState();

  if (!state[name]) {
    send(`❌ *${name}* is not managed by this bot.`);
    return;
  }

  delete state[name];
  saveState(state);

  send(`🗑 *${name}* removed from bot control. The pm2 process was left running.`);
});

// ── /status <name> ────────────────────────────────────────────────────────────

bot.onText(/\/status (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== String(CHAT_ID)) return;

  const name = match[1].trim();
  const state = loadState();

  if (!state[name]) {
    send(`❌ *${name}* is not managed by this bot.`);
    return;
  }

  const proc = pm2Find(name);
  if (!proc) {
    send(`⚠️ *${name}* is registered but not found in pm2.`);
    return;
  }

  const env = proc.pm2_env;
  const uptime = env.pm_uptime ? new Date(env.pm_uptime).toISOString() : "N/A";
  const restarts = env.restart_time ?? 0;

  send(
    `*${name}* status\n\n` +
    `Status:   \`${env.status}\`\n` +
    `Restarts: \`${restarts}\`\n` +
    `Started:  \`${uptime}\`\n` +
    `Script:   \`${env.pm_exec_path || "N/A"}\`\n` +
    `📁 ${state[name].dir}`
  );
});

// ── Health Monitor ────────────────────────────────────────────────────────────
// Polls pm2 every POLL_INTERVAL_MS and alerts if a managed service is not online.

const alertedDown = new Set(); // track already-alerted services to avoid spam

setInterval(() => {
  const state = loadState();
  for (const name of Object.keys(state)) {
    const status = pm2Status(name);
    if (status !== "online") {
      if (!alertedDown.has(name)) {
        alertedDown.add(name);
        send(`🚨 *${name}* is *${status}*! Check the service.`);
      }
    } else {
      // Recovered — clear alert so next outage triggers again
      if (alertedDown.has(name)) {
        alertedDown.delete(name);
        send(`✅ *${name}* is back *online*.`);
      }
    }
  }
}, POLL_INTERVAL_MS);

// ── Start ─────────────────────────────────────────────────────────────────────

console.log("Deployment bot started.");
send("🤖 Deployment bot started. Type /help for commands.");