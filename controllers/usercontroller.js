const User=require("../models/user")
const ExpressError=require("../utils/ExpressError.js");

module.exports.update=async (req,res)=>{
    const {update}=req.body;
    // console.log(update);
    const userdata=await User.findOneAndUpdate({_id:req.user._id},{...update});
    return res.redirect("/ridesynk/settings");
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