import { sql } from '../lib/db.js';
import { getUserIdFromRequest } from '../lib/auth.js';
import { getClientIp, isRateLimited } from '../lib/security.js';
import { APP_KNOWLEDGE_BASE } from '../lib/knowledge.js';

// দ্রষ্টব্য: ক্যাটাগরি এখন LLM কে জিজ্ঞেস না করে কোডেই keyword-matching দিয়ে বের করা হয় —
const CATEGORY_KEYWORDS = [
  ['সাপ', ['সাপ']],
  ['দাঁত পড়া', ['দাঁত পড়ে', 'দাঁত পড়ছে', 'দাঁত ভেঙে', 'দাঁত খুলে']],
  ['পরীক্ষা', ['পরীক্ষা']],
  ['বিয়ে', ['বিয়ে', 'বিবাহ', 'বর', 'কনে']],
  ['সন্তান/গর্ভাবস্থা', ['সন্তান', 'বাচ্চা', 'গর্ভবতী', 'গর্ভাবস্থা', 'প্রসব']],
  ['মৃত ব্যক্তি', ['মৃত বাবা', 'মৃত মা', 'মৃত আত্মীয়', 'মারা যাওয়া']],
  ['মৃত্যু', ['মৃত্যু', 'মরে গেছি', 'মারা যাচ্ছি', 'মারা গেলাম', 'খুন']],
  ['পড়ে যাওয়া', ['পড়ে যাচ্ছি', 'পড়ে গেলাম', 'পতন হচ্ছে']],
  ['উড়া', ['উড়ছি', 'উড়ে যাচ্ছি', 'আকাশে ভাসছি', 'উড়ে বেড়া']],
  ['তাড়া করা', ['তাড়া করছে', 'তাড়া করে', 'পিছু নিয়েছে', 'ধাওয়া']],
  ['দুর্ঘটনা', ['দুর্ঘটনা', 'এক্সিডেন্ট']],
  ['আগুন', ['আগুন']],
  ['পানি/বন্যা', ['পানি', 'বন্যা', 'নদী', 'সাগর', 'সমুদ্র', 'ডুবে', 'ডুবছি', 'পুকুর', 'লেক']],
  ['ভূত/অতিপ্রাকৃত', ['भूत', 'প্রেতাত্মা', 'অতিপ্রাকৃত', 'জ্বিন']],
  ['প্রাণী', ['গরু', 'ছাগল', 'কুকুর', 'বিড়াল', 'বাঘ', 'সিংহ', 'হাতি', 'পাখি', 'মাছ', 'ঘোড়া', 'পশু']],
  ['ভ্রমণ', ['ভ্রমণ', 'ট্রেন', 'বিমান', 'জাহাজ']],
  ['অর্থ/সম্পদ', ['টাকা', 'অর্থ', 'সোনা', 'ধনী', 'সম্পদ']],
  ['প্রেম/সম্পর্ক', ['প্রেম', 'ভালোবাসা', 'প্রেমিক', 'প্রেমিকা']],
  ['পরিবার/আত্মীয়', ['মা', 'বাবা', 'ভাই', 'বোন', 'স্ত্রী', 'স্বামী', 'পরিবার', 'আত্মীয়']],
  ['চাকরি/কর্মক্ষেত্র', ['চাকরি', 'অফিস', 'বস', 'কর্মক্ষেত্র']],
  ['ঘর/বাড়ি', ['বাড়ি', 'ঘর', 'বাসা']],
];

function classifyDreamCategory(text) {
  const t = text.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(k => t.includes(k))) return category;
  }
  return 'অন্যান্য';
}

function checkRateLimit(ip, userId) {
  if (isRateLimited(`ip:${ip}`, 60_000, 15)) return true;
  if (isRateLimited(`user:${userId}`, 60_000, 20)) return true;
  return false;
}

