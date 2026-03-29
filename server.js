
// const mapboxToken = process.env.MAP_TOKEN;
require('dotenv').config();
const map_token=process.env.MAP_TOKEN;

require("./cron/deleteUsers");
require("./cron/ridecompeletion.js");
const express=require("express");
const app=express();
const http=require("http");
const {Server}=require("socket.io");
const server=http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }          // allow any origin (tighten in production)
});

const ejsMate=require("ejs-mate")
const path=require("path");
const session=require("express-session");
const MongoStore=require("connect-mongo").default;
const passport=require("passport");
const methodOverride=require("method-override");
const LocalStrategy=require("passport-local");
const mongoose=require("mongoose");
const flash=require("connect-flash");
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const User=require("./models/user.js");
const Ride=require("./models/ride.js");
const Message=require("./models/message.js");
const RideMember=require("./models/ride_member.js");

const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const geocoder = mbxGeocoding({
  accessToken: map_token
});


const {isAuthenticated}=require("./midelwear.js");
const ExpressErrror=require("./utils/ExpressError.js");

const ALLOW_MEMBER_CANCELLATION = true;



const dburl="mongodb://127.0.0.1/ridesync";

const store=MongoStore.create({
    mongoUrl:dburl,
    touchAfter: 24 * 3600,
    crypto:{
        secret:"mysecreatekey"
    },
})

store.on("error",function(err){
    console.log("ERROR IN MONGO SESSION STORAGE !",err);
})

app.use(session({
    store,
    secret:"mysecreatekey",
    resave:false,
    saveuninitialized:false,
}))

