import { sql } from '../lib/db.js';
import { getUserIdFromRequest } from '../lib/auth.js';
import { getClientIp, isRateLimited } from '../lib/security.js';
import { APP_KNOWLEDGE_BASE } from '../lib/knowledge.js';
import { getDreamKnowledge } from '../dream/index.js';

// দ্রষ্টব্য: প্রতিটা ক্যাটাগরির নিচে যে exact keyword ম্যাচ করেছে সেটাই "entity" হিসেবে সেভ হয় —
// এতে অ্যাডমিনে দুই-স্তরের ব্রেকডাউন সম্ভব হয় (যেমন: পশু ক্যাটাগরি ক্লিক করলে গরু/ছাগল/বাঘ কোনটা কতবার এসেছে)
const CATEGORY_KEYWORDS = [
  ['সাপ', ['সাপ']],
  ['দাঁত পড়া', ['দাঁত পড়ে', 'দাঁত পড়ছে', 'দাঁত ভেঙে', 'দাঁত খুলে']],
  ['পরীক্ষা', ['পরীক্ষা']],
  ['বিয়ে', ['বিয়ে', 'বিবাহ', 'বর ', 'কনে']],
  ['সন্তান/গর্ভাবস্থা', ['সন্তান', 'বাচ্চা', 'গর্ভবতী', 'গর্ভাবস্থা', 'প্রসব']],
  ['মৃত ব্যক্তি', ['মৃত বাবা', 'মৃত মা', 'মৃত আত্মীয়', 'মারা যাওয়া']],
  ['মৃত্যু', ['মৃত্যু', 'মরে গেছি', 'মারা যাচ্ছি', 'মারা গেলাম', 'খুন']],
  ['পড়ে যাওয়া', ['পড়ে যাচ্ছি', 'পড়ে গেলাম', 'পতন হচ্ছে']],
  ['উড়া', ['উড়ছি', 'উড়ে যাচ্ছি', 'আকাশে ভাসছি', 'উড়ে বেড়া']],
  ['তাড়া করা', ['তাড়া করছে', 'তাড়া করে', 'পিছু নিয়েছে', 'ধাওয়া']],
  ['দুর্ঘটনা', ['দুর্ঘটনা', 'এক্সিডেন্ট']],
  ['আগুন', ['আগুন']],
  ['পানি/বন্যা', ['পানি', 'বন্যা', 'নদী', 'সাগর', 'সমুদ্র', 'ডুবে', 'ডুবছি', 'পুকুর', 'লেক']],
  ['ভূত/অতিপ্রাকৃত', ['ভূত', 'প্রেতাত্মা', 'অতিপ্রাকৃত', 'জ্বিন']],
  ['দেব-দেবী', ['দেবতা', 'দেবী', 'ভগবান', 'ঈশ্বর', 'আল্লাহ', 'খোদা', 'প্রভু']],
  ['রোগ', ['জ্বর', 'ক্যান্সার', 'কাশি', 'অসুস্থ', 'অসুখ', 'রোগ']],
  ['ইউনিভার্স', ['চাঁদ', 'সূর্য', 'নক্ষত্র', 'তারা', 'মহাকাশ', 'গ্রহ']],
  ['পশু', ['গরু', 'ছাগল', 'কুকুর', 'বিড়াল', 'বাঘ', 'সিংহ', 'হাতি', 'ঘোড়া', 'ভেড়া', 'বানর']],
  ['পাখি', ['কাক', 'কবুতর', 'ময়না', 'টিয়া', 'মুরগি', 'ঈগল', 'পেঁচা']],
  ['ভ্রমণ', ['ভ্রমণ', 'ট্রেন', 'বিমান', 'জাহাজ']],
  ['অর্থ/সম্পদ', ['টাকা', 'অর্থ', 'সোনা', 'ধনী', 'সম্পদ']],
  ['প্রেম/সম্পর্ক', ['প্রেম', 'ভালোবাসা', 'প্রেমিক', 'প্রেমিকা']],
  ['পরিবার/আত্মীয়', ['মা ', 'বাবা', 'ভাই', 'বোন', 'স্ত্রী', 'স্বামী', 'পরিবার', 'আত্মীয়']],
  ['চাকরি/কর্মক্ষেত্র', ['চাকরি', 'অফিস', 'বস ', 'কর্মক্ষেত্র']],
  ['ঘর/বাড়ি', ['বাড়ি', 'ঘর', 'বাসা']],
];

