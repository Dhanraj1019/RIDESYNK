const cron = require("node-cron");
const mongoose = require("mongoose");

const User = require("../models/user")
const Ride = require("../models/ride");
const RideMember = require("../models/ride_member");

// Backup Models (IMPORTANT)
const DeletedUser = require("../models/backup/deletedUser");
const DeletedRide = require("../models/backup/deletedRide");
const DeletedRideMember = require("../models/backup/deletedRideMember");

// ⏰ Runs every day at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("🕛 Delete cron started...");

  const now = new Date();

  try {
    const usersToDelete = await User.find({
      status: "pending_delete",
      deleteAfter: { $lte: now }
    });

    // console.log(`Found ${usersToDelete.length} users to delete`);

    for (const user of usersToDelete) {
      // const session = await mongoose.startSession();
      // session.startTransaction();

      try {
        // =========================
        // 🔹 STEP 1: BACKUP USER
        // =========================
        await DeletedUser.create([{
          ...user.toObject(),
          deletedAt: new Date()
        }]);

        // =========================
        // 🔹 STEP 2: HANDLE RIDES (if admin)
        // =========================
        const rides = await Ride.find({ adminId: user._id });

        for (const ride of rides) {
          // Backup ride
          await DeletedRide.create([{
            ...ride.toObject(),
            deletedAt: new Date()
          }]);

          // Backup ride members
          const members = await RideMember.find({ rideId: ride._id });

          if (members.length > 0) {
            const backupMembers = members.map(m => ({
              ...m.toObject(),
              removedAt: new Date()
            }));

            await DeletedRideMember.insertMany(backupMembers);
          }

          // Delete ride members
          await RideMember.deleteMany({ rideId: ride._id });
        }

        // Delete rides created by user
        await Ride.deleteMany({ adminId: user._id });

        // =========================
        // 🔹 STEP 3: REMOVE USER FROM OTHER RIDES
        // =========================
        const userMemberships = await RideMember.find({ userId: user._id });

        if (userMemberships.length > 0) {
          const backupMemberships = userMemberships.map(m => ({
            ...m.toObject(),
            deletedAt: new Date()
          }));

          await DeletedRideMember.insertMany(backupMemberships);
        }

        await RideMember.deleteMany({ userId: user._id });

        // =========================
        // 🔹 STEP 4: DELETE USER
        // =========================
        await User.deleteOne({ _id: user._id });

        // =========================
        // ✅ COMMIT TRANSACTION
        // =========================
        // await session.commitTransaction();
        // session.endSession();

        // console.log(`✅ Deleted user ${user._id}`);

      } catch (err) {
        // ❌ ROLLBACK
        // await session.abortTransaction();
        // session.endSession();

        console.error(`❌ Failed to delete user ${user._id}`, err);
      }
    }

    console.log("🎯 Delete cron finished");

  } catch (err) {
    console.error("❌ Cron global error:", err);
  }
});