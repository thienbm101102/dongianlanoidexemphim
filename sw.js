const CACHE_NAME = 'haruno-pwa-cache-v1';

// Danh sách các tài nguyên tĩnh cần tải sẵn và lưu vào ổ cứng ngay lần đầu truy cập
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json'
];

// BƯỚC 1: Cài đặt Service Worker và lưu Cache
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Đã mở bộ nhớ đệm (Cache)');
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting(); // Ép kích hoạt ngay lập tức
});

// BƯỚC 2: Dọn dẹp rác (Xóa Cache cũ khi có bản cập nhật mới)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Đang xóa cache cũ:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// BƯỚC 3: Chặn yêu cầu mạng và trả về dữ liệu từ Cache (Nhanh như chớp)
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // BỎ QUA CACHE CHO: Các lệnh gọi API, Firebase và File Video (M3U8, TS, MP4)
    // Nếu cache video, trình duyệt của người dùng sẽ bị đầy bộ nhớ rất nhanh.
    if (url.includes('/api') || 
        url.includes('firebasedatabase') || 
        url.includes('worker') ||
        url.includes('.m3u8') || 
        url.includes('.ts') || 
        url.includes('.mp4')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 1. Trả về dữ liệu từ Cache nếu có (Nhanh nhất)
                if (response) {
                    return response;
                }
                
                // 2. Nếu không có trong Cache, tiến hành tải từ Mạng
                return fetch(event.request).then(
                    function(networkResponse) {
                        // Không cache các phản hồi lỗi hoặc từ domain khác không an toàn
                        if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }

                        // Sao chép phản hồi để vừa trả về cho web, vừa lưu vào Cache
                        var responseToCache = networkResponse.clone();

                        caches.open(CACHE_NAME)
                            .then(function(cache) {
                                // Tự động lưu hình ảnh hoặc các file mới vào Cache cho lần sau
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    }
                );
            })
            .catch(() => {
                // FALLBACK: Trả về trang chủ nếu mất mạng và chưa có cache file đó
                if (event.request.destination === 'document') {
                    return caches.match('/index.html');
                }
            })
    );
});