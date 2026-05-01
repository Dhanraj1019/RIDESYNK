/* ═══════════════════════════════════════════════════════════════════════
   socket.js  —  RideSync Socket.IO client singleton
   Exports a connected socket instance for use across ES modules.
   ═══════════════════════════════════════════════════════════════════════ */

import { io } from "/socket.io/socket.io.esm.min.js";

const socket = io({
  transports: ["websocket", "polling"],
  // FIX: was 5 — after 5 failures (~7.5s) the socket gave up permanently.
  // Live tracking MUST reconnect indefinitely; a brief network drop cannot
  // take a rider permanently offline.
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1500,
  reconnectionDelayMax: 10000,  // cap exponential backoff at 10s
  timeout: 10000
});

export default socket;

