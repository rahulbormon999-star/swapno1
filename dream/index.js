// dream/index.js
// ─────────────────────────────────────────────────────────────
// নতুন ক্যাটাগরি ফাইল যোগ করার নিয়ম:
// ১. এই ফোল্ডারে animals.js/birds.js এর মতো একটা নতুন ফাইল বানান
//    (যেমন: snakes.js, water.js, exams.js — interpret.js এর
//    CATEGORY_KEYWORDS-এ যে ২৫টা ক্যাটাগরি আছে তার যেকোনো একটার জন্য)
// ২. { category, general, entities } আকারে export করুন —
//    category অবশ্যই interpret.js এর CATEGORY_KEYWORDS-এ থাকা
//    বাংলা নামের সাথে হুবহু মিলতে হবে (যেমন 'সাপ', 'পানি/বন্যা')
// ৩. নিচে import করে REGISTRY অ্যারেতে যোগ করুন — ব্যাস, এটাই যথেষ্ট,
//    interpret.js এ আর কোনো পরিবর্তন লাগবে না।
// ─────────────────────────────────────────────────────────────

import { ANIMALS } from './animals.js';
import { BIRDS } from './birds.js';
import { SPIRITUALS } from './spirituals.js';
const REGISTRY = [ANIMALS, BIRDS,SPIRITUALS];

/**
 * ক্যাটাগরি (ও থাকলে entity) অনুযায়ী কিউরেটেড স্বপ্নের অর্থ খুঁজে বের করে।
 * কিছু না মিললে null রিটার্ন করে — তখন interpret.js মডেলের নিজস্ব
 * জ্ঞান দিয়ে fallback করবে (কোনো ক্র্যাশ বা খালি উত্তর হবে না)।
 */
export function getDreamKnowledge(category, entity) {
  if (!category) return null;
  const module = REGISTRY.find(m => m.category === category);
  if (!module) return null;

  if (entity && module.entities && module.entities[entity]) {
    return module.entities[entity];
  }
  return module.general || null;
}