app.use(flash())

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
// passport.serializeUser(User.serializeUser());
// passport.deserializeUser(User.deserializeUser());
passport.serializeUser((user, done) => {
  done(null, user.id); // store MongoDB _id in session
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

 //================================

 passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
    scope: [ 'profile' , 'email' ],
    state: true
  },
async (accessToken, refreshToken, profile, done) => {
    try {
        // console.log(profile);
        if (!profile.emails[0].verified) {
            return done(null, false);
        }

        let user = await User.findOne({ email: profile.emails[0].value });
        // console.log("user data = ",user);
        if (!user) {
            user = await User.create({
                googleId: profile.id,
                email: profile.emails[0].value,
                firstname: profile.name.givenName,
                lastname: profile.name.familyName,
                username: profile.emails[0].value.split("@")[0]
            });
        } else {
            if (!user.googleId) {
                user.googleId = profile.id;
                await user.save();
            }
        }

        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));


 //=================================

app.use((req,res,next)=>{
    res.locals.success=req.flash("success");
    res.locals.error=req.flash("error");
    res.locals.curruser=req.user;
    res.locals.originalUrl=req.originalUrl;
    next()
})


app.use(express.urlencoded({extended: true}));
app.use(express.json())
app.use(express.static(path.join(__dirname,"public")))
app.set("view engine","ejs");
app.set("views",path.join(__dirname,"views"));
app.engine("ejs",ejsMate);
app.use(methodOverride("_method"));





server.listen(8080,()=>{
    console.log("we are listing on port 8080 !")
})

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);


  socket.on("receiveLocation", (data) => {
  const { userId, lat, lng } = data;

  console.log("User location:", userId, lat, lng);

  updateUserMarker(userId, lat, lng);
  });

  // Join ride room
  socket.on("joinRide", (rideId) => {
    console.log("Emitting to rideId:", rideId, typeof rideId);
    socket.join(rideId);
    console.log("Joined ride:", rideId);
  });

  // Send message
  socket.on("sendMessage", async (data) => {
    const { rideId, senderId, message } = data;
    // Save in DB
    console.log("rideId,senderId,message")
    const newMsg = new Message({ rideId, senderId, message });
    await newMsg.save();
    await newMsg.populate({path:"senderId",select:"firstname"});
    console.log(newMsg);
    // Send to all in same ride
    io.to(rideId).emit("receiveMessage", newMsg);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// server.listen(8080, () => {
//   console.log("Server running on port 8080");
// });











async function main(){
    await mongoose.connect(dburl);
}

main().then((res)=>{
    console.log("connection  whith mongoose successfull !");
}).catch((err)=>{
    console.log("error in mongoose connection ", err);
})




app.get("/",(req,res)=>{
    res.redirect("/ridesync/login")
})

app.get("/ridesync/signup",(req,res)=>{
    res.render("signup/sign_up.ejs");
})

app.post("/ridesync/signup",async (req,res,next)=>{
    try{
        let {user,password}=req.body;
        const testdata=await User.find({$or:[{username:user.username},{email:user.email}]});
        if(testdata.length>0){
            req.flash("error","with this crediencials user alrady exist...");
            return res.redirect("/ridesync/signup");
        }
        let newuser=new User(user);
        let result = await User.register(newuser,password);
        req.login(result,(err)=>{
            if(err){
                console.log("error in save user",err);
            }
            else{
                req.flash("success","Welcome to ridesync...")
                return res.render("profile/complete_profile.ejs", {
                    user,
                    isCompleteProfilePage: true
                });
            }
        })
    }catch(error){
        return next(error);
    }
})

app.get("/ridesync/login",(req,res)=>{
    res.render("signup/login_screen.ejs");
})

app.post(
  "/ridesync/login",
  passport.authenticate("local", {
    failureRedirect: "/ridesync/login",
    failureFlash: true
  }),
  async (req, res) => {
    const user = await User.findById(req.user._id);

    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/ridesync/signup");
    }

    // 🔥 RECOVERY LOGIC
    if (user.status === "pending_delete" || user.isDeleted === true) {

      await User.findByIdAndUpdate(user._id, {
        status: "active",
        isDeleted: false,
        deletedAt: null,
        deleteAfter: null
      });

      req.flash("success", "Your account has been restored successfully 🎉");
    } else {
      req.flash("success", "You logged in successfully");
    }

    return res.redirect("/ridesync/home");
  }
);

app.get("/ridesync/saveprofile",isAuthenticated,(req,res)=>{
    res.redirect("listing/home_dashboard.ejs");
})

app.post("/ridesync/saveprofile",isAuthenticated,async (req,res)=>{
    const {data}=req.body;
    const t = await User.findByIdAndUpdate(req.user._id,{...data});
    req.flash("success","your profile save successfully...")
    res.redirect("/ridesync/home");
})

app.get("/ridesync/skipprofile",(req,res)=>{
    res.redirect("/ridesync/home")
})



/* ============================================================
   Add these routes in your app.js or routes file
   ============================================================ */


/* ── 1. SEARCH USER BY PHONE ── */
app.get("/ridesync/rideroom/search-member", isAuthenticated, async (req, res) => {
    try {
        const { phone } = req.query;
        if (!phone || phone.replace(/\D/g, '').length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid phone number'
            });
        }
        const data = await User.findOne({phonenumber:phone}).select('_id firstname lastname phonenumber isDeleted status');
        if (!data) {
            return res.status(404).json({
                success: false,
                message: `No user found with number ${phone}`
            });
        }

        return res.json({
            success: true,
            data: data
        });

    } catch (err) {
        console.error('SEARCH ERROR:', err.message);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});


/* ── 2. SAVE MULTIPLE MEMBERS TO RIDE ── */
// Called when user clicks Done button
// Body: { userIds: ["_id1", "_id2", ...] }

