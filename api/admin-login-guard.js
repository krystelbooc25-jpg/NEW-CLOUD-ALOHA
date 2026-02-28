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

  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({
      success: false,
      error: "Password is required.",
    });
  }

  const passwordHash = process.env.ADMIN_LOGIN_PASSWORD_HASH;

  if (!passwordHash) {
    return res.status(500).json({
      success: false,
      error: "Missing ADMIN_LOGIN_PASSWORD_HASH.",
    });
  }

  try {
    const passOk = await bcrypt.compare(String(password), passwordHash);

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
