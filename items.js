const express = require("express");
const mongoose = require("mongoose");

const Item = require("../models/Item");
const {
  CATEGORY_LABELS,
  CLAIM_STATUSES,
  CLAIM_STATUS_LABELS,
  ITEM_CATEGORIES,
  ITEM_STATUSES,
  ITEM_TYPES,
  SEARCH_STATUSES,
  SEARCH_STATUS_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} = require("../models/Item");
const { requireAuth } = require("../middleware/auth");
const { setFlash } = require("../middleware/flash");
const { asString, buildItemFilter } = require("../lib/item-query");

const router = express.Router();

// 一次最多列 100 筆。課程 demo 的資料量很小，暫時不用分頁，
// 但要避免有人一次把整個 collection 拉出來。
const LIST_LIMIT = 100;

const meta = {
  types: ITEM_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] })),
  statuses: ITEM_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
  // 認領狀態（未領／已領）與找尋狀態（未找到／找到）的下拉選項，
  // 表單、Filter和詳情頁都吃這一份，改選項只要改 models/Item.js。
  claimStatuses: CLAIM_STATUSES.map((value) => ({
    value,
    label: CLAIM_STATUS_LABELS[value],
  })),
  searchStatuses: SEARCH_STATUSES.map((value) => ({
    value,
    label: SEARCH_STATUS_LABELS[value],
  })),
  categories: ITEM_CATEGORIES.map((value) => ({
    value,
    label: CATEGORY_LABELS[value],
  })),
  typeLabel: TYPE_LABELS,
  statusLabel: STATUS_LABELS,
  claimStatusLabel: CLAIM_STATUS_LABELS,
  searchStatusLabel: SEARCH_STATUS_LABELS,
  categoryLabel: CATEGORY_LABELS,
};

function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function renderNotFound(req, res) {
  return res.status(404).render("error", {
    title: "Item not found",
    statusCode: 404,
    message: "That lost & found record does not exist.",
    detail: null,
  });
}

function renderForbidden(req, res, message) {
  return res.status(403).render("error", {
    title: "Not allowed",
    statusCode: 403,
    message,
    detail: null,
  });
}

// 表單重新顯示時要保留使用者填過的值，所以直接讀原始 body，
// 只有日期需要補預設值。
function formValues(body) {
  const input = body && typeof body === "object" ? body : {};

  return {
    title: asString(input.title),
    description: asString(input.description),
    type: ITEM_TYPES.includes(asString(input.type)) ? input.type : "lost",
    category: ITEM_CATEGORIES.includes(asString(input.category))
      ? input.category
      : "other",
    location: asString(input.location),
    occurredAt: asString(input.occurredAt) || todayInputValue(),
    claimMessage: asString(input.claimMessage),
    // 兩個新狀態：送來的值不合法就退回預設（未領／未找到），
    // 讓使用者至少還看得到自己剛剛選過的值。
    claimStatus: CLAIM_STATUSES.includes(asString(input.claimStatus))
      ? input.claimStatus
      : "unclaimed",
    searchStatus: SEARCH_STATUSES.includes(asString(input.searchStatus))
      ? input.searchStatus
      : "unfound",
  };
}

// 把目前查詢字串整理成 view 需要的形狀，讓Filter器保持選中Status
function parseListQuery(query) {
  const source = query && typeof query === "object" ? query : {};

  // 預設看All records：這一頁是「Lost & found」，讓Sign in後第一眼就看到校園裡有甚麼。
  // 只想看自己的紀錄時，用上面的「My records」chip 切換（或去 /me）。
  const scope = source.scope === "mine" ? "mine" : "all";
  const type = ITEM_TYPES.includes(asString(source.type))
    ? source.type
    : "all";
  const status = ITEM_STATUSES.includes(asString(source.status))
    ? source.status
    : "all";
  // 「未領／已領」與「未找到／找到」各自獨立篩選，可以疊起來用
  const claimStatus = CLAIM_STATUSES.includes(asString(source.claimStatus))
    ? source.claimStatus
    : "all";
  const searchStatus = SEARCH_STATUSES.includes(asString(source.searchStatus))
    ? source.searchStatus
    : "all";
  const q = asString(source.q).trim().slice(0, 60);

  return { scope, type, status, claimStatus, searchStatus, q };
}

// Filter列的 quick chip 用「保留Other條件、只換一個」的連結，
// 這樣不必寫 client JS，重新整理也還在同一個畫面。
function buildLinks(filters) {
  const href = (patch) => {
    const merged = { ...filters, ...patch };
    const params = new URLSearchParams();

    if (merged.scope !== "mine") params.set("scope", merged.scope);
    if (merged.type !== "all") params.set("type", merged.type);
    if (merged.status !== "all") params.set("status", merged.status);
    if (merged.claimStatus !== "all")
      params.set("claimStatus", merged.claimStatus);
    if (merged.searchStatus !== "all")
      params.set("searchStatus", merged.searchStatus);
    if (merged.q) params.set("q", merged.q);

    const qs = params.toString();
    return qs ? `/items?${qs}` : "/items";
  };

  return {
    scopeMine: href({ scope: "mine" }),
    scopeAll: href({ scope: "all" }),
    typeAll: href({ type: "all" }),
    typeLost: href({ type: "lost" }),
    typeFound: href({ type: "found" }),
  };
}

