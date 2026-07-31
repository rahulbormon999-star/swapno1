import { sql } from '../lib/db.js';
import { getUserIdFromRequest } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'লগইন করুন' });

  try {
    const { messageId, feedback } = req.body || {};

    if (!messageId || !['up', 'down', null].includes(feedback)) {
      return res.status(400).json({ error: 'সঠিক messageId ও feedback প্রয়োজন' });
    }

    // নিজের একাউন্টের মেসেজেই feedback দিতে পারবে, অন্যেরটায় না
    const rows = await sql`
      SELECT id FROM dream_messages WHERE id = ${messageId} AND user_id = ${userId} AND role = 'ai'
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'মেসেজ পাওয়া যায়নি' });
    }

    await sql`UPDATE dream_messages SET feedback = ${feedback} WHERE id = ${messageId}`;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'সার্ভার এরর' });
  }
}
