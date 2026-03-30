const express=require("express");
const router=express.Router();
const rideroomcontroller=require("../controllers/rideroomcontroll");
const { isAuthenticated } = require("../midelwear");

router.route("/search-member")
.get(isAuthenticated,rideroomcontroller.searchmember);

router.route("/:id/live-tracking")
.get(isAuthenticated,rideroomcontroller.livetracking);

router.route("/:id/add-members")
.get(isAuthenticated,rideroomcontroller.addmembersform);

router.route("/:rideId/add-members")
.post(isAuthenticated,rideroomcontroller.addmembers);

router.route("/:id/sos")
.get(isAuthenticated,rideroomcontroller.sos);

router.route("/:id")
.get(isAuthenticated,rideroomcontroller.ridedetails);


module.exports=router;