// server.js
// TradeFire Server (Railway-ready) — Express + Webhook -> Email/SMS Alerts

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const twilio = require("twilio");

const app = express();

// ─────────────────────────────────────────────────────────────
// Railway / Express setup
// ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3000);

// ─────────────────────────────────────────────────────────────
// In-memory stores (MVP)
// NOTE: resets whenever Railway redeploys/restarts
// ─────────────────────────────────────────────────────────────
const PROFILES = {};      // profileId -> { ...profileData, status, createdAt, activatedAt }
const subscribers = [];   // [{ name, email, phone, alertMethods: ["email","sms"] }]

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function makeId(prefix = "p") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return [v];
  return [];
}

// ─────────────────────────────────────────────────────────────
// Email (Nodemailer)
// Required env (one approach):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
// If missing, email sending will be skipped (won't crash).
// ─────────────────────────────────────────────────────────────
let mailTransport = null;

function initMailer() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // common SMTP rule
    auth: { user, pass },
  });
}

mailTransport = initMailer();

async function sendEmail(to, subject, text) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  if (!mailTransport || !from) {
    console.log("[EMAIL] Skipped (missing SMTP creds). To:", to);
    return { ok: false, skipped: true };
  }

  await mailTransport.sendMail({
    from,
    to,
    subject,
    text,
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// SMS (Twilio)
// Required env:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
// If missing, sms sending will be skipped (won't crash).
// ─────────────────────────────────────────────────────────────
let twilioClient = null;

function initTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

twilioClient = initTwilio();

async function sendSMS(to, text) {
  const from = process.env.TWILIO_FROM;
  if (!twilioClient || !from) {
    console.log("[SMS] Skipped (missing Twilio creds). To:", to);
    return { ok: false, skipped: true };
  }

  await twilioClient.messages.create({
    from,
    to,
    body: text,
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────

// Root (fixes "Cannot GET /")
app.get("/", (req, res) => {
  res.status(200).send("TradeFire server is running ✅");
});

// Health check (Railway-friendly)
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tradefire-server",
    time: new Date().toISOString(),
  });
});

// Create / Save Strategy Profile (Wizard -> profile)
app.post("/api/profile", (req, res) => {
  const data = req.body || {};
  const profileId = makeId("profile");

  PROFILES[profileId] = {
    ...data,
    status: "draft",
    createdAt: Date.now(),
  };

  res.status(201).json({ ok: true, profileId, status: "draft" });
});

// Activate Strategy
app.post("/api/activate", (req, res) => {
  const { profileId } = req.body || {};

  if (!profileId || !PROFILES[profileId]) {
    return res.status(400).json({ ok: false, error: "Invalid profileId" });
  }

  PROFILES[profileId].status = "active";
  PROFILES[profileId].activatedAt = Date.now();

  res.json({ ok: true, profileId, status: "active" });
});

// Subscribe user (email / sms)
app.post("/subscribe", (req, res) => {
  const { name, email, phone, alertMethods } = req.body || {};

  if (!name) {
    return res.status(400).json({ ok: false, error: "Missing name" });
  }

  const methods = asArray(alertMethods).map((m) => String(m).toLowerCase());

  subscribers.push({
    name,
    email: email || "",
    phone: phone || "",
    alertMethods: methods,
    createdAt: Date.now(),
  });

  res.json({ ok: true, total: subscribers.length });
});

// Webhook (Signal -> Alerts)
// Expect body like:
// { symbol: "SPY", signal: "Double Tap Breakout", dir: "LONG", price: 512.34 }
// Optional: { sl, tp } if you want to pass them instead of auto-calc
app.post("/webhook", async (req, res) => {
  try {
    const { symbol, signal, dir, price, sl, tp } = req.body || {};

    const hasBasics =
      symbol &&
      signal &&
      dir &&
      typeof price === "number" &&
      Number.isFinite(price);

    if (!hasBasics) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: symbol, signal, dir, price(number)",
        got: req.body || {},
      });
    }

    const D = String(dir).toUpperCase();

    // Auto SL/TP if not provided
    const autoSL = D === "LONG" ? price * 0.985 : price * 1.015;
    const autoTP = D === "LONG" ? price * 1.03 : price * 0.97;

    const finalSL = typeof sl === "number" ? sl : autoSL;
    const finalTP = typeof tp === "number" ? tp : autoTP;

    const msg =
      `🔥 ${D} ${symbol}\n` +
      `Signal: ${signal}\n` +
      `Entry: ${price.toFixed(2)}\n` +
      `SL: ${finalSL.toFixed(2)}\n` +
      `TP: ${finalTP.toFixed(2)}`;

    let delivered = 0;
    const results = [];

    for (const sub of subscribers) {
      try {
        // Email
        if (sub.alertMethods.includes("email") && sub.email) {
          await sendEmail(sub.email, `TradeFire Alert: ${symbol} ${D}`, msg);
          delivered++;
          results.push({ to: sub.email, via: "email", ok: true });
        }

        // SMS
        if (sub.alertMethods.includes("sms") && sub.phone) {
          await sendSMS(sub.phone, msg);
          delivered++;
          results.push({ to: sub.phone, via: "sms", ok: true });
        }
      } catch (e) {
        console.log("Delivery error:", e?.message || e);
        results.push({
          to: sub.email || sub.phone || "(unknown)",
          via: sub.email ? "email" : "sms",
          ok: false,
          error: e?.message || String(e),
        });
      }
    }

    res.json({
      ok: true,
      delivered,
      subscribers: subscribers.length,
      messagePreview: msg,
      results,
    });
  } catch (e) {
    console.log("Webhook error:", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Debug: see counts (optional)
app.get("/api/debug", (req, res) => {
  res.json({
    ok: true,
    profiles: Object.keys(PROFILES).length,
    subscribers: subscribers.length,
  });
});

// ─────────────────────────────────────────────────────────────
// Start server (Railway needs 0.0.0.0 bind)
// ─────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`TradeFire server live on port ${PORT}`);
});