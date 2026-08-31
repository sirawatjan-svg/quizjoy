# Interactive Video Quizjoy (repo: `quizjoy`)

Kahoot-style ควิซแบบ Interactive Camera Quiz — นักเรียนแต่ละคนใช้อุปกรณ์ของตัวเอง (วางตั้งไว้ ไม่ต้องถือ)
ตอบคำถามด้วย **ท่าทางมือผ่านกล้อง** แทนการแตะจอ พร้อม Bonus Challenge ธีมเทรนด์ (ยกมือ/โบกมือตามจังหวะ)
และคลังข้อสอบที่ครูสร้าง/นำกลับมาใช้ซ้ำได้ พร้อมหน้าดูเฉลยย้อนหลังหลังทำข้อสอบเสร็จ

**ไม่ใช่ VR** — ไม่มีกล่อง/แว่นใดๆ ทั้งสิ้น เป็นเว็บเพจธรรมดาที่ใช้กล้องหน้าของอุปกรณ์แต่ละเครื่อง

**Game mechanic: จับเวลา ไม่ใช่จำนวนข้อ** — ตั้งเวลาเล่นได้ (ค่าเริ่มต้น 5 นาที) ถ้านักเรียนตอบครบชุดคำถาม
ก่อนหมดเวลา ระบบวนกลับไปข้อแรกให้เล่นต่อ จนกว่าเวลาจะหมด

## สถานะ

✅ **ระบบหลักทำงานจบ end-to-end แล้วด้วยข้อมูลจริง พร้อม auth + security rules ใช้งานจริง** — ครู login
(Firebase Auth) → คลังข้อสอบ → สร้างห้อง/QR → นักเรียนเข้าเล่นโดยไม่ต้อง login → คะแนน sync สดกลับมาที่ครู →
จบเกมด้วยเวลา ทดสอบจริงผ่าน Firestore project `quizjoy-3d136` (ไม่ใช่ mock) ทั้งสอง direction (auth บล็อกคน
ไม่ login / อนุญาตคน login แล้ว) ที่ยังไม่ทำ: หน้า Review ย้อนหลัง, ทดสอบกล้องบนมือถือจริง

## สถาปัตยกรรม

```
quizjoy/
├── index.html              # หน้าเข้าห้อง (นักเรียนสแกน QR มาลงตรงนี้)
├── student/
│   ├── index.html          # หน้าเล่นเกมหลัก (คำถาม + 4 มุม + กล้อง + timer)
│   └── app.js               # logic: join room, timer/loop mechanic, gesture detection
├── teacher/
│   ├── login.html          # เข้าสู่ระบบ/สมัครครู (Firebase Auth email+password)
│   ├── index.html          # เมนูหลักของครู (guarded — เด้งไป login.html ถ้ายังไม่ login)
│   ├── question-bank.html  # คลังข้อสอบ (สร้าง/แก้ไข/ค้นหา) — guarded
│   ├── host.html            # สร้างห้อง/ตั้งเวลาเล่น/เริ่มเกม/QR/monitor คะแนนสด — guarded
│   └── review.html          # ดูผลย้อนหลังทั้งห้อง + รายบุคคล — guarded, ต่อ Firestore จริงแล้ว
├── firestore.rules          # Security rules ใช้งานจริง — publish แล้วในโปรเจกต์จริง
└── assets/
    ├── js/
    │   ├── firebase-config.js   # config จริงของโปรเจกต์ quizjoy-3d136
    │   ├── firebase-init.js     # init Firebase app (Firestore + Auth)
    │   ├── auth-guard.js        # requireAuth()/wireLogoutButton() ใช้ร่วมกันทุกหน้าครู
    │   ├── gesture-detection.js # MediaPipe HandLandmarker wrapper (v1.0.1, GPU→CPU fallback, smoothing)
    │   ├── bonus-engine.js      # Bonus Challenge: shuffle-bag picker + 5 เกมพร้อมใช้ทั้งหมด
    │   └── sample-questions.js  # ชุดคำถามทดสอบ: สังคมศึกษา ทวีปแอฟริกา (10 ข้อ)
    └── css/
        └── style.css
test/
├── mediapipe-selftest.html    # ทดสอบ MediaPipe pipeline แบบ IMAGE mode (ไม่ต้องใช้กล้อง)
├── bonus-selftest.html        # ทดสอบ logic ของ Bonus Challenge ทั้ง 5 เกมแบบจำลอง zone event
├── firestore-selftest.html    # ทดสอบเขียน/อ่าน Firestore จริง (ยืนยัน config เชื่อมต่อได้)
└── seed-sample-questions.html # ใส่คำถามตัวอย่าง (Africa 10 ข้อ) ลงคลังข้อสอบจริง — รันครั้งเดียวพอ
```

## Data Model (Firestore) — ใช้งานจริงแล้ว

- `questionBank/{questionId}` — subject, text, options{tl,tr,bl,br}, correctZone, explanation, createdAt
- `sessions/{roomCode}` — quizTitle, durationMinutes, **questions[]** (snapshot เต็มของคำถามที่เลือก ณ ตอนสร้างห้อง
  ไม่ใช่แค่ id — กันปัญหาถ้าครูแก้คลังระหว่างเล่นอยู่), status, createdAt — เอกสาร id คือ room code เอง (เช่น `L3E2C`)
- `sessions/{roomCode}/players/{studentId}` — name, joinedAt
- `sessions/{roomCode}/results/{studentId}` — name, score, bonusScore, answeredCount, status, updatedAt,
  **answers[]** ({questionId, selectedZone, isCorrect, answeredAt} ต่อคำตอบ ผ่าน `arrayUnion` — ใช้ทำหน้า Review)
  (เขียนแบบ merge ทุกครั้งที่ตอบ/ได้คะแนนโบนัส ไม่ใช่เขียนทีเดียวตอนจบ — ทำให้ครูเห็นคะแนนสดได้จริง)

