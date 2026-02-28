const { getMailerConfig, createTransporter } = require("./_mailer");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getFileNameFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const lastPart = parsed.pathname.split("/").filter(Boolean).pop();
    return lastPart ? decodeURIComponent(lastPart) : null;
  } catch (_) {
    return null;
  }
}

async function fetchApplicantMetaById(applicationId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !applicationId) return null;

  const endpoint = `${supabaseUrl}/rest/v1/applicants?id=eq.${encodeURIComponent(
    applicationId
  )}&select=id,id_type,valid_id_url&limit=1`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const {
    name,
    email,
    position,
    phone,
    applicationId,
    idType,
    idFileName,
    idDocumentSubmitted,
  } = req.body || {};
  if (!name || !email || !position) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: name, email, and position.",
    });
  }

  const mailerConfig = getMailerConfig();
  if (!mailerConfig.user) {
    return res.status(500).json({
      success: false,
      error:
        "Missing MAILER_EMAIL environment variable (or MAILER_USER).",
    });
  }
  if (!mailerConfig.pass) {
    return res.status(500).json({
      success: false,
      error: "Missing MAILER_PASSWORD environment variable.",
    });
  }

  try {
    const transporter = createTransporter(mailerConfig);
    const fetchedApplicant = await fetchApplicantMetaById(applicationId);

    const resolvedIdType = fetchedApplicant?.id_type || idType || "Not provided";
    const resolvedIdUrl = fetchedApplicant?.valid_id_url || null;
    const resolvedIdFileName =
      getFileNameFromUrl(resolvedIdUrl) || idFileName || "Not provided";
    const resolvedIdSubmitted =
      typeof idDocumentSubmitted === "boolean"
        ? idDocumentSubmitted
        : Boolean(fetchedApplicant?.valid_id_url || idType || idFileName);
    const idVerificationSource = fetchedApplicant ? "Auto-fetched from database" : "From request payload";

    await transporter.sendMail({
      from: `"ALOHA Security" <${mailerConfig.user}>`,
      to: mailerConfig.notifyTo,
      replyTo: email,
      subject: "New ALOHA Security Applicant",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #D2042D;">New Applicant Alert</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Reference ID:</strong> ${applicationId || "N/A"}</p>
          <p><strong>Position:</strong> ${position}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Contact Number:</strong> ${phone || "N/A"}</p>
          <p><strong>Government ID Type:</strong> ${resolvedIdType}</p>
          <p><strong>ID Filename:</strong> ${resolvedIdFileName}</p>
          <p><strong>ID Document Submitted:</strong> ${resolvedIdSubmitted ? "Yes" : "No"}</p>
          <p><strong>ID Verification Source:</strong> ${idVerificationSource}</p>
          <p><strong>ID Document Link:</strong> ${
            resolvedIdUrl
              ? `<a href="${resolvedIdUrl}" target="_blank" rel="noopener noreferrer">Open Uploaded ID</a>`
              : "Not available"
          }</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #888;">Log in to the ALOHA admin dashboard to review full details.</p>
        </div>
      `,
    });

    let applicantConfirmationSent = false;
    try {
      await transporter.sendMail({
        from: `"ALOHA Security" <${mailerConfig.user}>`,
        to: email,
        subject: "Application Received - ALOHA Security",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #D2042D;">Application Received</h2>
            <p>Dear ${name},</p>
            <p>We received your job application for <strong>${position}</strong>.</p>
            <p><strong>Reference ID:</strong> ${applicationId || "Pending assignment"}</p>
            <p>We will contact you through this email for updates.</p>
            <p style="font-size: 12px; color: #888; margin-top: 20px;">This is an automated message from ALOHA Security.</p>
          </div>
        `,
      });
      applicantConfirmationSent = true;
    } catch (confirmationError) {
      console.error("Applicant confirmation email failed:", confirmationError);
    }

    return res.status(200).json({
      success: true,
      applicantConfirmationSent,
      idAutoFetched: Boolean(fetchedApplicant),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send email.",
    });
  }
};
