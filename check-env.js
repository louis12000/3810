const mongoose = require("mongoose");

const env = require("../config/env");
const { connectDB, disconnectDB } = require("../config/db");
const User = require("../models/User");
const Item = require("../models/Item");

async function main() {
  console.log(`[check] Node.js ${process.version}`);
  console.log(`[check] NODE_ENV=${env.NODE_ENV}`);
  console.log(`[check] HOST=${env.HOST} PORT=${env.PORT}`);
  console.log(`[check] SESSION_SECRET length=${env.SESSION_SECRET.length}`);

  await connectDB();

  await mongoose.connection.db.admin().ping();
  console.log("[check] MongoDB ping OK");

  const userCount = await User.countDocuments();
  console.log(`[check] users=${userCount}`);

  const itemCount = await Item.countDocuments();
  console.log(`[check] items=${itemCount}`);

  const sessionCount = await mongoose.connection.db
    .collection("sessions")
    .countDocuments()
    .catch(() => 0);
  console.log(`[check] sessions=${sessionCount}`);

  if (userCount === 0) {
    console.warn("[check] No users in the database — run npm run seed");
  } else if (itemCount === 0) {
    console.warn("[check] No item records — run npm run seed:demo to create demo data");
  } else {
    console.log("[check] OK");
  }

  await disconnectDB();
}

main().catch(async (error) => {
  console.error("[check] failed:", error.message);

  try {
    await disconnectDB();
  } catch {
    // ignore disconnect errors
  }

  process.exit(1);
});