async function loadItem(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return renderNotFound(req, res);
    }

    const item = await Item.findById(id)
      .populate("owner", "name email")
      .populate("claimedBy", "name email");

    if (!item) {
      return renderNotFound(req, res);
    }

    req.item = item;
    next();
  } catch (error) {
    next(error);
  }
}

function requireManageable(req, res, next) {
  if (Item.isOwnerOrAdmin(req.item, req.user)) {
    return next();
  }

  return renderForbidden(req, res, "Only the owner or an admin can modify this record");
}

/**
 * READ：列表頁
 * 支援 scope（我的 / 全部）、type、status、q 四種Filter，全部走 query string，
 * 這樣重新整理或分享連結都還會停在同一個畫面。
 */
router.get("/items", requireAuth, async (req, res, next) => {
  try {
    const filters = parseListQuery(req.query);
    const { filter: query } = buildItemFilter(filters, {
      lockedOwner: filters.scope === "mine" ? req.user._id : null,
    });

    const [items, total, mineCount] = await Promise.all([
      Item.find(query)
        .sort({ createdAt: -1 })
        .limit(LIST_LIMIT)
        .populate("owner", "name email")
        .populate("claimedBy", "name email"),
      Item.countDocuments(query),
      Item.countDocuments({ owner: req.user._id }),
    ]);

    res.render("items/index", {
      title: "Lost & found",
      items,
      total,
      mineCount,
      filters,
      meta,
      links: buildLinks(filters),
      truncated: total > items.length,
    });
  } catch (error) {
    next(error);
  }
});

// CREATE：表單頁。/items/new?type=found 可以直接帶入「Found」。
router.get("/items/new", requireAuth, (req, res) => {
  const requestedType = asString(req.query.type);

  res.render("items/new", {
    title: "New record",
    meta,
    errors: {},
    values: {
      title: "",
      description: "",
      type: ITEM_TYPES.includes(requestedType) ? requestedType : "lost",
      category: "other",
      location: "",
      occurredAt: todayInputValue(),
      claimMessage: "",
      claimStatus: "unclaimed",
      searchStatus: "unfound",
    },
  });
});

// CREATE：實際寫入
router.post("/items", requireAuth, async (req, res, next) => {
  try {
    const result = Item.validatePayload(req.body || {}, "create");

    if (!result.ok) {
      return res.status(400).render("items/new", {
        title: "New record",
        meta,
        errors: result.errors,
        values: formValues(req.body),
      });
    }

    const item = await Item.create({
      ...result.values,
      owner: req.user._id,
    });

    setFlash(req, "success", "Record created");
    return res.redirect(`/items/${item._id}`);
  } catch (error) {
    next(error);
  }
});

// READ：詳情頁
router.get("/items/:id", requireAuth, loadItem, (req, res) => {
  const item = req.item;

  res.render("items/show", {
    title: item.title,
    item,
    meta,
    canManage: Item.isOwnerOrAdmin(item, req.user),
    canClaim:
      item.status === "open" &&
      Boolean(item.owner) &&
      String(item.owner._id) !== String(req.user._id),
  });
});

// UPDATE：表單頁
router.get(
  "/items/:id/edit",
  requireAuth,
  loadItem,
  requireManageable,
  (req, res) => {
    const item = req.item;

    res.render("items/edit", {
      title: "Edit record",
      item,
      meta,
      errors: {},
      values: {
        title: item.title,
        description: item.description,
        type: item.type,
        category: item.category,
        location: item.location,
        occurredAt: item.occurredAt
          ? new Date(item.occurredAt).toISOString().slice(0, 10)
          : "",
        claimMessage: item.claimMessage,
        claimStatus: item.claimStatus,
        searchStatus: item.searchStatus,
      },
    });
  }
);

