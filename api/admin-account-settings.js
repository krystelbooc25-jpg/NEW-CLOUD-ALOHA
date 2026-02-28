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
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS,GET,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getDbConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    table: process.env.ADMIN_CREDENTIALS_TABLE || "admin_credentials",
  };
}

function buildDbHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function parseErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  return payload.message || payload.error || payload.msg || fallback;
}

async function fetchDbAdminRow() {
  const { supabaseUrl, serviceRoleKey, table } = getDbConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    return { row: null, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." };
  }

  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(
    table
  )}?select=id,admin_email,password_hash&order=id.desc&limit=1`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildDbHeaders(serviceRoleKey),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    return {
      row: null,
      error: parseErrorMessage(payload, `Failed to read ${table}.`),
    };
  }

  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  return { row, error: null };
}

function verifyPlainPassword(inputPassword, expectedPassword) {
  const input = Buffer.from(String(inputPassword || ""), "utf8");
  const expected = Buffer.from(String(expectedPassword || ""), "utf8");
  return input.length === expected.length && crypto.timingSafeEqual(input, expected);
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    try {
      const { row } = await fetchDbAdminRow();
      const emailFromEnv = process.env.ADMIN_LOGIN_EMAIL || process.env.ADMIN_EMAIL || "";
      return res.status(200).json({
        success: true,
        email: row?.admin_email || emailFromEnv || "",
        source: row?.password_hash ? "database" : "env",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to load admin account settings.",
      });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  const { currentPassword, newEmail, newPassword } = req.body || {};
  const cleanCurrentPassword = String(currentPassword || "");
  const cleanNewEmail = String(newEmail || "").trim().toLowerCase();
  const cleanNewPassword = String(newPassword || "");

  if (!cleanCurrentPassword) {
    return res.status(400).json({
      success: false,
      error: "Current password is required.",
    });
  }

  if (!cleanNewEmail && !cleanNewPassword) {
    return res.status(400).json({
      success: false,
      error: "Provide a new email, a new password, or both.",
    });
  }

  if (cleanNewEmail) {
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanNewEmail);
    if (!isValidEmail) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format.",
      });
    }
  }

  if (cleanNewPassword && cleanNewPassword.length < 8) {
    return res.status(400).json({
      success: false,
      error: "New password must be at least 8 characters.",
    });
  }

  try {
    const { row, error: dbReadError } = await fetchDbAdminRow();

    const envHash = process.env.ADMIN_LOGIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH;
    const envPlain = process.env.ADMIN_LOGIN_PASSWORD || process.env.ADMIN_PASSWORD;
    const envEmail = process.env.ADMIN_LOGIN_EMAIL || process.env.ADMIN_EMAIL || "";

    const currentHash = row?.password_hash || envHash || null;
    const currentPlain = row?.password_hash ? null : envPlain || null;
    const currentEmail = row?.admin_email || envEmail || "";

    if (!currentHash && !currentPlain) {
      return res.status(500).json({
        success: false,
        error:
          "No admin password is configured. Set ADMIN_LOGIN_PASSWORD_HASH or add a database credential first.",
      });
    }

    let passOk = false;
    if (currentHash) {
      if (!bcrypt) {
        return res.status(500).json({
          success: false,
          error: "bcryptjs is required for hashed password verification.",
        });
      }
      passOk = await bcrypt.compare(cleanCurrentPassword, currentHash);
    } else {
      passOk = verifyPlainPassword(cleanCurrentPassword, currentPlain);
    }

    if (!passOk) {
      return res.status(401).json({
        success: false,
        error: "Current password is incorrect.",
      });
    }

    const { supabaseUrl, serviceRoleKey, table } = getDbConfig();
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        success: false,
        error:
          "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Cannot persist account changes.",
      });
    }

    if (!bcrypt) {
      return res.status(500).json({
        success: false,
        error: "bcryptjs is required to save secure password hashes.",
      });
    }

    const nextPasswordHash = cleanNewPassword
      ? await bcrypt.hash(cleanNewPassword, 12)
      : currentHash || (await bcrypt.hash(String(currentPlain), 12));
    const nextEmail = cleanNewEmail || currentEmail || null;

    const payload = {
      admin_email: nextEmail,
      password_hash: nextPasswordHash,
      updated_at: new Date().toISOString(),
    };

    const baseEndpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}`;
    let saveResponse;
    if (row && row.id !== undefined && row.id !== null) {
      saveResponse = await fetch(`${baseEndpoint}?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: {
          ...buildDbHeaders(serviceRoleKey),
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      });
    } else {
      saveResponse = await fetch(baseEndpoint, {
        method: "POST",
        headers: {
          ...buildDbHeaders(serviceRoleKey),
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      });
    }

    if (!saveResponse.ok) {
      const saveErr = await saveResponse.json().catch(() => null);
      const message = parseErrorMessage(
        saveErr,
        `Unable to save admin settings to table '${table}'.`
      );
      const suffix =
        dbReadError && /relation|table|does not exist|not found/i.test(dbReadError)
          ? ` Create the '${table}' table first (columns: id, admin_email, password_hash, updated_at).`
          : "";
      return res.status(500).json({
        success: false,
        error: `${message}${suffix}`,
      });
    }

    return res.status(200).json({
      success: true,
      email: nextEmail || "",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to update admin account settings.",
    });
  }
};
