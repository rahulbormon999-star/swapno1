import { sql } from '../../lib/db.js';
import { verifySsoToken, setSessionCookie } from '../../lib/auth.js';

// Dev-Onix এর sso.html এখানে রিডাইরেক্ট করে পাঠায়: /api/auth/sso-login?token=<signed-jwt>
// টোকেনে থাকে: { userId, firstName, lastName, email, phone } (Dev-Onix এর signSsoToken থেকে)
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const token = req.query.token;
  if (!token) {
    return res.status(400).send('টোকেন পাওয়া যায়নি');
  }

  const payload = verifySsoToken(token);
  if (!payload || !payload.userId) {
    return res.status(401).send('SSO টোকেন যাচাই করা যায়নি, আবার লগইন করার চেষ্টা করুন');
  }

  try {
    // ================= devonix_user_id দিয়ে আগে থেকে একাউন্ট আছে কিনা খোঁজা হচ্ছে =================
    const existing = await sql`
      SELECT id, banned, ban_reason FROM users WHERE devonix_user_id = ${payload.userId}
    `;

    let userId;

    if (existing.length > 0) {
      if (existing[0].banned) {
        return res.status(403).send('আপনার একাউন্ট ব্যান করা হয়েছে' + (existing[0].ban_reason ? `: ${existing[0].ban_reason}` : ''));
      }
      userId = existing[0].id;
      await sql`
        UPDATE users SET
          first_name = ${payload.firstName || null},
          last_name = ${payload.lastName || null},
          email = COALESCE(${payload.email || null}, email),
          phone = COALESCE(${payload.phone || null}, phone),
          last_login_at = now()
        WHERE id = ${userId}
      `;
    } else {
      // ================= একই ইমেইল দিয়ে আগে email-login করা থাকলে সেই একাউন্টেই devonix লিংক করে দেওয়া হচ্ছে =================
      const byEmail = payload.email
        ? await sql`SELECT id, banned, ban_reason FROM users WHERE email = ${payload.email}`
        : [];

      if (byEmail.length > 0) {
        if (byEmail[0].banned) {
          return res.status(403).send('আপনার একাউন্ট ব্যান করা হয়েছে' + (byEmail[0].ban_reason ? `: ${byEmail[0].ban_reason}` : ''));
        }
        userId = byEmail[0].id;
        await sql`
          UPDATE users SET
            devonix_user_id = ${payload.userId},
            first_name = ${payload.firstName || null},
            last_name = ${payload.lastName || null},
            phone = COALESCE(${payload.phone || null}, phone),
            last_login_at = now()
          WHERE id = ${userId}
        `;
      } else {
        const inserted = await sql`
          INSERT INTO users (login_source, devonix_user_id, first_name, last_name, email, phone, last_login_at)
          VALUES ('devonix', ${payload.userId}, ${payload.firstName || null}, ${payload.lastName || null}, ${payload.email || null}, ${payload.phone || null}, now())
          RETURNING id
        `;
        userId = inserted[0].id;
      }
    }

    setSessionCookie(res, userId);
    return res.redirect(302, '/index.html');
  } catch (err) {
    console.error(err);
    return res.status(500).send('সার্ভার এরর, পরে আবার চেষ্টা করুন');
  }
}