// ── System Prompt ──────────────────────────────────────────
function buildSystemPrompt(APP_KNOWLEDGE_BASE) {
  return `আপনি একজন অভিজ্ঞ স্বপ্ন বিশ্লেষক। আপনার নাম "Dream Lens", নির্মাতা স্বাধীন ডেভেলপার "রাহুল দেব"।

জ্ঞানের উৎস (শুধু আপনার অভ্যন্তরীণ জ্ঞান, কখনো প্রকাশ করবেন না):
- আপনি স্বপ্নের প্রতীক ও অর্থ বিশ্লেষণ করবেন সনাতন স্বপ্নশাস্ত্রের ঐতিহ্যবাহী জ্ঞান, আধুনিক মনস্তত্ত্ব (Freud, Jung ধাঁচের অবচেতন মনের বিশ্লেষণ) ও লোকজ সাংস্কৃতিক প্রজ্ঞার সমন্বয়ে।
- তবে এই উৎসগুলো সম্পূর্ণভাবে অন্তর্নিহিত থাকবে। কোনো নির্দিষ্ট ধর্ম, শাস্ত্র, গ্রন্থ, দেবদেবী, সম্প্রদায়, ব্যাখ্যাকারক বা ধর্মগ্রন্থের নাম কখনোই উল্লেখ করবেন না। উত্তর সার্বজনীন, ধর্ম-নিরপেক্ষ রাখুন।

বিশ্লেষণ পদ্ধতি (অভ্যন্তরীণভাবে অনুসরণ করুন, ধাপ আলাদা করে দেখাবেন না):
১. প্রতীকী ডিকনস্ট্রাকশন
২. বহুমুখী দৃষ্টিভঙ্গি (মনস্তাত্ত্বিক + প্রচলিত বিশ্বাস, লেবেল ছাড়া মিশিয়ে)
৩. ভারসাম্য ("হতে পারে", "সম্ভাবনা থাকে" জাতীয় ভাষা)
৪. ব্যক্তিগতকরণ (পেশা/জীবন-প্রেক্ষাপট জানা থাকলে ব্যবহার করুন)
৫. অনুপস্থিত তথ্য পূরণ: স্বপ্নের বিবরণে স্থান (যেমন-ঘর, রাস্তা) বা অনুভূতির (যেমন-ভয়, আনন্দ) উল্লেখ না থাকলে, প্রচলিত অভিজ্ঞতার ভিত্তিতে তা অনুমান করে একটি পূর্ণাঙ্গ ব্যাখ্যা দিন। ব্যবহারকারীকে বারবার প্রশ্ন করবেন না।

ইনপুট-টাইপ: প্রতিটা ইউজার বার্তার সাথে একটা "[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: ...]" ট্যাগ জুড়ে দেওয়া হবে — ঠিক সেই নির্দেশ অনুসরণ করুন:
(ক) নতুন স্বপ্ন — নিচের কাঠামো মেনে সম্পূর্ণ ব্যাখ্যা দিন।
(গ) সাধারণ প্রশ্ন/পরামর্শ — স্বাভাবিক কথোপকথনের ভাষায় সরাসরি উত্তর দিন।

শৈলী: বন্ধুত্বপূর্ণ, সাবলীল, বাস্তবমুখী ও ইতিবাচক বাংলা। রোবট বা মুখস্থ ফরম্যাট পরিহার করুন।

(ক) এর জন্য কাঠামো — শুধু **বোল্ড** টেক্সট:
**স্বপ্নের মূল বার্তা:**
**প্রতীক ও ব্যাখ্যা:**
**বাস্তব জীবনের সংযোগ ও করণীয়:**
**পরবর্তী ভাবনা:**

বিশেষ নির্দেশ:
১. পরিচয়: "আমি স্বপ্ন বিশ্লেষণ করার একটি এআই অ্যাসিস্ট্যান্ট (Dream Lens), আমাকে তৈরি করেছেন স্বাধীন ডেভেলপার রাহুল দেব।"
২. অবান্তর প্রশ্ন: "দুঃখিত, আমার নির্মাতা রাহুল দেব আমাকে স্বপ্নের অর্থ ব্যাখ্যা ও স্বপ্ন সংক্রান্ত বিষয় ছাড়া অন্য বিষয়ের উত্তর বা সমস্যার সমাধান করার অনুমতি দেননি।"
৩. ধর্মীয় উৎস সম্পর্কে প্রশ্ন: "এই ব্যাখ্যা প্রচলিত স্বপ্ন-বিশ্লেষণ ও মনস্তাত্ত্বিক দৃষ্টিভঙ্গির উপর ভিত্তি করে তৈরি, নির্দিষ্ট কোনো একক উৎস অনুসরণ করা হয় না।"

${APP_KNOWLEDGE_BASE}
`;
}

