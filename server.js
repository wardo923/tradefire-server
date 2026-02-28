/**
 * TradeFire Server — Railway Safe MVP
 * Express + Health Check + Webhook Alerts
 */

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const twilio = require("twilio");

const app = express();
app.use(express.json());
app.use(cors());

/* =====================================================
   ENV
===================================================== */

const PORT = process.env.PORT || 3000;

// Optional services (safe if unset)
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM;

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

/* =====================================================
   IN-MEMORY STORES (MVP)
===================================================== */

const PROFILES = {};
const subscribers = [];

/* =====================================================
   HEALTH + ROOT (Railway requires this)
===================================================== */

app.get("/", (req, res) => {
  res.status(200).send("TradeFire server is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tradefire-server",
    time: new Date().toISOString(),
  });
});

/* =====================================================
   CREATE STRATEGY PROFILE
===================================================== */

app.post("/api/profile", (req, res) => {
  const { name, market, timeframe, risk } = req.body;

  if (!name || !market || !timeframe) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const profileId = `pf_${Date.now()}`;

  PROFILES[profileId] = {
    profileId,
    name,
    market,
    timeframe,
    risk: risk || "standard",
    status: "inactive",
    createdAt: Date.now(),
  };

  res.status(201).json({ profileId, status: "created" });
});

/* =====================================================
   ACTIVATE STRATEGY
===================================================== */

app.post("/api/activate", (req, res) => {
  const { profileId } = req.body;

  if (!profileId || !PROFILES[profileId]) {
    return res.status(400).json({ error: "Invalid profileId" });
  }

  PROFILES[profileId].status = "active";
  PROFILES[profileId].activatedAt = Date.now();

  res.json({ profileId, status: "active" });
});

/* =====================================================
   SUBSCRIBE USER (EMAIL / SMS)
===================================================== */

app.post("/subscribe", (req, res) => {
  const { name, email, phone, alertMethods } = req.body;

  if (!alertMethods || !Array.isArray(alertMethods)) {
    return res.status(400).json({ error: "alertMethods required" });
  }

  subscribers.push({ name, email, phone, alertMethods });

  res.json({ ok: true, total: subscribers.length });
});

/* =====================================================
   ALERT DELIVERY HELPERS
===================================================== */

async function sendEmail(to, subject, text) {
  if (!EMAIL_HOST) return;

  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT),
    secure: false,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"TradeFire" <${EMAIL_USER}>`,
    to,
    subject,
    text,
  });
}

async function sendSMS(to, body) {
  if (!TWILIO_SID) return;

  const client = twilio(TWILIO_SID, TWILIO_TOKEN);
  await client.messages.create({
    from: TWILIO_FROM,
    to,
    body,
  });
}

/* =====================================================
   WEBHOOK (SIGNAL → ALERTS)
===================================================== */

app.post("/webhook", async (req, res) => {
  const { symbol, signal, dir, price } = req.body;

  if (!symbol || !signal || !dir || typeof price !== "number") {
    return res.status(400).json({ error: "Missing signal data" });
  }

  const sl = dir === "LONG" ? price * 0.985 : price * 1.015;
  const tp = dir === "LONG" ? price * 1.03 : price * 0.97;

  const msg = `
🔥 ${dir} ${symbol}
Signal: ${signal}
Entry: ${price.toFixed(2)}
SL: ${sl.toFixed(2)}
TP: ${tp.toFixed(2)}
`;

  let delivered = 0;

  for (const sub of subscribers) {
    try {
      if (sub.alertMethods.includes("email") && sub.email) {
        await sendEmail(sub.email, "TradeFire Alert", msg);
      }
      if (sub.alertMethods.includes("sms") && sub.phone) {
        await sendSMS(sub.phone, msg);
      }
      delivered++;
    } catch (e) {
      console.log("Delivery error:", e.message);
    }
  }

  res.json({ ok: true, delivered, subscribers: subscribers.length });
});

/* =====================================================
   START SERVER (Railway critical)
===================================================== */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 TradeFire server listening on port ${PORT}`);
});