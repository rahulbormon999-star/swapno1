import { sql } from './db.js';
import { getEmbedding } from './embeddings.js';

/**
 * ইউজারের স্বপ্ন/বার্তার সাথে সবচেয়ে semantically কাছাকাছি knowledge chunk-গুলো খুঁজে বের করে।
 * একাধিক ঐতিহ্য (tradition) থেকে মিশিয়ে রিটার্ন করে, যাতে interpret.js এর AI কোনো একটাকে
 * প্রাধান্য না দিয়ে সবগুলো মিলিয়ে নিরপেক্ষভাবে সংশ্লেষণ করতে পারে।
 *
 * @param {string} dreamText
 * @param {number} limit
 * @returns {Promise<Array<{content: string, tradition: string}>>}
 */
export async function getSemanticKnowledge(dreamText, limit = 5) {
  try {
    const embedding = await getEmbedding(dreamText);
    const vectorLiteral = `[${embedding.join(',')}]`;

    const rows = await sql`
      SELECT content, tradition
      FROM knowledge_chunks
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;

    return rows;
  } catch (err) {
    // knowledge base খালি থাকলে বা embedding fail করলে চুপচাপ খালি লিস্ট রিটার্ন —
    // interpret.js এর মূল ফ্লো এর জন্য এটা কখনো ব্লকিং হওয়া উচিত না
    console.error('getSemanticKnowledge error:', err.message);
    return [];
  }
}

/**
 * রিট্রিভ করা chunk-গুলোকে interpret.js এর system prompt-এ বসানোর জন্য একটা নির্দেশনা-স্ট্রিং বানায়।
 * একাধিক ঐতিহ্যের নাম গোপন রেখে, শুধু "একাধিক ঐতিহ্যগত জ্ঞান" হিসেবে উল্লেখ করা হয়।
 */
export function buildKnowledgeDirective(chunks) {
  if (!chunks || chunks.length === 0) return '';

  const combined = chunks.map((c, i) => `[সূত্র ${i + 1}]: ${c.content}`).join('\n\n');

  return `\n[প্রেক্ষাপট তথ্য — একাধিক ঐতিহ্যগত ও মনস্তাত্ত্বিক জ্ঞানভাণ্ডার থেকে এই স্বপ্নের সাথে প্রাসঙ্গিক অংশ (নিচে একাধিক উৎস দেওয়া থাকতে পারে):\n${combined}\n\nএগুলোকে ভিত্তি/অনুপ্রেরণা হিসেবে ব্যবহার করুন, কোনোটাই হুবহু কপি করবেন না, কোনো নির্দিষ্ট উৎস/ধর্ম/গ্রন্থের নাম উল্লেখ করবেন না — সবগুলো মিলিয়ে নিজের ভাষায় একটা সুসংগত, সার্বজনীন ব্যাখ্যা তৈরি করুন।]`;
}
