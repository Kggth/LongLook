let isLoggedIn = false;
let popupCallback = null;
let selectedDateKey = null;
let currentRandomOutfitItems = [];

// Helper สำหรับระบุ URL ของ Backend API
window.getApiBaseUrl = function() {
    // หากเปิดผ่านโดเมนสาธารณะ (เช่น ngrok, pinggy, cloudflare tunnel) ที่ไม่ใช่ localhost/127.0.0.1
    if (window.location.protocol !== 'file:' && 
        window.location.hostname && 
        window.location.hostname !== 'localhost' && 
        window.location.hostname !== '127.0.0.1' && 
        !window.location.hostname.startsWith('192.168.')) {
        return window.location.origin;
    }
    // หากเปิดในเครื่องตนเอง (file://, localhost, 127.0.0.1 หรือ Live Server พอร์ต 5500) ให้ชี้ไปที่ Backend พอร์ต 5000 เสมอ
    if (window.location.hostname.startsWith('192.168.')) {
        return `http://${window.location.hostname}:5000`;
    }
    return 'http://localhost:5000';
};

// Helper สำหรับแนบ Bearer Token
window.getAuthHeaders = function() {
    const token = localStorage.getItem('wardrobe_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// ทำให้เป็น global variable เพื่อให้ไฟล์อื่นเข้าถึงได้
window.calendarOutfits =
    JSON.parse(localStorage.getItem('wardrobe_calendar')) || {};

// alias สำหรับใช้ในไฟล์นี้
let calendarOutfits = window.calendarOutfits;

// ทำให้เป็น global variable เพื่อให้ไฟล์อื่นเข้าถึงได้
window.closetItems =
    JSON.parse(localStorage.getItem('wardrobe_items')) || [];

// alias สำหรับใช้ในไฟล์นี้
let closetItems = window.closetItems;

window.addEventListener('DOMContentLoaded', () => {
    if (typeof checkActiveSession === 'function') checkActiveSession();
    if (typeof initRealCalendar === 'function') initRealCalendar();
    if (typeof updateWeather === 'function') updateWeather();
    if (typeof renderCloset === 'function') renderCloset();

    // หากมี Token ผู้ใช้ ให้โหลดข้อมูลจาก Oracle Database ทันที
    const token = localStorage.getItem('wardrobe_token');
    if (token) {
        if (typeof loadUserClothesFromBackend === 'function') {
            loadUserClothesFromBackend();
        }
        if (typeof loadCalendarFromBackend === 'function') {
            loadCalendarFromBackend();
        }
    }

    window.addEventListener('click', (e) => {
        const container = document.getElementById('user-profile-container');
        const menu = document.getElementById('user-dropdown-menu');

        if (
            container &&
            menu &&
            !container.contains(e.target) &&
            !menu.contains(e.target)
        ) {
            menu.classList.add('hidden');
        }
    });
});