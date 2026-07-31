import { sql } from '../../lib/db.js';
import { isAdminSessionValid } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!isAdminSessionValid(req)) {
    return res.status(401).json({ error: 'Admin session invalid, please login again' });
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ================= মূল টোটাল কার্ড =================
    const totals = await sql`
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE login_source = 'devonix') AS users_via_devonix,
        COUNT(*) FILTER (WHERE login_source = 'email') AS users_via_email,
        COUNT(*) FILTER (WHERE banned = true) AS banned_users,
        COUNT(*) FILTER (WHERE created_at > now() - interval '1 day') AS new_today,
        COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS new_last_7_days,
        COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') AS new_last_30_days
      FROM users
    `;

    const tokenTotals = await sql`
      SELECT
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(SUM(total_tokens) FILTER (WHERE created_at > now() - interval '1 day'), 0) AS tokens_today,
        COALESCE(SUM(total_tokens) FILTER (WHERE created_at > now() - interval '30 days'), 0) AS tokens_last_30_days,
        COUNT(*) AS total_requests
      FROM token_usage
    `;

    const feedbackTotals = await sql`
      SELECT
        COUNT(*) FILTER (WHERE feedback = 'up') AS total_up,
        COUNT(*) FILTER (WHERE feedback = 'down') AS total_down,
        COUNT(*) FILTER (WHERE feedback = 'up' AND created_at > now() - interval '1 day') AS up_today,
        COUNT(*) FILTER (WHERE feedback = 'down' AND created_at > now() - interval '1 day') AS down_today,
        COUNT(*) FILTER (WHERE feedback = 'up' AND created_at > now() - interval '30 days') AS up_last_30_days,
        COUNT(*) FILTER (WHERE feedback = 'down' AND created_at > now() - interval '30 days') AS down_last_30_days
      FROM dream_messages
      WHERE role = 'ai'
    `;

    // ================= দৈনিক গ্রাফ (গত ৩০ দিন) =================
    const dailyUsers = await sql`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM users
      WHERE created_at > now() - interval '30 days'
      GROUP BY DATE(created_at) ORDER BY day ASC
    `;

    const dailyTokens = await sql`
      SELECT DATE(created_at) AS day, COALESCE(SUM(total_tokens), 0) AS count
      FROM token_usage
      WHERE created_at > now() - interval '30 days'
      GROUP BY DATE(created_at) ORDER BY day ASC
    `;

    const dailyFeedback = await sql`
      SELECT DATE(created_at) AS day,
             COUNT(*) FILTER (WHERE feedback = 'up') AS up,
             COUNT(*) FILTER (WHERE feedback = 'down') AS down
      FROM dream_messages
      WHERE role = 'ai' AND created_at > now() - interval '30 days' AND feedback IS NOT NULL
      GROUP BY DATE(created_at) ORDER BY day ASC
    `;

    // ================= মাসিক গ্রাফ (গত ১২ মাস) =================
    const monthlyUsers = await sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(*) AS count
      FROM users
      WHERE created_at > now() - interval '12 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month ASC
    `;

    const monthlyTokens = await sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COALESCE(SUM(total_tokens), 0) AS count
      FROM token_usage
      WHERE created_at > now() - interval '12 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month ASC
    `;

    // ================= স্বপ্ন ক্যাটাগরি (মোট + দৈনিক টপ, RAG প্রায়োরিটাইজেশনের জন্য) =================
    const topCategories = await sql`
      SELECT category, COUNT(*) AS count
      FROM dream_messages
      WHERE role = 'user' AND category IS NOT NULL
      GROUP BY category ORDER BY count DESC LIMIT 20
    `;

    const categoriesLast30Days = await sql`
      SELECT category, COUNT(*) AS count
      FROM dream_messages
      WHERE role = 'user' AND category IS NOT NULL AND created_at > now() - interval '30 days'
      GROUP BY category ORDER BY count DESC LIMIT 20
    `;

    return res.status(200).json({
      totals: totals[0],
      tokenTotals: tokenTotals[0],
      feedbackTotals: feedbackTotals[0],
      dailyUsers,
      dailyTokens,
      dailyFeedback,
      monthlyUsers,
      monthlyTokens,
      topCategories,
      categoriesLast30Days
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'সার্ভার এরর' });
  }
}
