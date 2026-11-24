const express = require("express");
const bcrypt = require("bcryptjs");
const { rateLimit } = require("express-rate-limit");

const env = require("../config/env");
const User = require("../models/User");
const {
  redirectIfAuthenticated,
  requireAuth,
  safeNext,
  wantsJson,
} = require("../middleware/auth");

const router = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-account", 12);

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateRegistration({ name, email, password, confirmPassword }) {
  const errors = [];

  if (name.length < 2 || name.length > 80) {
    errors.push("Name must be between 2 and 80 characters");
  }

  if (
    email.length > 254 ||
    !EMAIL_PATTERN.test(email)
  ) {
    errors.push("Enter a valid email address");
  }

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters");
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    errors.push("Password must not exceed 72 bytes");
  }

  if (password !== confirmPassword) {
    errors.push("The two passwords do not match");
  }

  return errors;
}

async function authenticate(email, password) {
  const user = await User.findOne({ email }).select("+passwordHash");

  // 查無帳號時仍然比較一次，降低明顯的時間差異
  const passwordMatches = await bcrypt.compare(
    password,
    user ? user.passwordHash : DUMMY_HASH
  );

  if (!user || !user.isActive || !passwordMatches) {
    return null;
  }

  const lastLoginAt = new Date();

  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt } }
  );

  user.lastLoginAt = lastLoginAt;

  return user;
}

function establishSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        return reject(error);
      }

      req.session.userId = user._id.toString();

      req.session.save((error) => {
        if (error) {
          return reject(error);
        }

        resolve();
      });
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        return reject(error);
      }

      resolve();
    });
  });
}

function clearSessionCookie(res) {
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
  });
}

function renderLogin(res, options = {}) {
  return res.status(options.status || 200).render("login", {
    title: "Sign in",
    email: options.email || "",
    error: options.error || null,
    notice: options.notice || null,
    next: options.next || "/dashboard",
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler(req, res) {
    const message = "Too many sign-in attempts, try again later";

    if (wantsJson(req)) {
      return res.status(429).json({ message });
    }

    return renderLogin(res, {
      status: 429,
      error: message,
      next: safeNext(req.body && req.body.next),
    });
  },
});

router.get("/login", redirectIfAuthenticated, (req, res) => {
  renderLogin(res, {
    next: safeNext(req.query.next),
    notice: req.query.loggedOut === "1" ? "You have signed out" : null,
  });
});

router.post(
  "/login",
  redirectIfAuthenticated,
  loginLimiter,
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const email = normalizeEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      const nextUrl = safeNext(body.next);

      if (!email || !password) {
        return renderLogin(res, {
          status: 400,
          email,
          next: nextUrl,
          error: "Enter your email and password",
        });
      }

      if (Buffer.byteLength(password, "utf8") > 72) {
        return renderLogin(res, {
          status: 400,
          email,
          next: nextUrl,
          error: "That password format is not valid",
        });
      }

      const user = await authenticate(email, password);

      if (!user) {
        return renderLogin(res, {
          status: 401,
          email,
          next: nextUrl,
          error: "Email or password is incorrect",
        });
      }

      await establishSession(req, user);
      return res.redirect(nextUrl);
    } catch (error) {
      next(error);
    }
  }
);

router.get("/register", redirectIfAuthenticated, (req, res) => {
  res.render("register", {
    title: "Create account",
    values: { name: "", email: "" },
    error: null,
  });
});

router.post(
  "/register",
  redirectIfAuthenticated,
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = normalizeEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      const confirmPassword =
        typeof body.confirmPassword === "string" ? body.confirmPassword : "";

      const values = { name, email };
      const errors = validateRegistration({
        name,
        email,
        password,
        confirmPassword,
      });

      if (errors.length > 0) {
        return res.status(400).render("register", {
          title: "Create account",
          values,
          error: errors[0],
        });
      }

      const existing = await User.findOne({ email });

      if (existing) {
        return res.status(409).render("register", {
          title: "Create account",
          values,
          error: "That email is already registered",
        });
      }

      const passwordHash = await User.hashPassword(password);
      const user = await User.create({
        name,
        email,
        passwordHash,
        role: "user",
      });

      await establishSession(req, user);
      return res.redirect("/dashboard");
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).render("register", {
          title: "Create account",
          values: {
            name: (req.body && req.body.name) || "",
            email: normalizeEmail(req.body && req.body.email),
          },
          error: "That email is already registered",
        });
      }

      return next(error);
    }
  }
);

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await destroySession(req);
    clearSessionCookie(res);
    return res.redirect("/login?loggedOut=1");
  } catch (error) {
    next(error);
  }
});

router.post(
  "/api/auth/login",
  loginLimiter,
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const email = normalizeEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";

      if (
        !email ||
        !password ||
        Buffer.byteLength(password, "utf8") > 72
      ) {
        return res.status(400).json({
          message: "Enter a valid email and password",
        });
      }

      const user = await authenticate(email, password);

      if (!user) {
        return res.status(401).json({
          message: "Email or password is incorrect",
        });
      }

      await establishSession(req, user);

      return res.json({
        message: "Signed in",
        user: user.toPublicJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/api/auth/register",
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = normalizeEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      const confirmPassword =
        typeof body.confirmPassword === "string"
          ? body.confirmPassword
          : password;

      const errors = validateRegistration({
        name,
        email,
        password,
        confirmPassword,
      });

      if (errors.length > 0) {
        return res.status(400).json({
          message: errors[0],
          errors,
        });
      }

      const existing = await User.findOne({ email });

      if (existing) {
        return res.status(409).json({
          message: "That email is already registered",
        });
      }

      const passwordHash = await User.hashPassword(password);
      const user = await User.create({
        name,
        email,
        passwordHash,
        role: "user",
      });

      await establishSession(req, user);

      return res.status(201).json({
        message: "Account created",
        user: user.toPublicJSON(),
      });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({
          message: "That email is already registered",
        });
      }

      return next(error);
    }
  }
);

router.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    user: req.user.toPublicJSON(),
  });
});

router.post("/api/auth/logout", requireAuth, async (req, res, next) => {
  try {
    await destroySession(req);
    clearSessionCookie(res);

    return res.json({
      message: "Signed out",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
