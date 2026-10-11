function switchPage(pageId) {
    // ปลดล็อกให้ผู้ใช้เข้าชมหน้าต่าง ๆ ได้เพื่อความราบรื่นในการใช้งานและ Demo
    const protectedPages = [];

    if (protectedPages.includes(pageId) && !isLoggedIn) {
        if (typeof showPopup === 'function') {
            showPopup('🔒 กรุณาเข้าสู่ระบบก่อนใช้งานฟังก์ชันนี้');
        } else {
            alert('🔒 กรุณาเข้าสู่ระบบก่อนใช้งานฟังก์ชันนี้');
        }
        return;
    }

    document.querySelectorAll('.page-content').forEach(el => {
        el.classList.add('hidden');
    });

    document.getElementById('page-' + pageId).classList.remove('hidden');

    document.querySelectorAll('aside nav button').forEach(btn => {
        btn.className =
            'w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-medium text-gray-500 hover:bg-gray-50 transition';
    });

    const activeBtn = document.getElementById('nav-' + pageId);

    if (activeBtn) {
        activeBtn.className =
            'w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-medium bg-[#F3ECE4] text-[#8C6D53] transition';
    }

    if (pageId === 'closet' || pageId === 'home') {
        renderCloset();
    }

    if (pageId === 'calendar') {
        renderFullCalendar();
    }

    if (pageId === 'stats') {
        // อ่านจากตัวแปร global (ไม่ได้เก็บใน localStorage)
        const items = window.closetItems || [];
        const outfits = window.calendarOutfits || {};
        
        // อัปเดตจำนวนเสื้อผ้า
        const totalClothes = document.getElementById('stat-total-clothes');
        if (totalClothes) {
            totalClothes.textContent = items.length;
        }
        
        // อัปเดตจำนวน outfit (นับจำนวน key ใน calendarOutfits)
        const totalOutfits = document.getElementById('stat-total-outfits');
        if (totalOutfits) {
            totalOutfits.textContent = Object.keys(outfits).length;
        }
        
        // คำนวณ style ที่ใช้บ่อยที่สุด
        const topStyle = document.getElementById('stat-top-style');
        if (topStyle) {
            if (items.length === 0) {
                topStyle.textContent = '-';
            } else {
                const styleCounts = {};
                items.forEach(item => {
                    const style = item.style || 'CASUAL';
                    styleCounts[style] = (styleCounts[style] || 0) + 1;
                });
                
                let maxStyle = 'CASUAL';
                let maxCount = 0;
                for (const [style, count] of Object.entries(styleCounts)) {
                    if (count > maxCount) {
                        maxCount = count;
                        maxStyle = style;
                    }
                }
                topStyle.textContent = maxStyle;
            }
        }
    }

    if (pageId === 'settings-profile') {
        if (typeof loadProfileDataIntoForm === 'function') loadProfileDataIntoForm();
    }

    window.scrollTo(0, 0);
}