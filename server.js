import express from "express";

const app = express();

// ===== BASIC MIDDLEWARE =====
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ===== ROOT ROUTE =====
app.get("/", (req, res) => {
  res.status(200).send("TradeFire server is running ✅");
});

// ===== HEALTH CHECK =====
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "tradefire-server",
    timestamp: new Date().toISOString()
  });
});

// ===== WEBHOOK ENDPOINT =====
app.post("/webhook", (req, res) => {
  try {
    console.log("Webhook received:", {
      ip: req.ip,
      headers: req.headers["user-agent"],
      body: req.body
    });

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.path
  });
});

// ===== GLOBAL ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 TradeFire server live on port ${PORT}`);
});