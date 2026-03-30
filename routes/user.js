const express=require("express");
const router=express.Router();
const usercontroller=require("../controllers/usercontroller");
const { isAuthenticated } = require("../midelwear");

router.route("/update")
.patch(isAuthenticated,usercontroller.update);

router.route("/:id/delete")
.delete(isAuthenticated,usercontroller.delete);


module.exports=router;