const { getMailerConfig, createTransporter } = require("./_mailer");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getTemplate(status, applicantName, branch) {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "approved") {
    return {
      subject: "Application Approved - ALOHA Security",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #10b981;">Application Approved</h2>
          <p>Dear <strong>${applicantName}</strong>,</p>
          <p>Your application to ALOHA Security has been approved.</p>
          <p><strong>Deployment Branch:</strong> ${branch || "To be announced"}</p>
          <p>Please report to the main office for briefing and schedule details.</p>
        </div>
      `,
    };
  }

  if (
    normalized === "for interview" ||
    normalized === "forinterview" ||
    normalized === "interview"
  ) {
    return {
      subject: "Interview Invitation - ALOHA Security",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2563eb;">Interview Invitation</h2>
          <p>Dear <strong>${applicantName}</strong>,</p>
          <p>Your application has passed initial screening and is now scheduled for interview.</p>
          <p>Please monitor your email for final schedule, time, and venue details from our HR team.</p>
        </div>
      `,
    };
  }

  if (normalized === "blacklisted") {
    return {
      subject: "Application Status - ALOHA Security",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #111827;">Application Status</h2>
          <p>Dear <strong>${applicantName}</strong>,</p>
          <p>Your recent application has been placed under restricted status.</p>
          <p>If you believe this is an error, please contact our HR office for clarification.</p>
        </div>
      `,
    };
  }

  if (normalized === "rejected") {
    return {
      subject: "Application Update - ALOHA Security",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #D2042D;">Application Update</h2>
          <p>Dear <strong>${applicantName}</strong>,</p>
          <p>Thank you for your interest in ALOHA Security.</p>
          <p>After review, we will not be moving forward with your application at this time.</p>
        </div>
      `,
    };
  }

  if (normalized === "terminated") {
    return {
      subject: "Employment Notice - ALOHA Security",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #D2042D;">Notice of Termination</h2>
          <p>Dear <strong>${applicantName}</strong>,</p>
          <p>This email serves as official notice that your employment has been terminated.</p>
          <p>Please coordinate with HR within 48 hours for final clearance.</p>
        </div>
      `,
    };
  }

  return null;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { applicantEmail, applicantName, status, branch } = req.body || {};
  if (!applicantEmail || !applicantName || !status) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: applicantEmail, applicantName, and status.",
    });
  }

  const template = getTemplate(status, applicantName, branch);
  if (!template) {
    return res.status(400).json({
      success: false,
      error: "Invalid status value.",
    });
  }

  const mailerConfig = getMailerConfig();
  if (!mailerConfig.pass) {
    return res.status(500).json({
      success: false,
      error: "Missing MAILER_PASSWORD environment variable.",
    });
  }

  try {
    const transporter = createTransporter(mailerConfig);
    await transporter.sendMail({
      from: `"ALOHA Security" <${mailerConfig.user}>`,
      to: applicantEmail,
      subject: template.subject,
      html: template.html,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send email.",
    });
  }
};
