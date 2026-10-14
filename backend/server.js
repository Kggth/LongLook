const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in the environment');
}

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static Folder สำหรับเก็บรูปภาพเสื้อผ้า
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// ให้เซิร์ฟเวอร์ส่งไฟล์ Frontend ได้โดยตรง เพื่อนเปิด URL เดียวใช้งานได้ทันที
const frontendDir = path.join(__dirname, '..');
app.use(express.static(frontendDir));

// Storage Engine สำหรับ Multer (อัปโหลดรูปภาพจริง)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'cloth-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Helper: บันทึก Base64 Image เป็นไฟล์รูปภาพบนดิสก์ ป้องกันการเก็บสตริงขนาดใหญ่ลง Oracle VARCHAR2
function saveBase64Image(base64Str) {
    if (!base64Str || typeof base64Str !== 'string') return null;
    if (!base64Str.startsWith('data:image')) return base64Str; // เป็น URL ปกติอยู่แล้ว

    const matches = base64Str.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;

    let ext = matches[1];
    if (ext === 'jpeg') ext = 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = 'cloth-b64-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.' + ext;
    const filepath = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
}

// Helper: JWT Verification Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'โปรดเข้าสู่ระบบก่อนใช้งาน' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Token ไม่ถูกต้องหรือหมดอายุ' });
        }
        req.user = decoded; // { id, username }
        next();
    });
}

// Helper: บันทึก Audit Log ลงตาราง AUDIT_LOG ผ่าน Connection ใน Transaction
async function logAuditTx(connection, userId, action, table, recordId, oldVals = null, newVals = null) {
    try {
        const oldStr = oldVals ? (typeof oldVals === 'string' ? oldVals : JSON.stringify(oldVals)) : null;
        const newStr = newVals ? (typeof newVals === 'string' ? newVals : JSON.stringify(newVals)) : null;

        await connection.execute(
            `INSERT INTO audit_log (
                audit_id, user_id, action, table_name, record_id, old_values, new_values, created_at
            ) VALUES (
                seq_audit_log.NEXTVAL, :userId, :action, :tableName, :recordId, :oldValues, :newValues, CURRENT_TIMESTAMP
            )`,
            {
                userId: userId || null,
                action: action,
                tableName: table,
                recordId: recordId || null,
                oldValues: oldStr,
                newValues: newStr
            }
        );
    } catch (auditErr) {
        console.warn('⚠️ ไม่สามารถบันทึก Audit Log ได้:', auditErr.message);
    }
}

// -------------------------------------------------------------
// 0. HEALTH CHECK & DATABASE STATUS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/db-status', async (req, res) => {
    try {
        const result = await db.executeQuery('SELECT 1 AS alive FROM dual');
        res.json({
            status: 'online',
            database: 'Oracle Database',
            user: process.env.ORACLE_USER || 'LONGLOOK',
            connectString: process.env.ORACLE_CONNECT_STRING || 'localhost:1521/FREEPDB1',
            timestamp: new Date()
        });
    } catch (err) {
        res.status(503).json({
            status: 'error',
            message: 'ไม่สามารถเชื่อมต่อ Oracle Database ได้',
            error: err.message,
            hint: 'กรุณาตรวจสอบการตั้งค่า ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT_STRING ในไฟล์ backend/.env'
        });
    }
});

// -------------------------------------------------------------
// 1. AUTHENTICATION ENDPOINTS (APP_USER Entity)
// -------------------------------------------------------------

