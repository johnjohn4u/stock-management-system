async function sendResetPasswordEmail({ to, resetLink }) {
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_err) {
    console.warn('nodemailer not installed; reset link:', resetLink);
    return false;
  }

  const {
    SMTP_HOST,
    SMTP_PORT = '587',
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) {
    console.warn('SMTP is not fully configured; reset link:', resetLink);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD
    }
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: '1800 Soles Password Reset',
    text: `You requested to reset your password.\n\nOpen this link to continue:\n${resetLink}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>You requested to reset your password.</p><p><a href="${resetLink}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`
  });

  return true;
}

module.exports = { sendResetPasswordEmail };
