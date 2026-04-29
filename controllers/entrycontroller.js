const User = require("../models/user.js");
const { invalidateCachedUser } = require("../utils/performance.js");
module.exports.loginform = (req, res) => {
    if (!req.user) {
        return res.render("signup/login_screen.ejs");
    }
    // FIX: added return
    return res.redirect("/ridesynk/home")
};

module.exports.login = async (req, res) => {
    const user = req.user;

    if (!user) {
        req.flash("error", "User not found");
        return res.redirect("/ridesynk/entry/signup");
    }

    // 🔥 RECOVERY LOGIC
    if (user.status === "pending_delete" || user.isDeleted === true) {

        await User.findByIdAndUpdate(user._id, {
            status: "active",
            isDeleted: false,
            deletedAt: null,
            deleteAfter: null
        });
        invalidateCachedUser(user._id);

        req.flash("success", "Your account has been restored successfully 🎉");
    } else {
        req.flash("success", "You logged in successfully");
    }

    if (req.session && req.session.redirectUrl) {
        const redirect = req.session.redirectUrl;
        delete req.session.redirectUrl;
        return res.redirect(redirect);
    }

    return res.redirect("/ridesynk/home");
};

module.exports.logout = (req, res, next) => {
    req.logOut((err) => {
        if (err) {
            return next(err);
        }
        req.flash("success", "you logout succesfully...")
        return res.redirect("/ridesynk/entry/login")
    })
};


module.exports.signupform = (req, res) => {
    return res.render("signup/sign_up.ejs");
};

module.exports.signup = async (req, res, next) => {
    try {
        let { user, password } = req.body;

        // Defense against NoSQL operator injection and Type mismatch
        if (!user || typeof user.username !== 'string' || typeof user.email !== 'string') {
            req.flash("error", "Invalid user credentials provided.");
            return res.redirect("/ridesynk/entry/signup");
        }

        const safeUsername = String(user.username).trim();
        const safeEmail = String(user.email).trim();

        const testdata = await User.findOne({ $or: [{ username: safeUsername }, { email: safeEmail }] }).lean();
        if (testdata) {
            req.flash("error", "with this crediencials user alrady exist...");
            return res.redirect("/ridesynk/entry/signup");
        }

        // Defense against Mass Assignment vulnerability
        const safeUserPayload = {
            username: safeUsername,
            email: safeEmail
        };

        // Pick optional fields safely
        ['firstname', 'lastname', 'phonenumber', 'vehical'].forEach(field => {
            if (typeof user[field] === 'string' && user[field].trim().length > 0) {
                safeUserPayload[field] = user[field].trim();
            }
        });

        let newuser = new User(safeUserPayload);
        let result = await User.register(newuser, password);
        req.login(result, (err) => {
            if (err) {
                console.log("error in save user", err);
            }
            else {
                req.flash("success", "Welcome to ridesynk...")
                if (req.session && req.session.redirectUrl) {
                    const redirect = req.session.redirectUrl;
                    delete req.session.redirectUrl;
                    return res.redirect(redirect);
                }
                return res.redirect("/ridesynk/entry/complete-profile");
            }
        })
    } catch (error) {
        return next(error);
    }
}


module.exports.conpleteprofileform = async (req, res, next) => {
    try {
        const finddata = req.user;
        // FIX: added return
        return res.render("profile/complete_profile.ejs", { user: finddata });
    } catch (err) {
        req.logOut((logoutErr) => {
            if (logoutErr) {
                // FIX: prevent multiple response
                return next(logoutErr);
            }
            req.flash("success", "you logout succesfully...")
            // FIX: added return
            return res.redirect("/ridesynk/entry/login")
        })
        // FIX: prevent multiple response
        return;
    }
}

module.exports.completeprofile = async (req, res) => {
    const { data } = req.body;
    const t = await User.findByIdAndUpdate(req.user._id, { ...data }, { runValidators: true });
    invalidateCachedUser(req.user._id);
    req.flash("success", "your profile save successfully...")
    // FIX: added return
    return res.redirect("/ridesynk/home");
}

module.exports.skipprofile = (req, res) => {
    // FIX: added return
    return res.redirect("/ridesynk/home")
}
