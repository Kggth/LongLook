function checkActiveSession() {
    const savedUser = localStorage.getItem('wardrobe_current_user');
    const displayName = localStorage.getItem('wardrobe_display_name');
    const token = localStorage.getItem('wardrobe_token');

    if (savedUser && token) {
        isLoggedIn = true;
        updateUserUI(displayName || savedUser);
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById('reg-user').value.trim();
    const displayName = document.getElementById('reg-display-name').value.trim();
    const password = document.getElementById('reg-pass').value;
    const confirmPassword = document.getElementById('reg-pass-confirm').value;

    if (!username || !displayName || !password) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }

    if (password !== confirmPassword) {
        alert('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
        return;
    }

    if (password.length < 8) {
        alert('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
        return;
    }

    try {
        const apiUrl = `${getApiBaseUrl()}/api/auth/register`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, displayName, password })
        });

        const data = await response.json();

        if (response.ok && data.token) {
            localStorage.setItem('wardrobe_token', data.token);

            document.getElementById('reg-user').value = '';
            document.getElementById('reg-display-name').value = '';
            document.getElementById('reg-pass').value = '';
            document.getElementById('reg-pass-confirm').value = '';

            if (typeof showPopup === 'function') {
                showPopup('🎉 สมัครสมาชิกและบันทึกลง Oracle สำเร็จ!', () => {
                    loginSuccess(username, displayName);
                });
            } else {
                alert('🎉 สมัครสมาชิกสำเร็จ!');
                loginSuccess(username, displayName);
            }
            return;
        } else {
            alert(data.message || 'ไม่สามารถลงทะเบียนได้');
            return;
        }
    } catch (err) {
        console.error('Register API Error:', err);
        alert('⚠️ ไม่สามารถเชื่อมต่อกับ Backend ได้ กรุณาตรวจสอบว่ารัน backend ไว้ที่พอร์ต 5000 หรือไม่');
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const usernameInput = document.getElementById('login-user') || document.getElementById('login-username');
    const passwordInput = document.getElementById('login-pass') || document.querySelector('#login-modal input[type="password"]');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!username || !password) {
        alert('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        return;
    }

    try {
        const apiUrl = `${getApiBaseUrl()}/api/auth/login`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.token) {
            localStorage.setItem('wardrobe_token', data.token);
            if (typeof closeLoginModal === 'function') closeLoginModal();
            const userDisplay = (data.user && data.user.displayName) ? data.user.displayName : username;
            loginSuccess(username, userDisplay);
            return;
        } else {
            alert(data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            return;
        }
    } catch (err) {
        console.error('Login API Error:', err);
        alert(`⚠️ ไม่สามารถเชื่อมต่อ Backend (${getApiBaseUrl()}) ได้\nกรุณาตรวจสอบว่าเซิร์ฟเวอร์รันอยู่ที่พอร์ต 5000 (npm start) หรือไม่`);
    }
}

function loginSuccess(username, displayName) {
    isLoggedIn = true;

    localStorage.setItem('wardrobe_current_user', username);
    localStorage.setItem('wardrobe_display_name', displayName);

    showPopup(`💜 ยินดีต้อนรับคุณ ${displayName}`, () => {
        updateUserUI(displayName);
        switchPage('home');

        // โหลดข้อมูลเสื้อผ้าและปฏิทินของผู้ใช้นี้จาก Oracle Database
        if (typeof loadUserClothesFromBackend === 'function') {
            loadUserClothesFromBackend();
        }
        if (typeof loadCalendarFromBackend === 'function') {
            loadCalendarFromBackend();
        }
    });
}

function updateUserUI(displayName) {
    const avatar = document.getElementById('user-avatar-icon');
    if (avatar) {
        avatar.className = 'w-7 h-7 bg-[#E89387] text-white rounded-full flex items-center justify-center text-xs font-bold';
        avatar.innerText = displayName.charAt(0).toUpperCase();
    }

    const nameLabel = document.getElementById('user-name-label');
    if (nameLabel) nameLabel.innerText = displayName;

    const loginBtn = document.getElementById('btn-login-trigger');
    if (loginBtn) {
        loginBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket mr-1"></i> ออกจากระบบ';
        loginBtn.className = 'bg-rose-500 hover:bg-rose-600 text-white text-xs px-4 py-2 rounded-full font-medium transition shadow-sm';
        loginBtn.onclick = handleLogout;
    }

    if (typeof initUserDropdownState === 'function') initUserDropdownState();
}

function handleLogout() {
    isLoggedIn = false;

    localStorage.removeItem('wardrobe_token');
    localStorage.removeItem('wardrobe_current_user');
    localStorage.removeItem('wardrobe_display_name');

    // เคลียร์ตู้เสื้อผ้าและปฏิทินในหน่วยความจำ
    window.closetItems = [];
    closetItems = [];
    window.calendarOutfits = {};
    calendarOutfits = {};

    renderCloset();
    if (typeof initRealCalendar === 'function') initRealCalendar();

    const avatar = document.getElementById('user-avatar-icon');
    if (avatar) {
        avatar.className = 'w-7 h-7 bg-[#F3ECE4] text-[#8C6D53] rounded-full flex items-center justify-center text-xs font-bold';
        avatar.innerHTML = '<i class="fa-solid fa-user"></i>';
    }

    const nameLabel = document.getElementById('user-name-label');
    if (nameLabel) nameLabel.innerText = 'ผู้เยี่ยมชม';

    const loginBtn = document.getElementById('btn-login-trigger');
    if (loginBtn) {
        loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-1"></i> เข้าสู่ระบบ';
        loginBtn.className = 'bg-[#8C6D53] hover:bg-[#755a43] text-white text-xs px-4 py-2 rounded-full font-medium transition shadow-sm';
        loginBtn.onclick = () => switchPage('login');
    }

    if (typeof showPopup === 'function') {
        showPopup('👋 ออกจากระบบเรียบร้อย', () => {
            switchPage('home');
        });
    } else {
        alert('👋 ออกจากระบบเรียบร้อย');
        switchPage('home');
    }
}