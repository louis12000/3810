const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, execFile } = require("node:child_process");
const path = require("node:path");
const { promisify } = require("node:util");
const { MongoMemoryServer } = require("mongodb-memory-server");

const execFileAsync = promisify(execFile);
const projectRoot = path.join(__dirname, "..");
const PORT = 43210;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SESSION_COOKIE_NAME = "comp3810.sid";

const testEnv = {
  ...process.env,
  NODE_ENV: "test",
  PORT: String(PORT),
  HOST: "127.0.0.1",
  SESSION_SECRET: "test-only-session-secret-".repeat(3),
  SESSION_MAX_AGE_MS: String(60 * 60 * 1000),
  COOKIE_SECURE: "false",
  MONGODB_URI: "",
  SEED_ADMIN_NAME: "Test Admin",
  SEED_ADMIN_EMAIL: "admin@test.local",
  SEED_ADMIN_PASSWORD: "AdminTestPass123!",
  SEED_USER_NAME: "Test Student",
  SEED_USER_EMAIL: "student@test.local",
  SEED_USER_PASSWORD: "StudentTestPass123!",
};

let mongod;
let server;
let serverOutput = "";

before(async () => {
  mongod = await MongoMemoryServer.create({
    binary: { version: "8.2.6" },
  });

  testEnv.MONGODB_URI = mongod.getUri("comp3810sef_group_test");

  await execFileAsync(process.execPath, ["scripts/seed.js"], {
    cwd: projectRoot,
    env: testEnv,
    maxBuffer: 1024 * 1024,
  });

  server = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: testEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`the server failed to start：\n${serverOutput}`);
    }

    try {
      const response = await fetch(`${BASE_URL}/api/health`);

      if (response.ok) {
        const body = await response.json();

        if (body.database === "connected") {
          return;
        }
      }
    } catch {
      // 伺服器尚未開始監聽
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`timed out waiting for the server to start：\n${serverOutput}`);
});

after(async () => {
  if (server && server.exitCode === null) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 4000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      server.kill("SIGTERM");
    });
  }

  if (mongod) {
    await mongod.stop();
  }
});

async function request(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  const init = {
    method: options.method || "GET",
    headers,
    redirect: "manual",
  };

  if (options.form !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(options.form).toString();
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  if (options.cookie) {
    headers.cookie = options.cookie;
  }

  const response = await fetch(`${BASE_URL}${pathname}`, init);
  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    // HTML 或其他非 JSON 回應
  }

  return { response, text, json };
}

function sessionCookieFrom(response) {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

  const rawCookie = cookies.find((value) =>
    value.startsWith(`${SESSION_COOKIE_NAME}=`)
  );

  assert.ok(rawCookie, `expected a ${SESSION_COOKIE_NAME} cookie in the response`);
  return rawCookie.split(";")[0];
}