// POST /api/auth/register (สมัครสมาชิก)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const displayName = req.body.displayName || username;
        // หาก Frontend ไม่ได้ส่งอีเมลมา ให้สร้างอีเมลตั้งต้นตาม username
        const email = req.body.email || (username && username.includes('@') ? username : `${username}@longlook.local`);

        if (!username || !password) {
            return res.status(400).json({ message: 'กรุณาระบุชื่อผู้ใช้และรหัสผ่าน' });
        }

        // ตรวจสอบชื่อผู้ใช้หรืออีเมลซ้ำใน Oracle
        const checkUser = await db.executeQuery(
            `SELECT user_id FROM app_user WHERE username = :username OR email = :email`,
            { username: username.trim(), email: email.trim() }
        );

        if (checkUser.rows && checkUser.rows.length > 0) {
            return res.status(400).json({ message: 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUserId = await db.withTransaction(async (conn) => {
            const insertResult = await conn.execute(
                `INSERT INTO app_user (
                    user_id, username, email, password_hash, first_name, role, created_at
                ) VALUES (
                    seq_app_user.NEXTVAL, :username, :email, :passwordHash, :firstName, 'USER', CURRENT_TIMESTAMP
                ) RETURNING user_id INTO :outUserId`,
                {
                    username: username.trim(),
                    email: email.trim(),
                    passwordHash: hashedPassword,
                    firstName: displayName,
                    outUserId: { type: db.oracledb.NUMBER, dir: db.oracledb.BIND_OUT }
                }
            );

            const createdId = insertResult.outBinds.outUserId[0];
            await logAuditTx(conn, createdId, 'REGISTER', 'APP_USER', createdId, null, { username, email });
            return createdId;
        });

        const token = jwt.sign({ id: newUserId, username: username.trim() }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            message: 'ลงทะเบียนสำเร็จ',
            token,
            user: { id: newUserId, username: username.trim(), displayName: displayName }
        });
    } catch (e) {
        console.error('Register Error:', e);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลงทะเบียน: ' + e.message });
    }
});

// POST /api/auth/login (เข้าสู่ระบบ)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        }

        const userResult = await db.executeQuery(
            `SELECT user_id, username, email, password_hash, first_name, last_name, role
             FROM app_user
             WHERE (username = :userParam OR email = :userParam) AND deleted_at IS NULL`,
            { userParam: username.trim() }
        );

        if (!userResult.rows || userResult.rows.length === 0) {
            return res.status(404).json({ message: 'ไม่พบชื่อผู้ใช้นี้ในระบบ' });
        }

        const user = userResult.rows[0];
        const validPassword = await bcrypt.compare(password, user.PASSWORD_HASH);
        if (!validPassword) {
            return res.status(400).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        // บันทึก Audit Log สำหรับการ Login
        await db.withTransaction(async (conn) => {
            await logAuditTx(conn, user.USER_ID, 'LOGIN', 'APP_USER', user.USER_ID);
        });

        const token = jwt.sign({ id: user.USER_ID, username: user.USERNAME }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            message: 'เข้าสู่ระบบสำเร็จ',
            token,
            user: {
                id: user.USER_ID,
                username: user.USERNAME,
                displayName: user.FIRST_NAME || user.USERNAME
            }
        });
    } catch (e) {
        console.error('Login Error:', e);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + e.message });
    }
});

// -------------------------------------------------------------
// 2. MASTER DATA ENDPOINTS (CATEGORY & STYLE)
// -------------------------------------------------------------

// GET /api/categories (ดึงหมวดหมู่ทั้งหมด)
app.get('/api/categories', async (req, res) => {
    try {
        const result = await db.executeQuery(
            `SELECT category_id AS "id", category_name AS "name", description AS "description"
             FROM category ORDER BY category_id`
        );
        res.json(result.rows || []);
    } catch (e) {
        res.status(500).json({ message: 'ไม่สามารถดึงหมวดหมู่ได้: ' + e.message });
    }
});

// GET /api/styles (ดึงสไตล์ทั้งหมด)
app.get('/api/styles', async (req, res) => {
    try {
        const result = await db.executeQuery(
            `SELECT style_id AS "id", style_name AS "name", description AS "description"
             FROM style ORDER BY style_id`
        );
        res.json(result.rows || []);
    } catch (e) {
        res.status(500).json({ message: 'ไม่สามารถดึงสไตล์ได้: ' + e.message });
    }
});

