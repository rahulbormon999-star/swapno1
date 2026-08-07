import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }
  return transporter;
}

export async function sendOtpEmail(email, otp) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD is not set');
  }

  try {
    await getTransporter().sendMail({
      from: `"Pravax" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Pravax — Your sign-in code',
      html: `
        <div style="font-family:Arial,sans-serif;text-align:center;padding:24px;background:#f4f6f9;">
          <h2 style="color:#2563eb;margin-bottom:4px;">Pravax</h2>
          <p style="color:#4a4a4a;font-size:14px;">Your sign-in verification code:</p>
          <div style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#1c1e21;margin:16px 0;">${otp}</div>
          <p style="color:#65676b;font-size:12px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `
    });
  } catch (err) {
    console.error('Gmail SMTP error:', err);
    throw new Error('Could not send email');
  }
}
