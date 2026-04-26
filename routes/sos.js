const express=require("express")
const router=express.Router();
const soscontroller=require("../controllers/soscontroller");
const { isAuthenticated } = require("../midelwear");
const {createSOSHandler}=require("../utils/createSOSHandler");

router.route("/trigger")
.post( isAuthenticated, createSOSHandler);

router.route("/create")
.post(isAuthenticated, createSOSHandler);

router.route("/resolve/:id")
.post(isAuthenticated,soscontroller.resolve);

router.route("/active/:rideId")
.get(isAuthenticated,soscontroller.active);

router.route("/ride/:rideId")
.get(isAuthenticated,soscontroller.ride);

module.exports=router;
