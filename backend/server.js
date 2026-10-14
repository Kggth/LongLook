require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');
const { initFirebase, mirror, deleteDoc, isFirebaseEnabled } = require('./firebase');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'longlook_super_secret_key_2026';

initFirebase();

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, '..')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'cloth-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        if (!file.mimetype.match(/^image\/(jpeg|png|jpg)$/)) {
            return cb(new Error('กรุณาอัปโหลดเฉพาะไฟล์รูปภาพ JPEG หรือ PNG เท่านั้น'));
        }
        cb(null, true);
    }
});

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

function publicUser(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        gender: row.gender,
        skintone: row.skintone
    };
}

app.get('/api/health', (req, res) => {
    res.json({
        sqlite: true,
        firebase: isFirebaseEnabled(),
        message: isFirebaseEnabled()
            ? 'SQLite เป็นฐานหลัก และซิงค์ขึ้น Firebase'
            : 'SQLite พร้อมแล้ว ตั้งค่า Firebase ใน .env เพื่อซิงค์คลาวด์'
    });
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        }

        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) return res.status(400).json({ message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = db.prepare(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)'
        ).run(username, email || `${username}@longlook.app`, hashedPassword);

        const newUser = db.prepare('SELECT id, username, email, gender, skintone FROM users WHERE id = ?')
            .get(result.lastInsertRowid);

        await mirror('users', newUser.id, publicUser(newUser));

        const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ message: 'ลงทะเบียนสำเร็จ', token, user: newUser });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลผู้ใช้' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) return res.status(400).json({ message: 'ไม่พบชื่อผู้ใช้นี้ในระบบ' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ message: 'รหัสผ่านไม่ถูกต้อง' });

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            message: 'เข้าสู่ระบบสำเร็จ',
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดทางเซิร์ฟเวอร์' });
    }
});

app.post('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const { gender, skinTone } = req.body;
        db.prepare('UPDATE users SET gender = ?, skintone = ? WHERE id = ?')
            .run(gender, skinTone, req.user.id);

        const user = db.prepare('SELECT id, username, email, gender, skintone FROM users WHERE id = ?')
            .get(req.user.id);
        await mirror('users', user.id, publicUser(user));

        res.json({ message: 'บันทึกข้อมูลโทนสีผิวและเพศเรียบร้อยแล้ว' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'บันทึกโปรไฟล์ไม่สำเร็จ' });
    }
});

app.get('/api/clothes', authenticateToken, (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM clothes WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'ดึงข้อมูลเสื้อผ้าไม่สำเร็จ' });
    }
});

app.post('/api/clothes', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { name, category, color, style, image } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : (image || 'https://via.placeholder.com/150');

        const result = db.prepare(
            'INSERT INTO clothes (user_id, name, category, color, style, image) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(req.user.id, name || 'เสื้อผ้าใหม่', category || 'เสื้อ', color || 'ไม่ระบุ', style || 'CASUAL', imageUrl);

        const cloth = db.prepare('SELECT * FROM clothes WHERE id = ?').get(result.lastInsertRowid);
        await mirror('clothes', cloth.id, { ...cloth });

        res.status(201).json({ message: 'บันทึกเสื้อผ้าลง SQLite และซิงค์ Firebase แล้ว', cloth });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'บันทึกเสื้อผ้าไม่สำเร็จ' });
    }
});

app.delete('/api/clothes/:id', authenticateToken, async (req, res) => {
    try {
        const clothId = req.params.id;
        const cloth = db.prepare('SELECT * FROM clothes WHERE id = ? AND user_id = ?').get(clothId, req.user.id);
        if (!cloth) {
            return res.status(404).json({ message: 'ไม่พบเสื้อผ้านี้ หรือคุณไม่มีสิทธิ์ลบ' });
        }

        db.prepare('DELETE FROM clothes WHERE id = ? AND user_id = ?').run(clothId, req.user.id);
        await deleteDoc('clothes', clothId);

        res.json({ message: 'ลบเสื้อผ้าออกจาก SQLite และ Firebase สำเร็จแล้ว' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบเสื้อผ้า' });
    }
});

app.get('/api/calendar', authenticateToken, (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM calendar_logs WHERE user_id = ? ORDER BY log_date DESC, id DESC')
            .all(req.user.id);
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'ดึงข้อมูลปฏิทินไม่สำเร็จ' });
    }
});

