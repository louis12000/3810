const env = require("../config/env");
const { connectDB, disconnectDB } = require("../config/db");
const User = require("../models/User");

async function upsertSeedUser({ name, email, password, role }) {
  if (!password || password.length < 12) {
    throw new Error(`${role}  seed password must be at least 12 characters`);
  }

  const passwordHash = await User.hashPassword(password);

  const result = await User.updateOne(
    { email },
    {
      $set: {
        name,
        email,
        passwordHash,
        role,
        isActive: true,
      },
    },
    { upsert: true }
  );

  console.log(
    `${result.upsertedCount > 0 ? "created" : "updated"} ${role}: ${email}`
  );
}

async function main() {
  await connectDB();
  await User.init();

  await upsertSeedUser({
    name: env.SEED_ADMIN_NAME,
    email: env.SEED_ADMIN_EMAIL,
    password: env.SEED_ADMIN_PASSWORD,
    role: "admin",
  });

  await upsertSeedUser({
    name: env.SEED_USER_NAME,
    email: env.SEED_USER_EMAIL,
    password: env.SEED_USER_PASSWORD,
    role: "user",
  });

  const total = await User.countDocuments();
  console.log(`[seed] done, ${total} user(s) in database`);
  console.log("[seed] Passwords come from SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD in .env");

  await disconnectDB();
}

main().catch(async (error) => {
  console.error("[seed] failed:", error.message);

  try {
    await disconnectDB();
  } catch {
    // ignore disconnect errors
  }

  process.exit(1);
});
