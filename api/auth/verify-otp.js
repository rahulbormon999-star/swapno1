import { sql } from '../../lib/db.js';
import { verifyOtpHash } from '../../lib/otp.js';
import { setSessionCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, otp } = req.body || {};

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and code are required' });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Enter the correct 6-digit code' });
    }

    const otpRows = await sql`SELECT otp_hash, expires_at, attempts FROM email_otps WHERE email = ${email}`;
    if (otpRows.length === 0) {
      return res.status(400).json({ error: 'No code found, please request a code first' });
    }
    const otpRow = otpRows[0];

    if (new Date(otpRow.expires_at) < new Date()) {
      await sql`DELETE FROM email_otps WHERE email = ${email}`;
      return res.status(400).json({ error: 'Code has expired, please request a new one' });
    }

    if (otpRow.attempts >= 5) {
      await sql`DELETE FROM email_otps WHERE email = ${email}`;
      return res.status(429).json({ error: 'Too many incorrect attempts, please request a new code' });
    }

    if (!verifyOtpHash(otp, otpRow.otp_hash)) {
      await sql`UPDATE email_otps SET attempts = attempts + 1 WHERE email = ${email}`;
      return res.status(400).json({ error: 'Incorrect code' });
    }

    await sql`DELETE FROM email_otps WHERE email = ${email}`;

    // ================= ইউজার থাকলে লগইন, না থাকলে নতুন একাউন্ট তৈরি =================
    const existing = await sql`SELECT id, banned, ban_reason FROM users WHERE email = ${email}`;

    let userId;
    if (existing.length > 0) {
      if (existing[0].banned) {
        return res.status(403).json({ error: 'Your account has been banned' + (existing[0].ban_reason ? `: ${existing[0].ban_reason}` : '') });
      }
      userId = existing[0].id;
      await sql`UPDATE users SET last_login_at = now() WHERE id = ${userId}`;
    } else {
      const inserted = await sql`
        INSERT INTO users (login_source, email, last_login_at)
        VALUES ('email', ${email}, now())
        RETURNING id
      `;
      userId = inserted[0].id;
    }

    setSessionCookie(res, userId);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error, please try again later' });
  }
}