## ต้องทำต่อ (TODO)

- [x] รับ Firebase config จากผู้ใช้ → ใส่ใน `assets/js/firebase-config.js` แล้ว (project: `quizjoy-3d136`)
      **ยืนยันแล้วว่าเชื่อมต่อ Firestore จริงได้** — เขียน/อ่าน doc ทดสอบสำเร็จผ่าน `test/firestore-selftest.html`
- [x] Firestore Database สร้างแล้ว (Standard edition, asia-southeast1)
- [x] Firebase Auth (Email/Password) เปิดใช้งานแล้ว — ระบบ login ครูใน `teacher/login.html` + auth guard
      ทุกหน้าครู ทดสอบแล้วครบ: สมัคร/login/logout/redirect เมื่อไม่ login
- [x] Firestore Security Rules ใช้งานจริงแล้ว (`firestore.rules`, publish แล้วในโปรเจกต์จริง — ไม่ใช่ test mode
      อีกต่อไป) **ยืนยันทั้ง 2 ทิศทางแล้ว**: ไม่ login → เขียน questionBank โดนบล็อก (permission-denied);
      login แล้ว → เขียนได้ปกติ; นักเรียนไม่ต้อง login ก็ join ห้อง/เขียนคะแนนได้ตามดีไซน์ (ยืนยันด้วยการอ่าน
      ค่ากลับจาก Firestore ตรงๆ ไม่ใช่แค่ดู UI)
- [x] Integrate MediaPipe HandLandmarker (`gesture-detection.js`) — v1.0.1, GPU→CPU delegate fallback,
      confidence threshold, dead-zone, smoothing (EMA), `onError` callback ให้ fallback ไป tap ได้เอง
      **ยืนยันแล้วว่า pipeline โหลด/รัน inference ถูกต้อง** (`test/mediapipe-selftest.html` — เจอมือ 21
      landmark ตรงตำแหน่งจริงในรูปทดสอบ) **แต่ยังไม่เคยทดสอบกล้องสดบนอุปกรณ์จริง** เพราะ dev sandbox
      บล็อก getUserMedia เสมอ — ต้องทดสอบ threshold/ความไวจริงบนมือถือก่อนใช้งานจริงในห้องเรียน
- [x] Fallback: แตะจอตอบได้เมื่อกล้อง/แสงมีปัญหา — ทดสอบแล้ว ทำงานถูกต้อง
- [x] Game mechanic: จับเวลา + วนคำถามซ้ำ (ทดสอบ logic แล้วใน student/app.js)
- [x] Teacher: Question Bank CRUD ต่อ Firestore จริงแล้ว — เพิ่ม/ลบ/list realtime + ค้นหา ทดสอบแล้วด้วย
      คำถามจริง 10 ข้อ (seed จาก `sample-questions.js` ผ่าน `test/seed-sample-questions.html`)
- [x] Teacher: Quiz Builder ต่อ Firestore จริงแล้ว (`host.html`) — เลือกคำถามจากคลัง (checkbox), ตั้งชื่อ,
      ตั้งเวลาเล่น, สร้าง session doc พร้อม QR code (คลัง `qrcodejs` จาก cdnjs), คะแนนสด realtime ผ่าน onSnapshot
      **ทดสอบ end-to-end จริงแล้ว**: สร้างห้อง → นักเรียน join คนละแท็บ → ตอบคำถาม → คะแนนขึ้นที่ครูทันทีไม่ต้องรีเฟรช
- [x] Student: โหลดคำถาม/เวลาเล่นจากห้องจริงใน Firestore แทน hardcode, เขียนคะแนนกลับแบบ realtime, จบเกม
      บันทึกสถานะ "finished" — ทดสอบแล้วครบ flow (session not-found error handling ก็ทดสอบ path ไว้ในโค้ดด้วย)
- [x] Bonus Challenge — ครบทั้ง 5 เกม (ไล่จับ Skibidi, ชูมือสุดขีด, จังหวะมือ 6-7, ตามท่ามือ, ไล่ตี Brainrot)
      ทดสอบแล้วทั้ง end-to-end ในหน้าเล่นจริง (trigger → banner → มินิเกม → กลับเข้าคำถาม) และ logic ระดับ ms
      ผ่าน `test/bonus-selftest.html` (จำลอง zone event แม่นยำ ตรวจ score/debounce/timeout ทุกเกม)
- [x] หน้า Review ย้อนหลัง — ครบทั้งฝั่งนักเรียน (`student/index.html` ปุ่ม "ดูเฉลยย้อนหลัง" ที่หน้าจบเกม)
      และฝั่งครู (`teacher/review.html` — เลือก session, ดูคะแนนรายบุคคล คลิกขยายดูรายข้อ, สรุปรายข้อเรียง
      จากข้อที่พลาดเยอะสุดก่อน) เก็บ `answers[]` ต่อคำถามลง `results` doc ผ่าน `arrayUnion` เพื่อรองรับฟีเจอร์นี้
      **ทดสอบ end-to-end จริงแล้ว** ด้วยคำตอบผสมถูก/ผิด ยืนยันทั้งฝั่งนักเรียนและครูตรงกัน
- [ ] Leaderboard สรุปท้ายเกม (คำถาม + bonus รวมกัน) — ตอนนี้มีคะแนนสดใน host.html แล้ว ที่ขาดคือหน้าสรุปท้ายคาบแยกต่างหาก
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
