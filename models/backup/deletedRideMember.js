const mongoose=require("mongoose");
const RideMember=require("../ride_member");
const deleteRideMemberSchema=RideMember.schema.clone();
module.exports=mongoose.model("DeleteRideMember",deleteRideMemberSchema);