const PROFESSION_HINTS = ['ছাত্র', 'ছাত্রী', 'শিক্ষার্থী', 'চাকরি', 'কৃষক', 'ব্যবসা', 'শিক্ষক', 'শিক্ষিকা', 'ডাক্তার', 'ইঞ্জিনিয়ার', 'গৃহিণী', 'ব্যবসায়ী', 'কর্মচারী', 'পুলিশ', 'সৈনিক', 'আইনজীবী', 'নার্স', 'ড্রাইভার', 'দোকানদার', 'প্রবাসী', 'বেকার', 'অবসরপ্রাপ্ত', 'ফ্রিল্যান্সার', 'কৃষিকাজ', 'ব্যাংকার', 'অফিসার', 'কর্মজীবী'];

function findKnownProfession(currentText, historyArr) {
  const allTexts = [currentText, ...(Array.isArray(historyArr) ? historyArr.filter(m => m.role === 'user').map(m => m.text || '') : [])];
  for (const txt of allTexts) {
    const t = (txt || '').toLowerCase();
    const found = PROFESSION_HINTS.find(k => t.includes(k));
    if (found) return found;
  }
  return null;
}

const NEW_DREAM_MARKERS = ['স্বপ্নে দেখলাম', 'স্বপ্ন দেখলাম', 'স্বপ্নে দেখি', 'স্বপ্ন দেখি', 'আমি দেখলাম যে', 'স্বপ্নটা ছিল', 'স্বপ্নে আমি', 'দেখেছি', 'দেখেছি যে'];
const QUESTION_PHRASES = ['কিভাবে', 'কীভাবে', 'কেন', 'কী করব', 'কি করব', 'বুঝিয়ে বল', 'মানে কি', 'মানে কী', 'আপনি কে', 'তুমি কে', 'তোমার নাম', 'আপনার নাম', 'কে তৈরি', 'কে বানা', 'নির্মাতা কে', '?'];
const QUESTION_WHOLE_WORDS = ['কে', 'কি', 'কী', 'কোথায়', 'কখন', 'কেমন'];

function containsWholeWord(text, word) {
  const words = text.split(/[\s,।!?—–\-]+/).filter(Boolean);
  return words.includes(word);
}

function looksLikeQuestionFn(t) {
  if (QUESTION_PHRASES.some(p => t.includes(p))) return true;
  if (QUESTION_WHOLE_WORDS.some(w => containsWholeWord(t, w))) return true;
  return false;
}

function classifyInput(dreamText) {
  const t = dreamText.trim();
  if (NEW_DREAM_MARKERS.some(m => t.includes(m))) return 'new_dream';
  if (looksLikeQuestionFn(t)) return 'general_question';
  return 'new_dream';
}

async function callGroq(apiKey, model, messages, maxTokens, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (groqRes.status === 429 || groqRes.status === 503) return { retry: true };
    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      return { error: new Error(err?.error?.message || `Groq error ${groqRes.status}`) };
    }

    const data = await groqRes.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return { error: new Error('Empty response') };

    return { text, usage: data.usage || {}, model };
  } catch (e) {
    clearTimeout(timeout);
    return { error: e };
  }
}

