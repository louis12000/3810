const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, execFile } = require("node:child_process");
const path = require("node:path");
const { promisify } = require("node:util");
const { MongoMemoryServer } = require("mongodb-memory-server");

const execFileAsync = promisify(execFile);
const projectRoot = path.join(__dirname, "..");
const PORT = 43211;
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

  // the demo seed script must run too, otherwise we find out on demo day that it is broken
  await execFileAsync(process.execPath, ["scripts/seed-demo.js"], {
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
      throw new Error(`the server failed to start:\n${serverOutput}`);
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
      // the server is not listening yet
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`timed out waiting for the server to start:\n${serverOutput}`);
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
    // HTML or another non-JSON response
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

async function loginAs(email, password) {
  const { response } = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });

  assert.equal(response.status, 200);
  return sessionCookieFrom(response);
}

async function createItem(cookie, overrides = {}) {
  const form = {
    title: "Black folding umbrella test",
    type: "lost",
    category: "accessories",
    location: "Library, 3/F",
    occurredAt: "2026-11-12",
    description: "white sticker on the handle",
    ...overrides,
  };

  const { response } = await request("/items", {
    method: "POST",
    cookie,
    form,
  });

  assert.equal(response.status, 302, "creating a record should redirect to its detail page");

  const location = response.headers.get("location");
  assert.match(location, /^\/items\/[a-f0-9]{24}$/);

  return location.split("/")[2];
}

