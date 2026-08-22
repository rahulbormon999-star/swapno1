import { sql } from '../../lib/db.js';
import { isAdminSessionValid } from '../../lib/auth.js';
import { getClientIp } from '../../lib/security.js';

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export default async function handler(req, res) {
  if (!isAdminSessionValid(req)) {
    return res.status(401).json({ error: 'Admin session invalid, please login again' });
  }

  if (req.method === 'GET') {
    try {
      // ================= একজন ইউজারের সম্পূর্ণ ডিটেইল ("Open" ভিউ, আগে user-detail.js এ ছিল) =================
      if (req.query.id) {
        const userRows = await sql`
          SELECT id, login_source, first_name, last_name, email, phone, profile_picture,
                 plan, banned, ban_reason, banned_at, suspended_until, suspend_reason, created_at, last_login_at
          FROM users WHERE id = ${req.query.id}
        `;
        if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });

        const tokenSummary = await sql`
          SELECT
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(total_tokens) FILTER (WHERE created_at > now() - interval '30 days'), 0) AS tokens_last_30_days,
            COUNT(*) AS total_requests
          FROM token_usage WHERE user_id = ${req.query.id}
        `;

        const feedbackSummary = await sql`
          SELECT
            COUNT(*) FILTER (WHERE feedback = 'up') AS up_count,
            COUNT(*) FILTER (WHERE feedback = 'down') AS down_count
          FROM dream_messages WHERE user_id = ${req.query.id} AND role = 'ai'
        `;

        const topCategories = await sql`
          SELECT category, COUNT(*) AS count
          FROM dream_messages
          WHERE user_id = ${req.query.id} AND role = 'user' AND category IS NOT NULL
          GROUP BY category ORDER BY count DESC LIMIT 10
        `;

        return res.status(200).json({
          user: userRows[0],
          tokenSummary: tokenSummary[0],
          feedbackSummary: feedbackSummary[0],
          topCategories
        });
      }

      // ================= CSV Export =================
      if (req.query.export === 'csv') {
        const search = (req.query.search || '').trim();
        const pattern = `%${search}%`;

        const rows = await sql`
          SELECT id, first_name, last_name, email, login_source, plan, created_at, banned
          FROM users
          WHERE (${search} = '' OR first_name ILIKE ${pattern} OR last_name ILIKE ${pattern} OR email ILIKE ${pattern})
          ORDER BY created_at DESC LIMIT 5000
        `;

        const header = ['ID', 'First Name', 'Last Name', 'Email', 'Login Source', 'Plan', 'Registered At', 'Banned'];
        const lines = [header.join(',')];
        for (const u of rows) {
          lines.push([
            u.id, toCsvValue(u.first_name), toCsvValue(u.last_name), toCsvValue(u.email),
            u.login_source, u.plan, new Date(u.created_at).toISOString(), u.banned
          ].join(','));
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="pravax-users.csv"');
        return res.status(200).send(lines.join('\n'));
      }

      // ================= ডিফল্ট: পেজ-ভিত্তিক ইউজার তালিকা =================
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
      const offset = (page - 1) * limit;
      const search = (req.query.search || '').trim();
      const pattern = `%${search}%`;
      const source = (req.query.source || 'all').toLowerCase();
      const bannedFilter = (req.query.banned || 'any').toLowerCase();

      const countRows = await sql`
        SELECT COUNT(*) FROM users
        WHERE
          (${search} = '' OR first_name ILIKE ${pattern} OR last_name ILIKE ${pattern} OR email ILIKE ${pattern})
          AND (${source} = 'all' OR login_source = ${source})
          AND (
            ${bannedFilter} = 'any'
            OR (${bannedFilter} = 'true' AND banned = true)
            OR (${bannedFilter} = 'false' AND banned = false)
          )
      `;
      const total = Number(countRows[0].count);

      const rows = await sql`
        SELECT u.id, u.first_name, u.last_name, u.email, u.login_source, u.plan, u.profile_picture,
               u.banned, u.ban_reason, u.banned_at, u.suspended_until, u.suspend_reason, u.created_at,
               (SELECT COUNT(*) FROM dream_sessions WHERE user_id = u.id) AS session_count,
               COALESCE((SELECT SUM(total_tokens) FROM token_usage WHERE user_id = u.id), 0) AS total_tokens
        FROM users u
        WHERE
          (${search} = '' OR first_name ILIKE ${pattern} OR last_name ILIKE ${pattern} OR email ILIKE ${pattern})
          AND (${source} = 'all' OR login_source = ${source})
          AND (
            ${bannedFilter} = 'any'
            OR (${bannedFilter} = 'true' AND banned = true)
            OR (${bannedFilter} = 'false' AND banned = false)
          )
        ORDER BY u.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return res.status(200).json({
        users: rows,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit))
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // ================= POST: ban / unban / suspend / unsuspend / delete (একক বা bulk) =================
  if (req.method === 'POST') {
    try {
      const { id, ids, action, reason, months, days, hours, minutes } = req.body || {};
      const targetIds = Array.isArray(ids) && ids.length > 0 ? ids : (id ? [id] : []);

      if (targetIds.length === 0 || !['delete', 'ban', 'unban', 'suspend', 'unsuspend'].includes(action)) {
        return res.status(400).json({ error: 'Valid id/ids and action are required' });
      }

      const ip = getClientIp(req);

      // ================= সাসপেন্ডের সময় হিসাব — মাস+দিন+ঘণ্টা+মিনিট মিলিয়ে =================
      let intervalStr = null;
      if (action === 'suspend') {
        const mo = Math.max(0, parseInt(months) || 0);
        const d = Math.max(0, parseInt(days) || 0);
        const h = Math.max(0, parseInt(hours) || 0);
        const mi = Math.max(0, parseInt(minutes) || 0);
        if (mo === 0 && d === 0 && h === 0 && mi === 0) {
          return res.status(400).json({ error: 'কমপক্ষে মাস/দিন/ঘণ্টা/মিনিটের একটা মান দিতে হবে' });
        }
        intervalStr = `${mo} months ${d} days ${h} hours ${mi} minutes`;
      }

      for (const targetId of targetIds) {
        if (action === 'delete') {
          await sql`DELETE FROM users WHERE id = ${targetId}`;
          await sql`INSERT INTO audit_log (action, target_user_id, ip) VALUES ('delete_user', ${targetId}, ${ip})`;
        } else if (action === 'ban') {
          await sql`UPDATE users SET banned = TRUE, ban_reason = ${reason || null}, banned_at = now() WHERE id = ${targetId}`;
          await sql`INSERT INTO audit_log (action, target_user_id, ip) VALUES ('ban_user', ${targetId}, ${ip})`;
        } else if (action === 'unban') {
          await sql`UPDATE users SET banned = FALSE, ban_reason = NULL, banned_at = NULL WHERE id = ${targetId}`;
          await sql`INSERT INTO audit_log (action, target_user_id, ip) VALUES ('unban_user', ${targetId}, ${ip})`;
        } else if (action === 'suspend') {
          await sql`
            UPDATE users
            SET suspended_until = now() + ${intervalStr}::interval, suspend_reason = ${reason || null}
            WHERE id = ${targetId}
          `;
          await sql`INSERT INTO audit_log (action, target_user_id, ip) VALUES ('suspend_user', ${targetId}, ${ip})`;
        } else if (action === 'unsuspend') {
          await sql`UPDATE users SET suspended_until = NULL, suspend_reason = NULL WHERE id = ${targetId}`;
          await sql`INSERT INTO audit_log (action, target_user_id, ip) VALUES ('unsuspend_user', ${targetId}, ${ip})`;
        }
      }

      return res.status(200).json({ success: true, count: targetIds.length });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
    }
