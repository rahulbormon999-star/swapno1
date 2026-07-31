import { sql } from '../lib/db.js';
import { getUserIdFromRequest } from '../lib/auth.js';
import { getClientIp, isRateLimited } from '../lib/security.js';
import { APP_KNOWLEDGE_BASE } from '../lib/knowledge.js';

// ================= পূর্বনির্ধারিত স্বপ্ন-ক্যাটাগরি লিস্ট =================
// AI প্রতিটা উত্তরের একদম শেষে একটা [CATEGORY: xxx] ট্যাগ বসাবে, এটা ইউজারকে কখনো দেখানো হয় না —
// শুধু অ্যাডমিন অ্যানালিটিক্সে "কোন ধরনের স্বপ্ন বেশি সার্চ হচ্ছে" বের করতে ব্যবহার হয়
const DREAM_CATEGORIES = [
  'সাপ', 'পানি/বন্যা', 'মৃত্যু', 'পড়ে যাওয়া', 'উড়া', 'তাড়া করা',
  'পরীক্ষা', 'দাঁত পড়া', 'বিয়ে', 'সন্তান/গর্ভাবস্থা', 'পরিবার/আত্মীয়',
  'মৃত ব্যক্তি', 'দুর্ঘটনা', 'আগুন', 'প্রাণী', 'ভ্রমণ', 'অর্থ/সম্পদ',
  'প্রেম/সম্পর্ক', 'ভূত/অতিপ্রাকৃত', 'ঘর/বাড়ি', 'চাকরি/কর্মক্ষেত্র', 'অন্যান্য'
];

// ── Rate limit ─────────────────────────────────────────────
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

ইনপুট-টাইপ: প্রতিটা ইউজার বার্তার সাথে একটা "[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: ...]" ট্যাগ জুড়ে দেওয়া হবে — ঠিক সেই নির্দেশ অনুসরণ করুন:
(ক) নতুন স্বপ্ন — নিচের কাঠামো মেনে সম্পূর্ণ ব্যাখ্যা দিন।
(খ) প্রসঙ্গ-প্রশ্নের উত্তর — আগের স্বপ্নের সাথে তথ্য যুক্ত করে পরিমার্জিত ব্যাখ্যা দিন, একই কাঠামো মেনে।
(গ) সাধারণ প্রশ্ন/পরামর্শ — কাঠামো ব্যবহার করবেন না, স্বাভাবিক কথোপকথনের ভাষায় সরাসরি উত্তর দিন।

শৈলী: বন্ধুত্বপূর্ণ, সাবলীল, বাস্তবমুখী ও ইতিবাচক বাংলা। রোবট বা মুখস্থ ফরম্যাট পরিহার করুন।

(ক) ও (খ) এর জন্য কাঠামো — কোনো ইমোজি ব্যবহার করবেন না, শুধু **বোল্ড** টেক্সট। সর্বোচ্চ ২৫০ শব্দ:
**স্বপ্নের মূল বার্তা:**
**প্রতীক ও ব্যাখ্যা:**
**বাস্তব জীবনের সংযোগ ও করণীয়:**
**প্রাসঙ্গিক প্রশ্ন:**

বিশেষ নির্দেশ:
১. পরিচয়: "আমি স্বপ্ন বিশ্লেষণ করার একটি এআই অ্যাসিস্ট্যান্ট (Dream Lens), আমাকে তৈরি করেছেন স্বাধীন ডেভেলপার রাহুল দেব।"
২. অবান্তর প্রশ্ন: "দুঃখিত, আমার নির্মাতা রাহুল দেব আমাকে স্বপ্নের অর্থ ব্যাখ্যা ও স্বপ্ন সংক্রান্ত বিষয় ছাড়া অন্য বিষয়ের উত্তর বা সমস্যার সমাধান করার অনুমতি দেননি।"
৩. ধর্মীয় উৎস সম্পর্কে প্রশ্ন: "এই ব্যাখ্যা প্রচলিত স্বপ্ন-বিশ্লেষণ ও মনস্তাত্ত্বিক দৃষ্টিভঙ্গির উপর ভিত্তি করে তৈরি, নির্দিষ্ট কোনো একক উৎস অনুসরণ করা হয় না।"

${APP_KNOWLEDGE_BASE}