app.post("/ridesync/rideroom/:rideId/add-members", isAuthenticated , async (req, res) => {
    try {
        const { rideId }  = req.params;
        const { userIds } = req.body;

        const members = Array.isArray(userIds)
            ? userIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [];

        // Validate
        if (members.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No user IDs provided',
                error: 'No user IDs provided'
            });
        }

        const uniqueMembers = new Set(members);
        if (uniqueMembers.size !== members.length) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate users found in selected list',
                error: 'Duplicate users found in selected list'
            });
        }

        const invalidMemberId = members.some((id) => !mongoose.Types.ObjectId.isValid(id));
        if (invalidMemberId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID in selected list',
                error: 'Invalid user ID in selected list'
            });
        }

        // $addToSet with $each — adds all IDs, no duplicates ever saved
        const ride=await Ride.findById(rideId);
        if(!ride){
            return res.status(400).json({
                success:false,
                message:"no ride exist ",
                error:"no ride exist "
            })
        }

        if(ride.adminId.toString()!=req.user._id.toString()){
            return res.status(400).json({
                success:false,
                message:"only admin can add members ",
                error:"only admin can add members "
            })
        }

        const existingMembers = await RideMember.find({
            rideId,
            userId: { $in: members }
        }).select('userId');

        const existingIds = new Set(existingMembers.map((m) => m.userId.toString()));
        const membersToInsert = members.filter((id) => !existingIds.has(id));

        if (membersToInsert.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate users found in selected list',
                error: 'Duplicate users found in selected list'
            });
        }

        const membersPayload = membersToInsert.map((id) => ({
            userId: id,
            rideId: rideId,
            role: "member"
        }));
        
        await RideMember.insertMany(membersPayload,{ordered:false});
        await Ride.findByIdAndUpdate(rideId,{ $inc: { totalMembers: membersToInsert.length } });
        return res.json({
            success: true,
            message: `${membersToInsert.length} member(s) added to ride`,
            ride: req.user
        });

    } catch (err) {
        console.error('ADD MEMBERS ERROR:', err.message);
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate users found in selected list',
                error: 'Duplicate users found in selected list'
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Something went wrong',
            error: 'Something went wrong'
        });
    }
});


/* ── 3. REMOVE SINGLE MEMBER FROM RIDE ── */
app.delete("/ridesync/rideroom/:rideId/remove-member/:userId", isAuthenticated, async (req, res) => {
    try {
        const { rideId, userId } = req.params;

        await Ride.findByIdAndUpdate(
            rideId,
            { $pull: { members: userId } }
        );

        return res.json({
            success: true,
            message: 'Member removed'
        });

    } catch (err) {
        console.error('REMOVE MEMBER ERROR:', err.message);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});


app.get("/ridesync/createride",isAuthenticated,(req,res)=>{    
    res.render("rides/create_ride.ejs");
})

app.post("/ridesync/createride",isAuthenticated,async (req,res)=>{
    try {
        const { ride = {} } = req.body;
        const date = String(ride.date || '').trim();
        const time = String(ride.time || '').trim();
        const rideDateTime = new Date(`${date}T${time}`);

        if (!date || !time || Number.isNaN(rideDateTime.getTime()) || rideDateTime <= new Date()) {
            return res.status(400).json({
                error: "Please select a future date and time"
            });
        }

        const sorcelocation = JSON.parse(ride.sorcelocation || '{}');
        const destinationlocation = JSON.parse(ride.destinationlocation || '{}');

        if (
            !Array.isArray(sorcelocation.coordinates) || sorcelocation.coordinates.length !== 2 ||
            !Array.isArray(destinationlocation.coordinates) || destinationlocation.coordinates.length !== 2
        ) {
            return res.status(400).json({ error: "Invalid location data" });
        }

        const newRide = new Ride({
            adminId:req.user._id,
            ridename:ride.ridename,
            date,
            time,
            sorce:ride.sorce,
            destination:ride.destination,
            sorceLocation: {
              type:'Point',
              coordinates: sorcelocation.coordinates
            },
            destinationLocation: {
              type:'Point',
              coordinates: destinationlocation.coordinates
            }
        });
        console.log(newRide);
        const data = await newRide.save();
        await RideMember.insertOne({rideId:data._id,userId:req.user._id,role:"admin"});
        req.flash("success","ride created...!");
        return res.redirect(`/ridesync/rideroom/${data._id.toString()}`);
    } catch (error) {
        console.error('Create ride error:', error);
        return res.status(400).json({ error: 'Invalid ride data' });
    }
})

app.get("/ridesync/rideroom/:id", isAuthenticated,async (req,res)=>{
    const {id}=req.params;
    const data=await Ride.findOne({_id:id});
    const members=await RideMember.find({rideId:id}).populate("userId");
    // console.log("data = ",data)
    // console.log("id = ",id)
    console.log("members = ",members)
    res.render("rides/ride_room.ejs",{data,members});
})

app.patch("/ride/update-location/:rideId", isAuthenticated, async (req, res) => {
    try {
        const { rideId } = req.params;
        const { sorce, destination, sorceLocation, destinationLocation } = req.body;

        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            return res.status(400).json({ success: false, message: "Invalid ride id" });
        }

        if (!String(sorce || "").trim() || !String(destination || "").trim()) {
            return res.status(400).json({ success: false, message: "sorce and destination are required" });
        }

        const parseNum = (value) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        };

        const srcLat = parseNum(sorceLocation && sorceLocation.lat);
        const srcLng = parseNum(sorceLocation && sorceLocation.lng);
        const dstLat = parseNum(destinationLocation && destinationLocation.lat);
        const dstLng = parseNum(destinationLocation && destinationLocation.lng);

        if (
            srcLat === null || srcLng === null || dstLat === null || dstLng === null ||
            srcLat < -90 || srcLat > 90 || dstLat < -90 || dstLat > 90 ||
            srcLng < -180 || srcLng > 180 || dstLng < -180 || dstLng > 180
        ) {
            return res.status(400).json({ success: false, message: "Invalid location coordinates" });
        }

        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ success: false, message: "Ride not found" });
        }

        const isAdmin = req.user && ride.adminId.toString() === req.user._id.toString();
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: "Only admin can update ride location" });
        }

        ride.sorce = String(sorce).trim();
        ride.destination = String(destination).trim();
        ride.sorceLocation = {
            type: "Point",
            coordinates: [srcLng, srcLat]
        };
        ride.destinationLocation = {
            type: "Point",
            coordinates: [dstLng, dstLat]
        };

        const updatedRide = await ride.save();

        return res.status(200).json({
            success: true,
            ride: updatedRide
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error" });
    }
})


