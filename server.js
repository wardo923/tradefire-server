const express = require("express");
const cors = require("cors");

const app = express();

// Railway sets PORT automatically
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Root route (fixes Cannot GET /)
app.get("/", (req, res) => {
  res.status(200).send("TradeFire Server is LIVE 🚀");
});

// Health route
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tradefire-server",
    uptime: process.uptime(),
    time: new Date().toISOString(),
  });
});

// Catch-all (prevents weird blank 404s)
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

// IMPORTANT: listen on PORT and 0.0.0.0
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 TradeFire server running on port ${PORT}`);
});