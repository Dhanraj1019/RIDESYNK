//====================================env file require===========================================
// const mapboxToken = process.env.MAP_TOKEN;
require('dotenv').config();
const map_token=process.env.MAP_TOKEN;

//==========================================envirement requirements========================================

// require("./cron/deleteUsers");
// require("./cron/ridecompeletion.js");
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

//==================================Mapbox geocoding require================================================

const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const geocoder = mbxGeocoding({
  accessToken: map_token
});

//===========================files import from another folders==========================================

const User=require("./models/user.js");
const registerSocketHandlers = require("./socket/socketHandeler.js");
const {isAuthenticated}=require("./midelwear.js");
const ExpressError=require("./utils/ExpressError.js");

//========================routes requirement==============================

const entryrouter=require("./routes/entry.js");
const ridesyncrouter=require("./routes/ridesync.js");
const rideroomrouter=require("./routes/rideroom.js");
const riderouter=require("./routes/ride.js");
const uesrrouter=require("./routes/user.js");
const sosrouter=require("./routes/sos.js");
const inviterouter=require("./routes/invite.routes.js");

//===============================db sessions flash=======================================
const dburl=process.env.MONGO_URL;
secretkey=process.env.SECRET_Key;

const store=MongoStore.create({
    mongoUrl:dburl,
    touchAfter: 24 * 3600,
    crypto:{
        secret:secretkey
    },
})

store.on("error",function(err){
    console.log("ERROR IN MONGO SESSION STORAGE !",err);
})

app.use(session({
    store,
    secret:secretkey,
    resave:false,
    saveUninitialized:false,
}))

app.use(flash())

//==============================passport intigrating=============================================

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

 //===========================passwort google authentication===========================================

 passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'https://ridesynk.onrender.com//auth/google/callback',
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


 //========================locals use=================================

app.use((req,res,next)=>{
    res.locals.success=req.flash("success");
    res.locals.error=req.flash("error");
    res.locals.curruser=req.user;
    res.locals.originalUrl=req.originalUrl;
    next()
})

//=========================data recive ejsmat path public view folder joining===================================

app.use(express.urlencoded({extended: true}));
app.use(express.json())
app.use(express.static(path.join(__dirname,"public")))
app.set("view engine","ejs");
app.set("views",path.join(__dirname,"views"));
app.engine("ejs",ejsMate);
app.use(methodOverride("_method"));


//============================================server start===============================================

server.listen(8080,()=>{
    console.log("we are listing on port 8080 !")
})

//=====================socket start==========================
registerSocketHandlers(io);
app.set("io", io);

// server.listen(8080, () => {
//   console.log("Server running on port 8080");
// });

//=====================moongodb connection function==================================

async function main(){
    await mongoose.connect(dburl);
}

main().then((res)=>{
    console.log("connection  whith mongoose successfull !");
}).catch((err)=>{
    console.log("error in mongoose connection ", err);
})


//======================================express routes start here=============================================

app.get("/",(req,res)=>{
    return res.redirect("/ridesync/entry/login")
})

app.use("/ridesync/entry",entryrouter);
app.use("/ridesync",ridesyncrouter);
app.use("/ridesync/rideroom",rideroomrouter);
app.use("/ridesync/ride",riderouter);
app.use("/ridesync/user",uesrrouter);
app.use("/sos",sosrouter);
app.use("/",inviterouter);


app.get("/ridesync/saveprofile",isAuthenticated,(req,res)=>{
    // FIX: added return
    return res.redirect("listing/home_dashboard.ejs");
})


//==================google login===============================================

// app.get("/ridesync/login/google",passport.authenticate('google', { scope: ['profile', 'email'] }));


app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/ridesync/entry/login', failureMessage: true }),
  (req, res) => {
                if (req.session && req.session.pendingInviteId) {
                        const pendingInviteId = req.session.pendingInviteId;
                        delete req.session.pendingInviteId;
                        return res.redirect(`/invite/${pendingInviteId}`);
                }
        // FIX: added return
        return res.redirect('/ridesync/home');
  });


//=================error handling routes=====================================

app.get("/ridesync/test",async (req,res)=>{
    console.log(req.user);
})

app.use((req,res,next)=>{
    console.log(req.get("Referrer"))
    next(new ExpressError(404,"page not found..."))
})

app.use((err,req,res,next)=>{
    const {status=500,message="something went wrong ....!"}=err;
    // FIX: prevent multiple response
    if (res.headersSent) return;
    // FIX: added return
    return res.status(status).render("listing/404.ejs",{status:status,message:message});
})

//==========================================end of routes============================================