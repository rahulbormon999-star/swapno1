import { sql } from '../../lib/db.js';
import { isAdminSessionValid } from '../../lib/auth.js';
import { getEmbedding, chunkText } from '../../lib/embeddings.js';

// ⚠️ এই এন্ডপয়েন্ট একসাথে অনেকগুলো embedding কল করতে পারে (প্রতিটা chunk এর জন্য একটা),
// তাই vercel.json এ এই ফাইলের জন্যও maxDuration বাড়িয়ে রাখা দরকার (ইতিমধ্যে করা আছে ধরে নিচ্ছি)
export default async function handler(req, res) {
  if (!isAdminSessionValid(req)) return res.status(401).json({ error: 'Admin session invalid' });

  if (req.method === 'GET') {
    // ================= কী কী tradition/source এখন পর্যন্ত যোগ করা আছে তার সারাংশ =================
    try {
      const summary = await sql`
        SELECT tradition, COUNT(*) AS chunk_count, MAX(created_at) AS last_added
        FROM knowledge_chunks GROUP BY tradition ORDER BY tradition
      `;
      const total = await sql`SELECT COUNT(*) AS count FROM knowledge_chunks`;
      return res.status(200).json({ summary, total: Number(total[0].count) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error: ' + err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { tradition, sourceRef, text } = req.body || {};

      if (!tradition || typeof tradition !== 'string') {
        return res.status(400).json({ error: 'tradition (e.g. "sanatan", "islamic", "psychology") is required' });
      }
      if (!text || typeof text !== 'string' || text.trim().length < 20) {
        return res.status(400).json({ error: 'text is required (at least 20 characters)' });
      }
      if (text.length > 200_000) {
        return res.status(400).json({ error: 'Text too long for a single request — please paste in smaller batches (under ~200,000 characters)' });
      }

      const chunks = chunkText(text.trim());
      if (chunks.length === 0) {
        return res.status(400).json({ error: 'No chunks could be created from this text' });
      }

      let inserted = 0;
      const failedChunks = [];

      for (let i = 0; i < chunks.length; i++) {
        try {
          const embedding = await getEmbedding(chunks[i]);
          const vectorLiteral = `[${embedding.join(',')}]`;

          await sql`
            INSERT INTO knowledge_chunks (tradition, source_ref, content, embedding)
            VALUES (${tradition.trim()}, ${sourceRef || null}, ${chunks[i]}, ${vectorLiteral}::vector)
          `;
          inserted++;
        } catch (chunkErr) {
          console.error(`Chunk ${i} failed:`, chunkErr);
          failedChunks.push(i);
        }
      }

      return res.status(200).json({
        success: true,
        totalChunks: chunks.length,
        inserted,
        failed: failedChunks.length,
        failedIndexes: failedChunks
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error: ' + err.message });
    }
  }

  if (req.method === 'DELETE') {
    // ================= একটা tradition এর সব chunk মুছে ফেলা (ভুল ডেটা ঢুকে গেলে রিসেট করার জন্য) =================
    try {
      const { tradition } = req.body || {};
      if (!tradition) return res.status(400).json({ error: 'tradition is required' });

      const result = await sql`DELETE FROM knowledge_chunks WHERE tradition = ${tradition} RETURNING id`;
      return res.status(200).json({ success: true, deleted: result.length });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
          }
