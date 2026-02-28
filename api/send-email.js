const { getMailerConfig, createTransporter } = require("./_mailer");

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

  const { name, email, position, phone } = req.body || {};
  if (!name || !email || !position) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: name, email, and position.",
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
      to: mailerConfig.notifyTo,
      replyTo: email,
      subject: "New ALOHA Security Applicant",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #D2042D;">New Applicant Alert</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Position:</strong> ${position}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Contact Number:</strong> ${phone || "N/A"}</p>
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
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send email.",
    });
  }
};