// ================= সাধারণ প্রশ্নের ক্যাটাগরি (dream-বহির্ভূত টপিক চেনার জন্য) =================
const GENERAL_CATEGORY_KEYWORDS = [
  ['প্রোগ্রামিং/কোডিং', ['কোড', 'কোডিং', 'প্রোগ্রামিং', 'python', 'java', 'c++', 'javascript', 'html', 'css', 'sql', 'ফাংশন', 'ভ্যারিয়েবল', 'script', 'বাগ', 'debug', 'api', 'অ্যালগরিদম', 'সফটওয়্যার', 'অ্যাপ বানা', 'ওয়েবসাইট বানা']],
  ['অনুবাদ', ['অনুবাদ', 'translate', 'ইংরেজি করো', 'বাংলা করো', 'ইংরেজিতে বলো']],
  ['পড়াশোনা/হোমওয়ার্ক', ['হোমওয়ার্ক', 'অ্যাসাইনমেন্ট', 'রচনা লেখো', 'প্রবন্ধ', 'অংক', 'ম্যাথ', 'সমাধান করো', 'পরীক্ষার প্রস্তুতি', 'সিলেবাস']],
  ['সাধারণ জ্ঞান', ['রাজধানী', 'ইতিহাস', 'বিজ্ঞান কী', 'কত সালে', 'কে আবিষ্কার', 'সংজ্ঞা কী', 'অর্থ কী']],
  ['স্বাস্থ্য পরামর্শ', ['স্বাস্থ্য', 'চিকিৎসা', 'ডাক্তার দেখা', 'ঔষধ', 'medicine', 'লক্ষণ']],
  ['জীবন/ক্যারিয়ার পরামর্শ', ['পরামর্শ দিন', 'উপদেশ', 'সাজেশন দিন', 'কী করব', 'ক্যারিয়ার', 'চাকরি খুঁজ']],
  ['পরিচয়/সম্পর্কে', ['তুমি কে', 'আপনি কে', 'তোমার নাম', 'কে বানিয়েছে', 'কে তৈরি করেছে']],
];

function classifyGeneralCategory(text) {
  for (const [category, keywords] of GENERAL_CATEGORY_KEYWORDS) {
    const matched = keywords.find(k => text.includes(k));
    if (matched) return { category, entity: matched.trim() };
  }
  return null;
}

function classifyDreamCategory(text) {
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    const matched = keywords.find(k => text.includes(k));
    if (matched) return { category, entity: matched.trim() };
  }
  const general = classifyGeneralCategory(text);
  if (general) return general;
  return { category: 'অন্যান্য', entity: null };
}
function checkRateLimit(ip, userId) {
  if (isRateLimited(`ip:${ip}`, 60_000, 15)) return true;
  if (isRateLimited(`user:${userId}`, 60_000, 20)) return true;
  return false;
}