// -------------------------------------------------------------
// 3. CLOTHING ITEM ENDPOINTS (CLOTHING_ITEM & ITEM_STYLE)
// -------------------------------------------------------------

// GET /api/clothes (ดึงรายการเสื้อผ้าของผู้ใช้ พร้อมตัวกรอง)
app.get('/api/clothes', authenticateToken, async (req, res) => {
    try {
        const { category, style, search } = req.query;
        let sql = `
            SELECT
                ci.item_id AS "id",
                ci.item_id AS "item_id",
                ci.user_id AS "user_id",
                ci.category_id AS "category_id",
                c.category_name AS "category",
                ci.item_name AS "name",
                ci.color AS "color",
                ci.brand AS "brand",
                ci.item_size AS "size",
                ci.image_url AS "image",
                TO_CHAR(ci.purchase_date, 'YYYY-MM-DD') AS "purchase_date",
                ci.created_at AS "created_at",
                (SELECT LISTAGG(s.style_name, ', ') WITHIN GROUP (ORDER BY s.style_name)
                 FROM item_style is_rel
                 JOIN style s ON is_rel.style_id = s.style_id
                 WHERE is_rel.item_id = ci.item_id) AS "style"
            FROM clothing_item ci
            JOIN category c ON ci.category_id = c.category_id
            WHERE ci.user_id = :userId AND ci.deleted_at IS NULL
        `;

        const binds = { userId: req.user.id };

        if (category && category !== 'ALL') {
            sql += ` AND (c.category_name = :category OR TO_CHAR(c.category_id) = :category)`;
            binds.category = category;
        }

        if (search && search.trim()) {
            sql += ` AND LOWER(ci.item_name) LIKE :search`;
            binds.search = `%${search.trim().toLowerCase()}%`;
        }

        if (style && style !== 'ALL') {
            sql += ` AND EXISTS (
                SELECT 1 FROM item_style is_f
                JOIN style s_f ON is_f.style_id = s_f.style_id
                WHERE is_f.item_id = ci.item_id AND (s_f.style_name = :style OR TO_CHAR(s_f.style_id) = :style)
            )`;
            binds.style = style;
        }

        sql += ` ORDER BY ci.item_id DESC`;

        const result = await db.executeQuery(sql, binds);
        res.json(result.rows || []);
    } catch (e) {
        console.error('Get Clothes Error:', e);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงรายการเสื้อผ้า: ' + e.message });
    }
});

