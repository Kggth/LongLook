const oracledb = require('oracledb');
require('dotenv').config();

// ตั้งค่าให้ผลลัพธ์จาก Query คืนค่าเป็น JavaScript Object (key เป็นชื่อคอลัมน์)
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
// เปิดใช้งาน Auto-commit ค่าเริ่มต้นสำหรับคำสั่งเดี่ยว (แต่ Transaction หลายคำสั่งจะควบคุมเอง)
oracledb.autoCommit = false;

let pool = null;

/**
 * สร้าง Connection Pool สำหรับ Oracle Database
 */
async function initDbPool() {
    if (pool) return pool;

    const user = process.env.ORACLE_USER || 'LONGLOOK';
    const password = process.env.ORACLE_PASSWORD;
    const connectString = process.env.ORACLE_CONNECT_STRING || 'localhost:1521/FREEPDB1';

    if (!password) {
        console.warn('⚠️ [Oracle DB] ยังไม่ได้ระบุ ORACLE_PASSWORD ในไฟล์ backend/.env');
    }

    try {
        pool = await oracledb.createPool({
            user: user,
            password: password,
            connectString: connectString,
            poolMin: 2,
            poolMax: 10,
            poolIncrement: 2,
            poolTimeout: 60
        });
        console.log(`✅ [Oracle DB] เชื่อมต่อ Connection Pool สำเร็จ (User: ${user}, ConnectString: ${connectString})`);
        return pool;
    } catch (err) {
        console.error('❌ [Oracle DB] ไม่สามารถสร้าง Connection Pool ได้:', err.message);
        throw err;
    }
}

/**
 * ดึง Connection จาก Pool
 */
async function getConnection() {
    if (!pool) {
        await initDbPool();
    }
    return await pool.getConnection();
}

/**
 * รันคำสั่ง SQL ภายใน Transaction เดียว พร้อม Commit หรือ Rollback อัตโนมัติ
 * @param {Function} callback ฟังก์ชันที่รับ connection และส่งกลับผลลัพธ์
 */
async function withTransaction(callback) {
    const connection = await getConnection();
    try {
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (err) {
        try {
            await connection.rollback();
        } catch (rbErr) {
            console.error('Rollback error:', rbErr.message);
        }
        throw err;
    } finally {
        try {
            await connection.close();
        } catch (closeErr) {
            console.error('Connection close error:', closeErr.message);
        }
    }
}

/**
 * รันคำสั่งคิวรีทั่วไป (SELECT) โดยเปิดและคืน Connection ให้ Pool อัตโนมัติ
 */
async function executeQuery(sql, binds = {}, options = {}) {
    const connection = await getConnection();
    try {
        return await connection.execute(sql, binds, options);
    } finally {
        try {
            await connection.close();
        } catch (closeErr) {
            console.error('Connection close error:', closeErr.message);
        }
    }
}

/**
 * ปิด Pool เมื่อเซิร์ฟเวอร์หยุดทำงาน
 */
async function closePool() {
    if (pool) {
        try {
            await pool.close(10);
            console.log('🔒 [Oracle DB] Connection Pool ปิดเรียบร้อย');
            pool = null;
        } catch (err) {
            console.error('Error closing Oracle pool:', err.message);
        }
    }
}

module.exports = {
    initDbPool,
    getConnection,
    withTransaction,
    executeQuery,
    closePool,
    oracledb
};
