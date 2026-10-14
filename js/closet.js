// Helper แปลง URL ของรูปภาพให้โหลดได้ถูกต้องทั้งบน file:/// และ localhost
function resolveImageUrl(url) {
    if (!url) return 'https://images.unsplash.com/photo-1589465257551-f4639982fbc4?w=300';
    if (url.startsWith('/uploads')) {
        return `${getApiBaseUrl()}${url}`;
    }
    return url;
}

// โหลดรายการเสื้อผ้าของผู้ใช้ปัจจุบันจาก Oracle Database ผ่าน Backend API
async function loadUserClothesFromBackend() {
    const token = localStorage.getItem('wardrobe_token');
    if (!token) return;

    try {
        const response = await fetch(`${getApiBaseUrl()}/api/clothes`, {
            headers: getAuthHeaders()
        });

        if (response.ok) {
            const data = await response.json();
            window.closetItems = (data || []).map(item => ({
                id: item.id || item.item_id,
                name: item.name,
                category: item.category,
                image: resolveImageUrl(item.image),
                color: item.color || '',
                brand: item.brand || '',
                size: item.size || '',
                style: item.style || ''
            }));
            closetItems = window.closetItems;
            localStorage.setItem('wardrobe_items', JSON.stringify(closetItems));
            renderCloset();
            if (typeof populateBuilderOptions === 'function') {
                populateBuilderOptions();
            }
        }
    } catch (err) {
        console.error('Failed to load clothes from backend:', err);
    }
}

async function addNewItem() {
    const token = localStorage.getItem('wardrobe_token');
    if (!token) {
        if (typeof showPopup === 'function') {
            showPopup('🔒 กรุณาเข้าสู่ระบบก่อนเพิ่มเสื้อผ้า เพื่อบันทึกลง Oracle Database จริง', () => {
                if (typeof switchPage === 'function') switchPage('login');
            });
        } else {
            alert('🔒 กรุณาเข้าสู่ระบบก่อนเพิ่มเสื้อผ้า');
        }
        return;
    }

    const nameInput = document.getElementById('item-name') || document.getElementById('cloth-name');
    const categoryInput = document.getElementById('item-category') || document.getElementById('cloth-category');
    const fileInput = document.getElementById('item-image-file') || document.getElementById('cloth-image');

    const name = nameInput ? nameInput.value.trim() : '';
    const category = categoryInput ? categoryInput.value : 'เสื้อ';

    if (!name) {
        alert('กรุณากรอกชื่อไอเทม');
        return;
    }

    // สร้าง FormData สำหรับส่งข้อมูลไปยัง Backend API (รองรับการอัปโหลดไฟล์รูปภาพจริง)
    const formData = new FormData();
    formData.append('name', name);
    formData.append('category', category);

    if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('image', fileInput.files[0]);
    } else {
        formData.append('imageUrl', 'https://images.unsplash.com/photo-1589465257551-f4639982fbc4?w=300');
    }

    await saveItemToClosetApi(formData);
}

