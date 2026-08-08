import { verifyAdminPassword, setAdminSessionCookie, clearAdminSessionCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
  // DELETE = লগআউট (আগে আলাদা admin/logout.js ফাইলে ছিল, function-সংখ্যা কমাতে এখানে মার্জ করা হলো)
  if (req.method === 'DELETE') {
    clearAdminSessionCookie(res);
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};

  if (!verifyAdminPassword(password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  setAdminSessionCookie(res);
  return res.status(200).json({ success: true });
}