// ── System Prompt (মূল ব্যাখ্যাকারী প্রম্পট — দুইটি মডেল একই প্রম্পট দিয়ে আলাদাভাবে চালানো হয়) ──
function buildSystemPrompt(APP_KNOWLEDGE_BASE) {
  return `আপনি "Pravax" — একজন সাধারণ-উদ্দেশ্যের AI সহায়ক, যিনি যেকোনো বিষয়ে (কোডিং, অনুবাদ, পড়াশোনা/হোমওয়ার্ক, সাধারণ জ্ঞান, পরামর্শ ইত্যাদি) সাহায্য করতে পারেন, কিন্তু স্বপ্নের অর্থ বিশ্লেষণে বিশেষভাবে দক্ষ ও গভীর। নির্মাতা স্বাধীন ডেভেলপার "রাহুল দেব"।

স্বপ্ন-বিশ্লেষণের জ্ঞানের উৎস (শুধু আপনার অভ্যন্তরীণ জ্ঞান, কখনো প্রকাশ করবেন না):
- আপনি স্বপ্নের প্রতীক ও অর্থ বিশ্লেষণ করবেন সনাতন স্বপ্নশাস্ত্রের ঐতিহ্যবাহী জ্ঞান, আধুনিক মনস্তত্ত্ব (Freud, Jung ধাঁচের অবচেতন মনের বিশ্লেষণ) ও লোকজ সাংস্কৃতিক প্রজ্ঞার সমন্বয়ে।
- তবে এই উৎসগুলো সম্পূর্ণভাবে অন্তর্নিহিত থাকবে। কোনো নির্দিষ্ট ধর্ম, শাস্ত্র, গ্রন্থ, দেবদেবী, সম্প্রদায়, ব্যাখ্যাকারক বা ধর্মগ্রন্থের নাম কখনোই উল্লেখ করবেন না। উত্তর সার্বজনীন, ধর্ম-নিরপেক্ষ রাখুন।

================= পুনরাবৃত্তি/মুখস্থ-সুরের সমস্যা এড়ানো (গুরুত্বপূর্ণ) =================
- প্রতিটা উত্তর সম্পূর্ণ নতুনভাবে, নিজের ভাষায় লিখুন। নিচে যদি কোনো "কিউরেটেড জ্ঞান" দেওয়া থাকে, সেটাকে হুবহু কপি-পেস্ট না করে শুধু একটা ভিত্তি/দিকনির্দেশনা হিসেবে ব্যবহার করুন — প্রতিটা উত্তরে ভিন্ন শব্দচয়ন, ভিন্ন বাক্যগঠন, ভিন্ন উদাহরণ ব্যবহার করুন যাতে দুইজন ভিন্ন ইউজার একই প্রতীক নিয়ে জিজ্ঞেস করলেও তারা দুটো ভিন্নভাবে-লেখা উত্তর পান (মূল অর্থ/তথ্য একই থাকলেও প্রকাশভঙ্গি আলাদা)।
- একঘেয়ে বা রোবোটিক ভাষা এড়িয়ে চলুন। প্রতিটা ব্যাখ্যা যেন মনে হয় ওই নির্দিষ্ট ইউজারের নির্দিষ্ট পরিস্থিতির জন্যই লেখা, কোনো টেমপ্লেট থেকে বসানো না।

বিশ্লেষণ পদ্ধতি (অভ্যন্তরীণভাবে অনুসরণ করুন, ধাপ আলাদা করে দেখাবেন না):
১. প্রতীকী ডিকনস্ট্রাকশন
২. বহুমুখী দৃষ্টিভঙ্গি (মনস্তাত্ত্বিক + প্রচলিত বিশ্বাস, লেবেল ছাড়া মিশিয়ে)
৩. ভারসাম্য ("হতে পারে", "সম্ভাবনা থাকে" জাতীয় ভাষা)
৪. ব্যক্তিগতকরণ (পেশা/জীবন-প্রেক্ষাপট জানা থাকলে ব্যবহার করুন)

ইনপুট-টাইপ: প্রতিটা ইউজার বার্তার সাথে একটা "[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: ...]" ট্যাগ জুড়ে দেওয়া হবে — ঠিক সেই নির্দেশ অনুসরণ করুন:
(ক) নতুন স্বপ্ন — নিচের কাঠামো মেনে সম্পূর্ণ ব্যাখ্যা দিন।
(খ) প্রসঙ্গ-প্রশ্নের উত্তর — আগের স্বপ্নের সাথে তথ্য যুক্ত করে পরিমার্জিত ব্যাখ্যা দিন, একই কাঠামো মেনে।
(গ) সাধারণ প্রশ্ন/কাজ (স্বপ্ন ছাড়া অন্য যেকোনো বিষয়: কোড, অনুবাদ, পড়াশোনা, সাধারণ জ্ঞান, পরামর্শ ইত্যাদি) — কাঠামো ব্যবহার করবেন না, বিষয় অনুযায়ী স্বাভাবিক ভাষায় (কোডের ক্ষেত্রে কোড ব্লক সহ) সরাসরি উত্তর দিন। এই ধরনের প্রশ্নে সাড়া দিতে দ্বিধা করবেন না — এটি একটি সাধারণ-উদ্দেশ্যের সহায়ক, শুধু স্বপ্ন-বিশ্লেষণ না।

================= (গ)-এর জন্য উত্তরের দৈর্ঘ্য — অত্যন্ত গুরুত্বপূর্ণ =================
- প্রশ্নের ধরন বুঝে উত্তরের আকার ঠিক করুন। ডিফল্ট আচরণ হলো সংক্ষিপ্ত, সরাসরি উত্তর — কয়েক লাইনেই যথেষ্ট হলে অহেতুক লম্বা করবেন না।
- ছোট/সাধারণ প্রশ্নে (যেমন "কেমন আছো", "১+১ কত", "এই শব্দের অর্থ কী") ১-৩ বাক্যেই উত্তর দিন।
- মাঝারি প্রশ্নে (একটা concept বোঝানো, ছোট কোড) প্রয়োজনমতো কয়েক লাইন/অনুচ্ছেদ ব্যবহার করুন, কিন্তু অপ্রয়োজনীয় ভূমিকা/উপসংহার/পুনরাবৃত্তি বাদ দিন।
- ইউজার নিজে স্পষ্টভাবে "বিস্তারিত বলো", "ব্যাখ্যা করো", "উদাহরণসহ বলো", "সব দিক থেকে বলো" ইত্যাদি না বললে দীর্ঘ রচনার মতো উত্তর দেবেন না।
- কোডের প্রশ্নে যতটুকু কোড দরকার ঠিক ততটুকুই দিন, অপ্রাসঙ্গিক ব্যাখ্যা/ভূমিকা দিয়ে ভরাট করবেন না।

শৈলী: বন্ধুত্বপূর্ণ, সাবলীল, বাস্তবমুখী ও ইতিবাচক বাংলা। রোবট বা মুখস্থ ফরম্যাট পরিহার করুন।

(ক) ও (খ) এর জন্য কাঠামো — কোনো ইমোজি ব্যবহার করবেন না, শুধু **বোল্ড** টেক্সট। সর্বোচ্চ ২৫০ শব্দ:
**স্বপ্নের মূল বার্তা:**
**প্রতীক ও ব্যাখ্যা:**
**বাস্তব জীবনের সংযোগ ও করণীয়:**
**প্রাসঙ্গিক প্রশ্ন:**

বিশেষ নির্দেশ:
১. পরিচয়: ইউজার সরাসরি জিজ্ঞেস করলে তবেই ("তুমি কে", "আপনি কে", "তোমার নাম কী", "কে বানিয়েছে" এই ধরনের প্রশ্নে) বলুন: "আমি Pravax — একটি সাধারণ-উদ্দেশ্যের এআই অ্যাসিস্ট্যান্ট, স্বপ্নের অর্থ বিশ্লেষণে বিশেষভাবে দক্ষ। আমাকে তৈরি করেছেন স্বাধীন ডেভেলপার রাহুল দেব।" — ⚠️ এই পরিচয়-বাক্যটা অন্য কোনো প্রশ্নের উত্তরের শুরুতে বা কোথাও পুনরাবৃত্তি করবেন না। পরিচয় জিজ্ঞেস না করলে সরাসরি মূল প্রশ্নের উত্তর দিয়ে শুরু করুন, কোনো ভূমিকা ছাড়াই।
২. ধর্মীয় উৎস সম্পর্কে প্রশ্ন (শুধু স্বপ্ন-বিশ্লেষণ প্রসঙ্গে): "এই ব্যাখ্যা প্রচলিত স্বপ্ন-বিশ্লেষণ ও মনস্তাত্ত্বিক দৃষ্টিভঙ্গির উপর ভিত্তি করে তৈরি, নির্দিষ্ট কোনো একক উৎস অনুসরণ করা হয় না।"
৩. সাধারণ প্রশ্নে (কোড, অনুবাদ, তথ্য ইত্যাদি) সরাসরি ও সম্পূর্ণ সাহায্য করুন — কোনো বিষয়ে "এটা আমার কাজ না" বলে এড়িয়ে যাবেন না, তবে ক্ষতিকর/অবৈধ কিছুর অনুরোধে সাধারণ বিচার-বুদ্ধি অনুযায়ী বিনয়ের সাথে না বলুন।

${APP_KNOWLEDGE_BASE}
`;
}

