const mongoose=require("mongoose");
const User=require("../user");

const deletedUserSchema = User.schema.clone();
module.exports= mongoose.model("DeleteUser",deletedUserSchema);