app.get("/ridesync/rideroom/:id/live-tracking",isAuthenticated,async (req,res)=>{
    const {id} = req.params;
    const data = await Ride.findOne({_id:id});
    const members=await RideMember.find({rideId:id}).populate("userId");
    // const userid=(await Fulldetail.findOne({userid:req.user._id}).select("_id"))._id.toString();
    const messages = await Message.find({ rideId:id }).sort({ time: 1 }).populate({path:"senderId",select:"firstname"});
    console.log(data)
    console.log("members = ",members);
    console.log(messages);
    // console.log(data)
    res.render("map/live_tracking.ejs",{data:data.toObject(),map_token,members,messages})
})


app.get("/ridesync/rideroom/:id/add-members",isAuthenticated,async (req,res)=>{
    const {id}=req.params;
    const rideroom=await RideMember.find({rideId:id}).populate("userId").populate("rideId");
    console.log(rideroom)
    res.render("rides/add_members.ejs",{data:rideroom,id});
})



app.post("/ridesync/rideroom/:id/add-members",isAuthenticated,async (req,res)=>{
    const {id}=req.params;
    const rideroom=await Ride.findOne({_id:id});
    res.render("ride/add_members.ejs");
})



app.get("/ridesync/:id/rides",isAuthenticated,async (req,res)=>{
    const {id} = req.params;
    if (req.user._id.toString() !== id.toString()) {
        req.flash("error", "you are not authorized to view this ride list");
        return res.redirect(`/ridesync/${req.user._id.toString()}/rides`);
    }
    const fulldata=await RideMember.find({userId:id}).select("rideId").populate("rideId");
    console.log(fulldata);
    if(fulldata.length){
        return res.render("rides/rides_list.ejs",{data:fulldata,canMembersCancel:ALLOW_MEMBER_CANCELLATION})
    }
    else{
        return res.render("rides/noride.ejs");
    }
})


