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
	
	// HÀM MỚI: GỌI API THÔNG MINH CÓ BỘ NHỚ ĐỆM
    async fetchWithCache(url, cacheTime = 300) { 
        // cacheTime = 300 tức là lưu đệm 300 giây (5 phút)
        const cacheKey = "haruno_cache_" + url;
        const cachedItem = sessionStorage.getItem(cacheKey);

        if (cachedItem) {
            try {
                const { timestamp, data } = JSON.parse(cachedItem);
                // Kiểm tra xem dữ liệu còn hạn sử dụng không
                if (Date.now() - timestamp < cacheTime * 1000) {
                    console.log("⚡ Lấy dữ liệu từ Cache (Không tốn request):", url);
                    return data; 
                }
            } catch (e) {
                sessionStorage.removeItem(cacheKey);
            }
        }

        // Nếu chưa có cache hoặc cache đã quá hạn 5 phút, thì mới gọi lên NguonC
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
            // Nếu gọi API thật bị lỗi (do bị NguonC chặn), thử moi lại cache cũ dùng tạm
            if (cachedItem) return JSON.parse(cachedItem).data;
            return null;
        }
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

        const drawAmbient = () => {
            if(video.paused || video.ended) return;
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
        const pos = (e.clientX - rect.left) / rect.width;
        video.currentTime = pos * video.duration;
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

        if (m3u8Url) {
            customPlayer.style.display = 'block';
            video.style.display = 'block';
            if (iframe) {
                iframe.src = ''; 
                iframe.style.display = 'none';
            }

            if (Hls.isSupported()) {
                if (this.hlsInstance) this.hlsInstance.destroy();
                this.hlsInstance = new Hls();
                
                this.hlsInstance.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) {
                        console.warn("Lỗi tải video HLS, chuyển sang dự phòng", data);
                        customPlayer.style.display = 'none';
                        if (iframe) {
                            iframe.style.display = 'block';
                            iframe.src = embedUrl;
                        }
                    }
                });

                this.hlsInstance.loadSource(m3u8Url);
                this.hlsInstance.attachMedia(video);
                this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, function() {
                    video.play().catch(e => console.log("Trình duyệt chặn autoplay"));
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = m3u8Url;
                video.addEventListener('loadedmetadata', function() {
                    video.play().catch(e => console.log("Trình duyệt chặn autoplay"));
                });
            }
        } else if (embedUrl) {
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
        checkShopButton('btn-shop-premium', '3_days', 1000);
        checkShopButton('btn-shop-tinhnghich', 'effect-tinhnghich', 500);
        checkShopButton('btn-shop-yunara', 'frame-yunara', 300);
        checkShopButton('btn-shop-shoto', 'frame-shoto', 300);
		checkShopButton('btn-shop-pandora', 'frame-pandora', 300);
		checkShopButton('btn-shop-shenron', 'frame-shenron', 300);
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

            snap.forEach(child => {
                const room = child.val();
                const roomId = child.key;
                const safePlayer = room.player1.split('_')[0]; 
                
                // KIỂM TRA: Nếu phòng này do chính mình tạo
                if (room.player1 === safeUser) {
                    listEl.innerHTML += `
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
                    listEl.innerHTML += `
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
            newRoomRef.onDisconnect().remove(); 

            newRoomRef.set({
                player1: safeUser, player2: '', bet: betAmount, 
                status: 'waiting', turn: 'X', moves: {}
            });
            
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
                roomRef.onDisconnect().cancel();
                roomRef.onDisconnect().remove();

                roomRef.update({ player2: safeUser, status: 'playing' });
                
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
                const winnerName = room.winner === p1Key ? (p1Data.displayName || p1Key.split('_')[0]) : (p2Key ? ((this.usersData[p2Key] || {}).displayName || p2Key.split('_')[0]) : room.winner);
                
                let textResult = `🏆 KẾT THÚC! ${winnerName.toUpperCase()} THẮNG!`;
                
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
    wheelPrizes: [
        { label: '💵', type: 'coin', value: 10 },
        { label: '💰', type: 'coin', value: 100 },
        { label: 'Xui Thôi', type: 'none', value: 0 },
        { label: '💰', type: 'coin', value: 50 },
        { label: '💵', type: 'coin', value: 20 },
        { label: '💎', type: 'coin', value: 200 }
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
        
        this.wheelPrizes.forEach((prize, index) => {
            const textEl = document.createElement('div');
            textEl.className = 'wheel-slice-text';
            // Căn xoay chữ vào đúng giữa mỗi múi màu
            textEl.style.transform = `rotate(${index * sliceAngle + sliceAngle/2}deg)`;
            textEl.innerText = prize.label;
            wheel.appendChild(textEl);
        });
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

            // Bắt đầu quay
            this.isSpinning = true;
            const btn = document.getElementById('btn-spin-wheel');
            btn.innerText = 'ĐANG QUAY...';
            btn.style.pointerEvents = 'none';

            const prizeIndex = Math.floor(Math.random() * this.wheelPrizes.length);
            const sliceAngle = 360 / this.wheelPrizes.length;
            const spinSpins = 5 * 360; 
            const baseTarget = 270 - (prizeIndex * sliceAngle + sliceAngle / 2);
            const randomOffset = Math.floor(Math.random() * 40) - 20; 
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
                    app.showToast(`🎉 Chúc mừng! Bạn trúng ${prize.value} HCoins`, "success");
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
    // HỆ THỐNG XÌ DÁCH: 4 NGƯỜI CHƠI & CÁI XÉT BÀI
    // ==========================================
    bjRoomId: null,

    openBjLobby() {
        const email = localStorage.getItem('haruno_email');
        if (!email) { this.openAuthModal(); return; }
        document.getElementById('bj-lobby-modal').style.display = 'flex';
        this.listenBjRooms();
    },

    closeBjLobby() {
        document.getElementById('bj-lobby-modal').style.display = 'none';
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

            snap.forEach(child => {
                const room = child.val();
                const roomId = child.key;
                const playerCount = room.players ? Object.keys(room.players).length : 1;
                const creatorName = room.players[room.dealerId]?.name || "Người chơi";

                if (room.players && room.players[safeUser]) {
                    listEl.innerHTML += `
                        <div class="bj-room-item" style="border-color: #ffd700; background: rgba(255,215,0,0.05);">
                            <div class="bj-room-info">
                                <h4 style="color: #ffd700;"><i class="fas fa-crown"></i> Bàn bạn đang tham gia (${playerCount}/4)</h4>
                                <p><i class="fas fa-coins"></i> Cược: ${room.bet.toLocaleString()} HCoins</p>
                            </div>
                            <button onclick="app.rejoinBjRoom('${roomId}')" class="btn-join-room" style="background: #f39c12;">VÀO LẠI BÀN</button>
                        </div>`;
                } else if (playerCount < 4) {
                    listEl.innerHTML += `
                        <div class="bj-room-item">
                            <div class="bj-room-info">
                                <h4><i class="fas fa-user-secret"></i> Sòng của ${creatorName} (${playerCount}/4)</h4>
                                <p><i class="fas fa-coins"></i> Cược: ${room.bet.toLocaleString()} HCoins</p>
                            </div>
                            <button onclick="app.joinBjRoom('${roomId}', ${room.bet})" class="btn-join-room">VÀO CHƠI</button>
                        </div>`;
                }
            });
        });
    },

    createBjRoom() {
        const email = localStorage.getItem('haruno_email');
        const betAmount = parseInt(document.getElementById('bj-bet-amount').value);
        if (isNaN(betAmount) || betAmount <= 0) { this.showToast("Nhập cược hợp lệ!", "error"); return; }
        
        const safeUser = this.getSafeKey(email);
        const myData = this.usersData[safeUser] || {};
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

            const myData = this.usersData[safeUser] || {};
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
        document.getElementById('bj-game-modal').style.display = 'flex';
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
        
        // Tính tổng các lá thường và đếm số lượng lá A
        for (let c of cards) {
            if (['J', 'Q', 'K'].includes(c.value)) sum += 10;
            else if (c.value === 'A') { aces += 1; }
            else sum += parseInt(c.value);
        }

        if (aces === 0) return sum;

        let bestScore = -1;
        let minScore = sum + aces; // Mặc định nếu quắc hết thì A tính là 1

        // Hàm thử tất cả các trường hợp của lá A (1, 10, 11) để lấy điểm cao nhất <= 21
        const tryAces = (currentSum, acesLeft) => {
            if (acesLeft === 0) {
                if (currentSum <= 21 && currentSum > bestScore) bestScore = currentSum;
                return;
            }
            tryAces(currentSum + 1, acesLeft - 1);  // Thử A = 1
            tryAces(currentSum + 10, acesLeft - 1); // Thử A = 10
            tryAces(currentSum + 11, acesLeft - 1); // Thử A = 11
        };

        tryAces(sum, aces);
        
        // Trả về điểm ngon nhất, nếu mọi trường hợp đều > 21 thì trả về điểm min
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
        if (resultType === 'win') { // Con thắng
            target.result = { type: 'win', text: '+ ' + bet };
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'minigameResult', safeKey: playerId, amount: bet * 2 }) });
        } else if (resultType === 'lose') { // Cái ăn
            target.result = { type: 'lose', text: '- ' + bet };
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'minigameResult', safeKey: dealerId, amount: bet * 2 }) });
        } else { // Hòa
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
            
            // Chia 2 lá cho tất cả
            for (let pk of Object.keys(validPlayers)) {
                validPlayers[pk].cards = [deck.pop(), deck.pop()];
                validPlayers[pk].state = 'playing';
                validPlayers[pk].score = this.getScore(validPlayers[pk].cards);
                validPlayers[pk].result = null; 
            }

            // XÉT XÌ DÁCH / XÌ BÀNG NGAY LÚC CHIA BÀI
            let dealer = validPlayers[safeUser];
            let dXB = this.isXiBang(dealer.cards);
            let dXD = this.isXiDach(dealer.cards);

            if (dXB || dXD) {
                // CÁI CÓ XÌ DÁCH/XÌ BÀNG -> Ăn sạch, kết thúc ván luôn
                for (let pk in validPlayers) {
                    if (pk === safeUser) continue;
                    let p = validPlayers[pk];
                    let pXB = this.isXiBang(p.cards);
                    let pXD = this.isXiDach(p.cards);
                    
                    let resultType = 'lose'; // Mặc định con thua
                    if (dXB) {
                        if (pXB) resultType = 'draw';
                    } else if (dXD) {
                        if (pXB) resultType = 'win'; // Con Xì Bàng ăn Cái Xì Dách
                        else if (pXD) resultType = 'draw';
                    }

                    this.processBjPayout(safeUser, pk, resultType, room.bet, validPlayers);
                    validPlayers[pk].state = 'checked';
                }
                dealer.state = 'checked';
                
                db.ref(`bj_rooms/${this.bjRoomId}`).update({
                    status: 'checking', deck: deck, pot: totalPot, players: validPlayers,
                    turnOrder: [], currentTurnIndex: 0
                });
                return;
            }

            // NẾU CÁI KHÔNG CÓ -> Con nào có thì tự động lật ngửa bài ăn tiền, bỏ qua lượt rút
            let turnOrder = [];
            for (let pk in validPlayers) {
                if (pk === safeUser) continue;
                let p = validPlayers[pk];
                let pXB = this.isXiBang(p.cards);
                let pXD = this.isXiDach(p.cards);

                if (pXB || pXD) {
                    this.processBjPayout(safeUser, pk, 'win', room.bet, validPlayers); // Con tự động ăn tiền
                    p.state = 'checked'; 
                } else {
                    turnOrder.push(pk); // Ai không có mới phải bốc bài
                }
            }
            turnOrder.push(safeUser); // Lượt của Cái luôn ở cuối cùng

            // Chuyển sang chơi, nếu mọi nhà con đều Xì dách thì nhảy qua phần Cái rút bài luôn
            let nextStatus = turnOrder.length === 1 ? 'checking' : 'playing'; 
            
            db.ref(`bj_rooms/${this.bjRoomId}`).update({
                status: nextStatus, deck: deck, pot: totalPot, players: validPlayers,
                turnOrder: turnOrder, currentTurnIndex: 0
            });
        });
    },

    khuiBai(targetPlayerId) {
        if (!this.bjRoomId) return;
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));
        
        db.ref(`bj_rooms/${this.bjRoomId}`).once('value').then(snap => {
            const room = snap.val();
            if (room.status !== 'checking' || room.dealerId !== safeUser) return;
            
            let dealer = room.players[safeUser];
            let target = room.players[targetPlayerId];
            if (!target || target.state === 'checked' || target.state === 'waiting') return;

            // XÉT THẮNG THUA (Lúc này không còn Xì Dách vì đã tự xét lúc chia, chỉ còn Ngũ Linh và Điểm)
            let resultType = ''; // win (con thắng), lose (con thua, cái ăn), draw
            let ds = dealer.score, ts = target.score;
            let dNL = dealer.cards.length === 5 && ds <= 21;
            let tNL = target.cards.length === 5 && ts <= 21;

            if (dNL || tNL) {
                if (dNL && tNL) resultType = ds < ts ? 'lose' : (ts < ds ? 'win' : 'draw'); // Ngũ linh điểm NHỎ hơn sẽ ăn
                else resultType = dNL ? 'lose' : 'win'; // Cái ngũ linh thì con thua
            } else if (ds > 21 || ts > 21) {
                if (ds > 21 && ts > 21) resultType = 'draw'; // Cùng quắc là hòa
                else resultType = ds > 21 ? 'win' : 'lose'; // Cái quắc thì con win
            } else {
                resultType = ts > ds ? 'win' : (ds > ts ? 'lose' : 'draw'); // So điểm
            }

            // Gọi hàm tính tiền
            this.processBjPayout(safeUser, targetPlayerId, resultType, room.bet, room.players);
            
            room.players[targetPlayerId].state = 'checked';
            db.ref(`bj_rooms/${this.bjRoomId}/players/${targetPlayerId}`).update(room.players[targetPlayerId]);
        });
    },

    listenBjGame() {
        if (!db || !this.bjRoomId) return;
        const safeUser = this.getSafeKey(localStorage.getItem('haruno_email'));

        db.ref(`bj_rooms/${this.bjRoomId}`).on('value', snap => {
            const room = snap.val();
            if (!room || !room.players || !room.players[safeUser]) {
                document.getElementById('bj-game-modal').style.display = 'none';
                this.bjRoomId = null;
                this.showToast("Bàn đã giải tán hoặc bạn bị kích!", "warning");
                return;
            }

            document.getElementById('bj-room-id-text').innerText = this.bjRoomId.substring(1, 6);
            document.getElementById('bj-room-bet-text').innerText = room.bet;
            document.getElementById('bj-current-pot').innerText = (room.pot || 0).toLocaleString();

            const dealerArea = document.getElementById('bj-dealer-area');
            const playersArea = document.getElementById('bj-players-area');
            const statusMsg = document.getElementById('bj-status-msg');
            const controls = document.getElementById('bj-controls');
            
            dealerArea.innerHTML = ''; playersArea.innerHTML = '';
            controls.style.display = 'none';
            document.getElementById('btn-bj-start').style.display = 'none';
            document.getElementById('btn-bj-hit').style.display = 'none';
            document.getElementById('btn-bj-stand').style.display = 'none';

            const createCardHTML = (c, hidden) => hidden ? `<div class="playing-card hidden-card" style="border:2px solid #fff; background: linear-gradient(135deg, #b71c1c, #c62828); color: transparent;"></div>` : `<div class="playing-card" style="background:#fff; color:${c.color}; border:1px solid #ccc;"><div class="card-top" style="font-size:12px;">${c.value}</div><div class="card-center" style="font-size:20px;">${c.suit}</div></div>`;

            let currentTurnPlayer = room.turnOrder ? room.turnOrder[room.currentTurnIndex] : null;
            
            // SỬA LỖI Ở ĐÂY: Lấy myRole TRƯỚC khi chạy vòng lặp vẽ giao diện
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
                    // Luật ngửa bài: Bài của mình HOẶC ván kết thúc HOẶC đã bị khui HOẶC bị quắc
                    if (isMe || room.status === 'finished' || p.state === 'checked' || p.state === 'busted') {
                        cardsHTML = p.cards.map(c => createCardHTML(c, false)).join('');
                        let isXD = this.isXiDach(p.cards);
                    let isXB = this.isXiBang(p.cards);
                    let isNL = p.cards.length === 5 && p.score <= 21;
                    
                    if (isXB) scoreText = 'XÌ BÀN';
                    else if (isXD) scoreText = 'XÌ ZÁCH';
                    else if (isNL) scoreText = 'NGŨ LINH';
                    else scoreText = p.score > 21 ? 'QUẮC' : p.score;
                    } else {
                        // Che bài người khác
                        cardsHTML = p.cards.map(() => createCardHTML(null, true)).join('');
                    }
                }

                // Lấy thông tin Khung và VIP từ usersData
                let pData = this.usersData[pk] || {};
                let isPremium = pData.isPremium ? true : false;
                let rankClass = isPremium ? 'premium' : '';
                let avatarFrame = isPremium && pData.avatarFrame && pData.avatarFrame !== 'none' ? pData.avatarFrame : '';
                let frameHtml = avatarFrame ? `<div class="avatar-frame ${avatarFrame}"></div>` : '';

                let slotHTML = `
                    <div class="bj-player-slot ${isActive ? 'active-turn' : ''}">
                        ${(room.status === 'checking' && myRole === 'dealer' && !isDealer && p.state !== 'checked' && p.state !== 'waiting') ? `<button class="btn-khui" onclick="app.khuiBai('${pk}')">KHUI BÀI</button>` : ''}
                        ${p.result ? `<div class="bj-result-tag ${p.result.type}">${p.result.text}</div>` : ''}
                        <div class="bj-player-badge" style="border-color: ${isMe ? '#00ffcc' : (isDealer ? '#ffd700' : '#444')};">
                            
                            <div class="comment-avatar ${rankClass}" style="width: 50px; height: 50px; margin-bottom: 5px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" onclick="app.showUserProfile('${pk}', '${p.name.replace(/'/g, "\\'")}', '${p.avatar}')" title="Xem hồ sơ">
                                <img src="${p.avatar}" style="border: 2px solid ${isDealer ? '#ffd700' : '#fff'}; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; position: relative; z-index: 2;">
                                ${frameHtml}
                            </div>
                            
                            <span class="bj-name" style="color: ${isDealer ? '#ffd700' : '#fff'};">${isDealer ? '👑 ' : ''}${p.name}</span>
                            <span class="bj-score">${scoreText}</span>
                        </div>
                        <div class="bj-cards-area">${cardsHTML}</div>
                    </div>`;

                if (isDealer) dealerArea.innerHTML = slotHTML;
                else playersArea.innerHTML += slotHTML;
            }

            // XỬ LÝ TRẠNG THÁI BÀN
            if (room.status === 'waiting') {
                statusMsg.innerText = "Đang chờ người chơi...";
                if (myRole === 'dealer') {
                    controls.style.display = 'flex';
                    document.getElementById('btn-bj-start').style.display = 'block';
                }
            } else if (room.status === 'playing') {
                if (currentTurnPlayer === safeUser) {
                    statusMsg.innerText = "Tới lượt bạn rút bài!";
                    statusMsg.style.color = "#00ffcc";
                    controls.style.display = 'flex';
                    document.getElementById('btn-bj-hit').style.display = 'block';
                    document.getElementById('btn-bj-stand').style.display = 'block';
                } else {
                    const activeName = room.players[currentTurnPlayer]?.name;
                    statusMsg.innerText = `Đang chờ ${activeName} hành động...`;
                    statusMsg.style.color = "#ff9800";
                }
            } else if (room.status === 'checking') {
                if (myRole === 'dealer') {
                    statusMsg.innerText = "Bạn đã đủ tuổi. Hãy chọn người để Khui Bài!";
                    statusMsg.style.color = "#ffd700";
                } else {
                    statusMsg.innerText = "Nhà Cái đang xét bài...";
                    statusMsg.style.color = "#ff4d4d";
                }
                
                // Tự động kết thúc ván nếu tất cả đã được xét xong
                let allChecked = true;
                for(let k in room.players) { 
                    if(room.players[k].role !== 'dealer' && room.players[k].state !== 'checked' && room.players[k].state !== 'waiting') allChecked = false; 
                }
                if(allChecked && myRole === 'dealer') {
                    setTimeout(() => { db.ref(`bj_rooms/${this.bjRoomId}`).update({ status: 'waiting' }); }, 3000);
                }

            } else if (room.status === 'finished') {
                statusMsg.innerText = "Ván đấu kết thúc! Chuẩn bị ván mới...";
                if (myRole === 'dealer') {
                    setTimeout(() => { db.ref(`bj_rooms/${this.bjRoomId}`).update({ status: 'waiting' }); }, 3000);
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
                    if (updates.currentTurnIndex >= room.turnOrder.length) updates.status = 'checking'; // Lượt cuối của Cái
                }
                db.ref(`bj_rooms/${this.bjRoomId}`).update(updates);

            } else if (action === 'stand') {
                // LUẬT ĐỦ TUỔI: Con >= 16, Cái >= 15
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
            if (room.status !== 'checking' || room.dealerId !== safeUser) return;
            
            let dealer = room.players[safeUser];
            let target = room.players[targetPlayerId];
            if (!target || target.state === 'checked' || target.state === 'waiting') return;

            // XÉT THẮNG THUA
            let resultType = ''; // win (cái ăn), lose (con ăn), draw
            let ds = dealer.score, ts = target.score;
            let dNL = dealer.cards.length === 5 && ds <= 21;
            let tNL = target.cards.length === 5 && ts <= 21;

            if (dNL || tNL) {
                if (dNL && tNL) resultType = ds < ts ? 'win' : (ts < ds ? 'lose' : 'draw'); // Ngũ linh nhỏ hơn ăn
                else resultType = dNL ? 'win' : 'lose';
            } else if (ds > 21 || ts > 21) {
                if (ds > 21 && ts > 21) resultType = 'draw';
                else resultType = ds > 21 ? 'lose' : 'win';
            } else {
                resultType = ds > ts ? 'win' : (ts > ds ? 'lose' : 'draw');
            }

            // Xử lý tiền (Gọi API 1 lần duy nhất để cộng cho người thắng)
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
            db.ref(`bj_rooms/${this.bjRoomId}/players/${targetPlayerId}`).update(target);
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
                    db.ref(`bj_rooms/${roomId}`).remove(); // Cái thoát -> Hủy luôn bàn
                    this.showToast("Phòng đã giải tán do Nhà Cái rời đi!", "warning");
                } else {
                    db.ref(`bj_rooms/${roomId}/players/${safeUser}`).remove(); // Con thoát -> Rời ghế
                }
            }
        });
        
        db.ref(`bj_rooms/${this.bjRoomId}`).off();
        document.getElementById('bj-game-modal').style.display = 'none';
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
                    <a href="javascript:void(0)" class="um-item" onclick="app.openPremiumModal()" style="color: #ffd700;"><i class="fas fa-crown"></i> Nâng cấp Premium</a>
                    <a href="javascript:void(0)" class="um-item um-logout" onclick="app.logout()"><i class="fas fa-sign-out-alt"></i> Đăng xuất</a>
                </div>
            `;

            if(db) {
                db.ref('users/' + safeKey).on('value', snap => {
                    const uData = snap.val() || {};
                    const isPremium = uData.isPremium ? true : false;
					
					// THÊM DÒNG NÀY ĐỂ LƯU KHO ĐỒ VÀO MÁY
                    localStorage.setItem('haruno_inventory', JSON.stringify(uData.inventory || {}));
                    
                    const navAvatar = document.getElementById('nav-avatar-wrap');
                    const navName = document.getElementById('nav-user-name');
                    const navUmName = document.getElementById('nav-um-name');

                    if(navAvatar) navAvatar.className = `comment-avatar ${isPremium ? 'premium' : this.getRankClass(email)}`;
                    if(navName) navName.className = `user-name pc-only-flex ${isPremium ? 'premium-name' : ''}`;
                    if(navUmName) navUmName.className = `um-name ${isPremium ? 'premium-name' : ''}`;
                    
                    const navFrame = document.getElementById('nav-avatar-frame');
                    if (navFrame) {
                        navFrame.className = 'avatar-frame';
                        if (isPremium && uData.avatarFrame && uData.avatarFrame !== 'none') {
                            navFrame.classList.add(uData.avatarFrame);
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
                        document.body.classList.remove('theme-holo-blue', 'theme-holo-pink', 'theme-holo-gold', 'theme-holo-cyber', 'theme-holo-galaxy');
                        document.body.classList.add(pTheme);
                    } else {
                        document.body.classList.remove('premium-theme', 'theme-holo-blue', 'theme-holo-pink', 'theme-holo-gold', 'theme-holo-cyber', 'theme-holo-galaxy');
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
		
		this.updatePresence(); // <--- THÊM DÒNG NÀY ĐỂ BÁO ONLINE NGAY KHI ĐĂNG NHẬP
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
            db.ref(`users/${safeUser}`).update({
                displayName: finalName,
                avatar: finalAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(finalName)}`
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
        if (this.currentMovieSlug === 'goc-review', 'review') {
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
				
				const chatFrameList = isPremium && ownerData.chatFrame && ownerData.chatFrame !== 'none' ? ownerData.chatFrame : ''; // MỚI

                const isFeatured = c.isPinned || c.isTop;
                const featuredClass = isFeatured ? 'featured-comment' : '';
                const featuredBadge = isFeatured ? `<div class="featured-badge"><i class="fas fa-crown"></i> Tiêu Biểu</div>` : '';
				
                // KIỂM TRA VÀ CHÈN VIDEO BACKGROUND (MAIN COMMENTS)
                let videoUrl = '';
                if (chatFrameList === 'chat-gothica') videoUrl = 'https://cdn.discordapp.com/assets/collectibles/nameplates/gothica/nevermore/asset.webm';
                else if (chatFrameList === 'chat-love') videoUrl = 'https://cdn.discordapp.com/assets/collectibles/nameplates/minnie_true_love/1471910272783482993/asset.webm';
                
                const videoBg = videoUrl ? `<video autoplay loop muted playsinline class="chat-frame-bg-video"><source src="${videoUrl}" type="video/webm"></video>` : '';

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
						
						const repChatFrame = repIsPremium && repOwnerData.chatFrame && repOwnerData.chatFrame !== 'none' ? repOwnerData.chatFrame : ''; // MỚI
						
						// KIỂM TRA VÀ CHÈN VIDEO BACKGROUND (REPLIES)
                        let repVideoUrl = '';
                        if (repChatFrame === 'chat-gothica') repVideoUrl = 'https://cdn.discordapp.com/assets/collectibles/nameplates/gothica/nevermore/asset.webm';
                        else if (repChatFrame === 'chat-love') repVideoUrl = 'https://cdn.discordapp.com/assets/collectibles/nameplates/love_xp/love_meter/asset.webm';
                        
                        const repVideoBg = repVideoUrl ? `<video autoplay loop muted playsinline class="chat-frame-bg-video"><source src="${repVideoUrl}" type="video/webm"></video>` : '';

                        return `
                        <div class="reply-item">
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
                        ${videoBg} ${featuredBadge}
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
                fetch(`${API_URL}/films/quoc-gia/han-quoc?page=1`),
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
                // Thêm timestamp vào cuối để ép tải mới
                urls.push(`${API_URL}/films/phim-moi-cap-nhat?page=${apiPage}&_v=${new Date().getTime()}`);
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
                    let backupRes = await fetch(`${API_URL}/films/phim-moi-cap-nhat?page=1&_v=${new Date().getTime()}`);
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
	
	// HÀM: XỬ LÝ CỘNG COINS KHI NHẬT QUÀ
    claimGift() {
        const email = localStorage.getItem('haruno_email');
        if (email) {
            const safeUser = app.getSafeKey(email);
            fetch("https://throbbing-disk-3bb3.thienbm101102.workers.dev", {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'claimHaruGift', safeKey: safeUser })
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

// Khởi tạo các thành phần khi load trang
window.addEventListener('load', () => {
    assistant.init();
    
    // Logic ẩn màn hình Loading
    const loader = document.getElementById('page-loader');
    if(loader) {
        setTimeout(() => {
            loader.classList.add('fade-out');
            setTimeout(() => loader.style.display = 'none', 600);
        }, 1000); 
    }
});