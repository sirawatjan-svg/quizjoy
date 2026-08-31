# Interactive Video Quizjoy (repo: `quizjoy`)

Kahoot-style ควิซแบบ Interactive Camera Quiz — นักเรียนแต่ละคนใช้อุปกรณ์ของตัวเอง (วางตั้งไว้ ไม่ต้องถือ)
ตอบคำถามด้วย **ท่าทางมือผ่านกล้อง** แทนการแตะจอ พร้อม Bonus Challenge ธีมเทรนด์ (ยกมือ/โบกมือตามจังหวะ)
และคลังข้อสอบที่ครูสร้าง/นำกลับมาใช้ซ้ำได้ พร้อมหน้าดูเฉลยย้อนหลังหลังทำข้อสอบเสร็จ

**ไม่ใช่ VR** — ไม่มีกล่อง/แว่นใดๆ ทั้งสิ้น เป็นเว็บเพจธรรมดาที่ใช้กล้องหน้าของอุปกรณ์แต่ละเครื่อง

**Game mechanic: จับเวลา ไม่ใช่จำนวนข้อ** — ตั้งเวลาเล่นได้ (ค่าเริ่มต้น 5 นาที) ถ้านักเรียนตอบครบชุดคำถาม
ก่อนหมดเวลา ระบบวนกลับไปข้อแรกให้เล่นต่อ จนกว่าเวลาจะหมด

## สถานะ

🚧 กำลังวางโครง (scaffold) — layout/mechanic หลัก, Bonus Challenge ทั้ง 5 เกม, และ MediaPipe pipeline
ทดสอบแล้ว (ดูหัวข้อ "การทดสอบที่ทำแล้ว" ด้านล่าง) รอ Firebase config จากผู้ใช้ก่อนต่อระบบ backend จริง

## สถาปัตยกรรม

```
quizjoy/
├── index.html              # หน้าเข้าห้อง (นักเรียนสแกน QR มาลงตรงนี้)
├── student/
│   ├── index.html          # หน้าเล่นเกมหลัก (คำถาม + 4 มุม + กล้อง + timer)
│   └── app.js               # logic: join room, timer/loop mechanic, gesture detection
├── teacher/
│   ├── index.html          # เมนูหลักของครู
│   ├── question-bank.html  # คลังข้อสอบ (สร้าง/แก้ไข/ค้นหา)
│   ├── host.html            # สร้างห้อง/ตั้งเวลาเล่น/เริ่มเกม/QR/monitor คะแนนสด
│   └── review.html          # ดูผลย้อนหลังทั้งห้อง + รายบุคคล
└── assets/
    ├── js/
    │   ├── firebase-config.js   # ← ใส่ config จริงตรงนี้เมื่อได้จากผู้ใช้
    │   ├── firebase-init.js     # init Firebase app (Firestore)
    │   ├── gesture-detection.js # MediaPipe HandLandmarker wrapper (v1.0.1, GPU→CPU fallback, smoothing)
    │   ├── bonus-engine.js      # Bonus Challenge: shuffle-bag picker + 5 เกมพร้อมใช้ทั้งหมด
    │   └── sample-questions.js  # ชุดคำถามทดสอบ: สังคมศึกษา ทวีปแอฟริกา (10 ข้อ)
    └── css/
        └── style.css
test/
├── mediapipe-selftest.html  # ทดสอบ MediaPipe pipeline แบบ IMAGE mode (ไม่ต้องใช้กล้อง)
└── bonus-selftest.html      # ทดสอบ logic ของ Bonus Challenge ทั้ง 5 เกมแบบจำลอง zone event
```

## Data Model (Firestore) — แผนเบื้องต้น

- `questionBank/{questionId}` — คำถาม, ตัวเลือก 4, เฉลย, วิชา/tag, คำอธิบายเฉลย, รูปภาพ (optional)
- `sessions/{sessionId}` — roomCode, quizTitle, questionIds[], **durationMinutes** (ค่าเริ่มต้น 5), status (waiting/playing/ended), createdAt
- `sessions/{sessionId}/players/{studentId}` — ชื่อนักเรียน, joinedAt
- `sessions/{sessionId}/results/{studentId}` — answers[] (questionId, selected, correct, timeMs), score, bonusScore

## ต้องทำต่อ (TODO)

- [x] รับ Firebase config จากผู้ใช้ → ใส่ใน `assets/js/firebase-config.js` แล้ว (project: `quizjoy-3d136`)
      **ยืนยันแล้วว่าเชื่อมต่อ Firestore จริงได้** — เขียน/อ่าน doc ทดสอบสำเร็จผ่าน `test/firestore-selftest.html`
- [x] Firestore Database สร้างแล้ว (Standard edition, test mode, asia-southeast1) — ใช้ได้ถึง 30 ก.ย. 2026
      ก่อนหมดอายุต้องตั้ง security rules ที่รัดกุมกว่า test mode (ดู TODO ถัดไป)
- [ ] ตั้ง Firestore security rules แบบใช้งานจริง (ก่อน 30 ก.ย. 2026 ที่ test mode หมดอายุ)
- [x] Integrate MediaPipe HandLandmarker (`gesture-detection.js`) — v1.0.1, GPU→CPU delegate fallback,
      confidence threshold, dead-zone, smoothing (EMA), `onError` callback ให้ fallback ไป tap ได้เอง
      **ยืนยันแล้วว่า pipeline โหลด/รัน inference ถูกต้อง** (`test/mediapipe-selftest.html` — เจอมือ 21
      landmark ตรงตำแหน่งจริงในรูปทดสอบ) **แต่ยังไม่เคยทดสอบกล้องสดบนอุปกรณ์จริง** เพราะ dev sandbox
      บล็อก getUserMedia เสมอ — ต้องทดสอบ threshold/ความไวจริงบนมือถือก่อนใช้งานจริงในห้องเรียน
