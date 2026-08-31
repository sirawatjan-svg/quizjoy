# Interactive Video Quizjoy

Kahoot-style ควิซแบบ Interactive Camera Quiz — นักเรียนแต่ละคนใช้อุปกรณ์ของตัวเอง (วางตั้งไว้ ไม่ต้องถือ)
ตอบคำถามด้วย **ท่าทางมือผ่านกล้อง** แทนการแตะจอ พร้อม Bonus Challenge ธีมเทรนด์ (ยกมือ/โบกมือตามจังหวะ)
และคลังข้อสอบที่ครูสร้าง/นำกลับมาใช้ซ้ำได้ พร้อมหน้าดูเฉลยย้อนหลังหลังทำข้อสอบเสร็จ

**ไม่ใช่ VR** — ไม่มีกล่อง/แว่นใดๆ ทั้งสิ้น เป็นเว็บเพจธรรมดาที่ใช้กล้องหน้าของอุปกรณ์แต่ละเครื่อง

## สถานะ

🚧 กำลังวางโครง (scaffold) — รอ Firebase config จากผู้ใช้ก่อนต่อระบบ backend จริง

## สถาปัตยกรรม

```
interactive-video-quizjoy/
├── index.html              # หน้าเข้าห้อง (นักเรียนสแกน QR มาลงตรงนี้)
├── student/
│   ├── index.html          # หน้าเล่นเกมหลัก (คำถาม + 4 มุม + กล้อง)
│   └── app.js               # logic: join room, sync คำถาม, gesture detection
├── teacher/
│   ├── index.html          # เมนูหลักของครู
│   ├── question-bank.html  # คลังข้อสอบ (สร้าง/แก้ไข/ค้นหา)
│   ├── host.html            # สร้างห้อง/เริ่มเกม/QR/monitor คะแนนสด
│   └── review.html          # ดูผลย้อนหลังทั้งห้อง + รายบุคคล
└── assets/
    ├── js/
    │   ├── firebase-config.js   # ← ใส่ config จริงตรงนี้เมื่อได้จากผู้ใช้
    │   ├── firebase-init.js     # init Firebase app (Firestore)
    │   └── gesture-detection.js # MediaPipe Hands wrapper (รอ integrate)
    └── css/
        └── style.css
```

## Data Model (Firestore) — แผนเบื้องต้น

- `questionBank/{questionId}` — คำถาม, ตัวเลือก 4, เฉลย, วิชา/tag, คำอธิบายเฉลย, รูปภาพ (optional)
- `sessions/{sessionId}` — roomCode, quizTitle, questionIds[], status (waiting/playing/ended), createdAt
- `sessions/{sessionId}/players/{studentId}` — ชื่อนักเรียน, joinedAt
- `sessions/{sessionId}/results/{studentId}` — answers[] (questionId, selected, correct, timeMs), score, bonusScore

## ต้องทำต่อ (TODO)

- [ ] รับ Firebase config จากผู้ใช้ → ใส่ใน `assets/js/firebase-config.js`
- [ ] ตั้ง Firestore security rules เบื้องต้น
- [ ] Integrate MediaPipe Hands (`gesture-detection.js`) — จับตำแหน่งมือ map เป็น 4 โซน
- [ ] Fallback: แตะจอตอบได้เมื่อกล้อง/แสงมีปัญหา
- [ ] Teacher: Question Bank CRUD เต็มรูปแบบ
- [ ] Teacher: Quiz Builder (เลือกจากคลัง + เขียนใหม่ → preview → ตั้งชื่อ → publish/QR)
- [ ] Bonus Challenge mini-games (ยกมือ/โบกมือตามจังหวะ ธีม Skibidi / 6-7 / Hand Dance)
- [ ] หน้า Review ย้อนหลัง (นักเรียน + ครู)
- [ ] Leaderboard สรุปท้ายเกม (คำถาม + bonus รวมกัน)
- [ ] Deploy ขึ้น GitHub Pages (`sirawatjan-svg.github.io/interactive-video-quizjoy`)

## เนื้อหาทดสอบชุดแรก

รอยืนยันวิชา/บทเรียนจากผู้ใช้ เพื่อใส่คำถามจริงทดสอบระบบ
