// server.js (ESM)
import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get("/", (req, res) => res.status(200).send("TradeFire Server Running"));
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

app.post("/webhook", (req, res) => {
  console.log("Webhook received:", req.body);
  res.status(200).json({ received: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TradeFire server listening on port ${PORT}`);
});