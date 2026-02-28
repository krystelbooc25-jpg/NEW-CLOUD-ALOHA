const nodemailer = require("nodemailer");

function getMailerConfig() {
  const user =
    process.env.MAILER_EMAIL ||
    process.env.MAILER_USER ||
    "";
  const pass = process.env.MAILER_PASSWORD;
  const notifyTo = process.env.NOTIFY_EMAIL || user;

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
