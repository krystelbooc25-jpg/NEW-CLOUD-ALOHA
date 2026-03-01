const crypto = require("crypto");
const { getMailerConfig, createTransporter } = require("./_mailer");

let bcrypt = null;
try {
  bcrypt = require("bcryptjs");
} catch (_) {
  bcrypt = null;
}

const usedResetTokenStore =
  global.__ALOHA_USED_RESET_TOKEN_STORE__ ||
  (global.__ALOHA_USED_RESET_TOKEN_STORE__ = new Map());

function setCors(res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getAdminDbConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    credentialsTable: process.env.ADMIN_CREDENTIALS_TABLE || "admin_credentials",
  };
}

function getSecurityDbConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    securityTable: process.env.ADMIN_LOGIN_SECURITY_TABLE || "admin_login_security",
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
  return payload.message || payload.error || fallback;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getResetConfig() {
  const expiresMinutes = Math.max(
    3,
    Number.parseInt(process.env.ADMIN_PASSWORD_RESET_EXPIRES_MINUTES || "10", 10) || 10
  );
  const secret =
    process.env.ADMIN_PASSWORD_RESET_SECRET ||
    process.env.ADMIN_LOGIN_PASSWORD_HASH ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "aloha-admin-reset-secret";
  return {
    expiresMinutes,
    expiresMs: expiresMinutes * 60 * 1000,
    secret,
  };
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signTokenPayload(payloadEncoded, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(String(payloadEncoded))
    .digest("hex");
}

function hashResetCode(secret, email, code, exp, nonce) {
  return crypto
    .createHash("sha256")
    .update(`${secret}|${email}|${code}|${exp}|${nonce}`)
    .digest("hex");
}

function createResetToken(email, code, config) {
  const exp = Date.now() + config.expiresMs;
  const nonce = crypto.randomBytes(8).toString("hex");
  const codeHash = hashResetCode(config.secret, email, code, exp, nonce);
  const payload = {
    email,
    exp,
    nonce,
    codeHash,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signTokenPayload(encodedPayload, config.secret);
  return {
    token: `${encodedPayload}.${signature}`,
    exp,
  };
}

function parseAndVerifyToken(token, config) {
  const raw = String(token || "");
  const parts = raw.split(".");
  if (parts.length !== 2) return { payload: null, error: "Invalid reset token." };

  const [encodedPayload, signature] = parts;
  const expectedSignature = signTokenPayload(encodedPayload, config.secret);
  const sigInput = Buffer.from(String(signature), "utf8");
  const sigExpected = Buffer.from(String(expectedSignature), "utf8");
  const validSig =
    sigInput.length === sigExpected.length && crypto.timingSafeEqual(sigInput, sigExpected);
  if (!validSig) {
    return { payload: null, error: "Invalid reset token signature." };
  }

  let payload = null;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload));
  } catch (_) {
    return { payload: null, error: "Invalid reset token payload." };
  }

  const expMs = Number(payload?.exp || 0);
  if (!expMs || Date.now() > expMs) {
    return { payload: null, error: "Reset code expired. Request a new code." };
  }

  return { payload, error: null };
}

function markResetTokenUsed(token) {
  const now = Date.now();
  usedResetTokenStore.set(token, now);
}

function isResetTokenUsed(token) {
  const usedAt = usedResetTokenStore.get(token);
  if (!usedAt) return false;
  const maxKeepMs = 2 * 60 * 60 * 1000;
  if (Date.now() - usedAt > maxKeepMs) {
    usedResetTokenStore.delete(token);
    return false;
  }
  return true;
}

