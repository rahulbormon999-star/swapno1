// ================= OpenRouter Embeddings হেল্পার =================
// Knowledge base ingestion ও semantic search — দুই জায়গাতেই ব্যবহার হয়

const EMBEDDING_MODEL = 'openai/text-embedding-3-small'; // 1536 dimensions
const EMBEDDING_URL = 'https://openrouter.ai/api/v1/embeddings';

function loadOpenRouterKeys() {
  return Object.keys(process.env)
    .filter(k => /^OPENROUTER_API_KEY_\d+$/.test(k))
    .sort((a, b) => Number(a.replace('OPENROUTER_API_KEY_', '')) - Number(b.replace('OPENROUTER_API_KEY_', '')))
    .map(k => process.env[k])
    .filter(Boolean);
}

/**
 * একটা টেক্সটের জন্য embedding vector তৈরি করে।
 * @param {string} text
 * @returns {Promise<number[]>} 1536-dimension vector
 */
export async function getEmbedding(text) {
  const keys = loadOpenRouterKeys();
  if (keys.length === 0) throw new Error('কোনো OPENROUTER_API_KEY_N সেট করা নেই');

  const start = Math.floor(Math.random() * keys.length);
  const rotated = [...keys.slice(start), ...keys.slice(0, start)];

  let lastError = null;
  for (const key of rotated) {
    try {
      const res = await fetch(EMBEDDING_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://swapno1.vercel.app',
          'X-Title': process.env.OPENROUTER_SITE_NAME || 'Pravax'
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: text })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        lastError = new Error(err?.error?.message || `Embedding API error ${res.status}`);
        continue;
      }

      const data = await res.json();
      const vector = data?.data?.[0]?.embedding;
      if (!vector) { lastError = new Error('Empty embedding response'); continue; }
      return vector;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('Embedding তৈরি করা যায়নি');
}

/**
 * টেক্সটকে ছোট ছোট chunk এ ভাগ করে (প্রায় ~350 শব্দ করে, অনুচ্ছেদ-সীমানা মেনে যতটা সম্ভব)
 * @param {string} text
 * @param {number} targetWords
 * @returns {string[]}
 */
export function chunkText(text, targetWords = 350) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).length;

    if (currentWords + paraWords > targetWords && current) {
      chunks.push(current.trim());
      current = '';
      currentWords = 0;
    }

    current += (current ? '\n\n' : '') + para;
    currentWords += paraWords;

    // একটা অনুচ্ছেদ নিজেই অনেক বড় হলে, সেটাকেও ভেঙে ফেলা হয়
    if (currentWords > targetWords * 1.6) {
      chunks.push(current.trim());
      current = '';
      currentWords = 0;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
        }
