// server.js (CommonJS) — Railway-ready TradeFire webhook server

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const twilio = require("twilio");

const app = express();

// ─────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(cors());

// ─────────────────────────────────────────────────────────────
// In-memory stores (MVP)
// NOTE: resets on redeploy/restart
// ─────────────────────────────────────────────────────────────
const PROFILES = {};      // profileId -> { ...profile, status, createdAt, activatedAt }
const subscribers = [];   // { name, email, phone, alertMethods: ["email","sms"] }

// ─────────────────────────────────────────────────────────────
// Health + Root
// ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).send("TradeFire server is running ✅");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tradefire-server",
    time: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// Wizard → Save Strategy Profile (MVP)
// POST /api/profile
// body: { name, market, timeframe, pattern, riskStyle, ...any }
// ─────────────────────────────────────────────────────────────
app.post("/api/profile", (req, res) => {
  const profile = req.body || {};
  const profileId = `pf_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  PROFILES[profileId] = {
    profileId,
    ...profile,
    status: "draft",
    createdAt: Date.now(),
  };

  res.status(201).json({ ok: true, profileId, status: PROFILES[profileId].status });
});

// ─────────────────────────────────────────────────────────────
// Activate Strategy
// POST /api/activate
// body: { profileId }
// ─────────────────────────────────────────────────────────────
app.post("/api/activate", (req, res) => {
  const { profileId } = req.body || {};

  if (!profileId || !PROFILES[profileId]) {
    return res.status(400).json({ ok: false, error: "Invalid profileId" });
  }

  PROFILES[profileId].status = "active";
  PROFILES[profileId].activatedAt = Date.now();

  res.json({ ok: true, profileId, status: "active" });
});

// ─────────────────────────────────────────────────────────────
// Subscribe user (email / sms)
// POST /subscribe
// body: { name, email, phone, alertMethods: ["email","sms"] }
// ─────────────────────────────────────────────────────────────
app.post("/subscribe", (req, res) => {
  const { name, email, phone, alertMethods } = req.body || {};

  if (!name) return res.status(400).json({ ok: false, error: "Missing name" });

  const methods = Array.isArray(alertMethods) ? alertMethods : [];

  if (methods.includes("email") && !email) {
    return res.status(400).json({ ok: false, error: "Missing email for email alerts" });
  }
  if (methods.includes("sms") && !phone) {
    return res.status(400).json({ ok: false, error: "Missing phone for sms alerts" });
  }

  subscribers.push({ name, email, phone, alertMethods: methods });

  res.json({ ok: true, total: subscribers.length });
});

// ─────────────────────────────────────────────────────────────
// Webhook (TradingView → Alerts)
// POST /webhook
// body: { symbol, signal, dir, price, ts?, note? }
// Example:
// { "symbol":"SPY", "signal":"ORB Breakout", "dir":"LONG", "price": 501.23 }
// ─────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const { symbol, signal, dir, price } = req.body || {};

    if (!symbol || !signal || !dir || typeof price !== "number") {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields. Need: symbol, signal, dir, price(number)",
      });
    }

    // Simple MVP SL/TP (you can replace later)
    const sl = dir === "LONG" ? price * 0.985 : price * 1.015;
    const tp = dir === "LONG" ? price * 1.03 : price * 0.97;

    const msg =
`🔥 ${dir} ${symbol}
Signal: ${signal}
Entry: ${price.toFixed(2)}
SL: ${sl.toFixed(2)}
TP: ${tp.toFixed(2)}`;

    let delivered = 0;
    for (const sub of subscribers) {
      try {
        if (sub.alertMethods.includes("email")) {
          await sendEmail(sub.email, `TradeFire Alert: ${symbol} ${dir}`, msg);
        }
        if (sub.alertMethods.includes("sms")) {
          await sendSMS(sub.phone, msg);
        }
        delivered++;
      } catch (e) {
        console.log("Delivery error:", e?.message || e);
      }
    }

    return res.json({ ok: true, delivered, subscribers: subscribers.length });
  } catch (err) {
    console.log("Webhook error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────
// EMAIL (Nodemailer)
// Requires env vars (recommended):
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
// ─────────────────────────────────────────────────────────────
async function sendEmail(to, subject, text) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  if (!host || !user || !pass || !from) {
    throw new Error("Email not configured (missing SMTP_* or EMAIL_FROM env vars)");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for others
    auth: { user, pass },
  });

  await transporter.sendMail({ from, to, subject, text });
}

// ─────────────────────────────────────────────────────────────
// SMS (Twilio)
// Requires env vars:
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
// ─────────────────────────────────────────────────────────────
async function sendSMS(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!sid || !token || !from) {
    throw new Error("SMS not configured (missing TWILIO_* env vars)");
  }

  const client = twilio(sid, token);
  await client.messages.create({ from, to, body });
}

// ─────────────────────────────────────────────────────────────
// Start server (Railway uses PORT)
// ─────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT || "3000");
app.listen(PORT, () => {
  console.log(`TradeFire server live on port ${PORT}`);
});