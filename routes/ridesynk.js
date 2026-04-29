const express=require("express");
const router=express.Router();
const ridesynkcontroller=require("../controllers/ridesynkcontroller");
const {isAuthenticated}=require("../midelwear");

router.route("/home")
.get(isAuthenticated,ridesynkcontroller.home);

router.route("/settings")
.get(isAuthenticated,ridesynkcontroller.setting);

router.route("/about_us")
.get(isAuthenticated,ridesynkcontroller.about_us);

router.route("/terms")
.get(isAuthenticated,ridesynkcontroller.terms);

router.route("/profile")
.get(isAuthenticated,ridesynkcontroller.profile);

router.route("/:id/rides")
.get(isAuthenticated,ridesynkcontroller.rides);

module.exports=router;