const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const app = express();
app.use(express.json());
app.use(cors());

const subscribers = [];

app.post('/subscribe', async (req, res) => {
  const { name, email, phone, plan, selectedSignals, alertMethods } = req.body;
  subscribers.push({ name, email, phone, plan, selectedSignals, alertMethods, active: true });
  res.json({ ok: true });
});

app.post('/webhook', async (req, res) => {
  const { symbol, signal, dir, entry, ind, tf } = req.body;
  const price = parseFloat(entry);
  const sl = (dir==='LONG' ? price*0.985 : price*1.015).toFixed(2);
  const tp = (dir==='LONG' ? price*1.03  : price*0.97).toFixed(2);
  const msg = `🔥 ${dir} — ${symbol}\n${signal}\nEntry: $${entry} | SL: $${sl} | TP: $${tp} | TF: ${tf}`;

  const matched = subscribers.filter(s => s.active && s.selectedSignals.includes(ind));
  for (const sub of matched) {
    if (sub.alertMethods.includes('email'))
      await sendEmail(sub.email, `TradeFire: ${symbol} ${dir}`, msg);
    if (sub.alertMethods.includes('sms') && sub.phone)
      await sendSMS(sub.phone, msg);
  }
  res.json({ ok: true, delivered: matched.length });
});

async function sendEmail(to, subject, text) {
  const t = nodemailer.createTransport({
    host: 'smtp.resend.com', port: 465, secure: true,
    auth: { user: 'resend', pass: process.env.RESEND_KEY }
  });
  await t.sendMail({ from: 'signals@tradefirepro.com', to, subject, text });
}

async function sendSMS(to, body) {
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  await client.messages.create({ body, from: process.env.TWILIO_PHONE, to });
}

app.listen(3000, () => console.log('TradeFire server live on port 3000'));
