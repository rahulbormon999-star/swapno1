// রিকোয়েস্টের IP বের করা (Vercel প্রক্সির পেছনে x-forwarded-for ব্যবহার করে)
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// সাধারণ in-memory per-key রেট লিমিটার (একটা serverless instance এর মধ্যে যতটুকু কাজে দেয়)
// crash/cold-start হলে রিসেট হয়ে যাবে — ভারী abuse ঠেকাতে DB-ভিত্তিক (email_otps.ip) রেট লিমিট আলাদাভাবে থাকছে
const rateMap = new Map();
export function isRateLimited(key, windowMs, maxCount) {
  const now = Date.now();
  const d = rateMap.get(key);
  if (!d || now - d.start > windowMs) {
    rateMap.set(key, { count: 1, start: now });
    return false;
  }
  if (d.count >= maxCount) return true;
  d.count++;
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap.entries()) {
    if (now - v.start > 300_000) rateMap.delete(k);
  }
}, 300_000);
