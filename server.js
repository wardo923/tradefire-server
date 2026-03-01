// server.js
const http = require("http");

const PORT = Number(process.env.PORT) || 3000;

// Simple router without any dependencies
const server = http.createServer((req, res) => {
  // Always return plain text unless /health
  if (req.url === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("OK");
  }

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, status: "healthy" }));
  }

  // Optional: webhook endpoint (POST)
  if (req.url === "/webhook" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      // Log the raw body so you can see it in Railway logs
      console.log("Webhook received:", body);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, received: true }));
    });
    return; 
  }

  // Anything else
  res.writeHead(404, { "Content-Type": "text/plain" });
  return res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});