const express = require("express");
const mongoose = require("mongoose");

const Item = require("../models/Item");
const {
  CLAIM_STATUS_LABELS,
  ITEM_STATUSES,
  SEARCH_STATUS_LABELS,
  STATUS_LABELS,
} = require("../models/Item");
const { buildItemFilter } = require("../lib/item-query");

const router = express.Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function fieldErrors(errors) {
  return Object.entries(errors).map(([field, message]) => ({ field, message }));
}

function badRequest(res, errors) {
  return res.status(400).json({
    message: "Invalid input",
    errors: fieldErrors(errors),
  });
}

function notFound(res, message) {
  return res.status(404).json({ message });
}

function toInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function clamp(number, min, max) {
  return Math.min(Math.max(number, min), max);
}

async function findItemOrNull(id) {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }

  return Item.findById(id)
    .populate("owner", "name email")
    .populate("claimedBy", "name email");
}

/**
 * GET /api
 * 給 marker 和組員看的端點索引，不用翻 README 就知道有哪些 API。
 */
router.get("/api", (req, res) => {
  res.json({
    name: "Campus Lost & Found RESTful API",
    authentication: "None (course requirement)",
    endpoints: [
      { method: "GET", path: "/api/items", description: "List, filters: type / status / claimStatus / searchStatus / category / q / owner" },
      { method: "GET", path: "/api/items/:id", description: "Read one record" },
      { method: "POST", path: "/api/items", description: "Create one record" },
      { method: "PUT", path: "/api/items/:id", description: "Update one record (partial update allowed)" },
      { method: "DELETE", path: "/api/items/:id", description: "Delete one record" },
    ],
  });
});

/**
 * READ：列表
 * 例：GET /api/items?type=found&status=open&q=雨傘&limit=10
 */
router.get("/api/items", async (req, res, next) => {
  try {
    const { filter, keyword } = buildItemFilter(req.query);
    const limit = clamp(toInt(req.query.limit, DEFAULT_LIMIT), 1, MAX_LIMIT);
    const skip = Math.max(0, toInt(req.query.skip, 0));

    const [items, total] = await Promise.all([
      Item.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("owner", "name email")
        .populate("claimedBy", "name email"),
      Item.countDocuments(filter),
    ]);

    res.json({
      count: items.length,
      total,
      limit,
      skip,
      keyword,
      items: items.map((item) => Item.serialize(item)),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * READ：單筆
 */
router.get("/api/items/:id", async (req, res, next) => {
  try {
    const item = await findItemOrNull(req.params.id);

    if (!item) {
      return notFound(res, "Record not found");
    }

    return res.json({ item: Item.serialize(item) });
  } catch (error) {
    next(error);
  }
});

/**
 * CREATE
 * 必要欄位：title、type。owner 可省略（API 不需要Sign in）。
 */
router.post("/api/items", async (req, res, next) => {
  try {
    const result = Item.validatePayload(req.body || {}, "create");

    if (!result.ok) {
      return badRequest(res, result.errors);
    }

    const owner = mongoose.isValidObjectId(req.body && req.body.owner)
      ? req.body.owner
      : null;

    const item = await Item.create({ ...result.values, owner });

    return res
      .status(201)
      .location(`/api/items/${item._id}`)
      .json({
        message: "Created",
        item: Item.serialize(item),
      });
  } catch (error) {
    next(error);
  }
});

/**
 * UPDATE：允許部分更新，只改有送來的欄位。
 * 例：PUT /api/items/<id> {"status":"claimed"}
 *     PUT /api/items/<id> {"claimStatus":"claimed","searchStatus":"found"}
 */
router.put("/api/items/:id", async (req, res, next) => {
  try {
    const item = await findItemOrNull(req.params.id);

    if (!item) {
      return notFound(res, "Record not found");
    }

    const body = req.body || {};
    const result = Item.validatePayload(body, "update");

    if (!result.ok) {
      return badRequest(res, result.errors);
    }

    const changes = Object.keys(result.values);

    if (changes.length === 0) {
      return badRequest(res, {
        body: "Provide at least one field to update: title / type / category / description / location / occurredAt / status / claimStatus / searchStatus",
      });
    }

    const nextStatus = result.values.status;

    Object.assign(item, result.values);

    // Status欄位要一起維護 claimedAt / closedAt，不然畫面會出現
    // 「Closed但沒有結束時間」這種不一致的資料。
    if (nextStatus && ITEM_STATUSES.includes(nextStatus)) {
      if (nextStatus === "open") {
        item.claimedBy = null;
        item.claimMessage = "";
        item.claimedAt = null;
        item.closedAt = null;
      } else if (nextStatus === "claimed" && !item.claimedAt) {
        item.claimedAt = new Date();
        item.closedAt = null;
      } else if (nextStatus === "closed") {
        item.closedAt = new Date();
      }
    }

    await item.save();

    return res.json({
      message:
        `Updated, status: ${STATUS_LABELS[item.status] || item.status}` +
        `, claim: ${CLAIM_STATUS_LABELS[item.claimStatus] || item.claimStatus}` +
        `, search: ${SEARCH_STATUS_LABELS[item.searchStatus] || item.searchStatus}`,
      item: Item.serialize(item),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE
 */
router.delete("/api/items/:id", async (req, res, next) => {
  try {
    const item = await findItemOrNull(req.params.id);

    if (!item) {
      return notFound(res, "Record not found");
    }

    await item.deleteOne();

    return res.json({
      message: "Deleted",
      deleted: { id: String(item._id), title: item.title },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
