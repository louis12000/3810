const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/User");
const Item = require("../models/Item");
const itemRoutes = require("./items");
const { requireAdmin, requireAuth } = require("../middleware/auth");

const router = express.Router();

// 失物紀錄的欄位標籤定義在 routes/items.js，這裡直接共用，避免兩份對照表
const meta = itemRoutes.meta;

const RECORD_TABS = ["found", "lost", "claims"];

/**
 * lean() 查詢不會套用 schema 的 default 值，改版前建立的舊資料沒有
 * claimStatus / searchStatus 兩個欄位，這裡補回預設值（未領／未找到），
 * 免得畫面出現 “undefined” 的badge。
 */
function withStatusDefaults(item) {
  return {
    ...item,
    claimStatus: item.claimStatus || "unclaimed",
    searchStatus: item.searchStatus || "unfound",
  };
}

/**
 * Overview：四個統計數字 + Latest found items + Unclaimed卡片。
 * 全部由 MongoDB 即時計算，沒有寫死的假數字。
 */
router.get("/", async (req, res, next) => {
  if (!req.user) {
    return res.redirect("/login");
  }

  try {
    const myId = req.user._id;

    // 統計改成以「認領狀態」和「找尋狀態」為主：
    //   unclaimedFound = 還沒有人領的拾獲物
    //   claimedTotal   = 已領（有人認領／已交收）
    //   recovered      = 已找到
    const [
      unclaimedFound,
      claimedTotal,
      recovered,
      myUnclaimed,
      totalFound,
      recent,
      available,
    ] = await Promise.all([
        Item.countDocuments({ type: "found", claimStatus: "unclaimed" }),
        Item.countDocuments({ claimStatus: "claimed" }),
        Item.countDocuments({ searchStatus: "found" }),
        Item.countDocuments({ owner: myId, claimStatus: "unclaimed" }),
        Item.countDocuments({ type: "found" }),
        Item.find({ type: "found" })
          .sort({ createdAt: -1 })
          .limit(4)
          .populate("owner", "name email")
          .lean(),
        Item.find({ type: "found", claimStatus: "unclaimed" })
          .sort({ createdAt: -1 })
          .limit(4)
          .populate("owner", "name email")
          .lean(),
      ]);

    return res.render("home", {
      title: "Overview",
      meta,
      stats: { unclaimedFound, claimedTotal, recovered, myUnclaimed, totalFound },
      recent: recent.map(withStatusDefaults),
      available: available.map(withStatusDefaults),
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * My records：三個分頁（Found by me / Lost by me / My claims），
 * 一次把三份清單查完再依 tab 決定顯示哪一份，切換分頁不用多打一次 API。
 */
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const myId = req.user._id;
    const requested = String(req.query.tab || "");
    const tab = RECORD_TABS.includes(requested) ? requested : "found";

    const [foundItems, lostItems, claims] = await Promise.all([
      Item.find({ owner: myId, type: "found" })
        .sort({ createdAt: -1 })
        .populate("owner", "name email")
        .lean(),
      Item.find({ owner: myId, type: "lost" })
        .sort({ createdAt: -1 })
        .populate("owner", "name email")
        .lean(),
      Item.find({ claimedBy: myId })
        .sort({ claimedAt: -1 })
        .populate("owner", "name email")
        .populate("claimedBy", "name email")
        .lean(),
    ]);

    const list = (
      tab === "found" ? foundItems : tab === "lost" ? lostItems : claims
    ).map(withStatusDefaults);

    return res.render("me", {
      title: "My records",
      meta,
      tab,
      list,
      counts: {
        found: foundItems.length,
        lost: lostItems.length,
        claims: claims.length,
        // 「Still missing」= 我報失、但找尋狀態仍然是未找到的紀錄
        unfoundLost: lostItems.filter(
          (item) => (item.searchStatus || "unfound") === "unfound"
        ).length,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// 舊網址保留：以前的首頁叫 /dashboard
router.get("/dashboard", requireAuth, (req, res) => res.redirect("/me"));

router.get("/admin", requireAuth, requireAdmin, (req, res) => {
  res.redirect("/admin/users");
});

router.get(
  "/admin/users",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const users = await User.find()
        .select("name email role isActive createdAt lastLoginAt")
        .sort({ createdAt: 1 })
        .lean();

      res.render("admin-users", {
        title: "User management",
        users,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

module.exports = router;
