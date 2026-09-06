// bulk-import.js
// ตัวแปลงข้อความหลายบรรทัดเป็นคำถามหลายข้อพร้อมกัน — แยกมาเป็นฟังก์ชันล้วนๆ (ไม่แตะ Firestore เอง) เพื่อให้
// ทดสอบตรงๆ ได้โดยไม่ต้อง login/มี Firestore จริง (ดู test/bulk-import-selftest.html)
//
// ที่มา: ครูยังไม่ได้สร้างคลังข้อสอบ/แบบทดสอบจริงเลย (แค่ทดสอบด้วยชุด "ทวีปแอฟริกา" 10 ข้อ) พอถึงเวลาจริง
// ต้องพิมพ์เป็นสิบๆ ข้อ พิมพ์ทีละข้อผ่านฟอร์มเดิมจะช้ามาก — เพิ่มโหมด "นำเข้าหลายข้อพร้อมกัน" ให้วางข้อความ
// จากที่พิมพ์ไว้ล่วงหน้า (เช่นใน Google Docs/Sheets) ทีเดียวได้เลย
//
// รูปแบบ 1 บรรทัดต่อ 1 คำถาม คั่นด้วย | (pipe) เลือกใช้ | แทน , เพราะคำถาม/ตัวเลือกอาจมีจุลภาคอยู่ในเนื้อหา
// จริงได้ (เช่น "1, 2 หรือ 3") แต่แทบไม่มีใครพิมพ์ | ปนในคำถามธรรมดา:
//   วิชา|คำถาม|ตัวเลือกA|ตัวเลือกB|ตัวเลือกC|ตัวเลือกD|เฉลย(A/B/C/D)|คำอธิบาย(ไม่บังคับ เว้นว่างได้)
// บรรทัดว่างหรือขึ้นต้นด้วย # (ใช้เป็นหมายเหตุ/หัวตาราง) จะถูกข้ามไป ไม่นับเป็นบรรทัดผิดพลาด

const LETTER_TO_ZONE = { a: "tl", b: "tr", c: "bl", d: "br" };

// รับข้อความดิบทั้งก้อน คืนค่า { valid: [{subject,text,options,correctZone,explanation}], errors: [{line,
// raw, message}] } — ตั้งใจไม่ throw เลยแม้เจอบรรทัดผิดพลาด ให้ผู้เรียกนำเข้าเฉพาะบรรทัดที่ถูกต้องได้เลย
// ไม่ต้องรอแก้ให้ถูกทั้งหมดก่อนถึงจะนำเข้าได้สักข้อ (ใจดีกับครูที่อาจพิมพ์ผิดบางบรรทัดในก้อนใหญ่ๆ)
export function parseBulkQuestions(raw) {
  const valid = [];
  const errors = [];
  const lines = (raw ?? "").split("\n");

  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return; // บรรทัดว่าง/หมายเหตุ ข้ามเงียบๆ ไม่นับเป็น error

    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 7 || parts.length > 8) {
      errors.push({
        line: lineNo,
        raw: rawLine,
        message: `ต้องมี 7-8 ช่องคั่นด้วย | (เจอ ${parts.length} ช่อง) รูปแบบ: วิชา|คำถาม|A|B|C|D|เฉลย|คำอธิบาย(ไม่บังคับ)`,
      });
      return;
    }

    const [subject, text, optA, optB, optC, optD, correctLetterRaw, explanation = ""] = parts;
    if (!subject || !text || !optA || !optB || !optC || !optD) {
      errors.push({ line: lineNo, raw: rawLine, message: "วิชา/คำถาม/ตัวเลือกทั้ง 4 ห้ามเว้นว่าง" });
      return;
    }

    const correctZone = LETTER_TO_ZONE[correctLetterRaw.trim().toLowerCase()];
    if (!correctZone) {
      errors.push({
        line: lineNo,
        raw: rawLine,
        message: `เฉลยต้องเป็น A, B, C หรือ D เท่านั้น (เจอ "${correctLetterRaw}")`,
      });
      return;
    }

    valid.push({
      subject,
      text,
      options: { tl: optA, tr: optB, bl: optC, br: optD },
      correctZone,
      explanation: explanation.trim(),
    });
  });

  return { valid, errors };
}