// POST /api/clothes (เพิ่มเสื้อผ้าใหม่ลง Oracle Database)
app.post('/api/clothes', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { name, category, color, brand, style } = req.body;
        const itemSize = req.body.size || req.body.item_size || null;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'กรุณากรอกชื่อเสื้อผ้า' });
        }

        // จัดการรูปภาพ: หากส่งไฟล์มาให้ใช้พาธไฟล์ หากส่ง Base64 ให้บันทึกลงดิสก์ก่อน
        let imageUrl = null;
        if (req.file) {
            imageUrl = `/uploads/${req.file.filename}`;
        } else if (req.body.image || req.body.imageUrl) {
            const rawImg = req.body.image || req.body.imageUrl;
            imageUrl = saveBase64Image(rawImg) || 'https://images.unsplash.com/photo-1589465257551-f4639982fbc4?w=300';
        } else {
            imageUrl = 'https://images.unsplash.com/photo-1589465257551-f4639982fbc4?w=300';
        }

        // ค้นหา category_id จากชื่อหรือ ID
        let categoryId = 1; // Default
        if (category) {
            const catResult = await db.executeQuery(
                `SELECT category_id FROM category WHERE category_name = :catName OR TO_CHAR(category_id) = :catName`,
                { catName: category.trim() }
            );
            if (catResult.rows && catResult.rows.length > 0) {
                categoryId = catResult.rows[0].CATEGORY_ID;
            }
        }

        // ดำเนินการ INSERT ลง CLOTHING_ITEM และ ITEM_STYLE ใน Transaction เดียว
        const newCloth = await db.withTransaction(async (conn) => {
            const insertResult = await conn.execute(
                `INSERT INTO clothing_item (
                    item_id, user_id, category_id, item_name, color, brand, item_size, image_url, purchase_date, created_at
                ) VALUES (
                    seq_clothing_item.NEXTVAL, :userId, :categoryId, :itemName, :color, :brand, :itemSize, :imageUrl, SYSDATE, CURRENT_TIMESTAMP
                ) RETURNING item_id INTO :outItemId`,
                {
                    userId: req.user.id,
                    categoryId: categoryId,
                    itemName: name.trim(),
                    color: color ? color.trim() : null,
                    brand: brand ? brand.trim() : null,
                    itemSize: itemSize ? itemSize.trim() : null,
                    imageUrl: imageUrl,
                    outItemId: { type: db.oracledb.NUMBER, dir: db.oracledb.BIND_OUT }
                }
            );

            const newItemId = insertResult.outBinds.outItemId[0];

            // เชื่อมโยง Style ถ้ามีระบุ
            if (style && style.trim()) {
                const styleResult = await conn.execute(
                    `SELECT style_id FROM style WHERE UPPER(style_name) = UPPER(:styleName) OR TO_CHAR(style_id) = :styleName`,
                    { styleName: style.trim() }
                );
                if (styleResult.rows && styleResult.rows.length > 0) {
                    const styleId = styleResult.rows[0].STYLE_ID;
                    await conn.execute(
                        `INSERT INTO item_style (item_style_id, item_id, style_id)
                         VALUES (seq_item_style.NEXTVAL, :itemId, :styleId)`,
                        { itemId: newItemId, styleId: styleId }
                    );
                }
            }

            // บันทึกประวัติ AUDIT_LOG
            await logAuditTx(conn, req.user.id, 'CREATE_CLOTH', 'CLOTHING_ITEM', newItemId, null, {
                item_name: name,
                category_id: categoryId,
                image_url: imageUrl
            });

            return {
                id: newItemId,
                item_id: newItemId,
                user_id: req.user.id,
                name: name.trim(),
                category: category || 'เสื้อ',
                color: color || '',
                brand: brand || '',
                size: itemSize || '',
                style: style || '',
                image: imageUrl,
                created_at: new Date()
            };
        });

        res.status(201).json({ message: 'เพิ่มเสื้อผ้าลงตู้เรียบร้อยแล้ว', cloth: newCloth });
    } catch (e) {
        console.error('Create Cloth Error:', e);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกเสื้อผ้า: ' + e.message });
    }
});

// DELETE /api/clothes/:id (ลบเสื้อผ้าแบบ Soft Delete)
app.delete('/api/clothes/:id', authenticateToken, async (req, res) => {
    try {
        const clothId = parseInt(req.params.id, 10);
        if (isNaN(clothId)) {
            return res.status(400).json({ message: 'รหัสเสื้อผ้าไม่ถูกต้อง' });
        }

        await db.withTransaction(async (conn) => {
            // ตรวจสอบความเป็นเจ้าของ
            const check = await conn.execute(
                `SELECT item_id FROM clothing_item WHERE item_id = :id AND user_id = :userId AND deleted_at IS NULL`,
                { id: clothId, userId: req.user.id }
            );

            if (!check.rows || check.rows.length === 0) {
                const notFoundErr = new Error('ไม่พบเสื้อผ้านี้ หรือคุณไม่มีสิทธิ์ลบ');
                notFoundErr.status = 404;
                throw notFoundErr;
            }

            // ดำเนินการ Soft Delete
            await conn.execute(
                `UPDATE clothing_item SET deleted_at = CURRENT_TIMESTAMP WHERE item_id = :id AND user_id = :userId`,
                { id: clothId, userId: req.user.id }
            );

            await logAuditTx(conn, req.user.id, 'DELETE_CLOTH', 'CLOTHING_ITEM', clothId);
        });

        res.json({ message: 'ลบเสื้อผ้าเรียบร้อยแล้ว' });
    } catch (e) {
        console.error('Delete Cloth Error:', e);
        res.status(e.status || 500).json({ message: e.message || 'เกิดข้อผิดพลาดในการลบเสื้อผ้า' });
    }
});

