// question-sets.js
// ตรรกะล้วนๆ เกี่ยวกับ "ชุดข้อสอบ" (questionSets) แยกจาก Firestore ทั้งหมด เพื่อทดสอบตรงๆ ได้โดยไม่ต้อง
// login/มี Firestore จริง (ดู test/question-sets-selftest.html)
//
// ที่มา: เดิมคำถามทั้งคลังกองรวมกันเป็นพูลเดียว ผูกกับช่อง "วิชา" ที่เป็นแค่ข้อความอิสระ ไม่มีการแยกเป็น
// "ชุด" จริงจังแบบที่ครูคุ้นเคยจาก Kahoot/Blooket (แต่ละชุดข้อสอบเป็นการ์ดแยก มีชื่อ/จำนวนคำถามของตัวเอง)
// เพิ่มคอลเลกชัน Firestore ใหม่ questionSets (แค่ {title, createdAt, updatedAt}) แล้วให้คำถามแต่ละข้อ
// ใน questionBank ผูกกับชุดผ่านช่อง setId แทนที่จะลอยอยู่เดี่ยวๆ

// สีพื้นหลังการ์ดชุดข้อสอบ — วนซ้ำตามลำดับที่กำหนดไว้ตายตัว (ไม่สุ่มตอนโหลดหน้า) เพราะถ้าสุ่มทุกครั้ง
// การ์ดชุดเดิมจะเปลี่ยนสีไปมาทุกครั้งที่เปิดหน้าใหม่ ดูไม่นิ่ง — ใช้ hash ของ id เป็น seed แทนให้ชุดเดิม
// ได้สีเดิมเสมอ
export const SET_CARD_COLORS = [
  "linear-gradient(135deg, #ff8a5c, #f0529c)",
  "linear-gradient(135deg, #4da3ff, #8b7cf6)",
  "linear-gradient(135deg, #2dd4a0, #4da3ff)",
  "linear-gradient(135deg, #f472b6, #8b7cf6)",
  "linear-gradient(135deg, #facc15, #fb7185)",
  "linear-gradient(135deg, #34d399, #22c55e)",
];

export function colorForSetId(id) {
  const str = id ?? "";
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return SET_CARD_COLORS[hash % SET_CARD_COLORS.length];
}

// นับจำนวนคำถามของแต่ละชุด จาก cache คำถามทั้งหมดในคลังที่โหลดมาแล้ว (ไม่ต้อง query แยกทีละชุด)
// คืนค่า Map<setId, count> — คำถามที่ไม่มี setId (ยังไม่ถูกย้าย) จะไม่ถูกนับเลย
export function countQuestionsBySet(questions) {
  const counts = new Map();
  (questions ?? []).forEach((q) => {
    if (!q.setId) return;
    counts.set(q.setId, (counts.get(q.setId) ?? 0) + 1);
  });
  return counts;
}

// แผนการย้ายข้อมูลเดิมครั้งเดียว: คำถามที่ยังไม่มี setId แต่มี "วิชา" เป็นข้อความอยู่แล้ว (ของก่อนมีระบบชุด)
// → จัดกลุ่มตามชื่อวิชาเดิมทุกตัวอักษร คืนค่า Map<subject, questionId[]> ให้ผู้เรียกไปสร้างชุดใหม่ 1 ชุดต่อ
// 1 กลุ่ม แล้วเขียน setId กลับเข้าคำถามแต่ละข้อ — เป็น pure function ล้วนๆ ไม่แตะ Firestore เอง จึงเรียกซ้ำ
// กี่ครั้งก็ได้อย่างปลอดภัย (คำถามที่ถูกย้ายไปแล้ว คือมี setId แล้ว จะไม่โผล่ในแผนอีกครั้ง)
export function planSubjectMigration(questions) {
  const groups = new Map();
  (questions ?? []).forEach((q) => {
    if (q.setId) return; // ย้ายไปแล้ว ข้าม
    const subject = (q.subject ?? "").trim();
    if (!subject) return; // ไม่มีวิชาให้จัดกลุ่มเลย (ไม่ควรเกิดขึ้นจริง แต่กันไว้)
    if (!groups.has(subject)) groups.set(subject, []);
    groups.get(subject).push(q.id);
  });
  return groups;
}