// ── Synthesis Prompt: দুইটি স্বাধীন মডেলের ব্যাখ্যা মিশিয়ে একটি চূড়ান্ত উত্তর তৈরি করার জন্য ──
function buildSynthesisPrompt(APP_KNOWLEDGE_BASE) {
  return `আপনি "Pravax" — একজন অভিজ্ঞ স্বপ্ন বিশ্লেষক, নির্মাতা স্বাধীন ডেভেলপার "রাহুল দেব"।

আপনাকে একই স্বপ্নের উপর দুইটি ভিন্ন AI মডেলের স্বাধীন ব্যাখ্যা দেওয়া হবে ("ব্যাখ্যা ১" ও "ব্যাখ্যা ২")। আপনার কাজ:
- দুইটি ব্যাখ্যা মনোযোগ দিয়ে পড়ুন, ওভারল্যাপ করা অন্তর্দৃষ্টি একত্র করুন এবং প্রতিটির থেকে সবচেয়ে মূল্যবান/সুনির্দিষ্ট/প্রাসঙ্গিক অংশ বেছে নিয়ে একটিমাত্র সুসংগত, স্বাভাবিক, নতুন ব্যাখ্যা লিখুন — নিজের ভাষায়, নতুনভাবে, কোনো উৎস হুবহু কপি না করে।
- দুইটি উৎস, "মডেল", "AI", "সিন্থেসিস" ইত্যাদি কোনো কিছুর উল্লেখ করবেন না — ফলাফল এমনভাবে লিখুন যেন এটি আপনার নিজস্ব একক বিশ্লেষণ।
- একই বক্তব্যের পুনরাবৃত্তি এড়িয়ে চলুন; সাংঘর্ষিক ব্যাখ্যা থাকলে যেটা প্রেক্ষাপটের সাথে বেশি প্রাসঙ্গিক মনে হয় সেটাকে প্রাধান্য দিন বা দুটোকেই "হতে পারে" ভাষায় ভারসাম্য দিয়ে উপস্থাপন করুন।
- কোনো নির্দিষ্ট ধর্ম, শাস্ত্র, গ্রন্থ, দেবদেবী, সম্প্রদায়ের নাম উল্লেখ করবেন না। উত্তর সার্বজনীন, ধর্ম-নিরপেক্ষ রাখুন।
- ইমোজি ব্যবহার করবেন না, শুধু **বোল্ড** টেক্সট। সর্বোচ্চ ২৫০ শব্দ। যদি উৎস ব্যাখ্যাগুলো নিচের কাঠামোয় থাকে, একই কাঠামো বজায় রাখুন:
**স্বপ্নের মূল বার্তা:**
**প্রতীক ও ব্যাখ্যা:**
**বাস্তব জীবনের সংযোগ ও করণীয়:**
**প্রাসঙ্গিক প্রশ্ন:**

${APP_KNOWLEDGE_BASE}
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

// কৃতজ্ঞতা/প্রশংসা/সাধারণ প্রতিক্রিয়া — এগুলো "প্রাসঙ্গিক প্রশ্নের উত্তর" (নতুন তথ্য) না, তাই আবার
// পূর্ণ স্বপ্ন-বিশ্লেষণ কাঠামোয় ফেলা ঠিক না। ছোট, স্বাভাবিক জবাব প্রাপ্য।
const ACKNOWLEDGMENT_MARKERS = [
  'ধন্যবাদ', 'thanks', 'thank you', 'thnx', 'tnx',
  'মিলে গেছে', 'মিলেছে', 'ভালো লাগলো', 'ভালো লাগছে', 'উপকার হলো', 'উপকারে আসলো',
  'সাহায্য হলো', 'কাজে লাগবে', 'কাজে দিলো', 'বুঝেছি', 'বুঝতে পেরেছি',
  'চমৎকার', 'দারুণ', 'সুন্দর হয়েছে', 'ঠিক বলেছেন', 'একদম ঠিক', 'সত্যি বলেছেন'
];

function classifyInput(dreamText, contextQuestionAlreadyAsked) {
  const t = dreamText.trim();
  const wordCount = t.split(/\s+/).length;
  const looksLikeNewDream = NEW_DREAM_MARKERS.some(m => t.includes(m));
  const looksLikeAcknowledgment = ACKNOWLEDGMENT_MARKERS.some(m => t.includes(m));

  // অ্যাপ এখন সাধারণ-উদ্দেশ্যেও ব্যবহার হয়, তাই স্পষ্ট স্বপ্ন-মার্কার না থাকলে
  // ডিফল্ট আর 'new_dream' ধরে নেওয়া ঠিক না — নাহলে কোডিং/অনুবাদের মতো
  // প্রশ্নবোধক চিহ্নহীন বার্তাও ভুলভাবে স্বপ্ন হিসেবে ট্রিট হবে।
  if (looksLikeNewDream) return 'new_dream';
  if (looksLikeAcknowledgment) return 'general_question';
  if (contextQuestionAlreadyAsked && wordCount <= 25) return 'context_answer';
  return 'general_question';
}

// ── জেনেরিক OpenAI-compatible chat completion কল (Groq ও OpenRouter দুটোতেই কাজ করে) ──
async function callChatAPI({ url, apiKey, model, messages, maxTokens, timeoutMs, extraHeaders, temperature = 0.85 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(extraHeaders || {})
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.status === 429 || res.status === 503) return { retry: true };
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: new Error(err?.error?.message || `API error ${res.status}`) };
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return { error: new Error('Empty response') };

    return { text, usage: data.usage || {}, model };
  } catch (e) {
    clearTimeout(timeout);
    return { error: e };
  }
}

// ── ENV থেকে *_1, *_2, *_3 ... প্যাটার্নে যতগুলো key সেট করা আছে সব লোড করা হয় ──
function loadKeys(prefix) {
  return Object.keys(process.env)
    .filter(k => new RegExp(`^${prefix}_\\d+$`).test(k))
    .sort((a, b) => Number(a.replace(`${prefix}_`, '')) - Number(b.replace(`${prefix}_`, '')))
    .map(k => process.env[k])
    .filter(Boolean);
}

// ── একাধিক key নিয়ে rotate করে, শেষে fallback মডেল দিয়ে চেষ্টা করে ──
async function callWithRotation({ keys, url, model, fallbackModel, messages, maxTokens, timeoutMs, extraHeaders, temperature, maxAttempts }) {
  if (!keys || keys.length === 0) return { error: new Error('no_keys_configured') };

  const start = Math.floor(Math.random() * keys.length);
  let rotated = [...keys.slice(start), ...keys.slice(0, start)];

  // ================= worst-case সময় নিয়ন্ত্রণে রাখার জন্য কতগুলো key চেষ্টা করবে তা সীমিত করা =================
  // (আগে এখানে যতগুলো key configured থাকতো ততগুলোই ধারাবাহিকভাবে পূর্ণ timeoutMs দিয়ে চেষ্টা হতো —
  // ৩টা key + fallback = worst-case ৯৫+ সেকেন্ড, যা Vercel-এর ৬০ সেকেন্ড সীমা ছাড়িয়ে HTTP 504 তৈরি করছিল)
  if (maxAttempts) rotated = rotated.slice(0, maxAttempts);

  let result = null;
  for (let i = 0; i < rotated.length; i++) {
    const r = await callChatAPI({ url, apiKey: rotated[i], model, messages, maxTokens, timeoutMs, extraHeaders, temperature });
    if (r.retry) continue;
    if (r.error) { if (i === rotated.length - 1) result = r; continue; }
    result = r;
    break;
  }

  if ((!result || result.error || result.retry) && fallbackModel) {
    const fb = await callChatAPI({
      url, apiKey: rotated[0], model: fallbackModel, messages,
      maxTokens: Math.round(maxTokens * 0.8), timeoutMs: Math.round(timeoutMs * 0.8), extraHeaders, temperature
    });
    if (!fb.retry && !fb.error) result = fb;
  }

  return result || { error: new Error('all_keys_failed') };
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function runGroq(messages, maxTokens, timeoutMs, temperature = 0.85, maxAttempts = 2) {
  return callWithRotation({
    keys: loadKeys('GROQ_API_KEY'),
    url: GROQ_URL,
    model: 'openai/gpt-oss-120b',
    fallbackModel: 'openai/gpt-oss-20b',
    messages, maxTokens, timeoutMs, temperature, maxAttempts
  });
}

function runOpenRouter(messages, maxTokens, timeoutMs, temperature = 0.85, maxAttempts = 2) {
  return callWithRotation({
    keys: loadKeys('OPENROUTER_API_KEY'),
    url: OPENROUTER_URL,
    // ⚠️ OpenRouter-এর ফ্রি মডেল লিস্ট প্রায়ই বদলায় — openrouter.ai/models দেখে ENV-এ বসান
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
    fallbackModel: process.env.OPENROUTER_MODEL_FALLBACK || 'meta-llama/llama-3.1-8b-instruct',
    messages, maxTokens, timeoutMs, temperature, maxAttempts,
    extraHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://swapno1.vercel.app',
      'X-Title': process.env.OPENROUTER_SITE_NAME || 'Pravax'
    }
  });
}

// ── ডাটাবেজে সেভ করা: সেশন + মেসেজ + প্রতিটা AI কলের টোকেন ─────────────────
async function persistExchange({ userId, sessionId, userDream, aiText, category, entity, usageEntries }) {
  let sid = sessionId;

  if (!sid) {
    // ================= স্টোরেজ ও প্রাইভেসি বাঁচাতে ইউজারের আসল লেখা সেশন-টাইটেলেও সেভ হয় না =================
    // এখন শুধু ক্যাটাগরি-ভিত্তিক জেনেরিক টাইটেল ব্যবহার হয় (যেমন "সাপ", "পশু", "অন্যান্য")
    const title = category && category !== 'অন্যান্য' ? category : 'নতুন চ্যাট';
    const created = await sql`
      INSERT INTO dream_sessions (user_id, title) VALUES (${userId}, ${title}) RETURNING id
    `;
    sid = created[0].id;
  }

  // ================= আসল প্রশ্ন/উত্তরের টেক্সট (content) সেভ হয় না — শুধু analytics-এর জন্য দরকারি =================
  // category/entity (কী ধরনের প্রশ্ন), এবং AI মেসেজের id (feedback ও token_usage-এর জন্য দরকার) রাখা হয়।
  // এতে ফ্রি-প্ল্যানের ডাটাবেজ স্টোরেজ অনেক কম লাগবে, আর ইউজারের প্রাইভেসিও ভালো থাকবে।
  await sql`
    INSERT INTO dream_messages (session_id, user_id, role, content, category, entity)
    VALUES (${sid}, ${userId}, 'user', '', ${category}, ${entity})
  `;

  const aiMsg = await sql`
    INSERT INTO dream_messages (session_id, user_id, role, content)
    VALUES (${sid}, ${userId}, 'ai', '')
    RETURNING id
  `;

  // একাধিক প্রোভাইডার কল হলে (Groq + OpenRouter + synthesis) প্রতিটার টোকেন আলাদা রো হিসেবে সেভ হয়
  for (const entry of usageEntries) {
    const usage = entry.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || (promptTokens + completionTokens);

    await sql`
      INSERT INTO token_usage (user_id, message_id, model, prompt_tokens, completion_tokens, total_tokens)
      VALUES (${userId}, ${aiMsg[0].id}, ${entry.model}, ${promptTokens}, ${completionTokens}, ${totalTokens})
    `;
  }

  return { sessionId: sid, messageId: aiMsg[0].id };
}

// ── Main handler ────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Please sign in' });

    // ব্যান/সাসপেনশন চেক
    const userRows = await sql`SELECT banned, ban_reason, suspended_until, suspend_reason FROM users WHERE id = ${userId}`;
    if (userRows.length === 0) return res.status(401).json({ error: 'Account no longer exists' });
    if (userRows[0].banned) {
      return res.status(403).json({ error: 'Your account has been banned' + (userRows[0].ban_reason ? `: ${userRows[0].ban_reason}` : '') });
    }
    if (userRows[0].suspended_until && new Date(userRows[0].suspended_until) > new Date()) {
      const until = new Date(userRows[0].suspended_until).toLocaleString();
      return res.status(403).json({ error: `Your account is suspended until ${until}` + (userRows[0].suspend_reason ? `: ${userRows[0].suspend_reason}` : '') });
    }

    // ================= Maintenance Mode চেক =================
    const maintenanceRows = await sql`SELECT value FROM app_settings WHERE key = 'maintenance_mode'`;
    if (maintenanceRows.length > 0 && maintenanceRows[0].value === 'true') {
      return res.status(503).json({ error: 'Pravax এই মুহূর্তে রক্ষণাবেক্ষণের জন্য বন্ধ আছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' });
    }

    const SYSTEM_PROMPT = buildSystemPrompt(APP_KNOWLEDGE_BASE);

    const ip = getClientIp(req);
    if (checkRateLimit(ip, userId)) {
      return res.status(429).json({ error: 'Too many requests. Please try again in 1 minute.' });
    }

    const { dream, history, sessionId } = req.body || {};

    if (!dream || typeof dream !== 'string' || dream.trim().length < 2) {
      return res.status(400).json({ error: 'Please describe your dream or write your question.' });
    }
    if (dream.length > 6000) {
      return res.status(400).json({ error: 'Please keep your text under 6000 characters.' });
    }

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

    // dream/ ফোল্ডার থেকে কিউরেটেড অর্থ খোঁজা হয় — শুধু স্বপ্ন-সম্পর্কিত টাইপের জন্য দরকার
    const { category, entity } = classifyDreamCategory(dreamTrimmed);
    const retrievedMeaning = (inputType === 'new_dream' || inputType === 'context_answer')
      ? getDreamKnowledge(category, entity)
      : null;
    // ⚠️ আগে এখানে লেখা ছিল "এর বাইরে গিয়ে নিজে থেকে ভিন্ন প্রতীকী অর্থ বানাবেন না" — এটাই
    // প্রতিটা উত্তরকে হুবহু একই বানিয়ে ফেলছিল (একই ক্যাটাগরির জন্য কিউরেটেড টেক্সট সবসময় স্থির)।
    // এখন "ভিত্তি হিসেবে ব্যবহার করুন, নিজের ভাষায় নতুনভাবে লিখুন" — অর্থ বিকৃত হবে না, কিন্তু
    // প্রতিবার একই বাক্য পুনরাবৃত্তি হবে না।
    const knowledgeDirective = retrievedMeaning
      ? `\n[প্রেক্ষাপট তথ্য — এই স্বপ্নের প্রধান প্রতীক সম্পর্কে কিউরেটেড জ্ঞান (ভিত্তি হিসেবে ব্যবহার করুন, হুবহু কপি না করে নিজের ভাষায় নতুনভাবে লিখুন): "${retrievedMeaning}" — ইউজারের নির্দিষ্ট প্রেক্ষাপটের (পেশা/অনুভূতি) সাথে মিলিয়ে এটাকে ব্যক্তিগতকরণ করুন, এবং এই কথোপকথনের জন্য একদম নতুন বাক্যে প্রকাশ করুন।]`
      : '';

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
      contextDirective = '\n[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: (খ) প্রসঙ্গ-প্রশ্নের উত্তর। আগের স্বপ্নের সাথে এই তথ্য যুক্ত করে পরিমার্জিত ব্যাখ্যা দিন, সম্পূর্ণ কাঠামো ব্যবহার করুন।]' + professionNote + knowledgeDirective;
    } else if (inputType === 'general_question') {
      contextDirective = '\n[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: (গ) সাধারণ প্রশ্ন/কাজ (স্বপ্ন ছাড়া অন্য যেকোনো বিষয়)। নির্দিষ্ট কাঠামো ব্যবহার করবেন না। প্রশ্নের আকার/জটিলতা অনুযায়ী উত্তরের দৈর্ঘ্য ঠিক করুন — ইউজার নিজে বিস্তারিত না চাইলে সংক্ষিপ্ত ও সরাসরি উত্তর দিন।]';
    } else {
      const missing = detectMissingContext(dreamTrimmed);
      if (!knownProfession && !contextQuestionAlreadyAsked) {
        missing.push('জীবন-প্রেক্ষাপট (তিনি ছাত্র/কৃষক/চাকরিজীবী/ব্যবসায়ী ইত্যাদি কিনা)');
      }
      contextDirective = missing.length > 0
        ? `\n[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: (ক) নতুন স্বপ্ন। অনুপস্থিত তথ্য: ${missing.join(' এবং ')}। "প্রাসঙ্গিক প্রশ্ন" অংশে সর্বোচ্চ ২টা জিজ্ঞেস করুন।]` + professionNote + knowledgeDirective
        : '\n[সিস্টেম-নির্ধারিত ইনপুট-টাইপ: (ক) নতুন স্বপ্ন। প্রয়োজনীয় তথ্য উল্লেখ আছে। শুধু একটা ছোট এনগেজিং প্রশ্ন দিন।]' + professionNote + knowledgeDirective;
    }

    const userContent = `${dreamTrimmed}${contextDirective}`;
    messages.push({ role: 'user', content: userContent });

    const usageEntries = [];
    let cleanText = null;

    if (inputType === 'general_question') {
      // ── সাধারণ প্রশ্ন/গল্পসল্প: দ্রুত উত্তরের জন্য শুধু Groq ব্যবহার হয়, দুই-মডেল সিন্থেসিসের দরকার নেই ──
      // max_tokens কমানো হয়েছে (৩০০০ → ১৬০০) — এটা "hard cap", আসল সংক্ষিপ্ততা আসে প্রম্পটের নির্দেশনা থেকে,
      // কিন্তু একটা কম cap থাকলে মডেল অহেতুক বেশি লিখতে "প্ররোচিত" হয় না
      const r = await runGroq(messages, 1600, 12000, 0.85, 3);
      if (r.error || r.retry) {
        return res.status(429).json({ error: 'The AI server is busy right now. Please try again shortly.' });
      }
      cleanText = r.text.trim();
      usageEntries.push({ model: r.model, usage: r.usage });
    } else {
      // ── নতুন স্বপ্ন / প্রসঙ্গ-উত্তর: Groq ও OpenRouter সমান্তরালে চলে, তারপর দুটোর ব্যাখ্যা মিলিয়ে একটা চূড়ান্ত উত্তর তৈরি হয় ──
      const [groqResult, orResult] = await Promise.all([
        runGroq(messages, 1700, 10000, 0.85, 2),
        runOpenRouter(messages, 1700, 10000, 0.85, 2)
      ]);

      const groqOk = groqResult && !groqResult.error && !groqResult.retry;
      const orOk = orResult && !orResult.error && !orResult.retry;

      if (!groqOk && !orOk) {
        return res.status(429).json({ error: 'The AI server is busy right now. Please try again shortly.' });
      }

      if (groqOk) usageEntries.push({ model: groqResult.model, usage: groqResult.usage });
      if (orOk) usageEntries.push({ model: `openrouter:${orResult.model}`, usage: orResult.usage });

      if (groqOk && orOk) {
        // দুটো ব্যাখ্যাই পাওয়া গেছে — এখন সিন্থেসাইজ করা হবে
        const synthesisMessages = [
          { role: 'system', content: buildSynthesisPrompt(APP_KNOWLEDGE_BASE) },
          {
            role: 'user',
            content: `মূল স্বপ্ন/বার্তা: ${dreamTrimmed}\n\n[ব্যাখ্যা ১]:\n${groqResult.text}\n\n[ব্যাখ্যা ২]:\n${orResult.text}\n\nউপরের দুইটি স্বাধীন ব্যাখ্যা মিলিয়ে একটিমাত্র সুসংগত চূড়ান্ত ব্যাখ্যা লিখুন।`
          }
        ];
        const synth = await runGroq(synthesisMessages, 1900, 12000, 0.75, 1);
        if (!synth.error && !synth.retry) {
          cleanText = synth.text.trim();
          usageEntries.push({ model: `synthesis:${synth.model}`, usage: synth.usage });
        }
      }

      // সিন্থেসিস না হলে বা ব্যর্থ হলে — যেটা সফল হয়েছে সেটাই ব্যবহার করা হয়
      if (!cleanText) {
        cleanText = (groqOk ? groqResult.text : orResult.text).trim();
      }
    }

    const { sessionId: newSessionId, messageId } = await persistExchange({
      userId,
      sessionId: sessionId || null,
      userDream: dreamTrimmed,
      aiText: cleanText,
      category,
      entity,
      usageEntries
    });

    return res.status(200).json({ text: cleanText, sessionId: newSessionId, messageId });

  } catch (topLevelError) {
    console.error('Interpret handler error:', topLevelError);
    return res.status(500).json({
      error: `DEBUG_ERROR: ${topLevelError.message || 'Unknown error'}`
    });
  }
                      }
