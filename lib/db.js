import { neon } from '@neondatabase/serverless';

// DATABASE_URL হলো Vercel এ সেট করা Environment Variable (Dream Lens এর নিজস্ব Neon প্রজেক্ট,
// Dev-Onix এর ডাটাবেজ থেকে সম্পূর্ণ আলাদা — SSO শুধু পরিচয় যাচাই করে, ডেটা শেয়ার করে না)
//
// দ্রষ্টব্য: DATABASE_URL ভুল/অনুপস্থিত থাকলে neon() সরাসরি এখানে (module load এ) থ্রো করলে
// পুরো serverless function ক্র্যাশ করে (FUNCTION_INVOCATION_FAILED), যা try/catch দিয়েও ধরা যায় না।
// তাই এখানে সেই throw টা ধরে, ব্যবহারের সময় (handler এর try/catch এর ভেতরে) একটা পরিষ্কার
// catchable error দেওয়া হচ্ছে — তাতে আসল কারণ সহজে দেখা/ডিবাগ করা যাবে।
let sqlClient;
try {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable সেট করা নেই');
  }
  sqlClient = neon(process.env.DATABASE_URL);
} catch (err) {
  console.error('DB init error:', err.message);
  sqlClient = () => {
    throw new Error('ডাটাবেজ কানেকশন তৈরি করা যায়নি: ' + err.message);
  };
}

export const sql = sqlClient;
