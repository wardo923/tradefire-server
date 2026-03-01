const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ✅ Root route (fixes "Cannot GET /")
app.get("/", (req, res) => {
  res.status(200).send("TradeFire server is running ✅");
});

// ✅ Health route
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tradefire-server",
    time: new Date().toISOString(),
  });
});

// ✅ Fallback (so you always get a clean response)
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found", path: req.originalUrl });
});

// ✅ Railway port bind
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`TradeFire server live on port ${PORT}`);
});