const mongoose=require("mongoose");
const User=require("../user");

const deletedUserSchema = User.schema.clone();
deletedUserSchema.set("autoIndex", false);
deletedUserSchema.clearIndexes();
module.exports= mongoose.model("DeleteUser",deletedUserSchema);