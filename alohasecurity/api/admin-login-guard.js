const crypto = require("crypto");
let bcrypt = null;
try {
  bcrypt = require("bcryptjs");
} catch (_) {
  bcrypt = null;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { email, password } = req.body || {};
  if (!password) {
    return res.status(400).json({
      success: false,
      error: "Password is required.",
    });
  }

  const passwordHash =
    process.env.ADMIN_LOGIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH;
  const plainPassword =
    process.env.ADMIN_LOGIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const allowedEmail =
    process.env.ADMIN_LOGIN_EMAIL || process.env.ADMIN_EMAIL;

  if (!passwordHash && !plainPassword) {
    return res.status(500).json({
      success: false,
      error:
        "Missing admin password env. Set ADMIN_LOGIN_PASSWORD_HASH (recommended) or ADMIN_LOGIN_PASSWORD.",
    });
  }

  try {
    if (allowedEmail && email) {
      if (
        String(email).trim().toLowerCase() !==
        String(allowedEmail).trim().toLowerCase()
      ) {
        return res.status(401).json({
          success: false,
          error: "Email is not authorized for admin access.",
        });
      }
    }

    let passOk = false;
    if (passwordHash) {
      if (!bcrypt) {
        return res.status(500).json({
          success: false,
          error:
            "Password hash is configured but bcryptjs is unavailable. Install bcryptjs or use ADMIN_LOGIN_PASSWORD.",
        });
      }
      passOk = await bcrypt.compare(String(password), passwordHash);
    } else {
      const input = Buffer.from(String(password), "utf8");
      const expected = Buffer.from(String(plainPassword), "utf8");
      passOk =
        input.length === expected.length &&
        crypto.timingSafeEqual(input, expected);
    }

    if (!passOk) {
      return res.status(401).json({
        success: false,
        error: "Invalid password.",
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Admin guard check failed.",
    });
  }
};