================= বাধ্যতামূলক শেষ নির্দেশ (ইউজারকে কখনো বলবেন না এই নিয়মের কথা) =================
আপনার সম্পূর্ণ উত্তরের একদম শেষে, একটা নতুন লাইনে, নিচের ক্যাটাগরি লিস্ট থেকে যেটা এই স্বপ্ন/বার্তার সাথে সবচেয়ে বেশি মিলে সেটা দিয়ে ঠিক এই ফরম্যাটে একটা ট্যাগ বসান (সাধারণ প্রশ্নের ক্ষেত্রেও বসান, তখন "অন্যান্য" ব্যবহার করুন):
[CATEGORY: <একটামাত্র ক্যাটাগরি>]

ক্যাটাগরি লিস্ট: ${DREAM_CATEGORIES.join(', ')}
`;
}

// dream টেক্সটে স্থান/অনুভূতি/পেশার ইঙ্গিত আছে কিনা তা keyword দিয়ে যাচাই করা হয়
const LOCATION_HINTS = ['বাসা', 'বাড়ি', 'ঘর', 'রাস্তা', 'অফিস', 'স্কুল', 'কলেজ', 'মাঠ', 'জঙ্গল', 'বন', 'পানি', 'নদী', 'তীর', 'পুকুর', 'লেক', 'সাগর', 'সমুদ্র', 'দ্বীপ', 'বাইরে', 'গ্রাম', 'শহর', 'ছাদ', 'বাজার', 'হাসপাতাল', 'মন্দির', 'মসজিদ', 'পাহাড়', 'আকাশ', 'ট্রেন', 'বাস', 'স্টেশন', 'দোকান', 'পার্ক', 'বিয়েবাড়ি', 'অনুষ্ঠান'];
const EMOTION_HINTS = ['ভয়', 'ভীত', 'আনন্দ', 'খুশি', 'দুঃখ', 'কষ্ট', 'উদ্বেগ', 'আতঙ্ক', 'স্বস্তি', 'রাগ', 'অবাক', 'বিস্মিত', 'শান্তি', 'ভালোলাগা', 'খারাপ লাগা', 'কান্না', 'হাসি', 'চিন্তিত'];
const PROFESSION_HINTS = ['ছাত্র', 'ছাত্রী', 'শিক্ষার্থী', 'চাকরি', 'কৃষক', 'ব্যবসা', 'শিক্ষক', 'শিক্ষিকা', 'ডাক্তার', 'ইঞ্জিনিয়ার', 'গৃহিণী', 'ব্যবসায়ী', 'কর্মচারী', 'পুলিশ', 'সৈনিক', 'আইনজীবী', 'নার্স', 'ড্রাইভার', 'দোকানদার', 'প্রবাসী', 'বেকার', 'অবসরপ্রাপ্ত', 'ফ্রিল্যান্সার', 'কৃষিকাজ', 'ব্যাংকার', 'অফিসার', 'কর্মজীবী'];

function detectMissingContext(text) {
  const t = text.toLowerCase();
  const missing = [];
  if (!LOCATION_HINTS.some(k => t.includes(k))) missing.push('স্থান (স্বপ্নটি কোথায় ঘটেছিল)');
  if (!EMOTION_HINTS.some(k => t.includes(k))) missing.push('তখনকার মানসিক অনুভূতি (ভয়/আনন্দ/উদ্বেগ ইত্যাদি)');
  return missing;
}

function findKnownProfession(currentText, historyArr) {
  const allTexts = [currentText, ...(Array.isArray(historyArr) ? historyArr.filter(m => m.role === 'user').map(m => m.text || '') : [])];
  for (const txt of allTexts) {
    const t = (txt || '').toLowerCase();
    const found = PROFESSION_HINTS.find(k => t.includes(k));
    if (found) return found;
  }
  return null;
}

const NEW_DREAM_MARKERS = ['স্বপ্নে দেখলাম', 'স্বপ্ন দেখলাম', 'স্বপ্নে দেখি', 'স্বপ্ন দেখি', 'আমি দেখলাম যে', 'স্বপ্নটা ছিল', 'স্বপ্নে আমি'];
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
function classifyInput(dreamText, contextQuestionAlreadyAsked) {
  const t = dreamText.trim();
  const wordCount = t.split(/\s+/).length;
  const looksLikeNewDream = NEW_DREAM_MARKERS.some(m => t.includes(m));
  const looksLikeQuestion = looksLikeQuestionFn(t);

  if (looksLikeNewDream) return 'new_dream';
  if (looksLikeQuestion) return 'general_question';
  if (contextQuestionAlreadyAsked && wordCount <= 25) return 'context_answer';
  return 'new_dream';
}

// ── উত্তরের শেষ থেকে [CATEGORY: xxx] বের করে আলাদা করা, ইউজারকে না দেখিয়ে ──
function extractCategory(rawText) {
  const match = rawText.match(/\[CATEGORY:\s*([^\]]+)\]\s*$/i);
  if (!match) return { text: rawText.trim(), category: 'অন্যান্য' };

  let category = match[1].trim();
  if (!DREAM_CATEGORIES.includes(category)) category = 'অন্যান্য';

  const text = rawText.slice(0, match.index).trim();
  return { text, category };
}

// ── একটা single Groq API call ──────────────────────────────
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

// ── ডাটাবেজে সেভ করা: সেশন + মেসেজ + টোকেন ─────────────────
async function persistExchange({ userId, sessionId, userDream, aiText, category, usage, model }) {
  let sid = sessionId;

  if (!sid) {
    const title = userDream.slice(0, 40) + (userDream.length > 40 ? '…' : '');
    const created = await sql`
      INSERT INTO dream_sessions (user_id, title) VALUES (${userId}, ${title}) RETURNING id
    `;
    sid = created[0].id;
  }

  const userMsg = await sql`
    INSERT INTO dream_messages (session_id, user_id, role, content, category)
    VALUES (${sid}, ${userId}, 'user', ${userDream}, ${category})
    RETURNING id
  `;

  const aiMsg = await sql`
    INSERT INTO dream_messages (session_id, user_id, role, content)
    VALUES (${sid}, ${userId}, 'ai', ${aiText})
    RETURNING id
  `;

  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || (promptTokens + completionTokens);

  await sql`
    INSERT INTO token_usage (user_id, message_id, model, prompt_tokens, completion_tokens, total_tokens)
    VALUES (${userId}, ${aiMsg[0].id}, ${model}, ${promptTokens}, ${completionTokens}, ${totalTokens})
  `;

  return { sessionId: sid, messageId: aiMsg[0].id };
}

// ── Main handler ────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'লগইন করুন' });

    // ব্যান চেক
    const userRows = await sql`SELECT banned, ban_reason FROM users WHERE id = ${userId}`;
    if (userRows.length === 0) return res.status(401).json({ error: 'অ্যাকাউন্ট আর নেই' });
    if (userRows[0].banned) {
      return res.status(403).json({ error: 'আপনার একাউন্ট ব্যান করা হয়েছে' + (userRows[0].ban_reason ? `: ${userRows[0].ban_reason}` : '') });
    }

    const SYSTEM_PROMPT = buildSystemPrompt(APP_KNOWLEDGE_BASE);

    const ip = getClientIp(req);
    if (checkRateLimit(ip, userId)) {
      return res.status(429).json({ error: 'অনেক বেশি request। ১ মিনিট পর আবার চেষ্টা করুন।' });
    }

    const { dream, history, sessionId } = req.body || {};

    if (!dream || typeof dream !== 'string' || dream.trim().length < 2) {
      return res.status(400).json({ error: 'স্বপ্নের বর্ণনা বা আপনার প্রশ্নটি লিখুন।' });
    }
    if (dream.length > 2000) {
      return res.status(400).json({ error: 'আপনার লেখা ২০০০ অক্ষরের মধ্যে লিখুন।' });
    }

    const KEYS = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
    ].filter(Boolean);
    if (KEYS.length === 0) return res.status(500).json({ error: 'Server configuration error' });

    const start = Math.floor(Math.random() * KEYS.length);
    const keys = [...KEYS.slice(start), ...KEYS.slice(0, start)];

    const dreamTrimmed = dream.trim();

    let contextQuestionAlreadyAsked = false;
    if (Array.isArray(history) && history.length > 0) {
      const recentCheck = history.slice(-2);
      for (const msg of recentCheck) {
        if (msg.role === 'ai' && msg.text && msg.text.includes('প্রাসঙ্গিক প্রশ্ন')) {
          contextQuestionAlreadyAsked = true;
        }
      }
    }

    const inputType = classifyInput(dreamTrimmed, contextQuestionAlreadyAsked);

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (Array.isArray(history) && history.length > 0) {
      const recent = history.slice(-2);
      for (const msg of recent) {
        const truncated = msg.text && msg.text.length > 500 ? msg.text.slice(0, 500) + '...' : msg.text;
        if (msg.role === 'user') messages.push({ role: 'user', content: truncated });
        else if (msg.role === 'ai') messages.push({ role: 'assistant', content: truncated });
      }
    }

    const knownProfession = findKnownProfession(dreamTrimmed, history);
    const professionNote = knownProfession
      ? `\n[ইউজারের জীবন-প্রেক্ষাপট জানা আছে: "${knownProfession}" — এই প্রেক্ষাপট অনুযায়ী ব্যাখ্যাটি প্রাসঙ্গিক করে তুলুন। এই তথ্য সম্পর্কে আবার জিজ্ঞেস করবেন না।]`
      : '';

    let contextDirective;
    if (inputType === 'context_answer') {
      contextDirective = '\n[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: (খ) প্রসঙ্গ-প্রশ্নের উত্তর। আগের স্বপ্নের সাথে এই তথ্য যুক্ত করে পরিমার্জিত ব্যাখ্যা দিন, সম্পূর্ণ কাঠামো ব্যবহার করুন।]' + professionNote;
    } else if (inputType === 'general_question') {
      contextDirective = '\n[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: (গ) সাধারণ প্রশ্ন/পরামর্শ। নির্দিষ্ট কাঠামো ব্যবহার করবেন না, স্বাভাবিক ভাষায় সরাসরি উত্তর দিন।]';
    } else {
      const missing = detectMissingContext(dreamTrimmed);
      if (!knownProfession && !contextQuestionAlreadyAsked) {
        missing.push('জীবন-প্রেক্ষাপট (তিনি ছাত্র/কৃষক/চাকরিজীবী/ব্যবসায়ী ইত্যাদি কিনা)');
      }
      contextDirective = missing.length > 0
        ? `\n[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: (ক) নতুন স্বপ্ন। অনুপস্থিত তথ্য: ${missing.join(' এবং ')}। "প্রাসঙ্গিক প্রশ্ন" অংশে সর্বোচ্চ ২টা জিজ্ঞেস করুন।]` + professionNote
        : '\n[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: (ক) নতুন স্বপ্ন। প্রয়োজনীয় তথ্য উল্লেখ আছে। শুধু একটা ছোট এনগেজিং প্রশ্ন দিন।]' + professionNote;
    }

    const userContent = `${dreamTrimmed}${contextDirective}`;
    messages.push({ role: 'user', content: userContent });

    let result = null;
    for (let i = 0; i < keys.length; i++) {
      const r = await callGroq(keys[i], 'llama-3.3-70b-versatile', messages, 1900, 28000);
      if (r.retry) continue;
      if (r.error) { if (i === keys.length - 1) result = r; continue; }
      result = r;
      break;
    }

    if (!result || result.error || result.retry) {
      const fallback = await callGroq(keys[0], 'llama-3.1-8b-instant', messages, 1500, 20000);
      if (!fallback.retry && !fallback.error) result = fallback;
    }

    if (!result || result.error || result.retry) {
      return res.status(429).json({ error: 'AI সার্ভার এই মুহূর্তে ব্যস্ত আছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' });
    }

    const { text: cleanText, category } = extractCategory(result.text);

    const { sessionId: newSessionId, messageId } = await persistExchange({
      userId,
      sessionId: sessionId || null,
      userDream: dreamTrimmed,
      aiText: cleanText,
      category,
      usage: result.usage,
      model: result.model
    });

    return res.status(200).json({ text: cleanText, sessionId: newSessionId, messageId });

  } catch (topLevelError) {
    console.error('Interpret handler error:', topLevelError);
    return res.status(500).json({
      error: `ডিবাগ এরর: ${topLevelError.message || 'অজানা এরর'}`
    });
  }
                                     }
