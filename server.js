// server.js (Railway-ready)
// CommonJS (matches your package.json: "type": "commonjs")

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const twilio = require("twilio");

const app = express();

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(cors());

// ─────────────────────────────────────────────
// In-memory stores (MVP)
// NOTE: These reset when Railway redeploys/restarts.
// ─────────────────────────────────────────────
const PROFILES = {};      // { [profileId]: { ...profileData, status, createdAt, activatedAt } }
const subscribers = [];   // [{ name, email, phone, alertMethods: ["email","sms"] }]

// ─────────────────────────────────────────────
// ENV helpers
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const WEBHOOK_KEY = process.env.WEBHOOK_KEY || ""; // optional shared secret

function requireKey(req) {
  if (!WEBHOOK_KEY) return true; // if you didn't set one, skip auth
  const headerKey = req.headers["x-webhook-key"];
  const bodyKey = req.body && req.body.key;
  return headerKey === WEBHOOK_KEY || bodyKey === WEBHOOK_KEY;
}

// ─────────────────────────────────────────────
// Root + Health (Railway checks)
// ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).send("TradeFire server is running ✅");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tradefire-server",
    time: new Date().toISOString(),
    subscribers: subscribers.length,
    profiles: Object.keys(PROFILES).length,
  });
});

// ─────────────────────────────────────────────
// Email (Nodemailer)
// Set these Railway Variables if you want email to work:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL
// ─────────────────────────────────────────────
function getMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // 465 = true, 587 = false
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendEmail(to, subject, text) {
  const transport = getMailer();
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;

  if (!transport) {
    console.log("Email skipped (SMTP env vars missing). Would have sent to:", to, subject);
    return { ok: false, skipped: true, reason: "missing_smtp_env" };
  }

  await transport.sendMail({ from, to, subject, text });
  return { ok: true };
}

// ─────────────────────────────────────────────
// SMS (Twilio)
// Set these Railway Variables if you want SMS to work:
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
// ─────────────────────────────────────────────
function getTwilioClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

async function sendSMS(to, body) {
  const client = getTwilioClient();
  const from = process.env.TWILIO_FROM;

  if (!client || !from) {
    console.log("SMS skipped (Twilio env vars missing). Would have sent to:", to);
    return { ok: false, skipped: true, reason: "missing_twilio_env" };
  }

  const msg = await client.messages.create({ from, to, body });
  return { ok: true, sid: msg.sid };
}

// ─────────────────────────────────────────────
// Wizard: Save Strategy Profile
// POST /api/wizard
// body: { profileId?, name?, market?, timeframe?, pattern?, riskStyle?, ... }
// ─────────────────────────────────────────────
app.post("/api/wizard", (req, res) => {
  const incoming = req.body || {};
  const profileId =
    incoming.profileId ||
    `pf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  PROFILES[profileId] = {
    ...(PROFILES[profileId] || {}),
    ...incoming,
    profileId,
    status: PROFILES[profileId]?.status || "draft",
    createdAt: PROFILES[profileId]?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  res.status(201).json({ ok: true, profileId, profile: PROFILES[profileId] });
});

// ─────────────────────────────────────────────
// Activate Strategy
// POST /api/activate
// body: { profileId }
// ─────────────────────────────────────────────
app.post("/api/activate", (req, res) => {
  const { profileId } = req.body || {};
  if (!profileId || !PROFILES[profileId]) {
    return res.status(400).json({ ok: false, error: "Invalid profileId" });
  }

  PROFILES[profileId].status = "active";
  PROFILES[profileId].activatedAt = Date.now();

  res.json({ ok: true, profileId, status: "active" });
});

// ─────────────────────────────────────────────
// Subscribe user (Email/SMS)
// POST /subscribe
// body: { name, email?, phone?, alertMethods: ["email","sms"] }
// ─────────────────────────────────────────────
app.post("/subscribe", (req, res) => {
  const { name, email, phone, alertMethods } = req.body || {};

  if (!name || !Array.isArray(alertMethods) || alertMethods.length === 0) {
    return res.status(400).json({ ok: false, error: "Missing name or alertMethods[]" });
  }

  if (alertMethods.includes("email") && !email) {
    return res.status(400).json({ ok: false, error: "Email required for email alerts" });
  }

  if (alertMethods.includes("sms") && !phone) {
    return res.status(400).json({ ok: false, error: "Phone required for sms alerts" });
  }

  subscribers.push({ name, email, phone, alertMethods });
  res.json({ ok: true, total: subscribers.length });
});

// ─────────────────────────────────────────────
// Webhook (TradingView → Alerts)
// POST /webhook
// Recommended body example:
// {
//   "key": "YOUR_WEBHOOK_KEY",   // optional if using x-webhook-key header
//   "symbol": "SPY",
//   "signal": "DoubleTapBreakout",
//   "dir": "LONG",               // LONG or SHORT
//   "price": 501.23
// }
// ─────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    if (!requireKey(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized (bad webhook key)" });
    }

    const body = req.body || {};
    const symbol = body.symbol || body.ticker;
    const signal = body.signal || body.strategy || "Signal";
    const dirRaw = body.dir || body.direction || body.side;
    const dir = typeof dirRaw === "string" ? dirRaw.toUpperCase() : null;

    const priceNum = Number(body.price ?? body.close ?? body.entry);
    const hasPrice = Number.isFinite(priceNum);

    if (!symbol || !dir) {
      return res.status(400).json({ ok: false, error: "Missing symbol or dir" });
    }

    // Basic “example” SL/TP (edit these later to match your real rules)
    // LONG: SL -1.5%  TP +3%
    // SHORT: SL +1.5% TP -3%
    const sl = hasPrice
      ? dir === "LONG"
        ? priceNum * 0.985
        : priceNum * 1.015
      : null;

    const tp = hasPrice
      ? dir === "LONG"
        ? priceNum * 1.03
        : priceNum * 0.97
      : null;

    const msgLines = [];
    msgLines.push(`TradeFire Alert`);
    msgLines.push(`${dir} ${symbol}`);
    msgLines.push(`Signal: ${signal}`);
    if (hasPrice) {
      msgLines.push(`Entry: ${priceNum.toFixed(2)}`);
      msgLines.push(`SL: ${sl.toFixed(2)}`);
      msgLines.push(`TP: ${tp.toFixed(2)}`);
    } else {
      msgLines.push(`Entry: (missing price)`);
    }
    const msg = msgLines.join("\n");

    let delivered = 0;
    const results = [];

    for (const sub of subscribers) {
      try {
        if (sub.alertMethods.includes("email") && sub.email) {
          const r = await sendEmail(sub.email, `TradeFire: ${dir} ${symbol}`, msg);
          results.push({ method: "email", to: sub.email, ...r });
          if (r.ok) delivered++;
        }
        if (sub.alertMethods.includes("sms") && sub.phone) {
          const r = await sendSMS(sub.phone, msg);
          results.push({ method: "sms", to: sub.phone, ...r });
          if (r.ok) delivered++;
        }
      } catch (e) {
        results.push({ method: "unknown", error: e?.message || String(e) });
        console.log("Delivery error:", e?.message || e);
      }
    }

    return res.json({ ok: true, delivered, subscribers: subscribers.length, results });
  } catch (e) {
    console.log("Webhook error:", e?.message || e);
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

// ─────────────────────────────────────────────
// Start server (Railway needs 0.0.0.0 + PORT)
// ─────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`TradeFire server live on port ${PORT}`);
});