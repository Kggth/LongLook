function openModal() {
    if (!isLoggedIn) {
        showPopup(
            '🔒 กรุณาเข้าสู่ระบบก่อนเพิ่มเสื้อผ้า',
            () => {
                switchPage('login');
            }
        );
        return;
    }

    const modal = document.getElementById('upload-modal') || document.getElementById('add-cloth-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('upload-modal') || document.getElementById('add-cloth-modal');
    if (modal) modal.classList.add('hidden');
}

function showPopup(msg, cb = null) {
    const msgEl = document.getElementById('popup-message');
    const popupEl = document.getElementById('custom-popup');

    if (msgEl && popupEl) {
        // ถ้าข้อความขึ้นต้นด้วยอีโมจิที่ขึ้นบรรทัดใหม่ ให้ทำให้ใหญ่ขึ้น
        if (msg.match(/^[\u{1F300}-\u{1F9FF}]/u)) {
            const lines = msg.split('\n');
            const emoji = lines[0];
            const text = lines.slice(1).join('\n');
            msgEl.innerHTML = `<div class="text-4xl mb-2">${emoji}</div><div class="text-sm">${text}</div>`;
        } else {
            msgEl.innerText = msg;
        }
        popupEl.classList.remove('hidden');
        popupCallback = cb;
    } else {
        alert(msg);
        if (cb) cb();
    }
}

function closePopup() {
    const popupEl = document.getElementById('custom-popup');
    if (popupEl) {
        // เพิ่ม fade out animation ก่อนปิด
        popupEl.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => {
            popupEl.classList.add('hidden');
            popupEl.style.animation = ''; // reset animation
        }, 200);
    }

    if (popupCallback) {
        popupCallback();
        popupCallback = null;
    }
}