export default async function handler(req, res) {
  let sql, getUserIdFromRequest;
  try {
    ({ sql } = await import('../../lib/db.js'));
    ({ getUserIdFromRequest } = await import('../../lib/auth.js'));
  } catch (importErr) {
    console.error('me.js import error:', importErr);
    return res.status(500).json({
      error: `IMPORT_ERROR: ${importErr.message}`,
      stack: (importErr.stack || '').split('\n').slice(0, 4).join(' | ')
    });
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const rows = await sql`
      SELECT id, login_source, first_name, last_name, email, phone, profile_picture,
             plan, banned, ban_reason, created_at
      FROM users WHERE id = ${userId}
    `;

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Account no longer exists' });
    }
    if (rows[0].banned) {
      return res.status(403).json({ error: 'Your account has been banned' + (rows[0].ban_reason ? `: ${rows[0].ban_reason}` : '') });
    }

    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
