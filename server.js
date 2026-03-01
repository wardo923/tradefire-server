// server.js
const express = require("express");

const app = express();

// IMPORTANT: Railway requires process.env.PORT
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());

// Root route (prevents "failed to respond")
app.get("/", (req, res) => {
  res.status(200).send("TradeFire Server Running");
});

// Health check (Railway-friendly)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Webhook endpoint
app.post("/webhook", (req, res) => {
  console.log("Webhook received:", req.body);
  res.status(200).json({ received: true });
});

// Start server — THIS MUST RUN
app.listen(PORT, "0.0.0.0", () => {
  console.log(`TradeFire server listening on port ${PORT}`);
});