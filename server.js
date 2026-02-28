const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const twilio = require("twilio");

const app = express();
app.use(express.json());
app.use(cors());

/* HEALTH CHECK */
app.get("/health", (req, res) => {
  res.status(200).json({ 
    ok: true,
    service: "tradefire-server",
    time: new Date().toISOString(),
  });
});

/* TEMP STORES (MVP) */
const PROFILES = {};
const subscribers = [];

/* SAVE STRATEGY */
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

/* ACTIVATE STRATEGY */
app.post("/api/activate", (req, res) => {
  const { profileId } = req.body;

  if (!profileId || !PROFILES[profileId]) {
    return res.status(400).json({ error: "Invalid profileId" });
  }

  PROFILES[profileId].status = "active";
  PROFILES[profileId].activatedAt = Date.now();

  res.json({ profileId, status: "active" });
});

/* SUBSCRIBE */
app.post("/subscribe", (req, res) => {
  const { name, email, phone, alertMethods = [] } = req.body;
  subscribers.push({ name, email, phone, alertMethods });
  res.json({ ok: true });
});

/* WEBHOOK */
app.post("/webhook", async (req, res) => {
  const { symbol, signal, dir, entry } = req.body;
  const price = parseFloat(entry);

  const sl = dir === "LONG" ? price * 0.985 : price * 1.015;
  const tp = dir === "LONG" ? price * 1.03 : price * 0.97;

  const msg = `🔥 ${dir} ${symbol}
Signal: ${signal}
Entry: ${price}
SL: ${sl.toFixed(2)}
TP: ${tp.toFixed(2)}`;

  for (const sub of subscribers) {
    if (sub.alertMethods.includes("email") && sub.email) {
      await sendEmail(sub.email, "TradeFire Alert", msg);
    }
    if (sub.alertMethods.includes("sms") && sub.phone) {
      await sendSMS(sub.phone, msg);
    }
  }

  res.json({ ok: true });
});

/* EMAIL */
async function sendEmail(to, subject, text) {
  if (!process.env.EMAIL_USER) return;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  await transporter.sendMail({ from: "TradeFire", to, subject, text });
}

/* SMS */
async function sendSMS(to, body) {
  if (!process.env.TWILIO_SID) return;
  const client = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH
  );
  await client.messages.create({
    body,
    from: process.env.TWILIO_PHONE,
    to,
  });
}

/* START SERVER */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`TradeFire server running on ${PORT}`)
);