// UPDATE：實際寫入
//
// 網頁表單只送出 POST（HTML form 沒有 PUT），所以路徑設計成 POST /items/:id。
// 真正的 RESTful PUT 在 routes/api-items.js，兩邊共用 Item.validatePayload。
router.post(
  "/items/:id",
  requireAuth,
  loadItem,
  requireManageable,
  async (req, res, next) => {
    try {
      const result = Item.validatePayload(req.body || {}, "update");

      if (!result.ok) {
        return res.status(400).render("items/edit", {
          title: "Edit record",
          item: req.item,
          meta,
          errors: result.errors,
          values: formValues(req.body),
        });
      }

      // Status的變更走認領流程（/claim、/confirm、/reopen），
      // 這裡不接受表單直接改 status。
      // 但 claimStatus（未領／已領）和 searchStatus（未找到／找到）是給Owner
      // 直接維護的欄位，所以保留在 result.values 裡一起寫入。
      delete result.values.status;

      Object.assign(req.item, result.values);
      await req.item.save();

      setFlash(req, "success", "Record updated");
      return res.redirect(`/items/${req.item._id}`);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE
router.post(
  "/items/:id/delete",
  requireAuth,
  loadItem,
  requireManageable,
  async (req, res, next) => {
    try {
      const { title } = req.item;
      await req.item.deleteOne();

      setFlash(req, "success", `Deleted「${title}」`);
      return res.redirect("/items");
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 認領流程
 * open ──(非Owner按「This is mine / 我撿到了」)──> claimed ──(Owner確認)──> closed
 *                              └──(Owner駁回)──> open
 */
router.post("/items/:id/claim", requireAuth, loadItem, async (req, res, next) => {
  try {
    const item = req.item;

    if (item.owner && String(item.owner._id) === String(req.user._id)) {
      setFlash(req, "error", "You cannot claim your own record");
      return res.redirect(`/items/${item._id}`);
    }

    if (item.status !== "open") {
      setFlash(req, "error", "This record is already being handled");
      return res.redirect(`/items/${item._id}`);
    }

    item.status = "claimed";
    item.claimedBy = req.user._id;
    item.claimMessage = asString(req.body && req.body.claimMessage)
      .trim()
      .slice(0, 500);
    item.claimedAt = new Date();
    await item.save();

    setFlash(req, "success", "Claim submitted — waiting for confirmation");
    return res.redirect(`/items/${item._id}`);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/items/:id/confirm",
  requireAuth,
  loadItem,
  requireManageable,
  async (req, res, next) => {
    try {
      const item = req.item;

      if (item.status !== "claimed") {
        setFlash(req, "error", "Only records with a pending claim can be confirmed");
        return res.redirect(`/items/${item._id}`);
      }

      item.status = "closed";
      item.closedAt = new Date();
      // 交收完成＝物品已被領走，認領狀態一併變成「已領」；
      // 找尋狀態也順手標成「已找到」（失主拿回東西了）。
      item.claimStatus = "claimed";
      item.searchStatus = "found";
      await item.save();

      setFlash(req, "success", "Handover confirmed — record closed");
      return res.redirect(`/items/${item._id}`);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/items/:id/reopen",
  requireAuth,
  loadItem,
  requireManageable,
  async (req, res, next) => {
    try {
      const item = req.item;

      if (item.status === "open") {
        setFlash(req, "error", "This record is already open");
        return res.redirect(`/items/${item._id}`);
      }

      item.status = "open";
      item.claimedBy = null;
      item.claimMessage = "";
      item.claimedAt = null;
      item.closedAt = null;
      // Reopen 要把 confirm 時自動寫入的兩個狀態一併回滾，
      // 否則會留下「已領／已找到」但流程仍是 open 的矛盾資料。
      item.claimStatus = "unclaimed";
      item.searchStatus = "unfound";
      await item.save();

      setFlash(req, "success", "Record reopened");
      return res.redirect(`/items/${item._id}`);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 快速切換狀態（詳情頁的兩組小按鈕）
 * 1) 認領狀態：未領 ↔ 已領
 * 2) 找尋狀態：未找到 ↔ 找到
 * 只有Owner或admin可以按；想一次改多個欄位時仍然走 POST /items/:id 編輯表單。
 */
router.post(
  "/items/:id/claim-status",
  requireAuth,
  loadItem,
  requireManageable,
  async (req, res, next) => {
    try {
      const nextStatus = asString(req.body && req.body.claimStatus).trim();

      if (!CLAIM_STATUSES.includes(nextStatus)) {
        setFlash(req, "error", "Unknown claim status");
        return res.redirect(`/items/${req.item._id}`);
      }

      req.item.claimStatus = nextStatus;
      await req.item.save();

      setFlash(
        req,
        "success",
        `Claim status updated: ${CLAIM_STATUS_LABELS[nextStatus]}`
      );
      return res.redirect(`/items/${req.item._id}`);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/items/:id/search-status",
  requireAuth,
  loadItem,
  requireManageable,
  async (req, res, next) => {
    try {
      const nextStatus = asString(req.body && req.body.searchStatus).trim();

      if (!SEARCH_STATUSES.includes(nextStatus)) {
        setFlash(req, "error", "Unknown search status");
        return res.redirect(`/items/${req.item._id}`);
      }

      req.item.searchStatus = nextStatus;
      await req.item.save();

      setFlash(
        req,
        "success",
        `Search status updated: ${SEARCH_STATUS_LABELS[nextStatus]}`
      );
      return res.redirect(`/items/${req.item._id}`);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
module.exports.meta = meta;
