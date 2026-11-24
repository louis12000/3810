/**
 * Demo 資料：建立幾筆失物 / 招領紀錄，讓演示和截圖不用從空白開始。
 *
 * 只動「seed 使用者」名下的紀錄，可以重複執行：
 * 先按 owner + title 找出舊資料，有就更新、沒有就建立。
 *
 * 用法：npm run seed:demo（先跑過 npm run seed）
 */
const env = require("../config/env");
const { connectDB, disconnectDB } = require("../config/db");
const User = require("../models/User");
const Item = require("../models/Item");

// 用固定的Created間隔，讓列表排序每次執行都一致
const BASE_TIME = new Date("2026-11-10T09:00:00+08:00").getTime();
const HOUR = 60 * 60 * 1000;

const DEMO_ITEMS = [
  {
    title: "Black folding umbrella (white sticker on the handle)",
    description:
      "Compact black umbrella; there is a small white smiley sticker on the inside of the handle. Left behind in the level 3 reading room last Wednesday.",
    type: "lost",
    category: "accessories",
    location: "Library, level 3 reading room",
    occurredAt: "2026-11-11",
    status: "open",
    claimStatus: "unclaimed",
    searchStatus: "unfound",
  },
  {
    title: "Student card (Chan Tai Man)",
    description:
      "The student card and its clear holder went missing together; there is also an Octopus card inside the holder.",
    type: "lost",
    category: "documents",
    location: "Student Union Building, 1/F",
    occurredAt: "2026-11-13",
    status: "open",
    // 已經有人拾回，但失主未領回：示範「找到但未領」
    claimStatus: "unclaimed",
    searchStatus: "found",
  },
  {
    title: "White AirPods Pro charging case",
    description:
      "Found on the bench next to Court 2 at the sports centre. The letters “HC” are engraved on the back; there are no earbuds inside.",
    type: "found",
    category: "electronics",
    location: "Sports Centre, Court 2",
    occurredAt: "2026-11-14",
    status: "open",
    claimStatus: "unclaimed",
    searchStatus: "unfound",
  },
  {
    title: "Blue stainless steel bottle (about 500 ml)",
    description:
      "Slightly dented body, black lid. Handed to the caretaker at the level 4 pantry of the Engineering Building.",
    type: "found",
    category: "other",
    location: "Engineering Building, 4/F pantry",
    occurredAt: "2026-11-15",
    status: "open",
    // 有人認領但未交收：示範「已領但未找到」
    claimStatus: "claimed",
    searchStatus: "unfound",
  },
  {
    title: "Operating System Concepts, 9th edition",
    description:
      "Yellow sticky notes along the edge, initials written on the last page.",
    type: "lost",
    category: "books",
    location: "Room B204",
    occurredAt: "2026-11-09",
    status: "claimed",
    claimStatus: "claimed",
    searchStatus: "found",
    claimMessage:
      "I think I saw this book in B204 — I took it to the department office, worth asking there.",
    claimedByAdmin: true,
  },
  {
    title: "Grey scarf",
    description:
      "Plain grey knitted scarf, no label. Left at the library lobby service desk.",
    type: "found",
    category: "clothing",
    location: "Library lobby",
    occurredAt: "2026-11-05",
    status: "closed",
    claimStatus: "claimed",
    searchStatus: "found",
    claimMessage: "This is mine, thank you! I have already picked it up at the desk.",
    claimedByAdmin: true,
  },
];

async function upsertItem(owner, admin, definition, index) {
  const createdAt = new Date(BASE_TIME + index * 6 * HOUR);

  const payload = {
    title: definition.title,
    description: definition.description,
    type: definition.type,
    category: definition.category,
    location: definition.location,
    occurredAt: new Date(definition.occurredAt),
    status: definition.status,
    // 兩個新狀態：沒寫就退回預設值（未領／未找到）
    claimStatus: definition.claimStatus || "unclaimed",
    searchStatus: definition.searchStatus || "unfound",
    owner: owner._id,
    claimedBy: definition.claimedByAdmin ? admin._id : null,
    claimMessage: definition.claimMessage || "",
    claimedAt:
      definition.status === "open" ? null : new Date(createdAt.getTime() + 2 * HOUR),
    closedAt:
      definition.status === "closed"
        ? new Date(createdAt.getTime() + 5 * HOUR)
        : null,
  };

  const existing = await Item.findOne({ owner: owner._id, title: payload.title });

  if (existing) {
    existing.set(payload);
    existing.createdAt = createdAt;
    await existing.save({ timestamps: false });
    return "updated";
  }

  const created = new Item(payload);
  created.createdAt = createdAt;
  created.updatedAt = createdAt;
  await created.save({ timestamps: false });
  return "created";
}

async function main() {
  await connectDB();

  const owner = await User.findOne({ email: env.SEED_USER_EMAIL });

  if (!owner) {
    throw new Error(
      `Cannot find ${env.SEED_USER_EMAIL} — run npm run seed first to create the accounts`
    );
  }

  const admin = await User.findOne({ email: env.SEED_ADMIN_EMAIL });

  if (!admin) {
    throw new Error(
      `Cannot find ${env.SEED_ADMIN_EMAIL} — run npm run seed first to create the accounts`
    );
  }

  let created = 0;
  let updated = 0;

  for (const [index, definition] of DEMO_ITEMS.entries()) {
    const result = await upsertItem(owner, admin, definition, index);

    if (result === "created") {
      created += 1;
    } else {
      updated += 1;
    }
  }

  const total = await Item.countDocuments();

  console.log(
    `[seed:demo] created ${created}, updated ${updated}, total ${total} item(s)`
  );
  console.log(`[seed:demo] record owner: ${owner.email}`);

  await disconnectDB();
}

main().catch(async (error) => {
  console.error("[seed:demo] failed:", error.message);

  try {
    await disconnectDB();
  } catch {
    // ignore disconnect errors
  }

  process.exit(1);
});