// -------------------------------------------------------------
// 4. OUTFIT & CALENDAR ENDPOINTS (OUTFIT, OUTFIT_ITEM, CALENDAR_LOG)
// -------------------------------------------------------------

// GET /api/outfits (ดึงชุดแต่งกายของผู้ใช้)
app.get('/api/outfits', authenticateToken, async (req, res) => {
    try {
        const outfitsResult = await db.executeQuery(
            `SELECT o.outfit_id AS "id", o.outfit_id AS "outfit_id", o.outfit_name AS "name",
                    o.description AS "description", o.created_at AS "created_at"
             FROM outfit o
             WHERE o.user_id = :userId AND o.deleted_at IS NULL
             ORDER BY o.outfit_id DESC`,
            { userId: req.user.id }
        );

        const outfits = outfitsResult.rows || [];

        // ดึงรายการเสื้อผ้าของแต่ละ Outfit
        for (const outfit of outfits) {
            const itemsResult = await db.executeQuery(
                `SELECT ci.item_id AS "id", ci.item_name AS "name", c.category_name AS "category",
                        ci.color AS "color", ci.brand AS "brand", ci.image_url AS "image"
                 FROM outfit_item oi
                 JOIN clothing_item ci ON oi.item_id = ci.item_id
                 JOIN category c ON ci.category_id = c.category_id
                 WHERE oi.outfit_id = :outfitId`,
                { outfitId: outfit.id }
            );
            outfit.items = itemsResult.rows || [];
        }

        res.json(outfits);
    } catch (e) {
        console.error('Get Outfits Error:', e);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงชุดแต่งกาย: ' + e.message });
    }
});

