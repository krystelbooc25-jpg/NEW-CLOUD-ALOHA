const bcrypt = require("bcryptjs");

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

  const { adminId, password } = req.body || {};
  if (!adminId || !password) {
    return res.status(400).json({
      success: false,
      error: "Admin ID and password are required.",
    });
  }

  const adminIdHash = process.env.ADMIN_LOGIN_ID_HASH;
  const passwordHash = process.env.ADMIN_LOGIN_PASSWORD_HASH;

  if (!adminIdHash || !passwordHash) {
    return res.status(500).json({
      success: false,
      error: "Missing ADMIN_LOGIN_ID_HASH or ADMIN_LOGIN_PASSWORD_HASH.",
    });
  }

  try {
    const [idOk, passOk] = await Promise.all([
      bcrypt.compare(String(adminId).trim(), adminIdHash),
      bcrypt.compare(String(password), passwordHash),
    ]);

    if (!idOk || !passOk) {
      return res.status(401).json({
        success: false,
        error: "Invalid Admin ID or password.",
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