test("Part A: sign-in, sessions, roles and startup", async (t) => {
  let userCookie;
  let adminCookie;
  let registeredCookie;

  await t.test("visiting / while signed out redirects to /login", async () => {
    const { response } = await request("/");

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/login");
  });

  await t.test("the sign-in page loads", async () => {
    const { response, text } = await request("/login");

    assert.equal(response.status, 200);
    assert.match(text, /Sign in/);
    assert.match(text, /RE:FOUND/);
  });

  await t.test("visiting /dashboard while signed out redirects with next", async () => {
    const { response } = await request("/dashboard");

    assert.equal(response.status, 302);
    assert.match(response.headers.get("location"), /^\/login\?next=/);
  });

  await t.test("GET /api/auth/me while signed out returns 401", async () => {
    const { response, json } = await request("/api/auth/me");

    assert.equal(response.status, 401);
    assert.equal(json.message, "Please sign in first");
  });

  await t.test("a wrong password returns 401", async () => {
    const { response, json } = await request("/api/auth/login", {
      method: "POST",
      body: {
        email: "student@test.local",
        password: "wrong-password",
      },
    });

    assert.equal(response.status, 401);
    assert.equal(json.message, "Email or password is incorrect");
  });

  await t.test("a student can sign in via the API and get a cookie", async () => {
    const { response, json } = await request("/api/auth/login", {
      method: "POST",
      body: {
        email: "student@test.local",
        password: "StudentTestPass123!",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(json.user.role, "user");
    assert.equal(json.user.email, "student@test.local");

    userCookie = sessionCookieFrom(response);
  });

  await t.test("the cookie returns the current user", async () => {
    const { response, json } = await request("/api/auth/me", {
      cookie: userCookie,
    });

    assert.equal(response.status, 200);
    assert.equal(json.user.email, "student@test.local");
  });

  await t.test("a student can open the overview", async () => {
    const { response, text } = await request("/", {
      cookie: userCookie,
    });

    assert.equal(response.status, 200);
    assert.match(text, /Overview/);
    assert.match(text, /Test Student/);
  });

  await t.test("the old /dashboard redirects to my records", async () => {
    const { response } = await request("/dashboard", {
      cookie: userCookie,
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/me");
  });

  await t.test("a student hitting the admin page gets 403", async () => {
    const { response, text } = await request("/admin/users", {
      cookie: userCookie,
    });

    assert.equal(response.status, 403);
    assert.match(text, /You do not have access to the admin area/);
  });

  await t.test("an admin can sign in with the web form", async () => {
    const { response } = await request("/login", {
      method: "POST",
      form: {
        email: "admin@test.local",
        password: "AdminTestPass123!",
        next: "/dashboard",
      },
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/dashboard");

    adminCookie = sessionCookieFrom(response);
    assert.notEqual(adminCookie, userCookie);
  });

  await t.test("an admin can open user management", async () => {
    const { response, text } = await request("/admin/users", {
      cookie: adminCookie,
    });

    assert.equal(response.status, 200);
    assert.match(text, /User management/);
    assert.match(text, /admin@test\.local/);
  });

  await t.test("the old cookie stops working after sign-out", async () => {
    const logout = await request("/api/auth/logout", {
      method: "POST",
      cookie: adminCookie,
    });

    assert.equal(logout.response.status, 200);

    const me = await request("/api/auth/me", {
      cookie: adminCookie,
    });

    assert.equal(me.response.status, 401);
  });

  await t.test("the API can register a user and sign them in", async () => {
    const { response, json } = await request("/api/auth/register", {
      method: "POST",
      body: {
        name: "New Student",
        email: "new.student@test.local",
        password: "NewStudentPass123!",
      },
    });

    assert.equal(response.status, 201);
    assert.equal(json.user.role, "user");

    registeredCookie = sessionCookieFrom(response);
  });

  await t.test("the new user can read their own profile", async () => {
    const { response, json } = await request("/api/auth/me", {
      cookie: registeredCookie,
    });

    assert.equal(response.status, 200);
    assert.equal(json.user.email, "new.student@test.local");
  });

  await t.test("registering the same email returns 409", async () => {
    const { response, json } = await request("/api/auth/register", {
      method: "POST",
      body: {
        name: "Duplicate",
        email: "new.student@test.local",
        password: "NewStudentPass123!",
      },
    });

    assert.equal(response.status, 409);
    assert.equal(json.message, "That email is already registered");
  });

  await t.test("the sign-out button clears the session and shows a notice", async () => {
    const logout = await request("/logout", {
      method: "POST",
      cookie: registeredCookie,
    });

    assert.equal(logout.response.status, 302);
    assert.equal(
      logout.response.headers.get("location"),
      "/login?loggedOut=1"
    );

    const me = await request("/api/auth/me", {
      cookie: registeredCookie,
    });

    assert.equal(me.response.status, 401);

    const loginPage = await request("/login?loggedOut=1");
    assert.equal(loginPage.response.status, 200);
    assert.match(loginPage.text, /You have signed out/);
  });

  await t.test("repeated failed sign-ins hit the rate limit (429)", async () => {
    let lastResponse;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      lastResponse = await request("/api/auth/login", {
        method: "POST",
        body: {
          email: "student@test.local",
          password: "wrong-password",
        },
      });
    }

    assert.equal(lastResponse.response.status, 429);
    assert.match(lastResponse.json.message, /Too many sign-in attempts/);
  });

  await t.test("the server output never contains seed passwords", () => {
    assert.equal(serverOutput.includes("AdminTestPass123!"), false);
    assert.equal(serverOutput.includes("StudentTestPass123!"), false);
  });
});
