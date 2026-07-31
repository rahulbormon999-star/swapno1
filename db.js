import { neon } from '@neondatabase/serverless';

// DATABASE_URL হলো Vercel এ সেট করা Environment Variable (Dream Lens এর নিজস্ব Neon প্রজেক্ট,
// Dev-Onix এর ডাটাবেজ থেকে সম্পূর্ণ আলাদা — SSO শুধু পরিচয় যাচাই করে, ডেটা শেয়ার করে না)
export const sql = neon(process.env.DATABASE_URL);
