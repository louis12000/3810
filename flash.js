const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Hong_Kong",
});

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Asia/Hong_Kong",
});

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return dateFormatter.format(new Date(value));
}

// 只顯示日期的版本，給「Lost / found date」這種沒有時間意義的欄位用
function formatDay(value) {
  if (!value) {
    return "—";
  }

  return dayFormatter.format(new Date(value));
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function exposeLocals(req, res, next) {
  res.locals.appName = "Campus Lost & Found";
  res.locals.currentUser = req.user ? req.user.toPublicJSON() : null;
  res.locals.currentPath = req.path;
  res.locals.currentYear = new Date().getFullYear();
  res.locals.formatDate = formatDate;
  res.locals.formatDay = formatDay;

  res.locals.flash = req.session.flash || null;

  if (req.session.flash) {
    delete req.session.flash;
  }

  next();
}

module.exports = { setFlash, exposeLocals, formatDate, formatDay };
