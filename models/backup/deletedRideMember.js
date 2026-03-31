const mongoose=require("mongoose");
const RideMember=require("../ride_member");
const deleteRideMemberSchema=RideMember.schema.clone();
deleteRideMemberSchema.set("autoIndex", false);
deleteRideMemberSchema.clearIndexes();
module.exports=mongoose.model("DeleteRideMember",deleteRideMemberSchema);