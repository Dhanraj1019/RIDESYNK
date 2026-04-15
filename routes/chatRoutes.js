// ═══════════════════════════════════════════════════════════════════════
// routes/chatRoutes.js  —  RideSync Chat REST Routes
//
// Registered in server.js as:  app.use("/api/chat", chatRouter)
//
// Auth middleware: isAuthenticated from midelwear.js
// (matches pattern used in all other route files in this project)
// ═══════════════════════════════════════════════════════════════════════

const express        = require("express");
const router         = express.Router();
const chatController = require("../controllers/chatController.js");
const { isAuthenticated } = require("../midelwear.js");

// GET /api/chat/:rideId/history
// Fetch last 50 chat messages for a ride (for history load on page open)
router.get("/:rideId/history", isAuthenticated, chatController.getChatHistory);

module.exports = router;
