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

async function fetchDbAdminCredentials() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.ADMIN_CREDENTIALS_TABLE || "admin_credentials";
  if (!supabaseUrl || !serviceRoleKey) return null;

  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(
    table
  )}?select=id,admin_email,password_hash&order=id.desc&limit=1`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) return null;

  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row || !row.password_hash) return null;

  return {
    email: row.admin_email || null,
    passwordHash: row.password_hash,
  };
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

  const dbCreds = await fetchDbAdminCredentials();
  const passwordHash =
    dbCreds?.passwordHash ||
    process.env.ADMIN_LOGIN_PASSWORD_HASH ||
    process.env.ADMIN_PASSWORD_HASH;
  const plainPassword =
    process.env.ADMIN_LOGIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const allowPlainPasswordFallback =
    String(process.env.ALLOW_PLAIN_ADMIN_PASSWORD || "")
      .trim()
      .toLowerCase() === "true";
  const allowedEmail =
    dbCreds?.email || process.env.ADMIN_LOGIN_EMAIL || process.env.ADMIN_EMAIL;

  if (!passwordHash && !(allowPlainPasswordFallback && plainPassword)) {
    return res.status(500).json({
      success: false,
      error:
        "Missing secure admin password setup. Set ADMIN_LOGIN_PASSWORD_HASH (bcrypt). Plain passwords are disabled unless ALLOW_PLAIN_ADMIN_PASSWORD=true.",
    });
  }

  try {
    if (allowedEmail && email) {
      if (String(email).trim().toLowerCase() !== String(allowedEmail).trim().toLowerCase()) {
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
      // Local/dev fallback only when explicitly enabled.
      const input = Buffer.from(String(password), "utf8");
      const expected = Buffer.from(String(plainPassword), "utf8");
      passOk = input.length === expected.length && crypto.timingSafeEqual(input, expected);
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