// POST /api/outfits (บันทึกเซ็ตชุดแต่งกายลง OUTFIT และ OUTFIT_ITEM)
app.post('/api/outfits', authenticateToken, async (req, res) => {
    try {
        let { name, outfit_name, items, description, occasion, weather_temp, log_to_calendar } = req.body;
        const finalOutfitName = (outfit_name || name || 'My Outfit ' + new Date().toLocaleDateString('th-TH')).trim();

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'กรุณาเลือกเสื้อผ้าอย่างน้อย 1 ชิ้นเพื่อสร้างชุด' });
        }

        // แปลง item ID เป็น integer และกำจัดตัวซ้ำ
        const itemIds = [...new Set(items.map(it => typeof it === 'object' ? parseInt(it.id, 10) : parseInt(it, 10)))].filter(id => !isNaN(id));

        if (itemIds.length === 0) {
            return res.status(400).json({ message: 'ไม่พบรหัสเสื้อผ้าที่ถูกต้อง' });
        }

        const createdOutfit = await db.withTransaction(async (conn) => {
            // 1. ตรวจสอบว่าเสื้อผ้าทุกชิ้นเป็นของผู้ใช้นี้จริง
            for (const itemId of itemIds) {
                const chk = await conn.execute(
                    `SELECT item_id FROM clothing_item WHERE item_id = :itemId AND user_id = :userId AND deleted_at IS NULL`,
                    { itemId, userId: req.user.id }
                );
                if (!chk.rows || chk.rows.length === 0) {
                    const err = new Error(`ไอเทมรหัส ${itemId} ไม่ใช่ของคุณหรือไม่พบในระบบ`);
                    err.status = 403;
                    throw err;
                }
            }

            // 2. INSERT ลง OUTFIT
            const outfitInsert = await conn.execute(
                `INSERT INTO outfit (
                    outfit_id, user_id, outfit_name, description, created_at
                ) VALUES (
                    seq_outfit.NEXTVAL, :userId, :outfitName, :description, CURRENT_TIMESTAMP
                ) RETURNING outfit_id INTO :outOutfitId`,
                {
                    userId: req.user.id,
                    outfitName: finalOutfitName,
                    description: description ? description.trim() : null,
                    outOutfitId: { type: db.oracledb.NUMBER, dir: db.oracledb.BIND_OUT }
                }
            );

            const newOutfitId = outfitInsert.outBinds.outOutfitId[0];

            // 3. INSERT ลง OUTFIT_ITEM แต่ละชิ้น
            for (const itemId of itemIds) {
                await conn.execute(
                    `INSERT INTO outfit_item (outfit_id, item_id, user_id, added_at)
                     VALUES (:outfitId, :itemId, :userId, CURRENT_TIMESTAMP)`,
                    {
                        outfitId: newOutfitId,
                        itemId: itemId,
                        userId: req.user.id
                    }
                );
            }

            // 4. บันทึกลง CALENDAR_LOG อัตโนมัติ หากตั้งค่าไว้หรือบันทึกเป็นลุคประจำวัน
            if (log_to_calendar !== false) {
                let occasionId = null;
                if (occasion) {
                    const occResult = await conn.execute(
                        `SELECT occasion_id FROM occasion WHERE occasion_name = :occName OR TO_CHAR(occasion_id) = :occName`,
                        { occName: occasion.trim() }
                    );
                    if (occResult.rows && occResult.rows.length > 0) {
                        occasionId = occResult.rows[0].OCCASION_ID;
                    }
                }

                await conn.execute(
                    `INSERT INTO calendar_log (
                        log_id, user_id, outfit_id, occasion_id, log_date, notes, created_at
                    ) VALUES (
                        seq_calendar_log.NEXTVAL, :userId, :outfitId, :occasionId, TRUNC(SYSDATE), :notes, CURRENT_TIMESTAMP
                    )`,
                    {
                        userId: req.user.id,
                        outfitId: newOutfitId,
                        occasionId: occasionId,
                        notes: `บันทึกลุค ${finalOutfitName} (${itemIds.length} ชิ้น)`
                    }
                );
            }

            // 5. บันทึก AUDIT_LOG
            await logAuditTx(conn, req.user.id, 'CREATE_OUTFIT', 'OUTFIT', newOutfitId, null, {
                outfit_name: finalOutfitName,
                item_count: itemIds.length
            });

            return {
                id: newOutfitId,
                outfit_id: newOutfitId,
                user_id: req.user.id,
                name: finalOutfitName,
                items: itemIds,
                created_at: new Date()
            };
        });

        res.status(201).json({ message: 'บันทึก OUTFIT ลงในฐานข้อมูลสำเร็จแล้ว', outfit: createdOutfit });
    } catch (e) {
        console.error('Create Outfit Error:', e);
        res.status(e.status || 500).json({ message: e.message || 'เกิดข้อผิดพลาดในการบันทึก OUTFIT' });
    }
});

