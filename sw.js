const CACHE_NAME = 'web-phim-v1';
const urlsToCache = [
    './',
    './index.html',
    './styles.css'
];

// Tiến hành cài đặt Service Worker và lưu cache các file cơ bản
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

// Trả về dữ liệu từ Cache nếu người dùng bị mất mạng
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
    );
});