async function saveItemToClosetApi(formData) {
    const token = localStorage.getItem('wardrobe_token');
    if (!token) {
        if (typeof showPopup === 'function') {
            showPopup('🔒 กรุณาเข้าสู่ระบบก่อนเพิ่มเสื้อผ้า เพื่อบันทึกลง Oracle Database จริง', () => {
                if (typeof switchPage === 'function') switchPage('login');
                if (typeof openLoginModal === 'function') openLoginModal();
            });
        } else {
            alert('🔒 กรุณาเข้าสู่ระบบก่อนเพิ่มเสื้อผ้า');
        }
        return;
    }

    try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/clothes`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData
        });

        let data = {};
        try {
            data = await response.json();
        } catch (_) {}

        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('wardrobe_token');
            alert('🔒 เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
            if (typeof switchPage === 'function') switchPage('login');
            return;
        }

        if (response.ok && data.cloth) {
            const savedItem = {
                id: data.cloth.id,
                name: data.cloth.name,
                category: data.cloth.category,
                image: resolveImageUrl(data.cloth.image),
                color: data.cloth.color || '',
                brand: data.cloth.brand || '',
                size: data.cloth.size || '',
                style: data.cloth.style || ''
            };

            closetItems.unshift(savedItem);
            window.closetItems = closetItems;
            localStorage.setItem('wardrobe_items', JSON.stringify(closetItems));

            if (typeof closeModal === 'function') closeModal();
            if (typeof closeAddClothModal === 'function') closeAddClothModal();

            const nameInput = document.getElementById('item-name') || document.getElementById('cloth-name');
            if (nameInput) nameInput.value = '';

            const fileInput = document.getElementById('item-image-file') || document.getElementById('cloth-image');
            if (fileInput) fileInput.value = '';

            renderCloset();
            if (typeof populateBuilderOptions === 'function') populateBuilderOptions();

            if (typeof showPopup === 'function') {
                showPopup('🎉 บันทึกเสื้อผ้าลง Oracle Database สำเร็จ!');
            } else {
                alert('🎉 บันทึกเสื้อผ้าลง Oracle Database สำเร็จ!');
            }
        } else {
            alert(data.message || `เกิดข้อผิดพลาดในการบันทึกเสื้อผ้า (HTTP ${response.status})`);
        }
    } catch (err) {
        console.error('Error saving item to API:', err);
        alert(`⚠️ ไม่สามารถเชื่อมต่อกับ Backend (${getApiBaseUrl()}) ได้: ` + err.message + '\nโปรดตรวจสอบว่าเปิดคำสั่ง npm start ในโฟลเดอร์ backend อยู่หรือไม่');
    }
}

// ฟังก์ชันดั้งเดิมสำหรับรองรับ Fallback
async function saveItemToCloset(name, category, image, style) {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('category', category);
    if (image instanceof File || image instanceof Blob) {
        formData.append('image', image);
    } else if (typeof image === 'string' && image.startsWith('http')) {
        formData.append('imageUrl', image);
    } else if (typeof image === 'string') {
        formData.append('image', image);
    }
    if (style) formData.append('style', style);
    await saveItemToClosetApi(formData);
}

async function deleteItem(id) {
    if (!confirm('คุณต้องการลบเสื้อผ้านี้ออกจากตู้ใช่หรือไม่?')) {
        return;
    }

    const token = localStorage.getItem('wardrobe_token');
    if (token) {
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/clothes/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (!response.ok) {
                const data = await response.json();
                alert(data.message || 'ไม่สามารถลบเสื้อผ้าได้');
                return;
            }
        } catch (err) {
            console.error('Delete item API error:', err);
            alert('⚠️ ไม่สามารถติดต่อ Backend เพื่อลบข้อมูลในฐานข้อมูลได้');
            return;
        }
    }

    closetItems = closetItems.filter(item => item.id !== id);
    window.closetItems = closetItems;
    localStorage.setItem('wardrobe_items', JSON.stringify(closetItems));

    renderCloset();
    if (typeof populateBuilderOptions === 'function') populateBuilderOptions();

    if (typeof showPopup === 'function') {
        showPopup('🗑️ ลบไอเทมออกจาก Oracle Database เรียบร้อยแล้ว');
    } else {
        alert('🗑️ ลบไอเทมเรียบร้อยแล้ว');
    }
}

function renderCloset() {
    const fullGrid = document.getElementById('full-closet-grid') || document.getElementById('closet-grid');
    const homePreview = document.getElementById('home-closet-preview');

    const catFilter = document.getElementById('filter-category')?.value || 'ALL';
    const keyword = document.getElementById('search-keyword')?.value?.trim().toLowerCase() || '';

    let itemsToRender = closetItems || [];
    if (catFilter !== 'ALL') {
        itemsToRender = itemsToRender.filter(i => i.category === catFilter);
    }
    if (keyword) {
        itemsToRender = itemsToRender.filter(i => i.name.toLowerCase().includes(keyword));
    }

    let htmlContent = '';

    if (itemsToRender.length === 0) {
        htmlContent = `
            <p class="text-xs text-gray-400 col-span-full text-center py-6">
                ยังไม่มีเสื้อผ้าในหมวดนี้ หรือไม่พบไอเทมที่ค้นหา
            </p>
        `;
    } else {
        itemsToRender.forEach(item => {
            htmlContent += `
                <div class="bg-white p-4 rounded-2xl border border-[#EAE6DF] text-center relative group shadow-sm transition hover:shadow-md">
                    <button
                        onclick="deleteItem(${item.id})"
                        class="absolute top-2 right-2 bg-red-100 hover:bg-red-200 text-red-500 w-7 h-7 rounded-full text-xs flex items-center justify-center transition"
                        title="ลบไอเทมนี้"
                    >
                        ✕
                    </button>

                    <div class="h-36 flex items-center justify-center bg-gray-50 rounded-xl overflow-hidden">
                        <img
                            src="${resolveImageUrl(item.image)}"
                            class="h-full w-full object-contain"
                            alt="${item.name}"
                        >
                    </div>

                    <h4 class="font-bold text-sm mt-2 text-gray-800 truncate">
                        ${item.name}
                    </h4>

                    <span class="inline-block bg-[#F3ECE4] text-[#8C6D53] text-[10px] px-2 py-0.5 rounded-md font-semibold mt-1">
                        ${item.category}
                    </span>
                </div>
            `;
        });
    }

    if (fullGrid) {
        fullGrid.innerHTML = htmlContent;
    }

    const closetGridAlt = document.getElementById('closet-grid');
    if (closetGridAlt && closetGridAlt !== fullGrid) {
        closetGridAlt.innerHTML = htmlContent;
    }

    if (homePreview) {
        homePreview.innerHTML = htmlContent;
    }
}