// GET /api/calendar (ดึงบันทึกปฏิทินของผู้ใช้)
app.get('/api/calendar', authenticateToken, async (req, res) => {
    try {
        const result = await db.executeQuery(
            `SELECT
                cl.log_id AS "id",
                TO_CHAR(cl.log_date, 'YYYY-MM-DD') AS "date",
                cl.outfit_id AS "outfit_id",
                o.outfit_name AS "outfit_name",
                occ.occasion_name AS "occasion",
                w.weather_name AS "weather",
                cl.rating AS "rating",
                cl.notes AS "notes"
             FROM calendar_log cl
             JOIN outfit o ON cl.outfit_id = o.outfit_id
             LEFT JOIN occasion occ ON cl.occasion_id = occ.occasion_id
             LEFT JOIN weather w ON cl.weather_id = w.weather_id
             WHERE cl.user_id = :userId AND cl.deleted_at IS NULL
             ORDER BY cl.log_date DESC`,
            { userId: req.user.id }
        );

        const logs = result.rows || [];

        // ผูกเสื้อผ้าของแต่ละ Outfit กลับไปด้วย
        for (const log of logs) {
            const itemsRes = await db.executeQuery(
                `SELECT ci.item_id AS "id", ci.item_name AS "name", c.category_name AS "category", ci.image_url AS "image"
                 FROM outfit_item oi
                 JOIN clothing_item ci ON oi.item_id = ci.item_id
                 JOIN category c ON ci.category_id = c.category_id
                 WHERE oi.outfit_id = :outfitId`,
                { outfitId: log.outfit_id }
            );
            log.items = itemsRes.rows || [];
        }

        res.json(logs);
    } catch (e) {
        console.error('Get Calendar Error:', e);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลปฏิทิน: ' + e.message });
    }
});

// GET /api/stats (ดึงสถิติจริงจาก Oracle Database)
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const clothesCountRes = await db.executeQuery(
            `SELECT COUNT(*) AS total FROM clothing_item WHERE user_id = :userId AND deleted_at IS NULL`,
            { userId: req.user.id }
        );
        const totalClothes = clothesCountRes.rows ? clothesCountRes.rows[0].TOTAL : 0;

        const outfitsCountRes = await db.executeQuery(
            `SELECT COUNT(*) AS total FROM outfit WHERE user_id = :userId AND deleted_at IS NULL`,
            { userId: req.user.id }
        );
        const totalOutfits = outfitsCountRes.rows ? outfitsCountRes.rows[0].TOTAL : 0;

        // คำนวณ Style ที่พบบ่อยที่สุดของผู้ใช้นี้
        const topStyleRes = await db.executeQuery(
            `SELECT s.style_name, COUNT(*) AS cnt
             FROM item_style is_rel
             JOIN clothing_item ci ON is_rel.item_id = ci.item_id
             JOIN style s ON is_rel.style_id = s.style_id
             WHERE ci.user_id = :userId AND ci.deleted_at IS NULL
             GROUP BY s.style_name
             ORDER BY cnt DESC
             FETCH FIRST 1 ROWS ONLY`,
            { userId: req.user.id }
        );
        const topStyle = (topStyleRes.rows && topStyleRes.rows.length > 0) ? topStyleRes.rows[0].STYLE_NAME : 'CASUAL';

        res.json({
            totalClothes,
            totalOutfits,
            topStyle
        });
    } catch (e) {
        console.error('Get Stats Error:', e);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงสถิติ: ' + e.message });
    }
});

// START SERVER & INITIALIZE DATABASE POOL
async function startServer() {
    try {
        await db.initDbPool();
    } catch (dbErr) {
        console.warn('⚠️ ไม่สามารถเชื่อมต่อ Oracle ตอนสตาร์ทได้ เซิร์ฟเวอร์จะยังคงเปิดทำงานต่อไป แต่โปรดระบุ ORACLE_PASSWORD ใน backend/.env ก่อนใช้งาน API');
    }

    const server = app.listen(PORT, () => {
        console.log(`=================================`);
        console.log(`🚀 LongLook Backend Running on Port ${PORT}`);
        console.log(`📡 Oracle Database Target: ${process.env.ORACLE_USER || 'LONGLOOK'} @ ${process.env.ORACLE_CONNECT_STRING || 'localhost:1521/FREEPDB1'}`);
        console.log(`=================================`);
    });

    // ปิด Connection Pool อย่างปลอดภัยเมื่อ Process ได้รับสัญญาณหยุด
    const handleShutdown = async (signal) => {
        console.log(`\n🛑 ได้รับสัญญาณ ${signal}, กำลังปิดเซิร์ฟเวอร์...`);
        server.close(async () => {
            await db.closePool();
            process.exit(0);
        });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

startServer();