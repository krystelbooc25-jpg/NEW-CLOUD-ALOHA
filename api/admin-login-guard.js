const crypto = require("crypto");
let bcrypt = null;
try {
  bcrypt = require("bcryptjs");
} catch (_) {
  bcrypt = null;
}

const runtimeLockStore =
  global.__ALOHA_ADMIN_LOCK_STORE__ ||
  (global.__ALOHA_ADMIN_LOCK_STORE__ = new Map());

function setCors(res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS,GET,POST");
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

function getLockPolicy() {
  const maxAttempts = Math.max(
    3,
    Number.parseInt(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || "5", 10) || 5
  );
  const lockMinutes = Math.max(
    1,
    Number.parseInt(process.env.ADMIN_LOGIN_LOCK_MINUTES || "15", 10) || 15
  );

  return {
    maxAttempts,
    lockMinutes,
    lockMs: lockMinutes * 60 * 1000,
  };
}

function parseErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  return payload.message || payload.error || fallback;
}

function normalizeStateRow(row) {
  if (!row) return { recordId: null, failedAttempts: 0, lockUntil: null };
  const failedAttempts = Math.max(
    0,
    Number.parseInt(String(row.failed_attempts ?? 0), 10) || 0
  );
  const lockUntil = row.lock_until ? String(row.lock_until) : null;
  return {
    recordId: row.id ?? null,
    failedAttempts,
    lockUntil,
  };
}