- [x] Fallback: แตะจอตอบได้เมื่อกล้อง/แสงมีปัญหา — ทดสอบแล้ว ทำงานถูกต้อง
- [x] Game mechanic: จับเวลา + วนคำถามซ้ำ (ทดสอบ logic แล้วใน student/app.js)
- [ ] Teacher: Question Bank CRUD เต็มรูปแบบ (ต่อ Firestore)
- [ ] Teacher: Quiz Builder (เลือกจากคลัง + เขียนใหม่ → preview → ตั้งชื่อ → publish/QR) + ตั้งเวลาเล่น
- [x] Bonus Challenge — ครบทั้ง 5 เกม (ไล่จับ Skibidi, ชูมือสุดขีด, จังหวะมือ 6-7, ตามท่ามือ, ไล่ตี Brainrot)
      ทดสอบแล้วทั้ง end-to-end ในหน้าเล่นจริง (trigger → banner → มินิเกม → กลับเข้าคำถาม) และ logic ระดับ ms
      ผ่าน `test/bonus-selftest.html` (จำลอง zone event แม่นยำ ตรวจ score/debounce/timeout ทุกเกม)
- [ ] หน้า Review ย้อนหลัง (นักเรียน + ครู)
- [ ] Leaderboard สรุปท้ายเกม (คำถาม + bonus รวมกัน)
- [ ] Deploy ขึ้น GitHub Pages (`sirawatjan-svg.github.io/quizjoy`)

## เนื้อหาทดสอบชุดแรก

✅ สังคมศึกษา ม.2 — ทวีปแอฟริกา (10 ข้อ ระดับง่าย) อยู่ใน `assets/js/sample-questions.js`

## Bonus Challenge — กลไกทั้ง 5 เกม (สร้างและทดสอบครบแล้ว)

ทุกเกมต่อกับ `bonus-engine.js` ผ่าน `ctx` เดียวกัน (corners, stage, setZoneHandler, onScore, onEnd)
เพิ่มเกมใหม่ในอนาคต: เขียน `run{ชื่อเกม}(ctx)` แล้วเพิ่มใน `BONUS_RUNNERS` + `BONUS_GAMES`

| เกม | โจทย์ | การจับ | คะแนน |
|---|---|---|---|
| 🚽 ไล่จับ Skibidi (`skibidi-dodge`) | ไอคอนโผล่มุมสุ่ม 6 รอบ ต้องชี้/แตะให้ทันก่อนหมดเวลา (1200ms→700ms) | zone match ทันที ไม่ต้องค้าง | +50 ฐาน + streak bonus +10/ครั้งติดกัน |
| 🙌 ชูมือสุดขีด (`reach-sky`) | ยกมือสูงค้าง 3 วิ | เช็ค `point.y < 0.35` ต่อเนื่อง | +120 สำเร็จ / +30 participation ถ้าไม่มีใครทำสำเร็จภายใน 10 วิ |
| ✋ จังหวะมือ 6-7 (`hand-bounce`) | สลับชี้ซ้าย(tl+bl)/ขวา(tr+br) ตามจังหวะ beep ที่เร่งจาก 100→140 BPM ใน 10 วิ | เทียบ timestamp การชี้กับ beat ±250ms | +30 ตรงเป๊ะ(±100ms) / +15 หลวม |
| 🕺 ตามท่ามือ (`hand-dance-follow`) | Simon Says โซน เริ่ม 3 โซน ยาวขึ้น +1 ทุกรอบ (max 6) | debounce zone entry เทียบกับลำดับที่สุ่มไว้ | +40/รอบผ่าน, +60 ผ่านครบ, พลาด = ได้คะแนนรอบที่ผ่านมาแล้ว (ไม่ใช่ 0) |
| 🐊 ไล่ตี Brainrot (`brainrot-swat`) | หลายตัวพร้อมกันได้ในช่วงท้าย 10 วิ ต้องตีให้ทันก่อนหาย (~900ms) | active-zone map รองรับหลายเป้าพร้อมกัน | +35 ฐาน + combo multiplier (cap +25) |

**หมายเหตุลิขสิทธิ์:** เกม 6-7 ใช้เสียง beep สังเคราะห์เอง (Web Audio API `OscillatorNode`) ไม่ใช้คลิปเพลง/เสียง
จากคลิปไวรัลจริง — ยืมแค่ชื่อ/คอนเซปต์เทรนด์มาตั้งชื่อเกม เกม Brainrot ใช้ emoji ล้วน ไม่ใช้ asset ภาพจากที่ไหน

**การทดสอบที่ทำแล้ว:** รัน `test/bonus-selftest.html` จำลอง zone event ระดับ ms ตรงกับ `setZoneHandler`
ของแต่ละเกม ยืนยันแล้วว่า: คะแนน/streak/combo คำนวณถูกต้องทุกเกม, debounce ของ hand-dance-follow กันนับ
input ซ้ำได้จริง, safety-timeout ทุกเกมจบเกมได้แม้ไม่มี input เลย (ไม่มีเกมไหนค้าง) ส่วนการ trigger จริงจาก
เล่นคำถาม (banner → มินิเกม → กลับเข้าคำถาม) ทดสอบผ่าน `student/index.html` ด้วย tap-fallback แล้วเช่นกัน
