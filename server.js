import express from "express";
import cors from "cors";

const app = express();

// Railway requires this
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ROOT ROUTE (THIS FIXES YOUR ERROR)
app.get("/", (req, res) => {
  res.status(200).send("TradeFire Server is LIVE 🚀");
});

// HEALTH CHECK (Railway loves this)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Catch-all safety (prevents Railway 404 page)
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
});

// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 TradeFire server running on port ${PORT}`);
});