app.post("/ridesync/cancel/:rideId", isAuthenticated, async (req, res, next) => {
    try {
        const { rideId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            req.flash("error", "invalid ride id");
            return res.redirect(req.get("Referrer") || `/ridesync/${req.user._id.toString()}/rides`);
        }

        const ride = await Ride.findById(rideId);
        if (!ride) {
            req.flash("error", "ride not found");
            return res.redirect(req.get("Referrer") || `/ridesync/${req.user._id.toString()}/rides`);
        }

        const normalizedStatus = String(ride.status || "").trim().toLowerCase();
        const canonicalStatus = normalizedStatus === "cancelled" ? "canceled" : normalizedStatus;

        if (canonicalStatus !== "upcoming") {
            return res.status(400).send("Ride cannot be canceled");
        }

        const isCreator = ride.adminId.toString() === req.user._id.toString();
        const isActiveMember = await RideMember.exists({
            rideId: ride._id,
            userId: req.user._id,
            status: "active",
            isActive: true
        });

        const isAuthorized = isCreator || (ALLOW_MEMBER_CANCELLATION && Boolean(isActiveMember));
        if (!isAuthorized) {
            req.flash("error", "you are not authorized to cancel this ride");
            return res.redirect(req.get("Referrer") || `/ridesync/${req.user._id.toString()}/rides`);
        }

        ride.status = "canceled";
        await ride.save();

        req.flash("success", "ride canceled successfully");
        return res.redirect(req.get("Referrer") || `/ridesync/${req.user._id.toString()}/rides`);
    } catch (err) {
        return next(err);
    }
})


app.get("/ridesync/home",isAuthenticated,async (req,res)=>{
    const data=await User.findOne({_id:req.user._id});
    const rides=await RideMember.find({userId:req.user._id}).populate("rideId");
    // data.rides=rides;
    // console.log(data);
    console.log("rides = ",rides);
    let members=0;
    for(let ride of rides){
        members+=ride.rideId.totalMembers;
    }
    res.render("listing/home_dashboard.ejs",{data,rides,members});
})


app.get("/ridesync/profile",isAuthenticated,async (req,res)=>{
    const id=req.user._id;
    const data=await User.findOne({_id:id});
    const rides=await RideMember.find({userId:req.user._id});
    res.render("profile/profile.ejs",{data,rides});
})


app.get("/ridesync/settings",isAuthenticated,async (req,res)=>{
    const data=await User.findOne({_id:req.user._id})
    res.render("profile/settings.ejs",{data});
})


app.patch("/ridesync/user",async (req,res)=>{
    const {update}=req.body;
    console.log(update);
    const userdata=await User.findOneAndUpdate({_id:req.user._id},{...update});
    // console.log(userdata)
    res.redirect("/ridesync/settings");
})

app.delete("/ridesync/user/:id",isAuthenticated, async (req, res,next) => {
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
        next(new ExpressErrror(404,"user not found...."))
    //   return res.status(404).json({
    //     success: false,
    //     message: "User not found"
    //   });
    }

    // Update user (soft delete)
    await User.findByIdAndUpdate(id, {
      status: "pending_delete",
      isDeleted: true,
      deletedAt: now,
      deleteAfter: deleteAfter
    });

    res.redirect("/ridesync/logout");

  } catch (err) {
    console.error(err);
    next(new ExpressErrror(500,"Something went wrong..."))
    // return res.status(500).json({
    //   success: false,
    //   message: "Something went wrong"
    // });
  }
});


app.get("/ridesync/logout",isAuthenticated,(req,res,next)=>{
    req.logOut((err)=>{
        if(err){
            next(err);
        }
        req.flash("success","you logout succesfully...")
        res.redirect("/ridesync/login")
    })
})





//==========================================

app.get("/ridesync/login/google",passport.authenticate('google', { scope: ['profile', 'email'] }));


app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/ridesync/login', failureMessage: true }),
  (req, res) => {
    res.redirect('/ridesync/home');
  });


//=======================================








app.get("/ridesync/test",async (req,res)=>{
    console.log(req.user);
})

app.get("/ridesync/:id/sosalerts",(req,res)=>{
    next(new ExpressErrror(500,"this page is under process"))
})

app.use((req,res,next)=>{
    console.log(req.get("Referrer"))
    next(new ExpressErrror(404,"page not found..."))
})

app.use((err,req,res,next)=>{
    const {status=500,message="something went wrong ....!"}=err;
    res.status(status).render("listing/404.ejs",{status:status,message:message});
})