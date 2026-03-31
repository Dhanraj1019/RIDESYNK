const express = require("express");
const router = express.Router();
const inviteController = require("../controllers/invite.controller.js");
const { isAuthenticated } = require("../midelwear.js");

router.post("/api/invite/create/:rideId", isAuthenticated, inviteController.createInvite);
router.get("/invite/:inviteId", inviteController.openInvite);
router.post("/api/invite/accept/:inviteId", isAuthenticated, inviteController.acceptInvite);
router.post("/api/invite/decline/:inviteId", isAuthenticated, inviteController.declineInvite);

module.exports = router;
