const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../midelwear.js");
const entrycontroller = require("../controllers/entrycontroller.js");
const passport = require("passport");
const { cacheMiddleware } = require("../utils/cache.js");

// Cache header middleware generators
const setNoCache = (req, res, next) => {
	res.setHeader("Cache-Control", "private, no-store");
	next();
};

const setPublicCache = (req, res, next) => {
	res.setHeader("Cache-Control", "public, max-age=300");
	next();
};

router.route("/login")
	.get(setNoCache, entrycontroller.loginform)
	.post(passport.authenticate("local", {
		failureRedirect: "/ridesynk/entry/login",
		failureFlash: true,
		keepSessionInfo: true
	}), entrycontroller.login);

router.route("/login/google")
	.get(passport.authenticate('google', { scope: ['profile', 'email'] }));

router.route("/logout")
	.get(isAuthenticated, entrycontroller.logout);

router.route("/complete-profile")
	.get(isAuthenticated, entrycontroller.conpleteprofileform)
	.post(isAuthenticated, entrycontroller.completeprofile)

router.route("/skipprofile")
	.get(isAuthenticated, entrycontroller.skipprofile);

router.route("/signup")
	.get(setPublicCache, cacheMiddleware, entrycontroller.signupform)
	.post(entrycontroller.signup);

module.exports = router;