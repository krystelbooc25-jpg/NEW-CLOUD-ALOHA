const nodemailer = require("nodemailer");

function getMailerConfig() {
  const user =
    process.env.MAILER_EMAIL ||
    process.env.MAILER_USER ||
    process.env.EMAIL_USER ||
    process.env.SMTP_USER ||
    "hrdepart28@gmail.com";
  const pass =
    process.env.MAILER_PASSWORD ||
    process.env.EMAIL_PASSWORD ||
    process.env.SMTP_PASS ||
    process.env.GMAIL_APP_PASSWORD ||
    "";
  const notifyTo =
    process.env.NOTIFY_EMAIL ||
    process.env.ADMIN_NOTIFY_EMAIL ||
    user;

  return { user, pass, notifyTo };
}

function createTransporter(config) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

module.exports = { getMailerConfig, createTransporter };
