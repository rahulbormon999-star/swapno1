import { sql } from '../../lib/db.js';
import { isAdminSessionValid } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!isAdminSessionValid(req)) {
    return res.status(401).json({ error: 'Admin session invalid, please login again' });
  }
  if (req.method !== 'GET' && req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ================= Maintenance Mode চালু/বন্ধ করা =================
  if (req.query.view === 'maintenance') {
    try {
      if (req.method === 'POST') {
        const { enabled } = req.body || {};
        await sql`
          INSERT INTO app_settings (key, value) VALUES ('maintenance_mode', ${enabled ? 'true' : 'false'})
          ON CONFLICT (key) DO UPDATE SET value = ${enabled ? 'true' : 'false'}
        `;
        return res.status(200).json({ success: true, enabled: !!enabled });
      }
      const rows = await sql`SELECT value FROM app_settings WHERE key = 'maintenance_mode'`;
      return res.status(200).json({ enabled: rows.length > 0 && rows[0].value === 'true' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'POST') return res.status(400).json({ error: 'Unknown POST action' });

  // ================= নির্বাচিত audit log এন্ট্রি ডিলিট করা =================
  if (req.method === 'DELETE') {
    try {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array প্রয়োজন' });
      }
      const validIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
      if (validIds.length === 0) return res.status(400).json({ error: 'কোনো বৈধ id পাওয়া যায়নি' });

      const result = await sql`DELETE FROM audit_log WHERE id = ANY(${validIds}) RETURNING id`;
      return res.status(200).json({ success: true, deleted: result.length });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  try {
    // ================= Audit Log (অ্যাডমিনের কার্যক্রমের ইতিহাস) =================
    if (req.query.view === 'audit') {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = 30;
      const offset = (page - 1) * limit;

      const logs = await sql`
        SELECT a.id, a.action, a.target_user_id, a.ip, a.created_at,
               u.first_name, u.last_name, u.email
        FROM audit_log a
        LEFT JOIN users u ON u.id = a.target_user_id
        ORDER BY a.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const countRows = await sql`SELECT COUNT(*) FROM audit_log`;
      const total = Number(countRows[0].count);

      return res.status(200).json({ logs, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
    }

    // ================= ক্যাটাগরির ভেতরের entity ব্রেকডাউন (দুই-স্তরের ড্রিলডাউন) =================
    // যেমন: ?category=পশু কল করলে সেই ক্যাটাগরির ভেতরে গরু/ছাগল/বাঘ ইত্যাদি কোনটা কতবার এসেছে তা রিটার্ন করে
    if (req.query.category) {
      const entityBreakdown = await sql`
        SELECT entity, COUNT(*) AS count
        FROM dream_messages
        WHERE role = 'user' AND category = ${req.query.category} AND entity IS NOT NULL
        GROUP BY entity ORDER BY count DESC LIMIT 20
      `;
      const totalInCategory = await sql`
        SELECT COUNT(*) AS count FROM dream_messages WHERE role = 'user' AND category = ${req.query.category}
      `;
      return res.status(200).json({
        category: req.query.category,
        total: Number(totalInCategory[0].count),
        entityBreakdown
      });
    }

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

    // dream_messages এর role='user' রো ধরে গোনা হচ্ছে — নতুন সাইনআপ না, বরং কতজন ভিন্ন ইউজার সেদিন অ্যাপ ব্যবহার করেছে (DAU)
    const dailyActiveUsers = await sql`
      SELECT DATE(created_at) AS day, COUNT(DISTINCT user_id) AS count
      FROM dream_messages
      WHERE role = 'user' AND created_at > now() - interval '30 days'
      GROUP BY DATE(created_at) ORDER BY day ASC
    `;

    const dailyTokens = await sql`
      SELECT DATE(created_at) AS day, COALESCE(SUM(total_tokens), 0) AS count
      FROM token_usage
      WHERE created_at > now() - interval '30 days'
      GROUP BY DATE(created_at) ORDER BY day ASC
    `;

    // ফিডব্যাক না দেওয়া দিনও যেন বাদ না পড়ে (আগে শুধু feedback আছে এমন রো গোনা হতো), তাই role='ai' এর সব মেসেজ ধরে হিসাব করা হচ্ছে
    const dailyFeedback = await sql`
      SELECT DATE(created_at) AS day,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE feedback = 'up') AS up,
             COUNT(*) FILTER (WHERE feedback = 'down') AS down,
             COUNT(*) FILTER (WHERE feedback IS NULL) AS none
      FROM dream_messages
      WHERE role = 'ai' AND created_at > now() - interval '30 days'
      GROUP BY DATE(created_at) ORDER BY day ASC
    `;

    // ================= মাসিক গ্রাফ (গত ১২ মাস) =================
    const monthlyUsers = await sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(*) AS count
      FROM users
      WHERE created_at > now() - interval '12 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month ASC
    `;

    // মাসিক Active Users (MAU) — কতজন ভিন্ন ইউজার সেই মাসে অন্তত একবার ব্যবহার করেছে
    const monthlyActiveUsers = await sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(DISTINCT user_id) AS count
      FROM dream_messages
      WHERE role = 'user' AND created_at > now() - interval '12 months'
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

    // ================= মডেল-ভিত্তিক টোকেন ব্রেকডাউন (Groq vs OpenRouter vs Synthesis খরচ বোঝার জন্য) =================
    const modelBreakdown = await sql`
      SELECT
        CASE
          WHEN model LIKE 'openrouter:%' THEN 'OpenRouter'
          WHEN model LIKE 'synthesis:%' THEN 'Synthesis'
          ELSE 'Groq'
        END AS model_group,
        COUNT(*) AS requests,
        COALESCE(SUM(total_tokens), 0) AS tokens
      FROM token_usage
      GROUP BY model_group ORDER BY tokens DESC
    `;

    return res.status(200).json({
      totals: totals[0],
      tokenTotals: tokenTotals[0],
      feedbackTotals: feedbackTotals[0],
      dailyUsers,
      dailyActiveUsers,
      dailyTokens,
      dailyFeedback,
      monthlyUsers,
      monthlyActiveUsers,
      monthlyTokens,
      topCategories,
      categoriesLast30Days,
      modelBreakdown
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
          }
