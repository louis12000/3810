const mongoose = require("mongoose");

// 失物 / 招領紀錄的Category。前端下拉選單、API 驗證、seed 資料都共用這一份，
// 以後要加Category只改這裡，不用三處一起找。
const ITEM_TYPES = ["lost", "found"];
const ITEM_STATUSES = ["open", "claimed", "closed"];

// 認領狀態（claimStatus）：未領 / 已領。
// 舊的 status 欄位記錄的是整條認領流程（open → claimed → closed），
// 由認領／確認／重開這幾個動作控制；claimStatus 則是給Owner直接標記
// 「這件物品有沒有人認領／領走」，可以直接在表單改，也可以在詳情頁一鍵切換，
// 列表頁更可以用 ?claimStatus=claimed 這種 query string 篩選。
const CLAIM_STATUSES = ["unclaimed", "claimed"];
const CLAIM_STATUS_LABELS = {
  unclaimed: "Unclaimed",
  claimed: "Claimed",
};

// 找尋狀態（searchStatus）：未找到 / 找到。
// 給失主標記「東西找回來了沒有」，和認領狀態互相獨立：
// 一件物品可以是「已找到但未領回」，也可以是「已認領」。
const SEARCH_STATUSES = ["unfound", "found"];
const SEARCH_STATUS_LABELS = {
  unfound: "Not found yet",
  found: "Found",
};
const ITEM_CATEGORIES = [
  "electronics",
  "books",
  "documents",
  "keys",
  "accessories",
  "clothing",
  "other",
];

const CATEGORY_LABELS = {
  electronics: "Electronics",
  books: "Books & notes",
  documents: "ID & documents",
  keys: "Keys",
  accessories: "Accessories",
  clothing: "Clothing",
  other: "Other",
};

const TYPE_LABELS = { lost: "Lost", found: "Found" };
const STATUS_LABELS = { open: "Open", claimed: "Claim pending", closed: "Closed" };

function asString(value) {
  return typeof value === "string" ? value : "";
}

// <input type="date"> 送來的是 "2026-11-30"，直接 new Date() 會當成 UTC 午夜，
// 在香港時區會變成前一天。這裡按本機時間組合，避免日期跳一天。
function parseDateInput(value) {
  const text = asString(value).trim();

  if (!text) {
    return null;
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3])
    );
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const itemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    type: {
      type: String,
      enum: ITEM_TYPES,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ITEM_CATEGORIES,
      default: "other",
      index: true,
    },
    location: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    occurredAt: {
      type: Date,
      default: () => new Date(),
    },
    status: {
      type: String,
      enum: ITEM_STATUSES,
      default: "open",
      index: true,
    },
    // 認領狀態：預設未領，Owner / admin 可以隨時改成已領
    claimStatus: {
      type: String,
      enum: CLAIM_STATUSES,
      default: "unclaimed",
      index: true,
    },
    // 找尋狀態：預設未找到，失主找回物品後改成 found
    searchStatus: {
      type: String,
      enum: SEARCH_STATUSES,
      default: "unfound",
      index: true,
    },
    // 網頁介面建立的紀錄一定有 owner；RESTful API 依課程要求不需要Sign in，
    // 所以 API 建立的紀錄允許沒有 owner（owner 為 null）。
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    claimMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// 列表頁最常用的排序是「最新的排前面」
itemSchema.index({ createdAt: -1 });

/**
 * 共用驗證：網頁表單和 REST API 都呼叫同一支，避免兩邊規則不一致。
 * mode = "create" 時 title / type 必填；mode = "update" 時只驗有送來的欄位。
 */
