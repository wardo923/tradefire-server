/**
 * TradeFire webhook server (Railway)
 * - Always listens on process.env.PORT
 * - Provides GET / and GET /health so you can test in browser
 * - Accepts POST /webhook (generic)
 */

const express = require("express");
const cors = require("cors");

const app = express();

// Railway / proxies sometimes need trust proxy for correct IPs
app.set("trust proxy", 1);

// Middlewares
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ Root route so you DON'T get "Cannot GET /"
app.get("/", (req, res) => {
  res
    .status(200)
    .send("TradeFire server is running. Try GET /health or POST /webhook");
});

// ✅ Health route so you can test quickly
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tradefire-server",
    time: new Date().toISOString(),
  });
});

// Example webhook endpoint (customize later)
app.post("/webhook", (req, res) => {
  try {
    // If you want a simple secret check (optional):
    // Set WEBHOOK_SECRET in Railway Variables, then send header: x-webhook-secret
    const requiredSecret = process.env.WEBHOOK_SECRET;
    if (requiredSecret) {
      const gotSecret = req.get("x-webhook-secret");
      if (gotSecret !== requiredSecret) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
    }

    // Log a tiny summary (avoid dumping huge payloads)
    console.log("Webhook received:", {
      path: req.path,
      ip: req.ip,
      keys: req.body && typeof req.body === "object" ? Object.keys(req.body) : [],
    });

    // Respond OK
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ✅ Important: listen on PORT provided by Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`TradeFire server live on port ${PORT}`);
});