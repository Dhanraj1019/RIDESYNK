const express=require("express");
const router=express.Router();
const ridesynccontroller=require("../controllers/ridesynccontroller");
const {isAuthenticated}=require("../midelwear");

router.route("/home")
.get(isAuthenticated,ridesynccontroller.home);

router.route("/settings")
.get(isAuthenticated,ridesynccontroller.setting);

router.route("/profile")
.get(isAuthenticated,ridesynccontroller.profile);

router.route("/:id/rides")
.get(isAuthenticated,ridesynccontroller.rides);

module.exports=router;