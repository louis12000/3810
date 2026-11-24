const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: true,
});

function toInteger(value, fallback, name, min, max) {
  const number = Number(value ?? fallback);

  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${name} 必須是 ${min} 到 ${max} 之間的整數`);
  }

  return number;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: toInteger(process.env.PORT, 3000, "PORT", 1, 65535),
  HOST: process.env.HOST || "127.0.0.1",

  MONGODB_URI:
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/comp3810sef_groupX",

  SESSION_SECRET: process.env.SESSION_SECRET || "",
  SESSION_MAX_AGE_MS: toInteger(
    process.env.SESSION_MAX_AGE_MS,
    60 * 60 * 1000,
    "SESSION_MAX_AGE_MS",
    60 * 1000,
    30 * 24 * 60 * 60 * 1000
  ),
  SESSION_COOKIE_NAME: "comp3810.sid",
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  TRUST_PROXY: process.env.TRUST_PROXY === "1",

  // 只供本機 demo / seed 使用；正式環境請在 .env 改成自己的值
  SEED_ADMIN_NAME: process.env.SEED_ADMIN_NAME || "系統管理員",
  SEED_ADMIN_EMAIL: (
    process.env.SEED_ADMIN_EMAIL || "admin@campus.test"
  ).toLowerCase(),
  SEED_ADMIN_PASSWORD:
    process.env.SEED_ADMIN_PASSWORD || "Admin@3810Demo",

  SEED_USER_NAME: process.env.SEED_USER_NAME || "示範學生",
  SEED_USER_EMAIL: (
    process.env.SEED_USER_EMAIL || "student@campus.test"
  ).toLowerCase(),
  SEED_USER_PASSWORD:
    process.env.SEED_USER_PASSWORD || "Student@3810Demo",
};

if (!/^mongodb(\+srv)?:\/\//.test(env.MONGODB_URI)) {
  throw new Error("MONGODB_URI 必須是 mongodb:// 或 mongodb+srv:// 開頭");
}

if (Buffer.byteLength(env.SESSION_SECRET, "utf8") < 32) {
  throw new Error(
    "SESSION_SECRET 至少需要 32 個字元：先 cp .env.example .env，" +
      "再執行 openssl rand -hex 48 把產生的字串貼到 SESSION_SECRET=（" +
      "或者直接跑 bash scripts/setup-ubuntu.sh，它會自動建立 .env）"
  );
}

if (env.NODE_ENV === "production" && !env.COOKIE_SECURE) {
  throw new Error(
    "正式環境請設定 COOKIE_SECURE=true，並透過 HTTPS 提供服務"
  );
}

module.exports = env;
