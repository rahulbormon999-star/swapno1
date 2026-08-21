const CACHE_NAME = 'pravax-shell-v4';

// শুধু স্ট্যাটিক শেল ক্যাশ হয় — API রেসপন্স/ডাটা কখনো ক্যাশ হয় না (সবসময় ফ্রেশ থাকতে হবে)
const SHELL_FILES = [
  '/index.html',
  '/login.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ================= API কল কখনো ক্যাশ হবে না — সবসময় সরাসরি নেটওয়ার্কে যাবে =================
  if (url.pathname.startsWith('/api/')) {
    return; // ব্রাউজারের ডিফল্ট নেটওয়ার্ক ফেচ ব্যবহার হবে
  }

  // ================= শেল ফাইলগুলোর জন্য: আগে ক্যাশ, না পেলে নেটওয়ার্ক (অফলাইনেও অ্যাপ খুলবে) =================
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => cached);
    })
  );
});
