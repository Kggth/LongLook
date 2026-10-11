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

    const username =
        document.getElementById('reg-user').value.trim();

    const displayName =
        document.getElementById('reg-display-name').value.trim();

    const password =
        document.getElementById('reg-pass').value;

    const confirmPassword =
        document.getElementById('reg-pass-confirm').value;

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

        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000/api/auth/register'
            : 'https://longlook-backend.onrender.com/api/auth/register';

        const response = await fetch(apiUrl,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username,
                    displayName,
                    password
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || 'สมัครสมาชิกไม่สำเร็จ');
            return;
        }

        document.getElementById('reg-user').value = '';
        document.getElementById('reg-display-name').value = '';
        document.getElementById('reg-pass').value = '';
        document.getElementById('reg-pass-confirm').value = '';

        showPopup('🎉 สมัครสมาชิกสำเร็จ!', () => {
            loginSuccess(username, displayName);
        });

    } catch (error) {
        console.error('Register error:', error);
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบ Backend');
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const username =
        document.getElementById('login-user').value.trim();

    const password =
        document.getElementById('login-pass').value;

    if (!username || !password) {
        alert('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        return;
    }

    try {
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000/api/auth/login'
            : 'https://longlook-backend.onrender.com/api/auth/login';

        const response = await fetch(apiUrl,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username,
                    password
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
            return;
        }

        loginSuccess(
            data.user.username,
            data.user.displayName
        );

    } catch (error) {
        console.error('Login error:', error);
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบ Backend');
    }
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
    document.getElementById('user-avatar-icon').className =
        'w-7 h-7 bg-[#E89387] text-white rounded-full flex items-center justify-center text-xs font-bold';

    document.getElementById('user-avatar-icon').innerText =
        displayName.charAt(0).toUpperCase();

    document.getElementById('user-name-label').innerText =
        displayName;

    initUserDropdownState();
}

function handleLogout() {
    isLoggedIn = false;

    localStorage.removeItem('wardrobe_current_user');
    localStorage.removeItem('wardrobe_display_name');

    showPopup('👋 ออกจากระบบเรียบร้อย', () => {
        document.getElementById('user-avatar-icon').className =
            'w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-xs';

        document.getElementById('user-avatar-icon').innerText = '👤';

        document.getElementById('user-name-label').innerText =
            'ผู้เยี่ยมชม';

        initUserDropdownState();
        switchPage('home');
    });
}