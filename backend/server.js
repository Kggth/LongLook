const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'longlook_super_secret_key_2026';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static Folder สำหรับเก็บรูปภาพเสื้อผ้า
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// Storage Engine สำหรับ Multer (อัปโหลดรูปภาพจริง)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'cloth-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// -------------------------------------------------------------
// IN-MEMORY / RELATIONAL DATABASE SCHEMA SIMULATION (8 ENTITIES)
// -------------------------------------------------------------
let db = {
    users: [],          // USER Entity
    audit_logs: [],     // AUDIT_LOG Entity
    clothes: [],        // CLOTHING_ITEM Entity
    categories: [       // CATEGORY Entity
        { id: 1, name: 'เสื้อ' }, { id: 2, name: 'กางเกง' },
        { id: 3, name: 'กระโปรง' }, { id: 4, name: 'เดรส' },
        { id: 5, name: 'รองเท้า' }, { id: 6, name: 'กระเป๋า' },
        { id: 7, name: 'เครื่องประดับ' }
    ],
    styles: [           // STYLE Entity
        { id: 1, name: 'CASUAL' }, { id: 2, name: 'KOREAN' },
        { id: 3, name: 'VINTAGE' }, { id: 4, name: 'STREET' },
        { id: 5, name: 'FORMAL' }
    ],
    outfits: [],        // OUTFIT & OUTFIT_ITEM Entity
    calendar_logs: [],  // CALENDAR_LOG Entity
    weather: []         // WEATHER Entity
};

// Helper: JWT Verification Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'โปรดเข้าสู่ระบบก่อนใช้งาน' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token ไม่ถูกต้องหรือหมดอายุ' });
        req.user = user;
        next();
    });
}

// Helper: Audit Logger
function logAudit(userId, action, table, recordId) {
    db.audit_logs.push({
        id: db.audit_logs.length + 1,
        user_id: userId,
        action: action,
        table_name: table,
        record_id: recordId,
        created_at: new Date()
    });
}

// -------------------------------------------------------------
// 1. AUTHENTICATION & USER ENDPOINTS (USER Entity)
// -------------------------------------------------------------

// POST /api/auth/register (สมัครสมาชิก)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const existing = db.users.find(u => u.username === username || u.email === email);
        if (existing) return res.status(400).json({ message: 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: db.users.length + 1,
            username,
            email,
            password: hashedPassword,
            avatar_icon: '👤',
            created_at: new Date()
        };
        db.users.push(newUser);
        logAudit(newUser.id, 'REGISTER', 'USERS', newUser.id);

        const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ message: 'ลงทะเบียนสำเร็จ', token, user: { id: newUser.id, username: newUser.username, avatar_icon: newUser.avatar_icon } });
    } catch (e) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดทางเซิร์ฟเวอร์' });
    }
});

// POST /api/auth/login (เข้าสู่ระบบ)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = db.users.find(u => u.username === username);
        if (!user) return res.status(400).json({ message: 'ไม่พบชื่อผู้ใช้นี้ในระบบ' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ message: 'รหัสผ่านไม่ถูกต้อง' });

        logAudit(user.id, 'LOGIN', 'USERS', user.id);
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: 'เข้าสู่ระบบสำเร็จ', token, user: { id: user.id, username: user.username, avatar_icon: user.avatar_icon } });
    } catch (e) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดทางเซิร์ฟเวอร์' });
    }
});

// -------------------------------------------------------------
// 2. CLOTHING ITEM ENDPOINTS (CLOTHING_ITEM Entity & File Upload)
// -------------------------------------------------------------

// GET /api/clothes (ดึงรายการเสื้อผ้าพร้อม Filter)
app.get('/api/clothes', authenticateToken, (req, res) => {
    const { category, style, search } = req.query;
    let userClothes = db.clothes.filter(c => c.user_id === req.user.id);

    if (category && category !== 'ALL') {
        userClothes = userClothes.filter(c => c.category === category);
    }
    if (style && style !== 'ALL') {
        userClothes = userClothes.filter(c => c.style === style);
    }
    if (search) {
        userClothes = userClothes.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    }

    res.json(userClothes);
});

// POST /api/clothes (อัปโหลดเสื้อผ้าใหม่พร้อมรูปภาพจริง)
app.post('/api/clothes', authenticateToken, upload.single('image'), (req, res) => {
    try {
        const { name, category, color, style } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl || 'https://via.placeholder.com/150';

        const newCloth = {
            id: Date.now(),
            user_id: req.user.id,
            name,
            category,
            color,
            style,
            image: imageUrl,
            created_at: new Date()
        };

        db.clothes.push(newCloth);
        logAudit(req.user.id, 'CREATE_CLOTH', 'CLOTHING_ITEM', newCloth.id);

        res.status(201).json({ message: 'เพิ่มเสื้อผ้าลงตู้เรียบร้อยแล้ว', cloth: newCloth });
    } catch (e) {
        res.status(500).json({ message: 'อัปโหลดเสื้อผ้าไม่สำเร็จ' });
    }
});

// DELETE /api/clothes/:id (ลบเสื้อผ้า)
app.delete('/api/clothes/:id', authenticateToken, (req, res) => {
    const clothId = parseInt(req.params.id);
    const index = db.clothes.findIndex(c => c.id === clothId && c.user_id === req.user.id);

    if (index === -1) return res.status(404).json({ message: 'ไม่พบเสื้อผ้านี้' });

    db.clothes.splice(index, 1);
    logAudit(req.user.id, 'DELETE_CLOTH', 'CLOTHING_ITEM', clothId);
    res.json({ message: 'ลบเสื้อผ้าเรียบร้อยแล้ว' });
});

// -------------------------------------------------------------
// 3. OUTFIT & CALENDAR ENDPOINTS (OUTFIT & CALENDAR_LOG Entity)
// -------------------------------------------------------------

// POST /api/outfits (บันทึกเซ็ตชุด/ลุค)
app.post('/api/outfits', authenticateToken, (req, res) => {
    const { items, occasion, weather_temp } = req.body;
    const newOutfit = {
        id: Date.now(),
        user_id: req.user.id,
        items,
        occasion,
        created_at: new Date()
    };
    db.outfits.push(newOutfit);

    // Auto Record to Calendar Log
    const newCalendarLog = {
        id: db.calendar_logs.length + 1,
        user_id: req.user.id,
        outfit_id: newOutfit.id,
        log_date: new Date().toLocaleDateString(),
        is_favorite: false,
        created_at: new Date()
    };
    db.calendar_logs.push(newCalendarLog);
    logAudit(req.user.id, 'CREATE_OUTFIT', 'OUTFIT', newOutfit.id);

    res.status(201).json({ message: 'บันทึกลุคลงปฏิทินสำเร็จแล้ว', outfit: newOutfit });
});

// GET /api/stats (ดึงสถิติผู้ใช้งาน)
app.get('/api/stats', authenticateToken, (req, res) => {
    const userClothes = db.clothes.filter(c => c.user_id === req.user.id);
    const userOutfits = db.outfits.filter(o => o.user_id === req.user.id);

    res.json({
        totalClothes: userClothes.length,
        totalOutfits: userOutfits.length,
        topStyle: 'CASUAL'
    });
});

// START SERVER
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 LongLook Backend Running on Port ${PORT}`);
    console.log(`=================================`);
});