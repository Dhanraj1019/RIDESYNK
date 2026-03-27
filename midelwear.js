module.exports.isAuthenticated=(req,res,next)=>{
    if(!req.isAuthenticated()){
        console.log("user not authanticated ...!")
        req.flash("error","you shuld login before...")
        return res.redirect("/ridesync/login");
    }
    next();
}