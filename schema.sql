-- ================= Dream Lens Database Schema (Neon Postgres) =================

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  login_source TEXT NOT NULL,              -- 'devonix' | 'email'
  devonix_user_id INT,                     -- Dev-Onix SSO থেকে এলে ওখানকার user id
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  profile_picture TEXT,

  -- ================= ভবিষ্যৎ পেমেন্ট/প্ল্যান সিস্টেমের জন্য আগে থেকে রাখা কলাম =================
  plan TEXT DEFAULT 'free',
  token_quota INT,                         -- nullable, প্ল্যান অনুযায়ী মাসিক টোকেন লিমিট (পরে ব্যবহার হবে)
  stripe_customer_id TEXT,

  banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  banned_at TIMESTAMPTZ,

  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_devonix_id ON users(devonix_user_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_login_source ON users(login_source);
CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned);

-- ================= Email OTP (শুধু "Continue with Email" লগইনের জন্য) =================
CREATE TABLE IF NOT EXISTS email_otps (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  ip TEXT,
  attempts INT DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);

-- ================= প্রতিটা চ্যাট সেশন (sidebar-এর একেকটা history item) =================
CREATE TABLE IF NOT EXISTS dream_sessions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dream_sessions_user ON dream_sessions(user_id);

-- ================= প্রতিটা মেসেজ (user dream + AI reply) =================
-- category ও feedback এখানেই লগ হয়, যাতে অ্যানালিটিক্স ও ইউজার-হিস্ট্রি দুটোই এক জায়গা থেকে বের করা যায়
CREATE TABLE IF NOT EXISTS dream_messages (
  id SERIAL PRIMARY KEY,
  session_id INT REFERENCES dream_sessions(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                      -- 'user' | 'ai'
  content TEXT NOT NULL,
  category TEXT,                           -- শুধু role='user' এ বসবে (প্রধান স্বপ্ন-ক্যাটাগরি, যেমন 'পশু')
  entity TEXT,                             -- ক্যাটাগরির ভেতরের নির্দিষ্ট জিনিস (যেমন 'গরু') — দুই-স্তরের ব্রেকডাউনের জন্য
  feedback TEXT,                           -- 'up' | 'down' | NULL — শুধু role='ai' তে
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dream_messages_user ON dream_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_dream_messages_session ON dream_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_dream_messages_category ON dream_messages(category);
CREATE INDEX IF NOT EXISTS idx_dream_messages_entity ON dream_messages(entity);
CREATE INDEX IF NOT EXISTS idx_dream_messages_feedback ON dream_messages(feedback);
CREATE INDEX IF NOT EXISTS idx_dream_messages_created ON dream_messages(created_at DESC);

-- ================= আগে থেকে টেবিল বানানো থাকলে (entity কলাম যোগ করার জন্য) এই লাইনটা আলাদাভাবে রান করুন =================
-- (আপনি এটা আগেই রান করে ফেলেছেন, তাই আবার রান করার দরকার নেই — শুধু রেফারেন্সের জন্য রাখা হলো)
ALTER TABLE dream_messages ADD COLUMN IF NOT EXISTS entity TEXT;

-- ================= RAG Knowledge Base (semantic search দিয়ে multi-tradition স্বপ্ন-জ্ঞান) =================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id SERIAL PRIMARY KEY,
  tradition TEXT NOT NULL,        -- অভ্যন্তরীণ ট্যাগ মাত্র (যেমন 'sanatan', 'islamic', 'psychology', 'folk') — ইউজারকে কখনো দেখানো হয় না
  source_ref TEXT,                -- আপনার নিজের রেফারেন্সের জন্য, যেমন 'Garuda Purana Ch. 5'
  content TEXT NOT NULL,
  embedding VECTOR(1536),         -- openai/text-embedding-3-small এর dimension
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tradition ON knowledge_chunks(tradition);


-- ================= প্রতিটা Groq API কলের টোকেন হিসাব (গ্র্যানুলার — ভবিষ্যৎ বিলিং-রেডি) =================
CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  message_id INT REFERENCES dream_messages(id) ON DELETE SET NULL,
  model TEXT,
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_usage_user ON token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at DESC);

-- ================= অ্যাডমিন কার্যক্রমের audit log =================
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  target_user_id INT,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ================= রেজিস্ট্রেশন/OTP স্প্যাম রেট-লিমিট ট্র্যাক করার জন্য (ইতিমধ্যে email_otps.ip দিয়ে হচ্ছে, এক্সট্রা টেবিল লাগছে না) =================