async function fetchSecurityStateFromDb(scope) {
  const { supabaseUrl, serviceRoleKey, securityTable } = getSecurityDbConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    return { state: null, error: "Missing Supabase security config." };
  }

  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(
    securityTable
  )}?scope=eq.${encodeURIComponent(
    scope
  )}&select=id,scope,failed_attempts,lock_until,updated_at&order=id.desc&limit=1`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildDbHeaders(serviceRoleKey),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    return {
      state: null,
      error: parseErrorMessage(payload, `Failed to read ${securityTable}.`),
    };
  }

  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  return {
    state: normalizeStateRow(row),
    error: null,
  };
}

async function saveSecurityStateToDb(scope, state) {
  const { supabaseUrl, serviceRoleKey, securityTable } = getSecurityDbConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    return { recordId: state.recordId || null, error: "Missing Supabase security config." };
  }

  const payload = {
    scope,
    failed_attempts: state.failedAttempts,
    lock_until: state.lockUntil || null,
    updated_at: new Date().toISOString(),
  };

  let response;
  if (state.recordId !== null && state.recordId !== undefined) {
    response = await fetch(
      `${supabaseUrl}/rest/v1/${encodeURIComponent(
        securityTable
      )}?id=eq.${encodeURIComponent(state.recordId)}`,
      {
        method: "PATCH",
        headers: {
          ...buildDbHeaders(serviceRoleKey),
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      }
    );
  } else {
    response = await fetch(
      `${supabaseUrl}/rest/v1/${encodeURIComponent(securityTable)}`,
      {
        method: "POST",
        headers: {
          ...buildDbHeaders(serviceRoleKey),
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      }
    );
  }

  if (!response.ok) {
    const saveErr = await response.json().catch(() => null);
    return {
      recordId: state.recordId || null,
      error: parseErrorMessage(saveErr, `Failed to save ${securityTable}.`),
    };
  }

  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  return {
    recordId: row?.id ?? state.recordId ?? null,
    error: null,
  };
}

function getRuntimeSecurityState(scope) {
  const existing = runtimeLockStore.get(scope);
  if (existing) return existing;
  const base = { recordId: null, failedAttempts: 0, lockUntil: null };
  runtimeLockStore.set(scope, base);
  return base;
}

function setRuntimeSecurityState(scope, nextState) {
  const normalized = {
    recordId: nextState.recordId ?? null,
    failedAttempts: Math.max(0, Number.parseInt(String(nextState.failedAttempts ?? 0), 10) || 0),
    lockUntil: nextState.lockUntil || null,
  };
  runtimeLockStore.set(scope, normalized);
  return normalized;
}

async function loadSecurityState(scope) {
  const dbResult = await fetchSecurityStateFromDb(scope);
  if (dbResult.state && !dbResult.error) {
    const normalized = setRuntimeSecurityState(scope, dbResult.state);
    return { ...normalized, source: "database" };
  }

  const runtimeState = getRuntimeSecurityState(scope);
  return { ...runtimeState, source: "runtime" };
}

async function persistSecurityState(scope, state) {
  const runtimeState = setRuntimeSecurityState(scope, state);
  const saveResult = await saveSecurityStateToDb(scope, runtimeState);
  if (!saveResult.error) {
    runtimeState.recordId = saveResult.recordId ?? runtimeState.recordId;
    runtimeLockStore.set(scope, runtimeState);
  }
  return runtimeState;
}

function getRetryInfo(lockUntil) {
  const lockMs = lockUntil ? Date.parse(lockUntil) : 0;
  if (!lockMs || Number.isNaN(lockMs)) {
    return { lockedUntil: null, lockedUntilMs: 0, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.max(0, Math.ceil((lockMs - Date.now()) / 1000));
  return {
    lockedUntil: lockUntil,
    lockedUntilMs: lockMs,
    retryAfterSeconds,
  };
}

async function fetchDbAdminCredentials() {
  const { supabaseUrl, serviceRoleKey, credentialsTable } = getAdminDbConfig();
  if (!supabaseUrl || !serviceRoleKey) return null;

  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(
    credentialsTable
  )}?select=id,admin_email,password_hash&order=id.desc&limit=1`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildDbHeaders(serviceRoleKey),
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

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
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
  const lockScope = String(
    process.env.ADMIN_LOGIN_SECURITY_SCOPE || allowedEmail || "global-admin"
  )
    .trim()
    .toLowerCase();
  const policy = getLockPolicy();

  if (req.method === "GET") {
    try {
      let securityState = await loadSecurityState(lockScope);
      let justUnlocked = false;
      const activeLock = getRetryInfo(securityState.lockUntil);

      if (activeLock.lockedUntilMs && Date.now() >= activeLock.lockedUntilMs) {
        justUnlocked = true;
        securityState = await persistSecurityState(lockScope, {
          ...securityState,
          failedAttempts: 0,
          lockUntil: null,
        });
      }

      const lockInfo = getRetryInfo(securityState.lockUntil);
      const isLocked = lockInfo.lockedUntilMs && Date.now() < lockInfo.lockedUntilMs;
      return res.status(200).json({
        success: true,
        scope: lockScope,
        locked: Boolean(isLocked),
        failedAttempts: securityState.failedAttempts || 0,
        ...lockInfo,
        justUnlocked,
        lockMinutes: policy.lockMinutes,
        maxAttempts: policy.maxAttempts,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message || "Unable to load admin lock status.",
      });
    }
  }

  const { email, password } = req.body || {};
  if (!password) {
    return res.status(400).json({
      success: false,
      error: "Password is required.",
    });
  }

  if (!passwordHash && !(allowPlainPasswordFallback && plainPassword)) {
    return res.status(500).json({
      success: false,
      error:
        "Missing secure admin password setup. Set ADMIN_LOGIN_PASSWORD_HASH (bcrypt). Plain passwords are disabled unless ALLOW_PLAIN_ADMIN_PASSWORD=true.",
    });
  }

  try {
    let securityState = await loadSecurityState(lockScope);
    const activeLock = getRetryInfo(securityState.lockUntil);
    if (activeLock.lockedUntilMs && Date.now() < activeLock.lockedUntilMs) {
      return res.status(429).json({
        success: false,
        error: `Too many failed attempts. Admin login is locked for ${policy.lockMinutes} minute(s).`,
        ...activeLock,
      });
    }

    const normalizedAllowedEmail = String(allowedEmail || "")
      .trim()
      .toLowerCase();
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    const isEmailAllowed =
      !normalizedAllowedEmail || !normalizedEmail || normalizedAllowedEmail === normalizedEmail;

    let passOk = false;
    if (isEmailAllowed) {
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
        passOk =
          input.length === expected.length && crypto.timingSafeEqual(input, expected);
      }
    }

    if (!passOk) {
      const nextFailedAttempts = (securityState.failedAttempts || 0) + 1;
      const shouldLock = nextFailedAttempts >= policy.maxAttempts;
      const nextLockUntil = shouldLock
        ? new Date(Date.now() + policy.lockMs).toISOString()
        : null;

      securityState = await persistSecurityState(lockScope, {
        ...securityState,
        failedAttempts: nextFailedAttempts,
        lockUntil: nextLockUntil,
      });

      if (shouldLock) {
        const lockInfo = getRetryInfo(nextLockUntil);
        return res.status(429).json({
          success: false,
          error: `Too many failed attempts. Admin login is locked for ${policy.lockMinutes} minute(s).`,
          ...lockInfo,
        });
      }

      const attemptsLeft = Math.max(0, policy.maxAttempts - nextFailedAttempts);
      return res.status(401).json({
        success: false,
        error: `Invalid login credentials. ${attemptsLeft} attempt(s) remaining before lockout.`,
        attemptsLeft,
        failedAttempts: nextFailedAttempts,
      });
    }

    await persistSecurityState(lockScope, {
      ...securityState,
      failedAttempts: 0,
      lockUntil: null,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Admin guard check failed.",
    });
  }
};