async function fetchDbAdminRow() {
  const { supabaseUrl, serviceRoleKey, credentialsTable } = getAdminDbConfig();
  if (!supabaseUrl || !serviceRoleKey) return { row: null, error: null };

  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(
    credentialsTable
  )}?select=id,admin_email,password_hash&order=id.desc&limit=1`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildDbHeaders(serviceRoleKey),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    return {
      row: null,
      error: parseErrorMessage(payload, `Failed to read ${credentialsTable}.`),
    };
  }

  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  return { row, error: null };
}

async function saveAdminPassword(passwordHash, fallbackEmail) {
  const { supabaseUrl, serviceRoleKey, credentialsTable } = getAdminDbConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      success: false,
      error:
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Cannot save new password.",
    };
  }

  const { row, error: readError } = await fetchDbAdminRow();
  if (readError && /relation|table|does not exist|not found/i.test(String(readError))) {
    return {
      success: false,
      error: `Missing '${credentialsTable}' table. Create it first (id, admin_email, password_hash, updated_at).`,
    };
  }

  const nextEmail =
    normalizeEmail(row?.admin_email) ||
    normalizeEmail(fallbackEmail) ||
    normalizeEmail(process.env.ADMIN_LOGIN_EMAIL || process.env.ADMIN_EMAIL || "");

  const payload = {
    admin_email: nextEmail || null,
    password_hash: passwordHash,
    updated_at: new Date().toISOString(),
  };

  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(credentialsTable)}`;
  let response;
  if (row && row.id !== null && row.id !== undefined) {
    response = await fetch(`${endpoint}?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: {
        ...buildDbHeaders(serviceRoleKey),
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
  } else {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...buildDbHeaders(serviceRoleKey),
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
  }

  if (!response.ok) {
    const saveErr = await response.json().catch(() => null);
    return {
      success: false,
      error: parseErrorMessage(saveErr, `Unable to save password to '${credentialsTable}'.`),
    };
  }

  return { success: true };
}

async function clearAdminLoginLock(adminEmail) {
  const { supabaseUrl, serviceRoleKey, securityTable } = getSecurityDbConfig();
  if (!supabaseUrl || !serviceRoleKey) return;

  const scope = String(
    process.env.ADMIN_LOGIN_SECURITY_SCOPE || adminEmail || "global-admin"
  )
    .trim()
    .toLowerCase();
  if (!scope) return;

  await fetch(
    `${supabaseUrl}/rest/v1/${encodeURIComponent(
      securityTable
    )}?scope=eq.${encodeURIComponent(scope)}`,
    {
      method: "PATCH",
      headers: {
        ...buildDbHeaders(serviceRoleKey),
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        failed_attempts: 0,
        lock_until: null,
        updated_at: new Date().toISOString(),
      }),
    }
  ).catch(() => null);
}

async function sendResetCodeEmail(targetEmail, code, expiresMinutes) {
  const mailerConfig = getMailerConfig();
  if (!mailerConfig.user || !mailerConfig.pass) {
    return {
      success: false,
      error:
        "Mailer is not configured. Set MAILER_EMAIL and MAILER_PASSWORD in environment variables.",
    };
  }

  const transporter = createTransporter(mailerConfig);
  await transporter.sendMail({
    from: `"ALOHA Security" <${mailerConfig.user}>`,
    to: targetEmail,
    subject: "ALOHA Admin Password Reset Code",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #111827;">
        <h2 style="color: #D2042D;">Admin Password Reset</h2>
        <p>Your one-time verification code is:</p>
        <div style="font-size: 28px; font-weight: 800; letter-spacing: 6px; padding: 12px 16px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; display: inline-block;">
          ${code}
        </div>
        <p style="margin-top: 18px;">This code expires in <strong>${expiresMinutes} minute(s)</strong>.</p>
        <p style="font-size: 12px; color: #6b7280;">If you did not request this, ignore this email.</p>
      </div>
    `,
  });

  return { success: true };
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  const action = String(req.body?.action || "").trim().toLowerCase();
  if (!action) {
    return res.status(400).json({ success: false, error: "Missing action." });
  }

  const { row: dbAdminRow } = await fetchDbAdminRow();
  const configuredAdminEmail = normalizeEmail(
    dbAdminRow?.admin_email ||
      process.env.ADMIN_LOGIN_EMAIL ||
      process.env.ADMIN_EMAIL ||
      ""
  );

  try {
    if (action === "request") {
      const email = normalizeEmail(req.body?.email);
      if (!email) {
        return res.status(400).json({
          success: false,
          error: "Email is required.",
        });
      }

      const isAllowedEmail = configuredAdminEmail ? email === configuredAdminEmail : true;
      if (!isAllowedEmail) {
        return res.status(200).json({
          success: true,
          message: "If the email is valid, a reset code has been sent.",
        });
      }

      const resetConfig = getResetConfig();
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      const { token, exp } = createResetToken(email, code, resetConfig);

      const sent = await sendResetCodeEmail(email, code, resetConfig.expiresMinutes);
      if (!sent.success) {
        return res.status(500).json({
          success: false,
          error: sent.error || "Unable to send reset email.",
        });
      }

      return res.status(200).json({
        success: true,
        token,
        expiresAt: new Date(exp).toISOString(),
        expiresInMinutes: resetConfig.expiresMinutes,
        message: "Reset code sent to admin email.",
      });
    }

    if (action === "verify") {
      const email = normalizeEmail(req.body?.email);
      const code = String(req.body?.code || "").trim();
      const newPassword = String(req.body?.newPassword || "");
      const resetToken = String(req.body?.token || "");

      if (!email || !code || !newPassword || !resetToken) {
        return res.status(400).json({
          success: false,
          error: "Email, code, newPassword, and token are required.",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: "New password must be at least 8 characters.",
        });
      }

      if (configuredAdminEmail && email !== configuredAdminEmail) {
        return res.status(401).json({
          success: false,
          error: "Invalid reset request for this admin email.",
        });
      }

      if (!bcrypt) {
        return res.status(500).json({
          success: false,
          error: "bcryptjs is required to save secure password hashes.",
        });
      }

      if (isResetTokenUsed(resetToken)) {
        return res.status(400).json({
          success: false,
          error: "This reset code has already been used. Request a new code.",
        });
      }

      const resetConfig = getResetConfig();
      const parsed = parseAndVerifyToken(resetToken, resetConfig);
      if (parsed.error || !parsed.payload) {
        return res.status(400).json({
          success: false,
          error: parsed.error || "Invalid reset code token.",
        });
      }

      const payload = parsed.payload;
      if (normalizeEmail(payload.email) !== email) {
        return res.status(400).json({
          success: false,
          error: "Reset code email mismatch.",
        });
      }

      const expectedHash = String(payload.codeHash || "");
      const providedHash = hashResetCode(
        resetConfig.secret,
        email,
        code,
        Number(payload.exp || 0),
        String(payload.nonce || "")
      );
      const hashInput = Buffer.from(providedHash, "utf8");
      const hashExpected = Buffer.from(expectedHash, "utf8");
      const codeValid =
        hashInput.length === hashExpected.length &&
        crypto.timingSafeEqual(hashInput, hashExpected);
      if (!codeValid) {
        return res.status(400).json({
          success: false,
          error: "Invalid verification code.",
        });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      const saved = await saveAdminPassword(passwordHash, email);
      if (!saved.success) {
        return res.status(500).json({
          success: false,
          error: saved.error || "Unable to update password.",
        });
      }

      markResetTokenUsed(resetToken);
      await clearAdminLoginLock(email);

      return res.status(200).json({
        success: true,
        message: "Admin password reset successful.",
      });
    }

    return res.status(400).json({
      success: false,
      error: "Unsupported action. Use 'request' or 'verify'.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Password reset request failed.",
    });
  }
};