app.post('/api/calendar', authenticateToken, async (req, res) => {
    try {
        const { title, style, image, log_date, occasion, weather, items } = req.body;
        const logDate = log_date || new Date().toISOString().slice(0, 10);
        const outfitTitle = title || 'ลุคประจำวัน';

        // 1. บันทึกลงตาราง OUTFIT (ตาม ER Diagram)
        const outfitRes = db.prepare(
            'INSERT INTO outfits (user_id, outfit_name, description, style, image) VALUES (?, ?, ?, ?, ?)'
        ).run(req.user.id, outfitTitle, 'บันทึกจากระบบการแต่งตัว', style || 'CASUAL', image || '');

        const outfitId = outfitRes.lastInsertRowid;
        const outfit = db.prepare('SELECT * FROM outfits WHERE id = ?').get(outfitId);
        await mirror('outfits', outfit.id, { ...outfit });

        // 2. ถ้ามีรายการเสื้อผ้าในชุด ให้บันทึกลงตาราง OUTFIT_ITEM (ตาม ER Diagram)
        if (Array.isArray(items) && items.length > 0) {
            for (const it of items) {
                db.prepare(
                    'INSERT INTO outfit_items (outfit_id, cloth_id, cloth_name, cloth_image) VALUES (?, ?, ?, ?)'
                ).run(outfitId, it.id || null, it.name || '', it.image || '');
            }
            await mirror('outfit_items', `outfit_${outfitId}`, { outfit_id: outfitId, items: items });
        }

        // 3. บันทึกลงตาราง CALENDAR_LOG (ตาม ER Diagram)
        const result = db.prepare(
            'INSERT INTO calendar_logs (user_id, outfit_id, title, style, image, log_date, occasion, weather) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(req.user.id, outfitId, outfitTitle, style || 'CASUAL', image || '', logDate, occasion || 'ทั่วไป', weather || 'แจ่มใส');

        const log = db.prepare('SELECT * FROM calendar_logs WHERE id = ?').get(result.lastInsertRowid);
        await mirror('calendar_logs', log.id, { ...log });

        // 4. บันทึกลงตาราง AUDIT_LOG (ตาม ER Diagram)
        db.prepare(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id, details) VALUES (?, ?, ?, ?, ?)'
        ).run(req.user.id, 'CREATE_OUTFIT_AND_CALENDAR_LOG', 'outfits', outfitId, `Created outfit ${outfitTitle}`);

        res.status(201).json({ message: 'บันทึก Outfit และ ปฏิทินลง SQLite และซิงค์ Firebase แล้ว', log, outfitId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'บันทึกปฏิทินไม่สำเร็จ' });
    }
});

// Endpoint ดึงประวัติ Outfits ทั้งหมดของผู้ใช้
app.get('/api/outfits', authenticateToken, (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM outfits WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'ดึงข้อมูล Outfits ไม่สำเร็จ' });
    }
});

app.get('/api/weather', async (req, res) => {
    try {
        const apiKey = process.env.OPENWEATHER_API_KEY;
        if (!apiKey) return res.json({ temp: 25, condition: 'แจ่มใส', style: 'Casual' });
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Bangkok&units=metric&appid=${apiKey}&lang=th`);
        const data = await response.json();
        res.json({ temp: Math.round(data.main.temp), condition: data.weather[0]?.description || 'แจ่มใส', style: 'Casual' });
    } catch (err) {
        res.json({ temp: 25, condition: 'แจ่มใส', style: 'Casual' });
    }
});

app.post('/api/ai/analyze-clothing', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        if (!genAI) return res.status(500).json({ message: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY' });
        if (!req.file) return res.status(400).json({ message: 'กรุณาอัปโหลดรูปภาพเสื้อผ้า' });

        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
        const imagePart = {
            inlineData: {
                data: fs.readFileSync(req.file.path).toString('base64'),
                mimeType: req.file.mimetype
            }
        };

        const prompt = "วิเคราะห์รูปเสื้อผ้าแล้วตอบ JSON: { \"category\": \"เสื้อ/กางเกง/กระโปรง/เดรส\", \"color\": \"โทนสี\", \"style\": \"CASUAL/KOREAN/FORMAL/STREET\" }";
        const result = await model.generateContent([prompt, imagePart]);
        const responseText = await result.response.text();

        res.json({ message: 'วิเคราะห์สำเร็จ', result: JSON.parse(responseText.replace(/```json|```/g, '').trim()) });
    } catch (err) {
        res.status(500).json({ message: 'การวิเคราะห์ด้วย AI ล้มเหลว' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 LongLook SQLite + Firebase backend: http://localhost:${PORT}`);
});
