function checkActiveSession() {
    const savedUser =
        localStorage.getItem('wardrobe_current_user');

    const displayName =
        localStorage.getItem('wardrobe_display_name');

    if (savedUser) {
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

    // เซฟลง localStorage (Offline Fallback เพื่อให้ใช้งานได้ทันที 100%)
    let users = JSON.parse(localStorage.getItem('wardrobe_users')) || [];
    if (users.some(u => u.username === username)) {
        alert('ชื่อผู้ใช้นี้ (Username) ถูกใช้งานไปแล้ว');
        return;
    }

    users.push({ username, displayName, password });
    localStorage.setItem('wardrobe_users', JSON.stringify(users));

    // พยายาม Sync กับ Backend หาก Backend กำลังรันอยู่
    try {
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000/api/auth/register'
            : 'https://longlook-backend.onrender.com/api/auth/register';

        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, displayName, password })
        }).catch(() => {});
    } catch (e) {}

    document.getElementById('reg-user').value = '';
    document.getElementById('reg-display-name').value = '';
    document.getElementById('reg-pass').value = '';
    document.getElementById('reg-pass-confirm').value = '';

    if (typeof showPopup === 'function') {
        showPopup('🎉 สมัครสมาชิกสำเร็จ!', () => {
            loginSuccess(username, displayName);
        });
    } else {
        alert('🎉 สมัครสมาชิกสำเร็จ!');
        loginSuccess(username, displayName);
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pass').value;

    if (!username || !password) {
        alert('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        return;
    }

    // 1. ตรวจสอบจาก Local Storage (Offline Mode)
    let users = JSON.parse(localStorage.getItem('wardrobe_users')) || [];
    let foundUser = users.find(u => u.username === username && u.password === password);

    if (foundUser) {
        loginSuccess(foundUser.username, foundUser.displayName || foundUser.username);
        return;
    }

    // 2. ถ้าใน Local ไม่มี ให้ลองยิงถาม Backend Server
    try {
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000/api/auth/login'
            : 'https://longlook-backend.onrender.com/api/auth/login';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (response.ok && data.user) {
            loginSuccess(data.user.username, data.user.displayName || data.user.username);
            return;
        }
    } catch (e) {}

    // 3. Demo Fallback: ให้ผู้ใช้เข้าสู่ระบบได้ทันที
    alert('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (หากเพิ่งใช้งาน ให้กด "สมัครสมาชิก" ก่อนนะครับ)');
}

function loginSuccess(username, displayName) {
    isLoggedIn = true;

    localStorage.setItem(
        'wardrobe_current_user',
        username
    );

    localStorage.setItem(
        'wardrobe_display_name',
        displayName
    );

    showPopup(`💜 ยินดีต้อนรับคุณ ${displayName}`, () => {
        updateUserUI(displayName);
        switchPage('home');
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

    localStorage.removeItem('wardrobe_current_user');
    localStorage.removeItem('wardrobe_display_name');

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