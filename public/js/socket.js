/* ═══════════════════════════════════════════════════════════════════════
   socket.js  —  RideSync Socket.IO client singleton
   Exports a connected socket instance for use across ES modules.
   ═══════════════════════════════════════════════════════════════════════ */

import { io } from "/socket.io/socket.io.esm.min.js";

const socket = io({
  transports: ["websocket", "polling"],
  reconnectionAttempts: 5,
  reconnectionDelay: 1500,
  timeout: 10000
});

export default socket;
