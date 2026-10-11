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
        msgEl.innerText = msg;
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
        popupEl.classList.add('hidden');
    }

    if (popupCallback) {
        popupCallback();
        popupCallback = null;
    }
}