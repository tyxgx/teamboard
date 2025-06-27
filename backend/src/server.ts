// server.ts
import http from "http";
import app from "./index";
import { setupSocket } from "./sockets/socket"; // 👈 imported from our new file

const PORT = process.env.PORT || 5001;
const server = http.createServer(app);

// 🔌 Attach socket server
setupSocket(server);

// 🚀 Start HTTP + WebSocket server
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});