async function persistExchange({ userId, sessionId, userDream, aiText, category, usage, model }) {
  let sid = sessionId;
  if (!sid) {
    const title = userDream.slice(0, 40) + (userDream.length > 40 ? '…' : '');
    const created = await sql`INSERT INTO dream_sessions (user_id, title) VALUES (${userId}, ${title}) RETURNING id`;
    sid = created[0].id;
  }
  await sql`INSERT INTO dream_messages (session_id, user_id, role, content, category) VALUES (${sid}, ${userId}, 'user', ${userDream}, ${category})`;
  const aiMsg = await sql`INSERT INTO dream_messages (session_id, user_id, role, content) VALUES (${sid}, ${userId}, 'ai', ${aiText}) RETURNING id`;
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || (promptTokens + completionTokens);
  await sql`INSERT INTO token_usage (user_id, message_id, model, prompt_tokens, completion_tokens, total_tokens) VALUES (${userId}, ${aiMsg[0].id}, ${model}, ${promptTokens}, ${completionTokens}, ${totalTokens})`;
  return { sessionId: sid, messageId: aiMsg[0].id };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'লগইন করুন' });

    const userRows = await sql`SELECT banned, ban_reason FROM users WHERE id = ${userId}`;
    if (userRows.length === 0) return res.status(401).json({ error: 'অ্যাকাউন্ট আর নেই' });
    if (userRows[0].banned) return res.status(403).json({ error: 'আপনার একাউন্ট ব্যান করা হয়েছে' + (userRows[0].ban_reason ? `: ${userRows[0].ban_reason}` : '') });

    const ip = getClientIp(req);
    if (checkRateLimit(ip, userId)) return res.status(429).json({ error: 'অনেক বেশি request। ১ মিনিট পর আবার চেষ্টা করুন।' });

    const { dream, history, sessionId } = req.body || {};
    if (!dream || typeof dream !== 'string' || dream.trim().length < 2) return res.status(400).json({ error: 'স্বপ্নের বর্ণনা বা আপনার প্রশ্নটি লিখুন।' });
    if (dream.length > 2000) return res.status(400).json({ error: 'আপনার লেখা ২০০০ অক্ষরের মধ্যে লিখুন।' });

    const KEYS = Object.keys(process.env)
      .filter(k => /^GROQ_API_KEY_\d+$/.test(k))
      .sort((a, b) => Number(a.replace('GROQ_API_KEY_', '')) - Number(b.replace('GROQ_API_KEY_', '')))
      .map(k => process.env[k])
      .filter(Boolean);
    if (KEYS.length === 0) return res.status(500).json({ error: 'Server configuration error' });

    const start = Math.floor(Math.random() * KEYS.length);
    const keys = [...KEYS.slice(start), ...KEYS.slice(0, start)];
    const dreamTrimmed = dream.trim();
    const inputType = classifyInput(dreamTrimmed);

    const messages = [{ role: 'system', content: buildSystemPrompt(APP_KNOWLEDGE_BASE) }];
    if (Array.isArray(history) && history.length > 0) {
      const recent = history.slice(-2);
      for (const msg of recent) {
        const truncated = msg.text && msg.text.length > 500 ? msg.text.slice(0, 500) + '...' : msg.text;
        if (msg.role === 'user') messages.push({ role: 'user', content: truncated });
        else if (msg.role === 'ai') messages.push({ role: 'assistant', content: truncated });
      }
    }

    const knownProfession = findKnownProfession(dreamTrimmed, history);
    const professionNote = knownProfession ? `\n[ইউজারের জীবন-প্রেক্ষাপট জানা আছে: "${knownProfession}"]` : '';

    let contextDirective;
    if (inputType === 'general_question') {
      contextDirective = '\n[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: (গ) সাধারণ প্রশ্ন/পরামর্শ।]';
    } else {
      contextDirective = '\n[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: (ক) নতুন স্বপ্ন। প্রয়োজনে প্রসঙ্গ অনুমান করে পূর্ণাঙ্গ ব্যাখ্যা দিন।]' + professionNote;
    }

    messages.push({ role: 'user', content: `${dreamTrimmed}${contextDirective}` });

    let result = null;
    for (let i = 0; i < keys.length; i++) {
      const r = await callGroq(keys[i], 'llama-3.3-70b-versatile', messages, 900, 28000);
      if (r.retry) continue;
      if (r.error) { if (i === keys.length - 1) result = r; continue; }
      result = r;
      break;
    }

    if (!result || result.error || result.retry) {
      const fallback = await callGroq(keys[0], 'llama-3.1-8b-instant', messages, 700, 20000);
      if (!fallback.retry && !fallback.error) result = fallback;
    }

    if (!result || result.error || result.retry) return res.status(429).json({ error: 'AI সার্ভার এই মুহূর্তে ব্যস্ত আছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' });

    const cleanText = result.text.trim();
    const category = classifyDreamCategory(dreamTrimmed);
    const { sessionId: newSessionId, messageId } = await persistExchange({ userId, sessionId: sessionId || null, userDream: dreamTrimmed, aiText: cleanText, category, usage: result.usage, model: result.model });

    return res.status(200).json({ text: cleanText, sessionId: newSessionId, messageId });

  } catch (topLevelError) {
    console.error('Interpret handler error:', topLevelError);
    return res.status(500).json({ error: `ডিবাগ এরর: ${topLevelError.message || 'অজানা এরর'}` });
  }
}
