module.exports.isAuthenticated=(req,res,next)=>{
    if(!req.isAuthenticated()){
        console.log("user not authanticated ...!")
        req.flash("error","you shuld login before...")
        return res.redirect("/ridesynk/entry/login");
    }
    next();
}

module.exports.saveRedirectUrl = (req, res, next) => {
    // Store the original URL so auth success can continue to the invite page.
    if (!req.isAuthenticated()) {
        req.session.redirectUrl = req.originalUrl;
    }
    next();
};
