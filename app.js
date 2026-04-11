const firebaseConfig = {
    apiKey: "AIzaSyBGmYG39lizLSntgmF9UStxupVGefLvfrM",
    authDomain: "web-phim-haruno.firebaseapp.com",
    databaseURL: "https://web-phim-haruno-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "web-phim-haruno",
    storageBucket: "web-phim-haruno.firebasestorage.app",
    messagingSenderId: "458970016952",
    appId: "1:458970016952:web:c4f0627f3aee01c80b984d"
};

let db = null;

window.addEventListener('load', () => {
    try {
        if (firebaseConfig.apiKey !== "") {
            firebase.initializeApp(firebaseConfig);
            db = firebase.database();
            
            app.listenUsers();
            app.checkAuth();
            app.initLatestComments();
            app.initPresence(); 
			app.listenGlobalEffect(); // Thêm dòng này để lắng nghe hiệu ứng ngay khi load web
			app.listenAnnouncement(); // <--- THÊM DÒNG NÀY ĐỂ MỞ LOA
        }
    } catch(e) { console.log("Lỗi Firebase:", e); }
});

const API_URL = 'https://phim.nguonc.com/api';
const IMG_DOMAIN = ''; 

const ADMIN_EMAIL = 'thienbm101102@gmail.com'; 
const ADMIN_NAME = 'Haruno'; 

const app = {
    currentPage: 1,
    currentType: 'phim-moi-cap-nhat',
    isSearch: false,
    currentTrailer: '',
    currentMovieSlug: '',
    currentMovieData: null,
    currentMovieName: 'Phim',
    isCinemaMode: false, 
    usersData: {},
    topContributors: {}, // THÊM DÒNG NÀY ĐỂ LƯU TOP	
    lazyObserver: null,
    tempUser: null, 
    
    currentEpList: [], 
    currentEpIndex: -1, 
    isDragging: false, 
    currentRoomId: null,
    wasPremium: undefined,
    isSyncingFromDB: false,
    lastActionId: null,
	activeRequests: {},
	
	// HÀM MỚI: GỌI API THÔNG MINH CÓ BỘ NHỚ ĐỆM
    async fetchWithCache(url, cacheTime = 300) { 
        const cacheKey = "haruno_cache_" + url;
        const cachedItem = sessionStorage.getItem(cacheKey);

        if (cachedItem) {
            try {
                const { timestamp, data } = JSON.parse(cachedItem);
                if (Date.now() - timestamp < cacheTime * 1000) {
                    console.log("⚡ Lấy dữ liệu từ Cache (Không tốn request):", url);
                    return data; 
                }
            } catch (e) {
                sessionStorage.removeItem(cacheKey);
            }
        }

        // --- ĐOẠN FIX: CHẶN GỌI TRÙNG LẶP (THUNDERING HERD) ---
        // Nếu API này đang được gọi rồi thì đợi nó xong lấy kết quả chung luôn, không gọi thêm request mới
        if (this.activeRequests[url]) {
            console.log("⏳ Đang chờ request trước hoàn thành để dùng chung:", url);
            return this.activeRequests[url];
        }

        // Tạo một Promise fetch mới và lưu vào danh sách chờ
        const fetchPromise = (async () => {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error("API NguonC trả về lỗi " + res.status);
                const data = await res.json();
                
                // Lưu dữ liệu mới lấy được vào kho tạm
                sessionStorage.setItem(cacheKey, JSON.stringify({
                    timestamp: Date.now(),
                    data: data
                }));
                return data;
            } catch (error) {
                console.error("Lỗi fetch API:", error);
                // Nếu gọi API thật bị lỗi, thử moi lại cache cũ dùng tạm
                if (cachedItem) return JSON.parse(cachedItem).data;
                return null;
            } finally {
                // Tải xong rồi thì xóa khỏi danh sách chờ
                delete this.activeRequests[url];
            }
        })();

        this.activeRequests[url] = fetchPromise;
        return fetchPromise;
    },

    // --- HIỂN THỊ MINI PROFILE ---
    showUserProfile(safeKey, defaultName, defaultAvatar) {
        const modal = document.getElementById('user-profile-modal');
        if(!modal) return;
        
        const uData = this.usersData[safeKey] || {};
        const name = uData.displayName || defaultName || 'Người dùng ẩn danh';
        const avatar = uData.avatar || defaultAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
        const isPremium = uData.isPremium ? true : false;
        
        document.getElementById('upm-name').innerText = name;
        document.getElementById('upm-name').className = isPremium ? 'premium-name' : '';
        
        document.getElementById('upm-avatar').src = avatar;

        // Xử lý Giới thiệu (About Me)
        const aboutSection = document.getElementById('upm-about-section');
        const aboutContent = document.getElementById('upm-about-content');
        if (uData.aboutMe && uData.aboutMe.trim() !== '') {
            aboutContent.innerText = uData.aboutMe;
            aboutSection.style.display = 'block';
        } else {
            aboutSection.style.display = 'none';
        }

        // Xử lý Hiệu ứng trang trí hồ sơ (Profile Effect)
        const effectOverlay = document.getElementById('upm-effect-overlay');
        if(effectOverlay) {
            effectOverlay.className = 'upm-effect-overlay'; 
            if (isPremium && uData.profileEffect && uData.profileEffect !== 'none') {
                effectOverlay.classList.add('active', uData.profileEffect);
            }
        }
        
        // Xử lý hiển thị Banner
        const bannerEl = document.getElementById('upm-banner');
        if (uData.banner) {
            bannerEl.style.backgroundImage = `url(${uData.banner})`;
            bannerEl.style.backgroundSize = 'cover';
            bannerEl.style.backgroundPosition = 'center';
        } else {
            bannerEl.style.backgroundImage = 'none';
            if (isPremium) {
                bannerEl.style.background = 'var(--gradient)';
            } else {
                bannerEl.style.background = '#333';
            }
        }
        
        document.getElementById('upm-badge').innerHTML = this.getFinalBadge(safeKey, isPremium);
        
        // Khung Avatar
        const frameOverlay = document.getElementById('upm-avatar-frame');
        if(frameOverlay) {
            frameOverlay.className = 'avatar-frame';
            if (isPremium && uData.avatarFrame && uData.avatarFrame !== 'none') {
                frameOverlay.classList.add(uData.avatarFrame);
            }
        }
        
        document.getElementById('upm-comments-count').innerText = uData.comments || 0;
        document.getElementById('upm-likes-count').innerText = uData.likesReceived || 0;
        
        const activityList = document.getElementById('upm-activity-list');
        activityList.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--accent);"></i><p style="margin-top: 10px; color: #888; font-size: 12px;">Đang tải danh sách...</p></div>';
        
        modal.style.display = 'flex';

        if(db) {
            db.ref(`users_data/${safeKey}/watchlist`).once('value', snap => {
                const watchlist = snap.val();
                
                if(watchlist && Array.isArray(watchlist) && watchlist.length > 0) {
                    const displayList = watchlist.slice(0, 9); 
                    activityList.innerHTML = '<div class="upm-watchlist-grid">' + displayList.map(m => `
                        <div class="upm-movie-card" onclick="app.closeUserProfile(); app.showMovie('${m.slug}')" title="${m.name}">
                            <img src="${m.thumb}" alt="${m.name}">
                            <div class="upm-movie-title">${m.name}</div>
                        </div>
                    `).join('') + '</div>';
                } else {
                    activityList.innerHTML = '<div style="text-align:center; color:#666; padding: 20px 0; font-size: 13px;">Người dùng này chưa lưu phim nào 💔</div>';
                }
            });
        }
    },

    closeUserProfile() {
        const modal = document.getElementById('user-profile-modal');
        if(modal) modal.style.display = 'none';
    },

    previewPremiumColor(themeClass) {
        document.body.classList.remove('theme-holo-blue', 'theme-holo-pink', 'theme-holo-gold', 'theme-holo-cyber', 'theme-holo-galaxy');
        document.body.classList.add(themeClass);
    },

    previewEditBanner(event) {
        const file = event.target.files[0];
        if (file) {
            document.getElementById('edit-banner-preview').style.backgroundImage = `url(${URL.createObjectURL(file)})`;
        }
    },

    resizeAndConvertBanner(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 600; 
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8)); 
                };
            };
        });
    },

    toList(obj) {
        if (!obj) return [];
        if (Array.isArray(obj)) return obj;
        return Object.values(obj);
    },

    extractItems(data) {
        if (!data) return [];
        let items = data.items || data.data?.items || data.paginate?.items || data.data?.paginate?.items;
        return Array.isArray(items) ? items : [];
    },

    hlsInstance: null,

    formatTime(sec) {
        if (isNaN(sec)) return "00:00";
        let h = Math.floor(sec / 3600);
        let m = Math.floor((sec % 3600) / 60);
        let s = Math.floor(sec % 60);
        if (h > 0) return `${h}:${m<10?'0':''}${m}:${s<10?'0':''}${s}`;
        return `${m<10?'0':''}${m}:${s<10?'0':''}${s}`;
    },

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-times-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    confirmCallback: null,
    showConfirm(title, desc, callback) {
        document.getElementById('confirm-title').innerHTML = title;
        document.getElementById('confirm-desc').innerText = desc;
        this.confirmCallback = callback;
        
        const btnConfirm = document.getElementById('btn-confirm-action');
        btnConfirm.onclick = () => {
            const savedCallback = this.confirmCallback; 
            this.closeConfirm();                        
            if(savedCallback) savedCallback();          
        };
        document.getElementById('custom-confirm-modal').style.display = 'flex';
    },
    closeConfirm() {
        document.getElementById('custom-confirm-modal').style.display = 'none';
        this.confirmCallback = null;
    },

    spawnHearts(x, y) {
        for (let i = 0; i < 6; i++) {
            const heart = document.createElement('i');
            heart.className = 'fas fa-heart particle-heart';
            document.body.appendChild(heart);
            
            const size = Math.random() * 15 + 10;
            heart.style.width = size + 'px';
            heart.style.height = size + 'px';
            heart.style.fontSize = size + 'px';
            heart.style.left = (x - size/2) + 'px';
            heart.style.top = (y - size/2) + 'px';
            
            const dx = (Math.random() - 0.5) * 80;
            const dy = -Math.random() * 80 - 30;
            const rot = (Math.random() - 0.5) * 90;
            
            heart.style.setProperty('--dx', dx + 'px');
            heart.style.setProperty('--dy', dy + 'px');
            heart.style.setProperty('--rot', rot + 'deg');
            
            setTimeout(() => heart.remove(), 1000);
        }
    },

    initPlayer() {
        const video = document.getElementById('video-player');
        const playBtn = document.getElementById('play-pause-btn');
        const progressBar = document.getElementById('progress-bar');
        const timeDisplay = document.getElementById('time-display');
        const customPlayer = document.getElementById('custom-player');
        const overlay = document.querySelector('.player-controls-overlay');
        
        const canvas = document.getElementById('ambient-canvas');
        const ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;
        let ambientFrameId;

        // Dùng API để theo dõi xem trình phát video có đang nằm trong tầm nhìn (viewport) hay không
        let isPlayerVisible = true;
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                isPlayerVisible = entries[0].isIntersecting;
            }, { threshold: 0 });
            observer.observe(customPlayer);
        }

        // Nhận diện thiết bị cảm ứng (điện thoại, máy tính bảng)
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        const drawAmbient = () => {
            // Nếu là thiết bị cảm ứng, DỪNG HOÀN TOÀN vòng lặp đồ họa để chống nóng máy
            if (isTouchDevice) {
                if (canvas) canvas.style.display = 'none'; // Ẩn thẻ canvas đi
                return; // Thoát hàm vĩnh viễn, không gọi requestAnimationFrame nữa
            }

            // Ngừng vẽ đồ hoạ (GPU) nếu video dừng, ẩn đi, hoặc người dùng đã cuộn màn hình đi chỗ khác
            if(video.paused || video.ended || customPlayer.style.display === 'none' || !isPlayerVisible) {
                ambientFrameId = requestAnimationFrame(drawAmbient); 
                return; 
            }
            
            if(ctx && video.videoWidth > 0) {
                if (canvas.width !== 64) { canvas.width = 64; canvas.height = 36; }
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
            ambientFrameId = requestAnimationFrame(drawAmbient);
        };

        let hideControlsTimeout;
        const resetHideTimeout = () => {
            overlay.classList.add('show-controls');
            clearTimeout(hideControlsTimeout);
            hideControlsTimeout = setTimeout(() => {
                if(!video.paused) overlay.classList.remove('show-controls');
            }, 3000);
        };

        customPlayer.addEventListener('mousemove', resetHideTimeout);
        customPlayer.addEventListener('touchstart', resetHideTimeout);

        video.addEventListener('timeupdate', () => {
            if (!video.duration) return;
            const percent = (video.currentTime / video.duration) * 100;
            progressBar.style.width = percent + '%';
            timeDisplay.innerText = `${app.formatTime(video.currentTime)} / ${app.formatTime(video.duration)}`;
        });

        video.addEventListener('play', () => {
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            resetHideTimeout();
            if(canvas) canvas.classList.add('active'); 
            ambientFrameId = requestAnimationFrame(drawAmbient); 
            if (!app.isSyncingFromDB) app.emitPlayerState('play');
        });
        
        video.addEventListener('pause', () => {
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
            overlay.classList.add('show-controls');
            clearTimeout(hideControlsTimeout);
            if(canvas) canvas.classList.remove('active'); 
            cancelAnimationFrame(ambientFrameId);
            if (!app.isSyncingFromDB) app.emitPlayerState('pause');
        });

        video.addEventListener('seeked', () => {
            if (!app.isSyncingFromDB) app.emitPlayerState('seek');
            if (!video.paused && ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        });

        video.addEventListener('ended', () => {
            if (app.currentEpIndex >= 0 && app.currentEpIndex < app.currentEpList.length - 1) {
                if(app.currentRoomId) app.sendSysMsgToRoom("Tự động chuyển sang tập tiếp theo...");
                app.playNextEp(); 
            }
        });

        video.addEventListener('click', () => {
            if (window.innerWidth > 768) app.togglePlay();
            else resetHideTimeout();
        });
        
        video.addEventListener('dblclick', () => app.toggleFullScreen());

        let lastTapTime = 0;
        customPlayer.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTapTime;
            if (tapLength < 300 && tapLength > 0) {
                const touchX = e.changedTouches[0].clientX;
                const screenWidth = window.innerWidth;
                if (touchX < screenWidth / 2) { app.skipTime(-10); app.showToast("Tua lùi 10s", "success"); } 
                else { app.skipTime(10); app.showToast("Tua tới 10s", "success"); }
                e.preventDefault(); 
            }
            lastTapTime = currentTime;
        });
        
        document.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
            if (!customPlayer.style.display || customPlayer.style.display === 'none') return;
            if (e.code === 'Space') { e.preventDefault(); app.togglePlay(); resetHideTimeout(); }
            if (e.code === 'ArrowRight') { app.skipTime(10); resetHideTimeout(); }
            if (e.code === 'ArrowLeft') { app.skipTime(-10); resetHideTimeout(); }
            if (e.code === 'KeyF') { app.toggleFullScreen(); resetHideTimeout(); }
        });
    },

    togglePlay() {
        const video = document.getElementById('video-player');
        if (video.paused) video.play().catch(e => {});
        else video.pause();
    },

    skipTime(sec) {
        const video = document.getElementById('video-player');
        video.currentTime += sec;
    },

    seekVideo(e) {
    const video = document.getElementById('video-player');
    const container = document.getElementById('progress-container');
    const rect = container.getBoundingClientRect();
    let pos = (e.clientX - rect.left) / rect.width;
    pos = Math.max(0, Math.min(1, pos)); // Đảm bảo không bị kéo lố ra ngoài
    video.currentTime = pos * video.duration;
    
    // Thêm feedback rung nhẹ trên điện thoại nếu có hỗ trợ
    if (navigator.vibrate) navigator.vibrate(50); 
    
    if(video.paused) video.play().catch(e=>{});
},

    changeSpeed() {
        const video = document.getElementById('video-player');
        const btn = document.getElementById('speed-btn');
        let current = video.playbackRate;
        let next = current === 1 ? 1.25 : current === 1.25 ? 1.5 : current === 1.5 ? 2 : 1;
        video.playbackRate = next;
        btn.innerText = next + 'x';
        
        if (!app.isSyncingFromDB) app.emitPlayerState('speed');
    },

    toggleFullScreen() {
        const player = document.getElementById('custom-player');
        if (!document.fullscreenElement) {
            player.requestFullscreen().catch(err => {});
        } else {
            document.exitFullscreen();
        }
    },

    playVideo(m3u8Url, embedUrl) {
        const customPlayer = document.getElementById('custom-player');
        const video = document.getElementById('video-player');
        const iframe = document.getElementById('video-iframe');

        // Ép HTTPS để chống lỗi Mixed Content
        if (m3u8Url && m3u8Url.startsWith('http://')) {
            m3u8Url = m3u8Url.replace('http://', 'https://');
        }

        if (m3u8Url) {
            customPlayer.style.display = 'block';
            video.style.display = 'block';
            if (iframe) {
                iframe.src = ''; 
                iframe.style.display = 'none';
            }

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                if (this.hlsInstance) this.hlsInstance.destroy();
                this.hlsInstance = new Hls({
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60
                });
                
                // Bắt lỗi CORS/404 và tự động chuyển Iframe
                this.hlsInstance.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) {
                        console.warn("HLS Error, using Iframe Fallback", data);
                        customPlayer.style.display = 'none';
                        video.pause();
                        if (iframe) {
                            iframe.style.display = 'block';
                            iframe.src = embedUrl;
                        }
                    }
                });

                this.hlsInstance.loadSource(m3u8Url);
                this.hlsInstance.attachMedia(video);
                this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, function() {
                    video.play().catch(e => console.log("Auto-play blocked"));
                });

            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Hỗ trợ riêng cho trình duyệt Safari
                video.src = m3u8Url;
                video.addEventListener('loadedmetadata', function() {
                    video.play().catch(e => console.log("Auto-play blocked"));
                });
                
                // Fallback nếu Safari không tải được
                video.addEventListener('error', function() {
                    console.warn("Safari load error, using Iframe Fallback");
                    customPlayer.style.display = 'none';
                    if (iframe) {
                        iframe.style.display = 'block';
                        iframe.src = embedUrl;
                    }
                });
            } else {
                 // Bảo hiểm cuối cùng: Bật Iframe
                 customPlayer.style.display = 'none';
                 if (iframe) {
                     iframe.style.display = 'block';
                     iframe.src = embedUrl;
                 }
            }
        } else if (embedUrl) {
            // Nếu phim chỉ có link embed
            if (iframe) {
                iframe.style.display = 'block';
                iframe.src = embedUrl;
            }
            customPlayer.style.display = 'none';
            video.pause();
            if (this.hlsInstance) this.hlsInstance.destroy();
        }
    },

    enableDragScroll() {
        const sliders = document.querySelectorAll('.horizontal-scroll-grid, .top-movies-scroll');
        sliders.forEach(slider => {
            if (slider.dataset.dragEnabled) return; 
            slider.dataset.dragEnabled = 'true';

            let isDown = false;
            let startX;
            let scrollLeft;

            slider.addEventListener('mousedown', (e) => {
                isDown = true;
                app.isDragging = false; 
                slider.classList.add('dragging');
                startX = e.pageX - slider.offsetLeft;
                scrollLeft = slider.scrollLeft;
            });
            slider.addEventListener('mouseleave', () => {
                isDown = false;
                slider.classList.remove('dragging');
                setTimeout(() => app.isDragging = false, 50);
            });
            slider.addEventListener('mouseup', () => {
                isDown = false;
                slider.classList.remove('dragging');
                setTimeout(() => app.isDragging = false, 50);
            });
            slider.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - slider.offsetLeft;
                const walk = (x - startX) * 2; 
                if (Math.abs(walk) > 5) {
                    app.isDragging = true;
                    slider.classList.add('dragging'); 
                }
                slider.scrollLeft = scrollLeft - walk;
            });
            
            slider.querySelectorAll('img, a').forEach(el => {
                el.addEventListener('dragstart', (e) => e.preventDefault());
            });
        });
    },

    createWatchRoom() {},
    copyRoomLink() {},
    joinWatchRoom(roomId) {},
    emitPlayerState(action) {},
    sendRoomChat() {},
    sendSysMsgToRoom(text) {},

    async getActorsFromTMDB(m) {
        const apiKey = '15d2ea6d0dc1d476efbca3eba2b9bbfb'; 
        try {
            if (m.tmdb && m.tmdb.id) {
                const mediaType = m.tmdb.type === 'tv' ? 'tv' : 'movie'; 
                const credRes = await fetch(`https://api.themoviedb.org/3/${mediaType}/${m.tmdb.id}/credits?api_key=${apiKey}&language=vi-VN`);
                const credData = await credRes.json();
                if (credData.cast && credData.cast.length > 0) return credData.cast; 
            }

            let query = m.original_name || m.origin_name || m.name;
            if(query) query = query.replace(/\(.*\)/g, '').trim(); 

            let res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=vi-VN`);
            let data = await res.json();
            let results = data.results || [];
            
            if(results.length === 0) {
                let fallbackQuery = m.name;
                if(fallbackQuery) fallbackQuery = fallbackQuery.replace(/\(.*\)/g, '').trim();
                res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(fallbackQuery)}&language=vi-VN`);
                data = await res.json();
                results = data.results || [];
            }

            let media = null;
            if (results.length > 0) {
                media = results.find(item => {
                    if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
                    let releaseDate = item.release_date || item.first_air_date || '';
                    let itemYear = releaseDate.split('-')[0];
                    if (m.year && itemYear) return Math.abs(parseInt(itemYear) - parseInt(m.year)) <= 1;
                    return true; 
                });
                if (!media) media = results.find(item => item.media_type === 'movie' || item.media_type === 'tv');
            }

            if(media) {
                const tmdbId = media.id;
                const mediaType = media.media_type;
                const credRes = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/credits?api_key=${apiKey}&language=vi-VN`);
                const credData = await credRes.json();
                return credData.cast || [];
            }
        } catch(e) { }
        return [];
    },

    async getTrailerFromTMDB(m) {
        const apiKey = '15d2ea6d0dc1d476efbca3eba2b9bbfb'; 
        try {
            let mediaType = m.tmdb?.type === 'tv' ? 'tv' : 'movie'; 
            let tmdbId = m.tmdb?.id;

            if (!tmdbId) {
                let query = m.original_name || m.origin_name || m.name;
                if(query) query = query.replace(/\(.*\)/g, '').trim(); 

                let res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=vi-VN`);
                let data = await res.json();
                let results = data.results || [];
                
                if(results.length === 0) {
                    let fallbackQuery = m.name;
                    if(fallbackQuery) fallbackQuery = fallbackQuery.replace(/\(.*\)/g, '').trim();
                    res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(fallbackQuery)}&language=vi-VN`);
                    data = await res.json();
                    results = data.results || [];
                }

                let media = null;
                if (results.length > 0) {
                    media = results.find(item => {
                        if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
                        let releaseDate = item.release_date || item.first_air_date || '';
                        let itemYear = releaseDate.split('-')[0];
                        if (m.year && itemYear) return Math.abs(parseInt(itemYear) - parseInt(m.year)) <= 1;
                        return true; 
                    });
                    if (!media) media = results.find(item => item.media_type === 'movie' || item.media_type === 'tv');
                }

                if(media) {
                    tmdbId = media.id;
                    mediaType = media.media_type;
                }
            }

            if(tmdbId) {
                let vidRes = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos?api_key=${apiKey}&language=vi-VN`);
                let vidData = await vidRes.json();
                let videos = vidData.results || [];

                if (videos.length === 0) {
                    vidRes = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos?api_key=${apiKey}&language=en-US`);
                    vidData = await vidRes.json();
                    videos = vidData.results || [];
                }

                const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer');
                if (trailer) return `https://www.youtube.com/embed/${trailer.key}`;
            }
        } catch(e) { console.log("Lỗi lấy Trailer TMDB:", e); }
        return null;
    },

    getSafeKey(str) {
        if(!str) return 'Unknown';
        return str.replace(/[.#$\[\]]/g, '_');
    },

    initLatestComments() {
        if(!db) return;
        const section = document.getElementById('latest-comments-section');
        const grid = document.getElementById('latest-comments-grid');
		
		db.ref('comments').off(); // <-- THÊM DÒNG NÀY
        
        db.ref('comments').on('value', snap => {
            const data = snap.val();
            if(!data) {
                if(section) section.style.display = 'none';
                return;
            }
            
            let allComments = [];
            for (let slug in data) {
                for (let cid in data[slug]) {
                    if (typeof data[slug][cid] === 'object' && data[slug][cid].text) {
                        allComments.push({
                            id: cid,
                            slug: slug,
                            ...data[slug][cid]
                        });
                    }
                }
            }
            
            allComments.sort((a, b) => b.id > a.id ? 1 : -1);
            const recentComments = allComments.slice(0, 15);
            
            if (recentComments.length > 0) {
                if(section) section.style.display = 'block';
                grid.innerHTML = recentComments.map(c => {
                    let mName = c.movieName;
                    if (!mName) {
                        if (c.slug === 'goc-review') mName = 'Cộng Đồng';
                        else mName = c.slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    }

                    const ownerKey = c.emailKey || this.getSafeKey(c.name);
                    const ownerData = this.usersData[ownerKey] || {};
                    const currentName = ownerData.displayName || c.name;
                    const currentAvatar = ownerData.avatar || c.avatar;
                    
                    const isPremium = ownerData.isPremium ? true : false;
                    const nameClass = isPremium ? 'premium-name' : '';
                    const avatarPremiumClass = isPremium ? 'premium' : this.getRankClass(ownerKey);
                    
                    const premiumBadgeHtml = this.getFinalBadge(ownerKey, isPremium);

                    const avatarFrame = isPremium && ownerData.avatarFrame && ownerData.avatarFrame !== 'none' ? ownerData.avatarFrame : '';
                    const frameHtml = avatarFrame ? `<div class="avatar-frame ${avatarFrame}"></div>` : '';

                    let renderedText = c.text;
                    if (c.isSpoiler) {
                        renderedText = `
                        <div class="spoiler-wrapper" onclick="event.stopPropagation(); this.classList.add('revealed')" style="min-width: unset; width: 100%; margin-top: 0;">
                            <div class="spoiler-overlay" style="font-size: 11px;"><i class="fas fa-eye-slash"></i> Bị ẩn vì chứa Spoil. Bấm xem!</div>
                            <div class="spoiler-text">${c.text}</div>
                        </div>`;
                    }

                    return `
                        <div class="home-comment-card" style="flex: 0 0 280px; scroll-snap-align: start;" onclick="if(!app.isDragging) { ${c.slug === 'goc-review' ? 'app.showReview()' : `app.showMovie('${c.slug}')`} }">
                            <div class="hc-header">
                                <div class="comment-avatar ${avatarPremiumClass}" style="width:40px; height:40px; flex-shrink: 0; cursor: pointer;" onclick="event.stopPropagation(); app.showUserProfile('${ownerKey}', '${currentName.replace(/'/g, "\\'")}', '${currentAvatar}')" title="Xem hồ sơ ${currentName.replace(/'/g, "\\'")}"><img src="${currentAvatar}" alt="Avatar">${frameHtml}</div>
                                <div class="hc-name" style="display: flex; align-items: center; gap: 4px; flex: 1; flex-wrap: wrap;">
                                    <span class="${nameClass}" style="word-break: break-word;">${currentName}</span>
                                    <span style="flex-shrink: 0; transform: scale(0.85); transform-origin: left center;">${premiumBadgeHtml}</span>
                                </div>
                                <div class="hc-date" style="flex-shrink: 0;">${c.date}</div>
                            </div>
                            <div class="hc-text">${renderedText}</div>
                            <div class="hc-movie"><i class="fas fa-film"></i> ${mName}</div>
                        </div>
                    `;
                }).join('');
                this.observeImages();
                this.enableDragScroll();
            } else {
                if(section) section.style.display = 'none';
            }
        });
    },

    openLeaderboard() {
        document.getElementById('leaderboard-modal').style.display = 'flex';
        this.renderLeaderboard();
    },
    closeLeaderboard() { document.getElementById('leaderboard-modal').style.display = 'none'; },
    
    renderLeaderboard() {
        const list = document.getElementById('leaderboard-list');
        if(!db) { list.innerHTML = '<p style="text-align:center;">Đang kết nối máy chủ...</p>'; return; }
        
        db.ref('users').once('value', snap => {
            const data = snap.val() || {};
            let usersArr = Object.keys(data).map(key => {
                return { id: key, ...data[key] };
            });

            usersArr.forEach(u => {
                u.score = (u.likesReceived || 0) * 2 + (u.comments || 0);
            });

            usersArr.sort((a, b) => b.score - a.score);
            usersArr = usersArr.slice(0, 15);

            if(usersArr.length === 0) {
                list.innerHTML = '<p style="text-align:center; padding: 20px;">Chưa có dữ liệu xếp hạng</p>';
                return;
            }

            list.innerHTML = usersArr.map((u, idx) => {
                let rankIcon = `<span class="rank-num">${idx + 1}</span>`;
                if (idx === 0) rankIcon = `<i class="fas fa-trophy" style="color: #ffd700; font-size: 24px; text-shadow: 0 0 10px rgba(255,215,0,0.5);"></i>`;
                if (idx === 1) rankIcon = `<i class="fas fa-trophy" style="color: #c0c0c0; font-size: 20px;"></i>`;
                if (idx === 2) rankIcon = `<i class="fas fa-trophy" style="color: #cd7f32; font-size: 18px;"></i>`;
                
                let displayNameToDisplay = u.displayName || u.id; 
                const isPremium = u.isPremium ? true : false;
                const nameClass = isPremium ? 'premium-name' : '';
                const premiumBadgeHtml = this.getFinalBadge(u.id, isPremium);
                
                return `
                    <div class="leaderboard-item" style="cursor:pointer;" onclick="app.showUserProfile('${u.id}', '${displayNameToDisplay.replace(/'/g, "\\'")}', '${u.avatar || ''}')" title="Xem hồ sơ">
                        <div class="rank-col">${rankIcon}</div>
                        <div class="user-col">
                            <div class="lb-name"><b class="${nameClass}">${displayNameToDisplay}</b> ${premiumBadgeHtml}</div>
                        </div>
                        <div class="score-col">
                            <div style="font-weight:900; color:var(--accent); font-size: 16px;">${u.score} <span style="font-size:10px; font-weight:normal; color:#888;">Điểm</span></div>
                            <div style="font-size:11px; color:#888; margin-top: 3px;">${u.comments || 0} <i class="fas fa-comment"></i> &nbsp;&nbsp; ${u.likesReceived || 0} <i class="fas fa-heart"></i></div>
                        </div>
                    </div>
                `;
            }).join('');
        });
    },

    openPremiumModal() { 
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return; }
        
        // Reset lại ô nhập mã mỗi khi mở bảng
        const input = document.getElementById('premium-code-input');
        if (input) input.value = '';
        
        document.getElementById('premium-modal').style.display = 'flex'; 
    },
    
    closePremiumModal() { document.getElementById('premium-modal').style.display = 'none'; },

    // HÀM XỬ LÝ MÃ KÍCH HOẠT PREMIUM (BẢO MẬT BẰNG FIREBASE)
    redeemPremiumCode() {
        const email = localStorage.getItem('haruno_email');
        if (!email) return;

        // ---> THÊM LOGIC CHẶN NẾU ĐÃ LÀ PREMIUM <---
        if (app.wasPremium) {
            app.showToast("Tài khoản của bạn đã có đặc quyền Premium rồi!", "warning");
            return; // Dừng lại luôn, không cho nhập mã nữa
        }
        
        const input = document.getElementById('premium-code-input');
        const code = input ? input.value.trim().toUpperCase() : '';

        if(!code) {
            app.showToast("Vui lòng nhập mã kích hoạt!", "error");
            return;
        }

        // Hiệu ứng loading cho nút bấm
        const btn = input.nextElementSibling;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG XỬ LÝ...';
        btn.style.pointerEvents = 'none';

        const safeKey = email.replace(/[.#$\[\]]/g, '_');
        
        // DÁN ĐƯỜNG LINK CLOUDFLARE WORKER CỦA BẠN VÀO ĐÂY:
        const WORKER_URL = "https://throbbing-disk-3bb3.thienbm101102.workers.dev"; 

        // Gửi yêu cầu lên "Bộ não" Cloudflare để xử lý
        fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'redeemPremium', code: code, safeKey: safeKey })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                app.showToast("🎉 " + data.message, "success");
                app.closePremiumModal();
                if (input) input.value = '';
                
                // Cập nhật lại giao diện cục bộ
                const pBadge = document.getElementById('premium-badge');
                if (pBadge) pBadge.style.display = 'inline-block';
            } else {
                app.showToast(data.message, "error");
            }
        })
        .catch(err => {
            app.showToast("Lỗi kết nối đến máy chủ bảo mật!", "error");
            console.error(err);
        })
        .finally(() => {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        });
    },

    // ==========================================
    // LOGIC ADMIN PANEL
    // ==========================================
    switchAdminTab(tabId, btnElement) {
        // Ẩn tất cả nội dung tab
        document.querySelectorAll('.admin-tab-content').forEach(el => {
            el.style.display = 'none';
        });
        // Bỏ active tất cả nút
        document.querySelectorAll('.admin-tab-btn').forEach(el => {
            el.classList.remove('active');
        });
        // Hiện tab được chọn
        const targetTab = document.getElementById('admin-tab-' + tabId);
        if (targetTab) targetTab.style.display = 'block';
        if (btnElement) btnElement.classList.add('active');
    },

    openAdminPanel() {
        this.renderAdminUsers();
        this.renderAdminCodes();
		this.renderAdminOnlineUsers(); // <--- THÊM DÒNG NÀY
        document.getElementById('admin-modal').style.display = 'flex';
        // Tự động focus lại tab mặc định
        const defaultTabBtn = document.querySelector('.admin-tab-btn');
        if (defaultTabBtn) this.switchAdminTab('settings', defaultTabBtn);
    },

    closeAdminPanel() { document.getElementById('admin-modal').style.display = 'none'; },

    // TẠO MÃ NGẪU NHIÊN
    generateRandomCodeStr() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = 'HRN-';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const input = document.getElementById('admin-new-code');
        if(input) input.value = result;
    },

    // ĐẨY MÃ LÊN FIREBASE
    createNewPremiumCode() {
        const input = document.getElementById('admin-new-code');
        const code = input ? input.value.trim().toUpperCase() : '';
        
        if(!code) { this.showToast('Vui lòng nhập hoặc tạo mã ngẫu nhiên!', 'error'); return; }
        if(!db) { this.showToast('Lỗi máy chủ!', 'error'); return; }

        db.ref(`premium_codes/${code}`).set(true).then(() => {
            this.showToast(`Đã tạo mã: ${code}`, 'success');
            input.value = ''; 
        }).catch(err => {
            this.showToast("Lỗi: " + err.message, "error");
        });
    },

    // RENDER DANH SÁCH MÃ TRONG BẢNG ADMIN
    renderAdminCodes() {
        const list = document.getElementById('admin-active-codes');
        if(!list || !db) return;

        db.ref('premium_codes').on('value', snap => {
            const data = snap.val();
            if(!data) {
                list.innerHTML = '<p style="color:#888; font-style: italic; margin-top: 10px;">Chưa có mã kích hoạt nào trên hệ thống.</p>';
                return;
            }
            
            let html = '<div style="display: flex; flex-wrap: wrap; gap: 8px;">';
            for(let code in data) {
                if(data[code] === true) {
                    html += `
                        <span style="background: rgba(255,215,0,0.1); border: 1px solid rgba(255,215,0,0.3); color: #ffd700; padding: 6px 10px; border-radius: 4px; display: inline-flex; align-items: center; gap: 8px; font-weight: bold; font-size: 12px;">
                            ${code} 
                            <i class="fas fa-times-circle" style="cursor: pointer; color: #ff4d4d; font-size: 14px;" onclick="app.deletePremiumCode('${code}')" title="Xóa mã này"></i>
                        </span>`;
                }
            }
            html += '</div>';
            list.innerHTML = html;
        });
    },

    // XÓA MÃ
    deletePremiumCode(code) {
        this.showConfirm(
            '<i class="fas fa-trash" style="color: #ff4d4d;"></i> Xóa Mã Premium', 
            `Bạn có chắc chắn muốn xóa mã ${code} không?`, 
            () => {
                db.ref(`premium_codes/${code}`).remove().then(() => {
                    this.showToast("Đã thu hồi mã thành công!", "success");
                });
            }
        );
    },

    renderAdminUsers() {
        const list = document.getElementById('admin-user-list');
        if(!db) { list.innerHTML = '<p style="text-align:center;">Lỗi kết nối CSDL</p>'; return; }
        
        db.ref('users').once('value', snap => {
            const data = snap.val() || {};
            let html = '';
            
            const usersArr = Object.keys(data).map(key => {
                return { id: key, ...data[key] };
            });

            usersArr.sort((a, b) => (b.likesReceived || 0) - (a.likesReceived || 0));

            usersArr.forEach(u => {
                const c = u.comments || 0;
                const l = u.likesReceived || 0;
                let displayNameToDisplay = u.displayName || u.id; 

                const isPremium = u.isPremium ? true : false;
                const premiumBtnHtml = isPremium 
                    ? `<button class="admin-btn-premium" style="background:#888;" onclick="app.togglePremium('${u.id}', true)" title="Thu hồi Premium"><i class="fas fa-times-circle"></i></button>`
                    : `<button class="admin-btn-premium" onclick="app.togglePremium('${u.id}', false)" title="Cấp Premium"><i class="fas fa-crown"></i></button>`;
                
                html += `
                    <div class="admin-user-item">
                        <span><b>${displayNameToDisplay}</b> ${this.getBadgeHtml(u.id)} ${isPremium ? '<i class="fas fa-crown" style="color:#ffd700; font-size:10px;"></i>' : ''}</span>
                        <span><input type="number" id="admin-cmt-${u.id}" value="${c}"></span>
                        <span><input type="number" id="admin-like-${u.id}" value="${l}"></span>
                        <span>
                            ${premiumBtnHtml}
                            <button class="admin-btn-save" onclick="app.updateUser('${u.id}')" title="Lưu điểm"><i class="fas fa-save"></i></button>
                            <button class="admin-btn-del" onclick="app.deleteUser('${u.id}')" title="Xoá người dùng"><i class="fas fa-trash"></i></button>
                        </span>
                    </div>
                `;
            });
            list.innerHTML = html || '<p style="text-align:center;">Chưa có người dùng nào</p>';
        });
    },

    togglePremium(safeKey, currentStatus) {
        const title = currentStatus ? '<i class="fas fa-times-circle" style="color: #888;"></i> Thu hồi Premium' : '<i class="fas fa-crown" style="color: #ffd700;"></i> Cấp Premium';
        const desc = currentStatus 
            ? 'Bạn muốn THU HỒI đặc quyền Premium của người dùng này?' 
            : 'Bạn muốn CẤP đặc quyền Premium cho người dùng này?';
        
        this.showConfirm(title, desc, () => {
            // Yêu cầu nhập Mật khẩu cấp 2 (Mã PIN)
            const adminPass = prompt("XÁC THỰC ADMIN: Vui lòng nhập mã PIN bảo mật:");
            if (!adminPass) {
                app.showToast("Đã hủy thao tác vì không có mã PIN!", "warning");
                return;
            }
            
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'adminTogglePremium',
                    targetKey: safeKey,
                    newStatus: !currentStatus,
                    adminPass: adminPass // Gửi mã PIN lên Cloudflare kiểm tra
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    app.showToast(currentStatus ? "Đã thu hồi Premium!" : "Cấp Premium thành công!", "success");
                    this.renderAdminUsers(); 
                } else {
                    // Nếu nhập sai PIN, Worker sẽ trả về lỗi
                    app.showToast(data.message || "Lỗi quyền truy cập Server!", "error");
                }
            })
            .catch(err => {
                app.showToast("Lỗi kết nối máy chủ Cloudflare!", "error");
            });
        });
    },

    updateUser(safeKey) {
        const c = parseInt(document.getElementById(`admin-cmt-${safeKey}`).value) || 0;
        const l = parseInt(document.getElementById(`admin-like-${safeKey}`).value) || 0;
        
        db.ref('users/' + safeKey).update({ comments: c, likesReceived: l }).then(() => {
            app.showToast("Đã lưu thay đổi điểm thành công!", "success");
            this.renderAdminUsers();
        }).catch(err => {
            app.showToast("Lỗi khi lưu: " + err.message, "error");
        });
    },

    deleteUser(safeKey) {
        this.showConfirm(
            '<i class="fas fa-user-times" style="color: #f44336;"></i> Xóa người dùng', 
            `Bạn có chắc chắn muốn xóa vĩnh viễn user <b>${safeKey}</b>? Mọi dữ liệu của người này sẽ biến mất và không thể hoàn tác.`, 
            () => {
                db.ref('users/' + safeKey).remove().then(() => {
                    app.showToast("Đã trảm người dùng thành công!", "success");
                    this.renderAdminUsers();
                }).catch(err => {
                    app.showToast("Không thể xóa: " + err.message, "error");
                });
            }
        );
    },

    getRankClass(identifier) {
        const safeKey = this.getSafeKey(identifier);
        if (safeKey === this.getSafeKey(ADMIN_EMAIL) || identifier === ADMIN_NAME || identifier === 'ADMIN') return 'admin';
        const stats = this.usersData[safeKey] || { comments: 0, likesReceived: 0 };
        const c = stats.comments || 0;
        const l = stats.likesReceived || 0;

        if (l >= 200 || c >= 500) return 'legend';
        if (l >= 100 || c >= 200) return 'master';
        if (l >= 50 || c >= 100) return 'vip';
        if (l >= 20 || c >= 50) return 'elite';
        if (c >= 20) return 'expert';
        if (c >= 5) return 'fan';
        return 'newbie';
    },

    getBadgeHtml(identifier) {
        const safeKey = this.getSafeKey(identifier);
        if (safeKey === this.getSafeKey(ADMIN_EMAIL) || identifier === ADMIN_NAME || identifier === 'ADMIN') return `<span class="user-badge badge-admin"><i class="fas fa-shield-alt"></i> Quản Trị Viên</span>`;
        
        const stats = this.usersData[safeKey] || { comments: 0, likesReceived: 0 };
        const c = stats.comments || 0;
        const l = stats.likesReceived || 0;

        if (l >= 200 || c >= 500) return `<span class="user-badge badge-legend"><i class="fas fa-gem"></i> Huyền Thoại</span>`;
        if (l >= 100 || c >= 200) return `<span class="user-badge badge-master"><i class="fas fa-dragon"></i> Cao Thủ</span>`;
        if (l >= 50 || c >= 100) return `<span class="user-badge badge-vip"><i class="fas fa-crown"></i> VIP</span>`;
        if (l >= 20 || c >= 50) return `<span class="user-badge badge-elite"><i class="fas fa-meteor"></i> Tinh Anh</span>`;
        if (c >= 20) return `<span class="user-badge badge-expert"><i class="fas fa-medal"></i> Chuyên Gia</span>`;
        if (c >= 5) return `<span class="user-badge badge-fan"><i class="fas fa-star"></i> Mọt Phim</span>`;
        return `<span class="user-badge badge-newbie"><i class="fas fa-seedling"></i> Tân Binh</span>`;
    },
	// HÀM MỚI: ƯU TIÊN HUY HIỆU ADMIN > PREMIUM > BÌNH THƯỜNG
    getFinalBadge(identifier, isPremium) {
        const safeKey = this.getSafeKey(identifier);
        let baseBadge = this.getBadgeHtml(identifier);
        
        // Xử lý huy hiệu Cơ bản (Admin / Premium / User thường)
        if (!baseBadge.includes('badge-admin') && isPremium) {
            baseBadge = `<span class="user-badge badge-premium"><i class="fas fa-gem" style="color: #ffd700; margin-right: 4px; position: relative; z-index: 10; text-shadow: 0 0 5px rgba(255,215,0,0.8);"></i><span class="vip-text">PREMIUM</span></span>`;
        }
        
        // Xử lý cấp thêm huy hiệu TOP 1, 2, 3
        let topBadge = '';
        const rank = this.topContributors ? this.topContributors[safeKey] : null;
        if (rank === 1) topBadge = `<span class="user-badge badge-top-1" title="Top 1 Bảng Phong Thần"><i class="fas fa-trophy"></i> TOP 1</span>`;
        else if (rank === 2) topBadge = `<span class="user-badge badge-top-2" title="Top 2 Bảng Phong Thần"><i class="fas fa-trophy"></i> TOP 2</span>`;
        else if (rank === 3) topBadge = `<span class="user-badge badge-top-3" title="Top 3 Bảng Phong Thần"><i class="fas fa-trophy"></i> TOP 3</span>`;

        // Ghép cả 2 huy hiệu lại với nhau
        return baseBadge + (topBadge ? ' ' + topBadge : '');
    },

    initLazyLoad() {
        if ('IntersectionObserver' in window) {
            this.lazyObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                            img.onload = () => img.classList.add('loaded');
                        }
                        observer.unobserve(img);
                    }
                });
            }, { rootMargin: '200px' });
        }
    },
    observeImages() {
        if (this.lazyObserver) {
            document.querySelectorAll('img.lazyload').forEach(img => {
                this.lazyObserver.observe(img);
            });
        }
    },

    syncDataToCloud(type, data) {
        const email = localStorage.getItem('haruno_email');
        if (!email || !db) return;
        const safeUser = this.getSafeKey(email);
        db.ref(`users_data/${safeUser}/${type}`).set(data);
    },

    syncDataFromCloud() {
        const email = localStorage.getItem('haruno_email');
        if (!email || !db) return;
        const safeUser = this.getSafeKey(email);
        
        // SỬA ĐOẠN WATCHLIST
        db.ref(`users_data/${safeUser}/watchlist`).once('value', snap => {
            if (snap.exists()) {
                let data = snap.val();
                if (!Array.isArray(data)) data = Object.values(data);
                
                // BỘ LỌC THẦN THÁNH: Loại bỏ rác, null, undefined do xóa lỗi trên Firebase
                data = data.filter(item => item && typeof item === 'object' && item.slug);
                
                localStorage.setItem('haruno_watchlist', JSON.stringify(data));
                // Tự động ghi đè bản sạch lên Firebase để vá lỗi vĩnh viễn
                this.syncDataToCloud('watchlist', data);
            } else {
                localStorage.removeItem('haruno_watchlist');
            }
            this.renderWatchlist();
            if (this.currentMovieSlug) this.checkMovieSaved(this.currentMovieSlug);
        });
        
        // SỬA ĐOẠN HISTORY
        db.ref(`users_data/${safeUser}/history`).once('value', snap => {
            if (snap.exists()) {
                let data = snap.val();
                if (!Array.isArray(data)) data = Object.values(data);
                
                // BỘ LỌC THẦN THÁNH: Loại bỏ rác, null, undefined
                data = data.filter(item => item && typeof item === 'object' && item.slug);
                
                localStorage.setItem('haruno_history', JSON.stringify(data));
                // Tự động ghi đè bản sạch lên Firebase
                this.syncDataToCloud('history', data);
            } else {
                localStorage.removeItem('haruno_history');
            }
            this.renderHistory();
        });
    },

    listenUsers() {
        if(!db) return;
        db.ref('users').on('value', snap => {
            this.usersData = snap.val() || {};
			this.calculateTopContributors(); // Gọi hàm tính điểm mỗi khi có người bình luận/like mới
        });
    },
	
	// --- HÀM MỚI: TÍNH TOÁN TOP 3 ĐÓNG GÓP ---
    calculateTopContributors() {
        let usersArr = Object.keys(this.usersData).map(key => {
            return { id: key, ...this.usersData[key] };
        });

        // Công thức tính điểm y hệt Bảng Phong Thần: 1 Like = 2 Điểm, 1 Comment = 1 Điểm
        usersArr.forEach(u => {
            u.score = (u.likesReceived || 0) * 2 + (u.comments || 0);
        });

        // Sắp xếp giảm dần theo điểm
        usersArr.sort((a, b) => b.score - a.score);
        
        // Lấy Top 3 người có điểm > 0
        this.topContributors = {};
        if (usersArr.length > 0 && usersArr[0].score > 0) this.topContributors[usersArr[0].id] = 1;
        if (usersArr.length > 1 && usersArr[1].score > 0) this.topContributors[usersArr[1].id] = 2;
        if (usersArr.length > 2 && usersArr[2].score > 0) this.topContributors[usersArr[2].id] = 3;
    },
    
    // --- THÊM HÀM NÀY VÀO ĐÂY ---
    currentUserPresenceRef: null,
    currentOnlineUsers: [],
    currentOnlineCount: 0,

    initPresence() {
        if(!db) return;
        const presenceRef = db.ref('.info/connected');
        
        // Khi trình duyệt bắt được tín hiệu mạng
        presenceRef.on('value', (snap) => {
            if (snap.val() === true) {
                this.updatePresence();
            }
        });

        // Lắng nghe danh sách đang online trên toàn web
        db.ref('online_users').on('value', (snap) => {
            const data = snap.val();
            let count = 0;
            let onlineList = [];
            
            if (data) {
                for (let key in data) {
                    count++;
                    if (!data[key].isGuest) {
                        onlineList.push(data[key]);
                    }
                }
            }
            
            this.currentOnlineCount = count;
            const countEl = document.getElementById('online-count');
            if (countEl) countEl.innerText = count;
            
            // Lọc các user hợp lệ (bỏ trùng lặp nếu họ mở 2, 3 tab trên máy)
            this.currentOnlineUsers = Array.from(new Map(onlineList.map(item => [item.emailKey, item])).values());
            
            // Nếu bạn (Admin) đang mở bảng xem online thì tự update danh sách mới nhất
            this.renderAdminOnlineUsers();
        });
    },

    updatePresence() {
        if(!db) return;
        const listRef = db.ref('online_users');
        
        // Xóa dấu vết cũ trước khi tạo tín hiệu online mới
        if (this.currentUserPresenceRef) {
            this.currentUserPresenceRef.remove();
            this.currentUserPresenceRef.onDisconnect().cancel();
        }

        const email = localStorage.getItem('haruno_email');
        const user = localStorage.getItem('haruno_user');
        const avatar = localStorage.getItem('haruno_avatar');

        this.currentUserPresenceRef = listRef.push();
        this.currentUserPresenceRef.onDisconnect().remove();

        if (email) {
            // Có tài khoản -> Báo danh bằng tên & avatar
            this.currentUserPresenceRef.set({
                name: user,
                avatar: avatar,
                isGuest: false,
                emailKey: this.getSafeKey(email)
            });
        } else {
            // Không có tài khoản -> Chỉ là khách
            this.currentUserPresenceRef.set({ isGuest: true });
        }
    },

    renderAdminOnlineUsers() {
        const totalEl = document.getElementById('admin-total-online');
        const listEl = document.getElementById('admin-online-list');
        if (!totalEl || !listEl) return;

        totalEl.innerText = this.currentOnlineCount;
        
        if (this.currentOnlineUsers.length === 0) {
            listEl.innerHTML = '<p style="color:#888; text-align:center; padding: 20px;">Chỉ có Khách ẩn danh đang truy cập.</p>';
            return;
        }

        // Đổ danh sách user online ra giao diện
        listEl.innerHTML = this.currentOnlineUsers.map(u => {
            const safeKey = u.emailKey;
            const ownerData = this.usersData[safeKey] || {};
            const isPremium = ownerData.isPremium ? true : false;
            const nameClass = isPremium ? 'premium-name' : '';
            const avatarPremiumClass = isPremium ? 'premium' : this.getRankClass(safeKey);
            const premiumBadgeHtml = this.getFinalBadge(safeKey, isPremium);
            
            return `
                <div style="display: flex; align-items: center; gap: 15px; background: rgba(255,255,255,0.03); padding: 10px 15px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); transition: 0.3s;" class="admin-user-item">
                    <div class="comment-avatar" style="width: 40px; height: 40px;"><img src="${u.avatar}" alt="Avatar"></div>
                    <div style="flex: 1; text-align: left;">
                        <div style="font-weight: bold; font-size: 14px; margin-bottom: 3px;" class="${nameClass}">${u.name}</div>
                        <div style="font-size: 11px; color: #4caf50;"><i class="fas fa-circle" style="font-size: 8px; animation: blinkDot 1.5s infinite;"></i> Đang hoạt động</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    listenNotifications() {
        const email = localStorage.getItem('haruno_email');
        const wrapper = document.getElementById('notif-wrapper');
        if(!email || !db) {
            if(wrapper) wrapper.style.display = 'none';
            return;
        }
        
        if(wrapper) wrapper.style.display = 'flex';
        const safeUser = this.getSafeKey(email);

        db.ref('notifications/' + safeUser).on('value', snap => {
            let notifs = [];
            snap.forEach(child => { notifs.push({id: child.key, ...child.val()}) });
            notifs.reverse(); 
            
            const unreadCount = notifs.filter(n => !n.read).length;
            const badge = document.getElementById('notif-badge');
            if (badge) {
                badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
                badge.style.display = unreadCount > 0 ? 'block' : 'none';
            }
            
            const drop = document.getElementById('notif-dropdown');
            if (drop) {
                if (notifs.length === 0) {
                    drop.innerHTML = '<div style="padding:20px;text-align:center;color:#888;font-size:13px;">Chưa có thông báo nào !!!</div>';
                } else {
                    const headerHtml = `
                        <div class="notif-header">
                            <span>Thông Báo Của Bạn</span>
                            <span class="notif-mark-read" onclick="app.markAllNotifRead()">Đánh dấu đã đọc</span>
                        </div>
                    `;
                    const itemsHtml = notifs.map(n => `
                        <div class="notif-item ${n.read ? '' : 'unread'}" onclick="app.readNotif('${n.id}', '${n.movieSlug}')">
                            <div class="notif-icon">${n.type === 'like' ? '<i class="fas fa-heart" style="color:var(--accent)"></i>' : '<i class="fas fa-reply" style="color:#4dabf7"></i>'}</div>
                            <div class="notif-content">
                                <p><b>${n.from}</b> đã ${n.type === 'like' ? 'thích' : 'trả lời'} bình luận của bạn trong phim <b>${n.movieName}</b></p>
                                <span>${n.date}</span>
                            </div>
                        </div>
                    `).join('');
                    drop.innerHTML = headerHtml + itemsHtml;
                }
            }
        });
    },

    toggleNotif(e) {
        if(e) e.stopPropagation();
        const drop = document.getElementById('notif-dropdown');
        if(drop) {
            const isActive = drop.classList.contains('active');
            document.getElementById('search-results-dropdown').style.display = 'none'; 
            if(isActive) drop.classList.remove('active');
            else drop.classList.add('active');
        }
    },

    readNotif(id, slug) {
        const email = localStorage.getItem('haruno_email');
        if(email && db) {
            const safeUser = this.getSafeKey(email);
            db.ref('notifications/' + safeUser + '/' + id + '/read').set(true);
        }
        const drop = document.getElementById('notif-dropdown');
        if(drop) drop.classList.remove('active');
        
        if (slug === 'goc-review') this.showReview();
        else this.showMovie(slug);
    },

    markAllNotifRead() {
        const email = localStorage.getItem('haruno_email');
        if(!email || !db) return;
        const safeUser = this.getSafeKey(email);
        
        db.ref('notifications/' + safeUser).once('value', snap => {
            snap.forEach(child => {
                child.ref.update({ read: true });
            });
        });
    },

    toggleUserMenu(e) {
        if(e) e.stopPropagation();
        const drop = document.getElementById('user-menu-dropdown');
        if(drop) {
            drop.classList.toggle('active');
        }
        const notifDrop = document.getElementById('notif-dropdown');
        if(notifDrop) notifDrop.classList.remove('active');
        document.getElementById('search-results-dropdown').style.display = 'none';
    },
    
	// --- HỆ THỐNG CỬA HÀNG ---
    openShop() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return; }
        
        const safeUser = this.getSafeKey(email);
        if(db) {
            db.ref(`users/${safeUser}/coins`).on('value', snap => {
                document.getElementById('shop-user-coins').innerText = snap.val() || 0;
            });
        }

        // ==========================================
        // LOGIC KHÓA NÚT MUA NẾU ĐÃ SỞ HỮU
        // ==========================================
        const inventory = JSON.parse(localStorage.getItem('haruno_inventory') || '{}');

        const checkShopButton = (btnId, itemValue, originalPrice) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            
            if (inventory[itemValue]) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-check"></i> Đã Sở Hữu';
                btn.style.background = '#555'; 
                btn.style.color = '#ccc';
                btn.style.cursor = 'not-allowed';
                btn.style.boxShadow = 'none';
            } else {
                btn.disabled = false;
                btn.innerHTML = `<span>${originalPrice}</span> <i class="fas fa-coins"></i> HCoins`;
                btn.style.background = ''; // Trả lại màu gốc
                btn.style.color = '';
                btn.style.cursor = 'pointer';
                btn.style.boxShadow = '';
            }
        };

        // Quét từng vật phẩm hiện có trong shop
        checkShopButton('btn-shop-premium-lifetime', '3_days', 2000);
		////////////
        checkShopButton('btn-shop-effect-tinhnghich', 'effect-tinhnghich', 700);
		checkShopButton('btn-shop-effect-spiderman', 'effect-spiderman', 700);
		checkShopButton('btn-shop-effect-venom', 'effect-venom', 700);
		checkShopButton('btn-shop-effect-gomah', 'effect-gomah', 700);
		checkShopButton('btn-shop-effect-goku', 'effect-goku', 700);
		checkShopButton('btn-shop-effect-vegeta', 'effect-vegeta', 700);
		checkShopButton('btn-shop-effect-piccolo', 'effect-piccolo', 700);
		////////////
        checkShopButton('btn-shop-frame-yunara', 'frame-yunara', 500);
        checkShopButton('btn-shop-frame-shoto', 'frame-shoto', 500);
		checkShopButton('btn-shop-frame-pandora', 'frame-pandora', 500);
		checkShopButton('btn-shop-frame-shenron', 'frame-shenron', 500);
		checkShopButton('btn-shop-frame-spiderman', 'frame-spiderman', 500);
		checkShopButton('btn-shop-frame-venom', 'frame-venom', 500);
		checkShopButton('btn-shop-frame-ngocrong', 'frame-ngocrong', 500);
		checkShopButton('btn-shop-frame-gomah', 'frame-gomah', 500);
		checkShopButton('btn-shop-frame-goku', 'frame-goku', 500);
		checkShopButton('btn-shop-frame-vegeta', 'frame-vegeta', 500);
		checkShopButton('btn-shop-frame-glorio', 'frame-glorio', 500);
		checkShopButton('btn-shop-frame-kai', 'frame-kai', 500);
		checkShopButton('btn-shop-frame-piccolo', 'frame-piccolo', 500);
		checkShopButton('btn-shop-frame-panzy', 'frame-panzy', 500);
		checkShopButton('btn-shop-frame-bantim', 'frame-bantim', 500);
		checkShopButton('btn-shop-frame-doichan', 'frame-doichan', 500);
		checkShopButton('btn-shop-frame-um', 'frame-um', 500);
		checkShopButton('btn-shop-frame-banphim', 'frame-banphim', 500);
		checkShopButton('btn-shop-frame-slay', 'frame-slay', 500);
		checkShopButton('btn-shop-frame-andam', 'frame-andam', 500);
		checkShopButton('btn-shop-frame-ngamsao', 'frame-ngamsao', 500);
		checkShopButton('btn-shop-frame-thucan', 'frame-thucan', 500);
		checkShopButton('btn-shop-frame-nani', 'frame-nani', 500);
		////////////
		checkShopButton('btn-shop-chat-1', 'chat-effect-1', 500);
		checkShopButton('btn-shop-chat-2', 'chat-effect-2', 500);
		checkShopButton('btn-shop-chat-3', 'chat-effect-3', 500);
		checkShopButton('btn-shop-chat-4', 'chat-effect-4', 500);
		checkShopButton('btn-shop-chat-5', 'chat-effect-5', 500);
		checkShopButton('btn-shop-chat-6', 'chat-effect-6', 500);
		checkShopButton('btn-shop-chat-7', 'chat-effect-7', 500);
		
        // ==========================================

        document.getElementById('shop-modal').style.display = 'flex';
    },
	closeShop() {
        document.getElementById('shop-modal').style.display = 'none';
    },
	
	// --- HỆ THỐNG MINIGAME: CARO 1V1 ---
    caroRoomId: null,
    caroMySymbol: null,
    caroBoardSize: 15,

    openCaroLobby() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return; }
        document.getElementById('caro-lobby-modal').style.display = 'flex';
        this.listenCaroRooms();
    },

    closeCaroLobby() {
        document.getElementById('caro-lobby-modal').style.display = 'none';
        if (db) {
            // TẮT ĐÚNG QUERY ĐỂ GIẢI PHÓNG LISTENER
            db.ref('caro_rooms').orderByChild('status').equalTo('waiting').off();
        }
    },

    listenCaroRooms() {
        if (!db) return;
        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);

        const query = db.ref('caro_rooms').orderByChild('status').equalTo('waiting');
        
        // BƯỚC QUAN TRỌNG: Tắt listener cũ trước khi tạo cái mới
        query.off();

        query.on('value', snap => {
            const listEl = document.getElementById('caro-room-list');
            listEl.innerHTML = ''; // Clear danh sách

            if (!snap.exists()) {
                listEl.innerHTML = '<div style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px;">Chưa có phòng nào. Hãy tạo phòng mới!</div>';
                return;
            }

            listEl.innerHTML = ''; // Clear danh sách

            if (!snap.exists()) {
                listEl.innerHTML = '<div style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px;">Chưa có phòng nào. Hãy tạo phòng mới!</div>';
                return;
            }

            let htmlString = ''; // TẠO BIẾN LƯU CHUỖI TẠM
            snap.forEach(child => {
                const room = child.val();
                const roomId = child.key;
                const safePlayer = room.player1.split('_')[0];

                // --- DỌN DẸP PHÒNG CHỜ BỊ BỎ HOANG ---
                if (room.status === 'waiting' && room.connections && room.connections[room.player1] === false) {
                    db.ref(`caro_rooms/${roomId}`).remove();
                    return;
                }
                
                // KIỂM TRA: Nếu phòng này do chính mình tạo
                if (room.player1 === safeUser) {
                    htmlString += `
                        <div class="glass-caro-room" style="border-color: #ffd700;">
                            <div>
                                <div style="color: #ffd700; font-weight: bold; font-size: 15px; margin-bottom: 4px;">Phòng của bạn (Đang chờ)</div>
                                <div style="color: #ffd700; font-size: 13px;"><i class="fas fa-coins"></i> Cược: ${room.bet} HCoins</div>
                            </div>
                            <button onclick="app.exitStuckRoom('${roomId}', ${room.bet})" style="padding: 10px 20px; background: rgba(255, 77, 77, 0.1); color: #ff4d4d; border: 1px solid #ff4d4d; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;">
                                <i class="fas fa-trash"></i> HỦY PHÒNG
                            </button>
                        </div>
                    `;
                } else {
                    // Phòng của người khác
                    htmlString += `
                        <div class="glass-caro-room">
                            <div>
                                <div style="color: #fff; font-weight: bold; font-size: 15px; margin-bottom: 4px;">Phòng của ${safePlayer}</div>
                                <div style="color: #00ffcc; font-size: 13px;"><i class="fas fa-coins"></i> Cược: ${room.bet} HCoins</div>
                            </div>
                            <button onclick="app.joinCaroRoom('${roomId}', ${room.bet})" style="padding: 10px 20px; background: rgba(0, 255, 204, 0.1); color: #00ffcc; border: 1px solid #00ffcc; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;" onmouseover="this.style.background='#00ffcc'; this.style.color='#000';" onmouseout="this.style.background='rgba(0, 255, 204, 0.1)'; this.style.color='#00ffcc';">
                                <i class="fas fa-sign-in-alt"></i> VÀO CHƠI
                            </button>
                        </div>
                    `;
                }
            });
            listEl.innerHTML = htmlString; // CHỈ CẬP NHẬT DOM ĐÚNG 1 LẦN CUỐI CÙNG);
        });
    },

    exitStuckRoom(roomId, betAmount) {
        if(db) {
            db.ref(`caro_rooms/${roomId}`).remove().then(() => {
                // Gọi API hoàn lại HCoins
                const email = localStorage.getItem('haruno_email');
                const safeUser = this.getSafeKey(email);
                fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: betAmount })
                });
                
                this.showToast("Đã hủy phòng và hoàn lại " + betAmount + " HCoins!", "success");
            });
        }
    },

    createCaroRoom() {
        const email = localStorage.getItem('haruno_email');
        const betAmount = parseInt(document.getElementById('caro-bet-amount').value);
        if (isNaN(betAmount) || betAmount <= 0) {
            this.showToast("Nhập số HCoins hợp lệ!", "error"); return;
        }
        
        const safeUser = this.getSafeKey(email);
        
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: betAmount })
        }).then(res => res.json()).then(data => {
            if (!data.success) { this.showToast("Không đủ HCoins!", "error"); return; }
            
            const newRoomRef = db.ref('caro_rooms').push();
            // XÓA DÒNG CŨ: newRoomRef.onDisconnect().remove();

            newRoomRef.set({
                player1: safeUser, player2: '', bet: betAmount, 
                status: 'waiting', turn: 'X', moves: {},
                connections: { [safeUser]: true } // THÊM: Theo dõi kết nối
            });
            
            // THÊM: Nếu P1 đóng tab thì đánh dấu là false
            newRoomRef.child(`connections/${safeUser}`).onDisconnect().set(false);
            
            this.caroRoomId = newRoomRef.key;
            this.caroMySymbol = 'X';
            this.enterCaroGameUI(betAmount * 2, safeUser, '');
        });
    },

    joinCaroRoom(roomId, betAmount) {
        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);

        // Lớp bảo vệ chống tự join phòng mình
        db.ref(`caro_rooms/${roomId}`).once('value').then(snap => {
            const room = snap.val();
            if(!room || room.status !== 'waiting') {
                this.showToast("Phòng không tồn tại hoặc đã có người!", "error");
                return;
            }
            if(room.player1 === safeUser) {
                this.showToast("Bạn không thể tự chơi với chính mình!", "error");
                return;
            }

            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: betAmount })
            }).then(res => res.json()).then(data => {
                if (!data.success) { this.showToast("Không đủ HCoins!", "error"); return; }
                
                const roomRef = db.ref(`caro_rooms/${roomId}`);

                roomRef.update({ 
                    player2: safeUser, 
                    status: 'playing',
                    [`connections/${safeUser}`]: true // THÊM: Theo dõi kết nối P2
                });
				
				roomRef.child(`connections/${safeUser}`).onDisconnect().set(false);
                
                this.caroRoomId = roomId;
                this.caroMySymbol = 'O';
                this.enterCaroGameUI(betAmount * 2, 'Đối thủ', safeUser);
            });
        });
    },

    enterCaroGameUI(totalPot, p1, p2) {
        this.closeCaroLobby();
        document.getElementById('caro-game-modal').style.display = 'flex';
        document.getElementById('caro-pot').innerText = totalPot;
        this.initCaroBoard();
        this.listenCaroGame();
    },

    initCaroBoard() {
        const board = document.getElementById('caro-board');
        board.innerHTML = '';
        for (let r = 0; r < this.caroBoardSize; r++) {
            for (let c = 0; c < this.caroBoardSize; c++) {
                const cell = document.createElement('div');
                cell.className = 'glass-caro-cell'; // Sử dụng class kính ảo mới
                cell.dataset.r = r; cell.dataset.c = c;
                cell.onclick = () => this.playCaroMove(r, c);
                board.appendChild(cell);
            }
        }
    },

    listenCaroGame() {
        if (!db || !this.caroRoomId) return;
        db.ref(`caro_rooms/${this.caroRoomId}`).on('value', snap => {
            const room = snap.val();
            if (!room) {
                // Nếu phòng bị xóa (do đối thủ thoát), tự động đóng UI để không bị kẹt
                if (document.getElementById('caro-game-modal').style.display === 'flex') {
                    app.showToast("Phòng chơi đã bị đóng!", "warning");
                    document.getElementById('caro-game-modal').style.display = 'none';
                    this.caroRoomId = null;
                }
                return;
            }
            const email = localStorage.getItem('haruno_email'); // Lấy email
            const safeUser = this.getSafeKey(email); // Lấy safeUser

            // --- LOGIC XỬ LÝ KHI ĐỐI THỦ ĐÓNG TAB (HOẶC MẠNG CHẬP CHỜN) ---
            if (room.status === 'playing' && room.connections) {
                // 1. Tự động cứu vãn kết nối của bản thân nếu rớt mạng chập chờn
                if (room.connections[safeUser] === false) {
                    db.ref(`caro_rooms/${this.caroRoomId}/connections/${safeUser}`).set(true);
                    db.ref(`caro_rooms/${this.caroRoomId}/connections/${safeUser}`).onDisconnect().set(false);
                }

                const otherPlayer = (room.player1 === safeUser) ? room.player2 : room.player1;
                
                // 2. Xử lý khi đối thủ mất kết nối (Cho 10 giây ân hạn)
                if (room.connections[otherPlayer] === false) {
                    if (!app.caroDisconnectTimer) {
                        app.showToast("⏳ Đối thủ có vẻ đang mất mạng. Chờ tối đa 10 giây...", "warning");
                        app.caroDisconnectTimer = setTimeout(() => {
                            db.ref(`caro_rooms/${this.caroRoomId}`).once('value').then(latestSnap => {
                                const latestRoom = latestSnap.val();
                                if (latestRoom && latestRoom.status === 'playing' && latestRoom.connections && latestRoom.connections[otherPlayer] === false) {
                                    app.showToast("Đối thủ đã bỏ chạy! Bạn được xử thắng.", "success");
                                    fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: room.bet * 2 })
                                    });
                                    db.ref(`caro_rooms/${this.caroRoomId}`).update({
                                        status: 'finished',
                                        winner: safeUser,
                                        [`connections/${otherPlayer}`]: null 
                                    });
                                }
                            });
                            app.caroDisconnectTimer = null;
                        }, 10000); // Đợi 10 giây
                    }
                } else {
                    // 3. Hủy đếm giờ nếu đối thủ đã kết nối lại kịp thời
                    if (app.caroDisconnectTimer) {
                        clearTimeout(app.caroDisconnectTimer);
                        app.caroDisconnectTimer = null;
                        app.showToast("Đối thủ đã kết nối lại. Tiếp tục thôi!", "success");
                    }
                }
            }
            // ---------------------------------------------------

            // HÀM PHỤ TRỢ: Cập nhật Avatar Caro (Bọc khung chuẩn & Gán sự kiện xem hồ sơ gốc)
            const updateCaroPlayerUI = (playerKey, isX) => {
                const suffix = isX ? 'x' : 'o';
                let pData = {}, pName = 'Đang chờ...', pAvatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=waiting';
                
                if (playerKey) {
                    pData = this.usersData[playerKey] || {};
                    pName = pData.displayName || playerKey.split('_')[0];
                    pAvatar = pData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${playerKey}`;
                }
                
                document.getElementById(`caro-player-${suffix}-name`).innerText = pName;
                
                let isPremium = pData.isPremium ? true : false;
                let rankClass = isPremium ? 'premium' : '';
                let avatarFrame = isPremium && pData.avatarFrame && pData.avatarFrame !== 'none' ? pData.avatarFrame : '';
                let frameHtml = avatarFrame ? `<div class="avatar-frame ${avatarFrame}"></div>` : '';
                
                const imgEl = document.getElementById(`avatar-player-${suffix}`);
                const wrapEl = document.getElementById(`avatar-player-${suffix}-wrap`);
                
                // Nếu thẻ img chưa được bọc thẻ div khung -> Tạo mới để bọc lại
                if (imgEl && !wrapEl) {
                    imgEl.outerHTML = `
                        <div id="avatar-player-${suffix}-wrap" class="comment-avatar ${rankClass}" style="width: 55px; height: 55px; margin: 0 auto 10px; ${playerKey ? 'cursor: pointer;' : ''} transition: 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" ${playerKey ? `onclick="app.showUserProfile('${playerKey}', '${pName.replace(/'/g, "\\'")}', '${pAvatar}')"` : ''} title="${playerKey ? 'Xem hồ sơ' : ''}">
                            <img id="avatar-player-${suffix}" src="${pAvatar}" style="border: 2px solid #fff; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; position: relative; z-index: 2;">
                            ${frameHtml}
                        </div>
                    `;
                } else if (wrapEl) {
                    // Đã bọc rồi thì chỉ thay đổi Class và Nội dung bên trong
                    wrapEl.className = `comment-avatar ${rankClass}`;
                    if (playerKey) {
                        wrapEl.setAttribute('onclick', `app.showUserProfile('${playerKey}', '${pName.replace(/'/g, "\\'")}', '${pAvatar}')`);
                        wrapEl.style.cursor = 'pointer';
                    } else {
                        wrapEl.removeAttribute('onclick');
                        wrapEl.style.cursor = 'default';
                    }
                    wrapEl.innerHTML = `
                        <img id="avatar-player-${suffix}" src="${pAvatar}" style="border: 2px solid #fff; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; position: relative; z-index: 2;">
                        ${frameHtml}
                    `;
                }
            };

            // Gọi hàm cập nhật cho cả 2 người chơi
            updateCaroPlayerUI(room.player1, true);
            updateCaroPlayerUI(room.player2, false);

            // HIỆU ỨNG PHÁT SÁNG THEO LƯỢT
            const cardX = document.getElementById('card-player-x');
            const cardO = document.getElementById('card-player-o');
            if (room.turn === 'X') {
                if (cardX) cardX.classList.add('active-turn');
                if (cardO) cardO.classList.remove('active-turn');
            } else {
                if (cardO) cardO.classList.add('active-turn');
                if (cardX) cardX.classList.remove('active-turn');
            }

            // CẬP NHẬT TEXT TRẠNG THÁI VÀ NÚT CHƠI LẠI
            const statusEl = document.getElementById('caro-status');
            const radar = document.getElementById('caro-radar');
            const rematchBtn = document.getElementById('btn-caro-rematch');
            
            if (room.status === 'waiting') {
                statusEl.innerText = "Đang chờ đối thủ vào phòng...";
                if (radar) radar.style.display = 'block';
                if (rematchBtn) rematchBtn.style.display = 'none';
            } else if (room.status === 'finished') {
                // SỬA LỖI: Lấy chính xác tên người thắng từ dữ liệu phòng
                let winnerName = room.winner;
                if (room.winner) {
                    const wData = this.usersData[room.winner] || {};
                    winnerName = wData.displayName || room.winner.split('_')[0];
                }
                
                // SỬA FIX LỖI: Tránh crash game nếu không lấy được tên, kèm theo báo lý do kết thúc
                let safeWinnerName = winnerName || 'ĐỐI THỦ';
                let textResult = `🏆 KẾT THÚC! ${safeWinnerName.toUpperCase()} THẮNG!`;
                
                // Nếu ván đấu kết thúc mà không có đường 5 ô nào, tức là do rớt mạng
                if (!room.winLine) {
                    textResult += " (Do đối thủ bỏ cuộc/rớt mạng)";
                }
                
                // Hiển thị thông báo nếu đối thủ muốn chơi lại
                const otherPlayer = room.player1 === safeUser ? room.player2 : room.player1;
                if (room.rematch && room.rematch[otherPlayer]) {
                    textResult += "\n(Đối thủ đang gạ chơi lại!)";
                }
                
                statusEl.innerText = textResult;
                if (radar) radar.style.display = 'none';
                
                // Hiện nút chơi lại
                if (rematchBtn) {
                    rematchBtn.style.display = 'flex';
                    if (room.rematch && room.rematch[safeUser]) {
                        rematchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG CHỜ ĐỐI THỦ...';
                        rematchBtn.style.pointerEvents = 'none';
                        rematchBtn.style.opacity = '0.7';
                    } else {
                        rematchBtn.innerHTML = `<i class="fas fa-redo"></i> CHƠI LẠI (${room.bet} HCoins)`;
                        rematchBtn.style.pointerEvents = 'auto';
                        rematchBtn.style.opacity = '1';
                    }
                }
            } else {
                statusEl.innerText = room.turn === this.caroMySymbol ? "🔥 TỚI LƯỢT BẠN ĐÁNH!" : "⏳ Đang chờ đối thủ suy nghĩ...";
                if (radar) radar.style.display = 'none';
                if (rematchBtn) rematchBtn.style.display = 'none';
            }
            // Chỉ tô màu Xanh/Trắng khi đang chơi, còn Kết thúc thì tô màu Vàng cúp
            if (room.status === 'finished') {
                statusEl.style.color = "#ffd700";
            } else {
                statusEl.style.color = room.turn === this.caroMySymbol ? "#00ffcc" : "#fff";
            }

            // VẼ LẠI BÀN CỜ VỚI ICON CHUYÊN NGHIỆP
            const cells = document.querySelectorAll('.glass-caro-cell');
            cells.forEach(c => { 
                c.innerHTML = ''; // Reset UI
                c.classList.remove('x', 'o', 'win-pulse'); 
            });
            
            if (room.moves) {
                Object.keys(room.moves).forEach(key => {
                    const [r, c] = key.split('-');
                    const symbol = room.moves[key];
                    const cell = document.querySelector(`.glass-caro-cell[data-r='${r}'][data-c='${c}']`);
                    if (cell) {
                        // Nâng cấp: Dùng Icon thay vì Text
                        if (symbol === 'X') {
                            cell.innerHTML = '<i class="fas fa-times"></i>';
                            cell.classList.add('x');
                        } else {
                            cell.innerHTML = '<i class="far fa-circle"></i>';
                            cell.classList.add('o');
                        }
                    }
                });
            }

            // NỔI BẬT DẢI Ô CHIẾN THẮNG
            if (room.status === 'finished' && room.winLine) {
                room.winLine.forEach(pos => {
                    const cell = document.querySelector(`.glass-caro-cell[data-r='${pos.r}'][data-c='${pos.c}']`);
                    if (cell) cell.classList.add('win-pulse');
                });
            }
        });
    },

    playCaroMove(r, c) {
        if (!this.caroRoomId || !db) return;
        
        // 1. CHỐT KHÓA CHỐNG SPAM CLICK: Khóa 0.5s mỗi lần đánh để tránh lag
        if (this.isCaroProcessing) return;
        this.isCaroProcessing = true;
        setTimeout(() => { this.isCaroProcessing = false; }, 500);

        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);

        db.ref(`caro_rooms/${this.caroRoomId}`).once('value').then(snap => {
            const room = snap.val();
            
            // 2. KIỂM TRA ĐIỀU KIỆN: Chỉ cho đánh khi phòng đang chơi và đúng lượt
            if (!room || room.status !== 'playing' || room.turn !== this.caroMySymbol) {
                return;
            }

            let moves = room.moves || {};
            if (moves[`${r}-${c}`]) {
                this.showToast("Ô này đã có người đánh rồi!", "warning");
                return; 
            }

            // Cập nhật nước đi vào biến tạm
            moves[`${r}-${c}`] = this.caroMySymbol;

            // Kiểm tra xem nước đi này có tạo thành 5 ô win không (Dùng hàm mới đồng bộ)
            const winLine = this.checkCaroWinLocal(r, c, moves, this.caroMySymbol);

            if (winLine) {
                // 3. NẾU THẮNG: Cập nhật kết thúc, vinh danh, TUYỆT ĐỐI KHÔNG chuyển lượt
                db.ref(`caro_rooms/${this.caroRoomId}`).update({
                    moves: moves,
                    status: 'finished',
                    winner: safeUser,
                    winLine: winLine
                });
                
                // Trả thưởng qua Worker
                fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: room.bet * 2 })
                });
                
                this.showToast(`🎉 QUÁ ĐỈNH! Bạn đã chiến thắng và nhận ${room.bet * 2} HCoins!`, "success");
            } else {
                // 4. NẾU CHƯA THẮNG: Tiến hành chuyển lượt cho đối thủ
                const nextTurn = this.caroMySymbol === 'X' ? 'O' : 'X';
                db.ref(`caro_rooms/${this.caroRoomId}`).update({
                    moves: moves,
                    turn: nextTurn
                });
            }
        });
    },

    checkCaroWinLocal(lastR, lastC, moves, symbol) {
        // Chuyển r, c về số nguyên để tính toán mảng
        const rInt = parseInt(lastR);
        const cInt = parseInt(lastC);

        // Hàm trả về tọa độ nếu trùng symbol
        const getP = (r, c) => moves[`${r}-${c}`] === symbol ? {r, c} : null;
        
        const checkDir = (dr, dc) => {
            let line = [{r: rInt, c: cInt}]; // Mảng chứa các ô ăn điểm
            let forwardCount = 0;
            let backwardCount = 0;
            
            // Chiều tiến
            for(let i=1; i<=4; i++) { 
                let cell = getP(rInt + i*dr, cInt + i*dc);
                if(cell) { line.push(cell); forwardCount++; } else break; 
            }
            // Chiều lùi
            for(let i=1; i<=4; i++) { 
                let cell = getP(rInt - i*dr, cInt - i*dc);
                if(cell) { line.push(cell); backwardCount++; } else break; 
            }
            
            if (line.length >= 5) {
                // Kiểm tra xem có bị chặn 2 đầu không
                let forwardR = rInt + (forwardCount + 1) * dr;
                let forwardC = cInt + (forwardCount + 1) * dc;
                let backwardR = rInt - (backwardCount + 1) * dr;
                let backwardC = cInt - (backwardCount + 1) * dc;

                // Một ô được tính là đang chặn nếu nó lọt ra khỏi biên HOẶC bị đối thủ đánh đè
                const isBlocked = (r, c) => {
                    if (r < 0 || r >= this.caroBoardSize || c < 0 || c >= this.caroBoardSize) return true;
                    return moves[`${r}-${c}`] && moves[`${r}-${c}`] !== symbol;
                };

                if (isBlocked(forwardR, forwardC) && isBlocked(backwardR, backwardC)) {
                    return null; // Bị chặn 2 đầu nên 5 ô này không được tính là Win
                }
                return line;
            }
            return null;
        };

        // Quét 4 trục: Ngang, Dọc, Chéo sắc, Chéo huyền
        return checkDir(1,0) || checkDir(0,1) || checkDir(1,1) || checkDir(1,-1);
    },

    exitCaroGame() {
        if (this.caroRoomId && db) {
            const currentRoomId = this.caroRoomId; // Lưu lại ID trước khi dọn dẹp biến!
            const email = localStorage.getItem('haruno_email');
            const safeUser = this.getSafeKey(email);

            db.ref(`caro_rooms/${currentRoomId}`).onDisconnect().cancel();
            db.ref(`caro_rooms/${currentRoomId}`).off(); 
            
            // Dọn dẹp phòng triệt để
            db.ref(`caro_rooms/${currentRoomId}`).once('value').then(snap => {
                const room = snap.val();
                if(room) {
                    if (room.status === 'waiting') {
                        // SỬA LỖI 1: Đang chờ đối thủ mà thoát thì xóa phòng và hoàn lại tiền
                        db.ref(`caro_rooms/${currentRoomId}`).remove();
                        if (room.player1 === safeUser) {
                            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: room.bet })
                            });
                            this.showToast("Đã hủy phòng và hoàn lại " + room.bet + " HCoins!", "success");
                        }
                    } else if (room.status === 'finished') {
                        // SỬA LỖI 2: Đã xóa đoạn code gây lỗi "Hack Tiền" cho Player 1
                        // CHỈ BẢO VỆ TIỀN: Hoàn tiền nếu đối thủ đã bấm chơi lại nhưng mình lại bấm thoát
                        const otherPlayer = (room.player1 === safeUser) ? room.player2 : room.player1;
                        if (room.rematch && room.rematch[otherPlayer]) {
                            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'minigameResult', safeKey: otherPlayer, amount: room.bet })
                            });
                        }
                        // Xóa phòng
                        db.ref(`caro_rooms/${currentRoomId}`).remove();
                    } else if (room.status === 'playing') {
                        // SỬA LỖI 3: Đang chơi mà thoát -> Xử thua và CỘNG TIỀN cho đối thủ ngay lập tức
                        const winner = (room.player1 === safeUser) ? room.player2 : room.player1;
                        
                        // Gọi API thưởng tiền cho người ở lại
                        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'minigameResult', safeKey: winner, amount: room.bet * 2 })
                        });

                        db.ref(`caro_rooms/${currentRoomId}`).update({
                            status: 'finished',
                            winner: winner
                        });
                    }
                }
            });
        }
        document.getElementById('caro-game-modal').style.display = 'none';
        this.caroRoomId = null; 
    },
	
	requestRematch() {
        if (!this.caroRoomId) return;
        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);

        db.ref(`caro_rooms/${this.caroRoomId}`).once('value').then(snap => {
            const room = snap.val();
            if (!room || room.status !== 'finished') return;

            // Trừ tiền cược cho ván mới
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: room.bet })
            }).then(res => res.json()).then(data => {
                if (!data.success) {
                    this.showToast("Bạn không đủ " + room.bet + " HCoins để chơi lại!", "error");
                    return;
                }

                // Nếu đối thủ đã bấm chơi lại rồi -> Tiến hành làm mới bàn cờ
                let otherPlayer = room.player1 === safeUser ? room.player2 : room.player1;
                if (room.rematch && room.rematch[otherPlayer]) {
                    db.ref(`caro_rooms/${this.caroRoomId}`).update({
                        status: 'playing',
                        moves: null,
                        winLine: null,
                        winner: null,
                        rematch: null,
                        turn: 'X' // Bắt đầu ván mới, X luôn đi trước
                    }).then(() => {
                        this.showToast("Đã bắt đầu ván mới!", "success");
                    });
                } else {
                    // Nếu đối thủ chưa bấm, cập nhật trạng thái mình đã sẵn sàng
                    db.ref(`caro_rooms/${this.caroRoomId}/rematch/${safeUser}`).set(true);
                }
            });
        });
    },
	
	// --- HỆ THỐNG VÒNG QUAY MAY MẮN ---
    // Thuộc tính 'weight' chính là Tỷ lệ trúng (%). Tổng weight nên là 100 cho dễ tính.
    wheelPrizes: [
        { label: 'Xui Thôi', type: 'none', value: 0, weight: 30 },   // 30% trúng
        { label: '💵', type: 'coin', value: 10, weight: 25 },     // 25% trúng
        { label: '💵', type: 'coin', value: 20, weight: 20 },     // 20% trúng
        { label: '💰', type: 'coin', value: 50, weight: 10 },     // 10% trúng
        { label: 'Có Cái Nịt', type: 'none', value: 0, weight: 10 }, // 10% trúng (Thêm 1 ô xui nữa cho cân bàn)
        { label: '💰', type: 'coin', value: 100, weight: 3.5 },  // 3.5% trúng
        { label: '💎', type: 'coin', value: 200, weight: 1.2 },  // 1.2% trúng (Hiếm)
        { label: '🚀', type: 'coin', value: 500, weight: 0.3 }   // 0.3% trúng (Cực hiếm)
    ],
    currentWheelDeg: 0,
    isSpinning: false,

    openLuckyWheel() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return; }
        
        const safeUser = this.getSafeKey(email);
        if(db) {
            db.ref(`users/${safeUser}/coins`).on('value', snap => {
                const el = document.getElementById('wheel-user-coins');
                if(el) el.innerText = snap.val() || 0;
            });
        }
        this.renderWheelSlices();
        document.getElementById('lucky-wheel-modal').style.display = 'flex';
    },

    closeLuckyWheel() {
        const email = localStorage.getItem('haruno_email');
        if(email && db) db.ref(`users/${this.getSafeKey(email)}/coins`).off();
        document.getElementById('lucky-wheel-modal').style.display = 'none';
    },

    renderWheelSlices() {
        const wheel = document.getElementById('lucky-wheel');
        if(!wheel) return;
        wheel.innerHTML = '';
        const sliceAngle = 360 / this.wheelPrizes.length;

        // Bảng màu xen kẽ cho các múi (Bạn có thể đổi mã màu tùy thích)
        const colors = ['#f39c12', '#e74c3c', '#9b59b6', '#3498db', '#1abc9c', '#2ecc71', '#e67e22', '#34495e'];
        let conicStops = [];

        this.wheelPrizes.forEach((prize, index) => {
            // 1. Tạo màu nền cho múi bằng CSS conic-gradient
            let startAngle = index * sliceAngle;
            let endAngle = startAngle + sliceAngle;
            let color = colors[index % colors.length];
            conicStops.push(`${color} ${startAngle}deg ${endAngle}deg`);

            // 2. Tạo text và xoay nó vào đúng giữa múi
            const textEl = document.createElement('div');
            textEl.className = 'wheel-slice-text';
            textEl.style.transform = `rotate(${index * sliceAngle + sliceAngle/2}deg)`;
            textEl.innerText = prize.label;
            wheel.appendChild(textEl);
        });

        // Sơn toàn bộ múi màu lên background của vòng quay
        wheel.style.background = `conic-gradient(${conicStops.join(', ')})`;
    },

    spinWheel() {
        if (this.isSpinning) return;
        const email = localStorage.getItem('haruno_email');
        if (!email) return;
        const safeUser = this.getSafeKey(email);
        const cost = 20; 

        // 1. Trừ tiền trước bằng Worker
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: cost })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                app.showToast(data.message, "error");
                return;
            }

            this.isSpinning = true;
            const btn = document.getElementById('btn-spin-wheel');
            btn.innerText = 'ĐANG QUAY...';
            btn.style.pointerEvents = 'none';

            // --- THUẬT TOÁN RANDOM THEO TỶ LỆ (WEIGHT) ---
            let totalWeight = this.wheelPrizes.reduce((sum, prize) => sum + prize.weight, 0);
            let randomNum = Math.random() * totalWeight;
            let weightSum = 0;
            let prizeIndex = 0;

            for (let i = 0; i < this.wheelPrizes.length; i++) {
                weightSum += this.wheelPrizes[i].weight;
                if (randomNum <= weightSum) {
                    prizeIndex = i;
                    break;
                }
            }
            // ---------------------------------------------

            const sliceAngle = 360 / this.wheelPrizes.length;
            const spinSpins = 5 * 360; 
            
            // FIX LỖI GÓC QUAY Ở ĐÂY: Đổi 270 thành 360 để kim chỉ chuẩn xác vào phần thưởng được chọn
            const baseTarget = 360 - (prizeIndex * sliceAngle + sliceAngle / 2);
            
            // Tính toán độ lệch an toàn để kim không cắm vào vạch kẻ
            const safeOffsetLimit = (sliceAngle / 2) * 0.8;
            const randomOffset = Math.floor(Math.random() * (safeOffsetLimit * 2)) - safeOffsetLimit; 
            
            const finalTarget = baseTarget + randomOffset;
            
            this.currentWheelDeg += spinSpins + (360 - (this.currentWheelDeg % 360)) + finalTarget;
            document.getElementById('lucky-wheel').style.transform = `rotate(${this.currentWheelDeg}deg)`;

            // 2. Trả thưởng bằng Worker
            setTimeout(() => {
                this.isSpinning = false;
                btn.innerText = 'THỬ VẬN MAY';
                btn.style.pointerEvents = 'auto';
                
                const prize = this.wheelPrizes[prizeIndex];
                if (prize.type === 'coin') {
                    fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: prize.value })
                    });
                    
                    if (prize.value >= 500) {
                        app.showToast(`🎉 JACKPOT! Quá đỉnh! Bạn trúng ${prize.value} HCoins`, "success");
                    } else {
                        app.showToast(`🎉 Chúc mừng! Bạn trúng ${prize.value} HCoins`, "success");
                    }
                } else {
                    app.showToast(`Haizz! Xui thôi. Chúc bạn may mắn lần sau!`, "warning");
                }
            }, 4000);
        });
    },

    buyShopItem(type, value, cost) {
        const email = localStorage.getItem('haruno_email');
        if (!email) return;
        const safeUser = this.getSafeKey(email);

        this.showConfirm(
            '<i class="fas fa-shopping-cart"></i> Xác nhận mua', 
            `Bạn có chắc chắn muốn dùng ${cost} HCoins để đổi vật phẩm này?`, 
            () => {
                fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'buyShopItem', safeKey: safeUser, itemType: type, itemValue: value, cost: cost })
                })
                .then(res => res.json())
                .then(data => {
                    if(data.success) {
                        // --- ĐOẠN THÊM VÀO KHO ---
                        const inv = JSON.parse(localStorage.getItem('haruno_inventory') || '{}');
                        inv[value] = true;
                        localStorage.setItem('haruno_inventory', JSON.stringify(inv));
                        // ------------------------
                        
                        if(type === 'chatFrame') localStorage.setItem('haruno_chat_frame', value);
                        else if(type === 'frame') localStorage.setItem('haruno_avatar_frame', value);
                        else if(type === 'effect') localStorage.setItem('haruno_profile_effect', value);
                        
                        app.showToast("🎉 Mua thành công! Bạn đã nhận được vật phẩm.", "success");
                        
                        // CẬP NHẬT LẠI GIAO DIỆN NÚT BẤM NGAY LẬP TỨC
                        app.openShop(); 
                    } else {
                        app.showToast(data.message || "Lỗi giao dịch!", "error");
                    }
                });
            }
        );
    },
	
	// ==========================================
    // HỆ THỐNG NGÂN HÀNG (Virtual HARUNO)
    // ==========================================
    openBank() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return this.showToast("Cần đăng nhập để dùng Ngân Hàng!", "error"); }
        
        const safeUser = this.getSafeKey(email);
        const myData = (this.usersData && this.usersData[safeUser]) || {};

        // Cập nhật thông tin chính chủ vào THẺ Virtual
        document.getElementById('bank-card-holder').innerText = myData.displayName || safeUser.split('_')[0];
        
        // IN ID NGƯỜI CHƠI LÊN THẺ (Đã gỡ bỏ tính năng tách khoảng trắng)
        const cardIdEl = document.getElementById('bank-card-id');
        if (cardIdEl) {
            // Chỉ in hoa ID lên, không cắt chèn khoảng trắng nữa
            cardIdEl.innerText = safeUser.toUpperCase();
        }

        // Lắng nghe Số dư HCoins và Số nợ
        if(db) {
            db.ref(`users/${safeUser}/coins`).on('value', snap => {
                const coinsEl = document.getElementById('bank-card-coins');
                if(coinsEl) coinsEl.innerText = (snap.val() || 0).toLocaleString();
            });
            db.ref(`users/${safeUser}/debt`).on('value', snap => {
                const debtEl = document.getElementById('bank-current-debt-repay');
                if(debtEl) debtEl.innerText = (snap.val() || 0).toLocaleString();
            });
        }

        document.getElementById('bank-modal').style.display = 'flex';
        this.hideBankForm(); // Ẩn các form nhập mặc định
    },

    closeBank() {
        document.getElementById('bank-modal').style.display = 'none';
        const email = localStorage.getItem('haruno_email');
        if(email && db) {
            db.ref(`users/${this.getSafeKey(email)}/coins`).off();
            db.ref(`users/${this.getSafeKey(email)}/debt`).off();
        }
    },

    // Hiển thị Form nhập liệu của nút bấm được chọn
    showBankForm(formType) {
        document.getElementById('bank-form-area').style.display = 'block';
        const forms = document.querySelectorAll('.bank-form-content');
        forms.forEach(form => form.style.display = 'none');
        document.getElementById(`form-${formType}`).style.display = 'block';
    },

    hideBankForm() {
        document.getElementById('bank-form-area').style.display = 'none';
    },

    transferMoney() {
        const senderEmail = localStorage.getItem('haruno_email');
        if (!senderEmail) return;
        const senderSafeKey = this.getSafeKey(senderEmail);
        
        let rawReceiver = document.getElementById('bank-receiver').value.trim();
        const amount = parseInt(document.getElementById('bank-amount').value);

        if (!rawReceiver || isNaN(amount) || amount <= 0) return this.showToast("Vui lòng nhập đầy đủ và đúng thông tin!", "error");
        if (amount < 50) return this.showToast("Số tiền chuyển tối thiểu là 50 HCoins!", "warning");

        let receiverSafeKey = rawReceiver.includes('@') ? this.getSafeKey(rawReceiver) : rawReceiver;
        if (senderSafeKey === receiverSafeKey) return this.showToast("Bạn không thể tự chuyển tiền cho chính mình!", "error");

        db.ref(`users/${receiverSafeKey}`).once('value').then(snap => {
            if (!snap.exists()) return this.showToast("Tài khoản người nhận không tồn tại!", "error");

            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'deductMinigameFee', safeKey: senderSafeKey, cost: amount }) }).then(r => r.json()).then(data => {
                if (!data.success) return this.showToast("Tài khoản của bạn không đủ số dư!", "error");
                fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: receiverSafeKey, amount: amount }) });
                this.showToast(`Chuyển khoản thành công ${amount.toLocaleString()} HCoins!`, "success");
                this.hideBankForm();
                document.getElementById('bank-amount').value = '';
                document.getElementById('bank-receiver').value = '';
            });
        });
    },

    borrowMoney() {
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        const amount = parseInt(document.getElementById('bank-loan-amount').value);
        
        if (isNaN(amount) || amount <= 0) return this.showToast("Vui lòng nhập số HCoins muốn vay!", "error");

        // Gọi Worker xử lý vay tiền thay vì tự ghi lên Firebase
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { 
            method: 'POST', 
            body: JSON.stringify({ action: 'borrowBank', safeKey: safeUser, amount: amount }) 
        })
        .then(r => r.json())
        .then(data => {
            if (!data.success) return this.showToast(data.message, "error");
            
            this.showToast(`Đã giải ngân ${amount.toLocaleString()} HCoins vào ví!`, "success");
            this.hideBankForm();
            document.getElementById('bank-loan-amount').value = '';
        });
    },

    repayMoney() {
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        
        // Gọi Worker xử lý trả nợ
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { 
            method: 'POST', 
            body: JSON.stringify({ action: 'repayBank', safeKey: safeUser }) 
        })
        .then(r => r.json())
        .then(data => {
            if (!data.success) return this.showToast(data.message, "error");
            
            this.showToast("Đã thanh toán dứt điểm khoản nợ. Lần sau lại mượn tiếp nhé!", "success");
            this.hideBankForm();
        });
    },
	
// ==========================================
    // HỆ THỐNG XÌ DÁCH: 4 NGƯỜI CHƠI & CÁI XÉT BÀI
    // ==========================================
    bjRoomId: null,

    openBjLobby() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return; }
        const modal = document.getElementById('bj-lobby-modal');
        if (modal) modal.style.display = 'flex';
        this.listenBjRooms();
    },

    closeBjLobby() {
        const modal = document.getElementById('bj-lobby-modal');
        if (modal) modal.style.display = 'none';
        if(db) db.ref('bj_rooms').off();
    },

    listenBjRooms() {
        if (!db) return;
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        db.ref(`users/${safeUser}/coins`).on('value', snap => {
            const el = document.getElementById('bj-lobby-coins');
            if(el) el.innerText = (snap.val() || 0).toLocaleString();
        });

        db.ref('bj_rooms').orderByChild('status').equalTo('waiting').on('value', snap => {
            const listEl = document.getElementById('bj-room-list');
            if (!listEl) return;
            listEl.innerHTML = ''; 
            if (!snap.exists()) {
                listEl.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">Chưa có phòng nào. Hãy tạo phòng để cùng chơi nhé!</div>';
                return;
            }

            let htmlString = '';
            snap.forEach(child => {
                const room = child.val();
                const roomId = child.key;
                const playerCount = room.players ? Object.keys(room.players).length : 1;
                const creatorName = room.players[room.dealerId]?.name || "Người chơi";

                if (room.players && room.players[safeUser]) {
                    htmlString += `
                        <div class="bj-room-item" style="border-color: #ffd700; background: rgba(255,215,0,0.05);">
                            <div class="bj-room-info">
                                <h4 style="color: #ffd700;"><i class="fas fa-crown"></i> Bàn bạn đang tham gia (${playerCount}/4)</h4>
                                <p><i class="fas fa-coins"></i> Cược: ${room.bet.toLocaleString()} HCoins</p>
                            </div>
                            <button onclick="app.rejoinBjRoom('${roomId}')" class="btn-join-room" style="background: #f39c12;">VÀO LẠI BÀN</button>
                        </div>`;
                } else if (playerCount < 4) {
                    htmlString += `
                        <div class="bj-room-item">
                            <div class="bj-room-info">
                                <h4><i class="fas fa-user-secret"></i> Sòng của ${creatorName} (${playerCount}/4)</h4>
                                <p><i class="fas fa-coins"></i> Cược: ${room.bet.toLocaleString()} HCoins</p>
                            </div>
                            <button onclick="app.joinBjRoom('${roomId}', ${room.bet})" class="btn-join-room">VÀO CHƠI</button>
                        </div>`;
                }
            });
            listEl.innerHTML = htmlString;
        });
    },

    createBjRoom() {
        const email = localStorage.getItem('haruno_email');
        const betAmount = parseInt(document.getElementById('bj-bet-amount').value);
        if (isNaN(betAmount) || betAmount <= 0) { this.showToast("Nhập cược hợp lệ!", "error"); return; }
        
        const safeUser = this.getSafeKey(email);
        const myData = (this.usersData && this.usersData[safeUser]) || {};
        const myName = myData.displayName || safeUser.split('_')[0];
        const myAvatar = myData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeUser}`;

        const newRoomRef = db.ref('bj_rooms').push();
        newRoomRef.onDisconnect().remove();
        
        const roomData = {
            bet: betAmount, dealerId: safeUser, status: 'waiting', pot: 0,
            players: { [safeUser]: { role: 'dealer', name: myName, avatar: myAvatar, state: 'waiting' } }
        };
        newRoomRef.set(roomData);
        this.enterBjRoom(newRoomRef.key);
    },

    joinBjRoom(roomId, betAmount) {
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        db.ref(`bj_rooms/${roomId}`).once('value').then(snap => {
            const room = snap.val();
            if(!room || room.status !== 'waiting') { this.showToast("Bàn đang chơi hoặc đã đóng!", "error"); return; }
            if(Object.keys(room.players || {}).length >= 4) { this.showToast("Bàn đã đầy!", "error"); return; }

            const myData = (this.usersData && this.usersData[safeUser]) || {};
            db.ref(`bj_rooms/${roomId}/players/${safeUser}`).set({
                role: 'player', 
                name: myData.displayName || safeUser.split('_')[0], 
                avatar: myData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeUser}`,
                state: 'waiting'
            });
            this.enterBjRoom(roomId);
        });
    },

    rejoinBjRoom(roomId) { this.enterBjRoom(roomId); },

    enterBjRoom(roomId) {
        this.bjRoomId = roomId;
        this.closeBjLobby();
        const modal = document.getElementById('bj-game-modal');
        if (modal) modal.style.display = 'flex';
        this.listenBjGame();
    },

    createDeck() {
        const suits = ['♥', '♦', '♣', '♠'], values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
        let deck = [];
        for (let s of suits) for (let v of values) deck.push({ suit: s, value: v, color: (s==='♥'||s==='♦') ? 'red' : 'black' });
        return deck.sort(() => Math.random() - 0.5);
    },

    getScore(cards) {
        if(!cards) return 0;
        let sum = 0, aces = 0;
        
        for (let c of cards) {
            if (['J', 'Q', 'K'].includes(c.value)) sum += 10;
            else if (c.value === 'A') { aces += 1; }
            else sum += parseInt(c.value);
        }

        if (aces === 0) return sum;

        if (cards.length >= 4) {
            return sum + aces;
        }

        let bestScore = -1;
        let minScore = sum + aces;

        const tryAces = (currentSum, acesLeft) => {
            if (acesLeft === 0) {
                if (currentSum <= 21 && currentSum > bestScore) bestScore = currentSum;
                return;
            }
            tryAces(currentSum + 1, acesLeft - 1); 
            tryAces(currentSum + 10, acesLeft - 1);
            tryAces(currentSum + 11, acesLeft - 1);
        };

        tryAces(sum, aces);
        return bestScore !== -1 ? bestScore : minScore;
    },
    
    isXiDach(cards) {
        if (!cards || cards.length !== 2) return false;
        const hasAce = cards.some(c => c.value === 'A');
        const hasTen = cards.some(c => ['10', 'J', 'Q', 'K'].includes(c.value));
        return hasAce && hasTen;
    },

    isXiBang(cards) {
        return cards && cards.length === 2 && cards[0].value === 'A' && cards[1].value === 'A';
    },

    processBjPayout(dealerId, playerId, resultType, bet, playersObj) {
        let target = playersObj[playerId];
        if (resultType === 'win') {
            target.result = { type: 'win', text: '+ ' + bet };
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'minigameResult', safeKey: playerId, amount: bet * 2 }) });
        } else if (resultType === 'lose') {
            target.result = { type: 'lose', text: '- ' + bet };
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'minigameResult', safeKey: dealerId, amount: bet * 2 }) });
        } else {
            target.result = { type: 'draw', text: 'HÒA' };
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'minigameResult', safeKey: dealerId, amount: bet }) });
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'minigameResult', safeKey: playerId, amount: bet }) });
        }
    },

    startBjGame() {
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        db.ref(`bj_rooms/${this.bjRoomId}`).once('value').then(async snap => {
            const room = snap.val();
            if (!room || room.dealerId !== safeUser || room.status !== 'waiting') return;
            
            const playerKeys = Object.keys(room.players);
            if (playerKeys.length < 2) { this.showToast("Cần ít nhất 2 người để bắt đầu!", "error"); return; }

            let totalPot = 0;
            let validPlayers = {};
            
            for (let pk of playerKeys) {
                const res = await fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deductMinigameFee', safeKey: pk, cost: room.bet }) }).then(r => r.json());
                if (res.success) {
                    validPlayers[pk] = room.players[pk];
                    totalPot += room.bet;
                } else {
                    if(pk === safeUser) { this.showToast("Bạn không đủ tiền làm Cái!", "error"); return; }
                    db.ref(`bj_rooms/${this.bjRoomId}/players/${pk}`).remove(); 
                }
            }

            let deck = this.createDeck();
            
            for (let pk of Object.keys(validPlayers)) {
                validPlayers[pk].cards = [deck.pop(), deck.pop()];
                validPlayers[pk].state = 'playing';
                validPlayers[pk].score = this.getScore(validPlayers[pk].cards);
                validPlayers[pk].result = null; 
            }

            let dealer = validPlayers[safeUser];
            let dXB = this.isXiBang(dealer.cards);
            let dXD = this.isXiDach(dealer.cards);

            if (dXB || dXD) {
                for (let pk in validPlayers) {
                    if (pk === safeUser) continue;
                    let p = validPlayers[pk];
                    let pXB = this.isXiBang(p.cards);
                    let pXD = this.isXiDach(p.cards);
                    
                    let resultType = 'lose'; 
                    if (dXB) {
                        if (pXB) resultType = 'draw';
                    } else if (dXD) {
                        if (pXB) resultType = 'win';
                        else if (pXD) resultType = 'draw';
                    }

                    this.processBjPayout(safeUser, pk, resultType, room.bet, validPlayers);
                    validPlayers[pk].state = 'checked';
                }
                dealer.state = 'checked';
                
                db.ref(`bj_rooms/${this.bjRoomId}`).update({
                    status: 'checking', deck: deck, pot: totalPot, players: validPlayers,
                    turnOrder: [], currentTurnIndex: 0, dealerRevealed: null
                });
                return;
            }

            let turnOrder = [];
            for (let pk in validPlayers) {
                if (pk === safeUser) continue;
                let p = validPlayers[pk];
                let pXB = this.isXiBang(p.cards);
                let pXD = this.isXiDach(p.cards);

                if (pXB || pXD) {
                    this.processBjPayout(safeUser, pk, 'win', room.bet, validPlayers);
                    p.state = 'checked'; 
                } else {
                    turnOrder.push(pk);
                }
            }
            turnOrder.push(safeUser);

            let nextStatus = turnOrder.length === 1 ? 'checking' : 'playing'; 
            
            db.ref(`bj_rooms/${this.bjRoomId}`).update({
                status: nextStatus, deck: deck, pot: totalPot, players: validPlayers,
                turnOrder: turnOrder, currentTurnIndex: 0, dealerRevealed: null
            });
        });
    },

    listenBjGame() {
        if (!db || !this.bjRoomId) return;
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));

        db.ref(`bj_rooms/${this.bjRoomId}`).on('value', snap => {
            const room = snap.val();
            if (!room || !room.players || !room.players[safeUser]) {
                const modal = document.getElementById('bj-game-modal');
                if (modal) modal.style.display = 'none';
                this.bjRoomId = null;
                this.showToast("Bàn đã giải tán hoặc bạn bị kích!", "warning");
                return;
            }

            // BỌC BẢO VỆ CHỐNG CRASH NẾU HTML CHƯA TẢI KỊP
            const idText = document.getElementById('bj-room-id-text');
            if (idText) idText.innerText = this.bjRoomId.substring(1, 6);
            
            const betText = document.getElementById('bj-room-bet-text');
            if (betText) betText.innerText = room.bet.toLocaleString();
            
            const potText = document.getElementById('bj-current-pot');
            if (potText) potText.innerText = (room.pot || 0).toLocaleString();

            const dealerArea = document.getElementById('bj-dealer-area');
            const playersArea = document.getElementById('bj-players-area');
            const statusMsg = document.getElementById('bj-status-msg');
            const controls = document.getElementById('bj-controls');
            const btnStart = document.getElementById('btn-bj-start');
            const btnHit = document.getElementById('btn-bj-hit');
            const btnStand = document.getElementById('btn-bj-stand');
            
            if (dealerArea) dealerArea.innerHTML = ''; 
            if (playersArea) playersArea.innerHTML = '';
            if (controls) controls.style.display = 'none';
            if (btnStart) btnStart.style.display = 'none';
            if (btnHit) btnHit.style.display = 'none';
            if (btnStand) btnStand.style.display = 'none';

            const createCardHTML = (c, hidden) => hidden ? `<div class="playing-card hidden-card" style="border:2px solid #fff; background: linear-gradient(135deg, #b71c1c, #c62828); color: transparent;"></div>` : `<div class="playing-card" style="background:#fff; color:${c.color}; border:1px solid #ccc;"><div class="card-top" style="font-size:12px;">${c.value}</div><div class="card-center" style="font-size:20px;">${c.suit}</div></div>`;

            let currentTurnPlayer = room.turnOrder ? room.turnOrder[room.currentTurnIndex] : null;
            const myRole = room.players[safeUser].role;

            // RENDER PLAYERS
            for (let pk in room.players) {
                let p = room.players[pk];
                let isMe = pk === safeUser;
                let isDealer = p.role === 'dealer';
                let isActive = currentTurnPlayer === pk && room.status === 'playing';
                
                let cardsHTML = '';
                let scoreText = '?';
                if (p.cards) {
                    let canSeeCards = isMe || room.status === 'finished' || p.state === 'checked' || (isDealer && room.dealerRevealed);
                    
                    if (canSeeCards) {
                        cardsHTML = p.cards.map(c => createCardHTML(c, false)).join('');
                        let isXD = this.isXiDach(p.cards);
                        let isXB = this.isXiBang(p.cards);
                        let isNL = p.cards.length === 5 && p.score <= 21;
                        
                        if (isXB) scoreText = 'XÌ BÀN';
                        else if (isXD) scoreText = 'XÌ ZÁCH';
                        else if (isNL) scoreText = 'NGŨ LINH';
                        else scoreText = p.score > 21 ? 'QUẮC' : p.score;
                    } else {
                        cardsHTML = p.cards.map(() => createCardHTML(null, true)).join('');
                    }
                }

                // KIỂM TRA DỮ LIỆU AN TOÀN ĐỂ CHỐNG CRASH TỪ USERDATA
                let pData = (this.usersData && this.usersData[pk]) || {};
                let isPremium = pData.isPremium ? true : false;
                let rankClass = isPremium ? 'premium' : '';
                let avatarFrame = isPremium && pData.avatarFrame && pData.avatarFrame !== 'none' ? pData.avatarFrame : '';
                let frameHtml = avatarFrame ? `<div class="avatar-frame ${avatarFrame}"></div>` : '';
                let safeName = (p.name || 'Người chơi').replace(/'/g, "\\'");
                let safeAvatar = (p.avatar || '').replace(/'/g, "\\'");

                let slotHTML = `
                    <div class="bj-player-slot ${isActive ? 'active-turn' : ''}">
                        ${((myRole === 'dealer' && !isDealer && p.state !== 'checked' && p.state !== 'waiting') && (room.status === 'checking' || (room.status === 'playing' && currentTurnPlayer === safeUser && room.players[safeUser].score >= 15))) ? `<button class="btn-khui" onclick="app.khuiBai('${pk}')">KHUI BÀI</button>` : ''}
                        ${p.result ? `<div class="bj-result-tag ${p.result.type}">${p.result.text}</div>` : ''}
                        <div class="bj-player-badge" style="border-color: ${isMe ? '#00ffcc' : (isDealer ? '#ffd700' : '#444')};">
                            
                            <div class="comment-avatar ${rankClass}" style="width: 50px; height: 50px; margin-bottom: 5px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" onclick="app.showUserProfile('${pk}', '${safeName}', '${safeAvatar}')" title="Xem hồ sơ">
                                <img src="${p.avatar}" style="border: 2px solid ${isDealer ? '#ffd700' : '#fff'}; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; position: relative; z-index: 2;">
                                ${frameHtml}
                            </div>
                            
                            <span class="bj-name" style="color: ${isDealer ? '#ffd700' : '#fff'};">${isDealer ? '👑 ' : ''}${p.name}</span>
                            <span class="bj-score">${scoreText}</span>
                        </div>
                        <div class="bj-cards-area">${cardsHTML}</div>
                    </div>`;

                if (isDealer) {
                    if (dealerArea) dealerArea.innerHTML = slotHTML;
                } else {
                    if (playersArea) playersArea.innerHTML += slotHTML;
                }
            }

            // XỬ LÝ TRẠNG THÁI BÀN
            if (room.status === 'waiting') {
                if (statusMsg) statusMsg.innerText = "Đang chờ người chơi...";
                if (myRole === 'dealer') {
                    if (controls) controls.style.display = 'flex';
                    if (btnStart) btnStart.style.display = 'block';
                }
            } else if (room.status === 'playing') {
                if (currentTurnPlayer === safeUser) {
                    if (statusMsg) {
                        statusMsg.innerText = "Tới lượt bạn rút bài!";
                        statusMsg.style.color = "#00ffcc";
                    }
                    if (controls) controls.style.display = 'flex';
                    if (btnHit) btnHit.style.display = 'block';
                    if (btnStand) btnStand.style.display = 'block';
                } else {
                    const activeName = room.players[currentTurnPlayer]?.name || 'Đối thủ';
                    if (statusMsg) {
                        statusMsg.innerText = `Đang chờ ${activeName} hành động...`;
                        statusMsg.style.color = "#ff9800";
                    }
                }
            } else if (room.status === 'checking') {
                if (myRole === 'dealer') {
                    if (statusMsg) {
                        statusMsg.innerText = "Bạn đã đủ tuổi. Hãy chọn người để Khui Bài!";
                        statusMsg.style.color = "#ffd700";
                    }
                } else {
                    if (statusMsg) {
                        statusMsg.innerText = "Nhà Cái đang xét bài...";
                        statusMsg.style.color = "#ff4d4d";
                    }
                }
                
                let allChecked = true;
                for(let k in room.players) { 
                    if(room.players[k].role !== 'dealer' && room.players[k].state !== 'checked' && room.players[k].state !== 'waiting') allChecked = false; 
                }
                if(allChecked && myRole === 'dealer') {
                    setTimeout(() => { db.ref(`bj_rooms/${this.bjRoomId}`).update({ status: 'waiting', dealerRevealed: null }); }, 3000);
                }

            } else if (room.status === 'finished') {
                if (statusMsg) {
                    statusMsg.innerText = "Ván đấu kết thúc! Chuẩn bị ván mới...";
                    statusMsg.style.color = "#fff";
                }
                if (myRole === 'dealer') {
                    setTimeout(() => { db.ref(`bj_rooms/${this.bjRoomId}`).update({ status: 'waiting', dealerRevealed: null }); }, 3000);
                }
            }
        });
    },

    playBjMove(action) {
        if (!this.bjRoomId) return;
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        db.ref(`bj_rooms/${this.bjRoomId}`).once('value').then(snap => {
            const room = snap.val();
            if (room.status !== 'playing' || room.turnOrder[room.currentTurnIndex] !== safeUser) return;

            let me = room.players[safeUser];
            let deck = room.deck || [];

            if (action === 'hit') {
                if (me.cards.length >= 5) { this.showToast("Đã đủ 5 lá (Ngũ Linh)!", "warning"); return; }
                me.cards.push(deck.pop());
                me.score = this.getScore(me.cards);
                
                let updates = { deck: deck, [`players/${safeUser}`]: me };
                
                if (me.score > 21 || me.cards.length === 5) {
                    me.state = me.score > 21 ? 'busted' : 'stand';
                    updates.currentTurnIndex = room.currentTurnIndex + 1;
                    if (updates.currentTurnIndex >= room.turnOrder.length) updates.status = 'checking'; 
                }
                db.ref(`bj_rooms/${this.bjRoomId}`).update(updates);

            } else if (action === 'stand') {
                const minAge = me.role === 'dealer' ? 15 : 16;
                if (me.score < minAge && me.cards.length < 5) {
                    this.showToast(`Chưa đủ tuổi! (Cần ${minAge} điểm)`, "error"); return;
                }
                
                me.state = 'stand';
                let updates = { [`players/${safeUser}`]: me, currentTurnIndex: room.currentTurnIndex + 1 };
                
                if (updates.currentTurnIndex >= room.turnOrder.length) updates.status = 'checking';
                db.ref(`bj_rooms/${this.bjRoomId}`).update(updates);
            }
        });
    },

    khuiBai(targetPlayerId) {
        if (!this.bjRoomId) return;
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        
        db.ref(`bj_rooms/${this.bjRoomId}`).once('value').then(snap => {
            const room = snap.val();
            
            let isCheckingPhase = room.status === 'checking';
            let isDealerTurnInPlaying = (room.status === 'playing' && room.turnOrder[room.currentTurnIndex] === safeUser && room.players[safeUser].score >= 15);
            
            if (room.dealerId !== safeUser || (!isCheckingPhase && !isDealerTurnInPlaying)) return;
            
            let dealer = room.players[safeUser];
            let target = room.players[targetPlayerId];
            if (!target || target.state === 'checked' || target.state === 'waiting') return;

            let resultType = ''; 
            let ds = dealer.score, ts = target.score;
            let dNL = dealer.cards.length === 5 && ds <= 21;
            let tNL = target.cards.length === 5 && ts <= 21;

            if (dNL || tNL) {
                if (dNL && tNL) resultType = ds < ts ? 'win' : (ts < ds ? 'lose' : 'draw'); 
                else resultType = dNL ? 'win' : 'lose';
            } else if (ds > 21 || ts > 21) {
                if (ds > 21 && ts > 21) resultType = 'draw';
                else resultType = ds > 21 ? 'lose' : 'win';
            } else {
                resultType = ds > ts ? 'win' : (ts > ds ? 'lose' : 'draw');
            }

            if (resultType === 'win') {
                target.result = { type: 'lose', text: '- ' + room.bet + ' HCoins' };
                fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: room.bet * 2 }) });
            } else if (resultType === 'lose') {
                target.result = { type: 'win', text: '+ ' + room.bet + ' HCoins' };
                fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'minigameResult', safeKey: targetPlayerId, amount: room.bet * 2 }) });
            } else {
                target.result = { type: 'draw', text: 'HÒA' };
                fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: room.bet }) });
                fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'minigameResult', safeKey: targetPlayerId, amount: room.bet }) });
            }

            target.state = 'checked';
            
            let updates = {
                [`players/${targetPlayerId}`]: target,
                dealerRevealed: true 
            };
            
            let allChecked = true;
            for (let k in room.players) {
                if (room.players[k].role !== 'dealer' && k !== targetPlayerId && room.players[k].state !== 'checked' && room.players[k].state !== 'waiting') {
                    allChecked = false;
                }
            }
            if (allChecked && room.status === 'playing') {
                updates.status = 'checking';
            }

            db.ref(`bj_rooms/${this.bjRoomId}`).update(updates);
        });
    },

    exitBjRoom() {
        if (!this.bjRoomId) return;
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        const roomId = this.bjRoomId;
        
        db.ref(`bj_rooms/${roomId}`).once('value').then(snap => {
            const room = snap.val();
            if (room) {
                if (room.dealerId === safeUser) {
                    db.ref(`bj_rooms/${roomId}`).remove();
                    this.showToast("Phòng đã giải tán do Nhà Cái rời đi!", "warning");
                } else {
                    db.ref(`bj_rooms/${roomId}/players/${safeUser}`).remove();
                }
            }
        });
        
        db.ref(`bj_rooms/${this.bjRoomId}`).off();
        const modal = document.getElementById('bj-game-modal');
        if (modal) modal.style.display = 'none';
        this.bjRoomId = null;
    },

    // --- HỆ THỐNG HIỆU ỨNG LỄ HỘI ---
    globalEffectInterval: null,
    
    saveGlobalEffect() {
        const effectVal = document.getElementById('admin-global-effect').value;
        if(db) {
            db.ref('global_settings/currentEffect').set(effectVal).then(() => {
                app.showToast("Đã thay đổi hiệu ứng toàn trang!", "success");
            });
        }
    },

    listenGlobalEffect() {
        if(!db) return;
        db.ref('global_settings/currentEffect').on('value', snap => {
            const effect = snap.val() || 'none';
            this.renderGlobalEffect(effect);
            
            // Cập nhật lại dropdown admin nếu đang là admin
            const adminSelect = document.getElementById('admin-global-effect');
            if(adminSelect) adminSelect.value = effect;
        });
    },
	
	// --- HỆ THỐNG LOA THÔNG BÁO ---
    saveAnnouncement() {
        const text = document.getElementById('admin-announcement-input').value.trim();
        if(db) {
            db.ref('global_settings/announcement').set(text).then(() => {
                if (text === '') {
                    app.showToast("Đã TẮT loa thông báo!", "success");
                } else {
                    app.showToast("Đã phát loa thông báo thành công!", "success");
                }
            });
        }
    },

    listenAnnouncement() {
        if(!db) return;
        db.ref('global_settings/announcement').on('value', snap => {
            const text = snap.val();
            const bar = document.getElementById('announcement-bar');
            const textEl = document.getElementById('announcement-text');
            const adminInput = document.getElementById('admin-announcement-input');
            
            if (text && text.trim() !== '') {
                if (bar) bar.style.display = 'flex';
                if (textEl) textEl.innerText = text;
                if (adminInput) adminInput.value = text;
            } else {
                if (bar) bar.style.display = 'none'; // Tự động ẩn thanh loa nếu không có chữ
                if (adminInput) adminInput.value = '';
            }
        });
    },

    renderGlobalEffect(effectName) {
        const container = document.getElementById('global-effect-container');
        if(!container) return;
        clearInterval(this.globalEffectInterval);
        container.innerHTML = '';
        if (effectName === 'none') {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';

        const createFallingElement = () => {
            const el = document.createElement('i');
            el.className = 'falling-item fas';

            if (effectName === 'tet-binh-ngo') {
                if(Math.random() > 0.3) {
                    el.classList.add('fa-fan');
                    el.style.color = '#ffeb3b';
                    el.style.fontSize = (Math.random() * 10 + 10) + 'px';
                } else {
                    el.classList.add('fa-envelope');
                    el.style.color = '#f44336';
                    el.style.fontSize = (Math.random() * 15 + 15) + 'px';
                    el.style.textShadow = '0 0 5px rgba(255,215,0,0.8)';
                }
            } else if (effectName === 'snow') {
                el.classList.add('fa-snowflake');
                el.style.color = 'rgba(255,255,255,0.7)';
                el.style.fontSize = (Math.random() * 10 + 8) + 'px';
            } else if (effectName === 'summer') {
                if(Math.random() > 0.4) {
                    el.classList.add('fa-leaf');
                    el.style.color = '#4caf50';
                    el.style.fontSize = (Math.random() * 12 + 10) + 'px';
                } else {
                    el.classList.add('fa-sun');
                    el.style.color = '#ffc107';
                    el.style.fontSize = (Math.random() * 15 + 12) + 'px';
                }
            } else if (effectName === 'autumn') {
                el.classList.add('fa-leaf');
                const autumnColors = ['#ff9800', '#ff5722', '#e64a19', '#8d6e63'];
                el.style.color = autumnColors[Math.floor(Math.random() * autumnColors.length)];
                el.style.fontSize = (Math.random() * 15 + 10) + 'px';
            } else if (effectName === 'festival') {
                // LOGIC HIỆU ỨNG HOA ĐĂNG MỚI
                if (Math.random() > 0.3) {
                    el.className = 'magic-firefly'; 
                    el.style.animationDuration = (Math.random() * 6 + 6) + 's';
                } else {
                    el.className = 'magic-lantern';
                    el.style.transform = `scale(${Math.random() * 0.6 + 0.6})`;
                    el.style.animationDuration = (Math.random() * 10 + 15) + 's, ' + (Math.random() * 2 + 3) + 's';
                }
            }

            el.style.left = Math.random() * 100 + 'vw';
            if (effectName !== 'festival') {
                el.style.animationDuration = (Math.random() * 5 + 5) + 's';
            }
            
            container.appendChild(el);
            
            setTimeout(() => {
                if(el.parentNode) el.remove();
            }, effectName === 'festival' ? 25000 : 10000); // Hoa đăng cần sống lâu hơn để bay lên hết màn hình
        };

        // Hoa đăng trôi chậm, nên delay sinh element lâu hơn để màn hình không bị rối
        this.globalEffectInterval = setInterval(createFallingElement, effectName === 'festival' ? 400 : 200);
    },
	
    checkAuth() {
        const user = localStorage.getItem('haruno_user');
        const avatar = localStorage.getItem('haruno_avatar');
        const email = localStorage.getItem('haruno_email');
        
        const authArea = document.getElementById('auth-area');
        const adminBtn = document.getElementById('admin-panel-btn');
        
        if (email && user) {
            const finalAvatarSrc = avatar ? avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user)}`;
            const safeKey = this.getSafeKey(email);
            
            authArea.innerHTML = `
                <div class="user-profile" onclick="app.toggleUserMenu(event)">
                    <div id="nav-avatar-wrap" class="comment-avatar ${this.getRankClass(email)}" style="width: 40px; height: 40px; margin-right: 5px;">
                        <img src="${finalAvatarSrc}" alt="Avatar" style="border-radius: 50%; object-fit: cover;">
                        <div id="nav-avatar-frame" class="avatar-frame"></div>
                    </div>
                    <span id="nav-user-name" class="user-name pc-only-flex">${user}</span>
                </div>
                <div class="user-menu-dropdown" id="user-menu-dropdown">
                    <div class="um-header">
                        <span id="nav-um-name" class="um-name">${user}</span>
                        <span class="um-email">${email || 'Tài khoản User'}</span>
                    </div>
                    <a href="javascript:void(0)" class="um-item" onclick="app.openEditProfile()"><i class="fas fa-user-edit"></i> Hồ sơ của tôi</a>
					<a href="javascript:void(0)" class="um-item" onclick="app.openDashboard()" style="color: #00ffcc;"><i class="fas fa-briefcase"></i> Quản Lý & Túi Đồ</a>
                    <a href="javascript:void(0)" class="um-item" onclick="app.openPremiumModal()" style="color: #ffd700;"><i class="fas fa-crown"></i> Nâng cấp Premium</a>
                    <a href="javascript:void(0)" class="um-item um-logout" onclick="app.logout()"><i class="fas fa-sign-out-alt"></i> Đăng xuất</a>
                </div>
            `;

            if(db) {
                db.ref('users/' + safeKey).on('value', snap => {
                    const uData = snap.val() || {};
                    const isPremium = uData.isPremium ? true : false;
					
					// ĐỒNG BỘ DỮ LIỆU TỪ FIREBASE XUỐNG LOCALSTORAGE VÀ TỰ ĐỘNG CHUẨN HOÁ DỮ LIỆU CŨ
let rawInv = uData.inventory || {};
let flatInv = {};
for (let key in rawInv) {
    if (typeof rawInv[key] === 'object') {
        for (let subKey in rawInv[key]) { flatInv[subKey] = rawInv[key][subKey]; }
    } else {
        flatInv[key] = rawInv[key];
    }
}
localStorage.setItem('haruno_inventory', JSON.stringify(flatInv));
                    if(uData.aboutMe) localStorage.setItem('haruno_about_me', uData.aboutMe);
                    if(uData.gender) localStorage.setItem('haruno_gender', uData.gender);
                    if(uData.avatar) localStorage.setItem('haruno_avatar', uData.avatar);
                    
                    const navAvatar = document.getElementById('nav-avatar-wrap');
                    const navName = document.getElementById('nav-user-name');
                    const navUmName = document.getElementById('nav-um-name');

                    if(navAvatar) {
                        navAvatar.className = `comment-avatar ${isPremium ? 'premium' : this.getRankClass(email)}`;
                        const img = navAvatar.querySelector('img');
                        if (img) img.src = uData.avatar || finalAvatarSrc;
                    }
                    if(navName) navName.className = `user-name pc-only-flex ${isPremium ? 'premium-name' : ''}`;
                    if(navUmName) navUmName.className = `um-name ${isPremium ? 'premium-name' : ''}`;
                    
                    const navFrame = document.getElementById('nav-avatar-frame');
                    if (navFrame) {
                        navFrame.className = 'avatar-frame';
                        if (isPremium && uData.avatarFrame && uData.avatarFrame !== 'none') {
                            navFrame.classList.add(uData.avatarFrame);
                            localStorage.setItem('haruno_avatar_frame', uData.avatarFrame);
                        } else {
                            localStorage.setItem('haruno_avatar_frame', 'none');
                        }
                    }

                    if (typeof app.wasPremium !== 'undefined' && app.wasPremium === false && isPremium === true) {
                        app.showToast("🎉 Hệ thống ghi nhận giao dịch thành công. Chúc mừng bạn đã nâng cấp lên Premium!", "success");
                        app.closePremiumModal();
                    }
                    app.wasPremium = isPremium;

                    if (isPremium) {
                        document.body.classList.add('premium-theme');
                        const pThemeRaw = uData.premiumColor || 'theme-holo-blue';
                        const pTheme = pThemeRaw.startsWith('#') ? 'theme-holo-blue' : pThemeRaw;
                        localStorage.setItem('haruno_premium_color', pTheme);
                        
                        if(uData.profileEffect) localStorage.setItem('haruno_profile_effect', uData.profileEffect);
                        if(uData.chatFrame) localStorage.setItem('haruno_chat_frame', uData.chatFrame);
                        if(uData.banner) localStorage.setItem('haruno_banner', uData.banner);

                        document.body.classList.remove('theme-holo-blue', 'theme-holo-pink', 'theme-holo-gold', 'theme-holo-cyber', 'theme-holo-galaxy');
                        document.body.classList.add(pTheme);
                    } else {
                        document.body.classList.remove('premium-theme', 'theme-holo-blue', 'theme-holo-pink', 'theme-holo-gold', 'theme-holo-cyber', 'theme-holo-galaxy');
                        // Dọn dẹp cache premium nếu bị mất quyền
                        localStorage.removeItem('haruno_premium_color');
                        localStorage.removeItem('haruno_profile_effect');
                        localStorage.removeItem('haruno_banner');
                        localStorage.removeItem('haruno_avatar_frame');
                        localStorage.removeItem('haruno_chat_frame');
                    }
                });
            }

            this.listenNotifications();
            this.syncDataFromCloud(); 
            
            if (adminBtn) adminBtn.style.display = (email === ADMIN_EMAIL) ? 'flex' : 'none';
            
        } else {
            document.body.classList.remove('premium-theme', 'theme-holo-blue', 'theme-holo-pink', 'theme-holo-gold', 'theme-holo-cyber', 'theme-holo-galaxy');
            
            authArea.innerHTML = `
                <button class="btn-login-nav pc-only-flex" onclick="app.openAuthModal()">Đăng Nhập</button>
            `;
            const notifWrapper = document.getElementById('notif-wrapper');
            if(notifWrapper) notifWrapper.style.display = 'none';
            
            if (adminBtn) adminBtn.style.display = 'none';
        }
        
        if(this.currentMovieSlug && this.currentMovieSlug !== 'goc-review') {
            this.loadComments(this.currentMovieSlug, 'movie');
        }
		
		this.updatePresence(); // Báo online ngay khi đăng nhập
    },

    openAuthModal() { document.getElementById('auth-modal').style.display = 'flex'; },
    closeAuthModal() { document.getElementById('auth-modal').style.display = 'none'; },
    
    loginWithGoogle() {
        if(!firebase.auth) {
            app.showToast("Chưa nạp thư viện xác thực Firebase!", "error");
            return;
        }

        const btn = document.querySelector('.btn-google-login');
        const spanText = btn ? btn.querySelector('span') : null;
        
        if(btn && spanText) {
            spanText.innerHTML = 'Đang kết nối...';
            btn.style.pointerEvents = 'none'; 
        }

        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider)
        .then(async (result) => { 
            const user = result.user;
            
            if(btn && spanText) {
                spanText.innerHTML = 'Tiếp tục với Google';
                btn.style.pointerEvents = 'auto'; 
            }

            const safeKey = this.getSafeKey(user.email);

            if (db) {
                const snapshot = await db.ref('users/' + safeKey).once('value');
                if (snapshot.exists()) {
                    const existingData = snapshot.val();
                    let displayName = existingData.displayName || user.displayName || user.email.split('@')[0];
                    let avatar = existingData.avatar || user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;

                    localStorage.setItem('haruno_user', displayName);
                    localStorage.setItem('haruno_avatar', avatar);
                    localStorage.setItem('haruno_email', user.email);

                    this.closeAuthModal();
                    this.checkAuth();
                    app.showToast("Đăng nhập thành công!", "success");
                    return; 
                }
            }

            if(user.email === ADMIN_EMAIL) {
                this.tempUser = { email: user.email, defaultName: ADMIN_NAME, defaultAvatar: user.photoURL || '' };
                this.closeAuthModal();
                this.openProfileSetup(ADMIN_NAME, user.photoURL || '');
                return;
            }

            let displayName = user.displayName || user.email.split('@')[0];
            if (displayName.toLowerCase() === 'admin' || displayName.toLowerCase() === ADMIN_NAME.toLowerCase()) {
                displayName = 'Người_Dùng_' + Math.floor(Math.random() * 1000);
            }

            this.tempUser = { email: user.email, defaultName: displayName, defaultAvatar: user.photoURL || '' };
            this.closeAuthModal();
            this.openProfileSetup(displayName, user.photoURL || '');
        })
        .catch((error) => {
            if(btn && spanText) {
                spanText.innerHTML = 'Tiếp tục với Google';
                btn.style.pointerEvents = 'auto'; 
            }
            console.error("Lỗi:", error);
            if (error.code === 'auth/popup-closed-by-user') {
                app.showToast("Bạn đã đóng cửa sổ đăng nhập!", "error");
            } else {
                app.showToast("Đăng nhập thất bại: " + error.message, "error");
            }
        });
    },

    resizeAndConvertImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 150; 
                    const MAX_HEIGHT = 150;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                    } else {
                        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8)); 
                };
            };
        });
    },

    previewAvatar(event) {
        const file = event.target.files[0];
        if (file) {
            document.getElementById('setup-avatar-preview').src = URL.createObjectURL(file);
        }
    },

    openProfileSetup(defaultName, defaultAvatar) {
        document.getElementById('setup-username').value = defaultName;
        document.getElementById('setup-avatar-preview').src = defaultAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(defaultName)}`;
        document.getElementById('setup-avatar-file').value = ''; 
        document.getElementById('profile-setup-modal').style.display = 'flex';
    },

    closeProfileSetup() {
        if(this.tempUser) {
            this.saveProfile(true);
        } else {
            document.getElementById('profile-setup-modal').style.display = 'none';
        }
    },

    async saveProfile(useDefault = false) {
        if(!this.tempUser) return;

        const btn = document.getElementById('btn-save-profile');
        if(btn && !useDefault) {
            btn.innerText = 'Đang xử lý ảnh...';
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.7';
        }

        let finalName = this.tempUser.defaultName;
        let finalAvatar = this.tempUser.defaultAvatar;

        if(!useDefault) {
            const inputName = document.getElementById('setup-username').value.trim();
            const fileInput = document.getElementById('setup-avatar-file');

            if(inputName) {
                if (this.tempUser.email !== ADMIN_EMAIL && (inputName.toLowerCase() === 'admin' || inputName.toLowerCase() === ADMIN_NAME.toLowerCase())) {
                    app.showToast("Tên này đã được Hệ thống giữ lại. Vui lòng chọn tên khác!", "error");
                    if(btn) { btn.innerText = 'Lưu Hồ Sơ & Bắt Đầu'; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; }
                    return;
                }
                finalName = inputName;
            }
            
            if(fileInput.files.length > 0) {
                const file = fileInput.files[0];
                if(file.size > 5 * 1024 * 1024) { 
                    app.showToast("Ảnh quá lớn, vui lòng chọn ảnh dưới 5MB!", "error");
                    if(btn) { btn.innerText = 'Lưu Hồ Sơ & Bắt Đầu'; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; }
                    return;
                }
                finalAvatar = await this.resizeAndConvertImage(file);
            }
        }

        localStorage.setItem('haruno_user', finalName);
        localStorage.setItem('haruno_avatar', finalAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(finalName)}`);
        localStorage.setItem('haruno_email', this.tempUser.email);

        if (this.tempUser.email && db) {
            const safeUser = this.getSafeKey(this.tempUser.email);
            
            // KIỂM TRA: Nếu chưa có data thì là User mới -> Tạo data và Tặng 100 HCoins
            db.ref(`users/${safeUser}`).once('value').then(snap => {
                if (!snap.exists()) {
                    db.ref(`users/${safeUser}`).set({
                        email: this.tempUser.email,
                        displayName: finalName,
                        avatar: finalAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(finalName)}`,
                        coins: 50, // <--- TẶNG HCOINS KHỞI NGHIỆP Ở ĐÂY
                        isPremium: false,
                        createdAt: firebase.database.ServerValue.TIMESTAMP
                    });
                } else {
                    // Nếu User cũ sửa hồ sơ thì chỉ update Tên và Ảnh
                    db.ref(`users/${safeUser}`).update({
                        displayName: finalName,
                        avatar: finalAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(finalName)}`
                    });
                }
            });
        }

        this.tempUser = null;
        document.getElementById('profile-setup-modal').style.display = 'none';
        
        this.checkAuth();
        app.showToast("Đã lưu hồ sơ!", "success"); // Có thể thêm dòng thông báo này thay cho reload 
    },

    openEditProfile() {
        const user = localStorage.getItem('haruno_user');
        const avatar = localStorage.getItem('haruno_avatar');
        const gender = localStorage.getItem('haruno_gender') || 'Nam';
        const aboutMe = localStorage.getItem('haruno_about_me') || '';
        
        document.getElementById('edit-username').value = user;
        document.getElementById('edit-about-me').value = aboutMe;
        document.getElementById('edit-avatar-preview').src = avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user)}`;
        document.getElementById('edit-gender').value = gender;
        document.getElementById('edit-avatar-file').value = ''; 
        
        const isPremium = app.wasPremium;
        const pSection = document.getElementById('premium-features-section');

        const emailForRank = localStorage.getItem('haruno_email');
        const avatarCircle = document.getElementById('edit-avatar-circle');
        if (avatarCircle && emailForRank) {
            avatarCircle.className = `ep-avatar-circle comment-avatar ${isPremium ? 'premium' : this.getRankClass(emailForRank)}`;
            avatarCircle.style.border = (isPremium || this.getRankClass(emailForRank) !== 'newbie') ? 'none' : '3px solid var(--accent)';
        }

        const nameInput = document.getElementById('edit-username');
        if (nameInput) {
            nameInput.className = '';
        }

        const effectOverlay = document.getElementById('ep-effect-overlay');
        const bannerBg = document.getElementById('ep-banner-bg');
        
        if (isPremium) {
            pSection.style.display = 'block';
            
            let savedColor = localStorage.getItem('haruno_premium_color') || 'theme-holo-blue';
            if(savedColor.startsWith('#')) savedColor = 'theme-holo-blue';
            document.getElementById('edit-premium-color').value = savedColor;
            
            const savedEffect = localStorage.getItem('haruno_profile_effect') || 'none';
            document.getElementById('edit-profile-effect').value = savedEffect;
            
            if (effectOverlay) {
                effectOverlay.className = 'upm-effect-overlay';
                if (savedEffect !== 'none') effectOverlay.classList.add('active', savedEffect);
            }
            
            const savedFrame = localStorage.getItem('haruno_avatar_frame') || 'none';
            const frameSelect = document.getElementById('edit-profile-frame');
            if (frameSelect) frameSelect.value = savedFrame;
			
            const savedChatFrame = localStorage.getItem('haruno_chat_frame') || 'none';
            const chatFrameSelect = document.getElementById('edit-chat-frame');
            if (chatFrameSelect) chatFrameSelect.value = savedChatFrame;
            
            const framePreview = document.getElementById('ep-avatar-frame-preview');
            if (framePreview) {
                framePreview.className = 'avatar-frame ' + (savedFrame !== 'none' ? savedFrame : '');
            }
            
            const bannerUrl = localStorage.getItem('haruno_banner');
            if (bannerUrl) {
                document.getElementById('edit-banner-preview').style.backgroundImage = `url(${bannerUrl})`;
                if (bannerBg) {
                    bannerBg.style.backgroundImage = `url(${bannerUrl})`;
                    bannerBg.style.backgroundSize = 'cover';
                    bannerBg.style.backgroundPosition = 'center';
                }
            } else {
                document.getElementById('edit-banner-preview').style.backgroundImage = 'none';
                if (bannerBg) {
                    bannerBg.style.backgroundImage = 'none';
                    bannerBg.style.background = 'var(--gradient)';
                }
            }
            document.getElementById('edit-banner-file').value = '';
        } else {
            pSection.style.display = 'none';
            if (effectOverlay) effectOverlay.className = 'upm-effect-overlay'; 
            if (bannerBg) {
                bannerBg.style.backgroundImage = 'none';
                bannerBg.style.background = '#0f0f11';
            }
            const framePreview = document.getElementById('ep-avatar-frame-preview');
            if (framePreview) framePreview.className = 'avatar-frame';
        }

        // MA THUẬT KHO ĐỒ: KHÓA VẬT PHẨM CHƯA MUA
        if (isPremium) {
            const inventory = JSON.parse(localStorage.getItem('haruno_inventory') || '{}');
            const checkInventory = (selectId) => {
                const selectEl = document.getElementById(selectId);
                if (!selectEl) return;
                Array.from(selectEl.options).forEach(opt => {
                    // Dấu hiệu nhận biết: Option nào có chữ "(Cửa Hàng)" thì mới khóa
                    if (opt.text.includes('(Cửa Hàng)')) {
                        if (!inventory[opt.value]) {
                            opt.disabled = true; // Khóa không cho bấm
                            if (!opt.text.includes('🔒')) opt.text += ' 🔒 ';
                        } else {
                            opt.disabled = false; // Đã mua -> Mở khóa
                            opt.text = opt.text.replace(' 🔒 ', '');
                        }
                    }
                });
            };
            checkInventory('edit-profile-frame');
            checkInventory('edit-profile-effect');
            checkInventory('edit-chat-frame');
        }
        
        this.toggleUserMenu();
        this.renderHistory();      
        this.renderWatchlist();
// GỌI HÀM QUÉT KHO ĐỒ VÀ MỞ KHÓA VẬT PHẨM
        this.syncLockedItems();    	
        document.getElementById('edit-profile-modal').style.display = 'flex';
    },
    
    closeEditProfile() {
        document.getElementById('edit-profile-modal').style.display = 'none';
    },
    
    async saveEditedProfile() {
        const btn = document.getElementById('btn-save-edit-profile');
        const oldUser = localStorage.getItem('haruno_user');
        const email = localStorage.getItem('haruno_email');
        const isPremium = app.wasPremium; 
        
        btn.innerText = 'Đang lưu...';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.7';

        let inputName = document.getElementById('edit-username').value.trim();
        let inputAboutMe = document.getElementById('edit-about-me').value.trim();
        const gender = document.getElementById('edit-gender').value;
        const fileInput = document.getElementById('edit-avatar-file');
        const fileInputBanner = document.getElementById('edit-banner-file');

        let premiumColor = 'theme-holo-blue';
        let profileEffect = 'none';
        let avatarFrame = 'none';
        let chatFrame = 'none';		
        if (isPremium) {
            premiumColor = document.getElementById('edit-premium-color').value;
            profileEffect = document.getElementById('edit-profile-effect').value;
            avatarFrame = document.getElementById('edit-profile-frame').value;
            chatFrame = document.getElementById('edit-chat-frame').value;
            
            // --- HÀNG RÀO BẢO MẬT CHỐNG DÙNG CHÙA ---
            const userInv = JSON.parse(localStorage.getItem('haruno_inventory') || '{}');
            const checkHack = (val, selectId) => {
                if (val === 'none') return true;
                const opt = Array.from(document.getElementById(selectId).options).find(o => o.value === val);
                if (opt && opt.text.includes('(Cửa Hàng)') && !userInv[val]) return false;
                return true;
            };
            
            if (!checkHack(avatarFrame, 'edit-profile-frame') || !checkHack(profileEffect, 'edit-profile-effect') || !checkHack(chatFrame, 'edit-chat-frame')) {
                app.showToast("Hành vi bất hợp lệ: Bạn chưa sở hữu vật phẩm này!", "error");
                btn.innerText = 'Lưu Thay Đổi'; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
                return;
            }		
        }

        if (!inputName) inputName = oldUser;
        
        if (inputName.toLowerCase() !== oldUser.toLowerCase()) {
            if (email !== ADMIN_EMAIL && (inputName.toLowerCase() === 'admin' || inputName.toLowerCase() === ADMIN_NAME.toLowerCase())) {
                app.showToast("Tên này đã được Hệ thống giữ lại. Vui lòng chọn tên khác!", "error");
                btn.innerText = 'Lưu Thay Đổi'; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
                return;
            }
        }

        let finalAvatar = localStorage.getItem('haruno_avatar');
        if(fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (isPremium && file.type === 'image/gif') {
                if(file.size > 2 * 1024 * 1024) { 
                    app.showToast("Ảnh Avatar GIF quá lớn, vui lòng chọn file dưới 2MB!", "error");
                    btn.innerText = 'Lưu Thay Đổi'; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
                    return;
                }
                finalAvatar = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve(reader.result);
                });
            } else {
                if(file.size > 5 * 1024 * 1024) { 
                    app.showToast("Ảnh Avatar quá lớn, vui lòng chọn ảnh dưới 5MB!", "error");
                    btn.innerText = 'Lưu Thay Đổi'; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
                    return;
                }
                finalAvatar = await this.resizeAndConvertImage(file);
            }
        }
        
        let finalBanner = localStorage.getItem('haruno_banner') || '';
        if (isPremium && fileInputBanner.files.length > 0) {
            const bFile = fileInputBanner.files[0];
            if (bFile.type === 'image/gif') {
                if(bFile.size > 2 * 1024 * 1024) { 
                    app.showToast("Ảnh Banner GIF quá lớn, vui lòng chọn file dưới 2MB!", "error");
                    btn.innerText = 'Lưu Thay Đổi'; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
                    return;
                }
                finalBanner = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(bFile);
                    reader.onload = () => resolve(reader.result);
                });
            } else {
                if(bFile.size > 5 * 1024 * 1024) { 
                    app.showToast("Ảnh Banner quá lớn, vui lòng chọn ảnh dưới 5MB!", "error");
                    btn.innerText = 'Lưu Thay Đổi'; btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
                    return;
                }
                finalBanner = await this.resizeAndConvertBanner(bFile);
            }
        }

        localStorage.setItem('haruno_user', inputName);
        localStorage.setItem('haruno_about_me', inputAboutMe);
        localStorage.setItem('haruno_avatar', finalAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(inputName)}`);
        localStorage.setItem('haruno_gender', gender);
        
        if (isPremium) {
            localStorage.setItem('haruno_premium_color', premiumColor);
            localStorage.setItem('haruno_profile_effect', profileEffect);
            localStorage.setItem('haruno_banner', finalBanner);
            localStorage.setItem('haruno_avatar_frame', avatarFrame);
			localStorage.setItem('haruno_chat_frame', chatFrame); // MỚI
        }

        if (email && db) {
            const safeUser = this.getSafeKey(email);
            let updateData = {
                displayName: inputName,
                aboutMe: inputAboutMe,
                avatar: finalAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(inputName)}`
            };
            if (isPremium) {
                updateData.premiumColor = premiumColor;
                updateData.profileEffect = profileEffect;
                updateData.banner = finalBanner;
                updateData.avatarFrame = avatarFrame;
				updateData.chatFrame = chatFrame; // MỚI
            }
            db.ref(`users/${safeUser}`).update(updateData);
        }

        this.closeEditProfile();
        this.checkAuth(); 
        
        btn.innerText = 'Lưu Thay Đổi';
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
        
        app.showToast("Cập nhật hồ sơ thành công!", "success");
        // Cập nhật lại khung bình luận nếu đang mở
        if (this.currentMovieSlug === 'goc-review') {
            this.loadComments('goc-review', 'review');
        } else if (this.currentMovieSlug) {
            this.loadComments(this.currentMovieSlug, 'movie');
        }
		
		// Đợi 0.3s để dữ liệu mới đồng bộ lên máy chủ, sau đó load lại mục "Người xem nói gì"
        setTimeout(() => {
            this.initLatestComments();
        }, 300);
    },
    
    logout() {
        this.showConfirm('<i class="fas fa-sign-out-alt"></i> Đăng Xuất', 'Bạn muốn đăng xuất khỏi tài khoản này?', () => {
            if(firebase.auth) {
                firebase.auth().signOut().then(() => {
                    this.clearLocalSession();
                }).catch((error) => {
                    this.clearLocalSession();
                });
            } else {
                this.clearLocalSession();
            }
        });
    },
    
    clearLocalSession() {
        localStorage.removeItem('haruno_user');
        localStorage.removeItem('haruno_avatar');
        localStorage.removeItem('haruno_email');
        localStorage.removeItem('haruno_banner'); 
        localStorage.removeItem('haruno_about_me'); 
        localStorage.removeItem('haruno_profile_effect'); 
        localStorage.removeItem('haruno_avatar_frame'); 
        localStorage.removeItem('haruno_history'); 
        localStorage.removeItem('haruno_watchlist');
        // Thêm dòng này vào danh sách removeItem
        localStorage.removeItem('haruno_chat_frame');		
        this.checkAuth();
        window.location.reload(); 
    },

    checkUpdateModal() {
        const hasSeenUpdate = localStorage.getItem('seen_update_v44');
        if (!hasSeenUpdate) {
            document.getElementById('update-modal').style.display = 'flex';
        }
        
        const apiProvider = localStorage.getItem('api_provider');
        if(apiProvider !== 'nguonc_v1') {
            localStorage.removeItem('haruno_watchlist');
            localStorage.removeItem('haruno_history');
            localStorage.setItem('api_provider', 'nguonc_v1');
        }
    },
    closeUpdateModal() {
        document.getElementById('update-modal').style.display = 'none';
        localStorage.setItem('seen_update_v44', 'true');
    },
    
    // Logic Popup Quảng Cáo (Hiện mỗi khi truy cập)
    openAdPopup() {
        setTimeout(() => {
            const adModal = document.getElementById('ad-popup-modal');
            if(adModal) adModal.style.display = 'flex';
        }, 15000); 
    },
    closeAdPopup() {
        document.getElementById('ad-popup-modal').style.display = 'none';
    },

    toggleCinemaMode() {
        this.isCinemaMode = !this.isCinemaMode;
        const overlay = document.getElementById('cinema-overlay');
        const btn = document.getElementById('btn-cinema');
        
        if (this.isCinemaMode) {
            overlay.classList.add('active');
            document.body.classList.add('cinema-active');
            btn.classList.add('active');
            btn.innerHTML = '<i class="fas fa-lightbulb" style="color: #fff; text-shadow: 0 0 5px #fff;"></i> Bật Đèn';
            document.getElementById('video-holder').scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            overlay.classList.remove('active');
            document.body.classList.remove('cinema-active');
            btn.classList.remove('active');
            btn.innerHTML = '<i class="fas fa-lightbulb"></i> Tắt Đèn';
        }
    },

    checkMovieSaved(slug) {
        const watchlist = JSON.parse(localStorage.getItem('haruno_watchlist') || '[]');
        const btn = document.getElementById('btn-save-movie');
        if(!btn) return;
        
        if (watchlist.some(m => m.slug === slug)) {
            btn.classList.add('saved');
            btn.innerHTML = '<i class="fas fa-check"></i> Đã Lưu';
        } else {
            btn.classList.remove('saved');
            btn.innerHTML = '<i class="fas fa-heart"></i> Lưu Phim';
        }
    },

    toggleSaveMovie() {
        const email = localStorage.getItem('haruno_email');
        if(!email) { 
            app.showToast("Vui lòng đăng nhập để có thể lưu bộ phim này nhé!", "error");
            this.openAuthModal(); 
            return; 
        }

        if(!this.currentMovieData) return;
        const m = this.currentMovieData;
        let watchlist = JSON.parse(localStorage.getItem('haruno_watchlist') || '[]');
        
        // Lọc rác trước khi lưu
        if (!Array.isArray(watchlist)) watchlist = Object.values(watchlist);
        watchlist = watchlist.filter(item => item && item.slug);
        
        const isSaved = watchlist.some(item => item.slug === m.slug);
        if (isSaved) {
            watchlist = watchlist.filter(item => item.slug !== m.slug);
        } else {
            watchlist.unshift({ slug: m.slug, name: m.name, thumb: this.getImage(m) });
        }
        
        localStorage.setItem('haruno_watchlist', JSON.stringify(watchlist));
        this.checkMovieSaved(m.slug); 
        this.renderWatchlist(); 
        this.syncDataToCloud('watchlist', watchlist);
    },

    renderWatchlist() {
        const email = localStorage.getItem('haruno_email');
        let watchlist = JSON.parse(localStorage.getItem('haruno_watchlist') || '[]');
        
        // LỚP GIÁP BẢO VỆ GIAO DIỆN
        if (!Array.isArray(watchlist)) watchlist = Object.values(watchlist);
        watchlist = watchlist.filter(m => m && m.slug);

        const section = document.getElementById('watchlist-section');
        const grid = document.getElementById('watchlist-grid');
        if(!section || !grid) return;
        
        if(!email) { section.style.display = 'none'; return; } 

        if(!watchlist.length) { section.style.display = 'none'; return; }
        section.style.display = 'block';
        grid.innerHTML = watchlist.map(m => `
            <div class="movie-card" style="flex: 0 0 130px; scroll-snap-align: start; border: 1px solid rgba(255,255,255,0.1);" onclick="if(!app.isDragging) { app.closeEditProfile(); app.showMovie('${m.slug}'); }">
                <div class="thumb">
                    <img class="lazyload" data-src="${m.thumb}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
                    <div class="badge" style="background:var(--accent);"><i class="fas fa-heart"></i></div>
                </div>
                <div class="meta" style="padding: 10px 8px;">
                    <h4 style="font-size: 12px;">${m.name}</h4>
                </div>
            </div>
        `).join('');
        this.observeImages();
        this.enableDragScroll(); 
    },

    openShareModal() {
        if (!this.currentMovieData) return;
        const shareUrl = window.location.origin + window.location.pathname + '?phim=' + this.currentMovieSlug;
        document.getElementById('share-link-input').value = shareUrl;
        document.getElementById('share-modal').style.display = 'flex';
    },
    closeShareModal() {
        document.getElementById('share-modal').style.display = 'none';
    },
    shareToFacebook() {
        const shareUrl = document.getElementById('share-link-input').value;
        window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl), '_blank', 'width=600,height=400');
    },
    copyShareLink() {
        const copyText = document.getElementById('share-link-input');
        copyText.select();
        copyText.setSelectionRange(0, 99999); 
        navigator.clipboard.writeText(copyText.value).then(() => {
            app.showToast("Đã copy link phim. Gửi cho bạn bè ngay nhé!", "success");
        });
    },

    hoverStar(val) {
        for(let i=1; i<=5; i++) {
            const s = document.getElementById('star-'+i);
            if(s) {
                if(i <= val) s.classList.add('hover');
                else s.classList.remove('hover');
            }
        }
    },
    resetStarHover() {
        for(let i=1; i<=5; i++) {
            const s = document.getElementById('star-'+i);
            if(s) s.classList.remove('hover');
        }
    },
    rateMovie(val) {
        const email = localStorage.getItem('haruno_email');
        if(!email) { this.openAuthModal(); return; }
        if(!db) { app.showToast("Chưa kết nối Firebase! Không thể gửi đánh giá.", "error"); return; }
        
        const safeUser = this.getSafeKey(email);
        const slug = this.currentMovieSlug;
        db.ref('ratings/' + slug + '/' + safeUser).set(val);
    },
    loadRatings(slug) {
        const textEl = document.getElementById('rating-text');
        if (!db) {
            if(textEl) textEl.innerText = "Chưa kết nối máy chủ";
            return;
        }

        db.ref('ratings/' + slug).on('value', (snapshot) => {
            const data = snapshot.val();
            let sum = 0;
            let count = 0;
            let userVote = 0;
            const email = localStorage.getItem('haruno_email');
            const safeUser = email ? this.getSafeKey(email) : null;

            if(data) {
                for(let key in data) {
                    sum += data[key];
                    count++;
                    if(key === safeUser) userVote = data[key];
                }
            }
            
            let avg = count > 0 ? (sum/count) : 0;
            
            if(textEl) {
                if(count > 0) {
                    textEl.innerHTML = `⭐ ${avg.toFixed(1)}/5 (${count} đánh giá) ${userVote ? '<span style="color:var(--accent); margin-left: 5px;">- Bạn cho '+userVote+' sao</span>' : ''}`;
                } else {
                    textEl.innerHTML = `Chưa có đánh giá. Hãy là người đầu tiên xem và đánh giá nàooo!`;
                }
            }

            let fillStars = Math.round(avg);
            for(let i=1; i<=5; i++) {
                const s = document.getElementById('star-'+i);
                if(s) {
                    if(i <= fillStars) s.classList.add('active');
                    else s.classList.remove('active');
                }
            }
        });
    },

    deleteComment(commentId) {
        this.showConfirm('<i class="fas fa-trash"></i> Xóa bình luận', 'Xóa vĩnh viễn bình luận này khỏi hệ thống?', () => {
            db.ref(`comments/${this.currentMovieSlug}/${commentId}`).remove();
            app.showToast("Đã xóa bình luận", "success");
        });
    },

    pinComment(commentId) {
        const slug = this.currentMovieSlug;
        db.ref(`comments/${slug}/${commentId}/isPinned`).once('value', snap => {
            const isPinned = snap.val();
            if(isPinned) {
                db.ref(`comments/${slug}/${commentId}/isPinned`).remove();
            } else {
                db.ref(`comments/${slug}`).once('value', allSnap => {
                    allSnap.forEach(child => {
                        if(child.val().isPinned) child.ref.child('isPinned').remove();
                    });
                    db.ref(`comments/${slug}/${commentId}/isPinned`).set(true);
                });
            }
        });
    },

    likeComment(commentId, commentOwnerName, commentOwnerKey) {
        const email = localStorage.getItem('haruno_email');
        const user = localStorage.getItem('haruno_user');
        if(!email) { this.openAuthModal(); return; }
        if(!db) return;
        
        const e = window.event;
        const clickX = e ? e.clientX : window.innerWidth / 2;
        const clickY = e ? e.clientY : window.innerHeight / 2;

        const safeUser = this.getSafeKey(email);
        const safeOwner = commentOwnerKey || this.getSafeKey(commentOwnerName);
        
        const likeRef = db.ref(`comments/${this.currentMovieSlug}/${commentId}/likes/${safeUser}`);
        likeRef.once('value', snapshot => {
            if(snapshot.exists()) {
                likeRef.remove(); 
                if(safeUser !== safeOwner) {
                    fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { 
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'rewardLike', ownerKey: safeOwner, isLiking: false })
                    });
                }
            } else {
                likeRef.set(true); 
                this.spawnHearts(clickX, clickY); 
                
                if(safeUser !== safeOwner) {
                    fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { 
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'rewardLike', ownerKey: safeOwner, isLiking: true })
                    });

                    db.ref(`notifications/${safeOwner}`).push({
                        type: 'like', from: user, movieSlug: this.currentMovieSlug, movieName: this.currentMovieName, date: this.getTimeString(), read: false
                    });
                }
            }
        });
    },

    showReplyBox(commentId, commentOwnerName, commentOwnerKey) {
        const email = localStorage.getItem('haruno_email');
        if(!email) { this.openAuthModal(); return; }
        
        document.querySelectorAll('[id^="reply-container-"]').forEach(el => el.innerHTML = '');
        
        const container = document.getElementById(`reply-container-${commentId}`);
        if(container) {
            const safeName = commentOwnerName.replace(/'/g, "\\'");
            const safeKey = commentOwnerKey || this.getSafeKey(commentOwnerName);
            container.innerHTML = `
                <div class="reply-input-wrapper">
                    <input type="text" id="reply-input-${commentId}" placeholder="Trả lời ${commentOwnerName}..." onkeydown="if(event.key === 'Enter') app.postReply('${commentId}', '${safeName}', '${safeKey}')">
                    <button onclick="app.postReply('${commentId}', '${safeName}', '${safeKey}')" aria-label="Gửi phản hồi"><i class="fas fa-paper-plane"></i></button>
                </div>
            `;
            setTimeout(() => document.getElementById(`reply-input-${commentId}`).focus(), 100);
        }
    },

    postReply(commentId, commentOwnerName, commentOwnerKey) {
        const user = localStorage.getItem('haruno_user');
        const email = localStorage.getItem('haruno_email');
        let avatar = localStorage.getItem('haruno_avatar');
        if(!user || !email) { this.openAuthModal(); return; }
        if (!avatar) avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user)}`;
        
        const input = document.getElementById(`reply-input-${commentId}`);
        const text = input ? input.value.trim() : '';
        if(!text || !db) return;

        const slug = this.currentMovieSlug;
        const safeUser = this.getSafeKey(email);
        const safeOwner = commentOwnerKey || this.getSafeKey(commentOwnerName);
        
        let finalText = text;
        if (!text.startsWith('@' + commentOwnerName)) {
            finalText = `<span style="color:var(--accent); font-weight:800;">@${commentOwnerName}</span> ${text}`;
        }

        db.ref('comments/' + slug + '/' + commentId + '/replies').push({
            name: user,
            emailKey: safeUser,
            avatar: avatar,
            text: finalText,
            date: this.getTimeString()
        });
        
        // Cập nhật tên/avatar và Gọi Cloudflare để cộng xu bảo mật
        db.ref(`users/${safeUser}`).update({ displayName: user, avatar: avatar });
        
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'rewardComment', safeKey: safeUser })
        });
        
        if (safeUser !== safeOwner) {
            db.ref(`notifications/${safeOwner}`).push({
                type: 'reply', from: user, movieSlug: slug, movieName: this.currentMovieName, date: this.getTimeString(), read: false
            });
        }
        
        if (input) input.value = '';
    },

    getTimeString() {
        const now = new Date();
        return now.getHours() + ':' + (now.getMinutes()<10?'0':'') + now.getMinutes() + ' - ' + now.getDate() + '/' + (now.getMonth()+1);
    },

    loadComments(slug, type) {
        const listId = type === 'movie' ? 'comments-list-movie' : 'comments-list-review';
        const list = document.getElementById(listId);
        if (!list) return;

        const user = localStorage.getItem('haruno_user');
        const avatar = localStorage.getItem('haruno_avatar');
        const userEmail = localStorage.getItem('haruno_email'); 
        
        const avatarImgId = type === 'movie' ? 'current-user-avatar-movie' : 'current-user-avatar-review';
        const avatarWrapId = type === 'movie' ? 'current-user-avatar-wrapper-movie' : 'current-user-avatar-wrapper-review';
        
        const avatarImg = document.getElementById(avatarImgId);
        const avatarWrap = document.getElementById(avatarWrapId);
        
        if(avatarWrap && avatarImg) {
            if(user && userEmail) { 
                const safeKey = this.getSafeKey(userEmail);
                const ownerData = this.usersData[safeKey] || {};
                const isPremium = ownerData.isPremium ? true : false;

                avatarImg.src = avatar ? avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user)}`; 
                avatarWrap.className = `comment-avatar ${isPremium ? 'premium' : this.getRankClass(userEmail)}`;
                avatarWrap.style.display = 'flex'; 
                
                const avatarFrame = isPremium && ownerData.avatarFrame && ownerData.avatarFrame !== 'none' ? ownerData.avatarFrame : '';
                let frameDiv = avatarWrap.querySelector('.avatar-frame');
                if (!frameDiv) {
                    frameDiv = document.createElement('div');
                    avatarWrap.appendChild(frameDiv);
                }
                frameDiv.className = `avatar-frame ${avatarFrame}`;
            } else { 
                avatarWrap.style.display = 'none'; 
            }
        }

        if (!db) {
            list.innerHTML = '<p style="color:#ff4d4d; text-align:center; padding: 20px;">Vui lòng kết nối Cơ Sở Dữ Liệu (Firebase) để kích hoạt bình luận Online!</p>';
            return;
        }

        list.innerHTML = '<p style="color:#888; text-align:center; padding: 20px;">Đang tải bình luận...</p>';

        db.ref('comments/' + slug).on('value', (snapshot) => {
            let comments = [];
            snapshot.forEach(child => {
                comments.push({ id: child.key, ...child.val() });
            });
            comments.reverse(); 
            
            const currentUserEmail = localStorage.getItem('haruno_email');
            const safeCurrentUser = currentUserEmail ? this.getSafeKey(currentUserEmail) : null;
            
            if(comments.length === 0) {
                list.innerHTML = '';
                return;
            }

            let pinnedIndex = comments.findIndex(c => c.isPinned);
            if (pinnedIndex > -1) {
                let pinnedComment = comments.splice(pinnedIndex, 1)[0];
                comments.unshift(pinnedComment);
            } else {
                let maxLikes = 1; 
                let topIdx = -1;
                comments.forEach((c, idx) => {
                    const lCount = c.likes ? Object.keys(c.likes).length : 0;
                    if (lCount > maxLikes) {
                        maxLikes = lCount;
                        topIdx = idx;
                    }
                });
                if (topIdx > -1) {
                    let topComment = comments.splice(topIdx, 1)[0];
                    topComment.isTop = true;
                    comments.unshift(topComment);
                }
            }
            
            list.innerHTML = comments.map(c => {
                const likesCount = c.likes ? Object.keys(c.likes).length : 0;
                const isLiked = (c.likes && safeCurrentUser && c.likes[safeCurrentUser]) ? 'liked' : '';
                
                const ownerKey = c.emailKey || this.getSafeKey(c.name); 
                
                const ownerData = this.usersData[ownerKey] || {};
                const currentName = ownerData.displayName || c.name;
                const currentAvatar = ownerData.avatar || c.avatar;
                
                const isPremium = ownerData.isPremium ? true : false;
                const nameClass = isPremium ? 'premium-name' : '';
                const avatarPremiumClass = isPremium ? 'premium' : this.getRankClass(ownerKey);
                const premiumBadgeHtml = this.getFinalBadge(ownerKey, isPremium);

                const avatarFrameList = isPremium && ownerData.avatarFrame && ownerData.avatarFrame !== 'none' ? ownerData.avatarFrame : '';
                const frameHtml = avatarFrameList ? `<div class="avatar-frame ${avatarFrameList}"></div>` : '';
				
				let chatFrameList = isPremium && ownerData.chatFrame && ownerData.chatFrame !== 'none' ? ownerData.chatFrame : ''; // MỚI

                const isFeatured = c.isPinned || c.isTop;
                const featuredClass = isFeatured ? 'featured-comment' : '';
                const featuredBadge = isFeatured ? `<div class="featured-badge"><i class="fas fa-crown"></i> Tiêu Biểu</div>` : '';
				
                // KIỂM TRA VÀ CHÈN IMAGE BACKGROUND (MAIN COMMENTS)
                let bgImgUrl = '';
                if (chatFrameList === 'chat-effect-1') {
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481388758455550114/animated';
                } else if (chatFrameList === 'chat-effect-2') {
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481389947515830282/animated';
                } else if (chatFrameList === 'chat-effect-3') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481390594810183700/animated';
                } else if (chatFrameList === 'chat-effect-4') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655399641249/animated';
                } else if (chatFrameList === 'chat-effect-5') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655424933978/animated';
                } else if (chatFrameList === 'chat-effect-6') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655462555658/animated';
                } else if (chatFrameList === 'chat-effect-7') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655487848501/animated';
                } else if (chatFrameList === 'chat-effect-8') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488244924066566185/animated';
				} else if (chatFrameList === 'chat-effect-9') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245189482123364/animated';
				} else if (chatFrameList === 'chat-effect-10') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245478213816320/animated';
				} else if (chatFrameList === 'chat-effect-11') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245662947475506/animated';
				} else if (chatFrameList === 'chat-effect-12') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245817364975626/animated';
				} else if (chatFrameList === 'chat-effect-13') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245996054904983/animated';
				} else if (chatFrameList === 'chat-effect-14') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488246136585060452/animated';
				} else if (chatFrameList === 'chat-effect-15') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488246309197713542/animated';
                }
                const effectBg = bgImgUrl ? `<img src="${bgImgUrl}" class="chat-frame-bg-image" alt="Effect">` : '';

                let adminBtns = '';
                if (currentUserEmail === ADMIN_EMAIL || user === ADMIN_NAME) {
                    adminBtns = `
                        <span class="admin-pin-btn" onclick="app.pinComment('${c.id}')"><i class="fas fa-thumbtack"></i> ${c.isPinned ? 'Bỏ ghim' : 'Ghim'}</span>
                        <span class="admin-action-btn" onclick="app.deleteComment('${c.id}')"><i class="fas fa-trash"></i> Xóa</span>
                    `;
                }

                const actionHtml = c.id !== 'sys' ? `
                    <div class="comment-actions">
                        <span class="${isLiked}" onclick="app.likeComment('${c.id}', '${currentName.replace(/'/g, "\\'")}', '${ownerKey}')"><i class="fas fa-thumbs-up"></i> ${likesCount > 0 ? likesCount : 'Thích'}</span>
                        <span onclick="app.showReplyBox('${c.id}', '${currentName.replace(/'/g, "\\'")}', '${ownerKey}')"><i class="fas fa-reply"></i> Phản hồi</span>
                        ${adminBtns}
                    </div>
                ` : '';

                let repliesHtml = '';
                if (c.replies) {
                    const reps = Object.values(c.replies);
                    repliesHtml = '<div class="replies-list">' + reps.map(r => {
                        const repOwnerKey = r.emailKey || this.getSafeKey(r.name);
                        const repOwnerData = this.usersData[repOwnerKey] || {};
                        const repCurrentName = repOwnerData.displayName || r.name;
                        const repCurrentAvatar = repOwnerData.avatar || r.avatar;
                        
                        const repIsPremium = repOwnerData.isPremium ? true : false;
                        const repNameClass = repIsPremium ? 'premium-name' : '';
                        const repAvatarPremiumClass = repIsPremium ? 'premium' : this.getRankClass(repOwnerKey);
                        const repPremiumBadgeHtml = this.getFinalBadge(repOwnerKey, repIsPremium);

                        const repAvatarFrame = repIsPremium && repOwnerData.avatarFrame && repOwnerData.avatarFrame !== 'none' ? repOwnerData.avatarFrame : '';
                        const repFrameHtml = repAvatarFrame ? `<div class="avatar-frame ${repAvatarFrame}"></div>` : '';
						
						let repChatFrame = repIsPremium && repOwnerData.chatFrame && repOwnerData.chatFrame !== 'none' ? repOwnerData.chatFrame : ''; // MỚI
						
						// KIỂM TRA VÀ CHÈN IMAGE BACKGROUND (REPLIES)
                        let repBgImgUrl = '';
                        if (repChatFrame === 'chat-effect-1') {
                            repBgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481388758455550114/animated';
                        } else if (repChatFrame === 'chat-effect-2') {
                            repBgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481389947515830282/animated';
						} else if (repChatFrame === 'chat-effect-3') { // <-- THÊM DÒNG NÀY
                            repBgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481390594810183700/animated';
                        } else if (repChatFrame === 'chat-effect-4') { // <-- THÊM DÒNG NÀY
                            repBgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655399641249/animated';
                        } else if (repChatFrame === 'chat-effect-5') { // <-- THÊM DÒNG NÀY
                            repBgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655424933978/animated';
                        } else if (repChatFrame === 'chat-effect-6') { // <-- THÊM DÒNG NÀY
                            repBgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655462555658/animated';
                        } else if (repChatFrame === 'chat-effect-7') { // <-- THÊM DÒNG NÀY
                            repBgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655487848501/animated';
                        } else if (chatFrameList === 'chat-effect-8') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488244924066566185/animated';
				} else if (chatFrameList === 'chat-effect-9') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245189482123364/animated';
				} else if (chatFrameList === 'chat-effect-10') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245478213816320/animated';
				} else if (chatFrameList === 'chat-effect-11') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245662947475506/animated';
				} else if (chatFrameList === 'chat-effect-12') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245817364975626/animated';
				} else if (chatFrameList === 'chat-effect-13') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245996054904983/animated';
				} else if (chatFrameList === 'chat-effect-14') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488246136585060452/animated';
				} else if (chatFrameList === 'chat-effect-15') { // <-- THÊM DÒNG NÀY
                    bgImgUrl = 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488246309197713542/animated';
                }
                        const repEffectBg = repBgImgUrl ? `<img src="${repBgImgUrl}" class="chat-frame-bg-image" alt="Effect">` : '';

                        return `
                        <div class="reply-item ${repChatFrame}">
                            ${repEffectBg}
                            <div class="comment-avatar ${repAvatarPremiumClass}" style="cursor: pointer;" onclick="app.showUserProfile('${repOwnerKey}', '${repCurrentName.replace(/'/g, "\\'")}', '${repCurrentAvatar}')" title="Xem hồ sơ ${repCurrentName.replace(/'/g, "\\'")}"><img src="${repCurrentAvatar}" alt="Avatar">${repFrameHtml}</div>
                            <div class="comment-content">
                                <div class="comment-author"><span class="${repNameClass}">${repCurrentName}</span> ${repPremiumBadgeHtml} <span class="comment-date">${r.date}</span></div>
                                <div class="comment-text">${r.text}</div>
                                ${c.id !== 'sys' ? `<div class="comment-actions" style="margin-top: 4px;">
                                    <span onclick="app.showReplyBox('${c.id}', '${repCurrentName.replace(/'/g, "\\'")}', '${repOwnerKey}')"><i class="fas fa-reply"></i> Phản hồi</span>
                                </div>` : ''}
                            </div>
                        </div>`
                    }).join('') + '</div>';
                }

                let renderedText = c.text;
                if (c.isSpoiler) {
                    renderedText = `
                    <div class="spoiler-wrapper" onclick="this.classList.add('revealed')">
                        <div class="spoiler-overlay"><i class="fas fa-eye-slash"></i> Bị ẩn vì chứa Spoil. Bấm để xem!</div>
                        <div class="spoiler-text">${c.text}</div>
                    </div>`;
                }

                return `
                    <div class="comment-item ${featuredClass} ${chatFrameList}">
                        ${effectBg} ${featuredBadge}
                        <div class="comment-avatar ${avatarPremiumClass}" style="cursor: pointer;" onclick="app.showUserProfile('${ownerKey}', '${currentName.replace(/'/g, "\\'")}', '${currentAvatar}')" title="Xem hồ sơ ${currentName.replace(/'/g, "\\'")}"><img src="${currentAvatar}" alt="Avatar">${frameHtml}</div>
                        <div class="comment-content">
                            <div class="comment-author"><span class="${nameClass}">${currentName}</span> ${premiumBadgeHtml} <span class="comment-date">${c.date}</span></div>
                            <div class="comment-text">${renderedText}</div>
                            ${actionHtml}
                            <div id="reply-container-${c.id}"></div>
                            ${repliesHtml}
                        </div>
                    </div>
                `;
            }).join('');
        });
    },

    postComment(type) {
        const user = localStorage.getItem('haruno_user');
        const email = localStorage.getItem('haruno_email');
        let avatar = localStorage.getItem('haruno_avatar');
        
        if(!user || !email) { this.openAuthModal(); return; } 
        if (!avatar) avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user)}`;
        
        const inputId = type === 'movie' ? 'comment-text-movie' : 'comment-text-review';
        const text = document.getElementById(inputId).value.trim();
        if(!text) return;

        if (!db) { app.showToast("Bạn chưa cấu hình Firebase. Bình luận không thể gửi lên mạng!", "error"); return; }

        const slug = this.currentMovieSlug;
        const safeUser = this.getSafeKey(email);
        
        const spoilerCheckbox = document.getElementById('spoiler-check-' + type);
        const isSpoiler = spoilerCheckbox ? spoilerCheckbox.checked : false;
        
        const newComment = { 
            name: user, emailKey: safeUser, avatar: avatar, text: text, 
            date: this.getTimeString(), movieName: this.currentMovieName,
            isSpoiler: isSpoiler
        };
        
        db.ref('comments/' + slug).push(newComment);
        
        // Cập nhật tên/avatar và Gọi Cloudflare để cộng xu bảo mật
        db.ref(`users/${safeUser}`).update({ displayName: user, avatar: avatar });
        
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'rewardComment', safeKey: safeUser })
        });
        
        document.getElementById(inputId).value = '';
        if(spoilerCheckbox) spoilerCheckbox.checked = false;
    },

    async randomMovie() {
        try {
            const randomPage = Math.floor(Math.random() * 20) + 1;
            const res = await fetch(`${API_URL}/films/phim-moi-cap-nhat?page=${randomPage}`);
            const data = await res.json();
            const items = this.extractItems(data);
            
            if (items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                this.showMovie(randomItem.slug);
            } else {
                app.showToast("Không tìm thấy phim ngẫu nhiên. Vui lòng thử lại!", "error");
            }
        } catch (e) {
            console.log("Lỗi Random Phim:", e);
        }
    },

    toggleSearch() {
        const searchWrap = document.getElementById('searchWrapper');
        const menuWrap = document.getElementById('navMenu');
        if (menuWrap) menuWrap.classList.remove('active'); 
        
        searchWrap.classList.toggle('active');
        if (searchWrap.classList.contains('active')) {
            document.getElementById('searchInput').focus();
        }
    },

    toggleMenu() {
        const menuWrap = document.getElementById('navMenu');
        const searchWrap = document.getElementById('searchWrapper');
        if (searchWrap) searchWrap.classList.remove('active'); 
        
        menuWrap.classList.toggle('active');
    },

    getImage(movie) {
        let path = movie.thumb_url || movie.poster_url;
        if (!path) return 'https://via.placeholder.com/300x450?text=No+Image';
        return path.startsWith('http') ? path : IMG_DOMAIN + path;
    },
    
    showSkeleton(elementId, count = 12, isHorizontal = false) {
        const grid = document.getElementById(elementId);
        if (!grid) return;
        const skeletonHTML = Array(count).fill(`
            <div class="movie-card" style="flex: 0 0 180px; scroll-snap-align: start; border:none; background:transparent;">
                <div class="skeleton skel-img"></div>
                <div class="skeleton skel-text" style="width: 80%; margin-top: 10px;"></div>
                <div class="skeleton skel-text" style="width: 50%;"></div>
            </div>
        `).join('');
        grid.innerHTML = skeletonHTML;
    },

    createMovieCard(m, isHorizontal = false) {
        const year = m.year || 'Đang cập nhật';
        const countries = this.toList(m.country);
        const country = countries.length > 0 ? countries[0].name : 'N/A';
        
        const format = `${m.quality || 'HD'} ${m.language || m.lang || ''}`;
        const status = m.current_episode || m.episode_current || 'Đang cập nhật';
        
        const categories = this.toList(m.category);
        const genres = categories.map(c => c.name).slice(0, 2).join(', ');
        
        const originName = m.original_name || m.origin_name || '';

        const card = document.createElement('div');
        card.className = `movie-card`;
        if(isHorizontal) {
            card.style.flex = '0 0 180px';
            card.style.scrollSnapAlign = 'start';
        }
        
        card.innerHTML = `
            <div class="thumb">
                <img class="lazyload" data-src="${this.getImage(m)}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="${m.name}">
                <div class="badge">${status}</div>
                <div class="hover-info">
                    <div class="hover-content">
                        <h4>${m.name}</h4>
                        <div class="h-details-grid">
                            <div class="h-item" title="${country}"><span>Quốc gia:</span> ${country}</div>
                            <div class="h-item"><span>Định dạng:</span> ${format}</div>
                            <div class="h-item"><span>Năm:</span> ${year}</div>
                            <div class="h-item" title="${status}"><span>Tình trạng:</span> ${status}</div>
                        </div>
                        <div class="h-genre-tag">${genres}</div>
                        <div class="h-btn"><i class="fas fa-play"></i> XEM NGAY</div>
                    </div>
                </div>
                <div class="play-btn"><i class="fas fa-play"></i></div>
            </div>
            <div class="meta">
                <h4>${m.name}</h4>
                ${originName ? `<p style="font-size:11px; color:#888; margin: 3px 0 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${originName}">${originName}</p>` : ''}
            </div>
        `;
        
        card.onclick = () => {
            if(!app.isDragging) app.showMovie(m.slug);
        };
        return card;
    },

    // --- TÍNH NĂNG MỚI: BỘ SƯU TẬP & LỊCH CHIẾU ---
    async initCollections() {
        try {
            const [resBo, resAnime, resLe] = await Promise.all([
                fetch(`${API_URL}/films/the-loai/phim-Bo?page=1`),
                fetch(`${API_URL}/films/danh-sach/hoat-hinh?page=1`),
                fetch(`${API_URL}/films/the-loai/phim-le?page=1`)
            ]);

            const [dataBo, dataAnime, dataLe] = await Promise.all([
                resBo.json(), resAnime.json(), resLe.json()
            ]);

            // 1. Render Phim Bộ Đang Chiếu
            const itemsBo = this.extractItems(dataBo).filter(m => {
                const epStr = (m.current_episode || m.episode_current || '').toLowerCase();
                return epStr.includes('tập') && !epStr.includes('full') && !epStr.includes('hoàn tất');
            }).slice(0, 15);
            const gridBo = document.getElementById('schedule-grid');
            if(gridBo && itemsBo.length) {
                gridBo.innerHTML = ''; 
                itemsBo.forEach(m => gridBo.appendChild(this.createMovieCard(m, true))); 
                document.getElementById('schedule-section').style.display = 'block';
            }

            // 2. Render Tuyển Tập Anime 
            const itemsAnime = this.extractItems(dataAnime).slice(0, 12);
            const gridAnime = document.getElementById('collection-anime-grid');
            if(gridAnime && itemsAnime.length) {
                gridAnime.innerHTML = '';
                itemsAnime.forEach(m => gridAnime.appendChild(this.createMovieCard(m, true)));
                document.getElementById('collection-anime-section').style.display = 'block';
            }

            // 3. Render Phim Lẻ
            const itemsLe = this.extractItems(dataLe).slice(0, 12);
            const gridLe = document.getElementById('collection-tet-grid');
            if(gridLe && itemsLe.length) {
                gridLe.innerHTML = '';
                itemsLe.forEach(m => gridLe.appendChild(this.createMovieCard(m, true)));
                document.getElementById('collection-tet-section').style.display = 'block';
            }

            this.observeImages(); 
            this.enableDragScroll();
        } catch (e) { 
            console.log("Lỗi tải Collection:", e); 
        }
    },

    // --- TÍNH NĂNG MỚI: RENDER PHÂN TRANG SỐ ---
    renderPagination(totalPages) {
        const wrap = document.getElementById('pagination-wrapper');
        if (!wrap) return;
        if (totalPages <= 1) { wrap.innerHTML = ''; return; }

        let html = '';
        const curr = this.currentPage;

        if (curr > 1) {
            html += `<button class="page-btn" onclick="app.goToPage(${curr - 1})"><i class="fas fa-chevron-left"></i></button>`;
        }

        let startPage = Math.max(1, curr - 2);
        let endPage = Math.min(totalPages, curr + 2);

        if (startPage > 1) {
            html += `<button class="page-btn" onclick="app.goToPage(1)">1</button>`;
            if (startPage > 2) html += `<span class="page-dots">...</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            if (i === curr) {
                html += `<button class="page-btn active">${i}</button>`;
            } else {
                html += `<button class="page-btn" onclick="app.goToPage(${i})">${i}</button>`;
            }
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span class="page-dots">...</span>`;
            html += `<button class="page-btn" onclick="app.goToPage(${totalPages})">${totalPages}</button>`;
        }

        if (curr < totalPages) {
            html += `<button class="page-btn" onclick="app.goToPage(${curr + 1})"><i class="fas fa-chevron-right"></i></button>`;
        }

        wrap.innerHTML = html;
    },

    goToPage(page) {
        this.currentPage = page;
        this.renderMovies();
        const gridHeader = document.getElementById('page-title');
        if (gridHeader) {
            const y = gridHeader.getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    },

    async renderMovies() {
        // 1. CÀI ĐẶT SỐ TRANG MUỐN GỘP (2 = ~20-24 phim, 3 = ~30-36 phim)
        const pagesPerLoad = 2; 
        
        // Tính toán trang API thực tế cần gọi
        const startApiPage = (this.currentPage - 1) * pagesPerLoad + 1;
        
        let urls = [];
        for (let i = 0; i < pagesPerLoad; i++) {
            let apiPage = startApiPage + i;
            if (this.isSearch) {
                urls.push(`${API_URL}/films/search?keyword=${encodeURIComponent(this.currentType)}&page=${apiPage}`);
            } else if (this.currentType === 'phim-moi-cap-nhat') {
    // Đã bỏ timestamp đi để cache hoạt động được
    urls.push(`${API_URL}/films/phim-moi-cap-nhat?page=${apiPage}`);
} else if (this.currentType === 'anime-custom') {
                // Bỏ qua, xử lý custom anime bên dưới
            } else {
                const path = this.currentType; 
                urls.push(`${API_URL}/films/${path}?page=${apiPage}`);
            }
        }

        // Hiển thị bộ xương chờ loading (skeleton) cho toàn bộ phim sắp tải
        this.showSkeleton('movie-grid', 12 * pagesPerLoad);
        const grid = document.getElementById('movie-grid');
        grid.innerHTML = '';

        try {
            let allItems = [];
            let totalPages = 1;

            if (this.currentType === 'anime-custom') {
                let targetCount = 12 * pagesPerLoad; 
                let maxPagesToScan = 8; 
                let pagesScanned = 0;
                let fetchPage = startApiPage;
                
                while(allItems.length < targetCount && pagesScanned < maxPagesToScan) {
                    let tempUrl = `${API_URL}/films/quoc-gia/nhat-ban?page=${fetchPage}`;
                    let res = await fetch(tempUrl);
                    let data = await res.json();
                    let tempItems = this.extractItems(data);
                    if (tempItems.length === 0) break; 
                    
                    let filtered = tempItems.filter(m => {
                        if (m.type === 'hoathinh' || m.type === 'anime') return true;
                        const cats = this.toList(m.category);
                        return cats.some(c => c.slug === 'hoat-hinh' || c.slug === 'anime');
                    });
                    allItems = allItems.concat(filtered);
                    fetchPage++; 
                    pagesScanned++;
                }
                totalPages = this.currentPage + 1;
            } else {
                // 2. GỌI API ĐỒNG THỜI NHIỀU TRANG CÙNG LÚC ĐỂ LẤY NHIỀU PHIM HƠN
                const fetchPromises = urls.map(url => this.fetchWithCache(url, 300));
                const results = await Promise.all(fetchPromises);
                
                results.forEach(data => {
                    if (data) {
                        let items = this.extractItems(data);
                        allItems = allItems.concat(items);
                        
                        let apiTotalPages = 1;
                        if(data.paginate && data.paginate.total_page) apiTotalPages = data.paginate.total_page;
                        else if(data.data && data.data.paginate && data.data.paginate.total_page) apiTotalPages = data.data.paginate.total_page;
                        else if(data.data && data.data.params && data.data.params.pagination) apiTotalPages = Math.ceil(data.data.params.pagination.totalItems / data.data.params.pagination.totalItemsPerPage);
                        
                        totalPages = Math.ceil(apiTotalPages / pagesPerLoad);
                    }
                });
            }

            // 3. LỌC TRÙNG LẶP (Đề phòng API trả về cùng 1 phim ở 2 trang khác nhau)
            const uniqueItems = Array.from(new Map(allItems.map(m => [m.slug, m])).values());

            if (uniqueItems.length > 0) {
                uniqueItems.forEach(m => grid.appendChild(this.createMovieCard(m)));
                this.observeImages();
                this.renderPagination(totalPages);
            } else {
                grid.innerHTML = '<p style="text-align:center; width:100%; padding: 40px; color: var(--accent);">Tạm thời chưa có dữ liệu phim cho mục này</p>';
                document.getElementById('pagination-wrapper').innerHTML = '';
            }
        } catch (e) { 
            console.log("Lỗi Render:", e); 
            grid.innerHTML = '<p style="text-align:center; width:100%;">Lỗi kết nối máy chủ.</p>';
            document.getElementById('pagination-wrapper').innerHTML = '';
        }
    },

    updateEpNavButtons() {
        const btnPrev = document.getElementById('btn-prev-ep');
        const btnNext = document.getElementById('btn-next-ep');
        if(!btnPrev || !btnNext) return;
        
        if (this.currentEpIndex > 0) btnPrev.style.display = 'inline-flex';
        else btnPrev.style.display = 'none';

        if (this.currentEpIndex >= 0 && this.currentEpIndex < this.currentEpList.length - 1) btnNext.style.display = 'inline-flex';
        else btnNext.style.display = 'none';
    },

    playNextEp() {
        if (this.currentEpIndex >= 0 && this.currentEpIndex < this.currentEpList.length - 1) {
            const nextIdx = this.currentEpIndex + 1;
            const epBtns = document.querySelectorAll('.ep-btn');
            if(epBtns[nextIdx]) epBtns[nextIdx].click();
            document.getElementById('video-holder').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    playPrevEp() {
        if (this.currentEpIndex > 0) {
            const prevIdx = this.currentEpIndex - 1;
            const epBtns = document.querySelectorAll('.ep-btn');
            if(epBtns[prevIdx]) epBtns[prevIdx].click();
            document.getElementById('video-holder').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    async showMovie(slug, savedEpLink = null) {
        if (this.isCinemaMode) this.toggleCinemaMode();
        
        this.currentRoomId = null;
        
        if (this.currentMovieSlug && db) {
            db.ref('comments/' + this.currentMovieSlug).off();
            db.ref('ratings/' + this.currentMovieSlug).off();
        }

        this.currentMovieSlug = slug; 
        
        document.getElementById('search-results-dropdown').style.display = 'none';
        document.getElementById('searchInput').value = '';
        document.getElementById('searchWrapper').classList.remove('active');

        window.scrollTo(0, 0);
        this.showHome(false); 
        
        document.getElementById('m-name').innerText = "Đang tải...";
        document.getElementById('m-origin-name').innerText = "";
        document.getElementById('m-summary').innerHTML = "";
        
        const epBox = document.getElementById('episode-list');
        const serverBox = document.getElementById('server-list');
        epBox.innerHTML = '';
        if(serverBox) serverBox.innerHTML = '';

        this.showSkeleton('similar-grid', 6, true);
        
        document.getElementById('btn-prev-ep').style.display = 'none';
        document.getElementById('btn-next-ep').style.display = 'none';

        try {
            let m = null;
            let episodesData = [];

            try {
                // Cache chi tiết phim trong 10 phút (600s) vì nó ít khi thay đổi
                const dataNguonC = await this.fetchWithCache(`${API_URL}/film/${slug}`, 600);
                if (dataNguonC) {
                    m = dataNguonC.movie || dataNguonC.item || dataNguonC.data?.item || dataNguonC.data?.movie;
                }
                
                if (m) {
                    let n_eps = this.toList(m.episodes || dataNguonC.episodes || dataNguonC.item?.episodes);
                    n_eps.forEach((srv, i) => {
                        if (!srv.server_name || srv.server_name.trim() === '') {
                            srv.server_name = `Server ${i+1}`;
                        }
                    });
                    episodesData = n_eps;
                }
            } catch (e) { console.log("Lỗi lấy NguonC", e); }

            if(!m) {
                app.showToast("Bộ phim này không tồn tại hoặc đã bị gỡ khỏi hệ thống!", "error");
                this.showHome();
                return;
            }
            
            this.currentMovieData = m; 
            this.currentMovieName = m.name;
            
            const finalImg = this.getImage(m);
            const originName = m.original_name || m.origin_name || '';
            
            document.title = `${m.name} - Đơn Giản Là Web Xem Phim`;

            document.getElementById('m-name').innerText = m.name;
            document.getElementById('m-origin-name').innerText = originName;
            document.getElementById('m-poster').src = finalImg;
            document.getElementById('detail-blur-bg').style.backgroundImage = `url(${finalImg})`;
            
            document.getElementById('m-year').innerText = m.year ? `Năm: ${m.year}` : 'Năm: Đang cập nhật';
            document.getElementById('m-quality').innerText = m.quality || 'HD';
            document.getElementById('m-lang').innerText = m.language || m.lang || 'Vietsub';
            
            const epTotalEl = document.getElementById('m-ep-total');
            const epTotalTextEl = document.getElementById('m-ep-total-text');
            let totalEps = m.episode_total || m.total_episodes || m.total_episode || '';
            if (totalEps && totalEps.toString().trim() !== '' && totalEps.toString().trim() !== '0' && totalEps.toString().toLowerCase() !== 'đang cập nhật') {
                epTotalTextEl.innerText = `${totalEps} Tập`;
                epTotalEl.style.display = 'inline-block';
            } else {
                epTotalEl.style.display = 'none';
            }

            const scheduleEl = document.getElementById('m-schedule');
            const scheduleTextEl = document.getElementById('m-schedule-text');
            let scheduleInfo = m.showtimes || m.time_release || m.schedule || m.time || '';
            if (scheduleInfo && scheduleInfo.trim() !== '') {
                scheduleTextEl.innerText = scheduleInfo;
                scheduleEl.style.display = 'inline-block';
            } else {
                scheduleEl.style.display = 'none';
            }
            
            const ctyText = document.getElementById('m-country-text');
            const countries = this.toList(m.country);
            if(countries.length > 0 && countries[0].name) {
                ctyText.innerText = countries.map(c => c.name).join(', ');
                ctyText.style.display = 'inline-block';
            } else { ctyText.style.display = 'none'; }

            const catText = document.getElementById('m-category-text');
            const categories = this.toList(m.category);
            if(categories.length > 0 && categories[0].name) {
                catText.innerText = categories.map(c => c.name).slice(0,2).join(', ');
                catText.style.display = 'inline-block';
            } else { catText.style.display = 'none'; }

            document.getElementById('m-summary').innerHTML = m.description || m.content || 'Nội dung đang được cập nhật...';

            document.getElementById('btn-trailer').style.display = 'none';

            this.checkMovieSaved(m.slug);
            this.loadRatings(m.slug);

            const keywordsBox = document.getElementById('m-keywords');
            let keywordHtml = '';

            if(m.name) keywordHtml += `<span class="keyword-tag" onclick="app.search('${m.name.replace(/'/g, "\\'")}')">#${m.name.replace(/\s+/g, '')}</span>`;
            if(originName) keywordHtml += `<span class="keyword-tag" onclick="app.search('${originName.replace(/'/g, "\\'")}')">#${originName.replace(/\s+/g, '')}</span>`;
            if(m.year) keywordHtml += `<span class="keyword-tag" onclick="app.search('${m.year}')">#PhimNăm${m.year}</span>`;

            if (categories.length > 0) {
                categories.forEach(c => {
                    if (c && c.name) keywordHtml += `<span class="keyword-tag" onclick="app.loadCategory('the-loai/${c.slug}', '${c.name.replace(/'/g, "\\'")}')">#${c.name.replace(/\s+/g, '')}</span>`;
                });
            }
            
            if (countries.length > 0) {
                countries.forEach(c => {
                    if (c && c.name) keywordHtml += `<span class="keyword-tag" onclick="app.loadCategory('quoc-gia/${c.slug}', '${c.name.replace(/'/g, "\\'")}')">#${c.name.replace(/\s+/g, '')}</span>`;
                });
            }
            keywordsBox.innerHTML = keywordHtml;

            const actorsBox = document.getElementById('m-actors');
            actorsBox.innerHTML = '<p style="font-size:12px; color:var(--accent); font-style:italic;"><i class="fas fa-spinner fa-spin"></i> Đang tải thông tin...</p>';

            m.origin_name = originName;
            
            let [tmdbActors, tmdbTrailer] = await Promise.all([
                this.getActorsFromTMDB(m),
                this.getTrailerFromTMDB(m)
            ]);
            
            this.currentTrailer = tmdbTrailer || m.trailer_url || '';
            document.getElementById('btn-trailer').style.display = this.currentTrailer ? 'inline-block' : 'none';

            actorsBox.innerHTML = '';
            
            if (tmdbActors && tmdbActors.length > 0) {
                const topCast = tmdbActors.slice(0, 15); 
                topCast.forEach(actor => {
                    const avatarUrl = actor.profile_path 
                        ? `https://image.tmdb.org/t/p/w200${actor.profile_path}` 
                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(actor.name)}&background=random&color=fff&size=100`;
                        
                    actorsBox.innerHTML += `
                        <div class="actor-item">
                            <div class="actor-img">
                                <img class="lazyload" data-src="${avatarUrl}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="${actor.name}">
                            </div>
                            <p class="a-name" title="${actor.name}">${actor.name}</p>
                            <p class="a-char" title="${actor.character || 'Vai diễn'}">${actor.character || 'Vai diễn'}</p>
                        </div>`;
                });
                this.observeImages();
            } else {
                let rawActors = m.actor || m.casts || m.actors; 
                let actorsList = [];
                
                if (typeof rawActors === 'string') {
                    actorsList = rawActors.split(',').map(a => a.trim()).filter(a => a && a.toLowerCase() !== 'đang cập nhật');
                } else if (Array.isArray(rawActors)) {
                    actorsList = rawActors.map(a => a.trim()).filter(a => a && a.toLowerCase() !== 'đang cập nhật');
                }
                
                if (actorsList.length > 0) {
                    actorsList.forEach(actorName => {
                        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(actorName)}&background=random&color=fff&size=100`;
                        actorsBox.innerHTML += `
                            <div class="actor-item">
                                <div class="actor-img">
                                    <img class="lazyload" data-src="${avatarUrl}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="${actorName}">
                                </div>
                                <p class="a-name" title="${actorName}">${actorName}</p>
                                <p class="a-char">Diễn viên</p>
                            </div>`;
                    });
                    this.observeImages();
                } else { 
                    actorsBox.innerHTML = '<p style="font-size:12px; color:#888; font-style:italic;">(Chưa có thông tin diễn viên)</p>'; 
                }
            }

            if (episodesData.length > 0) {
                let initialServerIdx = 0;
                
                if (savedEpLink) {
                    const foundIdx = episodesData.findIndex(srv => {
                        const eps = this.toList(srv.items || srv.server_data);
                        return eps.some(ep => (ep.embed || ep.link_embed) === savedEpLink);
                    });
                    if (foundIdx !== -1) initialServerIdx = foundIdx;
                }

                episodesData.forEach((serverObj, serverIdx) => {
                    const srvBtn = document.createElement('button');
                    srvBtn.className = 'server-btn';
                    srvBtn.innerText = serverObj.server_name || `Server ${serverIdx + 1}`;
                    
                    srvBtn.onclick = () => {
                        document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
                        srvBtn.classList.add('active');
                        
                        epBox.innerHTML = '';
                        const eps = this.toList(serverObj.items || serverObj.server_data);
                        eps.forEach((ep, idx) => {
                            const btn = document.createElement('button');
                            btn.className = 'ep-btn';
                            btn.innerText = ep.name;
                            
                            const embedLink = ep.embed || ep.link_embed || ep.embed_link || ""; 
                            
                            let m3u8Link = "";
                            for (let key in ep) {
                                if (typeof ep[key] === 'string' && ep[key].includes('.m3u8')) {
                                    m3u8Link = ep[key];
                                    break;
                                }
                            }
                            if (!m3u8Link) m3u8Link = ep.link_m3u8 || ep.m3u8_link || ep.m3u8 || ep.file_m3u8 || "";
                            
                            btn.onclick = () => {
                                app.playVideo(m3u8Link, embedLink);
                                
                                document.querySelectorAll('.ep-btn').forEach(b => b.classList.remove('active'));
                                btn.classList.add('active');
                                this.saveHistory(m, ep.name, embedLink || m3u8Link);
                                
                                this.currentEpList = eps;
                                this.currentEpIndex = idx;
                                this.updateEpNavButtons();
                            };
                            epBox.appendChild(btn);
                            
                            if(savedEpLink && (embedLink === savedEpLink || m3u8Link === savedEpLink)) {
                                btn.click();
                                savedEpLink = null; 
                            } else if (!savedEpLink && idx === 0) {
                                btn.click();
                            }
                        });
                    };
                    
                    if (serverBox) serverBox.appendChild(srvBtn);
                    
                    if (serverIdx === initialServerIdx) {
                        srvBtn.click();
                    }
                });
            } else {
                epBox.innerHTML = '<p style="color:#888;font-size:14px; width: 100%;">Phim đang được cập nhật, chưa có tập nào.</p>';
            }

            this.loadComments(slug, 'movie');

            const simGrid = document.getElementById('similar-grid');
            let simItems = [];

            try {
                if (categories.length > 0 && categories[0]) {
                    let catSlug = categories[0].slug || categories[0].name;
                    let simRes = await fetch(`${API_URL}/films/the-loai/${catSlug}?page=1`);
                    if (simRes.ok) {
                        let simData = await simRes.json();
                        simItems = this.extractItems(simData).filter(i => i.slug !== m.slug);
                    }
                }
            } catch (e) {
                console.log("Không tải được thể loại, chuyển qua backup...");
            }

            if (simItems.length === 0) {
                try {
                    let backupRes = await fetch(`${API_URL}/films/phim-moi-cap-nhat?page=1`);
                    if (backupRes.ok) {
                        let backupData = await backupRes.json();
                        simItems = this.extractItems(backupData).filter(i => i.slug !== m.slug);
                    }
                } catch (e) {
                    console.log("Lỗi tải phim backup...");
                }
            }

            simGrid.innerHTML = ''; 
            
            if (simItems.length > 0) {
                simItems = simItems.sort(() => 0.5 - Math.random()).slice(0, 10);
                simItems.forEach(sm => simGrid.appendChild(this.createMovieCard(sm, true)));
                this.observeImages();
                this.enableDragScroll();
            } else {
                simGrid.innerHTML = '<p style="color:#888; font-size:14px; padding: 20px; text-align:center; width:100%;">Tạm thời chưa có phim gợi ý.</p>';
            }

        } catch (e) {
            console.log("Lỗi tải chi tiết phim:", e);
            this.showHome();
        }
    },

    showReview() {
        if (this.isCinemaMode) this.toggleCinemaMode();
        
        if (this.currentMovieSlug && db) {
            db.ref('comments/' + this.currentMovieSlug).off();
            db.ref('ratings/' + this.currentMovieSlug).off();
        }

        this.currentMovieSlug = 'goc-review';
        this.currentMovieName = 'Cộng Đồng';
        window.scrollTo(0, 0);
        document.getElementById('home-view').style.display = 'none';
        document.getElementById('detail-view').style.display = 'none';
        document.getElementById('review-view').style.display = 'block';
        
        document.getElementById('video-iframe').src = '';
        const customPlayer = document.getElementById('custom-player');
        const videoPlayer = document.getElementById('video-player');
        if(videoPlayer) {
            videoPlayer.pause();
            videoPlayer.src = '';
        }
        if(customPlayer) customPlayer.style.display = 'none';
        if (this.hlsInstance) this.hlsInstance.destroy();
        
        document.title = `Cộng Đồng - Đơn Giản Là Web Xem Phim`; 
        
        const menuWrap = document.getElementById('navMenu');
        if (menuWrap) menuWrap.classList.remove('active');

        this.loadComments('goc-review', 'review');
    },

    saveHistory(movie, epName, epLink) {
        const email = localStorage.getItem('haruno_email');
        if(!email) return; 

        let history = JSON.parse(localStorage.getItem('haruno_history') || '[]');
        
        // Lọc rác trước khi lưu
        if (!Array.isArray(history)) history = Object.values(history);
        history = history.filter(h => h && h.slug);

        history = history.filter(h => h.slug !== movie.slug);
        history.unshift({ slug: movie.slug, name: movie.name, thumb: this.getImage(movie), epName: epName, epLink: epLink });
        if(history.length > 8) history.pop();
        
        localStorage.setItem('haruno_history', JSON.stringify(history));
        this.syncDataToCloud('history', history);
    },

    renderHistory() {
        const email = localStorage.getItem('haruno_email');
        let history = JSON.parse(localStorage.getItem('haruno_history') || '[]');
        
        // LỚP GIÁP BẢO VỆ GIAO DIỆN
        if (!Array.isArray(history)) history = Object.values(history);
        history = history.filter(h => h && h.slug);

        const section = document.getElementById('history-section');
        const grid = document.getElementById('history-grid');
        if(!section || !grid) return;

        if(!email) { section.style.display = 'none'; return; } 

        if(!history.length) { section.style.display = 'none'; return; }
        section.style.display = 'block';
        grid.innerHTML = history.map(h => `
            <div class="movie-card" style="flex: 0 0 130px; scroll-snap-align: start;" onclick="if(!app.isDragging) { app.closeEditProfile(); app.showMovie('${h.slug}', '${h.epLink}'); }" style="border: 1px solid var(--accent);">
                <div class="thumb">
                    <img class="lazyload" data-src="${h.thumb}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
                    <div class="badge" style="background:var(--accent); font-size: 9px;">Tập ${h.epName}</div>
                </div>
                <div class="meta" style="padding: 10px 8px;">
                    <h4 style="font-size: 12px;">${h.name}</h4>
                </div>
            </div>
        `).join('');
        this.observeImages();
        this.enableDragScroll();
    },

    openTrailer() {
        if(!this.currentTrailer) return;
        let embedUrl = this.currentTrailer.includes('watch?v=') ? this.currentTrailer.replace('watch?v=', 'embed/') : this.currentTrailer;
        document.getElementById('trailer-iframe').src = embedUrl;
        document.getElementById('trailer-modal').style.display = 'flex';
    },
    
    closeTrailer() {
        document.getElementById('trailer-iframe').src = "";
        document.getElementById('trailer-modal').style.display = 'none';
    },

    openVoiceRoom() {
        if (!this.currentMovieSlug) return;
        const roomName = "Haruno_Phim_" + this.currentMovieSlug.replace(/-/g, "");
        const jitsiUrl = `https://meet.jit.si/${roomName}#config.prejoinPageEnabled=false&config.startWithVideoMuted=true`;
        document.getElementById('voice-iframe').src = jitsiUrl;
        document.getElementById('voice-modal').style.display = 'flex';
    },
    
    closeVoiceRoom() {
        document.getElementById('voice-iframe').src = "";
        document.getElementById('voice-modal').style.display = 'none';
    },

    search(customKeyword) {
        let val = '';
        if (typeof customKeyword === 'string' && customKeyword.trim() !== '') {
            val = customKeyword.trim();
        } else {
            val = document.getElementById('searchInput').value.trim();
        }

        if(val) {
            this.isSearch = true; this.currentType = val; this.currentPage = 1;
            document.getElementById('page-title').innerText = `Kết quả: ${val}`;
            this.showHome(true);
            this.renderMovies();
            
            const searchWrap = document.getElementById('searchWrapper');
            const searchDrop = document.getElementById('search-results-dropdown');
            const searchInp = document.getElementById('searchInput');
            
            if(searchWrap) searchWrap.classList.remove('active');
            if(searchDrop) {
                searchDrop.style.display = 'none';
                searchDrop.innerHTML = '';
            }
            if(searchInp) {
                searchInp.value = '';
                searchInp.blur(); 
            }

            setTimeout(() => {
                const gridHeader = document.getElementById('page-title');
                if (gridHeader) {
                    const y = gridHeader.getBoundingClientRect().top + window.scrollY - 100;
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            }, 300); 
        }
    },

    startVoiceSearch() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            app.showToast("Trình duyệt không hỗ trợ tìm kiếm bằng giọng nói!", "error");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        const btn = document.getElementById('voice-search-btn');
        const searchInp = document.getElementById('searchInput');

        recognition.onstart = () => {
            if(btn) btn.classList.add('voice-listening');
            if(searchInp) searchInp.placeholder = "Đang nghe...";
            const searchWrap = document.getElementById('searchWrapper');
            if(searchWrap) searchWrap.classList.add('active');
        };

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            if(searchInp) searchInp.value = speechResult;
            app.search(speechResult); 
        };

        recognition.onerror = (event) => {
            console.error("Lỗi Voice Search:", event.error);
            if(searchInp) searchInp.placeholder = "Tìm kiếm ở đây nè ...";
        };

        recognition.onend = () => {
            if(btn) btn.classList.remove('voice-listening');
            if(searchInp) searchInp.placeholder = "Tìm kiếm ở đây nè ...";
        };

        try {
            recognition.start();
        } catch(e) { console.error(e); }
    },

    loadCategory(slug, title) {
        this.isSearch = false; this.currentType = slug; this.currentPage = 1;
        document.getElementById('page-title').innerText = title;
        this.showHome(true);
        
        // Đợi DOM cập nhật một chút rồi cuộn mượt mà xuống phần lưới phim
        setTimeout(() => {
            const gridHeader = document.getElementById('page-title');
            if (gridHeader) {
                // Trừ hao 100px để không bị thanh menu che mất tiêu đề
                const y = gridHeader.getBoundingClientRect().top + window.scrollY - 100;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        }, 100);

        const menuWrap = document.getElementById('navMenu');
        if (menuWrap) menuWrap.classList.remove('active');
        this.renderMovies();
    },

    showHome(isHome = true) {
        if (this.isCinemaMode) this.toggleCinemaMode();
        
        document.getElementById('review-view').style.display = 'none';
        document.getElementById('home-view').style.display = isHome ? 'block' : 'none';
        document.getElementById('detail-view').style.display = isHome ? 'none' : 'block';
        if(isHome) { 
            document.getElementById('video-iframe').src = ''; 
            const videoPlayer = document.getElementById('video-player');
            const customPlayer = document.getElementById('custom-player');
            if(videoPlayer) {
                videoPlayer.pause();
                videoPlayer.src = '';
            }
            if(customPlayer) customPlayer.style.display = 'none';
            if (this.hlsInstance) this.hlsInstance.destroy();

            document.title = `Đơn Giản Là Web Xem Phim`; 
            this.renderHistory(); 
            this.renderWatchlist(); 
        }
    },

    heroData: [], currentHeroIndex: 0, heroInterval: null,
    
    async initHero() {
        try {
            const res = await fetch(`${API_URL}/films/phim-moi-cap-nhat?page=1&_v=${new Date().getTime()}`);
            const data = await res.json();
            const top5 = this.extractItems(data).slice(0, 5); 
            
            if(top5.length > 0) {
                this.heroData = top5.map(m => ({...m, description: 'Siêu phẩm điện ảnh đang chờ bạn khám phá. Bấm xem ngay để không bỏ lỡ!'}));
                this.renderCurrentHero();
                this.startHeroAutoPlay();

                const detailPromises = top5.map(m => 
                    fetch(`${API_URL}/film/${m.slug}`)
                        .then(r => r.json())
                        .then(d => d.movie || d.item || m) 
                        .catch(e => m) 
                );
                
                Promise.allSettled(detailPromises).then(results => {
                    this.heroData = results.map(r => r.value).filter(m => m && m.name);
                    if(this.currentHeroIndex === 0) this.renderCurrentHero(); 
                });
            } else {
                document.getElementById('hero-title').innerText = "Tạm thời không có phim nổi bật";
                document.getElementById('hero-status').innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi tải`;
            }
        } catch (e) { 
            console.log("Lỗi Hero Banner:", e);
        }
    },
    getHeroPoster(movie) {
        let path = movie.thumb_url || movie.poster_url;
        if (!path) return 'https://via.placeholder.com/1200x600?text=No+Image';
        return path.startsWith('http') ? path : IMG_DOMAIN + path;
    },
    renderCurrentHero() {
        const m = this.heroData[this.currentHeroIndex];
        if (!m) return;
        
        const finalPoster = this.getHeroPoster(m);
        
        const bgImg = document.getElementById('hero-bg-img');
        if(bgImg) bgImg.style.backgroundImage = `url('${finalPoster}')`;
        
        const fgImg = document.getElementById('hero-fg-img');
        if (fgImg) fgImg.src = finalPoster;

        document.getElementById('hero-title').innerText = m.name || 'Đang cập nhật...';
        
        const rawContent = m.description || m.content || 'Siêu phẩm điện ảnh đang chờ bạn khám phá. Bấm xem ngay để không bỏ lỡ!';
        document.getElementById('hero-desc').innerHTML = rawContent.replace(/<[^>]*>?/gm, '');
        
        document.getElementById('hero-status').innerHTML = `<i class="fas fa-fire"></i> ${m.current_episode || m.episode_current || 'Đang cập nhật'}`;
        document.getElementById('hero-year').innerText = m.year || '2026';
        document.getElementById('hero-quality').innerText = m.quality || 'HD';
        document.getElementById('hero-lang').innerText = m.language || m.lang || 'Vietsub';
        
        const playBtn = document.getElementById('hero-play-btn');
        const detailBtn = document.getElementById('hero-detail-btn');
        
        if (playBtn) playBtn.onclick = () => this.showMovie(m.slug);
        if (detailBtn) detailBtn.onclick = () => this.showMovie(m.slug);

        const heroBox = document.querySelector('.hero-box');
        if (heroBox) { heroBox.style.animation = 'none'; heroBox.offsetHeight; heroBox.style.animation = null; }
        const heroPosterBox = document.querySelector('.hero-poster-box');
        if (heroPosterBox) { heroPosterBox.style.animation = 'none'; heroPosterBox.offsetHeight; heroPosterBox.style.animation = null; }
    },
    nextHero() { this.currentHeroIndex = (this.currentHeroIndex + 1) % this.heroData.length; this.renderCurrentHero(); this.resetHeroTimer(); },
    prevHero() { this.currentHeroIndex = (this.currentHeroIndex - 1 + this.heroData.length) % this.heroData.length; this.renderCurrentHero(); this.resetHeroTimer(); },
    startHeroAutoPlay() { this.heroInterval = setInterval(() => { this.nextHero(); }, 5000); },
    resetHeroTimer() { clearInterval(this.heroInterval); this.startHeroAutoPlay(); },

    async initTopMovies() {
        try {
            const data1 = await this.fetchWithCache(`${API_URL}/films/phim-moi-cap-nhat?page=1`, 300);
            let items = this.extractItems(data1);
            
            items = items.filter(m => m.quality !== 'Trailer' && m.quality !== 'Cam');
            
            if(items.length < 10) {
                fetch(`${API_URL}/films/phim-moi-cap-nhat?page=2&_v=${new Date().getTime()}`).then(res2 => res2.json()).then(data2 => {
                    items = [...items, ...this.extractItems(data2)].filter(m => m.quality !== 'Trailer' && m.quality !== 'Cam');
                    this.renderTopList(items);
                });
            } else {
                this.renderTopList(items);
            }
        } catch (e) { console.log(e); }
    },

    renderTopList(items) {
        items = items.sort(() => Math.random() - 0.5).slice(0, 10);
        const topList = document.getElementById('top-movies-list');
        if (topList) {
            topList.innerHTML = items.map((m, index) => {
                const quality = m.quality || 'HD';
                const lang = m.language || m.lang || 'Vietsub';
                const episode = m.current_episode || m.episode_current || 'Tập 1';
                const year = m.year || '2026';
                const originName = m.original_name || m.origin_name || '';
                
                return `
                    <div class="top-movie-card" onclick="if(!app.isDragging) app.showMovie('${m.slug}')">
                        <div class="top-movie-poster">
                            <img class="lazyload" data-src="${this.getImage(m)}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="${m.name}">
                            <div class="top-movie-badges">
                                <span class="badge-quality">${quality}</span>
                                <span class="badge-lang">${lang}</span>
                            </div>
                            <div class="play-btn"><i class="fas fa-play"></i></div>
                        </div>
                        <div class="top-movie-info-wrap">
                            <div class="top-movie-rank">${index + 1}</div>
                            <div class="top-movie-details">
                                <h4 style="margin-bottom: 2px;">${m.name}</h4>
                                <p class="origin-name" style="font-size: 11px; margin-bottom: 5px;" title="${originName}">${originName}</p>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            this.observeImages();
            this.enableDragScroll(); 
        }
    },
	
	// ==========================================
    // TÍNH NĂNG LƯU & TẢI PLAYLIST (GỌI THẲNG LÕI FIREBASE)
    // ==========================================

    savePlaylistToFirebase() {
        const email = localStorage.getItem('haruno_email');
        
        if (!email) {
            if (this.showToast) this.showToast("Cần đăng nhập để lưu!", "warning");
            else alert("Cần đăng nhập để lưu!");
            return;
        }
        
        const safeKey = this.getSafeKey(email);
        if (!this.musicData) this.musicData = { playlist: [] };
        
        const titleEl = document.getElementById('music-title');
        const channelEl = document.getElementById('music-channel');
        const thumbEl = document.getElementById('music-thumbnail');
        
        const dataToSave = {
            currentTrack: this.musicData.currentVideoId ? {
                id: this.musicData.currentVideoId,
                title: titleEl ? titleEl.innerText : "Chưa Rõ",
                author: channelEl ? channelEl.innerText : "Chưa Rõ",
                thumb: thumbEl ? thumbEl.src : ""
            } : null,
            queue: this.musicData.playlist || []
        };

        try {
            if (this.showToast) this.showToast("Đang đồng bộ lên mây...", "info");
            
            // SỬ DỤNG LÕI FIREBASE TRỰC TIẾP CHỐNG LỖI "DB IS NULL"
            firebase.database().ref(`users/${safeKey}/savedPlaylist`).set(dataToSave)
                .then(() => {
                    if (this.showToast) this.showToast("Đã lưu playlist thành công!", "success");
                })
                .catch(e => console.log("Lỗi Firebase:", e));
        } catch (error) {
            console.error("Chưa kết nối máy chủ Firebase:", error);
            if (this.showToast) this.showToast("Lỗi kết nối máy chủ!", "error");
        }
    },

    loadSavedPlaylist() {
        const email = localStorage.getItem('haruno_email');
        if (!email) return;
        
        const safeKey = this.getSafeKey(email);
        
        try {
            // SỬ DỤNG LÕI FIREBASE TRỰC TIẾP
            firebase.database().ref(`users/${safeKey}/savedPlaylist`).once('value').then(snap => {
                const saved = snap.val();
                if (!saved) return;

                if (!this.musicData) this.musicData = { playlist: [] };

                // Phục hồi bài hát đang nghe dở
                if (saved.currentTrack && saved.currentTrack.id) {
                    this.musicData.currentVideoId = saved.currentTrack.id;
                    
                    const addArea = document.getElementById('music-add-area');
                    const playArea = document.getElementById('music-playing-area');
                    if (addArea) addArea.style.display = 'none';
                    if (playArea) playArea.style.display = 'block';
                    
                    const titleEl = document.getElementById('music-title');
                    const channelEl = document.getElementById('music-channel');
                    const thumbEl = document.getElementById('music-thumbnail');
                    
                    if (titleEl) titleEl.innerText = saved.currentTrack.title;
                    if (channelEl) channelEl.innerText = saved.currentTrack.author;
                    if (thumbEl) thumbEl.src = saved.currentTrack.thumb;
                    
                    let playerObj = this.musicData.player || this.ytPlayer;
                    if (playerObj && typeof playerObj.cueVideoById === 'function') {
                        playerObj.cueVideoById(saved.currentTrack.id);
                    }
                }

                // Phục hồi hàng chờ playlist
                if (saved.queue && saved.queue.length > 0) {
                    this.musicData.playlist = saved.queue;
                    if (typeof this.renderPlaylist === 'function') {
                        this.renderPlaylist();
                    }
                }
            });
        } catch(error) {
            console.log("Hệ thống chưa tải xong dữ liệu:", error);
        }
    },

    clearPlaylist() {
        if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ hàng chờ?")) return;
        
        if (!this.musicData) this.musicData = { playlist: [] };
        this.musicData.playlist = []; 
        this.currentTrackIndex = 0;
        
        // Vẽ lại danh sách
        if (typeof this.renderPlaylist === 'function') {
            this.renderPlaylist(); 
        } else {
            const listItems = document.getElementById('playlist-items');
            const listCount = document.getElementById('playlist-count');
            if (listItems) listItems.innerHTML = '<div class="empty-state">Hàng chờ đang trống</div>';
            if (listCount) listCount.innerText = "0";
        }
        
        // Tắt nhạc
        let playerObj = this.musicData.player || this.ytPlayer;
        if (playerObj && typeof playerObj.stopVideo === 'function') {
            playerObj.stopVideo();
        }
        this.isPlayingMusic = false;
        
        // Reset giao diện
        const titleEl = document.getElementById('music-title');
        const channelEl = document.getElementById('music-channel');
        const thumbEl = document.getElementById('music-thumbnail');
        if (titleEl) titleEl.innerText = "Chưa Có Bài Hát Nào";
        if (channelEl) channelEl.innerText = "Hãy Thêm Nhạc Vào Danh Sách";
        if (thumbEl) thumbEl.src = "https://i.ibb.co/spBmZxnJ/Gemini-Generated-Image-4lhxf64lhxf64lhx.png";
        
        const playBtn = document.getElementById('music-play-pause-btn');
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
        
        const visualizer = document.getElementById('music-visualizer');
        if (visualizer) visualizer.classList.add('paused');
        
        if (this.showToast) this.showToast("Đã xóa sạch hàng chờ!", "success");
        else alert("Đã xóa sạch hàng chờ!");
    },
	
	// ==========================================
    // MUA GÓI PREMIUM VĨNH VIỄN
    // ==========================================
    buyLifetimePremium() {
        const email = localStorage.getItem('haruno_email');
        if (!email) {
            this.showToast("Cần đăng nhập để mua sắm!", "error");
            return;
        }

        const price = 2000; // Giá bán (50.000 HCoins)
        if (!confirm(`Xác nhận mua gói Premium Vĩnh Viễn với giá ${price.toLocaleString()} HCoins?`)) return;

        const safeUser = this.getSafeKey(email);
        this.showToast("Đang giao dịch...", "info");

        // Trừ tiền qua Worker bảo mật
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: price })
        }).then(res => res.json()).then(data => {
            if (!data.success) { 
                this.showToast("Tài khoản của bạn không đủ HCoins!", "error"); return; 
            }
            
            // Kích hoạt VIP: Cộng thời hạn thêm 100 năm
            const lifetimeMs = Date.now() + (100 * 365 * 24 * 60 * 60 * 1000); 
            db.ref(`users/${safeUser}`).update({
                isPremium: true,
                premiumExpire: lifetimeMs
            }).then(() => {
                this.showToast("🎉 Thanh toán thành công! Đã kích hoạt PREMIUM VĨNH VIỄN!", "success");
                setTimeout(() => window.location.reload(), 2000); // Reload để áp dụng Theme VIP
            });
        }).catch(err => {
            this.showToast("Có lỗi xảy ra khi giao dịch!", "error");
        });
    },
	
	// ==========================================
    // HỆ THỐNG ÂM THANH (SFX MANAGER)
    // ==========================================
    sounds: {
        click: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),
        coin: new Audio('https://assets.mixkit.co/active_storage/sfx/1993/1993-preview.mp3'),
        win: new Audio('https://assets.mixkit.co/active_storage/sfx/2016/2016-preview.mp3'),
        fail: new Audio('https://assets.mixkit.co/active_storage/sfx/2030/2030-preview.mp3'),
        shuffle: new Audio('https://assets.mixkit.co/active_storage/sfx/1103/1103-preview.mp3'),
        scratch: new Audio(''),
        lightning: new Audio('https://assets.mixkit.co/active_storage/sfx/2039/2039-preview.mp3')
    },

    playSound(name) {
        try {
            const s = this.sounds[name];
            if (s) {
                s.currentTime = 0; // Chơi lại từ đầu nếu đang chơi dở
                s.play().catch(e => console.log("Chờ tương tác..."));
            }
        } catch(e) {}
    },

    // ==========================================
    // MINIGAME NHANH TAY LẸ MẮT (SHELL GAME)
    // ==========================================
    shellData: {
        winningCup: -1,
        state: 'idle', // idle, shuffling, waiting
        bet: 0,
        positions: [0, 1, 2],
        timer: null // Thêm biến lưu đếm ngược thời gian
    },

    openShellGame() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return this.showToast("Đăng nhập để đọ mắt với pháp sư!", "error"); }
        document.getElementById('shell-game-modal').style.display = 'flex';
        this.resetShellGame();
    },

    closeShellGame() {
        if (this.shellData.state === 'shuffling') return this.showToast("Đang đảo nón không được trốn!", "warning");
        document.getElementById('shell-game-modal').style.display = 'none';
        clearTimeout(this.shellData.timer); // Dọn dẹp timer khi đóng
    },

    resetShellGame() {
        clearTimeout(this.shellData.timer); // Đảm bảo timer được xóa khi reset
        this.shellData.state = 'idle';
        this.shellData.winningCup = -1;
        document.getElementById('shell-msg').innerText = '"Đặt cược đi! Xem mắt ngươi có nhanh bằng tay ta không (≖＿≖ )"';
        document.getElementById('shell-msg').style.color = '#ccc';
        
        // FIX LỖI THU NHỎ KÍCH THƯỚC: Trả lại trạng thái gốc cho nút bấm
        const btnStart = document.getElementById('btn-start-shell');
        btnStart.disabled = false;
        btnStart.style.opacity = '1';
        btnStart.style.cursor = 'pointer';
        btnStart.innerHTML = 'CHƠI NGAY';

        // Đặt lại 3 nón về vị trí cũ (Cự ly 140px)
        for(let i = 0; i < 3; i++) {
            let cup = document.getElementById(`shell-cup-${i}`);
            cup.classList.remove('lifted');
            cup.style.left = (i * 140) + 'px'; 
            this.shellData.positions[i] = i;
            
            // Đảm bảo Kim Cương bị TẮT
            document.getElementById(`shell-item-${i}`).classList.remove('active');
        }
    },

    startShellGame() {
        const betInput = document.getElementById('shell-bet-amount').value;
        const betAmount = parseInt(betInput);
        if (isNaN(betAmount) || betAmount <= 0) return this.showToast("Cược không hợp lệ!", "error");

        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);

        this.shellData.state = 'shuffling';
        document.getElementById('shell-msg').innerText = '"Đang thu tiền cược..."';

        // FIX LỖI THU NHỎ: Thay vì ẩn nút, ta Khóa nút và làm mờ đi
        const btnStart = document.getElementById('btn-start-shell');
        btnStart.disabled = true;
        btnStart.style.opacity = '0.5';
        btnStart.style.cursor = 'not-allowed';
        btnStart.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG MÚA NÓN...';

        // Thu tiền cược
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: betAmount })
        }).then(res => res.json()).then(data => {
            if (!data.success) {
                this.showToast("Không đủ HCoins!", "error");
                this.resetShellGame();
                return;
            }
            
            // [ÂM THANH] Trừ tiền thành công
            this.playSound('coin');

            this.shellData.bet = betAmount;
            this.shellData.winningCup = Math.floor(Math.random() * 3);

            // 1. Nhấc nón và Bật sáng viên Kim cương
            document.getElementById(`shell-item-${this.shellData.winningCup}`).classList.add('active');
            document.getElementById(`shell-cup-${this.shellData.winningCup}`).classList.add('lifted');
            document.getElementById('shell-msg').innerText = '"Hãy nhìn kĩ viên Kim Cương này..."';

            setTimeout(() => {
                // 2. Úp nón xuống và TẮT ánh sáng Kim cương để giấu
                document.getElementById(`shell-cup-${this.shellData.winningCup}`).classList.remove('lifted');
                document.getElementById(`shell-item-${this.shellData.winningCup}`).classList.remove('active');
                document.getElementById('shell-msg').innerText = '"Nhìn kĩ xem ta đảo nhé!!!"';

                setTimeout(() => {
                    // 3. Tiến hành đảo
                    this.shuffleShells(15); 
                }, 500);
            }, 1500);
        });
    },

    shuffleShells(timesLeft) {
        if (timesLeft <= 0) {
            this.shellData.state = 'waiting'; 
            document.getElementById('shell-msg').innerText = '"Xong! Chọn lẹ đi! Quá 3 giây là bị xử thua nhé!"';
            document.getElementById('shell-msg').style.color = '#00ffcc';
            
            // BẮT ĐẦU ĐẾM NGƯỢC 3 GIÂY
            this.shellData.timer = setTimeout(() => {
                this.handleTimeoutLoss(); // Gọi hàm xử thua nếu hết giờ
            }, 3000);
            
            return;
        }

        // [ÂM THANH] Tiếng tráo nón
        this.playSound('shuffle');

        let idx1 = Math.floor(Math.random() * 3);
        let idx2 = Math.floor(Math.random() * 3);
        while(idx1 === idx2) { idx2 = Math.floor(Math.random() * 3); }

        let tempPos = this.shellData.positions[idx1];
        this.shellData.positions[idx1] = this.shellData.positions[idx2];
        this.shellData.positions[idx2] = tempPos;

        document.getElementById(`shell-cup-${idx1}`).style.left = (this.shellData.positions[idx1] * 140) + 'px';
        document.getElementById(`shell-cup-${idx2}`).style.left = (this.shellData.positions[idx2] * 140) + 'px';

        setTimeout(() => {
            this.shuffleShells(timesLeft - 1);
        }, 280); 
    },

    // Hàm mới: Xử lý khi người chơi không chọn kịp trong 3 giây
    handleTimeoutLoss() {
        if (this.shellData.state !== 'waiting') return; 
        this.shellData.state = 'idle'; // Khóa luôn, không cho bấm nữa

        // [ÂM THANH] Thua
        this.playSound('fail');

        document.getElementById('shell-msg').innerText = `💀 Quá chậm chạp! Ngươi đã bị tước quyền chọn!`;
        document.getElementById('shell-msg').style.color = '#ff4d4d';
        
        // Mở nón có kim cương ra cho biết
        document.getElementById(`shell-cup-${this.shellData.winningCup}`).classList.add('lifted');
        document.getElementById(`shell-item-${this.shellData.winningCup}`).classList.add('active');
        
        this.showToast("Hết giờ! Bạn đã bị xử thua do quá chậm!", "error");

        setTimeout(() => {
            this.resetShellGame();
        }, 3500);
    },

    pickShellCup(cupIndex) {
        if (this.shellData.state !== 'waiting') return; 
        
        // HỦY BỎ ĐẾM NGƯỢC VÌ NGƯỜI CHƠI ĐÃ CHỌN KỊP THỜI GIAN
        clearTimeout(this.shellData.timer);
        
        this.shellData.state = 'idle'; // Khóa để không bấm 2 lần được

        // Lật nón khách chọn lên
        document.getElementById(`shell-cup-${cupIndex}`).classList.add('lifted');

        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);

        if (cupIndex === this.shellData.winningCup) {
            // [ÂM THANH] Thắng
            this.playSound('win');

            // NẾU THẮNG: Bật sáng viên Kim cương
            document.getElementById(`shell-item-${cupIndex}`).classList.add('active');

            const reward = this.shellData.bet * 2;
            document.getElementById('shell-msg').innerText = `🎉 MẮT THẦN! Lão chịu thua! Bạn nhận ${reward.toLocaleString()} HCoins!`;
            document.getElementById('shell-msg').style.color = '#ffd700';
            this.showToast("Bắt bài thành công!", "success");

            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: reward })
            });
        } else {
            // [ÂM THANH] Thua
            this.playSound('fail');

            // NẾU THUA: Thông báo lỗi
            document.getElementById('shell-msg').innerText = `💀 Rất tiếc! Ngươi đã bị lừa muahaha!`;
            document.getElementById('shell-msg').style.color = '#ff4d4d';
            
            // Cay cú: Lật nón thật lên và bật Kim Cương ở nón thật lên cho biết tay
            document.getElementById(`shell-cup-${this.shellData.winningCup}`).classList.add('lifted');
            document.getElementById(`shell-item-${this.shellData.winningCup}`).classList.add('active');
            
            this.showToast("Thua rồi nha!", "error");
        }

        // Tự động khởi tạo lại bàn sau 3.5s
        setTimeout(() => {
            this.resetShellGame();
        }, 3500);
    },
    
    // ==========================================
    // MINIGAME VÉ SỐ CÀO (SCRATCH CARD - BẢN ULTRA VIP)
    // ==========================================
    scratchData: {
        isScratching: false,
        isRevealed: false,
        prize: 0,
        ctx: null,
        canvas: null
    },

    openScratchGame() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return this.showToast("Cần đăng nhập để mua vé số!", "error"); }
        document.getElementById('scratch-game-modal').style.display = 'flex';
        
        // HIỆN SẴN TỜ VÉ SỐ NGAY TỪ ĐẦU (Thay vì ẩn đi)
        document.getElementById('scratch-container').style.display = 'flex'; 
        
        const buyBtn = document.getElementById('btn-buy-scratch');
        buyBtn.style.display = 'block';
        buyBtn.innerHTML = '<i class="fas fa-ticket-alt"></i> MUA VÉ';
        buyBtn.disabled = false;

        document.getElementById('scratch-msg').innerText = 'Trải Nghiệm Cào Vé Số Chân Thực Nhất (•̀ᴗ•́)و ̑̑ ';
        document.getElementById('scratch-msg').style.color = '#ccc';

        // Phủ lớp bạc lên sẵn nhưng KHÓA không cho người chơi cào chùa
        // Xóa text thưởng cũ
        document.getElementById('scratch-prize-text').innerHTML = "???"; 
        document.getElementById('ticket-serial-num').innerText = "********";
        this.scratchData.isRevealed = true; // Khóa tính năng cào
        this.initScratchCanvas(); // Gọi hàm vẽ lớp bạc
    },

    closeScratchGame() {
        document.getElementById('scratch-game-modal').style.display = 'none';
        // Tắt tiếng cào nếu đang bật
        this.sounds.scratch.pause();
    },

    buyScratchTicket() {
        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);
        const ticketPrice = 100; 

        // [ÂM THANH] Click mua
        this.playSound('click');

        const buyBtn = document.getElementById('btn-buy-scratch');
        buyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG MUA VÉ...';
        buyBtn.disabled = true;

        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: ticketPrice })
        }).then(res => res.json()).then(data => {
            if (!data.success) {
                this.showToast("Bạn không đủ HCoins để mua vé!", "error");
                buyBtn.innerHTML = '<i class="fas fa-ticket-alt"></i> MUA VÉ';
                buyBtn.disabled = false;
                return;
            }

            // [ÂM THANH] Trừ tiền mua vé
            this.playSound('coin');

            // Đã mua thành công -> Ẩn nút mua đi
            buyBtn.style.display = 'none';
            document.getElementById('scratch-msg').innerText = 'Mua Vé Thành Công! Hãy Cào Lớp Bạc Bên Dưới Nhé |˶˙ᵕ˙ )ﾉﾞ ';
            document.getElementById('scratch-msg').style.color = '#00ffcc';

            // Random Seri mới
            const randomSerial = Math.floor(10000000 + Math.random() * 90000000);
            document.getElementById('ticket-serial-num').innerText = randomSerial;

            // Random Giải thưởng
            const rand = Math.random() * 100;
            let prizeAmount = 0; let prizeText = ""; let textColor = "";

            if (rand < 50) { 
                prizeAmount = 0; prizeText = "CHÚC BẠN<br>MAY MẮN LẦN SAU"; textColor = "#555";
            } else if (rand < 75) { 
                prizeAmount = 50; prizeText = "TRÚNG THƯỞNG<br>50 HCoins"; textColor = "#28a745";
            } else if (rand < 90) { 
                prizeAmount = 100; prizeText = "TRÚNG THƯỞNG<br>100 HCoins"; textColor = "#17a2b8";
            } else if (rand < 98) { 
                prizeAmount = 500; prizeText = "TRÚNG LỚN!<br>500 HCoins"; textColor = "#fd7e14";
            } else { 
                prizeAmount = 10000; prizeText = "💎 ĐỘC ĐẮC 💎<br>10,000 HCOINS"; textColor = "#dc3545";
            }

            this.scratchData.prize = prizeAmount;
            
            // MỞ KHÓA CHO PHÉP CÀO
            this.scratchData.isRevealed = false; 

            const textEl = document.getElementById('scratch-prize-text');
            textEl.innerHTML = prizeText;
            textEl.style.color = textColor; 

            // Vẽ lại lớp bạc mới tinh
            this.initScratchCanvas();
        }).catch(err => {
            this.showToast("Lỗi kết nối khi mua vé!", "error");
            buyBtn.innerHTML = '<i class="fas fa-ticket-alt"></i> MUA VÉ';
            buyBtn.disabled = false;
        });
    },

    initScratchCanvas() {
        const canvas = document.getElementById('scratch-canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        this.scratchData.ctx = ctx;
        this.scratchData.canvas = canvas;

        ctx.globalCompositeOperation = 'source-over';
        
        // VẼ LỚP TRÁNG BẠC KIM LOẠI (Bóng bẩy có dải sáng cắt ngang)
        const silverGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        silverGrad.addColorStop(0, '#c0c0c0');
        silverGrad.addColorStop(0.3, '#f5f5f5'); // Vệt sáng kim loại 1
        silverGrad.addColorStop(0.5, '#a0a0a0');
        silverGrad.addColorStop(0.7, '#e8e8e8'); // Vệt sáng kim loại 2
        silverGrad.addColorStop(1, '#808080');
        ctx.fillStyle = silverGrad; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Vân hạt nhám bảo mật của lớp phủ
        for(let i=0; i<3000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.3)';
            ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 2, 2);
        }
        
        // In chìm chữ bảo mật (Watermark) - Nằm chéo chuẩn vé số
        ctx.save(); // Khóa trạng thái canvas để xoay không ảnh hưởng tới nét cào sau này
        
        ctx.font = "bold 18px 'Plus Jakarta Sans', sans-serif";
        ctx.fillStyle = "rgba(50,50,50,0.4)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Dời tâm vẽ ra giữa vé và xoay nghiêng (Góc -20 độ)
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-20 * Math.PI / 180); 

        // Lặp lồng nhau 2 chiều (ngang và dọc) để phủ kín chữ chéo lên toàn bộ mảng bạc
        for(let x = -canvas.width; x <= canvas.width; x += 225) {
            for(let y = -canvas.height * 2; y <= canvas.height * 2; y += 55) {
                ctx.fillText("CÀO EM ĐI ANH (◕‿◕)", x, y);
            }
        }
        
        ctx.restore(); // Mở khóa trạng thái, trả canvas về bình thường

        // THIẾT LẬP CHỔI CÀO
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = 40; 

        const getMousePos = (evt) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = (evt.touches ? evt.touches[0].clientX : evt.clientX);
            const clientY = (evt.touches ? evt.touches[0].clientY : evt.clientY);
            return { x: clientX - rect.left, y: clientY - rect.top };
        };

        const startScratch = (e) => {
            if (this.scratchData.isRevealed) return;
            this.scratchData.isScratching = true;

            // [ÂM THANH] Bật tiếng cào lặp lại
            if(this.sounds && this.sounds.scratch) {
                this.sounds.scratch.loop = true;
                this.playSound('scratch');
            }

            const pos = getMousePos(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        };

        const scratchMove = (e) => {
            if (!this.scratchData.isScratching || this.scratchData.isRevealed) return;
            e.preventDefault(); 
            const pos = getMousePos(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        };

        const stopScratch = () => {
            if (!this.scratchData.isScratching) return;
            this.scratchData.isScratching = false;

            // [ÂM THANH] Tắt tiếng cào
            if(this.sounds && this.sounds.scratch) {
                this.sounds.scratch.pause();
                this.sounds.scratch.currentTime = 0;
            }

            ctx.closePath();
            this.checkScratchProgress(); 
        };

        // Gắn sự kiện chuẩn cho cả Mobile và PC
        canvas.onmousedown = startScratch;
        window.addEventListener('mousemove', scratchMove); 
        window.addEventListener('mouseup', stopScratch);
        canvas.ontouchstart = startScratch;
        canvas.ontouchmove = scratchMove;
        canvas.ontouchend = stopScratch;
        
        const closeBtn = document.querySelector('#scratch-game-modal .close-btn');
        closeBtn.onclick = () => {
            window.removeEventListener('mousemove', scratchMove);
            window.removeEventListener('mouseup', stopScratch);
            this.closeScratchGame();
        };
    },

    checkScratchProgress() {
        if (this.scratchData.isRevealed) return;
        const ctx = this.scratchData.ctx;
        const canvas = this.scratchData.canvas;
        
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let clearPixels = 0;
        
        for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] === 0) clearPixels++;
        }

        const percentCleared = (clearPixels / (canvas.width * canvas.height)) * 100;

        // Nếu cào sạch hơn 35% -> Tự động lột hết màn bạc
        if (percentCleared > 35) {
            this.scratchData.isRevealed = true;

            // Đảm bảo tắt tiếng cào khi auto-reveal
            if(this.sounds && this.sounds.scratch) {
                this.sounds.scratch.pause();
                this.sounds.scratch.currentTime = 0;
            }

            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            setTimeout(() => this.awardScratchPrize(), 200);
        }
    },

    awardScratchPrize() {
        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);
        const prize = this.scratchData.prize;

        if (prize > 0) {
            // [ÂM THANH] Nhận giải
            this.playSound('win');

            document.getElementById('scratch-msg').innerText = `🎉 CHÚC MỪNG! Bạn Đã Trúng ${prize.toLocaleString()} HCoins (¬‿¬ )✧ `;
            document.getElementById('scratch-msg').style.color = '#FFD700';
            
            // ---> KÍCH HOẠT HIỆU ỨNG ĐẶC BIỆT KHI TRÚNG 10,000 <---
            if (prize === 10000) {
                this.fireJackpotEffect();
                this.showToast(`🔥 ĐỘC ĐẮC! BẠN ĐÃ TRÚNG 10,000 HCOINS! 🔥`, "success");
            } else {
                this.showToast(`Tuyệt vời! Bạn vừa trúng ${prize.toLocaleString()} HCoins!`, "success");
            }

            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: prize })
            });
        } else {
            // [ÂM THANH] Tạch
            this.playSound('fail');

            document.getElementById('scratch-msg').innerText = `Tạch Rồi! Mua Tờ Khác Thử Vận May Nhé (｡•̀ᴗ-)✧ `;
            document.getElementById('scratch-msg').style.color = '#ff4d4d';
            this.showToast("Chúc Bạn May Mắn Lần Sau!", "warning");
        }

        setTimeout(() => {
            const buyBtn = document.getElementById('btn-buy-scratch');
            buyBtn.innerHTML = '<i class="fas fa-ticket-alt"></i> MUA TIẾP';
            buyBtn.disabled = false;
            buyBtn.style.display = 'block';
            
            // Trả lại trạng thái ẩn phần thưởng chờ cào tiếp
            document.getElementById('scratch-prize-text').innerHTML = "???"; 
            document.getElementById('ticket-serial-num').innerText = "********";
            this.scratchData.isRevealed = true;
            this.initScratchCanvas();
            
            document.getElementById('scratch-msg').innerText = 'Hãy Mua Vé Tiếp Để Thử Vận May (๑˃ᴗ˂)ﻭ ';
            document.getElementById('scratch-msg').style.color = '#ccc';
        }, 4000); // Kéo dài thời gian chờ lên 4 giây để ngắm mưa kim cương cho đã
    },
    
    // ==========================================
    // HIỆU ỨNG NỔ JACKPOT
    // ==========================================
    fireJackpotEffect() {
        // Tạo màn sương phủ toàn màn hình
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '0'; container.style.left = '0';
        container.style.width = '100vw'; container.style.height = '100vh';
        container.style.pointerEvents = 'none'; // Không cản trở click chuột
        container.style.zIndex = '99999'; // Nổi lên trên cùng mọi thứ
        document.body.appendChild(container);

        // Tạo 80 viên Kim cương và Tiền vàng rơi lả tả
        const emojis = ['💎', '💰', '✨', '💸', '🏆'];
        for(let i = 0; i < 80; i++) {
            const particle = document.createElement('div');
            particle.innerText = emojis[Math.floor(Math.random() * emojis.length)];
            particle.style.position = 'absolute';
            particle.style.left = (Math.random() * 100) + 'vw';
            particle.style.top = '-50px';
            particle.style.fontSize = (Math.random() * 25 + 20) + 'px';
            particle.style.filter = 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.8))';
            
            // Random tốc độ rơi và thời gian chờ
            const duration = Math.random() * 2 + 1.5; 
            const delay = Math.random() * 1;
            particle.style.animation = `jackpotFall ${duration}s ${delay}s linear forwards`;
            
            container.appendChild(particle);
        }

        // Bơm thêm CSS Animation trực tiếp vào web nếu chưa có
        if (!document.getElementById('jackpot-animations')) {
            const style = document.createElement('style');
            style.id = 'jackpot-animations';
            style.innerHTML = `
                @keyframes jackpotFall {
                    to { transform: translateY(110vh) rotate(720deg); opacity: 0; }
                }
                @keyframes epicScreenShake {
                    0%, 100% { transform: translate(0, 0) rotate(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translate(-10px, 5px) rotate(-1deg); }
                    20%, 40%, 60%, 80% { transform: translate(10px, -5px) rotate(1deg); }
                }
            `;
            document.head.appendChild(style);
        }

        // Rung chuyển cả cái Modal vé số
        const modal = document.querySelector('.luxury-ticket-v3');
        if(modal) modal.style.animation = 'epicScreenShake 0.6s ease-in-out';

        // Dọn dẹp rác sau 4 giây để web không bị lag
        setTimeout(() => {
            if(modal) modal.style.animation = '';
            if(document.body.contains(container)) document.body.removeChild(container);
        }, 4000);
    },
    
    // ==========================================
    // HỆ THỐNG ĐIỂM DANH 7 NGÀY
    // ==========================================
    checkInData: {
        rewards: [100, 200, 300, 400, 500, 600, 1000], // Mốc thưởng 7 ngày
        currentStreak: 0,
        lastDate: '',
        canClaimToday: false
    },

    // Hàm lấy ngày hiện tại chuẩn giờ VN (GMT+7)
    getTodayDateString() {
        const d = new Date();
        const localTime = d.getTime();
        const localOffset = d.getTimezoneOffset() * 60000;
        const gmt7 = localTime + localOffset + (3600000 * 7);
        const gmt7Date = new Date(gmt7);
        return `${gmt7Date.getFullYear()}-${String(gmt7Date.getMonth()+1).padStart(2,'0')}-${String(gmt7Date.getDate()).padStart(2,'0')}`;
    },

    // Hàm lấy ngày hôm qua chuẩn giờ VN
    getYesterdayDateString() {
        const d = new Date();
        const localTime = d.getTime();
        const localOffset = d.getTimezoneOffset() * 60000;
        const gmt7 = localTime + localOffset + (3600000 * 7) - 86400000; // Trừ đi 24h
        const gmt7Date = new Date(gmt7);
        return `${gmt7Date.getFullYear()}-${String(gmt7Date.getMonth()+1).padStart(2,'0')}-${String(gmt7Date.getDate()).padStart(2,'0')}`;
    },

    openCheckIn() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return this.showToast("Cần đăng nhập để điểm danh!", "error"); }
        
        document.getElementById('checkin-modal').style.display = 'flex';
        const safeKey = this.getSafeKey(email);
        
        // Quét Firebase xem lịch sử điểm danh của User
        db.ref(`users/${safeKey}/checkIn`).once('value').then(snapshot => {
            let data = snapshot.val() || { streak: 0, lastDate: '' };
            
            const todayStr = this.getTodayDateString();
            const yesterdayStr = this.getYesterdayDateString();
            
            this.checkInData.lastDate = data.lastDate;
            this.checkInData.currentStreak = data.streak;
            
            // Logic tính chuỗi (Streak)
            if (data.lastDate === todayStr) {
                // Hôm nay đã nhận rồi
                this.checkInData.canClaimToday = false;
            } else if (data.lastDate === yesterdayStr && data.streak < 7) {
                // Hôm qua có nhận, và chuỗi chưa max 7 -> Giữ chuỗi, cho nhận tiếp
                this.checkInData.canClaimToday = true;
            } else {
                // Bị đứt chuỗi (không nhận hôm qua) HOẶC vừa hoàn thành ngày 7 hôm qua -> Trở về Ngày 1
                this.checkInData.currentStreak = 0; 
                this.checkInData.canClaimToday = true;
            }

            this.renderCheckInUI();
        });
    },

    renderCheckInUI() {
        const container = document.getElementById('checkin-days-grid');
        container.innerHTML = '';
        
        const streak = this.checkInData.currentStreak;
        const canClaim = this.checkInData.canClaimToday;
        
        // Vẽ 7 cái thẻ ra màn hình
        for(let i = 0; i < 7; i++) {
            const reward = this.checkInData.rewards[i];
            let statusClass = '';
            let icon = 'fa-coins'; // Mặc định chưa tới

            if (i < streak) {
                statusClass = 'claimed'; // Đã nhận
                icon = 'fa-check-circle';
            } else if (i === streak && canClaim) {
                statusClass = 'active'; // Hôm nay được nhận
                icon = 'fa-gift';
            } else if (i === 6) {
                icon = 'fa-gem'; // Icon đặc biệt ngày 7
            }

            const isDay7 = (i === 6) ? 'day-7-card' : '';
            
            // Dấu Check bự chà bá khi đã nhận
            const claimedOverlay = statusClass === 'claimed' ? `<div style="position:absolute; top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:5;"><i class="fas fa-check" style="color:#28a745;font-size:40px;filter:drop-shadow(0 0 5px #000);"></i></div>` : '';

            container.innerHTML += `
                <div class="checkin-day-card ${statusClass} ${isDay7}">
                    <div class="checkin-day-title">NGÀY ${i + 1}</div>
                    <i class="fas ${icon} checkin-day-icon"></i>
                    <div class="checkin-day-reward">+${reward.toLocaleString()}</div>
                    ${claimedOverlay}
                </div>
            `;
        }

        // Cập nhật trạng thái nút bấm
        const btn = document.getElementById('btn-claim-checkin');
        if (canClaim) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-hand-holding-usd"></i> ĐIỂM DANH NGÀY ${streak + 1} (NHẬN ${this.checkInData.rewards[streak]} HCOINS)`;
            btn.style.background = 'linear-gradient(135deg, #00ffcc, #0080ff)';
            btn.style.color = '#000';
        } else {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-clock"></i> ĐÃ NHẬN HÔM NAY. QUAY LẠI VÀO NGÀY MAI!`;
            btn.style.background = '#333';
            btn.style.color = '#777';
        }
    },

    claimCheckIn() {
        if (!this.checkInData.canClaimToday) return;
        
        // [ÂM THANH] Click
        this.playSound('click');

        const email = localStorage.getItem('haruno_email');
        const safeKey = this.getSafeKey(email);
        const todayStr = this.getTodayDateString();
        
        const nextStreak = this.checkInData.currentStreak + 1;
        const rewardAmount = this.checkInData.rewards[this.checkInData.currentStreak];

        const btn = document.getElementById('btn-claim-checkin');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG NHẬN QUÀ...';

        // 1. Cập nhật chuỗi mới vào Firebase
        const updateData = { streak: nextStreak, lastDate: todayStr };

        db.ref(`users/${safeKey}/checkIn`).set(updateData).then(() => {
            // 2. Bắn API qua Worker để cộng tiền (Tận dụng endpoint minigameResult bạn đã có)
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'minigameResult', safeKey: safeKey, amount: rewardAmount })
            }).then(res => res.json()).then(data => {
                
                // [ÂM THANH] Điểm danh thành công
                /*this.playSound('win');*/

                // Nếu nhận mốc 7 ngày thì bắn pháo hoa Kim Cương cho rực rỡ
                if (nextStreak === 7 && typeof this.fireJackpotEffect === "function") {
                    this.fireJackpotEffect(); 
                    this.showToast(`🔥 CHÚC MỪNG! BẠN HOÀN THÀNH CHUỖI 7 NGÀY NHẬN ${rewardAmount.toLocaleString()} HCOINS! 🔥`, "success");
                } else {
                    this.showToast(`Điểm danh thành công! Nhận ${rewardAmount.toLocaleString()} HCoins!`, "success");
                }
                
                // Load lại UI tại chỗ
                this.checkInData.currentStreak = nextStreak;
                this.checkInData.lastDate = todayStr;
                this.checkInData.canClaimToday = false;
                this.renderCheckInUI();
            });
        });
    },
    
    // ==========================================
    // MINIGAME PIKACHU CỔ ĐIỂN (BẢN MEGA VIP)
    // ==========================================
    pikaData: {
        ROWS: 10, // 8 dòng chơi + 2 viền
        COLS: 14, // 12 cột chơi + 2 viền (Tổng 96 thú)
        board: [],
        selected: null,
        timer: 120, // Thời gian chơi 120 giây
        maxTime: 120,
        interval: null,
        isPlaying: false,
        shuffles: 3,
        pairsLeft: 0,
        // Kho thú khổng lồ (24 con)
        icons: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦉','🦇','🐺','🐗'],
        lastMatchTime: 0,
        comboCount: 0
    },

    openPikachuGame() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return this.showToast("Cần đăng nhập để chơi!", "error"); }
        document.getElementById('pikachu-game-modal').style.display = 'flex';
        
        document.getElementById('btn-start-pikachu').style.display = 'block';
        document.getElementById('pikachu-board-container').style.display = 'none';
        document.getElementById('btn-pika-shuffle').style.display = 'none';
        
        document.getElementById('pika-time-bar').style.width = '100%';
        document.getElementById('pika-time-bar').style.background = 'linear-gradient(90deg, #ff0000, #ffcc00)';
    },

    closePikachuGame() {
        if (this.pikaData.isPlaying) {
            this.showToast("Trốn ngang là mất tiền cược nha!", "warning");
        }
        clearInterval(this.pikaData.interval);
        this.pikaData.isPlaying = false;
        document.getElementById('pikachu-game-modal').style.display = 'none';
    },

    startPikachuGame() {
        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);
        const fee = 100; // Tăng phí lên 100

        // [ÂM THANH] Click start
        this.playSound('click');

        const startBtn = document.getElementById('btn-start-pikachu');
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG TẠO BÀN...';

        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: fee })
        }).then(res => res.json()).then(data => {
            if (!data.success) {
                this.showToast("Cháy túi rồi bạn ơi!", "error");
                startBtn.disabled = false;
                startBtn.innerHTML = 'CHƠI NGAY (100 HCOINS)';
                return;
            }

            // [ÂM THANH] Trừ cược
            this.playSound('coin');

            startBtn.style.display = 'none';
            startBtn.disabled = false;
            startBtn.innerHTML = 'CHƠI LẠI (100 HCOINS)';
            
            document.getElementById('pikachu-board-container').style.display = 'block';
            document.getElementById('btn-pika-shuffle').style.display = 'block';
            
            this.initPikachuBoard();
            this.pikaData.timer = this.pikaData.maxTime;
            this.pikaData.isPlaying = true;
            this.pikaData.shuffles = 3;
            this.pikaData.comboCount = 0;
            document.getElementById('pika-shuffle-count').innerText = this.pikaData.shuffles;

            clearInterval(this.pikaData.interval);
            this.pikaData.interval = setInterval(() => this.pikaGameTick(), 1000);
        });
    },

    initPikachuBoard() {
        this.pikaData.board = Array.from({ length: this.pikaData.ROWS }, () => Array(this.pikaData.COLS).fill(0));
        this.pikaData.selected = null;

        // Vùng chơi: 8 dòng x 12 cột = 96 ô (48 cặp)
        let tileDeck = [];
        // Dùng 16 loại thú, mỗi loại 6 con = 96 ô
        let activeIcons = this.pikaData.icons.slice(0, 16);
        for (let i = 0; i < 6; i++) {
            tileDeck = tileDeck.concat(activeIcons);
        }
        
        tileDeck.sort(() => Math.random() - 0.5); // Trộn bài

        let idx = 0;
        for (let r = 1; r < this.pikaData.ROWS - 1; r++) {
            for (let c = 1; c < this.pikaData.COLS - 1; c++) {
                this.pikaData.board[r][c] = tileDeck[idx++];
            }
        }
        
        this.pikaData.pairsLeft = 48; // Gấp đôi bản trước
        this.renderPikaBoard();
        this.pikaSetupCanvas();
        this.checkPikaDeadlock(); 
    },

    renderPikaBoard() {
        const grid = document.getElementById('pikachu-grid');
        grid.innerHTML = '';
        
        for (let r = 0; r < this.pikaData.ROWS; r++) {
            for (let c = 0; c < this.pikaData.COLS; c++) {
                const val = this.pikaData.board[r][c];
                const div = document.createElement('div');
                div.className = 'pika-tile';
                div.id = `pika-${r}-${c}`;
                
                if (val === 0) {
                    div.classList.add('empty');
                } else {
                    div.innerText = val;
                    div.onclick = () => this.pikaTileClick(r, c);
                }
                grid.appendChild(div);
            }
        }
    },

    pikaSetupCanvas() {
        const canvas = document.getElementById('pikachu-canvas');
        // Kích thước ô CSS: 38px + 1px gap = 39px
        canvas.width = this.pikaData.COLS * 39 - 1; 
        canvas.height = this.pikaData.ROWS * 39 - 1;
    },

    pikaTileClick(r, c) {
        if (!this.pikaData.isPlaying || this.pikaData.board[r][c] === 0) return;

        // [ÂM THANH] Chọn thú
        this.playSound('click');

        const current = { r, c };

        if (!this.pikaData.selected) {
            this.pikaData.selected = current;
            document.getElementById(`pika-${r}-${c}`).classList.add('selected');
            return;
        }

        const sel = this.pikaData.selected;
        
        if (sel.r === r && sel.c === c) {
            document.getElementById(`pika-${r}-${c}`).classList.remove('selected');
            this.pikaData.selected = null;
            return;
        }

        if (this.pikaData.board[sel.r][sel.c] !== this.pikaData.board[r][c]) {
            document.getElementById(`pika-${sel.r}-${sel.c}`).classList.remove('selected');
            this.pikaData.selected = current;
            document.getElementById(`pika-${r}-${c}`).classList.add('selected');
            return;
        }

        const path = this.findPikachuPath(sel, current);
        
        if (path) {
            // NỐI THÀNH CÔNG
            this.pikaDrawPath(path);
            
            // [ÂM THANH] Nối thành công tia sét chớp
            this.playSound('lightning');

            this.pikaData.board[sel.r][sel.c] = 0;
            this.pikaData.board[r][c] = 0;
            this.pikaData.selected = null;
            this.pikaData.pairsLeft--;

            const t1 = document.getElementById(`pika-${sel.r}-${sel.c}`);
            const t2 = document.getElementById(`pika-${r}-${c}`);
            t1.classList.remove('selected'); t1.classList.add('empty'); t1.innerText = '';
            t2.classList.remove('selected'); t2.classList.add('empty'); t2.innerText = '';

            // --- HỆ THỐNG COMBO ---
            const now = Date.now();
            if (now - this.pikaData.lastMatchTime < 3500) { // Nối lại trong vòng 3.5 giây
                this.pikaData.comboCount++;
                this.showComboEffect(this.pikaData.comboCount);
                // Combo càng cao cộng càng nhiều giờ
                const extraTime = Math.min(5, 1 + Math.floor(this.pikaData.comboCount / 2));
                this.pikaData.timer = Math.min(this.pikaData.maxTime, this.pikaData.timer + extraTime);
            } else {
                this.pikaData.comboCount = 1; // Reset combo
                document.getElementById('pika-combo-text').style.opacity = '0';
                this.pikaData.timer = Math.min(this.pikaData.maxTime, this.pikaData.timer + 1); // Nối chậm chỉ dc +1s
            }
            this.pikaData.lastMatchTime = now;

            if (this.pikaData.pairsLeft === 0) {
                this.pikaWinGame();
            } else {
                this.checkPikaDeadlock();
            }

        } else {
            // Sai đường
            const t2 = document.getElementById(`pika-${r}-${c}`);
            t2.style.transform = 'translateX(5px)';
            setTimeout(() => t2.style.transform = '', 100);
            
            document.getElementById(`pika-${sel.r}-${sel.c}`).classList.remove('selected');
            this.pikaData.selected = current;
            t2.classList.add('selected');
        }
    },

    showComboEffect(count) {
        if (count < 2) return;
        const comboEl = document.getElementById('pika-combo-text');
        comboEl.innerText = `🔥 COMBO x${count}`;
        comboEl.style.opacity = '1';
        comboEl.classList.remove('combo-active');
        void comboEl.offsetWidth; // Trigger reflow
        comboEl.classList.add('combo-active');
    },

    findPikachuPath(start, target) {
        const dr = [-1, 0, 1, 0]; 
        const dc = [0, 1, 0, -1];
        let q = [];
        let visited = Array(this.pikaData.ROWS).fill(0).map(() => Array(this.pikaData.COLS).fill(0).map(() => Array(4).fill(Infinity)));

        for (let i = 0; i < 4; i++) {
            let nr = start.r + dr[i];
            let nc = start.c + dc[i];
            if (nr >= 0 && nr < this.pikaData.ROWS && nc >= 0 && nc < this.pikaData.COLS) {
                q.push({ r: nr, c: nc, dir: i, turns: 0, path: [start, { r: nr, c: nc }] });
                visited[nr][nc][i] = 0;
            }
        }

        let bestPath = null;
        let minTurns = Infinity;

        while (q.length > 0) {
            let curr = q.shift();
            let { r, c, dir, turns, path } = curr;

            if (r === target.r && c === target.c) {
                if (turns < minTurns) {
                    minTurns = turns;
                    bestPath = path;
                }
                continue; 
            }

            if (this.pikaData.board[r][c] !== 0) continue; 

            for (let i = 0; i < 4; i++) {
                let nr = r + dr[i];
                let nc = c + dc[i];
                if (nr >= 0 && nr < this.pikaData.ROWS && nc >= 0 && nc < this.pikaData.COLS) {
                    let nextTurns = turns + (dir === i ? 0 : 1);
                    if (nextTurns <= 2 && nextTurns < visited[nr][nc][i]) {
                        visited[nr][nc][i] = nextTurns;
                        q.push({ r: nr, c: nc, dir: i, turns: nextTurns, path: [...path, { r: nr, c: nc }] });
                    }
                }
            }
        }
        return bestPath;
    },

    pikaDrawPath(path) {
        const canvas = document.getElementById('pikachu-canvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.beginPath();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffcc00';

        const cellSize = 39; // CSS width 38 + 1 gap
        
        path.forEach((p, idx) => {
            const x = p.c * cellSize + 19; // Tâm ô (38/2 = 19)
            const y = p.r * cellSize + 19;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        
        ctx.stroke();
        setTimeout(() => ctx.clearRect(0, 0, canvas.width, canvas.height), 300);
    },

    checkPikaDeadlock() {
        let tiles = [];
        for (let r = 1; r < this.pikaData.ROWS - 1; r++) {
            for (let c = 1; c < this.pikaData.COLS - 1; c++) {
                if (this.pikaData.board[r][c] !== 0) {
                    tiles.push({ r, c, val: this.pikaData.board[r][c] });
                }
            }
        }
        
        let hasMove = false;
        for (let i = 0; i < tiles.length; i++) {
            for (let j = i + 1; j < tiles.length; j++) {
                if (tiles[i].val === tiles[j].val) {
                    if (this.findPikachuPath(tiles[i], tiles[j])) {
                        hasMove = true;
                        break;
                    }
                }
            }
            if (hasMove) break;
        }

        if (!hasMove && tiles.length > 0) {
            this.showToast("Bị kẹt! Tự động đảo thú...", "warning");
            setTimeout(() => this.pikaShuffleBoard(false), 1000);
        }
    },

    pikaShuffleBoard(isManual) {
        if (!this.pikaData.isPlaying) return;
        
        if (isManual) {
            if (this.pikaData.shuffles <= 0) return this.showToast("Đã hết lượt đảo miễn phí!", "error");
            this.pikaData.shuffles--;
            document.getElementById('pika-shuffle-count').innerText = this.pikaData.shuffles;
        }

        // [ÂM THANH] Trộn bài
        /*this.playSound('shuffle');*/

        let tiles = [];
        for (let r = 1; r < this.pikaData.ROWS - 1; r++) {
            for (let c = 1; c < this.pikaData.COLS - 1; c++) {
                if (this.pikaData.board[r][c] !== 0) {
                    tiles.push(this.pikaData.board[r][c]);
                }
            }
        }

        tiles.sort(() => Math.random() - 0.5); 

        let idx = 0;
        for (let r = 1; r < this.pikaData.ROWS - 1; r++) {
            for (let c = 1; c < this.pikaData.COLS - 1; c++) {
                if (this.pikaData.board[r][c] !== 0) {
                    this.pikaData.board[r][c] = tiles[idx++];
                }
            }
        }
        
        this.pikaData.selected = null;
        this.renderPikaBoard();
        this.checkPikaDeadlock();
    },

    pikaGameTick() {
        if (!this.pikaData.isPlaying) return;
        this.pikaData.timer--;
        
        const pct = (this.pikaData.timer / this.pikaData.maxTime) * 100;
        const bar = document.getElementById('pika-time-bar');
        bar.style.width = pct + '%';
        
        if (pct < 30) {
            bar.style.background = '#ff0000';
            // [ÂM THANH] Tích tắc khi gần hết giờ (dưới 30%)
            this.playSound('tick');
        } else {
            bar.style.background = 'linear-gradient(90deg, #ff0000, #ffcc00)';
        }

        if (this.pikaData.timer <= 0) {
            clearInterval(this.pikaData.interval);
            this.pikaData.isPlaying = false;

            // [ÂM THANH] Thua game
            this.playSound('fail');

            this.showToast("Hết giờ! Bạn thua rồi nha!", "error");
            document.getElementById('btn-start-pikachu').style.display = 'block';
            document.getElementById('pikachu-board-container').style.display = 'none';
            document.getElementById('btn-pika-shuffle').style.display = 'none';
            document.getElementById('pika-combo-text').style.opacity = '0';
        }
    },

    pikaWinGame() {
        clearInterval(this.pikaData.interval);
        this.pikaData.isPlaying = false;
        
        // [ÂM THANH] Thắng Pikachu
        this.playSound('win');

        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);
        const reward = 300; // Thắng nhận hẳn 300 HCoins

        this.showToast(`🎉 CHÚC MỪNG! Bạn nhận được ${reward} HCoins!`, "success");
        if (typeof this.fireJackpotEffect === "function") this.fireJackpotEffect();

        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: reward })
        });

        setTimeout(() => {
            document.getElementById('btn-start-pikachu').style.display = 'block';
            document.getElementById('btn-start-pikachu').innerHTML = 'CHƠI LẠI (100 HCOINS)';
            document.getElementById('pikachu-board-container').style.display = 'none';
            document.getElementById('btn-pika-shuffle').style.display = 'none';
            document.getElementById('pika-combo-text').style.opacity = '0';
        }, 3000);
    },
	
	// ==========================================
    // HỆ THỐNG GACHA (WUTHERING WAVES STYLE)
    // ==========================================
    gachaConfig: {
        cost: 100,
        pityLimit: 50,
        isRolling: false,
        
        // BỂ PHẦN THƯỞNG HIẾM (KHÔNG TRÙNG LẶP)
        premiumPool: [
            { id: "frame-1", type: "frame", name: "Hello Kitty", img: "https://cdn.discordapp.com/avatar-decoration-presets/a_1ab42e495777eb9e8728a6c636b0a954", rarity: "Legendary" },
            { id: "frame-2", type: "frame", name: "Pompompurin", img: "https://cdn.discordapp.com/avatar-decoration-presets/a_a16394f64b8d9fa38fa75078dc408689", rarity: "Legendary" },
            { id: "frame-3", type: "frame", name: "Cinnamoroll", img: "https://cdn.discordapp.com/avatar-decoration-presets/a_4786361f20944a2dfe2c55986ee79571", rarity: "Legendary" },
            { id: "frame-4", type: "frame", name: "Pochacco", img: "https://cdn.discordapp.com/avatar-decoration-presets/a_8dfc22a5f29064737dd2628b153da17a", rarity: "Legendary" },
            { id: "frame-5", type: "frame", name: "Kuromi", img: "https://cdn.discordapp.com/avatar-decoration-presets/a_d6b900c052726061be62b8ff4278d135", rarity: "Legendary" },
            { id: "frame-6", type: "frame", name: "My Melody", img: "https://cdn.discordapp.com/avatar-decoration-presets/a_35784f5c1ae9662eecddba177c0a21a3", rarity: "Legendary" },
            { id: "frame-7", type: "frame", name: "LittleTwinStars", img: "https://cdn.discordapp.com/avatar-decoration-presets/a_bb6cedd7a96db71ac1e3eb5392f03a0b", rarity: "Legendary" },
            { id: "frame-8", type: "frame", name: "Chococat", img: "https://cdn.discordapp.com/avatar-decoration-presets/a_ba85f37e87d48950a6cc7135c6302afb", rarity: "Legendary" },
            { id: "frame-9", type: "frame", name: "Keroppi", img: "https://cdn.discordapp.com/avatar-decoration-presets/a_451ba8354eb5749a606c8a3a89970064", rarity: "Legendary" },
            { id: "frame-10", type: "frame", name: "Tuxedosam", img: "https://cdn.discordapp.com/avatar-decoration-presets/a_ee77df4c2dc6f8aa9dc11aacc1effcd8", rarity: "Legendary" },
            
            { id: "chat-effect-8", type: "chatFrame", name: "Hello Kitty", img: "https://cdn.discordapp.com/media/v1/collectibles-shop/1488244924066566185/animated", rarity: "Legendary" },
            { id: "chat-effect-9", type: "chatFrame", name: "Pompompurin", img: "https://cdn.discordapp.com/media/v1/collectibles-shop/1488245189482123364/animated", rarity: "Legendary" },
            { id: "chat-effect-10", type: "chatFrame", name: "Cinnamoroll", img: "https://cdn.discordapp.com/media/v1/collectibles-shop/1488245478213816320/animated", rarity: "Legendary" },
            { id: "chat-effect-11", type: "chatFrame", name: "Pochacco", img: "https://cdn.discordapp.com/media/v1/collectibles-shop/1488245662947475506/animated", rarity: "Legendary" },
            { id: "chat-effect-12", type: "chatFrame", name: "Kuromi x Melody", img: "https://cdn.discordapp.com/media/v1/collectibles-shop/1488245817364975626/animated", rarity: "Legendary" },
            { id: "chat-effect-13", type: "chatFrame", name: "Chococat", img: "https://cdn.discordapp.com/media/v1/collectibles-shop/1488245996054904983/animated", rarity: "Legendary" },
            { id: "chat-effect-14", type: "chatFrame", name: "gudetama", img: "https://cdn.discordapp.com/media/v1/collectibles-shop/1488246136585060452/animated", rarity: "Legendary" },
            { id: "chat-effect-15", type: "chatFrame", name: "Badtz-maru", img: "https://cdn.discordapp.com/media/v1/collectibles-shop/1488246309197713542/animated", rarity: "Legendary" },
            
            { id: "effect-1", type: "effect", name: "Hello Kitty", img: "https://i.ibb.co/cK68ddk5/ezgif-5e5255d01cb7216f.gif", rarity: "Legendary" },
            { id: "effect-2", type: "effect", name: "Pompompurin", img: "https://i.ibb.co/PsnXR2wy/ezgif-5ede70dcde25a82f.gif", rarity: "Legendary" },
            { id: "effect-3", type: "effect", name: "Cinnamoroll", img: "https://i.ibb.co/ybftR2X/ezgif-5506e24774635a62.gif", rarity: "Legendary" },
            { id: "effect-4", type: "effect", name: "Kuromi x Melody", img: "https://i.ibb.co/F46tFfqr/ezgif-574f6bdffdaf259d.gif", rarity: "Legendary" },
            { id: "effect-5", type: "effect", name: "LittleTwinStars", img: "https://i.ibb.co/XfVNDk7H/ezgif-5d1cbcb7fb94860c.gif", rarity: "Legendary" },
            { id: "effect-6", type: "effect", name: "Chơi Trong Sân", img: "https://i.ibb.co/SWgcXSv/ezgif-5feebf3c8a69109c.gif", rarity: "Legendary" },
        ],

        // BỂ PHẦN THƯỞNG THÔNG THƯỜNG
        hcoinPool: [
		    { amount: 10, name: "10 HCoins", img: "https://i.ibb.co/KTWm9CH/Gemini-Generated-Image-4lhxf64lhxf64lhx-removebg-preview.png", rarity: "Common" },
            { amount: 20, name: "20 HCoins", img: "https://i.ibb.co/KTWm9CH/Gemini-Generated-Image-4lhxf64lhxf64lhx-removebg-preview.png", rarity: "Common" },
			{ amount: 30, name: "30 HCoins", img: "https://i.ibb.co/KTWm9CH/Gemini-Generated-Image-4lhxf64lhxf64lhx-removebg-preview.png", rarity: "Common" },
			{ amount: 40, name: "40 HCoins", img: "https://i.ibb.co/KTWm9CH/Gemini-Generated-Image-4lhxf64lhxf64lhx-removebg-preview.png", rarity: "Common" },
            { amount: 50, name: "50 HCoins", img: "https://i.ibb.co/KTWm9CH/Gemini-Generated-Image-4lhxf64lhxf64lhx-removebg-preview.png", rarity: "Common" }
        ]
    },

    openGacha() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return this.showToast("Đăng nhập để Triệu hồi!", "error"); }
        
        const safeUser = this.getSafeKey(email);
        document.getElementById('gacha-modal').style.display = 'flex';
        
        // KÍCH HOẠT ĐẾM NGƯỢC
        this.startBannerCountdown();
        
        // Lắng nghe HCoins và Pity
        db.ref(`users/${safeUser}/coins`).on('value', snap => {
            const coins = snap.val() || 0;
            const el = document.getElementById('gacha-user-coins');
            if(el) el.innerText = coins.toLocaleString();
        });

        db.ref(`users/${safeUser}/gachaPity`).on('value', snap => {
            let currentPity = snap.val() || 0;
            const pityLeft = this.gachaConfig.pityLimit - currentPity;
            const el = document.getElementById('gacha-pity-counter');
            if(el) el.innerText = pityLeft;
        });
    },

    closeGacha() {
        if(this.gachaConfig.isRolling) return this.showToast("Đang triệu hồi, không thể thoát!", "warning");
        const email = localStorage.getItem('haruno_email');
        if(email) {
            const safeUser = this.getSafeKey(email);
            db.ref(`users/${safeUser}/coins`).off();
            db.ref(`users/${safeUser}/gachaPity`).off();
        }
        document.getElementById('gacha-modal').style.display = 'none';
    },
	
	showGachaPool() {
        const overlay = document.getElementById('gacha-pool-overlay');
        const premiumGrid = document.getElementById('pool-grid-premium');
        const commonGrid = document.getElementById('pool-grid-common');
        
        premiumGrid.innerHTML = '';
        commonGrid.innerHTML = '';

        // 1. In ra toàn bộ đồ Hiếm (Legendary - Hello Kitty...)
        this.gachaConfig.premiumPool.forEach(item => {
            const div = document.createElement('div');
            div.className = 'pool-item legendary';
            
            // Phân loại nhãn hiển thị cho rõ ràng
            let typeLabel = "KHUNG AVATAR";
            if(item.type === "chatFrame") typeLabel = "HIỆU ỨNG CHAT";
            if(item.type === "effect") typeLabel = "HIỆU ỨNG HỒ SƠ";

            div.innerHTML = `
                <div class="pool-badge badge-legendary">${typeLabel}</div>
                <img src="${item.img}" alt="${item.name}">
                <span>${item.name}</span>
            `;
            premiumGrid.appendChild(div);
        });

        // 2. In ra đồ thường (HCoins)
        this.gachaConfig.hcoinPool.forEach(item => {
            const div = document.createElement('div');
            div.className = 'pool-item';
            div.innerHTML = `
                <div class="pool-badge" style="background: #555; color: #fff;">TIỀN TỆ</div>
                <img src="${item.img}" alt="${item.name}" style="opacity: 0.8">
                <span>${item.name}</span>
            `;
            commonGrid.appendChild(div);
        });

        overlay.style.display = 'flex';
    },
	
	startBannerCountdown() {
        // Bạn có thể đổi ngày kết thúc banner ở đây (Năm-Tháng-Ngày T Giờ:Phút:Giây)
        const endDate = new Date("2026-05-30T23:59:59").getTime(); 
        const el = document.getElementById('banner-countdown');
        if(!el) return;

        if(this.bannerInterval) clearInterval(this.bannerInterval);

        this.bannerInterval = setInterval(() => {
            const now = new Date().getTime();
            const distance = endDate - now;

            if (distance < 0) {
                el.innerHTML = "ĐÃ KẾT THÚC";
                clearInterval(this.bannerInterval);
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            el.innerHTML = `${days} ngày ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    },

    async rollGacha(times) {
        if(this.gachaConfig.isRolling) return;
        
        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);
        const totalCost = this.gachaConfig.cost * times;

        this.gachaConfig.isRolling = true;

        try {
            // Trừ tiền
            const res = await fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: totalCost })
            });
            const data = await res.json();
            
            if (!data.success) {
                this.gachaConfig.isRolling = false;
                return this.showToast("Bạn không đủ HCoins để Triệu hồi!", "error");
            }

            // BẬT CUTSCENE SAO BĂNG KỊCH TÍNH
            const cutscene = document.getElementById('summon-cutscene');
            if(cutscene) {
                // Reset animation bằng cách clone node
                const newCutscene = cutscene.cloneNode(true);
                cutscene.parentNode.replaceChild(newCutscene, cutscene);
                newCutscene.style.display = 'flex';
            }

            const snapInv = await db.ref(`users/${safeUser}/inventory`).once('value');
            const userInventory = snapInv.val() || {};
            
            const snapPity = await db.ref(`users/${safeUser}/gachaPity`).once('value');
            let currentPity = snapPity.val() || 0;

            let results = [];
            let totalHCoinsGained = 0;

            let unownedItems = this.gachaConfig.premiumPool.filter(item => {
                return !userInventory[item.id] && !(userInventory[item.type] && userInventory[item.type][item.id]);
            });

            for (let i = 0; i < times; i++) {
                currentPity++;
                let isRare = false;

                if (currentPity >= this.gachaConfig.pityLimit || Math.random() < 0.02) {
                    isRare = true;
                    currentPity = 0; 
                }

                if (isRare) {
                    if (unownedItems.length > 0) {
                        const randIdx = Math.floor(Math.random() * unownedItems.length);
                        const wonItem = unownedItems[randIdx];
                        
                        results.push({ isRare: true, item: wonItem });
                        
                        await db.ref(`users/${safeUser}/inventory/${wonItem.id}`).set(true);
                        const localInv = JSON.parse(localStorage.getItem('haruno_inventory') || '{}');
                        localInv[wonItem.id] = true;
                        localStorage.setItem('haruno_inventory', JSON.stringify(localInv));
                        unownedItems.splice(randIdx, 1);
                    } else {
                        const compensation = 500;
                        totalHCoinsGained += compensation;
                        results.push({ isRare: true, fallback: true, coins: compensation, fallbackImg: "https://i.ibb.co/KTWm9CH/Gemini-Generated-Image-4lhxf64lhxf64lhx-removebg-preview.png" });
                    }
                } else {
                    const commonPrize = this.gachaConfig.hcoinPool[Math.floor(Math.random() * this.gachaConfig.hcoinPool.length)];
                    totalHCoinsGained += commonPrize.amount;
                    results.push({ isRare: false, item: commonPrize });
                }
            }

            await db.ref(`users/${safeUser}/gachaPity`).set(currentPity);
            if (totalHCoinsGained > 0) {
                fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: totalHCoinsGained })
                });
            }

            // ĐỢI CUTSCENE NỔ TUNG XONG (Khoảng 2.6 giây) THÌ MỚI HIỆN KẾT QUẢ
            setTimeout(() => {
                const activeCutscene = document.getElementById('summon-cutscene');
                if(activeCutscene) activeCutscene.style.display = 'none';
                
                this.renderGachaResults(results);
                this.gachaConfig.isRolling = false;
            }, 2600);

        } catch (e) {
            console.error(e);
            this.showToast("Lỗi hệ thống triệu hoán!", "error");
            this.gachaConfig.isRolling = false;
            document.getElementById('summon-cutscene').style.display = 'none';
        }
    },

    renderGachaResults(results) {
        const overlay = document.getElementById('gacha-result-overlay');
        const grid = document.getElementById('gacha-result-grid');
        grid.innerHTML = '';
        
        // Đổi màu nền lúc mở thẻ sang tone vũ trụ sâu thẳm
        overlay.style.background = 'radial-gradient(circle at center, rgba(20,10,40,0.95) 0%, rgba(0,0,0,0.98) 100%)';
        overlay.style.display = 'flex';

        results.forEach((res, idx) => {
            const el = document.createElement('div'); // Biến của bạn là 'el'
            
            // Gắn class Animation 3D
            el.className = 'gacha-result-card';
            if (res.isRare) el.classList.add('legendary-card');
            
            // Layout cơ bản
            el.style.position = 'relative'; // ÉP RELATIVE Ở ĐÂY ĐỂ CHỮ NEW KHÔNG BAY RA NGOÀI
            el.style.width = '130px';
            el.style.height = '180px';
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            el.style.justifyContent = 'center';
            el.style.alignItems = 'center';
            el.style.borderRadius = '12px';
            el.style.animationDelay = `${idx * 0.15}s`; // Thẻ bay ra lần lượt cách nhau 0.15s

            // Nếu là đồ thường, giữ background kính mờ
            if (!res.isRare) {
                el.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(0,0,0,0.8))';
                el.style.border = '1px solid rgba(255,255,255,0.2)';
            }

            let contentHTML = '';
            if (res.isRare && !res.fallback) {
                contentHTML = `
                    <div style="position: absolute; top: -2px; right: -2px; background: linear-gradient(135deg, #ff00ff 0%, #ff3366 100%); color: #ffffff !important; font-size: 11px; font-weight: 900; width: 44px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 6px; box-shadow: 0 4px 10px rgba(255, 0, 255, 0.5); letter-spacing: 1px; z-index: 10; margin: 0; padding: 0; box-sizing: border-box;">MỚI</div>
                    
                    <img src="${res.item.img}" style="width: 75px; height: 75px; object-fit: contain; margin-bottom: 15px; filter: drop-shadow(0 0 15px rgba(255,215,0,0.8));">
                    <div style="color: #ffd700; font-size: 13px; text-align: center; font-weight: 900; padding: 0 5px; text-transform: uppercase; text-shadow: 0 0 5px rgba(255,215,0,0.5); line-height: 1.2;">${res.item.name}</div>
                `;
            } else if (res.isRare && res.fallback) {
                contentHTML = `
                    <img src="${res.fallbackImg}" style="width: 70px; height: 70px; object-fit: contain; margin-bottom: 15px; filter: grayscale(50%) brightness(1.5);">
                    <span style="color: #aaa; font-size: 11px; text-align: center; margin-bottom: 5px;">Đã Full Kho Đồ</span>
                    <span style="color: #00ffcc; font-weight: bold; font-size: 16px; text-shadow: 0 0 8px rgba(0,255,204,0.5);">+${res.coins} HCoins</span>
                `;
            } else {
                contentHTML = `
                    <img src="${res.item.img}" style="width: 55px; height: 55px; object-fit: contain; margin-bottom: 15px; opacity: 0.8; filter: drop-shadow(0 0 5px rgba(255,255,255,0.2));">
                    <span style="color: #fff; font-weight: bold; font-size: 16px; letter-spacing: 1px;">+${res.item.amount}</span>
                `;
            }

            el.innerHTML = contentHTML;
            grid.appendChild(el);
        });
    },
	
	// ==========================================
    // LOGIC KHÓA/MỞ KHÓA VẬT PHẨM TRONG HỒ SƠ
    // ==========================================
    async syncLockedItems() {
        const email = localStorage.getItem('haruno_email');
        if (!email) return;
        const safeUser = this.getSafeKey(email);

        try {
            // Lấy dữ liệu kho đồ hiện tại của người dùng từ Firebase
            const snapInv = await db.ref(`users/${safeUser}/inventory`).once('value');
            const userInv = snapInv.val() || {};

            // Lấy các thẻ select trong HTML của bạn (Thay ID nếu bạn đặt tên khác)
            const frameSelect = document.getElementById('profile-avatar-frame');
            const chatSelect = document.getElementById('profile-chat-frame');
            const effectSelect = document.getElementById('profile-effect');

            // Hàm xử lý khóa Option
            const lockOptions = (selectElement, itemType) => {
                if (!selectElement) return;
                for (let i = 0; i < selectElement.options.length; i++) {
                    const option = selectElement.options[i];
                    const val = option.value;
                    
                    // Bỏ qua các tùy chọn "Không dùng" hoặc rỗng
                    if (!val || val === "none" || val === "") {
                        option.disabled = false;
                        continue;
                    }

                    // Kiểm tra xem ID vật phẩm có nằm trong Inventory không
                    const isOwned = userInv[val] || (userInv[itemType] && userInv[itemType][val]);

                    if (isOwned) {
                        // NẾU CÓ: Mở khóa
                        option.disabled = false;
                        option.text = option.text.replace(' 🔒 (Chưa có)', '');
                    } else {
                        // NẾU CHƯA CÓ: Khóa lại, không cho bấm
                        option.disabled = true;
                        if (!option.text.includes('🔒')) {
                            option.text = option.text + ' 🔒 (Chưa có)';
                        }
                    }
                }
            };

            // Tiến hành quét và khóa 3 mục
            lockOptions(frameSelect, 'frame');
            lockOptions(chatSelect, 'chatFrame');
            lockOptions(effectSelect, 'effect');

        } catch (e) {
            console.error("Lỗi đồng bộ vật phẩm profile:", e);
        }
    },
	
	// ==========================================
    // TRANG QUẢN TRỊ / TÚI ĐỒ (DASHBOARD)
    // ==========================================
    openDashboard() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { 
            this.openAuthModal(); 
            return this.showToast("Cần đăng nhập để vào Quản lý Tài sản!", "error"); 
        }

        // Tắt Menu sổ xuống nếu đang mở
        const drop = document.getElementById('user-menu-dropdown');
        if(drop) drop.classList.remove('active');

        // Khóa cuộn trang nền để tập trung vào Dashboard
        document.body.style.overflow = 'hidden';
        
        // Bật màn hình Dashboard
        document.getElementById('dashboard-page').style.display = 'flex';
        
        // 1. CẬP NHẬT THÔNG TIN NGƯỜI DÙNG
        const user = localStorage.getItem('haruno_user') || email.split('@')[0];
        const avatar = localStorage.getItem('haruno_avatar');
        document.getElementById('db-user-name').innerText = user;
        if(avatar) document.getElementById('db-user-avatar').src = avatar;

        const safeKey = this.getSafeKey(email);
        const uData = this.usersData[safeKey] || {};
        
        // Hiển thị huy hiệu Premium/Thường
        const isPremium = uData.isPremium ? true : false;
        const rankEl = document.getElementById('db-user-rank');
        if(isPremium) {
            rankEl.innerHTML = '<i class="fas fa-crown"></i> Tài Khoản Premium';
            rankEl.style.color = '#ffd700';
            rankEl.style.borderColor = 'rgba(255,215,0,0.5)';
            rankEl.style.background = 'rgba(255,215,0,0.1)';
        } else {
            rankEl.innerHTML = '<i class="fas fa-user"></i> Thành Viên Thường';
            rankEl.style.color = '#ccc';
            rankEl.style.borderColor = 'rgba(255,255,255,0.2)';
            rankEl.style.background = 'rgba(255,255,255,0.1)';
        }

        this.renderDashboardData();
    },

    closeDashboard() {
        document.body.style.overflow = 'auto'; // Mở lại cuộn trang
        document.getElementById('dashboard-page').style.display = 'none';
    },

    switchDbTab(tabId, element) {
        // Đổi màu nút trên Sidebar
        const menuItems = document.querySelectorAll('.db-nav-menu li');
        menuItems.forEach(item => item.classList.remove('active'));
        element.classList.add('active');

        // Chuyển Tab Content
        const tabs = document.querySelectorAll('.db-tab-content');
        tabs.forEach(tab => tab.style.display = 'none');
        document.getElementById(`db-tab-${tabId}`).style.display = 'block';
    },

    renderDashboardData() {
        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);
        
        if(db) {
            db.ref(`users/${safeUser}/coins`).on('value', snap => {
                const hcoinsEl = document.getElementById('db-total-hcoins');
                if(hcoinsEl) hcoinsEl.innerText = (snap.val() || 0).toLocaleString();
            });
        }
        
        const uData = this.usersData[safeUser] || {};
        const cmtEl = document.getElementById('db-stat-comments');
        if(cmtEl) cmtEl.innerText = uData.comments || 0;
        
        const watchlist = JSON.parse(localStorage.getItem('haruno_watchlist') || '[]');
        const watchEl = document.getElementById('db-stat-movies');
        if(watchEl) watchEl.innerText = watchlist.length;

        // TẠO THẺ KHO ĐỒ (INVENTORY) DẠNG NFT 3D
        const inventory = JSON.parse(localStorage.getItem('haruno_inventory') || '{}');
        const inventoryGrid = document.getElementById('db-inventory-items');
        if(!inventoryGrid) return;

        let itemsHtml = '';
        
        // BỘ TỪ ĐIỂN HOÀN CHỈNH TÍCH HỢP HÌNH ẢNH
        const itemDictionary = {
            '3_days': { name: 'Gói Premium (3 Ngày)', image: 'https://i.ibb.co/tqpqFvG/premium-crown.png', color: '#e67e22' },
            
            // --- CÁC HIỆU ỨNG HỒ SƠ ---
            'effect-tinhnghich': { name: 'Tinh Nghịch', image: 'https://camo.githubusercontent.com/44ef56456bf9092e7e1797b51686d0d8d724bf20d4a53ae1a91436d5b033b4bd/68747470733a2f2f63646e2e646973636f72646170702e636f6d2f6173736574732f70726f66696c655f656666656374732f656666656374732f323032332d31302d31312f70756e6b2d6769726c2f696e74726f2e706e67', color: '#e67e22', rarity: 'Sử Thi' },
            'effect-spiderman': { name: 'Spiderman', image: 'https://i.ibb.co/8D0qD6nZ/ezgif-7019d12b2bcd97e7.gif', color: '#e67e22', rarity: 'Sử Thi' },
            'effect-venom': { name: 'Venom', image: 'https://i.ibb.co/SDv0cxyN/ezgif-129f620f5f8c1991.gif', color: '#e67e22', rarity: 'Sử Thi' },
            'effect-gomah': { name: 'Gomah', image: 'https://i.ibb.co/5WdXZ5LV/ezgif-105546704f05d7b6.gif', color: '#e67e22', rarity: 'Sử Thi' },
            'effect-goku': { name: 'Goku Mini', image: 'https://i.ibb.co/XxPg8Wk0/ezgif-1e9300f69c4679a5.gif', color: '#e67e22', rarity: 'Sử Thi' },
            'effect-vegeta': { name: 'Vegeta Mini', image: 'https://i.ibb.co/Kjs8rxJm/ezgif-1e5c921f61ebbc97.gif', color: '#e67e22', rarity: 'Sử Thi' },
            'effect-piccolo': { name: 'Piccolo Mini', image: 'https://i.ibb.co/s9sGcdtj/ezgif-1f6af429c6eab985.gif', color: '#e67e22', rarity: 'Sử Thi' },
			'effect-1': { name: 'Hello Kitty', image: 'https://i.ibb.co/cK68ddk5/ezgif-5e5255d01cb7216f.gif', color: '#e67e22', rarity: "Legendary" },
            'effect-2': { name: 'Pompompurin', image: 'https://i.ibb.co/PsnXR2wy/ezgif-5ede70dcde25a82f.gif', color: '#e67e22', rarity: "Legendary" },
            'effect-3': { name: 'Cinnamoroll', image: 'https://i.ibb.co/ybftR2X/ezgif-5506e24774635a62.gif', color: '#e67e22', rarity: "Legendary" },
            'effect-4': { name: 'Kuromi x Melody', image: 'https://i.ibb.co/F46tFfqr/ezgif-574f6bdffdaf259d.gif', color: '#e67e22', rarity: "Legendary" },
            'effect-5': { name: 'LittleTwinStars', image: 'https://i.ibb.co/XfVNDk7H/ezgif-5d1cbcb7fb94860c.gif', color: '#e67e22', rarity: "Legendary" },
            'effect-6': { name: 'Chơi Trong Sân', image: 'https://i.ibb.co/SWgcXSv/ezgif-5feebf3c8a69109c.gif', color: '#e67e22', rarity: "Legendary" },
            
            // --- CÁC KHUNG AVATAR ---
            'frame-yunara': { name: 'Yunara', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_6f59e75226ea65207068cf672c35b023', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-shoto': { name: 'Shoto', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_9e815a5c371894d0ce5a15fba9cf999a', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-pandora': { name: 'Pandora', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_d2bf761ee4331af2b64ff9294ecf229f', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-shenron': { name: 'Shenron', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_3ce0ab2726378ba762fcc5318b87ee6f', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-spiderman': { name: 'Spiderman', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481384635886862397/animated', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-venom': { name: 'Venom', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481387347642810480/animated', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-ngocrong': { name: 'Ngọc Rồng', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_f1a2dc0cceccbc3da0838627460bd6ee', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-gomah': { name: 'Gomah', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_4cb3f6e0d7869b30b2ed561dd205e7f8', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-goku': { name: 'Goku Mini', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_32b48fb7742f69d1f870bccfeb42044d', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-vegeta': { name: 'Vegeta Mini', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_25e6d6c44079a0c58648295e591968b0', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-glorio': { name: 'Glorio', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_2bd0c5be907e9e41cb3bfcf54a60e03e', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-kai': { name: 'Supreme Kai Mini', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_89f8a8380086df9c310ce007fad36f33', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-piccolo': { name: 'Piccolo Mini', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_fe93404cffc76809692f753f4311234b', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-panzy': { name: 'Panzy', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_918f5d4088854a5d12cfb0e9b821396d', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-bantim': { name: 'Bắn Tim', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_aa8dcf830fe7026c422139055c58546c', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-doichan': { name: 'Đôi Chân Vỗ Nhịp', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_dce2396544ebe23aa6a5194c7d6cde94', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-um': { name: 'Ừm, Thực Ra Thì...', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_5cbb9718e2dfa11903327526d23eb0fd', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-banphim': { name: 'Anh Hùng Bàn Phím', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_03df56ee300b381fdb1368609f1d921d', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-slay': { name: 'Slay', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_853f18504364be844e95b4ad85e2a0f6', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-andam': { name: 'Muốn Ăn Đấm Không?', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_490c2310195e1403c68b73301f083929', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-ngamsao': { name: 'Ngắm Sao Lấp Lánh', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_f37320babca6e37d8392950cd1a9fc4c', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-thucan': { name: 'Thức Ăn Cho Tâm Trí', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_7864a49617b3524cf473adfd508aa651', color: '#e67e22', rarity: 'Sử Thi' },
            'frame-nani': { name: 'Khung Nani!?', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_d3f20f04744b398451686b5229505fea', color: '#e67e22', rarity: 'Sử Thi' },
			'frame-1': { name: 'Hello Kitty', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_1ab42e495777eb9e8728a6c636b0a954', color: '#e67e22', rarity: 'Legendary' },
			'frame-2': { name: 'Pompompurin', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_a16394f64b8d9fa38fa75078dc408689', color: '#e67e22', rarity: 'Legendary' },
			'frame-3': { name: 'Cinnamoroll', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_4786361f20944a2dfe2c55986ee79571', color: '#e67e22', rarity: 'Legendary' },
			'frame-4': { name: 'Pochacco', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_8dfc22a5f29064737dd2628b153da17a', color: '#e67e22', rarity: 'Legendary' },
			'frame-5': { name: 'Kuromi', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_d6b900c052726061be62b8ff4278d135', color: '#e67e22', rarity: 'Legendary' },
			'frame-6': { name: 'My Melody', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_35784f5c1ae9662eecddba177c0a21a3', color: '#e67e22', rarity: 'Legendary' },
			'frame-7': { name: 'LittleTwinStars', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_bb6cedd7a96db71ac1e3eb5392f03a0b', color: '#e67e22', rarity: 'Legendary' },
			'frame-8': { name: 'Chococat', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_ba85f37e87d48950a6cc7135c6302afb', color: '#e67e22', rarity: 'Legendary' },
			'frame-9': { name: 'Keroppi', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_451ba8354eb5749a606c8a3a89970064', color: '#e67e22', rarity: 'Legendary' },
			'frame-10': { name: 'Tuxedosam', image: 'https://cdn.discordapp.com/avatar-decoration-presets/a_ee77df4c2dc6f8aa9dc11aacc1effcd8', color: '#e67e22', rarity: 'Legendary' },
            
            // --- CÁC KHUNG CHAT (Ảnh thật từ Server của bạn) ---
            'chat-effect-1': { name: 'Người Nhện', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481388758455550114/animated', color: '#e67e22', rarity: 'Sử Thi' },
            'chat-effect-2': { name: 'Venom', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481389947515830282/animated', color: '#e67e22', rarity: 'Sử Thi' },
            'chat-effect-3': { name: 'Người Nhện vs. Venom', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1481390594810183700/animated', color: '#e67e22', rarity: 'Sử Thi' },
            'chat-effect-4': { name: 'Gomah', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655399641249/animated', color: '#e67e22', rarity: 'Sử Thi' },
            'chat-effect-5': { name: 'Vegeta Mini', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655424933978/animated', color: '#e67e22', rarity: 'Sử Thi' },
            'chat-effect-6': { name: 'Goku Mini', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655462555658/animated', color: '#e67e22', rarity: 'Sử Thi' },
            'chat-effect-7': { name: 'Ngọc Rồng', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1400163655487848501/animated', color: '#e67e22', rarity: 'Sử Thi' },
			'chat-effect-8': { name: 'Hello Kitty', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488244924066566185/animated', color: '#e67e22', rarity: 'Legendary' },
			'chat-effect-9': { name: 'Pompompurin', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245189482123364/animated', color: '#e67e22', rarity: 'Legendary' },
			'chat-effect-10': { name: 'Cinnamoroll', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245478213816320/animated', color: '#e67e22', rarity: 'Legendary' },
			'chat-effect-11': { name: 'Pochacco', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245662947475506/animated', color: '#e67e22', rarity: 'Legendary' },
			'chat-effect-12': { name: 'Kuromi x Melody', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245817364975626/animated', color: '#e67e22', rarity: 'Legendary' },
			'chat-effect-13': { name: 'Chococat', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488245996054904983/animated', color: '#e67e22', rarity: 'Legendary' },
			'chat-effect-14': { name: 'gudetama', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488246136585060452/animated', color: '#e67e22', rarity: 'Legendary' },
			'chat-effect-15': { name: 'Badtz-maru', image: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1488246309197713542/animated', color: '#e67e22', rarity: 'Legendary' }
        };

        let hasItems = false;
        for (const [key, value] of Object.entries(inventory)) {
            if (value === true) {
                hasItems = true;
                const info = itemDictionary[key] || { name: key, image: 'https://via.placeholder.com/150?text=?', color: '#aaaaaa', rarity: 'COMMON' };
                
                // HTML Thẻ NFT Mới
                itemsHtml += `
                    <div class="nft-card" style="--card-color: ${info.color}">
                        <div class="nft-content">
                            <span class="nft-qty">x1</span>
                            <div class="nft-image">
                                <img src="${info.image}" alt="${info.name}">
                            </div>
                            <div class="nft-info">
                                <h4>${info.name}</h4>
                                <p>${info.rarity}</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        if (!hasItems) {
            inventoryGrid.innerHTML = `
                <div class="nft-card locked">
                    <div class="nft-content">
                        <div class="nft-image"><i class="fas fa-ghost"></i></div>
                        <div class="nft-info">
                            <h4 style="color:#aaa;">Kho Đồ Trống</h4>
                            <p style="background:transparent; color:#666;">Chưa có vật phẩm</p>
                        </div>
                    </div>
                </div>`;
        } else {
            inventoryGrid.innerHTML = itemsHtml;
        }
    },
	
	// ==========================================
    // MINIGAME CỜ BẠC PHI HÀNH (CRASH BẢN PRO)
    // ==========================================
    crashData: {
        state: 'idle',
        bet: 0,
        currentMulti: 1.00,
        targetMulti: 1.00,
        startTime: 0,
        interval: null,
        history: [1.12, 5.45, 1.02, 12.50, 2.10] 
    },

    openCrashGame() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return this.showToast("Cần đăng nhập để bay vào vũ trụ!", "error"); }
        document.getElementById('crash-game-modal').style.display = 'flex';
        this.renderCrashHistory();
        this.resetCrashUI();
    },

    closeCrashGame() {
        if (this.crashData.state === 'playing') {
            return this.showToast("Đang bay không được nhảy dù ngang nha bro!", "warning");
        }
        document.getElementById('crash-game-modal').style.display = 'none';
    },

    resetCrashUI() {
        this.crashData.state = 'idle';
        this.crashData.currentMulti = 1.00;
        
        const screen = document.querySelector('.crash-radar-screen');
        screen.className = 'crash-radar-screen'; 
        
        const multiEl = document.getElementById('crash-multiplier');
        multiEl.innerText = '1.00x';
        multiEl.style.color = '#fff';
        multiEl.style.textShadow = '0 5px 15px rgba(0,0,0,0.8)';
        
        document.getElementById('crash-profit-preview').innerText = 'Chờ cất cánh...';
        document.getElementById('crash-profit-preview').style.color = '#888';
        
        // Trả tên lửa về vị trí xuất phát
        const rocket = document.getElementById('crash-rocket-ship');
        rocket.innerText = '🚀';
        rocket.style.transform = `translate(0px, 0px) rotate(45deg)`;
        rocket.style.opacity = '1';
        rocket.style.filter = 'drop-shadow(-5px 5px 10px rgba(255, 100, 0, 0.8))';
        
        const btn = document.getElementById('btn-crash-action');
        btn.className = 'btn-crash-pro';
        btn.disabled = false;
        btn.innerHTML = 'ĐẶT CƯỢC';
        
        document.getElementById('crash-bet-amount').disabled = false;
    },

    generateCrashPoint() {
        const e = 100; // 1% House Edge
        const h = Math.random() * 100;
        let crashPoint = Math.max(1.00, (e / (e - h)) * 0.99); 
        if (crashPoint > 1000) crashPoint = 1000;
        return Math.floor(crashPoint * 100) / 100; 
    },

    handleCrashAction() {
        if (this.crashData.state === 'idle') {
            const betInput = document.getElementById('crash-bet-amount').value;
            const betAmount = parseInt(betInput);
            if (isNaN(betAmount) || betAmount <= 0) return this.showToast("Cược không hợp lệ!", "error");

            const email = localStorage.getItem('haruno_email');
            const safeUser = this.getSafeKey(email);
            const btn = document.getElementById('btn-crash-action');

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> CHUẨN BỊ...';
            this.playSound('click');

            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: betAmount })
            }).then(res => res.json()).then(data => {
                if (!data.success) {
                    this.showToast("Cháy túi rồi, nạp thêm đi Chủ Tịch!", "error");
                    this.resetCrashUI();
                    return;
                }

                this.playSound('coin');
                this.crashData.bet = betAmount;
                this.crashData.targetMulti = this.generateCrashPoint();
                this.crashData.currentMulti = 1.00;
                this.crashData.state = 'playing';
                this.crashData.startTime = Date.now();

                document.getElementById('crash-bet-amount').disabled = true;
                document.querySelector('.crash-radar-screen').classList.add('flying');
                
                btn.disabled = false;
                btn.className = 'btn-crash-pro btn-crash-cashout';
                btn.innerHTML = `<i class="fas fa-hand-holding-usd"></i> CHỐT LỜI NGAY`;

                if(this.sounds && this.sounds.tick) {
                    this.sounds.tick.loop = true;
                    this.sounds.tick.playbackRate = 1.5;
                    this.playSound('tick');
                }

                clearInterval(this.crashData.interval);
                this.crashData.interval = setInterval(() => this.crashTick(), 50); 
            });
        } 
        else if (this.crashData.state === 'playing') {
            this.cashOutCrash();
        }
    },

    crashTick() {
        if (this.crashData.state !== 'playing') return;

        const elapsedMs = Date.now() - this.crashData.startTime;
        this.crashData.currentMulti = Math.pow(Math.E, 0.00012 * elapsedMs);
        let displayMulti = (Math.floor(this.crashData.currentMulti * 100) / 100).toFixed(2);

        if (parseFloat(displayMulti) >= this.crashData.targetMulti) {
            this.triggerCrash();
            return;
        }

        const multiEl = document.getElementById('crash-multiplier');
        multiEl.innerText = `${displayMulti}x`;
        
        // --- HIỆU ỨNG ĐỔI MÀU TEXT DẦN DẦN TĂNG ĐỘ PHẤN KHÍCH ---
        let mVal = parseFloat(displayMulti);
        if (mVal >= 10.0) { multiEl.style.color = '#ff0066'; multiEl.style.textShadow = '0 0 20px #ff0066'; }
        else if (mVal >= 5.0) { multiEl.style.color = '#FFD700'; multiEl.style.textShadow = '0 0 20px #FFD700'; }
        else if (mVal >= 2.0) { multiEl.style.color = '#00ffcc'; multiEl.style.textShadow = '0 0 20px #00ffcc'; }
        else if (mVal >= 1.5) { multiEl.style.color = '#17a2b8'; multiEl.style.textShadow = '0 0 20px #17a2b8'; }

        // --- TÊN LỬA DI CHUYỂN CHÉO ---
        // Giới hạn khung hình: ngang max 350px, dọc max 120px
        let moveX = Math.min(elapsedMs / 25, 350); 
        let moveY = Math.min(elapsedMs / 60, 120);
        document.getElementById('crash-rocket-ship').style.transform = `translate(${moveX}px, -${moveY}px) rotate(45deg)`;

        const profit = Math.floor(this.crashData.bet * displayMulti);
        document.getElementById('crash-profit-preview').innerText = `Lãi dự kiến: +${profit.toLocaleString()} HCoins`;
        document.getElementById('crash-profit-preview').style.color = '#00ffcc';
    },

    cashOutCrash() {
        clearInterval(this.crashData.interval);
        this.crashData.state = 'cashed_out';
        
        if(this.sounds && this.sounds.tick) this.sounds.tick.pause();
        this.playSound('win');

        const finalMulti = (Math.floor(this.crashData.currentMulti * 100) / 100).toFixed(2);
        const winAmount = Math.floor(this.crashData.bet * finalMulti);
        
        const screen = document.querySelector('.crash-radar-screen');
        screen.classList.remove('flying');
        screen.classList.add('cashed-out');
        document.getElementById('crash-multiplier').innerText = `${finalMulti}x`;
        document.getElementById('crash-profit-preview').innerText = `ĐÃ CHỐT: +${winAmount.toLocaleString()} HCoins`;

        const btn = document.getElementById('btn-crash-action');
        btn.disabled = true;
        btn.className = 'btn-crash-pro';
        btn.innerText = 'ĐANG CỘNG TIỀN...';

        this.showToast(`Tuyệt! Đã chốt lời ở mức ${finalMulti}x!`, "success");

        const email = localStorage.getItem('haruno_email');
        const safeUser = this.getSafeKey(email);
        
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: winAmount })
        });

        this.addToCrashHistory(finalMulti);
        setTimeout(() => this.resetCrashUI(), 3000);
    },

    triggerCrash() {
        clearInterval(this.crashData.interval);
        this.crashData.state = 'crashed';

        if(this.sounds && this.sounds.tick) this.sounds.tick.pause();
        this.playSound('fail');

        const finalMulti = this.crashData.targetMulti.toFixed(2);

        const screen = document.querySelector('.crash-radar-screen');
        screen.classList.remove('flying');
        screen.classList.add('crashed');
        
        document.getElementById('crash-multiplier').innerText = `${finalMulti}x`;
        document.getElementById('crash-profit-preview').innerText = `TÊN LỬA NỔ TUNG!`;
        document.getElementById('crash-profit-preview').style.color = '#ff3333';

        // Đổi hình tên lửa thành vụ nổ và rớt mốc tọa độ
        const rocket = document.getElementById('crash-rocket-ship');
        rocket.innerText = '💥';
        rocket.style.filter = 'drop-shadow(0 0 15px red)';

        const btn = document.getElementById('btn-crash-action');
        btn.disabled = true;
        btn.className = 'btn-crash-pro';
        btn.innerText = 'CHUYẾN BAY THẤT BẠI';

        this.showToast(`Trễ rồi! Tên lửa đã nổ ở ${finalMulti}x`, "error");
        
        this.addToCrashHistory(finalMulti);
        setTimeout(() => this.resetCrashUI(), 3000);
    },

    addToCrashHistory(multiStr) {
        const multiVal = parseFloat(multiStr);
        this.crashData.history.unshift(multiVal); 
        if (this.crashData.history.length > 5) this.crashData.history.pop(); 
        this.renderCrashHistory();
    },

    renderCrashHistory() {
        const histContainer = document.getElementById('crash-history');
        histContainer.innerHTML = '';
        this.crashData.history.forEach(m => {
            let colorClass = 'hist-low';
            if (m >= 2.0 && m < 10) colorClass = 'hist-mid';
            if (m >= 10.0) colorClass = 'hist-high';
            
            histContainer.innerHTML += `<span class="crash-hist-item ${colorClass}">${m.toFixed(2)}x</span>`;
        });
    }
};

const searchInput = document.getElementById('searchInput');
const searchDropdown = document.getElementById('search-results-dropdown');

let searchTimeout = null;
let searchAbortController = null; 
const searchCache = {}; 

if(searchInput) {
    searchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.trim();
        
        if (keyword.length < 2) { 
            searchDropdown.style.display = 'none'; 
            return; 
        }
        
        if (searchCache[keyword]) {
            searchDropdown.innerHTML = searchCache[keyword];
            searchDropdown.style.display = 'block';
            return;
        }

        searchDropdown.innerHTML = '<div class="search-no-result"><i class="fas fa-spinner fa-spin"></i> Đang tìm kiếm...</div>';
        searchDropdown.style.display = 'block';

        clearTimeout(searchTimeout);
        
        if (searchAbortController) {
            searchAbortController.abort();
        }

        searchTimeout = setTimeout(async () => {
            searchAbortController = new AbortController();
            try {
                const response = await fetch(`${API_URL}/films/search?keyword=${encodeURIComponent(keyword)}`, {
                    signal: searchAbortController.signal
                });
                
                if (!response.ok) throw new Error('Network error');
                const data = await response.json();
                const movies = app.extractItems(data);
                const topMovies = Array.isArray(movies) ? movies.slice(0, 6) : [];

                let resultHtml = '';
                if (topMovies.length > 0) {
                    resultHtml = topMovies.map(movie => {
                        const originName = movie.original_name || movie.origin_name || '';
                        return `
                        <div class="search-item" onclick="app.showMovie('${movie.slug}')">
                            <img src="${app.getImage(movie)}" alt="${movie.name}">
                            <div class="search-item-info">
                                <div class="title">${movie.name}</div>
                                <div class="sub-title">${originName} (${movie.year || 'N/A'})</div>
                            </div>
                        </div>
                    `}).join('');
                } else {
                    resultHtml = '<div class="search-no-result">Không tìm thấy phim nào...</div>';
                }
                
                searchCache[keyword] = resultHtml;
                searchDropdown.innerHTML = resultHtml;

            } catch (error) { 
                if (error.name !== 'AbortError') {
                    searchDropdown.innerHTML = '<div class="search-no-result">Lỗi kết nối hoặc không tìm thấy...</div>';
                }
            }
        }, 300); 
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) { searchDropdown.style.display = 'none'; }
    const notifDrop = document.getElementById('notif-dropdown');
    if (notifDrop && !e.target.closest('.notif-wrapper')) { notifDrop.classList.remove('active'); }
    
    const userMenuDrop = document.getElementById('user-menu-dropdown');
    if (userMenuDrop && !e.target.closest('.auth-area')) { userMenuDrop.classList.remove('active'); }
});

const authInputs = ['setup-username'];
authInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                app.saveProfile();
            }
        });
    }
});

const commentInputs = [
    { id: 'comment-text-movie', type: 'movie' },
    { id: 'comment-text-review', type: 'review' }
];
commentInputs.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
        el.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); 
                app.postComment(item.type);
            }
        });
    }
});

window.addEventListener('scroll', () => {
    const btn = document.getElementById('back-to-top');
    if (window.scrollY > 300) {
        btn.classList.add('show');
    } else {
        btn.classList.remove('show');
    }
});

app.initPlayer(); 
app.initLazyLoad();

app.checkUpdateModal();
app.openAdPopup();
app.initTopMovies(); 
app.renderHistory(); 
app.renderWatchlist(); 

const urlParams = new URLSearchParams(window.location.search);
const sharedMovie = urlParams.get('phim');
const roomCode = urlParams.get('room');

if (sharedMovie) {
    app.showMovie(sharedMovie);
} else {
    app.initHero();
    app.initCollections();
    app.renderMovies();
}

// ==========================================
// HỆ THỐNG TRỢ LÝ ẢO (TINH LINH HARU) - BẢN THÔNG MINH (V3)
// ==========================================
const assistant = {
    isOpen: false,
    autoTimer: null,
    roamTimer: null,
    isDragging: false,
    isMoved: false,
    typingTimer: null,
    
    // Các biến cho tính năng mới
    pokeCount: 0,
    pokeResetTimer: null,
    idleTimer: null,

    tips: {
        home: [
            { text: "Hôm nay không biết xem gì ư? Để Haru chọn bừa một phim siêu hay cho bạn nhé!", actions: [{ label: "🎲 Chọn Phim Ngẫu Nhiên", func: "app.randomMovie()" }] },
            { text: "Rất nhiều phim chiếu rạp mới được cập nhật đó. Bạn đã xem qua chưa?", actions: [{ label: "🔥 Xem Phim Mới", func: "document.getElementById('movie-grid').scrollIntoView({behavior: 'smooth'})" }] },
            { text: "Đừng quên đăng nhập để lưu lại phim yêu thích và nhận huy hiệu xịn xò nha!", actions: [{ label: "🔑 Đăng nhập ngay", func: "app.openAuthModal()" }] },
            { text: "Bạn có biết HCoins có thể đổi được quà xịn không? Vào Cửa Hàng xem thử đi!", actions: [{ label: "🛒 Đi chợ nào", func: "app.openShop()" }] },
			{ text: "Chán xem phim rồi thì mình chơi một ván minigame kiếm HCoins không?", actions: [{ label: "🎮 Chơi luôn", func: "assistant.startGame()" }] }
        ],
        movie: [
            { text: "Phim này trông có vẻ cuốn đấy! Bật chế độ Tắt Đèn để trải nghiệm rạp chiếu tại nhà nhé.", actions: [{ label: "💡 Tắt Đèn Nhé", func: "app.toggleCinemaMode()" }] },
            { text: "Nếu thấy phim hay, đừng ngần ngại cho phim 5 sao và để lại bình luận phía dưới nha!", actions: [{ label: "⭐ Kéo xuống đánh giá", func: "document.getElementById('movie-stars').scrollIntoView({behavior: 'smooth', block: 'center'})" }] },
            { text: "Bạn muốn xem cùng bạn bè? Gửi link chia sẻ cho họ ngay thôi!", actions: [{ label: "🔗 Chia sẻ phim", func: "app.openShareModal()" }] },
			{ text: "Chán xem phim rồi thì mình chơi một ván minigame kiếm HCoins không?", actions: [{ label: "🎮 Chơi luôn", func: "assistant.startGame()" }] }
        ],
        review: [
            { text: "Chào mừng bạn đến với Góc Cộng Đồng! Hãy giữ thái độ hòa nhã khi trò chuyện nhé.", actions: [{ label: "💬 Bắt đầu nhắn tin", func: "document.getElementById('comment-text-review').focus()" }] },
            { text: "Chăm chỉ bình luận ở đây sẽ giúp bạn leo lên Bảng Xếp Hạng đó!", actions: [{ label: "🏆 Xem Bảng Xếp Hạng", func: "app.openLeaderboard()" }] },
			{ text: "Chán xem phim rồi thì mình chơi một ván minigame kiếm HCoins không?", actions: [{ label: "🎮 Chơi luôn", func: "assistant.startGame()" }] }
        ]
    },

    init() {
        setTimeout(() => this.suggest(), 6000);
        setInterval(() => {
            if(!this.isOpen) this.suggest();
        }, 120000); 
        this.initMovement();
        this.setupIdleTracking(); // Bật tính năng theo dõi AFK
    },

    // Lấy lời chào theo thời gian và tên người dùng
    getGreeting() {
        const hour = new Date().getHours();
        let name = "bạn";
        
        // Kiểm tra xem đã đăng nhập chưa để lấy tên
        const userStr = localStorage.getItem('haruno_user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                if (user && user.username) name = user.username;
            } catch(e) {}
        }
        
        let timeStr = "Chào";
        if (hour >= 5 && hour < 11) timeStr = "Buổi sáng tốt lành";
        else if (hour >= 11 && hour < 14) timeStr = "Trưa rồi, nghỉ ngơi xíu đi";
        else if (hour >= 14 && hour < 18) timeStr = "Buổi chiều năng suất nha";
        else if (hour >= 18 && hour < 22) timeStr = "Buổi tối vui vẻ nhé";
        else timeStr = "Khuya rồi, đừng thức muộn quá nhé";

        return `${timeStr} ${name}!`;
    },

    // Tính năng: Nhắc nhở khi người dùng treo máy (AFK)
    setupIdleTracking() {
        const resetIdle = () => {
            clearTimeout(this.idleTimer);
            this.idleTimer = setTimeout(() => {
                if (!this.isOpen) {
                    this.suggest({
                        text: "Bạn đi đâu rồi? Haru đợi nãy giờ chán quá à... Quay lại xem phim đi!",
                        actions: [{ label: "Mình đây!", func: "assistant.hide()" }]
                    });
                }
            }, 60000); // 3 phút không thao tác sẽ gọi
        };

        // Lắng nghe thao tác chuột, phím, cuộn trang
        window.addEventListener('mousemove', resetIdle);
        window.addEventListener('keydown', resetIdle);
        window.addEventListener('scroll', resetIdle);
        window.addEventListener('click', resetIdle);
        window.addEventListener('touchstart', resetIdle);
        resetIdle();
    },

    initMovement() {
        const el = document.getElementById('haru-assistant');
        const sprite = document.querySelector('.haru-sprite');
        const bubble = document.getElementById('haru-bubble');
        if (!el || !sprite) return;

        let offsetX, offsetY, startX, startY;

        const startDrag = (e) => {
            this.isDragging = true;
            this.isMoved = false;
            el.style.transition = 'none';
            clearTimeout(this.roamTimer);
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            startX = clientX; startY = clientY;
            const rect = el.getBoundingClientRect();
            offsetX = clientX - rect.left;
            offsetY = clientY - rect.top;
        };

        const doDrag = (e) => {
            if (!this.isDragging) return;
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            if (Math.abs(clientX - startX) > 5 || Math.abs(clientY - startY) > 5) this.isMoved = true;
            if (this.isMoved) {
                e.preventDefault();
                let newLeft = Math.max(0, Math.min(clientX - offsetX, window.innerWidth - el.offsetWidth));
                let newTop = Math.max(0, Math.min(clientY - offsetY, window.innerHeight - el.offsetHeight));
                
                // CẬP NHẬT: Tránh khuất chữ. Nếu kéo tinh linh quá sát mép trên màn hình (< 180px)
                // thì tự động lật khung chat xuống dưới chân!
                if (newTop < 180) {
                    el.classList.add('flip-down');
                } else {
                    el.classList.remove('flip-down');
                }
                
                el.style.left = `${newLeft}px`;
                el.style.top = `${newTop}px`;
                el.style.bottom = 'auto';
            }
        };

        const stopDrag = () => {
            if (this.isDragging) {
                this.isDragging = false;
                el.style.transition = 'top 4s ease-in-out, left 4s ease-in-out';
                this.autoRoam();
            }
        };

        sprite.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', doDrag, { passive: false });
        document.addEventListener('mouseup', stopDrag);
        sprite.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('touchmove', doDrag, { passive: false });
        document.addEventListener('touchend', stopDrag);
        this.autoRoam();
    },

    autoRoam() {
        clearTimeout(this.roamTimer);
        return;
    },

    toggle() {
        if (this.isMoved) return; // Đang kéo thì không mở

        // Tính năng: Chọc ghẹo (Click liên tục 5 lần)
        this.pokeCount++;
        clearTimeout(this.pokeResetTimer);
        this.pokeResetTimer = setTimeout(() => { this.pokeCount = 0; }, 1500); // 1.5s ko bấm sẽ reset đếm

        if (this.pokeCount >= 5) {
            this.pokeCount = 0; // Reset
            const sprite = document.querySelector('.haru-sprite');
            sprite.classList.add('dizzy');
            setTimeout(() => sprite.classList.remove('dizzy'), 1500); // Ngừng chóng mặt sau 1.5s
            
            this.suggest({
                text: "Ui da! Bạn chọc Haru chóng mặt quá! Quay mòng mòng rồi @@",
                actions: [{ label: "Xin lỗi bé", func: "assistant.hide()" }]
            });
            return;
        }

        this.isOpen ? this.hide() : this.suggest();
    },

    hide() {
        const bubble = document.getElementById('haru-bubble');
        if(bubble) bubble.classList.remove('show');
        this.isOpen = false;
        clearInterval(this.typingTimer);
        clearTimeout(this.autoTimer);
    },

    suggest(customTip = null) {
        const bubble = document.getElementById('haru-bubble');
        const textEl = document.getElementById('haru-text');
        const actionsEl = document.getElementById('haru-actions');
        if(!bubble || !textEl || !actionsEl) return;

        let finalTip;
        const email = localStorage.getItem('haruno_email');
        
        // Tỉ lệ rớt quà 10% (Chỉ khi đã đăng nhập và không phải tip do user chủ động click)
        const isLucky = Math.random() < 0.1;

        if (!customTip && email && isLucky) {
            finalTip = {
                text: "🎁 Tèn ten! Haru vừa dọn kho và nhặt được một túi HCoins nè. Tặng bạn lấy thảo nhé!",
                actions: [{ label: "💰 Nhận 20 HCoins", func: "assistant.claimGift()" }]
            };
        } else if (customTip) {
            finalTip = customTip;
        } else {
            let currentContext = 'home';
            if (typeof app !== 'undefined') {
                if (app.currentMovieSlug === 'goc-review') currentContext = 'review';
                else if (app.currentMovieSlug) currentContext = 'movie';
            }

            let availableTips = this.tips[currentContext] || [];
            if (email && currentContext === 'home') {
                availableTips = availableTips.filter(tip => !tip.text.includes("đăng nhập"));
            }

            if (availableTips.length === 0) return;

            const randomTip = availableTips[Math.floor(Math.random() * availableTips.length)];
            let textToSay = randomTip.text;
            if (currentContext === 'home') textToSay = this.getGreeting() + " " + textToSay;
            finalTip = { text: textToSay, actions: randomTip.actions };
        }

        bubble.classList.add('show');
        this.isOpen = true;
        actionsEl.classList.remove('show-actions');
        
        // Xử lý render nút bấm (ĐÃ SỬA LỖI KHÔNG HIỆN GAME)
        actionsEl.innerHTML = finalTip.actions.map(act => {
            const isSpecial = act.label.includes('Nhận') || act.label.includes('Chơi');
            
            // Kiểm tra: Nếu là hành động chơi game thì KHÔNG tự động ẩn Haru
            let clickAction = act.func;
            if (!clickAction.includes('startGame') && !clickAction.includes('playRPS')) {
                // Chỉ thêm lệnh ẩn nếu trong func chưa có lệnh hide
                if (!clickAction.includes('assistant.hide()')) {
                    clickAction += '; assistant.hide()';
                }
            }

            return `<button class="${isSpecial ? 'special-btn' : ''}" onclick="${clickAction}">${act.label}</button>`;
        }).join('');

        this.typeWriter(textEl, finalTip.text, () => {
            actionsEl.classList.add('show-actions');
            clearTimeout(this.autoTimer);
            this.autoTimer = setTimeout(() => this.hide(), 12000); 
        });
    },
	
	// HÀM: XỬ LÝ CỘNG COINS KHI NHẬN QUÀ (ĐÃ FIX LỖI KHÔNG CỘNG TIỀN)
    claimGift() {
        const email = localStorage.getItem('haruno_email');
        if (email) {
            const safeUser = app.getSafeKey(email);
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                // Đổi action thành 'minigameResult' để cộng 20 HCoins an toàn
                body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: 20 })
            }).then(() => app.showToast("🎉 Haru đã gửi tặng bạn 20 HCoins!", "success"));
        }
    },

    // HÀM: KHỞI ĐỘNG OẲN TÙ TÌ
    startGame() {
        if(this.setEmotion) this.setEmotion('happy');
        this.suggest({
            text: "Chơi oẳn tù tì với Haru không? Thắng được 10 HCoins, thua bị trừ 5 HCoins nha! Bạn ra gì nào?",
            actions: [
                { label: "✌️ Kéo", func: "assistant.playRPS('keo')" },
                { label: "✊ Búa", func: "assistant.playRPS('bua')" },
                { label: "🖐️ Bao", func: "assistant.playRPS('bao')" },
                { label: "❌ Sợ thua thì thôi", func: "assistant.hide()" }
            ]
        });
    },

    // HÀM: XỬ LÝ THẮNG THUA VÀ CỘNG/TRỪ TIỀN
    playRPS(userChoice) {
        const choices = ['keo', 'bua', 'bao'];
        const haruChoice = choices[Math.floor(Math.random() * choices.length)];
        let result = '';
        let coinDiff = 0;

        if (userChoice === haruChoice) {
            result = 'Hòa rồi! Trái tim tương thông ghê 🤝';
        } else if (
            (userChoice === 'keo' && haruChoice === 'bao') ||
            (userChoice === 'bua' && haruChoice === 'keo') ||
            (userChoice === 'bao' && haruChoice === 'bua')
        ) {
            result = 'Bạn thắng rồi! Haru tặng bạn 10 HCoins nhé 🎉';
            coinDiff = 10;
        } else {
            result = 'Haru thắng nha! Ble ble 😜 Bị trừ 5 HCoins ráng chịu!';
            coinDiff = -5;
            if(this.setEmotion) this.setEmotion('dizzy');
        }

        const email = localStorage.getItem('haruno_email');
        if (email && coinDiff !== 0) {
            const safeUser = app.getSafeKey(email);
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'playRPS', safeKey: safeUser, coinDiff: coinDiff })
            });
        } else if (!email) {
            result += ' (Bạn chưa đăng nhập nên không được cộng/trừ HCoins đâu nha)';
        }

        const haruIcon = haruChoice === 'keo' ? '✌️' : haruChoice === 'bua' ? '✊' : '🖐️';
        this.suggest({
            text: `Haru ra ${haruIcon}! ${result}`,
            actions: [
                { label: "🔄 Chơi lại", func: "assistant.startGame()" }, 
                { label: "🛑 Nghỉ ngơi", func: "assistant.hide()" }
            ]
        });
    },

    typeWriter(element, text, callback) {
    element.textContent = ''; // Đổi thành textContent
    clearInterval(this.typingTimer);
    element.classList.add('is-typing');
    let i = 0;
    this.typingTimer = setInterval(() => {
        if (i < text.length) {
            // Đổi thành textContent để chống XSS an toàn tuyệt đối
            element.textContent = text.substring(0, i + 1);
            i++;
        } else {
            clearInterval(this.typingTimer);
            element.classList.remove('is-typing');
            if (callback) callback();
        }
    }, 35); 
  }
};

    // ==========================================
// TÍNH NĂNG DÒ MÌN CỔ ĐIỂN (CLASSIC MINESWEEPER)
// ==========================================
app.msData = { 
    playing: false, bet: 0, 
    rows: 8, cols: 8, totalMines: 10, multiplier: 2,
    grid: [], revealed: 0, flags: 0, 
    firstClick: true, currentMode: 'dig' // 'dig' hoặc 'flag'
};

// THÊM MỚI: Bảng tra cứu cấu hình độ khó
    app.msLevels = {
        easy:   { rows: 8,  cols: 8,  mines: 10, multiplier: 2 },
        medium: { rows: 10, cols: 10, mines: 20, multiplier: 4 },
        hard:   { rows: 12, cols: 12, mines: 35, multiplier: 6 },
		legend: { rows: 15, cols: 15, mines: 60, multiplier: 50 }
    };
	
	// THÊM MỚI: Hàm thay đổi độ khó khi người dùng chọn Dropdown
    app.changeMsDifficulty = function() {
        if (this.msData.playing) return; // Đang chơi thì không cho đổi
        const level = document.getElementById('ms-difficulty').value;
        const config = this.msLevels[level];
        
        this.msData.rows = config.rows;
        this.msData.cols = config.cols;
        this.msData.totalMines = config.mines;
        this.msData.multiplier = config.multiplier;
        
        this.renderMsGrid(true); // Vẽ lại bảng trống theo kích thước mới
    };

app.openMinesweeper = function() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { 
            this.openAuthModal(); 
            return this.showToast("Bạn cần đăng nhập để chơi Dò Mìn!", "error"); 
        }
        document.getElementById('minesweeper-modal').style.display = 'flex';
        if (!this.msData.playing) {
            this.changeMsDifficulty(); // Lấy độ khó hiện tại trên giao diện để vẽ bảng
        }
    };

app.closeMinesweeper = function() {
    if (this.msData.playing) {
        return this.showToast("Bạn đang trong ván! Mở hết mìn để nhận thưởng nhé!", "warning");
    }
    document.getElementById('minesweeper-modal').style.display = 'none';
};

app.toggleMsMode = function() {
    const btn = document.getElementById('ms-mode-btn');
    if (this.msData.currentMode === 'dig') {
        this.msData.currentMode = 'flag';
        btn.innerHTML = '<i class="fas fa-flag"></i> CẮM CỜ';
        btn.style.background = 'rgba(255, 77, 77, 0.2)';
        btn.style.color = '#ff4d4d';
        btn.style.borderColor = '#ff4d4d';
    } else {
        this.msData.currentMode = 'dig';
        btn.innerHTML = '<i class="fas fa-hammer"></i> ĐÀO MÌN';
        btn.style.background = '#2a2a2a';
        btn.style.color = '#fff';
        btn.style.borderColor = '#555';
    }
};

app.startMinesweeper = function() {
    if (this.msData.playing) return;
    const email = localStorage.getItem('haruno_email');
    if (!email) return;
    
    const betAmount = parseInt(document.getElementById('ms-bet-amount').value);
    const safeUser = this.getSafeKey(email);
    const userBalance = this.usersData[safeUser]?.coins || 0;

    if (isNaN(betAmount) || betAmount < 50) return this.showToast("Tối thiểu phải cược 50 HCoins", "error");
    if (userBalance < betAmount) return this.showToast("Ví của bạn không đủ HCoins!", "error");

    // ĐÃ FIX: Dùng deductMinigameFee để trừ tiền chuẩn xác, nếu thành công mới cho chơi
    fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: betAmount })
    })
    .then(res => res.json())
    .then(data => {
        if (!data.success) {
            return this.showToast("Trừ tiền thất bại, ví không đủ HCoins!", "error");
        }

        // Bắt đầu game sau khi đã trừ tiền cược
        this.msData.playing = true;
        this.msData.bet = betAmount;
        this.msData.revealed = 0;
        this.msData.flags = 0;
        this.msData.firstClick = true;
        this.msData.currentMode = 'dig';
        this.msData.grid = [];

        for(let r = 0; r < this.msData.rows; r++) {
            let row = [];
            for(let c = 0; c < this.msData.cols; c++) {
                row.push({ isMine: false, neighborMines: 0, isRevealed: false, isFlagged: false });
            }
            this.msData.grid.push(row);
        }

        document.getElementById('ms-bet-area').style.display = 'none';
        document.getElementById('ms-playing-area').style.display = 'block';
        document.getElementById('ms-flags-left').innerText = this.msData.totalMines;
        
        document.getElementById('ms-win-prize').innerText = (betAmount * this.msData.multiplier);
        
        const btnMode = document.getElementById('ms-mode-btn');
        btnMode.innerHTML = '<i class="fas fa-hammer"></i> ĐÀO MÌN';
        btnMode.style.background = '#2a2a2a';
        btnMode.style.color = '#fff';
        btnMode.style.borderColor = '#555';

        this.renderMsGrid(false);
    });
};

// Đảm bảo hàm renderMsGrid vẫn sử dụng CSS Variable như cũ
app.renderMsGrid = function(isEmpty) {
    const grid = document.getElementById('minesweeper-grid');
    grid.innerHTML = '';
    
    // Luôn cập nhật số cột động để CSS tự chia lưới
    grid.style.setProperty('--ms-cols', this.msData.cols); 
    
    for(let r = 0; r < this.msData.rows; r++) {
        for(let c = 0; c < this.msData.cols; c++) {
            let cell = document.createElement('div');
            cell.className = 'ms-cell';
            cell.id = `ms-cell-${r}-${c}`;
            
            // Nếu là độ khó Legend, mình có thể thêm hiệu ứng đỏ nhẹ cho ô
            if(this.msData.multiplier === 50) {
                cell.style.borderColor = 'rgba(255, 0, 0, 0.2)';
            }

            if (!isEmpty) {
                cell.onclick = () => {
                    if (this.msData.currentMode === 'flag') this.flagMsCell(r, c);
                    else this.clickMsCell(r, c);
                };
            }
            grid.appendChild(cell);
        }
    }
};

app.generateMsMines = function(firstR, firstC) {
    let minesPlaced = 0;
    while (minesPlaced < this.msData.totalMines) {
        let r = Math.floor(Math.random() * this.msData.rows);
        let c = Math.floor(Math.random() * this.msData.cols);
        // Đảm bảo lượt bấm đầu tiên luôn là ô trống (không có mìn)
        if ((r !== firstR || c !== firstC) && !this.msData.grid[r][c].isMine) {
            this.msData.grid[r][c].isMine = true;
            minesPlaced++;
        }
    }
    
    // Tính số mìn xung quanh mỗi ô
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (let r = 0; r < this.msData.rows; r++) {
        for (let c = 0; c < this.msData.cols; c++) {
            if (this.msData.grid[r][c].isMine) continue;
            let count = 0;
            for (let d of dirs) {
                let nr = r + d[0], nc = c + d[1];
                if (nr >= 0 && nr < this.msData.rows && nc >= 0 && nc < this.msData.cols) {
                    if (this.msData.grid[nr][nc].isMine) count++;
                }
            }
            this.msData.grid[r][c].neighborMines = count;
        }
    }
};

app.clickMsCell = function(r, c) {
    if (!this.msData.playing) return;
    let cellObj = this.msData.grid[r][c];
    
    if (cellObj.isRevealed || cellObj.isFlagged) return; // Không đào ô đã mở hoặc cắm cờ

    // Lượt mở đầu tiên: Sinh mìn sau khi bấm để không bao giờ chết ngay lượt đầu
    if (this.msData.firstClick) {
        this.generateMsMines(r, c);
        this.msData.firstClick = false;
    }

    // Nếu đạp trúng mìn -> THUA
    if (cellObj.isMine) {
        let cellEl = document.getElementById(`ms-cell-${r}-${c}`);
        cellEl.classList.add('mine');
        cellEl.innerHTML = '<i class="fas fa-bomb"></i>';
        this.endMinesweeper(false);
        return;
    }

    // Nếu an toàn -> Mở ô (Mở lan truyền nếu là ô số 0)
    this.floodFillMs(r, c);
    
    // Kiểm tra ĐIỀU KIỆN THẮNG (Mở toàn bộ số ô không phải mìn)
    if (this.msData.revealed === (this.msData.rows * this.msData.cols - this.msData.totalMines)) {
        this.cashoutMinesweeper();
    }
};

app.floodFillMs = function(r, c) {
    if (r < 0 || r >= this.msData.rows || c < 0 || c >= this.msData.cols) return;
    let cellObj = this.msData.grid[r][c];
    
    if (cellObj.isRevealed || cellObj.isFlagged || cellObj.isMine) return;
    
    cellObj.isRevealed = true;
    this.msData.revealed++;
    
    let cellEl = document.getElementById(`ms-cell-${r}-${c}`);
    cellEl.classList.add('revealed');
    
    // Nếu ô có số mìn kế bên -> Hiện số và dừng lây lan
    if (cellObj.neighborMines > 0) {
        cellEl.innerHTML = cellObj.neighborMines;
        cellEl.classList.add(`ms-num-${cellObj.neighborMines}`);
        return;
    }
    
    // Nếu là ô trống (0 mìn kế bên) -> Lây lan ra 8 hướng xung quanh
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (let d of dirs) {
        this.floodFillMs(r + d[0], c + d[1]);
    }
};

app.flagMsCell = function(r, c) {
    if (!this.msData.playing) return;
    let cellObj = this.msData.grid[r][c];
    if (cellObj.isRevealed) return; // Không thể cắm cờ ô đã mở

    let cellEl = document.getElementById(`ms-cell-${r}-${c}`);
    
    if (cellObj.isFlagged) {
        // Gỡ cờ
        cellObj.isFlagged = false;
        cellEl.classList.remove('flagged');
        cellEl.innerHTML = '';
        this.msData.flags--;
    } else {
        // Chỉ cắm cờ nếu chưa xài hết cờ
        if (this.msData.flags < this.msData.totalMines) {
            cellObj.isFlagged = true;
            cellEl.classList.add('flagged');
            cellEl.innerHTML = '<i class="fas fa-flag"></i>';
            this.msData.flags++;
        }
    }
    
    // Cập nhật số cờ còn lại lên UI
    document.getElementById('ms-flags-left').innerText = (this.msData.totalMines - this.msData.flags);
};

app.cashoutMinesweeper = function() {
        this.msData.playing = false;
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        
        // CẬP NHẬT LẤY HỆ SỐ NHÂN MỚI
        const winAmount = this.msData.bet * this.msData.multiplier; 
        
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: winAmount })
        });
        
        this.showToast(`✨ TUYỆT VỜI! Bạn phá đảo Dò Mìn và nhận được ${winAmount} HCoins!`, "success");
        
        for(let r = 0; r < this.msData.rows; r++) {
            for(let c = 0; c < this.msData.cols; c++) {
                if (this.msData.grid[r][c].isMine) {
                    let cellEl = document.getElementById(`ms-cell-${r}-${c}`);
                    cellEl.innerHTML = '<i class="fas fa-bomb" style="color:#00ffcc;"></i>';
                }
            }
        }
        
        setTimeout(() => {
            document.getElementById('ms-bet-area').style.display = 'block';
            document.getElementById('ms-playing-area').style.display = 'none';
            this.changeMsDifficulty(); // Làm mới lại bảng
        }, 4000);
    };

app.endMinesweeper = function(isWin) {
    this.msData.playing = false;
    
    // Lật toàn bộ các bãi mìn lên khi người chơi đạp trúng
    for(let r = 0; r < this.msData.rows; r++) {
        for(let c = 0; c < this.msData.cols; c++) {
            let cellObj = this.msData.grid[r][c];
            let cellEl = document.getElementById(`ms-cell-${r}-${c}`);
            
            if (cellObj.isMine && !cellObj.isFlagged) {
                cellEl.classList.add('revealed');
                if(!cellEl.innerHTML.includes('bomb')) {
                    cellEl.innerHTML = '<i class="fas fa-bomb" style="color: #ff4d4d; opacity: 0.7;"></i>';
                }
            } else if (!cellObj.isMine && cellObj.isFlagged) {
                // Cắm cờ sai
                cellEl.innerHTML = '<i class="fas fa-times" style="color: #ff4d4d;"></i>';
            }
        }
    }
    
    this.showToast("BÙM! Bạn đạp phải mìn rồi. Thử lại ván khác nhé!", "error");
    
    setTimeout(() => {
        document.getElementById('ms-bet-area').style.display = 'block';
        document.getElementById('ms-playing-area').style.display = 'none';
        this.changeMsDifficulty(); 
    }, 3000);
};

// ==========================================
// TÍNH NĂNG CỜ VUA ONLINE (CHESS MULTIPLAYER)
// ==========================================
app.chessRoomId = null;
app.chessMyColor = null; 
app.chessLogic = null;
app.chessSelectedSq = null;
app.chessGameStatus = 'waiting'; 
app.chessLastMove = null; 
app.chessTimerInterval = null; 

app.playChessSound = function(type) {
    let src = type === 'capture' 
        ? 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3' 
        : 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3';
    let audio = new Audio(src);
    audio.play().catch(e => console.log("Lỗi âm thanh:", e));
};

app.formatChessTime = function(seconds) {
    let m = Math.floor(seconds / 60);
    let s = seconds % 60;
    return `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
};

app.openChessLobby = function() {
    const email = localStorage.getItem('haruno_email');
    if (!email) { this.openAuthModal(); return this.showToast("Cần đăng nhập!", "error"); }
    document.getElementById('chess-lobby-modal').style.display = 'flex';
    this.listenChessRooms();
};

app.closeChessLobby = function() {
    document.getElementById('chess-lobby-modal').style.display = 'none';
    if (db) db.ref('chess_rooms').orderByChild('status').equalTo('waiting').off();
};

app.listenChessRooms = function() {
    if (!db) return;
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    const query = db.ref('chess_rooms').orderByChild('status').equalTo('waiting');
    query.off();
    
    query.on('value', snap => {
        const listEl = document.getElementById('chess-room-list');
        listEl.innerHTML = '';
        if (!snap.exists()) {
            listEl.innerHTML = '<div style="color: #888; text-align: center; padding: 20px; font-style: italic;">Chưa có cao thủ nào tạo bàn. Hãy là người đầu tiên!</div>';
            return;
        }

        snap.forEach(child => {
            const room = child.val();
            const roomId = child.key;
            
            if (room.connections && room.connections[room.player1] === false) {
                db.ref(`chess_rooms/${roomId}`).remove(); return;
            }

            if (room.player1 === safeUser) {
                listEl.innerHTML += `
                    <div class="chess-room-card" style="border-color: #ffd700;">
                        <div>
                            <div style="color: #ffd700; font-weight: 800; font-size: 15px; margin-bottom: 4px;">Phòng của bạn (Đang đợi...)</div>
                            <div style="font-size: 13px; color: #aaa;"><i class="fas fa-coins" style="color: #ffd700;"></i> Cược: ${room.bet} HCoins</div>
                        </div>
                        <button onclick="app.exitChessStuckRoom('${roomId}', ${room.bet})" style="padding: 8px 20px; background: rgba(255, 77, 77, 0.1); color: #ff4d4d; border: 1px solid #ff4d4d; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; font-family: inherit;">
                            HỦY
                        </button>
                    </div>`;
            } else {
                listEl.innerHTML += `
                    <div class="chess-room-card">
                        <div>
                            <div style="color: #fff; font-weight: 800; font-size: 15px; margin-bottom: 4px;">Phòng của ${room.player1.split('_')[0]}</div>
                            <div style="font-size: 13px; color: #00ffcc;"><i class="fas fa-coins"></i> Cược: ${room.bet} HCoins</div>
                        </div>
                        <button onclick="app.joinChessRoom('${roomId}', ${room.bet})" style="padding: 8px 20px; background: #00ffcc; color: #000; border: none; border-radius: 8px; font-weight: 900; cursor: pointer; transition: 0.2s; font-family: inherit;">
                            VÀO ĐẤU
                        </button>
                    </div>`;
            }
        });
    });
};

app.exitChessStuckRoom = function(roomId, bet) {
    if(db) db.ref(`chess_rooms/${roomId}`).remove().then(() => {
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: bet }) });
        this.showToast("Đã hủy và hoàn tiền!", "success");
    });
};

app.createChessRoom = function() {
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    const bet = parseInt(document.getElementById('chess-bet-amount').value);
    if (isNaN(bet) || bet < 50) return this.showToast("Cược tối thiểu 50!", "error");

    fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: bet }) }).then(r=>r.json()).then(data => {
        if (!data.success) return this.showToast("Không đủ HCoins!", "error");
        
        const newRoomRef = db.ref('chess_rooms').push();
        this.chessLogic = new Chess(); 
        
        newRoomRef.set({
            player1: safeUser, player2: '', bet: bet, 
            status: 'waiting', fen: this.chessLogic.fen(), turn: 'w',
            whitePlayer: safeUser, 
            connections: { [safeUser]: true },
            whiteTime: 600, blackTime: 600,
            lastMoveTime: Date.now(), drawOffer: null
        });
        
        newRoomRef.child(`connections/${safeUser}`).onDisconnect().set(false);
        this.chessRoomId = newRoomRef.key;
        this.enterChessGameUI(bet * 2);
    });
};

// 🌟 TÍNH NĂNG MỚI: TẠO PHÒNG ĐÁNH VỚI BOT
app.createChessBotRoom = function() {
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    const bet = parseInt(document.getElementById('chess-bet-amount').value);
    if (isNaN(bet) || bet < 50) return this.showToast("Cược tối thiểu 50!", "error");

    fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: bet }) }).then(r=>r.json()).then(data => {
        if (!data.success) return this.showToast("Không đủ HCoins!", "error");
        
        const newRoomRef = db.ref('chess_rooms').push();
        this.chessLogic = new Chess(); 
        
        newRoomRef.set({
            player1: safeUser, player2: 'BOT', bet: bet, 
            status: 'playing', fen: this.chessLogic.fen(), turn: 'w',
            whitePlayer: safeUser, // Ván 1 mình cầm Trắng
            connections: { [safeUser]: true, 'BOT': true },
            whiteTime: 600, blackTime: 600,
            lastMoveTime: Date.now(), drawOffer: null
        });
        
        newRoomRef.child(`connections/${safeUser}`).onDisconnect().set(false);
        this.chessRoomId = newRoomRef.key;
        this.enterChessGameUI(bet * 2);
    });
};

// ========================================================
// 🌟 TÍNH NĂNG MỚI: AI CỜ VUA SIÊU THÔNG MINH (MINIMAX + PST)
// ========================================================
app.isBotThinking = false;

// Bảng giá trị sức mạnh của từng quân cờ
app.pieceValues = { 'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000 };

// Bảng vị trí (Piece-Square Tables) - Giúp Bot biết cách dàn trận, chiếm trung tâm
app.pst = {
    'p': [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5,  5, 10, 25, 25, 10,  5,  5],
        [0,  0,  0, 20, 20,  0,  0,  0],
        [5, -5,-10,  0,  0,-10, -5,  5],
        [5, 10, 10,-20,-20, 10, 10,  5],
        [0,  0,  0,  0,  0,  0,  0,  0]
    ],
    'n': [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
    ],
    'b': [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
    ],
    'r': [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [0,  0,  0,  5,  5,  0,  0,  0]
    ],
    'q': [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [-5,  0,  5,  5,  5,  5,  0, -5],
        [0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
    ],
    'k': [ // Đầu game, Vua nên lùi về sau và nhập thành
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [20, 20,  0,  0,  0,  0, 20, 20],
        [20, 30, 10,  0,  0, 10, 30, 20]
    ]
};

// Hàm chấm điểm bàn cờ
app.evaluateBoard = function(game, botColor) {
    let score = 0;
    const board = game.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let piece = board[r][c];
            if (piece) {
                let isWhite = piece.color === 'w';
                let val = this.pieceValues[piece.type];
                // Lấy điểm vị trí (Quân trắng đọc xuôi, đen đọc ngược từ dưới lên)
                let pstVal = isWhite ? this.pst[piece.type][r][c] : this.pst[piece.type][7-r][c];
                
                if (isWhite) {
                    score += val + pstVal;
                } else {
                    score -= val + pstVal;
                }
            }
        }
    }
    // Nếu bot là trắng thì điểm càng dương càng tốt, đen thì điểm càng âm càng tốt
    return botColor === 'w' ? score : -score;
};

// Thuật toán Minimax + Cắt tỉa Alpha-Beta để tiên đoán nước đi
app.minimax = function(game, depth, alpha, beta, isMaximizingPlayer, botColor) {
    if (depth === 0 || game.game_over()) {
        return this.evaluateBoard(game, botColor);
    }

    let moves = game.moves();
    
    // Tối ưu tốc độ: Ưu tiên duyệt các nước "ăn quân" trước để Alpha-Beta cắt tỉa nhanh hơn
    moves.sort((a, b) => (a.includes('x') ? -1 : 1) - (b.includes('x') ? -1 : 1));

    if (isMaximizingPlayer) {
        let bestVal = -Infinity;
        for (let i = 0; i < moves.length; i++) {
            game.move(moves[i]);
            let val = this.minimax(game, depth - 1, alpha, beta, false, botColor);
            game.undo();
            bestVal = Math.max(bestVal, val);
            alpha = Math.max(alpha, bestVal);
            if (beta <= alpha) break; // Cắt tỉa (Pruning)
        }
        return bestVal;
    } else {
        let bestVal = Infinity;
        for (let i = 0; i < moves.length; i++) {
            game.move(moves[i]);
            let val = this.minimax(game, depth - 1, alpha, beta, true, botColor);
            game.undo();
            bestVal = Math.min(bestVal, val);
            beta = Math.min(beta, bestVal);
            if (beta <= alpha) break; // Cắt tỉa (Pruning)
        }
        return bestVal;
    }
};

// Hàm ra quyết định chính của Bot
app.makeChessBotMove = function() {
    if (!this.chessRoomId || this.chessGameStatus !== 'playing') return;
    
    let moves = this.chessLogic.moves({ verbose: true });
    if (moves.length === 0) return;

    let bestMove = null;
    let bestValue = -Infinity;
    let botColor = this.chessLogic.turn();
    
    // ĐỘ SÂU TÌM KIẾM (DEPTH): 
    // Mức 3: Đủ thông minh để đánh bại người chơi nghiệp dư (Tốc độ load nhanh).
    // Nếu muốn bot "vô đối", hãy tăng lên 4 (Nhưng sẽ tốn vài giây suy nghĩ mỗi bước).
    let depth = 3; 

    // Tìm nước đi tốt nhất
    for (let i = 0; i < moves.length; i++) {
        this.chessLogic.move(moves[i]);
        // Tới lượt giả định của người chơi (min phase)
        let boardValue = this.minimax(this.chessLogic, depth - 1, -Infinity, Infinity, false, botColor);
        this.chessLogic.undo();

        if (boardValue > bestValue) {
            bestValue = boardValue;
            bestMove = moves[i];
        }
    }

    // Fallback: Lỡ kẹt cờ không tìm ra nước tối ưu thì đánh ngẫu nhiên 1 nước để không bị đứng game
    if (!bestMove) {
        bestMove = moves[Math.floor(Math.random() * moves.length)];
    }

    // Thời gian Bot giả vờ suy nghĩ (Từ 0.5s đến 1.5s)
    let thinkTime = Math.random() * 1000 + 500;

    setTimeout(() => {
        if (this.chessGameStatus !== 'playing') return;
        let moveRes = this.chessLogic.move(bestMove);
        if (moveRes) {
            this.playChessSound(moveRes.captured ? 'capture' : 'move');
            this.updateChessFirebase(moveRes);
            this.isBotThinking = false;
        }
    }, thinkTime);
};

app.joinChessRoom = function(roomId, bet) {
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    
    db.ref(`chess_rooms/${roomId}`).once('value').then(snap => {
        const room = snap.val();
        if(!room || room.status !== 'waiting' || room.player1 === safeUser) return this.showToast("Phòng không hợp lệ!", "error");

        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: bet }) }).then(r=>r.json()).then(data => {
            if (!data.success) return this.showToast("Không đủ HCoins!", "error");
            
            db.ref(`chess_rooms/${roomId}`).update({ 
                player2: safeUser, status: 'playing', [`connections/${safeUser}`]: true,
                lastMoveTime: Date.now() 
            });
            db.ref(`chess_rooms/${roomId}/connections/${safeUser}`).onDisconnect().set(false);
            
            this.chessRoomId = roomId;
            this.chessLogic = new Chess();
            this.enterChessGameUI(bet * 2);
        });
    });
};

app.enterChessGameUI = function(pot) {
    this.closeChessLobby();
    document.getElementById('chess-game-modal').style.display = 'flex';
    document.getElementById('chess-pot').innerText = pot;
    this.listenChessGame();
};

app.getChessIcon = function(type) {
    const map = { 'k':'fa-chess-king', 'q':'fa-chess-queen', 'r':'fa-chess-rook', 'b':'fa-chess-bishop', 'n':'fa-chess-knight', 'p':'fa-chess-pawn' };
    return `<i class="fas ${map[type]}"></i>`;
};

app.renderChessBoard = function() {
    const boardEl = document.getElementById('chess-board');
    boardEl.innerHTML = '';
    const boardArray = this.chessLogic.board(); 
    const files = ['a','b','c','d','e','f','g','h'];
    
    let possibleMoves = [];
    if (this.chessSelectedSq) {
        possibleMoves = this.chessLogic.moves({ square: this.chessSelectedSq, verbose: true });
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let renderR = this.chessMyColor === 'b' ? 7 - r : r;
            let renderC = this.chessMyColor === 'b' ? 7 - c : c;

            let rank = 8 - renderR;
            let file = files[renderC];
            let square = file + rank;

            let piece = boardArray[renderR][renderC];
            let isLight = (renderR + renderC) % 2 === 0;

            let cell = document.createElement('div');
            cell.className = `chess-cell ${isLight ? 'light' : 'dark'}`;
            cell.dataset.sq = square;

            if (this.chessSelectedSq === square) cell.classList.add('selected');

            if (this.chessLastMove && (square === this.chessLastMove.from || square === this.chessLastMove.to)) {
                cell.classList.add('last-move'); 
            }

            let moveObj = possibleMoves.find(m => m.to === square);
            if (moveObj) {
                if (piece) cell.classList.add('valid-capture');
                else cell.classList.add('valid-move');
            }

            if (piece) {
                let iconHtml = this.getChessIcon(piece.type);
                cell.innerHTML = `<span class="chess-piece piece-${piece.color}">${iconHtml}</span>`;
            }

            cell.onclick = () => this.handleChessClick(square);
            boardEl.appendChild(cell);
        }
    }
};

app.handleChessClick = function(square) {
    if (!this.chessRoomId || !this.chessLogic) return;
    if (this.chessGameStatus !== 'playing') {
        if (this.chessGameStatus === 'waiting') this.showToast("Vui lòng chờ đối thủ vào phòng mới có thể đi!", "warning");
        return;
    }
    
    if (this.chessLogic.turn() !== this.chessMyColor) return;

    if (this.chessSelectedSq) {
        let piece = this.chessLogic.get(this.chessSelectedSq);
        let isPromotion = false;
        
        if (piece && piece.type === 'p') {
            let targetRank = square.charAt(1);
            if ((piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1')) {
                let possibleMoves = this.chessLogic.moves({ verbose: true });
                let validPromotions = possibleMoves.filter(m => m.from === this.chessSelectedSq && m.to === square);
                if (validPromotions.length > 0) isPromotion = true;
            }
        }

        if (isPromotion) {
            this.showPromotionUI(this.chessSelectedSq, square);
            return;
        }

        let move = this.chessLogic.move({ from: this.chessSelectedSq, to: square });
        if (move) {
            this.chessSelectedSq = null;
            this.playChessSound(move.captured ? 'capture' : 'move'); 
            this.updateChessFirebase(move);
            return;
        }
    }

    let piece = this.chessLogic.get(square);
    if (piece && piece.color === this.chessMyColor) {
        this.chessSelectedSq = square;
        this.renderChessBoard(); 
    } else {
        this.chessSelectedSq = null;
        this.renderChessBoard();
    }
};

app.showPromotionUI = function(fromSq, toSq) {
    this.chessGameStatus = 'promoting'; 
    const board = document.getElementById('chess-board');
    
    let promoDiv = document.createElement('div');
    promoDiv.id = 'chess-promo-modal';
    promoDiv.style = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(20,20,20,0.95); padding:15px; border-radius:12px; z-index:100; display:flex; gap:10px; border:2px solid #00ffcc; box-shadow: 0 0 20px rgba(0,0,0,0.8); backdrop-filter: blur(5px);";
    
    const pieces = ['q', 'r', 'b', 'n'];
    const colorClass = this.chessMyColor === 'w' ? 'piece-w' : 'piece-b';
    
    promoDiv.innerHTML = pieces.map(p => `
        <div class="chess-cell light" style="width:50px; height:50px; display:flex; justify-content:center; align-items:center; cursor:pointer; border-radius:8px; border: 1px solid #444;" onclick="app.executePromotion('${fromSq}', '${toSq}', '${p}')">
            <span class="chess-piece ${colorClass}" style="font-size:30px;">${this.getChessIcon(p)}</span>
        </div>
    `).join('');
    
    board.appendChild(promoDiv);
};

app.executePromotion = function(fromSq, toSq, promoPiece) {
    const promoModal = document.getElementById('chess-promo-modal');
    if (promoModal) promoModal.remove();
    
    let move = this.chessLogic.move({ from: fromSq, to: toSq, promotion: promoPiece });
    if (move) {
        this.chessSelectedSq = null;
        this.chessGameStatus = 'playing'; 
        this.playChessSound('move'); 
        this.updateChessFirebase(move);
    }
};

app.resignChessGame = function() {
    if (!this.chessRoomId || this.chessGameStatus !== 'playing') return;
    if (!confirm("Bạn có chắc chắn muốn ĐẦU HÀNG?")) return;
    
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    db.ref(`chess_rooms/${this.chessRoomId}`).once('value').then(snap => {
        let room = snap.val();
        let winner = room.player1 === safeUser ? room.player2 : room.player1;
        
        db.ref(`chess_rooms/${this.chessRoomId}`).update({
            status: 'finished', winner: winner, reason: 'Đối thủ Đầu Hàng'
        });
        if (winner !== 'BOT') fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: winner, amount: room.bet * 2 }) });
    });
};

app.offerChessDraw = function() {
    if (!this.chessRoomId || this.chessGameStatus !== 'playing') return;
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    
    db.ref(`chess_rooms/${this.chessRoomId}`).once('value').then(snap => {
        let room = snap.val();
        if (room.player2 === 'BOT') {
            app.acceptChessDraw(); // Trí khôn BOT: luôn chấp nhận xin hòa!
        } else {
            db.ref(`chess_rooms/${this.chessRoomId}`).update({ drawOffer: safeUser });
            this.showToast("Đã gửi lời mời Hòa cờ!", "info");
        }
    });
};

app.acceptChessDraw = function() {
    if (!this.chessRoomId) return;
    db.ref(`chess_rooms/${this.chessRoomId}`).once('value').then(snap => {
        let room = snap.val();
        db.ref(`chess_rooms/${this.chessRoomId}`).update({
            status: 'finished', winner: 'draw', reason: 'Hai bên thỏa thuận Hòa', drawOffer: null
        });
        if (room.player1 !== 'BOT') fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: room.player1, amount: room.bet }) });
        if (room.player2 !== 'BOT') fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: room.player2, amount: room.bet }) });
    });
};

app.updateChessFirebase = function(lastMove) {
    db.ref(`chess_rooms/${this.chessRoomId}`).once('value').then(snap => {
        let room = snap.val();
        let safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        let now = Date.now();
        
        let elapsed = Math.floor((now - (room.lastMoveTime || now)) / 1000);
        let wTime = room.whiteTime;
        let bTime = room.blackTime;
        if (room.turn === 'w') wTime = Math.max(0, wTime - elapsed);
        else bTime = Math.max(0, bTime - elapsed);
        
        let updates = { 
            fen: this.chessLogic.fen(), turn: this.chessLogic.turn(),
            whiteTime: wTime, blackTime: bTime, lastMoveTime: now, drawOffer: null
        };
        if (lastMove) updates.lastMove = lastMove; 
        
        let winnerColor = this.chessLogic.turn() === 'w' ? 'b' : 'w'; 
        let winnerKey = winnerColor === 'w' ? room.whitePlayer : (room.whitePlayer === room.player1 ? room.player2 : room.player1);

        if (this.chessLogic.in_checkmate()) {
            updates.status = 'finished'; updates.winner = winnerKey; updates.reason = 'Chiếu Tướng (Checkmate)';
            if (winnerKey !== 'BOT') fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: winnerKey, amount: room.bet * 2 }) });
        } else if (this.chessLogic.in_draw() || this.chessLogic.in_stalemate() || this.chessLogic.in_threefold_repetition()) {
            updates.status = 'finished'; updates.winner = 'draw'; updates.reason = 'Hòa Cờ';
            if (room.player1 !== 'BOT') fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: room.player1, amount: room.bet }) });
            if (room.player2 !== 'BOT') fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: room.player2, amount: room.bet }) });
        }

        db.ref(`chess_rooms/${this.chessRoomId}`).update(updates);
    });
};

app.listenChessGame = function() {
    if (!db || !this.chessRoomId) return;
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));

    db.ref(`chess_rooms/${this.chessRoomId}`).on('value', snap => {
        const room = snap.val();
        if (!room) {
            if (document.getElementById('chess-game-modal').style.display === 'flex') {
                app.showToast("Bàn chơi đã bị hủy!", "warning");
                document.getElementById('chess-game-modal').style.display = 'none';
            }
            return;
        }
        
        if (this.chessGameStatus !== 'promoting') this.chessGameStatus = room.status;
        this.chessMyColor = (safeUser === room.whitePlayer) ? 'w' : 'b';

        if (room.status === 'playing' && room.connections) {
            if (room.connections[safeUser] === false) {
                db.ref(`chess_rooms/${this.chessRoomId}/connections/${safeUser}`).set(true);
                db.ref(`chess_rooms/${this.chessRoomId}/connections/${safeUser}`).onDisconnect().set(false);
            }
            const otherPlayer = (room.player1 === safeUser) ? room.player2 : room.player1;
            if (otherPlayer !== 'BOT' && room.connections[otherPlayer] === false) {
                if (!app.chessDisconnectTimer) {
                    app.showToast("⏳ Đối thủ mất mạng. Chờ tối đa 10 giây...", "warning");
                    app.chessDisconnectTimer = setTimeout(() => {
                        db.ref(`chess_rooms/${this.chessRoomId}`).once('value').then(latestSnap => {
                            if (latestSnap.val()?.connections?.[otherPlayer] === false) {
                                fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: room.bet * 2 }) });
                                db.ref(`chess_rooms/${this.chessRoomId}`).update({ status: 'finished', winner: safeUser, reason: 'Đối thủ bỏ chạy' });
                            }
                        });
                        app.chessDisconnectTimer = null;
                    }, 10000);
                }
            } else {
                if (app.chessDisconnectTimer) { clearTimeout(app.chessDisconnectTimer); app.chessDisconnectTimer = null; }
            }
        }

        if (app.chessTimerInterval) clearInterval(app.chessTimerInterval);
        let wT = room.whiteTime;
        let bT = room.blackTime;
        
        if (room.status === 'playing') {
            app.chessTimerInterval = setInterval(() => {
                let elapsed = Math.floor((Date.now() - room.lastMoveTime) / 1000);
                let curW = room.turn === 'w' ? Math.max(0, wT - elapsed) : wT;
                let curB = room.turn === 'b' ? Math.max(0, bT - elapsed) : bT;
                
                let elW = document.getElementById('chess-timer-w');
                let elB = document.getElementById('chess-timer-b');
                if(elW) { elW.innerText = app.formatChessTime(curW); elW.className = curW <= 60 ? 'chess-timer timer-danger' : 'chess-timer'; }
                if(elB) { elB.innerText = app.formatChessTime(curB); elB.className = curB <= 60 ? 'chess-timer timer-danger' : 'chess-timer'; }

                if (curW === 0 || curB === 0) {
                    clearInterval(app.chessTimerInterval);
                    let winnerColor = curW === 0 ? 'b' : 'w';
                    let winnerKey = winnerColor === 'w' ? room.whitePlayer : (room.whitePlayer === room.player1 ? room.player2 : room.player1);
                    
                    if (safeUser === winnerKey && winnerKey !== 'BOT') {
                        db.ref(`chess_rooms/${app.chessRoomId}`).update({ status: 'finished', winner: winnerKey, reason: 'Hết thời gian' });
                        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: winnerKey, amount: room.bet * 2 }) });
                    }
                }
            }, 1000);
        } else {
            let elW = document.getElementById('chess-timer-w');
            let elB = document.getElementById('chess-timer-b');
            if(elW) elW.innerText = app.formatChessTime(wT);
            if(elB) elB.innerText = app.formatChessTime(bT);
        }

        if (!this.chessLogic) this.chessLogic = new Chess();
        this.chessLastMove = room.lastMove; 
        
        if (room.lastMove && this.chessLogic.fen() !== room.fen) {
            let moveRes = this.chessLogic.move(room.lastMove);
            if (!moveRes) this.chessLogic.load(room.fen); 
            if (room.turn === this.chessMyColor) this.playChessSound(room.lastMove.captured ? 'capture' : 'move'); 
        } else if (!room.lastMove && this.chessLogic.fen() !== room.fen) {
            this.chessLogic.load(room.fen); 
        }
        
        this.renderChessBoard();

        if (room.drawOffer && room.drawOffer !== safeUser && room.status === 'playing') {
            const oppName = room.drawOffer.split('_')[0];
            const accept = confirm(`${oppName} muốn xin HÒA. Bạn có đồng ý không?`);
            if (accept) app.acceptChessDraw();
            else {
                db.ref(`chess_rooms/${this.chessRoomId}`).update({ drawOffer: null });
                app.showToast("Đã từ chối lời mời hòa!", "info");
            }
        }

        // 🌟 TÍNH NĂNG MỚI: TÙY CHỈNH AVATAR VÀ TÊN CHO BOT
        const updatePlayerUI = (playerKey, isWhite) => {
            const pData = playerKey ? (this.usersData[playerKey] || {}) : {};
            const pName = playerKey === 'BOT' ? '🤖 Máy (Bot)' : (pData.displayName || (playerKey ? playerKey.split('_')[0] : 'Đang chờ...'));
            const pAvatar = playerKey === 'BOT' ? 'https://opgg-static.akamaized.net/meta/images/lol/16.7.1/champion/Ryze.png?image=c_crop,h_103,w_103,x_9,y_9/q_auto:good,f_webp,w_160,h_160&v=1607' : (pData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=waiting`);
            const elPrefix = isWhite ? 'w' : 'b';
            
            document.getElementById(`chess-name-${elPrefix}`).innerText = pName;
            const wrapEl = document.getElementById(`avatar-chess-${elPrefix}-wrap`);
            
            let isPremium = pData.isPremium ? true : false;
            let rankClass = isPremium && playerKey !== 'BOT' ? 'premium' : '';
            let frameHtml = (isPremium && playerKey !== 'BOT' && pData.avatarFrame && pData.avatarFrame !== 'none') ? `<div class="avatar-frame ${pData.avatarFrame}"></div>` : '';
            
            wrapEl.className = `comment-avatar ${rankClass}`;
            wrapEl.style = "width: 40px; height: 40px; border-radius: 50%;";
            wrapEl.innerHTML = `<img src="${pAvatar}" style="border: 2px solid ${isWhite?'#fff':'#333'}; width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">${frameHtml}`;
        };

        if (this.chessMyColor === 'w') {
            updatePlayerUI(room.whitePlayer, true); 
            updatePlayerUI((room.whitePlayer === room.player1) ? room.player2 : room.player1, false); 
        } else {
            updatePlayerUI((room.whitePlayer === room.player1) ? room.player2 : room.player1, false); 
            updatePlayerUI(room.whitePlayer, true); 
        }

        const statusEl = document.getElementById('chess-status');
        const rematchBtn = document.getElementById('btn-chess-rematch');
        const waitingOverlay = document.getElementById('chess-waiting-overlay');
        
        if (room.status === 'waiting') {
            if (waitingOverlay) waitingOverlay.style.display = 'flex';
            const roomIdText = document.getElementById('chess-room-id-text');
            if (roomIdText) roomIdText.innerText = this.chessRoomId.substring(1, 6);
            
            statusEl.innerText = "Đang chờ đối thủ vào phòng...";
            statusEl.style.color = "#fff";
            rematchBtn.style.display = 'none';
        } else if (room.status === 'finished') {
            if (waitingOverlay) waitingOverlay.style.display = 'none';
            
            let winName = room.winner;
            if (winName && winName !== 'draw') {
                winName = winName === 'BOT' ? 'MÁY (BOT)' : ((this.usersData[room.winner]?.displayName) || room.winner.split('_')[0]);
            }
            
            if (room.winner === 'draw') statusEl.innerText = `🤝 HÒA CỜ! (${room.reason})`;
            else statusEl.innerText = `🏆 KẾT THÚC! ${winName.toUpperCase()} THẮNG! (${room.reason})`;
            
            statusEl.style.color = "#ffd700";
            rematchBtn.style.display = 'block';
            
            if (room.rematch && room.rematch[safeUser]) {
                rematchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG CHỜ ĐỐI THỦ...';
                rematchBtn.style.opacity = '0.7';
            } else {
                rematchBtn.innerHTML = `<i class="fas fa-redo"></i> CHƠI LẠI (${room.bet} HCoins)`;
                rematchBtn.style.opacity = '1';
            }

            if (room.rematch && room.rematch[room.player1] && room.rematch[room.player2]) {
                if (safeUser === room.player1) {
                    let newChess = new Chess();
                    let nextWhite = room.whitePlayer === room.player1 ? room.player2 : room.player1; 
                    
                    db.ref(`chess_rooms/${this.chessRoomId}`).update({
                        status: 'playing', fen: newChess.fen(), turn: 'w',
                        winner: null, reason: null, rematch: null, lastMove: null, drawOffer: null,
                        whitePlayer: nextWhite, whiteTime: 600, blackTime: 600, lastMoveTime: Date.now()
                    });
                }
            }

        } else {
            if (waitingOverlay) waitingOverlay.style.display = 'none';
            
            let isMyTurn = room.turn === this.chessMyColor;
            statusEl.innerText = isMyTurn ? "🔥 TỚI LƯỢT BẠN ĐI!" : "⏳ Đang chờ đối thủ suy nghĩ...";
            statusEl.style.color = isMyTurn ? "#00ffcc" : "#ff9800";
            rematchBtn.style.display = 'none';
            
            if (this.chessLogic.in_check()) {
                statusEl.innerText += " (⚠️ BỊ CHIẾU TƯỚNG)";
                statusEl.style.color = "#ff4d4d";
            }
            
            // 🌟 TÍNH NĂNG MỚI: GỌI LỆNH ĐỂ BOT ĐÁNH
            if (!isMyTurn && room.player2 === 'BOT') {
                if (!app.isBotThinking) {
                    app.isBotThinking = true;
                    app.makeChessBotMove();
                }
            }
        }
    });
};

app.exitChessGame = function() {
    if (this.chessRoomId && db) {
        const curRoom = this.chessRoomId;
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));

        db.ref(`chess_rooms/${curRoom}`).onDisconnect().cancel();
        db.ref(`chess_rooms/${curRoom}`).off(); 
        
        db.ref(`chess_rooms/${curRoom}`).once('value').then(snap => {
            const room = snap.val();
            if(room) {
                if (room.status === 'waiting') {
                    db.ref(`chess_rooms/${curRoom}`).remove();
                    if (room.player1 === safeUser) {
                        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: safeUser, amount: room.bet }) });
                    }
                } else if (room.status === 'finished') {
                    const otherPlayer = (room.player1 === safeUser) ? room.player2 : room.player1;
                    if (room.rematch && room.rematch[otherPlayer] && otherPlayer !== 'BOT') {
                        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: otherPlayer, amount: room.bet }) });
                    }
                    db.ref(`chess_rooms/${curRoom}`).remove();
                } else if (room.status === 'playing') {
                    const winner = (room.player1 === safeUser) ? room.player2 : room.player1;
                    if (winner !== 'BOT') fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'minigameResult', safeKey: winner, amount: room.bet * 2 }) });
                    db.ref(`chess_rooms/${curRoom}`).update({ status: 'finished', winner: winner, reason: 'Đối thủ đầu hàng/thoát' });
                }
            }
        });
    }
    document.getElementById('chess-game-modal').style.display = 'none';
    if (app.chessTimerInterval) clearInterval(app.chessTimerInterval); 
    this.chessRoomId = null; 
};

// 🌟 TÍNH NĂNG MỚI: CHƠI LẠI TRỰC TIẾP VỚI BOT MÀ KHÔNG CẦN CHỜ NÓ ĐỒNG Ý
app.requestChessRematch = function() {
    if (!this.chessRoomId) return;
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));

    db.ref(`chess_rooms/${this.chessRoomId}`).once('value').then(snap => {
        const room = snap.val();
        if (!room || room.status !== 'finished') return;

        fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: room.bet }) }).then(r=>r.json()).then(data => {
            if (!data.success) return this.showToast("Bạn không đủ HCoins!", "error");
            
            if (room.player2 === 'BOT') {
                let newChess = new Chess();
                let nextWhite = room.whitePlayer === room.player1 ? 'BOT' : room.player1; 
                db.ref(`chess_rooms/${this.chessRoomId}`).update({
                    status: 'playing', fen: newChess.fen(), turn: 'w',
                    winner: null, reason: null, rematch: null, lastMove: null, drawOffer: null,
                    whitePlayer: nextWhite, whiteTime: 600, blackTime: 600, lastMoveTime: Date.now()
                });
            } else {
                db.ref(`chess_rooms/${this.chessRoomId}/rematch/${safeUser}`).set(true);
            }
        });
    });
};

/* ========================================= HARUNO MUSIC PLAYER V2.1 ========================================= */
app.musicData = {
    player: null,
    isPlaying: false,
    currentVideoId: null,
    progressInterval: null,
    playlist: [], 
    isLoop: false
};

const MUSIC_WORKER_URL = "https://laytenbaihatvatenkenh.thienbm101102.workers.dev"; 

app.initYoutubeApi = function() {
    if (window.YT) return;
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
};

window.onYouTubeIframeAPIReady = function() {
    app.musicData.player = new YT.Player('youtube-player', {
        height: '1px', width: '1px',
        videoId: '',
        playerVars: { 
            'playsinline': 1, 'controls': 0, 'disablekb': 1, 
            'rel': 0, 'modestbranding': 1, 'iv_load_policy': 3, 'autoplay': 1 
        },
        events: {
            'onReady': (e) => app.changeVolume(30),
            'onStateChange': (e) => app.onPlayerStateChange(e)
        }
    });
};

app.onPlayerStateChange = function(event) {
    const playPauseBtn = document.getElementById('music-play-pause-btn');
    const artwork = document.getElementById('artwork-wrapper');
    const visualizer = document.getElementById('music-visualizer');

    if (event.data === -1) { app.musicData.player.playVideo(); }

    if (event.data === YT.PlayerState.PLAYING) {
        app.musicData.isPlaying = true;
        if(playPauseBtn) playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        if(artwork) artwork.classList.remove('paused');
        if(visualizer) visualizer.classList.remove('paused');
        app.startProgressInterval();
    } 
    else if (event.data === YT.PlayerState.ENDED) {
        app.stopProgressInterval();
        
        // FIX LỖI LOOP: Phải tua về 0 giây (seekTo) thì Youtube mới chịu phát lại
        if (app.musicData.isLoop) {
            app.musicData.player.seekTo(0, true);
            app.musicData.player.playVideo(); 
        } else {
            app.nextTrack(); 
        }
    }
    else { 
        app.musicData.isPlaying = false;
        if(playPauseBtn) playPauseBtn.innerHTML = '<i class="fas fa-play" style="margin-left:3px;"></i>';
        if(artwork) artwork.classList.add('paused');
        if(visualizer) visualizer.classList.add('paused');
        app.stopProgressInterval();
    }
};

app.loadYoutubeVideo = async function() {
    const linkInput = document.getElementById('youtube-link-input');
    const url = linkInput.value.trim();
    if (!url) return this.showToast("Vui lòng dán link YouTube!", "error");

    const addBtn = document.querySelector('.add-btn');
    if(addBtn) addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const isPlaylist = url.includes('list=');
    if (isPlaylist) {
        this.showToast("Đang trích xuất toàn bộ Playlist...", "info");
    } else {
        this.showToast("Đang tải bài hát...", "info");
    }

    try {
        const res = await fetch(`${MUSIC_WORKER_URL}?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        
        if (Array.isArray(data)) {
            if (data.length === 0) throw new Error("Playlist trống");
            data.forEach((track, index) => {
                if (index === 0 && !this.musicData.isPlaying && !this.musicData.currentVideoId) {
                    this.playTrack(track);
                } else {
                    this.musicData.playlist.push(track);
                }
            });
            this.showToast(`Đã thêm ${data.length} bài từ Playlist!`, "success");
        } 
        else {
            const videoId = this.extractVideoId(url) || data.id;
            const track = {
                id: videoId,
                title: data.title || "Video không tên",
                author: data.author || "YouTube Artist",
                thumb: data.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
            };

            if (this.musicData.isPlaying || this.musicData.currentVideoId) {
                this.musicData.playlist.push(track);
                this.showToast("Đã thêm vào hàng chờ!", "success");
            } else {
                this.playTrack(track);
            }
        }
        
        this.renderPlaylist();
    } catch (e) {
        this.showToast("Lỗi! Hãy chắc chắn link không ở chế độ riêng tư.", "error");
    }
    
    linkInput.value = ''; 
    if(addBtn) addBtn.innerHTML = '<i class="fas fa-arrow-right"></i>';
};

app.playTrack = function(track) {
    if (!track || !track.id) return;
    this.musicData.currentVideoId = track.id;
    if (this.musicData.player && typeof this.musicData.player.loadVideoById === 'function') {
        this.musicData.player.loadVideoById(track.id);
    }
    
    document.getElementById('music-title').innerText = track.title;
    document.getElementById('music-channel').innerText = track.author;
    document.getElementById('music-thumbnail').src = track.thumb;
    
    this.renderPlaylist();
};

app.nextTrack = function() {
    if (this.musicData.playlist.length > 0) {
        const nextTrack = this.musicData.playlist.shift();
        this.playTrack(nextTrack);
    } else {
        this.resetMusicPlayer();
        this.showToast("Đã hết danh sách chờ!", "info");
    }
};

app.prevTrack = function() {
    // Nếu bài đang phát được hơn 3 giây, nút "Prev" sẽ tua lại từ đầu bài
    if (this.musicData.player && this.musicData.currentVideoId) {
        const currentTime = this.musicData.player.getCurrentTime();
        if (currentTime > 3) {
            this.musicData.player.seekTo(0, true);
        } else {
            this.showToast("Lịch sử bài hát đang được cập nhật!", "info");
        }
    }
};

app.toggleLoop = function() {
    this.musicData.isLoop = !this.musicData.isLoop;
    const loopBtn = document.getElementById('btn-loop');
    if(loopBtn) {
        if (this.musicData.isLoop) loopBtn.classList.add('active');
        else loopBtn.classList.remove('active');
    }
    this.showToast(this.musicData.isLoop ? "Đã bật lặp lại 1 bài" : "Đã tắt lặp lại", "success");
};

app.resetMusicPlayer = function() {
    if (this.musicData.player) this.musicData.player.stopVideo();
    this.musicData.isPlaying = false;
    this.musicData.currentVideoId = null;
    this.musicData.playlist = [];
    
    document.getElementById('music-title').innerText = "Chưa có bài hát nào";
    document.getElementById('music-channel').innerText = "Hãy thêm nhạc vào danh sách";
    document.getElementById('music-progress-bar').style.width = '0%';
    document.getElementById('time-current').innerText = "0:00";
    document.getElementById('time-total').innerText = "0:00";
    
    // reset visualizer đĩa xoay: tạm dừng và quay về mặc định
    document.getElementById('artwork-wrapper').classList.add('paused'); /* Quan trọng để dừng hoạt ảnh CSS */
    
    // Tải lại nhãn đĩa mặc định
    document.getElementById('music-thumbnail').src = "https://i.ibb.co/spBmZxnJ/Gemini-Generated-Image-4lhxf64lhxf64lhx.png";
    
    this.renderPlaylist();
};

app.renderPlaylist = function() {
    const container = document.getElementById('playlist-items');
    const countEl = document.getElementById('playlist-count');
    if(countEl) countEl.innerText = this.musicData.playlist.length;
    
    if (!container) return;

    if (this.musicData.playlist.length === 0) {
        container.innerHTML = '<div class="empty-state" style="text-align:center; padding: 20px; color: rgba(255,255,255,0.3); font-size:13px;">Hàng chờ đang trống</div>';
        return;
    }

    container.innerHTML = this.musicData.playlist.map((track, index) => `
        <div class="pl-item" onclick="app.playFromPlaylist(${index})">
            <img src="${track.thumb}" alt="Thumb">
            <div class="pl-info">
                <h4>${track.title}</h4>
                <p>${track.author}</p>
            </div>
            <button class="pl-remove" onclick="event.stopPropagation(); app.removeFromPlaylist(${index})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
};

app.playFromPlaylist = function(index) {
    const track = this.musicData.playlist.splice(index, 1)[0];
    this.playTrack(track);
};

app.removeFromPlaylist = function(index) {
    this.musicData.playlist.splice(index, 1);
    this.renderPlaylist();
};

app.clearPlaylist = function() {
    if(!confirm("Bạn có chắc chắn muốn xóa toàn bộ hàng chờ?")) return;
    this.musicData.playlist = [];
    this.renderPlaylist();
    this.showToast("Đã xóa sạch hàng chờ!", "success");
};

app.controlMusic = function(action) {
    if (!this.musicData.player || !this.musicData.currentVideoId) return;
    if (action === 'toggle') {
        if (this.musicData.isPlaying) this.musicData.player.pauseVideo();
        else this.musicData.player.playVideo();
    }
};

app.changeVolume = function(value) {
    if (this.musicData.player) this.musicData.player.setVolume(value);
};

app.formatTime = function(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
};

app.startProgressInterval = function() {
    this.stopProgressInterval();
    this.musicData.progressInterval = setInterval(() => {
        if (!this.musicData.player || !this.musicData.isPlaying) return;
        try {
            const current = this.musicData.player.getCurrentTime();
            const duration = this.musicData.player.getDuration();
            if (duration > 0) {
                document.getElementById('music-progress-bar').style.width = (current / duration * 100) + '%';
                document.getElementById('time-current').innerText = app.formatTime(current);
                document.getElementById('time-total').innerText = app.formatTime(duration);
            }
        } catch(e){}
    }, 1000);
};

app.stopProgressInterval = function() {
    if (this.musicData.progressInterval) clearInterval(this.musicData.progressInterval);
};

app.seekMusic = function(event) {
    if (!this.musicData.player || !this.musicData.currentVideoId) return;
    const container = document.getElementById('progress-container');
    const clickX = event.offsetX;
    const width = container.clientWidth;
    const duration = this.musicData.player.getDuration();
    
    const seekTo = (clickX / width) * duration;
    this.musicData.player.seekTo(seekTo, true);
};

app.extractVideoId = function(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return (match && match[1]) ? match[1] : null;
};

/* --- TÍCH HỢP QUẢN LÝ MODAL & FIREBASE BẤT TỬ --- */
app.openMusicModal = function() {
    const email = localStorage.getItem('haruno_email');
    if (!email) return this.showToast("Đăng nhập để nghe nhạc nhé!", "error");
    
    const modal = document.getElementById('music-modal');
    if(modal) {
        modal.style.display = 'flex'; // Dùng lại display:flex an toàn hơn classList.add('open') nếu chưa config CSS
        modal.classList.add('open');
    }
    
    if (!this.musicData.currentVideoId && this.musicData.playlist.length === 0) {
        this.loadSavedPlaylist();
    }
};

app.closeMusicModal = function() {
    const modal = document.getElementById('music-modal');
    if(modal) {
        modal.style.display = 'none';
        modal.classList.remove('open');
    }
};

app.savePlaylistToFirebase = function() {
    const email = localStorage.getItem('haruno_email');
    if (!email) return this.showToast("Cần đăng nhập để lưu!", "warning");
    
    const safeKey = this.getSafeKey(email);
    const titleEl = document.getElementById('music-title');
    const channelEl = document.getElementById('music-channel');
    const thumbEl = document.getElementById('music-thumbnail');
    
    const dataToSave = {
        currentTrack: this.musicData.currentVideoId ? {
            id: this.musicData.currentVideoId,
            title: titleEl ? titleEl.innerText : "Chưa Rõ",
            author: channelEl ? channelEl.innerText : "Chưa Rõ",
            thumb: thumbEl ? thumbEl.src : ""
        } : null,
        queue: this.musicData.playlist || []
    };

    try {
        this.showToast("Đang đồng bộ lên mây...", "info");
        firebase.database().ref(`users/${safeKey}/savedPlaylist`).set(dataToSave)
            .then(() => this.showToast("Đã lưu playlist thành công!", "success"))
            .catch(e => console.log("Lỗi Firebase:", e));
    } catch (error) {
        this.showToast("Lỗi kết nối máy chủ Firebase!", "error");
    }
};

app.loadSavedPlaylist = function() {
    const email = localStorage.getItem('haruno_email');
    if (!email) return;
    const safeKey = this.getSafeKey(email);
    
    try {
        firebase.database().ref(`users/${safeKey}/savedPlaylist`).once('value').then(snap => {
            const saved = snap.val();
            if (!saved) return;

            if (saved.currentTrack && saved.currentTrack.id) {
                this.musicData.currentVideoId = saved.currentTrack.id;
                
                document.getElementById('music-title').innerText = saved.currentTrack.title;
                document.getElementById('music-channel').innerText = saved.currentTrack.author;
                document.getElementById('music-thumbnail').src = saved.currentTrack.thumb;
                
                if (this.musicData.player && typeof this.musicData.player.cueVideoById === 'function') {
                    this.musicData.player.cueVideoById(saved.currentTrack.id);
                }
            }

            if (saved.queue && saved.queue.length > 0) {
                this.musicData.playlist = saved.queue;
                this.renderPlaylist();
            }
        });
    } catch(error) {
        console.log("Chưa tải xong Firebase:", error);
    }
};

// Kích hoạt API
app.initYoutubeApi();

// ==========================================
// HỆ THỐNG TIẾN LÊN MIỀN NAM: CHUẨN VIP CASINO
// ==========================================
app.tlRoomId = null;
app.tlTimer = null; 
app.serverTimeOffset = 0; 
app.tlJustDealt = false; 
app.tlLastStatus = null;
app.tlState = { myHand: [], selectedCards: [], currentBoard: [] };
app.tlSuits = ['♠', '♣', '♦', '♥'];
app.tlRanks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
app.tlWorkerApi = "https://throbbing-disk-3bb3.thienbm101102.workers.dev";

// ==========================================
// VIP CASINO: BỘ HIỆU ỨNG & ÂM THANH (ĐÃ FIX 100% KÊU)
// ==========================================
app.tlAudioUrls = {
    deal: "https://sounddino.com/mp3/48/sound-of-shuffling-cards.mp3", // Tiếng xào bài
    play: "https://sounddino.com/mp3/48/one-card-is-taken-from-the-deck.mp3",   // Tiếng quăng bài
    skip: "https://sounddino.com/mp3/48/tore-the-map.mp3",     // Tiếng giọt nước (bỏ lượt)
    chop: "https://sounddino.com/mp3/48/throw-the-deck-on-the-table.mp3", // Tiếng gậy đập chát chúa (Chặt)
    money: "https://assets.mixkit.co/active_storage/sfx/1993/1993-preview.mp3",  // Tiếng đồng xu rơi
    win: "https://assets.mixkit.co/active_storage/sfx/2016/2016-preview.mp3", // Nhạc thắng
    lose: "https://assets.mixkit.co/active_storage/sfx/2030/2030-preview.mp3" // Nhạc trượt té (thua)
};

app.tlSounds = {};
app.tlAudioUnlocked = false; // Biến kiểm tra xem loa đã mở chưa

// Tải âm thanh vào bộ nhớ
for (let key in app.tlAudioUrls) {
    app.tlSounds[key] = new Audio(app.tlAudioUrls[key]);
    app.tlSounds[key].volume = 1.0; // Đẩy volume lên MAX 100%
}

// ----------------------------------------------------
// THUẬT TOÁN "MỞ KHÓA LOA" DÀNH CHO SAFARI/CHROME
// Trình duyệt yêu cầu phải có 1 cú Click của người dùng mới cho phát nhạc
// ----------------------------------------------------
document.addEventListener('click', function() {
    if (!app.tlAudioUnlocked) {
        for (let key in app.tlSounds) {
            // Ép phát nhạc nhưng để chế độ Tắt Tiếng (muted) để trình duyệt cấp quyền
            app.tlSounds[key].muted = true;
            let playPromise = app.tlSounds[key].play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    app.tlSounds[key].pause();
                    app.tlSounds[key].currentTime = 0;
                    app.tlSounds[key].muted = false; // Nhả quyền tắt tiếng ra
                }).catch(e => { console.log("Lỗi mở khóa loa:", e); });
            }
        }
        app.tlAudioUnlocked = true;
        console.log("🔊 Loa Casino đã được mở khóa!");
    }
}, { once: true }); // Chỉ bắt sự kiện click duy nhất 1 lần đầu tiên

// Hàm phát nhạc chính
app.tlPlaySound = function(key) {
    if(app.tlSounds[key]) {
        app.tlSounds[key].currentTime = 0; // Tua lại từ đầu
        
        let playPromise = app.tlSounds[key].play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.warn(`Trình duyệt chặn phát âm thanh [${key}]. Vui lòng click vào màn hình!`);
            });
        }
    }
};

// Hàm hiển thị thông báo lơ lửng 3D giữa bàn chơi
app.tlShowArenaNotify = function(text, type = 'chop') {
    const overlay = document.getElementById('tl-arena-overlay');
    if(!overlay) return;
    
    const div = document.createElement('div');
    div.className = `arena-notify notify-${type}`;
    div.innerText = text;
    overlay.appendChild(div);
    
    if(type === 'chop') app.tlPlaySound('chop');
    else app.tlPlaySound('money');

    setTimeout(() => { div.remove(); }, 2500);
};
// ==========================================
// KẾT THÚC BỘ HIỆU ỨNG
// ==========================================

app.openTlLobby = function() {
    const email = localStorage.getItem('haruno_email');
    if (!email) { this.openAuthModal(); return; }
    document.getElementById('tl-lobby-modal').style.display = 'flex';
    this.listenTlLobby();
};

app.closeTlLobby = function() {
    document.getElementById('tl-lobby-modal').style.display = 'none';
    if(db) db.ref('tlmn_rooms').off();
};

app.listenTlLobby = function() {
    if (!db) return;
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    db.ref(`users/${safeUser}/coins`).on('value', snap => {
        const el = document.getElementById('tl-lobby-coins');
        if(el) el.innerText = (snap.val() || 0).toLocaleString();
    });

    db.ref('tlmn_rooms').orderByChild('status').equalTo('waiting').on('value', snap => {
        const listEl = document.getElementById('tl-room-list');
        if (!listEl) return;
        listEl.innerHTML = ''; 
        if (!snap.exists()) {
            listEl.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">Chưa có bàn nào. Hãy tạo bàn để cùng chơi nhé!</div>';
            return;
        }

        snap.forEach(child => {
            const room = child.val();
            const roomId = child.key;
            const playerCount = room.players ? Object.keys(room.players).length : 1;
            const creatorName = room.players[room.hostId]?.name || "Người chơi";

            if (room.players && room.players[safeUser]) {
                listEl.innerHTML += `
                    <div class="bj-room-item" style="border-color: #ffd700; background: rgba(255,215,0,0.05);">
                        <div class="bj-room-info">
                            <h4 style="color: #ffd700;"><i class="fas fa-crown"></i> Bàn bạn đang tham gia (${playerCount}/4)</h4>
                            <p><i class="fas fa-coins"></i> Cược: ${room.bet.toLocaleString()} HCoins</p>
                        </div>
                        <button onclick="app.tl_rejoinRoom('${roomId}')" class="btn-join-room" style="background: #f39c12;">VÀO LẠI BÀN</button>
                    </div>`;
            } else if (playerCount < 4) {
                listEl.innerHTML += `
                    <div class="bj-room-item">
                        <div class="bj-room-info">
                            <h4><i class="fas fa-star" style="color:#f1c40f;"></i> Bàn của ${creatorName} (${playerCount}/4)</h4>
                            <p><i class="fas fa-coins"></i> Cược: ${room.bet.toLocaleString()} HCoins</p>
                        </div>
                        <button onclick="app.tl_joinRoom('${roomId}', ${room.bet})" class="btn-join-room">VÀO CHƠI</button>
                    </div>`;
            }
        });
    });
};

app.tl_createRoom = async function() {
    const email = localStorage.getItem('haruno_email');
    const betAmount = parseInt(document.getElementById('tl-bet-amount').value);
    if (isNaN(betAmount) || betAmount <= 0) { this.showToast("Nhập cược hợp lệ!", "error"); return; }
    
    const safeUser = this.getSafeKey(email);
    const myData = this.usersData[safeUser] || {};
    const myName = myData.displayName || safeUser.split('_')[0];
    const myAvatar = myData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeUser}`;

    this.showToast("Đang khởi tạo bàn chơi...", "info");

    const newRoomRef = db.ref('tlmn_rooms').push();
    newRoomRef.onDisconnect().remove(); 
    
    const roomData = {
        bet: betAmount, hostId: safeUser, status: 'waiting',
        players: { [safeUser]: { role: 'host', name: myName, avatar: myAvatar, cardCount: 0 } },
        gameState: { turnOrder: null, currentTurnIndex: 0, currentBoard: null, lastPlayedBy: null, passedPlayers: null, finishedPlayers: [] }
    };
    newRoomRef.set(roomData);
    this.tl_enterRoom(newRoomRef.key);
};

app.tl_joinRoom = async function(roomId, betAmount) {
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    const snap = await db.ref(`tlmn_rooms/${roomId}`).once('value');
    const room = snap.val();
    
    if(!room || room.status !== 'waiting') { this.showToast("Bàn đang chơi hoặc đã đóng!", "error"); return; }
    if(Object.keys(room.players || {}).length >= 4) { this.showToast("Bàn đã đầy!", "warning"); return; }

    this.showToast("Đang kết nối vào bàn...", "info");

    const myData = this.usersData[safeUser] || {};
    db.ref(`tlmn_rooms/${roomId}/players/${safeUser}`).set({
        role: 'player', 
        name: myData.displayName || safeUser.split('_')[0], 
        avatar: myData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeUser}`,
        cardCount: 0
    });
    this.tl_enterRoom(roomId);
};

app.tl_rejoinRoom = function(roomId) { this.tl_enterRoom(roomId); };

app.tl_enterRoom = function(roomId) {
    this.tlRoomId = roomId;
    this.closeTlLobby();
    document.getElementById('tl-game-modal').style.display = 'flex';
    this.tl_listenGame();
    this.initTlSwipeSelect(); 
};

app.tl_exitRoom = async function() {
    if (!this.tlRoomId) return;
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    const roomId = this.tlRoomId;
    
    if(app.tlTimer) clearInterval(app.tlTimer);

    await db.ref(`tlmn_rooms/${roomId}`).once('value').then(async snap => {
        const room = snap.val();
        if (room && room.players && room.players[safeUser]) {
            if (room.status === 'playing') {
                let penaltyMoney = room.bet * 4; 
                fetch(app.tlWorkerApi, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'deductMinigameFee', safeKey: safeUser, cost: penaltyMoney }) 
                });
                
                let players = Object.keys(room.players);
                let compMoney = Math.floor(penaltyMoney / (players.length - 1)); 
                for (let p of players) {
                    if (p !== safeUser) {
                        fetch(app.tlWorkerApi, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'minigameResult', safeKey: p, amount: room.bet + compMoney }) 
                        });
                    }
                }
                db.ref(`tlmn_rooms/${roomId}`).remove(); 
                this.showToast("Ván đấu hủy do bạn thoát! Bị phạt " + penaltyMoney.toLocaleString() + " HCoins", "error");
            } else {
                if (room.hostId === safeUser) {
                    db.ref(`tlmn_rooms/${roomId}`).remove(); 
                    this.showToast("Đã giải tán phòng!", "success");
                } else {
                    db.ref(`tlmn_rooms/${roomId}/players/${safeUser}`).remove(); 
                    this.showToast("Đã rời phòng!", "success");
                }
            }
        }
    });
    
    db.ref(`tlmn_rooms/${this.tlRoomId}`).off();
    document.getElementById('tl-game-modal').style.display = 'none';
    this.tlRoomId = null;
    this.tlState = { myHand: [], selectedCards: [], currentBoard: [] };
};

// ===============================================
// FIX 1: HÀM LẮNG NGHE ĐƯỢC CẬP NHẬT ĐỂ ĐỒNG BỘ BÀI VÀ NHẬN LỆNH CHẶT
// ===============================================
app.tl_listenGame = function() {
    if (!db || !this.tlRoomId) return;
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));

    db.ref('.info/serverTimeOffset').on('value', snap => { app.serverTimeOffset = snap.val() || 0; });

    db.ref(`tlmn_rooms/${this.tlRoomId}`).on('value', snap => {
        const room = snap.val();
        if (!room || !room.players || !room.players[safeUser]) {
            document.getElementById('tl-game-modal').style.display = 'none';
            this.tlRoomId = null;
            if(app.tlTimer) clearInterval(app.tlTimer);
            this.showToast("Bàn chơi đã kết thúc!", "warning");
            return;
        }

        room.gameState = room.gameState || {};
        room.gameState.turnOrder = room.gameState.turnOrder || [];
        room.gameState.currentBoard = room.gameState.currentBoard || [];
        room.gameState.passedPlayers = room.gameState.passedPlayers || [];
        room.gameState.finishedPlayers = room.gameState.finishedPlayers || [];

        // Lắng nghe lệnh CHẶT từ Firebase để hiện hiệu ứng cho cả phòng
        if (room.gameState.lastChop && room.gameState.lastChop.timestamp !== app.lastChopTime) {
            app.lastChopTime = room.gameState.lastChop.timestamp;
            app.tlShowArenaNotify(room.gameState.lastChop.text, 'chop');
        }

        document.getElementById('tl-room-id-text').innerText = this.tlRoomId.substring(1, 6);
        document.getElementById('tl-room-bet-text').innerText = room.bet.toLocaleString();

        const myRole = room.players[safeUser].role;
        const btnStart = document.getElementById('btn-tl-start');
        const statusMsg = document.getElementById('tl-status-msg');

        // BẮT ĐẦU VÁN MỚI -> PHÁT TIẾNG CHIA BÀI
        if (room.status === 'playing' && app.tlLastStatus !== 'playing') {
            app.tlJustDealt = true;
            app.tlPlaySound('deal'); 
            this.tlState.selectedCards = []; // Dọn dẹp selectedCards cũ
            setTimeout(() => { app.tlJustDealt = false; }, 2000); 
        }
        app.tlLastStatus = room.status;

        if(app.tlTimer) clearInterval(app.tlTimer); 

        if (room.status === 'waiting') {
            statusMsg.innerText = "Đang chờ người chơi...";
            btnStart.style.display = myRole === 'host' ? 'block' : 'none';
        } else if (room.status === 'playing') {
            btnStart.style.display = 'none';
            const currentTurnPlayer = room.gameState.turnOrder[room.gameState.currentTurnIndex];
            
            if (room.gameState.finishedPlayers.includes(safeUser)) {
                statusMsg.innerText = "BẠN ĐÃ TỚI! Đang xem những người khác...";
                statusMsg.style.color = "#ccc";
            } else if (currentTurnPlayer === safeUser) {
                statusMsg.innerText = "TỚI LƯỢT BẠN!";
                statusMsg.style.color = "#00ffcc";
            } else {
                const activeName = room.players[currentTurnPlayer]?.name || "Đối thủ";
                statusMsg.innerText = `Đang chờ ${activeName} đánh...`;
                statusMsg.style.color = "#ff9800";
            }

            if (room.gameState.turnStartTime && !room.gameState.finishedPlayers.includes(currentTurnPlayer)) {
                app.tlTimer = setInterval(() => {
                    const now = Date.now() + app.serverTimeOffset;
                    const elapsed = Math.floor((now - room.gameState.turnStartTime) / 1000);
                    const remaining = Math.max(0, 30 - elapsed);
                    
                    const timerEls = document.querySelectorAll('.tl-timer-text');
                    timerEls.forEach(el => el.innerText = remaining);

                    if (remaining === 0 && currentTurnPlayer === safeUser && !app.tlIsActing) {
                        app.tlIsActing = true;
                        clearInterval(app.tlTimer);
                        app.showToast("Hết giờ! Tự động bỏ lượt.", "warning");
                        
                        const isNewRound = room.gameState.currentBoard.length === 0;
                        if (isNewRound && app.tlState.myHand.length > 0) {
                            app.tlState.selectedCards = [app.tlState.myHand[0]];
                            app.tl_playCardsOnline();
                        } else {
                            app.tl_skipTurnOnline();
                        }
                        setTimeout(() => { app.tlIsActing = false; }, 2000);
                    }
                }, 1000);
            }

        } else if (room.status === 'finished') {
            btnStart.style.display = 'none';
            statusMsg.innerText = "Ván đấu kết thúc! Đang dọn bàn...";
            statusMsg.style.color = "#f1c40f";
            this.tlState.selectedCards = []; // Dọn sạch bài còn kẹt lúc hết ván
            
            if (myRole === 'host') {
                setTimeout(() => { db.ref(`tlmn_rooms/${this.tlRoomId}`).update({ status: 'waiting' }); }, 5000);
            }

            if (app.tlLastStatus !== 'finished' && room.players[safeUser].result) {
                if(room.players[safeUser].result.type === 'win') {
                    app.tlPlaySound('win');
                } else {
                    app.tlPlaySound('lose');
                }
                
                if (room.players[safeUser].result.type === 'win' && room.players[safeUser].result.amount > 0) {
                    setTimeout(() => { 
                        app.tlShowArenaNotify(`+ ${room.players[safeUser].result.amount.toLocaleString()}`, 'money');
                    }, 1500);
                }
            }
        }

        // Logic check bằng stringify đảm bảo khớp tuyệt đối 100% với database
        if (room.players[safeUser].hand) {
            const serverHandStr = JSON.stringify(room.players[safeUser].hand);
            const localHandStr = JSON.stringify(this.tlState.myHand);
            
            if (serverHandStr !== localHandStr) {
                this.tlState.myHand = room.players[safeUser].hand;
                // Chỉ giữ lại những lá đang chọn mà vẫn còn thực tế trên tay (Chống lỗi đánh bài ảo)
                this.tlState.selectedCards = this.tlState.selectedCards.filter(sc => this.tlState.myHand.find(hc => hc.value === sc.value));
                this.tl_sortCards(); 
            }
        } else {
            this.tlState.myHand = [];
            this.tlState.selectedCards = [];
            this.tl_renderMyHand();
        }

        this.tlState.currentBoard = room.gameState.currentBoard;
        this.tl_renderBoard();
        this.tl_renderPlayers(room);
        this.tl_updateControls(room, safeUser);
    });
};

app.tl_renderPlayers = function(room) {
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    const uids = Object.keys(room.players);
    let myIndex = uids.indexOf(safeUser);
    let orderedUids = uids.slice(myIndex).concat(uids.slice(0, myIndex)); 
    
    const seats = ['tl-seat-0', 'tl-seat-1', 'tl-seat-2', 'tl-seat-3']; 
    for(let i=0; i<=3; i++) {
        let el = document.getElementById(`tl-seat-${i}`);
        if(el) { el.style.display = 'none'; el.classList.remove('active'); }
    }

    const currentTurnPlayer = room.gameState ? room.gameState.turnOrder[room.gameState.currentTurnIndex] : null;

    orderedUids.forEach((uid, index) => {
        let p = room.players[uid];
        let seatEl = document.getElementById(seats[index]);
        if (!seatEl) return;
        
        seatEl.style.display = 'flex'; 
        let isActive = uid === currentTurnPlayer && room.status === 'playing';
        if(isActive) seatEl.classList.add('active');
        let isPassed = room.gameState && room.gameState.passedPlayers && room.gameState.passedPlayers.includes(uid);
        let isFinished = room.gameState && room.gameState.finishedPlayers && room.gameState.finishedPlayers.includes(uid);
        
        let pData = app.usersData ? app.usersData[uid] : {};
        let isPremium = pData && pData.isPremium ? true : false;
        let avatarFrame = isPremium && pData.avatarFrame && pData.avatarFrame !== 'none' ? pData.avatarFrame : '';
        let frameHtml = avatarFrame ? `<div class="avatar-frame ${avatarFrame}"></div>` : '';
        let coins = pData && pData.coins ? pData.coins.toLocaleString() : '0';

        let resultHtml = '';
        if (p.result) {
            let color = p.result.type === 'win' ? '#00ffcc' : (p.result.type === 'lose' ? '#ff4d4d' : '#f1c40f');
            let sign = p.result.amount > 0 ? (p.result.type === 'win' ? '+' : '-') : '';
            let amountHtml = p.result.amount > 0 ? `<div class="tl-money-anim" style="color: ${color};">${sign}${p.result.amount}</div>` : '';
            resultHtml = `
                <div class="tl-result-tag ${p.result.type}" style="background-color: ${color}; color: #000;">${p.result.text}</div>
                ${amountHtml}
            `;
        }
        
        seatEl.innerHTML = `
            <div class="tl-avatar-wrapper" style="opacity: ${(isPassed || isFinished) ? 0.4 : 1};">
                ${resultHtml}
                ${room.status === 'waiting' && p.role !== 'host' ? '<div class="tl-ready-tag">ĐÃ VÀO</div>' : ''}
                <img src="${p.avatar}" class="tl-avt-img" style="border-color: ${isActive ? '#00ffcc' : '#ccc'}; box-shadow: ${isActive ? '0 0 15px #00ffcc' : 'none'};">
                ${frameHtml}
                ${isPassed && !isFinished ? '<div class="tl-passed-tag">BỎ</div>' : ''}
                ${isActive && !isFinished ? '<div class="tl-timer-circle"><span class="tl-timer-text">30</span></div>' : ''}
            </div>
            <div class="tl-info-box">
                <div class="tl-name-tag">${p.role === 'host' ? '👑 ' : ''}${p.name}</div>
                <div class="tl-coins-tag"><i class="fas fa-coins"></i> ${coins}</div>
                ${room.status === 'playing' && !isFinished ? `<div class="tl-card-count">${p.cardCount || 0} lá</div>` : ''}
            </div>
        `;
    });
};

app.tl_renderBoard = function() {
    const boardEl = document.getElementById('tl-board');
    boardEl.innerHTML = '';
    
    // Tạo độ xoay ngẫu nhiên nhẹ cho các lá bài đánh ra giữa bàn nhìn tự nhiên hơn
    this.tlState.currentBoard.forEach((card, idx) => {
        let randomRotation = (Math.random() - 0.5) * 15; // Xoay từ -7.5 độ đến 7.5 độ
        boardEl.innerHTML += `
            <div class="tl-card ${card.color}" style="z-index: ${idx}; transform: scale(0.9) rotate(${randomRotation}deg);">
                <div class="suit-top">${card.rank}${card.suit}</div>
                <div class="suit-bottom">${card.rank}${card.suit}</div>
            </div>`;
    });
};

app.tl_renderMyHand = function() {
    const handEl = document.getElementById('tl-my-hand');
    if(!handEl) return;
    handEl.innerHTML = '';
    
    // Tính toán độ rộng động cho thẻ bài để không bị tràn trên màn hình điện thoại
    const isMobile = window.innerWidth <= 768;
    const overlapMargin = isMobile ? -25 : -40; // Độ đè của bài trên mobile và PC
    
    this.tlState.myHand.forEach((card, index) => {
        let isSelected = this.tlState.selectedCards.find(c => c.value === card.value);
        let marginLeft = index === 0 ? 0 : overlapMargin;
        
        handEl.innerHTML += `
        <div class="tl-card ${card.color} ${isSelected ? 'selected' : ''}" 
             style="margin-left: ${marginLeft}px; z-index: ${index};" 
             onclick="app.tl_toggleCard(${card.value})">
            <div class="suit-top">${card.rank}${card.suit}</div>
            <div class="suit-bottom">${card.rank}${card.suit}</div>
        </div>`;
    });
};

app.initTlSwipeSelect = function() {
    let isSwipingCards = false;
    let swipedCardsId = new Set();
    const handContainer = document.getElementById('tl-my-hand');

    if (!handContainer) return;

    let newContainer = handContainer.cloneNode(true);
    handContainer.parentNode.replaceChild(newContainer, handContainer);

    newContainer.addEventListener('touchstart', (e) => {
        isSwipingCards = true;
        swipedCardsId.clear();
        app.handleTlTouchCard(e.touches[0], swipedCardsId);
    }, {passive: false});

    newContainer.addEventListener('touchmove', (e) => {
        if (!isSwipingCards) return;
        e.preventDefault(); 
        app.handleTlTouchCard(e.touches[0], swipedCardsId);
    }, {passive: false});

    newContainer.addEventListener('touchend', () => {
        isSwipingCards = false;
    });
};

app.handleTlTouchCard = function(touch, swipedCardsId) {
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const cardElement = element ? element.closest('.tl-card') : null;

    if (cardElement) {
        const cardValue = parseInt(cardElement.dataset.value);
        if (!isNaN(cardValue) && !swipedCardsId.has(cardValue)) {
            swipedCardsId.add(cardValue);
            app.tl_toggleCard(cardValue);
        }
    }
};

let lastTlClickTime = 0;
let lastTlClickedValue = null;

app.tl_toggleCard = function(cardValue) {
    let now = Date.now();
    let isDoubleClick = (now - lastTlClickTime < 300) && (lastTlClickedValue === cardValue);
    lastTlClickTime = now;
    lastTlClickedValue = cardValue;

    const card = this.tlState.myHand.find(c => c.value === cardValue);
    if (!card) return;

    let board = this.tlState.currentBoard || [];
    let bLen = board.length;

    if (!isDoubleClick && bLen >= 2) {
        let boardInfo = this.tl_getCardGroupType(board);
        if (boardInfo && (boardInfo.type === 'pair' || boardInfo.type === 'triple' || boardInfo.type === 'quad')) {
            let sameRankCards = this.tlState.myHand.filter(c => c.rank === card.rank);
            let isAlreadySelected = this.tlState.selectedCards.find(c => c.value === card.value);
            
            if (sameRankCards.length >= bLen && !isAlreadySelected) {
                this.tlState.selectedCards = []; 
                sameRankCards.slice(0, bLen).forEach(c => {
                    this.tlState.selectedCards.push(c);
                });
                
                app.tlPlaySound('play'); // Thêm âm thanh khi bắt bài
                this.tl_renderMyHand();
                return;
            }
        }
    }

    const idx = this.tlState.selectedCards.findIndex(c => c.value === cardValue);
    if (idx > -1) this.tlState.selectedCards.splice(idx, 1);
    else this.tlState.selectedCards.push(card);
    
    app.tlPlaySound('play'); // Thêm âm thanh khi chọn bài lẻ
    this.tl_renderMyHand();
};

app.tl_sortCards = function() {
    this.tlState.myHand.sort((a, b) => a.value - b.value);
    this.tl_renderMyHand();
};

app.tl_updateControls = function(room, safeUser) {
    const btnPlay = document.getElementById('btn-tl-play');
    const btnSkip = document.getElementById('btn-tl-skip');
    
    if (room.status === 'playing') {
        let finishedPlayers = (room.gameState && room.gameState.finishedPlayers) ? room.gameState.finishedPlayers : [];
        if (finishedPlayers.includes(safeUser)) {
            btnPlay.disabled = true; btnSkip.disabled = true;
            return;
        }

        const currentTurnPlayer = room.gameState.turnOrder[room.gameState.currentTurnIndex];
        const isMyTurn = currentTurnPlayer === safeUser;
        btnPlay.disabled = !isMyTurn;
        
        const isNewRound = !room.gameState.currentBoard || room.gameState.currentBoard.length === 0;
        btnSkip.disabled = !isMyTurn || isNewRound;
    } else {
        btnPlay.disabled = true; btnSkip.disabled = true;
    }
};

app.tl_createDeck = function() {
    let deck = [];
    for (let r = 0; r < this.tlRanks.length; r++) {
        for (let s = 0; s < this.tlSuits.length; s++) {
            deck.push({ rank: this.tlRanks[r], suit: this.tlSuits[s], color: (this.tlSuits[s] === '♦' || this.tlSuits[s] === '♥') ? 'red' : 'black', value: r * 4 + s });
        }
    }
    return deck.sort(() => Math.random() - 0.5); 
};

app.tl_getCardGroupType = function(cards) {
    if (!cards || cards.length === 0) return null;
    let sorted = [...cards].sort((a, b) => a.value - b.value);
    let len = sorted.length;
    const getRankIndex = (rank) => this.tlRanks.indexOf(rank);

    if (len === 1) return { type: 'single', highest: sorted[0] };

    let isAllSameRank = sorted.every(c => c.rank === sorted[0].rank);
    if (isAllSameRank) {
        if (len === 2) return { type: 'pair', highest: sorted[1] };
        if (len === 3) return { type: 'triple', highest: sorted[2] };
        if (len === 4) return { type: 'quad', highest: sorted[3] }; 
    }

    if (len >= 3) { 
        let isStraight = true;
        if (!sorted.some(c => c.rank === '2')) { 
            for (let i = 0; i < len - 1; i++) {
                if (getRankIndex(sorted[i+1].rank) - getRankIndex(sorted[i].rank) !== 1) { isStraight = false; break; }
            }
            if (isStraight) return { type: 'straight', length: len, highest: sorted[len - 1] };
        }
    }

    if (len >= 6 && len % 2 === 0) { 
        let isConsecutivePairs = true;
        if (!sorted.some(c => c.rank === '2')) {
            let pairRanks = [];
            for (let i = 0; i < len; i += 2) {
                if (sorted[i].rank !== sorted[i+1].rank) { isConsecutivePairs = false; break; }
                pairRanks.push(getRankIndex(sorted[i].rank));
            }
            if (isConsecutivePairs) {
                for (let i = 0; i < pairRanks.length - 1; i++) {
                    if (pairRanks[i+1] - pairRanks[i] !== 1) { isConsecutivePairs = false; break; }
                }
            }
            if (isConsecutivePairs) return { type: 'consecutive_pairs', pairCount: len / 2, highest: sorted[len - 1] };
        }
    }
    return null; 
};

app.tl_getPenaltyMultiplier = function(cards) {
    if (!cards || cards.length === 0) return 0;
    let typeInfo = this.tl_getCardGroupType(cards);
    if (!typeInfo) return 0;

    if (typeInfo.type === 'consecutive_pairs') {
        if (typeInfo.pairCount === 3) return 3; 
        if (typeInfo.pairCount === 4) return 5; 
        if (typeInfo.pairCount >= 5) return 6;
    }
    if (typeInfo.type === 'quad') return 4; 

    let isHeo = (typeInfo.type === 'single' || typeInfo.type === 'pair') && typeInfo.highest.rank === '2';
    if (isHeo) {
        let total = 0;
        cards.forEach(c => { total += (c.color === 'red' ? 2 : 1); });
        return total;
    }
    return 0;
};

app.tl_canPlay = function(playCards, currentBoardCards) {
    const playType = this.tl_getCardGroupType(playCards);
    if (!playType) return false; 
    if (!currentBoardCards || currentBoardCards.length === 0) return true;

    const boardType = this.tl_getCardGroupType(currentBoardCards);

    if (playType.type === boardType.type) {
        if (playType.length && playType.length !== boardType.length) return false;
        if (playType.pairCount && playType.pairCount !== boardType.pairCount) return false;
        return playType.highest.value > boardType.highest.value;
    }

    const isSingleHeo = (boardType.type === 'single' && boardType.highest.rank === '2');
    const isPairHeo = (boardType.type === 'pair' && boardType.highest.rank === '2');

    if (playType.type === 'quad') { 
        if (isSingleHeo || isPairHeo || (boardType.type === 'consecutive_pairs' && boardType.pairCount === 3)) return true;
    }
    if (playType.type === 'consecutive_pairs' && playType.pairCount === 3) { 
        if (isSingleHeo) return true;
    }
    if (playType.type === 'consecutive_pairs' && playType.pairCount === 4) { 
        if (isSingleHeo || isPairHeo || boardType.type === 'quad' || (boardType.type === 'consecutive_pairs' && boardType.pairCount === 3)) return true;
    }
    return false;
};

app.tl_checkToiTrang = function(hand) {
    let sorted = [...hand].sort((a,b) => a.value - b.value);
    
    let twos = sorted.filter(c => c.rank === '2');
    if (twos.length === 4) return "Tứ Quý Heo";

    let pairs = 0;
    for(let i=0; i<sorted.length-1; i++) {
        if (sorted[i].rank === sorted[i+1].rank) { pairs++; i++; }
    }
    if (pairs >= 6) return "6 Đôi";

    let uniqueRanks = new Set(sorted.filter(c => c.rank !== '2').map(c => c.rank));
    if (uniqueRanks.size === 12) return "Sảnh Rồng";

    let pairRanks = [];
    for(let i=0; i<sorted.length-1; i++) {
        if (sorted[i].rank === sorted[i+1].rank && sorted[i].rank !== '2') {
            pairRanks.push(this.tlRanks.indexOf(sorted[i].rank));
            i++;
        }
    }
    pairRanks.sort((a,b)=>a-b);
    let maxCons = 1, curr = 1;
    for(let i=0; i<pairRanks.length-1; i++) {
        if (pairRanks[i+1] === pairRanks[i] + 1) {
            curr++; if(curr > maxCons) maxCons = curr;
        } else if (pairRanks[i+1] !== pairRanks[i]) {
            curr = 1;
        }
    }
    if (maxCons >= 5) return "5 Đôi Thông";

    return null;
};

app.tl_startGameOnline = function() {
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    db.ref(`tlmn_rooms/${this.tlRoomId}`).once('value').then(async snap => {
        const room = snap.val();
        if (!room || room.hostId !== safeUser || room.status !== 'waiting') return;
        
        const playerKeys = Object.keys(room.players);
        
        if (playerKeys.length < 2) { 
            this.showToast("Cần ít nhất 2 người chơi để bắt đầu!", "warning");
            return; 
        }

        playerKeys.forEach(uid => {
            fetch(app.tlWorkerApi, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'deductMinigameFee', safeKey: uid, cost: room.bet })
            });
        });

        let validPlayers = {};
        for(let pk of playerKeys) {
            validPlayers[pk] = room.players[pk]; 
        }

        let deck = app.tl_createDeck();
        let turnOrder = playerKeys;
        
        let winnerToiTrang = null;
        let loaiToiTrang = "";

        turnOrder.forEach((pk, index) => {
            let hand = deck.slice(index * 13, (index + 1) * 13);
            validPlayers[pk].hand = hand;
            validPlayers[pk].cardCount = 13;
            validPlayers[pk].result = null; 
            
            let tt = app.tl_checkToiTrang(hand);
            if (tt && !winnerToiTrang) {
                winnerToiTrang = pk;
                loaiToiTrang = tt;
            }
        });

        if (winnerToiTrang) {
            let totalReward = 0;
            for (let uid of turnOrder) {
                if (uid !== winnerToiTrang) {
                    let loserLoss = room.bet * 2; 
                    totalReward += loserLoss;
                    validPlayers[uid].result = { type: 'lose', text: 'CÓNG', amount: loserLoss };
                    
                    let extraPenalty = loserLoss - room.bet;
                    if (extraPenalty > 0) {
                        fetch(app.tlWorkerApi, { 
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                            body: JSON.stringify({ action: 'deductMinigameFee', safeKey: uid, cost: extraPenalty }) 
                        });
                    }
                }
            }
            validPlayers[winnerToiTrang].result = { type: 'win', text: `TỚI TRẮNG (${loaiToiTrang})`, amount: totalReward };
            
            fetch(app.tlWorkerApi, { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ action: 'minigameResult', safeKey: winnerToiTrang, amount: totalReward + room.bet }) 
            });

            db.ref(`tlmn_rooms/${this.tlRoomId}`).update({
                status: 'finished', players: validPlayers,
                gameState: { lastWinner: winnerToiTrang, finishedPlayers: [] }
            });
            return;
        }

        let startTurnIndex = 0;
        let mustPlay3Bich = false;
        let lastWinner = room.gameState ? room.gameState.lastWinner : null;

        if (lastWinner && turnOrder.includes(lastWinner)) {
            startTurnIndex = turnOrder.indexOf(lastWinner); 
        } else {
            let has3Bich = false;
            turnOrder.forEach((pk, index) => {
                if (validPlayers[pk].hand.some(c => c.value === 0)) { 
                    startTurnIndex = index;
                    mustPlay3Bich = true;
                    has3Bich = true;
                }
            });
            if (!has3Bich) {
                startTurnIndex = Math.floor(Math.random() * turnOrder.length);
                mustPlay3Bich = false;
            }
        }

        db.ref(`tlmn_rooms/${this.tlRoomId}`).update({
            status: 'playing', players: validPlayers,
            gameState: { 
                turnOrder: turnOrder, 
                currentTurnIndex: startTurnIndex, 
                currentBoard: null, passedPlayers: null, lastPlayedBy: null,
                mustPlay3Bich: mustPlay3Bich,
                lastWinner: lastWinner || null,
                finishedPlayers: [], 
                turnStartTime: Date.now() + app.serverTimeOffset 
            }
        });
    });
};

// ===============================================
// FIX 2: HÀM ĐÁNH BÀI LƯU THÔNG TIN CHẶT VÀO FIREBASE
// ===============================================
app.tl_playCardsOnline = function() {
    if (this.tlState.selectedCards.length === 0) {
        this.showToast("Bạn chưa chọn bài!", "warning");
        return;
    }
    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));

    db.ref(`tlmn_rooms/${this.tlRoomId}`).once('value').then(snap => {
        const room = snap.val();
        room.gameState = room.gameState || {};
        let currentBoard = room.gameState.currentBoard || [];
        let passedPlayers = room.gameState.passedPlayers || [];
        let turnOrder = room.gameState.turnOrder || [];
        let boardToCompare = currentBoard;
        
        if (room.gameState.mustPlay3Bich) {
            let has3Bich = this.tlState.selectedCards.some(c => c.value === 0);
            if (!has3Bich) {
                this.showToast("Ván đầu bắt buộc phải đánh lá 3 Bích!", "warning");
                return;
            }
        }
        
        if (room.gameState.lastPlayedBy === safeUser && passedPlayers.length >= turnOrder.length - 1) {
            boardToCompare = []; 
        }

        if (this.tl_canPlay(this.tlState.selectedCards, boardToCompare)) {
            
            let updates = {}; // Gói biến update lên đây

            // LOGIC CHẶT HEO (Ghi lại LastChop để gửi cho tất cả người trong phòng thấy)
            if (boardToCompare && boardToCompare.length > 0) {
                let oldMultiplier = this.tl_getPenaltyMultiplier(boardToCompare);
                let newMultiplier = this.tl_getPenaltyMultiplier(this.tlState.selectedCards);

                if (oldMultiplier > 0 && newMultiplier >= 3) {
                    let victim = room.gameState.lastPlayedBy;
                    let chopper = safeUser;
                    let isOverChop = boardToCompare.length >= 4; 
                    let penaltyMultiplier = newMultiplier;

                    if (isOverChop) penaltyMultiplier *= 2; 

                    let penaltyMoney = penaltyMultiplier * room.bet;

                    fetch(app.tlWorkerApi, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'deductMinigameFee', safeKey: victim, cost: penaltyMoney })
                    });
                    fetch(app.tlWorkerApi, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'minigameResult', safeKey: chopper, amount: penaltyMoney })
                    });

                    let chopMsg = isOverChop ? 
                        `💥 CHẶT CHỒNG! ${room.players[chopper].name} vừa cướp ${penaltyMoney.toLocaleString()}!` : 
                        `🔪 CHẶT! ${room.players[chopper].name} vừa thu về ${penaltyMoney.toLocaleString()}!`;
                    
                    // Ghi vào updates để gửi Firebase
                    updates[`gameState/lastChop`] = {
                        text: chopMsg,
                        timestamp: Date.now() + app.serverTimeOffset
                    };
                    
                } else {
                    app.tlPlaySound('play'); // Đánh bài thường
                }
            } else {
                app.tlPlaySound('play'); // Đánh bài mở vòng
            }

            let newHand = this.tlState.myHand.filter(c => !this.tlState.selectedCards.find(sc => sc.value === c.value));
            
            updates[`players/${safeUser}/hand`] = newHand.length > 0 ? newHand : null;
            updates[`players/${safeUser}/cardCount`] = newHand.length;
            updates[`gameState/currentBoard`] = this.tlState.selectedCards;
            updates[`gameState/lastPlayedBy`] = safeUser;
            updates[`gameState/mustPlay3Bich`] = false; 
            updates[`gameState/turnStartTime`] = Date.now() + app.serverTimeOffset; 

            let isPlayingHeo = this.tlState.selectedCards.some(c => c.rank === '2');
            updates[`gameState/passedPlayers`] = isPlayingHeo ? null : (passedPlayers.length > 0 ? passedPlayers : null);

            // LOGIC KHI NGƯỜI CHƠI ĐÁNH HẾT BÀI VÀ PHÂN HẠNG
            if (newHand.length === 0) {
                let finishedPlayers = room.gameState.finishedPlayers || [];
                let isFirstToFinish = finishedPlayers.length === 0;
                
                finishedPlayers.push(safeUser);
                updates['gameState/finishedPlayers'] = finishedPlayers;

                let currentRank = finishedPlayers.length;
                let rankLabels = ["VỀ NHẤT", "VỀ NHÌ", "VỀ BA"];

                let isDutMu = false;
                if (isFirstToFinish && this.tlState.selectedCards.length === 1 && this.tlState.selectedCards[0].value === 0) {
                    isDutMu = true;
                    rankLabels[0] = "ĐÚT MÙ 3 BÍCH!";
                }
                
                updates[`players/${safeUser}/result`] = { type: 'win', text: rankLabels[currentRank-1], amount: 0 };

                let nhatId = finishedPlayers[0];
                let earlyTotalReward = 0;

                if (isFirstToFinish) {
                    turnOrder.forEach(uid => {
                        if (uid !== safeUser && room.players[uid].hand && room.players[uid].hand.length === 13) {
                            let penaltyMult = 2; // Phạt Cóng
                            let thoiMsg = ["CÓNG"];
                            let loserHand = room.players[uid].hand;

                            let rankCounts = {};
                            loserHand.forEach(c => {
                                rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
                                if (c.rank === '2') {
                                    if (c.color === 'black') { penaltyMult += 1; thoiMsg.push("Heo Đen"); }
                                    if (c.color === 'red') { penaltyMult += 2; thoiMsg.push("Heo Đỏ"); }
                                }
                                if (c.value === 0) { penaltyMult += 1; thoiMsg.push("3 Bích"); }
                            });

                            for (let r in rankCounts) {
                                if (rankCounts[r] === 4 && r !== '2') { penaltyMult += 2; thoiMsg.push("Tứ Quý"); }
                            }

                            let pairRanks = [];
                            let sortedLoser = [...loserHand].sort((a,b) => a.value - b.value);
                            for(let i=0; i<sortedLoser.length-1; i++) {
                                if (sortedLoser[i].rank === sortedLoser[i+1].rank && sortedLoser[i].rank !== '2') {
                                    let rIdx = app.tlRanks.indexOf(sortedLoser[i].rank);
                                    if (!pairRanks.includes(rIdx)) pairRanks.push(rIdx);
                                }
                            }
                            pairRanks.sort((a,b)=>a-b);
                            let maxCons = 1, curr = 1;
                            for(let i=0; i<pairRanks.length-1; i++) {
                                if (pairRanks[i+1] === pairRanks[i] + 1) {
                                    curr++; maxCons = Math.max(maxCons, curr);
                                } else { curr = 1; }
                            }
                            
                            if (maxCons >= 4) { penaltyMult += 4; thoiMsg.push("4 Đôi Thông"); }
                            else if (maxCons === 3) { penaltyMult += 3; thoiMsg.push("3 Đôi Thông"); }

                            let congMoney = room.bet * penaltyMult;
                            if (isDutMu) congMoney *= 2; 

                            earlyTotalReward += congMoney;
                            updates[`players/${uid}/result`] = { type: 'lose', text: thoiMsg.join(' + '), amount: congMoney };
                            finishedPlayers.push(uid); 
                            
                            let extraLoss = congMoney - room.bet;
                            if (extraLoss > 0) {
                                fetch(app.tlWorkerApi, { 
                                    method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                                    body: JSON.stringify({ action: 'deductMinigameFee', safeKey: uid, cost: extraLoss }) 
                                });
                            }
                        }
                    });
                    updates['gameState/finishedPlayers'] = finishedPlayers;
                }

                if (finishedPlayers.length >= turnOrder.length - 1 || isDutMu) {
                    updates['status'] = 'finished';
                    
                    let lastPlayer = turnOrder.find(uid => !finishedPlayers.includes(uid));
                    if (lastPlayer) {
                        finishedPlayers.push(lastPlayer);
                        updates['gameState/finishedPlayers'] = finishedPlayers;
                    }
                    updates[`gameState/lastWinner`] = nhatId; 

                    let payouts = {};
                    turnOrder.forEach(uid => payouts[uid] = 0);
                    payouts[nhatId] += earlyTotalReward; 

                    if (isDutMu) {
                        turnOrder.forEach(uid => {
                            if (uid !== nhatId && !updates[`players/${uid}/result`]) {
                                payouts[uid] -= room.bet * 2;
                                payouts[nhatId] += room.bet * 2;
                                updates[`players/${uid}/result`] = { type: 'lose', text: "THUA ĐÚT MÙ", amount: room.bet * 2 };
                                
                                fetch(app.tlWorkerApi, { 
                                    method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                                    body: JSON.stringify({ action: 'deductMinigameFee', safeKey: uid, cost: room.bet }) 
                                });
                            }
                        });
                    } else {
                        let len = turnOrder.length;
                        if (len === 4) {
                            if (!updates[`players/${finishedPlayers[0]}/result`]) payouts[finishedPlayers[0]] += room.bet * 3;
                            if (!updates[`players/${finishedPlayers[1]}/result`]) payouts[finishedPlayers[1]] += room.bet * 1;
                            if (!updates[`players/${finishedPlayers[2]}/result`]) payouts[finishedPlayers[2]] -= room.bet * 1;
                            if (!updates[`players/${finishedPlayers[3]}/result`]) payouts[finishedPlayers[3]] -= room.bet * 3;
                        } else if (len === 3) {
                            if (!updates[`players/${finishedPlayers[0]}/result`]) payouts[finishedPlayers[0]] += room.bet * 2;
                            if (!updates[`players/${finishedPlayers[1]}/result`]) payouts[finishedPlayers[1]] += 0;
                            if (!updates[`players/${finishedPlayers[2]}/result`]) payouts[finishedPlayers[2]] -= room.bet * 2;
                        } else if (len === 2) {
                            if (!updates[`players/${finishedPlayers[0]}/result`]) payouts[finishedPlayers[0]] += room.bet * 1;
                            if (!updates[`players/${finishedPlayers[1]}/result`]) payouts[finishedPlayers[1]] -= room.bet * 1;
                        }

                        turnOrder.forEach(uid => {
                            if (uid !== nhatId && room.players[uid].hand && !updates[`players/${uid}/result`]) {
                                let loserHand = room.players[uid].hand;
                                let penaltyMult = 0;
                                let thoiMsg = [];
                                
                                let rankCounts = {};
                                loserHand.forEach(c => {
                                    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
                                    if (c.rank === '2') {
                                        if (c.color === 'black') { penaltyMult += 1; thoiMsg.push("Heo Đen"); }
                                        if (c.color === 'red') { penaltyMult += 2; thoiMsg.push("Heo Đỏ"); }
                                    }
                                    if (c.value === 0) { penaltyMult += 1; thoiMsg.push("3 Bích"); }
                                });

                                for (let r in rankCounts) {
                                    if (rankCounts[r] === 4 && r !== '2') { penaltyMult += 2; thoiMsg.push("Tứ Quý"); }
                                }

                                let pairRanks = [];
                                let sortedLoser = [...loserHand].sort((a,b) => a.value - b.value);
                                for(let i=0; i<sortedLoser.length-1; i++) {
                                    if (sortedLoser[i].rank === sortedLoser[i+1].rank && sortedLoser[i].rank !== '2') {
                                        let rIdx = app.tlRanks.indexOf(sortedLoser[i].rank);
                                        if (!pairRanks.includes(rIdx)) pairRanks.push(rIdx);
                                    }
                                }
                                pairRanks.sort((a,b)=>a-b);
                                let maxCons = 1, curr = 1;
                                for(let i=0; i<pairRanks.length-1; i++) {
                                    if (pairRanks[i+1] === pairRanks[i] + 1) {
                                        curr++; maxCons = Math.max(maxCons, curr);
                                    } else { curr = 1; }
                                }
                                
                                if (maxCons >= 4) { penaltyMult += 4; thoiMsg.push("4 Đôi Thông"); }
                                else if (maxCons === 3) { penaltyMult += 3; thoiMsg.push("3 Đôi Thông"); }
                                
                                if (penaltyMult > 0) {
                                    let thoiMoney = room.bet * penaltyMult;
                                    payouts[uid] -= thoiMoney;       
                                    payouts[nhatId] += thoiMoney;    
                                    
                                    let currentRankIndex = finishedPlayers.indexOf(uid);
                                    let baseLabels = ["NHẤT", "NHÌ", "BA", "BÉT"];
                                    let finalLabel = `${baseLabels[currentRankIndex]} + THỐI`;
                                    updates[`players/${uid}/resultTextTemp`] = finalLabel;
                                }
                            }
                        });

                        turnOrder.forEach((uid) => {
                            if (!updates[`players/${uid}/result`]) {
                                let finalMoney = payouts[uid];
                                let rankIndex = finishedPlayers.indexOf(uid);
                                let textLabels = ["TỚI NHẤT", "VỀ NHÌ", "VỀ BA", "CHÓT (BÉT)"];
                                
                                let finalLabel = updates[`players/${uid}/resultTextTemp`] || textLabels[rankIndex] || "BÉT";
                                delete updates[`players/${uid}/resultTextTemp`]; 

                                let resultType = finalMoney >= 0 ? (finalMoney > 0 ? 'win' : 'draw') : 'lose';
                                updates[`players/${uid}/result`] = { type: resultType, text: finalLabel, amount: Math.abs(finalMoney) };

                                let extraLoss = (-finalMoney) - room.bet;
                                if (extraLoss > 0) {
                                    fetch(app.tlWorkerApi, { 
                                        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                                        body: JSON.stringify({ action: 'deductMinigameFee', safeKey: uid, cost: extraLoss }) 
                                    });
                                }
                            }
                        });
                    }

                    turnOrder.forEach(uid => {
                        if (payouts[uid] > -room.bet) { 
                            fetch(app.tlWorkerApi, { 
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                                body: JSON.stringify({ action: 'minigameResult', safeKey: uid, amount: payouts[uid] + room.bet }) 
                            });
                        }
                    });

                } else {
                    let nextIdx = room.gameState.currentTurnIndex || 0;
                    let loopGuard = 0;
                    do {
                        nextIdx = (nextIdx + 1) % turnOrder.length;
                        loopGuard++;
                    } while ((updates[`gameState/passedPlayers`] && updates[`gameState/passedPlayers`].includes(turnOrder[nextIdx]) || finishedPlayers.includes(turnOrder[nextIdx])) && loopGuard < 10);
                    updates[`gameState/currentTurnIndex`] = nextIdx;
                }
            } else {
                let finishedPlayers = room.gameState.finishedPlayers || [];
                let nextIdx = room.gameState.currentTurnIndex || 0;
                let loopGuard = 0;
                do {
                    nextIdx = (nextIdx + 1) % turnOrder.length;
                    loopGuard++;
                    if(loopGuard > 10) break;
                } while ((updates[`gameState/passedPlayers`] && updates[`gameState/passedPlayers`].includes(turnOrder[nextIdx]) || finishedPlayers.includes(turnOrder[nextIdx]))); 
                updates[`gameState/currentTurnIndex`] = nextIdx;
            }

            db.ref(`tlmn_rooms/${this.tlRoomId}`).update(updates).then(() => { 
                this.tlState.selectedCards = []; 
            });
        } else {
            this.showToast("Bài không hợp lệ!", "error");
        }
    }).catch(err => {
        console.error("Lỗi đánh bài:", err);
        this.showToast("Lỗi đồng bộ máy chủ!", "error");
    });
};

app.tl_skipTurnOnline = function() {
    app.tlPlaySound('skip'); // PHÁT NHẠC BỎ LƯỢT

    const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
    db.ref(`tlmn_rooms/${this.tlRoomId}`).once('value').then(snap => {
        const room = snap.val();
        room.gameState = room.gameState || {};
        let passedPlayers = room.gameState.passedPlayers || [];
        let turnOrder = room.gameState.turnOrder || [];
        let finishedPlayers = room.gameState.finishedPlayers || [];
        
        if (!passedPlayers.includes(safeUser)) passedPlayers.push(safeUser);

        let activePlayersCount = turnOrder.filter(uid => !finishedPlayers.includes(uid)).length;

        let nextIdx = room.gameState.currentTurnIndex || 0;
        let loopGuard = 0;
        do {
            nextIdx = (nextIdx + 1) % turnOrder.length;
            loopGuard++;
            if (loopGuard > 10) break; 
        } while ((passedPlayers.includes(turnOrder[nextIdx]) || finishedPlayers.includes(turnOrder[nextIdx])) && passedPlayers.length < activePlayersCount);

        let updates = { 
            'gameState/passedPlayers': passedPlayers, 
            'gameState/currentTurnIndex': nextIdx,
            'gameState/turnStartTime': Date.now() + app.serverTimeOffset 
        };

        let isRoundClear = false;
        if (turnOrder[nextIdx] === room.gameState.lastPlayedBy) {
            isRoundClear = true;
        } else if (passedPlayers.length >= activePlayersCount || 
                  (passedPlayers.length === activePlayersCount - 1 && finishedPlayers.includes(room.gameState.lastPlayedBy))) {
            isRoundClear = true;
        }

        if (isRoundClear) {
            updates['gameState/passedPlayers'] = null; 
            updates['gameState/currentBoard'] = null; 

            if (finishedPlayers.includes(room.gameState.lastPlayedBy)) {
                let startIdx = turnOrder.indexOf(room.gameState.lastPlayedBy);
                let foundNext = startIdx;
                for(let i=1; i<turnOrder.length; i++) {
                    let checkIdx = (startIdx + i) % turnOrder.length;
                    if (!finishedPlayers.includes(turnOrder[checkIdx])) { foundNext = checkIdx; break; }
                }
                updates['gameState/currentTurnIndex'] = foundNext;
                updates['gameState/lastPlayedBy'] = turnOrder[foundNext];
            } else {
                let lastPlayerIdx = turnOrder.indexOf(room.gameState.lastPlayedBy);
                updates['gameState/currentTurnIndex'] = lastPlayerIdx !== -1 ? lastPlayerIdx : 0;
            }
        }
        db.ref(`tlmn_rooms/${this.tlRoomId}`).update(updates);
    });
};

// Đảm bảo không bị đè loader nếu có
window.addEventListener('load', () => {
    if(typeof assistant !== 'undefined') assistant.init();
    const loader = document.getElementById('page-loader');
    if(loader) {
        setTimeout(() => {
            loader.classList.add('fade-out');
            setTimeout(() => loader.style.display = 'none', 600);
        }, 1000); 
    }
});