test("Web CRUD: auth required, four operations, owner permissions", async (t) => {
  let userCookie;
  let otherCookie;
  let itemId;

  await t.test("visiting /items while signed out redirects with next", async () => {
    const { response } = await request("/items");

    assert.equal(response.status, 302);
    assert.match(response.headers.get("location"), /^\/login\?next=/);
  });

  await t.test("a student can open the list page", async () => {
    userCookie = await loginAs("student@test.local", "StudentTestPass123!");

    const { response, text } = await request("/items", { cookie: userCookie });

    assert.equal(response.status, 200);
    assert.match(text, /Lost & found/);
    assert.match(text, /Report a lost item/);
  });

  await t.test("Create: redirects to the detail page and shows the record", async () => {
    itemId = await createItem(userCookie);

    const { response, text } = await request(`/items/${itemId}`, {
      cookie: userCookie,
    });

    assert.equal(response.status, 200);
    assert.match(text, /Black folding umbrella test/);
    assert.match(text, /Library, 3\/F/);
  });

  await t.test("Create: the form loads and honours ?type=", async () => {
    const form = await request("/items/new?type=found", { cookie: userCookie });

    assert.equal(form.response.status, 200);
    assert.match(form.text, /New record/);
    assert.match(form.text, /name="type"/);
  });

  await t.test("Update: the edit form is prefilled", async () => {
    const { response, text } = await request(`/items/${itemId}/edit`, {
      cookie: userCookie,
    });

    assert.equal(response.status, 200);
    assert.match(text, /Edit record/);
    assert.match(text, /Black folding umbrella test/);
    assert.match(text, /Library, 3\/F/);
  });

  await t.test("Create: a short title returns 400 with a message", async () => {
    const { response, text } = await request("/items", {
      method: "POST",
      cookie: userCookie,
      form: {
        title: "Ab",
        type: "lost",
        category: "other",
        location: "",
        occurredAt: "2026-11-12",
        description: "",
      },
    });

    assert.equal(response.status, 400);
    assert.match(text, /Title must be between 3 and 120 characters/);
  });

  await t.test("Create: a bad date returns 400", async () => {
    const { response, text } = await request("/items", {
      method: "POST",
      cookie: userCookie,
      form: {
        title: "Date format test record",
        type: "lost",
        category: "other",
        occurredAt: "not-a-date",
      },
    });

    assert.equal(response.status, 400);
    assert.match(text, /Date must be in YYYY-MM-DD format/);
  });

  await t.test("Read: the list filters by type", async () => {
    await createItem(userCookie, {
      title: "White bluetooth earphones test",
      type: "found",
      category: "electronics",
    });

    const lostOnly = await request("/items?scope=mine&type=lost", {
      cookie: userCookie,
    });

    assert.equal(lostOnly.response.status, 200);
    assert.match(lostOnly.text, /Black folding umbrella/);
    assert.doesNotMatch(lostOnly.text, /White bluetooth earphones/);
  });

  await t.test("Read: keyword search matches the location", async () => {
    const { response, text } = await request(
      `/items?scope=mine&q=${encodeURIComponent("Library")}`,
      { cookie: userCookie }
    );

    assert.equal(response.status, 200);
    assert.match(text, /Black folding umbrella/);
  });

  await t.test("Update: the owner can edit their record", async () => {
    const { response } = await request(`/items/${itemId}`, {
      method: "POST",
      cookie: userCookie,
      form: {
        title: "Black folding umbrella renamed",
        type: "lost",
        category: "accessories",
        location: "Library, 2/F",
        occurredAt: "2026-11-12",
        description: "edited description",
      },
    });

    assert.equal(response.status, 302);

    const detail = await request(`/items/${itemId}`, { cookie: userCookie });
    assert.match(detail.text, /Black folding umbrella renamed/);
    assert.match(detail.text, /Library, 2\/F/);
  });

  await t.test("Update: someone else gets 403", async () => {
    const registered = await request("/api/auth/register", {
      method: "POST",
      body: {
        name: "Other Student",
        email: "other.student@test.local",
        password: "OtherStudentPass123!",
      },
    });

    assert.equal(registered.response.status, 201);
    otherCookie = sessionCookieFrom(registered.response);

    const { response, text } = await request(`/items/${itemId}`, {
      method: "POST",
      cookie: otherCookie,
      form: {
        title: "Edit someone else's record",
        type: "lost",
        category: "other",
      },
    });

    assert.equal(response.status, 403);
    assert.match(text, /Only the owner or an admin can modify this record/);
  });

  await t.test("an admin can edit anyone's record", async () => {
    const adminCookie = await loginAs("admin@test.local", "AdminTestPass123!");

    const { response } = await request(`/items/${itemId}`, {
      method: "POST",
      cookie: adminCookie,
      form: {
        title: "Title edited by admin",
        type: "lost",
        category: "accessories",
        location: "Library, 2/F",
        occurredAt: "2026-11-12",
        description: "",
      },
    });

    assert.equal(response.status, 302);

    const detail = await request(`/items/${itemId}`, { cookie: userCookie });
    assert.match(detail.text, /Title edited by admin/);
  });

  await t.test("Delete: the owner can delete, then the detail page 404s", async () => {
    const { response } = await request(`/items/${itemId}/delete`, {
      method: "POST",
      cookie: userCookie,
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/items");

    const detail = await request(`/items/${itemId}`, { cookie: userCookie });
    assert.equal(detail.response.status, 404);
  });

  await t.test("Claim flow: A registers, B claims, A confirms", async () => {
    const claimItemId = await createItem(userCookie, {
      title: "Campus card (test)",
      type: "found",
      category: "documents",
      location: "Student Union Building",
    });

    // B claims it
    const claimed = await request(`/items/${claimItemId}/claim`, {
      method: "POST",
      cookie: otherCookie,
      form: { claimMessage: "This is mine, the card has my signature on the back." },
    });

    assert.equal(claimed.response.status, 302);

    const afterClaim = await request(`/items/${claimItemId}`, {
      cookie: userCookie,
    });

    assert.equal(afterClaim.response.status, 200);
    assert.match(afterClaim.text, /Claim pending/);
    assert.match(afterClaim.text, /This is mine, the card has my signature on the back./);

    // B cannot confirm it themselves
    const illegalConfirm = await request(`/items/${claimItemId}/confirm`, {
      method: "POST",
      cookie: otherCookie,
    });

    assert.equal(illegalConfirm.response.status, 403);

    // A confirms the handover
    const confirmed = await request(`/items/${claimItemId}/confirm`, {
      method: "POST",
      cookie: userCookie,
    });

    assert.equal(confirmed.response.status, 302);

    const afterConfirm = await request(`/items/${claimItemId}`, {
      cookie: userCookie,
    });

    assert.match(afterConfirm.text, /Closed/);
  });

  await t.test("Claim flow: you cannot claim your own record", async () => {
    const ownItemId = await createItem(userCookie, {
      title: "My own record (test)",
      type: "found",
      category: "other",
    });

    await request(`/items/${ownItemId}/claim`, {
      method: "POST",
      cookie: userCookie,
      form: { claimMessage: "" },
    });

    const detail = await request(`/items/${ownItemId}`, {
      cookie: userCookie,
    });

    assert.match(detail.text, /You cannot claim your own record/);
  });

  // ---- 新增的兩個狀態：認領狀態（未領／已領）與找尋狀態（未找到／找到） ----
  await t.test("Statuses: a new record defaults to unclaimed + not found", async () => {
    const id = await createItem(userCookie, { title: "Status default record" });

    const { json } = await request(`/api/items/${id}`);

    assert.equal(json.item.claimStatus, "unclaimed");
    assert.equal(json.item.searchStatus, "unfound");
    assert.equal(json.item.claimStatusLabel, "Unclaimed");
    assert.equal(json.item.searchStatusLabel, "Not found yet");
  });

  await t.test("Statuses: the web edit form saves both statuses", async () => {
    const id = await createItem(userCookie, { title: "Status edit record" });

    const { response } = await request(`/items/${id}`, {
      method: "POST",
      cookie: userCookie,
      form: {
        title: "Status edit record",
        type: "lost",
        category: "other",
        claimStatus: "claimed",
        searchStatus: "found",
      },
    });

    assert.equal(response.status, 302);

    const { json } = await request(`/api/items/${id}`);
    assert.equal(json.item.claimStatus, "claimed");
    assert.equal(json.item.searchStatus, "found");
  });

  await t.test("Statuses: the quick switches on the detail page work", async () => {
    const id = await createItem(userCookie, { title: "Status quick switch record" });

    const claimSwitch = await request(`/items/${id}/claim-status`, {
      method: "POST",
      cookie: userCookie,
      form: { claimStatus: "claimed" },
    });
    assert.equal(claimSwitch.response.status, 302);

    const searchSwitch = await request(`/items/${id}/search-status`, {
      method: "POST",
      cookie: userCookie,
      form: { searchStatus: "found" },
    });
    assert.equal(searchSwitch.response.status, 302);

    const { json } = await request(`/api/items/${id}`);
    assert.equal(json.item.claimStatus, "claimed");
    assert.equal(json.item.searchStatus, "found");
  });

  await t.test("Statuses: an unknown status value is rejected, not written", async () => {
    const id = await createItem(userCookie, { title: "Status invalid record" });

    await request(`/items/${id}/claim-status`, {
      method: "POST",
      cookie: userCookie,
      form: { claimStatus: "sold" },
    });

    const { json } = await request(`/api/items/${id}`);
    assert.equal(json.item.claimStatus, "unclaimed");

    // 表單那條路也一樣：不合法的值要留在原本的狀態
    const { response } = await request(`/items/${id}`, {
      method: "POST",
      cookie: userCookie,
      form: {
        title: "Status invalid record",
        type: "lost",
        category: "other",
        claimStatus: "sold",
        searchStatus: "lost-again",
      },
    });

    assert.equal(response.status, 400);

    const after = await request(`/api/items/${id}`);
    assert.equal(after.json.item.claimStatus, "unclaimed");
    assert.equal(after.json.item.searchStatus, "unfound");
  });

  await t.test("Statuses: the list page can filter by claimStatus and searchStatus", async () => {
    const claimedList = await request("/items?claimStatus=claimed", {
      cookie: userCookie,
    });
    assert.equal(claimedList.response.status, 200);

    const foundList = await request("/items?searchStatus=found", {
      cookie: userCookie,
    });
    assert.equal(foundList.response.status, 200);

    // 不認得的值要被忽略（不要 400），這是Filter器一貫的容錯做法
    const nonsense = await request("/items?claimStatus=whatever", {
      cookie: userCookie,
    });
    assert.equal(nonsense.response.status, 200);
  });

  await t.test("an invalid id returns 404, not 500", async () => {
    const { response } = await request("/items/not-an-object-id", {
      cookie: userCookie,
    });

    assert.equal(response.status, 404);
  });
});

test("RESTful API: CRUD without signing in", async (t) => {
  let apiItemId;

  await t.test("GET /api lists every endpoint", async () => {
    const { response, json } = await request("/api");

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(json.endpoints));
    assert.ok(json.endpoints.some((item) => item.method === "PUT"));
  });

  await t.test("POST /api/items returns 201 with Location", async () => {
    const { response, json } = await request("/api/items", {
      method: "POST",
      body: {
        title: "Silver bottle (created via API)",
        type: "found",
        category: "other",
        location: "Engineering Building",
        description: "sticker on the body",
      },
    });

    assert.equal(response.status, 201);
    assert.equal(json.item.title, "Silver bottle (created via API)");
    assert.equal(json.item.status, "open");
    assert.equal(json.item.owner, null);

    apiItemId = json.item.id;
    assert.equal(
      response.headers.get("location"),
      `/api/items/${apiItemId}`
    );
  });

  await t.test("POST /api/items without a title returns 400 with field errors", async () => {
    const { response, json } = await request("/api/items", {
      method: "POST",
      body: { type: "lost" },
    });

    assert.equal(response.status, 400);
    assert.equal(json.errors[0].field, "title");
  });

  await t.test("POST /api/items with a bad type returns 400", async () => {
    const { response, json } = await request("/api/items", {
      method: "POST",
      body: { title: "invalid type", type: "stolen" },
    });

    assert.equal(response.status, 400);
    assert.ok(json.errors.some((error) => error.field === "type"));
  });

  await t.test("GET /api/items returns the list and a total", async () => {
    const { response, json } = await request("/api/items?limit=5");

    assert.equal(response.status, 200);
    assert.ok(json.items.length > 0);
    assert.ok(json.items.length <= 5);
    assert.ok(json.total >= json.items.length);
  });

  await t.test("GET /api/items?type=found returns found records only", async () => {
    const { response, json } = await request("/api/items?type=found");

    assert.equal(response.status, 200);
    assert.ok(json.items.every((item) => item.type === "found"));
  });

  await t.test("seed:demo data can be found", async () => {
    const { response, json } = await request(
      `/api/items?q=${encodeURIComponent("scarf")}`
    );

    assert.equal(response.status, 200);
    assert.ok(json.items.some((item) => item.title.includes("scarf")));
  });

  await t.test("GET /api/items/:id returns one record", async () => {
    const { response, json } = await request(`/api/items/${apiItemId}`);

    assert.equal(response.status, 200);
    assert.equal(json.item.id, apiItemId);
  });

  await t.test("PUT /api/items/:id can change just the status", async () => {
    const { response, json } = await request(`/api/items/${apiItemId}`, {
      method: "PUT",
      body: { status: "claimed" },
    });

    assert.equal(response.status, 200);
    assert.equal(json.item.status, "claimed");
    assert.equal(json.item.title, "Silver bottle (created via API)");
    assert.ok(json.item.claimedAt, "changing to claimed should fill claimedAt");
  });

  await t.test("PUT /api/items/:id can change claimStatus and searchStatus", async () => {
    const { response, json } = await request(`/api/items/${apiItemId}`, {
      method: "PUT",
      body: { claimStatus: "claimed", searchStatus: "found" },
    });

    assert.equal(response.status, 200);
    assert.equal(json.item.claimStatus, "claimed");
    assert.equal(json.item.searchStatus, "found");
    // 只改這兩個欄位時，本來的 title / status 不可以被清掉
    assert.equal(json.item.status, "claimed");
    assert.equal(json.item.title, "Silver bottle (created via API)");
  });

  await t.test("PUT with an invalid claimStatus returns 400", async () => {
    const { response, json } = await request(`/api/items/${apiItemId}`, {
      method: "PUT",
      body: { claimStatus: "sold" },
    });

    assert.equal(response.status, 400);
    assert.ok(json.errors.some((error) => error.field === "claimStatus"));
  });

  await t.test("GET /api/items?claimStatus=claimed filters with the new field", async () => {
    const { response, json } = await request("/api/items?claimStatus=claimed");

    assert.equal(response.status, 200);
    assert.ok(json.items.length > 0);
    assert.ok(json.items.every((item) => item.claimStatus === "claimed"));
  });

  await t.test("POST /api/items stores the two new statuses", async () => {
    const { response, json } = await request("/api/items", {
      method: "POST",
      body: {
        title: "API record with statuses",
        type: "lost",
        claimStatus: "claimed",
        searchStatus: "found",
      },
    });

    assert.equal(response.status, 201);
    assert.equal(json.item.claimStatus, "claimed");
    assert.equal(json.item.searchStatus, "found");

    await request(`/api/items/${json.item.id}`, { method: "DELETE" });
  });

  await t.test("PUT with no updatable field returns 400", async () => {
    const { response, json } = await request(`/api/items/${apiItemId}`, {
      method: "PUT",
      body: {},
    });

    assert.equal(response.status, 400);
    assert.match(json.message, /Invalid input/);
  });

  await t.test("PUT with a missing id returns 404", async () => {
    const { response } = await request(
      "/api/items/64d2f0e4b1a2c3d4e5f60718",
      { method: "PUT", body: { title: "missing record" } }
    );

    assert.equal(response.status, 404);
  });

  await t.test("DELETE /api/items/:id removes it and returns a summary", async () => {
    const { response, json } = await request(`/api/items/${apiItemId}`, {
      method: "DELETE",
    });

    assert.equal(response.status, 200);
    assert.equal(json.deleted.id, apiItemId);

    const after = await request(`/api/items/${apiItemId}`);
    assert.equal(after.response.status, 404);
  });

  await t.test("API errors are JSON, not HTML pages", async () => {
    const { response, json } = await request("/api/items/not-an-id");

    assert.equal(response.status, 404);
    assert.equal(json.message, "Record not found");
  });
});
