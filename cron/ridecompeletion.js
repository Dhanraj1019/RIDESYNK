const cron = require("node-cron");
const Ride = require("../models/ride");

// runs every 1 hour
cron.schedule("0 * * * *", async () => {
  const now = new Date();

  await Ride.updateMany(
    {
      status: "upcoming",
      date: { $lt: new Date(now.getTime() - 12 * 60 * 60 * 1000) }
    },
    {
      $set: { status: "completed" }
    }
  );
 
  console.log("Auto-completed old rides");
});