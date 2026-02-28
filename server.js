const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const twilio = require("twilio");

const app = express();
app.use(express.json());
app.use(cors());

/* ─────────────────────────────
   ROOT + HEALTH (Railway checks)
───────────────────────────── */
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

/* ─────────────────────────────
   TEMP IN-MEMORY STORES (MVP)
───────────────────────────── */
const PROFILES = {};
const subscribers = [];

/* ─────────────────────────────
   WIZARD → SAVE STRATEGY PROFILE
───────────────────────────── */
app.post("/api/profile", (req, res) => {
  const profileId = "pf_" + Math.random().toString(36).slice(2, 10);

  PROFILES[profileId] = {
    profileId,
    status: "saved",
    createdAt: Date.now(),
    strategy: req.body,
  };

  res.status(201).json({ profileId, status: "saved" });
});

/* ─────────────────────────────
   ACTIVATE STRATEGY
───────────────────────────── */
app.post("/api/activate", (req, res) => {
  const { profileId } = req.body;

  if (!profileId || !PROFILES[profileId]) {
    return res.status(400).json({ error: "Invalid profileId" });
  }

  PROFILES[profileId].status = "active";
  PROFILES[profileId].activatedAt = Date.now();

  res.json({ profileId, status: "active" });
});

/* ─────────────────────────────
   SUBSCRIBE USER (EMAIL / SMS)
───────────────────────────── */
app.post("/subscribe", (req, res) => {
  const { name, email, phone, alertMethods = [] } = req.body;

  subscribers.push({ name, email, phone, alertMethods });
  res.json({ ok: true, total: subscribers.length });
});

/* ─────────────────────────────
   WEBHOOK (SIGNAL → ALERTS)
───────────────────────────── */
app.post("/webhook", async (req, res) => {
  try {
    const { symbol, signal, dir, entry } = req.body;

    if (!symbol || !signal || !dir || entry === undefined) {
      return res.status(400).json({ error: "Missing symbol/signal/dir/entry" });
    }

    const price = Number(entry);
    if (!Number.isFinite(price)) {
      return res.status(400).json({ error: "entry must be a number" });
    }

    const sl = dir === "LONG" ? price * 0.985 : price * 1.015;
    const tp = dir === "LONG" ? price * 1.03 : price * 0.97;

    const msg =
      `🔥 ${dir} ${symbol}\n` +
      `Signal: ${signal}\n` +
      `Entry: ${price.toFixed(2)}\n` +
      `SL: ${sl.toFixed(2)}\n` +
      `TP: ${tp.toFixed(2)}`;

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
        console.log("Delivery error:", e?.message || e);
      }
    }

    res.json({ ok: true, delivered, totalSubscribers: subscribers.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

/* ─────────────────────────────
   EMAIL (NODEMAILER)
───────────────────────────── */
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
}

async function sendEmail(to, subject, text) {
  const t = getTransporter();
  if (!t) return;

  await t.sendMail({
    from: "TradeFire <alerts@tradefire.pro>",
    to,
    subject,
    text,
  });
}

/* ─────────────────────────────
   SMS (TWILIO)
───────────────────────────── */
let twilioClient = null;
function getTwilio() {
  if (twilioClient) return twilioClient;
  if (!process.env.TWILIO_SID || !process.env.TWILIO_AUTH) return null;

  twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
  return twilioClient;
}

async function sendSMS(to, body) {
  const client = getTwilio();
  if (!client || !process.env.TWILIO_PHONE) return;

  await client.messages.create({
    body,
    from: process.env.TWILIO_PHONE,
    to,
  });
}

/* ─────────────────────────────
   START SERVER (RAILWAY SAFE)
───────────────────────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TradeFire server running on ${PORT}`));