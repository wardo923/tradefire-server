import express from "express";

const app = express();

// Railway sets PORT automatically. Fallback for local testing.
const PORT = process.env.PORT || 8080;

// Parse JSON bodies (TradingView webhooks are JSON)
app.use(express.json({ limit: "1mb" }));

// Root route (so the domain doesn't show "Cannot GET /")
app.get("/", (req, res) => {
  res.status(200).send("TradeFire Server Running");
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

// Webhook endpoint (TradingView should POST here)
app.post("/webhook", (req, res) => {
  try {
    // If you set a secret, verify it (optional)
    const expected = process.env.WEBHOOK_SECRET;
    if (expected) {
      const got = req.headers["x-webhook-secret"] || req.query.secret;
      if (got !== expected) return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // Log payload for debugging in Railway logs
    console.log("Webhook received:", JSON.stringify(req.body));

    // Always respond fast so TradingView is happy
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ ok: false });
  }
});

// Catch-all so random paths don't 404 as "Cannot GET"
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TradeFire server listening on ${PORT}`);
});