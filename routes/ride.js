const express=require("express");
const router=express.Router();
const ridecontroller=require("../controllers/ridecontroller.js");
const {isAuthenticated}=require("../midelwear.js")

router.route("/update-location/:rideId")
.patch(isAuthenticated,ridecontroller.updatelocation);

router.route("/:id/update-distance")
.post(isAuthenticated,ridecontroller.updateDistance);

router.route("/:rideId/travel-update")
.post(isAuthenticated,ridecontroller.updateTravelData);

router.route("/ride/:rideId/travel-update")
.post(isAuthenticated,ridecontroller.updateTravelData);

router.route("/cancel/:rideId")
.post(isAuthenticated,ridecontroller.cancelride);

router.route("/createride")
.get(isAuthenticated,ridecontroller.createrideform)
.post(isAuthenticated,ridecontroller.createride);

// GET /ridesynk/ride/:rideId/status — returns current ride status for client sync
router.route("/:rideId/status")
.get(isAuthenticated, ridecontroller.getRideStatus);

module.exports=router;