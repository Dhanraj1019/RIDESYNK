//====================================env file require===========================================
// const mapboxToken = process.env.MAP_TOKEN;
require('dotenv').config();
const map_token=process.env.MAP_TOKEN;

//==========================================envirement requirements========================================

require("./cron/deleteUsers");
require("./cron/ridecompeletion.js");
const express=require("express");
const compression=require("compression");
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
const { cacheMiddleware } = require("./utils/cache.js");

//========================routes requirement==============================

const entryrouter=require("./routes/entry.js");
const ridesynkrouter=require("./routes/ridesynk.js");
const rideroomrouter=require("./routes/rideroom.js");
const riderouter=require("./routes/ride.js");
const uesrrouter=require("./routes/user.js");
const sosrouter=require("./routes/sos.js");
const inviterouter=require("./routes/invite.routes.js");
const chatrouter=require("./routes/chatRoutes.js");

//===============================db sessions flash=======================================

const dburl=process.env.MONGO_URL;
const secretkey=process.env.SECRET_KEY;

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
    const user = await User.findById(id).lean();
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

 //===========================passwort google authentication===========================================

 passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
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

app.use(compression());
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.get("/health", cacheMiddleware, (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json({status:"ok"});
})
app.use(express.static(path.join(__dirname,"public"), { maxAge: 7 * 24 * 60 * 60 * 1000 }))
app.set("view engine","ejs");
app.set("views",path.join(__dirname,"views"));
app.engine("ejs",ejsMate);
app.use(methodOverride("_method"));


//============================================server start===============================================

const PORT = process.env.PORT || 8080;
server.listen(PORT,()=>{
    console.log(`server listening on port ${PORT}`);
})

//=====================socket start==========================
registerSocketHandlers(io);
app.set("io", io);

// server.listen(8080, () => {
//   console.log("Server running on port 8080");
// });

//=====================moongodb connection function==================================

async function main(){
    await mongoose.connect(dburl, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
    });
}

main().then((res)=>{
    console.log("connection  whith mongoose successfull !");
}).catch((err)=>{
    console.log("error in mongoose connection ", err);
})


//======================================express routes start here=============================================

//=====================self-ping keep-alive (prevents Render cold starts)==========================
// Render free tier sleeps after 15 min of inactivity.
// This pings /health every 14 min to keep the server awake.
// Only runs in production (RENDER_EXTERNAL_URL is auto-set by Render).
if (process.env.RENDER_EXTERNAL_URL) {
    const KEEP_ALIVE_URL = `${process.env.RENDER_EXTERNAL_URL}/health`;
    const INTERVAL_MS = 14 * 60 * 1000; // 14 minutes

    setInterval(async () => {
        try {
            await fetch(KEEP_ALIVE_URL);
        } catch (_) {
            // Non-critical — don't crash if the ping fails
        }
    }, INTERVAL_MS);

    console.log(`[keep-alive] pinging ${KEEP_ALIVE_URL} every 14 min`);
}

app.get("/", cacheMiddleware, (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.redirect("/ridesynk/entry/login");
})

app.use("/ridesynk/entry",entryrouter);
app.use("/ridesynk",ridesynkrouter);
app.use("/ridesynk/rideroom",rideroomrouter);
app.use("/ridesynk/ride",riderouter);
app.use("/ridesynk/user",uesrrouter);
app.use("/sos",sosrouter);
app.use("/",inviterouter);
app.use("/api/chat",chatrouter);




//==================google login===============================================

// app.get("/ridesynk/login/google",passport.authenticate('google', { scope: ['profile', 'email'] }));


app.get('/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/ridesynk/entry/login',
        failureMessage: true,
        keepSessionInfo: true
    }),
  (req, res) => {
    if (req.session && req.session.redirectUrl) {
        const redirect = req.session.redirectUrl;
        delete req.session.redirectUrl;
        return res.redirect(redirect);
    }
    
    // Check if the account was created in the last 30 seconds (meaning this is their first signup via Google)
    const isNewlyCreated = req.user.createdAt && (Date.now() - new Date(req.user.createdAt).getTime() < 30000);

    // Redirect to complete profile ONLY if the user is completely new (just signed up)
    if (isNewlyCreated) {
        return res.redirect('/ridesynk/entry/complete-profile');
    }
    
    // Otherwise, normal login -> redirect to home
    return res.redirect('/ridesynk/home');
  });


//=================error handling routes=====================================

// app.get("/ridesynk/test",async (req,res)=>{
//     console.log(req.user);
// })

app.use((req,res,next)=>{
    // console.log(req.get("Referrer"))
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
