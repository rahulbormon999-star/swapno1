import { sql } from '../lib/db.js';
import { getUserIdFromRequest, signSsoToken } from '../lib/auth.js';

// ================= redirect_uri কে exact origin match দিয়ে যাচাই করা =================
// আগে এখানে `redirectUri.startsWith(origin)` ব্যবহার করা হতো, যেটার একটা গুরুতর সমস্যা ছিল:
// allowedOrigins এ "https://dreamlens.com" থাকলে "https://dreamlens.com.attacker.com/steal"
// ও pass করে যেত, কারণ সেটাও একই স্ট্রিং দিয়ে শুরু। এখন URL parse করে শুধু আসল origin
// (protocol + host + port) টুকু allowlist এর সাথে হুবহু মেলানো হচ্ছে।
function isAllowedRedirect(redirectUri, allowedOrigins) {
  try {
    const url = new URL(redirectUri);
    return allowedOrigins.includes(url.origin);
  } catch {
    return false; // ভুল ফরম্যাটের URL হলে reject
  }
}

export default async function handler(req, res) {
  const userId = getUserIdFromRequest(req);

  // ================= SSO মোড: Dream Lens এর মতো পার্টনার অ্যাপে সাইন করা টোকেন পাঠানো =================
  if (req.query.mode === 'sso') {
    const redirectUri = req.query.redirect_uri;
    const allowedOrigins = (process.env.SSO_ALLOWED_REDIRECT_ORIGINS || '')
      .split(',').map(s => s.trim()).filter(Boolean);

    if (!redirectUri || !isAllowedRedirect(redirectUri, allowedOrigins)) {
      return res.status(400).json({
        error: `অনুমোদিত না এমন redirect_uri: "${redirectUri}" — এটা SSO_ALLOWED_REDIRECT_ORIGINS এর সাথে মিলছে না`
      });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Not logged in' });
    }

    try {
      const rows = await sql`
        SELECT id, first_name, last_name, email, phone, banned, suspended_until
        FROM users WHERE id = ${userId}
      `;
      if (rows.length === 0) return res.status(401).json({ error: 'অ্যাকাউন্ট আর নেই' });

      const user = rows[0];
      if (user.banned) return res.status(403).json({ error: 'আপনার একাউন্ট ব্যান করা হয়েছে' });
      if (user.suspended_until && new Date(user.suspended_until) > new Date()) {
        return res.status(403).json({ error: 'আপনার একাউন্ট সাময়িকভাবে স্থগিত করা হয়েছে' });
      }

      const token = signSsoToken(user);
      const finalUrl = `${redirectUri}${redirectUri.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
      return res.status(200).json({ redirect: finalUrl });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'সার্ভার এরর' });
    }
  }

  // ================= স্বাভাবিক /api/me আচরণ (অপরিবর্তিত) =================
  if (!userId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const rows = await sql`
      SELECT id, first_name, last_name, gender, dob, country, phone, email, profile_picture, banned, suspended_until
      FROM users WHERE id = ${userId}
    `;

    if (rows.length === 0) {
      return res.status(401).json({ error: 'অ্যাকাউন্ট আর নেই' });
    }

    if (rows[0].banned) {
      return res.status(403).json({ error: 'আপনার একাউন্ট ব্যান করা হয়েছে' });
    }

    if (rows[0].suspended_until && new Date(rows[0].suspended_until) > new Date()) {
      return res.status(403).json({ error: 'আপনার একাউন্ট সাময়িকভাবে স্থগিত করা হয়েছে' });
    }

    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'সার্ভার এরর' });
  }
  }
