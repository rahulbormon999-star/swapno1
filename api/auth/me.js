export default async function handler(req, res) {
  let sql, getUserIdFromRequest, clearSessionCookie;
  try {
    ({ sql } = await import('../../lib/db.js'));
    ({ getUserIdFromRequest, clearSessionCookie } = await import('../../lib/auth.js'));
  } catch (importErr) {
    console.error('me.js import error:', importErr);
    return res.status(500).json({
      error: `IMPORT_ERROR: ${importErr.message}`,
      stack: (importErr.stack || '').split('\n').slice(0, 4).join(' | ')
    });
  }

  // DELETE = লগআউট (আগে আলাদা auth/logout.js ফাইলে ছিল, function-সংখ্যা কমাতে এখানে মার্জ করা হলো)
  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    return res.status(200).json({ success: true });
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Not logged in' });

  // POST = অ্যালার্ট dismiss করা
  if (req.method === 'POST') {
    try {
      const { action, alertId } = req.body || {};
      if (action === 'dismiss_alert' && alertId) {
        await sql`
          INSERT INTO alert_dismissals (alert_id, user_id) VALUES (${alertId}, ${userId})
          ON CONFLICT (alert_id, user_id) DO NOTHING
        `;
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  try {
    const rows = await sql`
      SELECT id, login_source, first_name, last_name, email, phone, profile_picture,
             plan, banned, ban_reason, suspended_until, suspend_reason, created_at
      FROM users WHERE id = ${userId}
    `;

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Account no longer exists' });
    }
    if (rows[0].banned) {
      return res.status(403).json({ error: 'Your account has been banned' + (rows[0].ban_reason ? `: ${rows[0].ban_reason}` : '') });
    }
    if (rows[0].suspended_until && new Date(rows[0].suspended_until) > new Date()) {
      const until = new Date(rows[0].suspended_until).toLocaleString();
      return res.status(403).json({ error: `Your account is suspended until ${until}` + (rows[0].suspend_reason ? `: ${rows[0].suspend_reason}` : '') });
    }

    // এই ইউজারের জন্য প্রাসঙ্গিক (all অথবা তাকে নির্দিষ্টভাবে টার্গেট করা) ও এখনো dismiss না করা অ্যালার্ট
    const activeAlerts = await sql`
      SELECT a.id, a.message, a.created_at
      FROM admin_alerts a
      WHERE (a.target_type = 'all' OR ${userId} = ANY(a.target_user_ids))
        AND NOT EXISTS (SELECT 1 FROM alert_dismissals d WHERE d.alert_id = a.id AND d.user_id = ${userId})
      ORDER BY a.created_at DESC LIMIT 5
    `;

    return res.status(200).json({ user: rows[0], activeAlerts });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
