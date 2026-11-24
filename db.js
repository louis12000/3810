const mongoose = require("mongoose");

const env = require("./env");

async function connectDB(uri = env.MONGODB_URI) {
  mongoose.set("strictQuery", true);

  const connection = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
  });

  console.log(
    `[db] MongoDB connected: ${connection.connection.host}/${connection.connection.name}`
  );

  return connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
