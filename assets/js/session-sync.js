// session-sync.js
// คำนวณเวลาที่ใช้ร่วมกันทั้งห้อง + จัดอันดับผลคะแนน — แยกออกมาเป็นฟังก์ชันล้วนๆ (pure function ไม่แตะ
// Firestore/DOM เลย) ให้ทดสอบตรงๆ ได้ง่าย และใช้ร่วมกันทั้งฝั่งครู (teacher/host.html) กับนักเรียน
// (student/app.js) รับประกันว่าสองฝั่งจัดอันดับ/คำนวณเวลาจบเกมตรงกันเป๊ะเสมอ ไม่มีทางเขียนสูตรเพี้ยนกัน

// แปลง Firestore Timestamp (มี .toMillis()) หรือ plain object {seconds} (เช่นจาก REST API/แคชเก่า)
// ให้เป็น milliseconds แบบเดียวกัน — คืน null ถ้าไม่ใช่ timestamp ที่รู้จัก
export function timestampToMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return null;
}

// จาก startedAt (Firestore Timestamp ที่ commit จริงจากเซิร์ฟเวอร์ ไม่ใช่นาฬิกาเครื่องใครเครื่องมัน)
// + durationMinutes คำนวณเวลาที่เกมจะจบ — ทุกเครื่องในห้องเรียกฟังก์ชันนี้ด้วย startedAt ค่าเดียวกัน
// (อ่านจาก sessions/{room} doc เดียวกัน) จึงได้ gameEndsAt ตรงกันเป๊ะทุกเครื่อง ต่อให้นาฬิกาเครื่องใคร
// เพี้ยนแค่ไหนก็ตาม (ต่างจากของเดิมที่แต่ละคนคำนวณจาก Date.now() ของตัวเองตอนกด "เริ่มเล่น")
// คืน null ถ้า startedAt ยังไม่มี (ห้องยังไม่เริ่ม)
export function computeGameEndsAt(startedAt, durationMinutes) {
  const startedAtMs = timestampToMillis(startedAt);
  if (startedAtMs === null) return null;
  return startedAtMs + durationMinutes * 60 * 1000;
}

// เรียงผลคะแนนมาก->น้อย (คะแนนคำถาม + โบนัส รวมกัน) — ใช้ทั้งจอ "คะแนนสด"/"โพเดียม" ฝั่งครู และ
// "อันดับของฉัน"/"3 อันดับแรก" ฝั่งนักเรียน ให้เกณฑ์จัดอันดับตรงกันทั้งสองฝั่งเสมอ ไม่แยกสูตรกันคนละที่
export function sortResultsByScore(results) {
  return [...results].sort(
    (a, b) => (b.score ?? 0) + (b.bonusScore ?? 0) - ((a.score ?? 0) + (a.bonusScore ?? 0))
  );
}

// หาอันดับ (1-based) ของ id ที่ระบุ ในผลที่เรียงแล้ว (จาก sortResultsByScore) — คืน null ถ้าไม่เจอ
// (เช่น ยังไม่มีผลคะแนนของคนนั้นเลย เพิ่งเข้าห้องมายังไม่ตอบข้อไหน)
export function findRank(sortedResults, id) {
  const index = sortedResults.findIndex((r) => r.id === id);
  return index >= 0 ? index + 1 : null;
}
