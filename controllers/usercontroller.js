const User=require("../models/user")
const ExpressError=require("../utils/ExpressError.js");

module.exports.update=async (req,res,next)=>{
    try {
        const {update}=req.body;
        
        // SECURITY: Prevent Mass Assignment by explicitly whitelisting allowed fields
        const allowedFields = ["firstname", "lastname", "email", "phonenumber", "username"];
        const sanitizedUpdate = {};
        
        if (update) {
            for (const key of allowedFields) {
                if (update[key] !== undefined) {
                    sanitizedUpdate[key] = update[key];
                }
            }
        }
        
        await User.findByIdAndUpdate(
            req.user._id, 
            { $set: sanitizedUpdate }, 
            { new: true, runValidators: true }
        );
        
        req.flash("success", "Profile updated successfully!");
        return res.redirect("/ridesynk/settings");
    } catch (e) {
        req.flash("error", "Could not update profile");
        return res.redirect("/ridesynk/settings");
    }
};

module.exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            req.flash("error", "All fields are required");
            return res.redirect("/ridesynk/settings");
        }
        
        if (newPassword !== confirmPassword) {
            req.flash("error", "New passwords do not match");
            return res.redirect("/ridesynk/settings");
        }
        
        const user = await User.findById(req.user._id);
        
        if (!user) {
            req.flash("error", "User not found");
            return res.redirect("/ridesynk/settings");
        }

        // Change password using passport-local-mongoose's built-in changePassword method
        await user.changePassword(currentPassword, newPassword);
        
        req.flash("success", "Password changed successfully!");
        return res.redirect("/ridesynk/settings");
    } catch (e) {
        req.flash("error", "Incorrect current password");
        return res.redirect("/ridesynk/settings");
    }
};

module.exports.delete=async (req, res,next) => {
  try {
    const { id } = req.params;
    if (req.user._id.toString() !== id) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }
    const now = new Date();
    const deleteAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const user = await User.findById(id);
    if (!user) {
        return next(new ExpressError(404,"user not found...."))
    }

    // Update user (soft delete)
    await User.findByIdAndUpdate(id, {
      status: "pending_delete",
      isDeleted: true,
      deletedAt: now,
      deleteAfter: deleteAfter
    });

        // FIX: added return
        return res.redirect("/ridesynk/entry/logout");

  } catch (err) {
    console.error(err);
        // FIX: added return
        return next(new ExpressError(500,"Something went wrong..."))
    // return res.status(500).json({
    //   success: false,
    //   message: "Something went wrong"
    // });
  }
}