itemSchema.statics.validatePayload = function validatePayload(body, mode) {
  const input = body && typeof body === "object" ? body : {};
  const values = {};
  const errors = {};

  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  if (mode === "create" || has("title")) {
    const title = asString(input.title).trim();

    if (title.length < 3 || title.length > 120) {
      errors.title = "Title must be between 3 and 120 characters";
    }

    values.title = title;
  }

  if (mode === "create" || has("type")) {
    const type = asString(input.type).trim();

    if (!ITEM_TYPES.includes(type)) {
      errors.type = "Type must be lost or found";
    }

    values.type = type;
  }

  if (mode === "create" || has("category")) {
    const category = asString(input.category).trim() || "other";

    if (!ITEM_CATEGORIES.includes(category)) {
      errors.category = "Category is not in the allowed list";
    }

    values.category = category;
  }

  if (has("description")) {
    const description = asString(input.description).trim();

    if (description.length > 1000) {
      errors.description = "Description must not exceed 1000 characters";
    }

    values.description = description;
  }

  if (has("location")) {
    const location = asString(input.location).trim();

    if (location.length > 120) {
      errors.location = "Location must not exceed 120 characters";
    }

    values.location = location;
  }

  if (has("occurredAt")) {
    const occurredAt = parseDateInput(input.occurredAt);

    if (!occurredAt) {
      errors.occurredAt = "Date must be in YYYY-MM-DD format";
    } else if (occurredAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      errors.occurredAt = "Date cannot be in the future";
    }

    values.occurredAt = occurredAt || undefined;
  }

  if (has("status")) {
    const status = asString(input.status).trim();

    if (!ITEM_STATUSES.includes(status)) {
      errors.status = "Status must be open / claimed / closed";
    }

    values.status = status;
  }

  if (has("claimStatus")) {
    const claimStatus = asString(input.claimStatus).trim();

    if (!CLAIM_STATUSES.includes(claimStatus)) {
      errors.claimStatus = "claimStatus must be unclaimed or claimed";
    }

    values.claimStatus = claimStatus;
  }

  if (has("searchStatus")) {
    const searchStatus = asString(input.searchStatus).trim();

    if (!SEARCH_STATUSES.includes(searchStatus)) {
      errors.searchStatus = "searchStatus must be unfound or found";
    }

    values.searchStatus = searchStatus;
  }

  if (has("claimMessage")) {
    const claimMessage = asString(input.claimMessage).trim();

    if (claimMessage.length > 500) {
      errors.claimMessage = "Claim message must not exceed 500 characters";
    }

    values.claimMessage = claimMessage;
  }

  return {
    ok: Object.keys(errors).length === 0,
    values,
    errors,
  };
};

// 給 API 用的序列化：owner / claimedBy 可能是 ObjectId，也可能是 populate 過的
// 文件，兩種情況都輸出一致的形狀。
itemSchema.statics.serialize = function serialize(item) {
  if (!item) {
    return null;
  }

  const refSummary = (value) => {
    if (!value) {
      return null;
    }

    if (typeof value === "object" && value.name !== undefined) {
      return { id: String(value._id), name: value.name };
    }

    return { id: String(value), name: null };
  };

  return {
    id: String(item._id),
    title: item.title,
    description: item.description,
    type: item.type,
    typeLabel: TYPE_LABELS[item.type] || item.type,
    category: item.category,
    categoryLabel: CATEGORY_LABELS[item.category] || item.category,
    location: item.location,
    occurredAt: item.occurredAt,
    status: item.status,
    statusLabel: STATUS_LABELS[item.status] || item.status,
    claimStatus: item.claimStatus,
    claimStatusLabel: CLAIM_STATUS_LABELS[item.claimStatus] || item.claimStatus,
    searchStatus: item.searchStatus,
    searchStatusLabel:
      SEARCH_STATUS_LABELS[item.searchStatus] || item.searchStatus,
    owner: refSummary(item.owner),
    claimedBy: refSummary(item.claimedBy),
    claimMessage: item.claimMessage,
    claimedAt: item.claimedAt,
    closedAt: item.closedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

itemSchema.statics.isOwnerOrAdmin = function isOwnerOrAdmin(item, user) {
  if (!item || !user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return Boolean(item.owner) && String(item.owner._id || item.owner) === String(user._id);
};

module.exports = mongoose.model("Item", itemSchema);
module.exports.ITEM_TYPES = ITEM_TYPES;
module.exports.ITEM_STATUSES = ITEM_STATUSES;
module.exports.ITEM_CATEGORIES = ITEM_CATEGORIES;
module.exports.CATEGORY_LABELS = CATEGORY_LABELS;
module.exports.TYPE_LABELS = TYPE_LABELS;
module.exports.STATUS_LABELS = STATUS_LABELS;
module.exports.CLAIM_STATUSES = CLAIM_STATUSES;
module.exports.CLAIM_STATUS_LABELS = CLAIM_STATUS_LABELS;
module.exports.SEARCH_STATUSES = SEARCH_STATUSES;
module.exports.SEARCH_STATUS_LABELS = SEARCH_STATUS_LABELS;
