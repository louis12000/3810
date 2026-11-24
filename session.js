const session = require("express-session");
const { MongoStore } = require("connect-mongo");

const env = require("./env");

function createSessionMiddleware() {
  const store = MongoStore.create({
    mongoUrl: env.MONGODB_URI,
    collectionName: "sessions",
    ttl: Math.floor(env.SESSION_MAX_AGE_MS / 1000),
    autoRemove: "native",
  });

  store.on("error", (error) => {
    console.error("[session-store]", error.message);
  });

  return session({
    name: env.SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.COOKIE_SECURE,
      maxAge: env.SESSION_MAX_AGE_MS,
      path: "/",
    },
  });
}

module.exports = { createSessionMiddleware };
