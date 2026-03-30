const express=require("express");
const router=express.Router();
const ridecontroller=require("../controllers/ridecontroller.js");
const {isAuthenticated}=require("../midelwear.js")

router.route("/update-location/:rideId")
.patch(isAuthenticated,ridecontroller.updatelocation);

router.route("/cancel/:rideId")
.post(isAuthenticated,ridecontroller.cancelride);

router.route("/createride")
.get(isAuthenticated,ridecontroller.createrideform)
.post(isAuthenticated,ridecontroller.createride);

module.exports=router;