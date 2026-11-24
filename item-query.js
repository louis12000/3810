const mongoose = require("mongoose");

const {
  CLAIM_STATUSES,
  ITEM_CATEGORIES,
  ITEM_STATUSES,
  ITEM_TYPES,
  SEARCH_STATUSES,
} = require("../models/Item");

function asString(value) {
  return typeof value === "string" ? value : "";
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 網頁列表和 RESTful API 共用同一套Filter規則：
 *   type / status / claimStatus / searchStatus / category / owner / q
 * 不認得的值一律忽略（而不是丟 400），讓「複製貼上網址」不會一改參數就壞掉。
 */
function buildItemFilter(input, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const filter = {};

  const lockedOwner = options.lockedOwner || null;

  if (lockedOwner) {
    filter.owner = lockedOwner;
  }

  if (ITEM_TYPES.includes(asString(source.type))) {
    filter.type = source.type;
  }

  if (ITEM_STATUSES.includes(asString(source.status))) {
    filter.status = source.status;
  }

  // 新增的兩個狀態維度：認領狀態（未領／已領）與找尋狀態（未找到／找到）
  if (CLAIM_STATUSES.includes(asString(source.claimStatus))) {
    filter.claimStatus = source.claimStatus;
  }

  if (SEARCH_STATUSES.includes(asString(source.searchStatus))) {
    filter.searchStatus = source.searchStatus;
  }

  if (ITEM_CATEGORIES.includes(asString(source.category))) {
    filter.category = source.category;
  }

  if (source.owner && mongoose.isValidObjectId(asString(source.owner))) {
    filter.owner = source.owner;
  }

  const q = asString(source.q).trim().slice(0, 60);

  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { title: pattern },
      { description: pattern },
      { location: pattern },
    ];
  }

  return { filter, keyword: q };
}

module.exports = { asString, escapeRegex, buildItemFilter };
