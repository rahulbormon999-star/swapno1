const CACHE_NAME = 'pravax-shell-v7'; // ভার্সন বাম্প করা হলো — পুরনো ক্যাশ invalidate করার জন্য

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

  // ================= HTML পেজের জন্য: "Network-First" =================
  // আগে এখানে "cache-first" ছিল — একবার ক্যাশ হয়ে গেলে ওয়েবসাইট আপডেট করলেও পুরনো ভার্সনই
  // চিরকাল দেখাতো (APK/PWA আপডেট না হওয়ার আসল কারণ এটাই ছিল)। এখন আগে নেটওয়ার্ক থেকে ফ্রেশ
  // কনটেন্ট আনার চেষ্টা হয়; সফল হলে ক্যাশও আপডেট হয়ে যায়। শুধু ইন্টারনেট সম্পূর্ণ না থাকলেই
  // (সত্যিকারের অফলাইন অবস্থায়) পুরনো ক্যাশ থেকে দেখানো হবে।
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ================= বাকি স্ট্যাটিক ফাইল (আইকন, manifest) — এগুলো কদাচিৎ বদলায়, তাই cache-first রাখা হলো =================
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => cached);
    })
  );
});
