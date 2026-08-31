# Interactive Video Quizjoy (repo: `quizjoy`)

Kahoot-style ควิซแบบ Interactive Camera Quiz — นักเรียนแต่ละคนใช้อุปกรณ์ของตัวเอง (วางตั้งไว้ ไม่ต้องถือ)
ตอบคำถามด้วย **ท่าทางมือผ่านกล้อง** แทนการแตะจอ พร้อม Bonus Challenge ธีมเทรนด์ (ยกมือ/โบกมือตามจังหวะ)
และคลังข้อสอบที่ครูสร้าง/นำกลับมาใช้ซ้ำได้ พร้อมหน้าดูเฉลยย้อนหลังหลังทำข้อสอบเสร็จ

**ไม่ใช่ VR** — ไม่มีกล่อง/แว่นใดๆ ทั้งสิ้น เป็นเว็บเพจธรรมดาที่ใช้กล้องหน้าของอุปกรณ์แต่ละเครื่อง

**Game mechanic: จับเวลา ไม่ใช่จำนวนข้อ** — ตั้งเวลาเล่นได้ (ค่าเริ่มต้น 5 นาที) ถ้านักเรียนตอบครบชุดคำถาม
ก่อนหมดเวลา ระบบวนกลับไปข้อแรกให้เล่นต่อ จนกว่าเวลาจะหมด

## สถานะ

🚧 กำลังวางโครง (scaffold) — layout/mechanic หลักทดสอบใน browser แล้ว รอ Firebase config จากผู้ใช้ก่อนต่อระบบ backend จริง

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
    │   ├── gesture-detection.js # MediaPipe Hands wrapper (รอ integrate/ทดสอบบนอุปกรณ์จริง)
    │   ├── bonus-engine.js      # Bonus Challenge mini-games (shuffle-bag picker + 2 เกมพร้อมใช้)
    │   └── sample-questions.js  # ชุดคำถามทดสอบ: สังคมศึกษา ทวีปแอฟริกา (10 ข้อ)
    └── css/
        └── style.css
```

## Data Model (Firestore) — แผนเบื้องต้น

- `questionBank/{questionId}` — คำถาม, ตัวเลือก 4, เฉลย, วิชา/tag, คำอธิบายเฉลย, รูปภาพ (optional)
- `sessions/{sessionId}` — roomCode, quizTitle, questionIds[], **durationMinutes** (ค่าเริ่มต้น 5), status (waiting/playing/ended), createdAt
- `sessions/{sessionId}/players/{studentId}` — ชื่อนักเรียน, joinedAt
- `sessions/{sessionId}/results/{studentId}` — answers[] (questionId, selected, correct, timeMs), score, bonusScore

## ต้องทำต่อ (TODO)

- [ ] รับ Firebase config จากผู้ใช้ → ใส่ใน `assets/js/firebase-config.js`
- [ ] ตั้ง Firestore security rules เบื้องต้น
- [ ] Integrate MediaPipe Hands (`gesture-detection.js`) — จับตำแหน่งมือ map เป็น 4 โซน (ต้องทดสอบบนมือถือจริง)
- [x] Fallback: แตะจอตอบได้เมื่อกล้อง/แสงมีปัญหา — ทดสอบแล้ว ทำงานถูกต้อง
- [x] Game mechanic: จับเวลา + วนคำถามซ้ำ (ทดสอบ logic แล้วใน student/app.js)
- [ ] Teacher: Question Bank CRUD เต็มรูปแบบ (ต่อ Firestore)
- [ ] Teacher: Quiz Builder (เลือกจากคลัง + เขียนใหม่ → preview → ตั้งชื่อ → publish/QR) + ตั้งเวลาเล่น
- [x] Bonus Challenge framework + 2 เกม (ไล่จับ Skibidi, ชูมือสุดขีด) — ทดสอบ end-to-end แล้ว: trigger ทุก 3-5 ข้อ → banner → มินิเกม → กลับเข้าคำถามต่ออัตโนมัติ
- [ ] Bonus Challenge อีก 3 เกม (จังหวะมือ 6-7, ตามท่ามือ, ไล่ตี Brainrot) — ดูสเปกด้านล่าง
- [ ] หน้า Review ย้อนหลัง (นักเรียน + ครู)
- [ ] Leaderboard สรุปท้ายเกม (คำถาม + bonus รวมกัน)
- [ ] Deploy ขึ้น GitHub Pages (`sirawatjan-svg.github.io/quizjoy`)

## เนื้อหาทดสอบชุดแรก

✅ สังคมศึกษา ม.2 — ทวีปแอฟริกา (10 ข้อ ระดับง่าย) อยู่ใน `assets/js/sample-questions.js`

## Bonus Challenge — สเปกเกมที่เหลือ (ยังไม่สร้าง)

ทุกเกมต่อกับ `bonus-engine.js` แบบเดียวกับ 2 เกมที่ทำแล้ว: รับ `ctx` (corners, stage, setZoneHandler,
onScore, onEnd) แล้ว export ฟังก์ชัน `run{ชื่อเกม}(ctx)` ไปเพิ่มใน `BONUS_RUNNERS` + เปลี่ยน `ready: true`
ใน `BONUS_GAMES`

### ✋ จังหวะมือ 6-7 (`hand-bounce`)
- **โจทย์:** จับคู่โซนเป็น "ซ้าย" (tl+bl) กับ "ขวา" (tr+br) มี beacon กระพริบสลับซ้าย-ขวาเป็นจังหวะ
  (เริ่ม ~100 BPM แล้วเร่งเป็น ~140 BPM ภายใน 10 วิ) นักเรียนต้องชี้/แตะฝั่งที่ตรงจังหวะ
- **การจับ:** เทียบ timestamp ที่ zone ตรงกับฝั่งที่ beacon สว่าง ภายใน window ±250ms ถือว่า hit
- **คะแนน:** +30/hit ตรงจังหวะเป๊ะ (±100ms), +15/hit แบบหลวม (±250ms), พลาด/สลับผิดฝั่งไม่ตัดคะแนน
- **เสียง:** ใช้ synthesized beep (Web Audio API `OscillatorNode`) ทำจังหวะเอง **ห้ามใช้คลิปเพลงจริงจากไวรัล
  เพราะติดลิขสิทธิ์** — ยืมแค่ชื่อ/คอนเซปต์เทรนด์มาตั้งชื่อเกม
- **ความยาก:** ปรับ BPM เพิ่มตามรอบ, ความสนุกอยู่ที่จังหวะเร่งไม่ใช่ความแม่นของท่ามือ

### 🕺 ตามท่ามือ (`hand-dance-follow`)
- **โจทย์:** แบบ Simon Says — ระบบกระพริบโซนทีละอันเป็นลำดับ (เริ่ม 3 โซน) นักเรียนต้องชี้/แตะตามลำดับให้ถูก
  ผ่านแล้วลำดับจะยาวขึ้น +1 ทุกรอบ (max ~6)
- **การจับ:** เก็บ array ของ zone ที่ระบบสุ่ม เทียบกับลำดับที่นักเรียนชี้ (ใช้ zone แบบ debounce กันนับซ้ำตอนมือค้างอยู่โซนเดิม)
- **คะแนน:** +40 ต่อรอบที่ผ่านครบลำดับ ผิดลำดับ = จบเกม (ให้คะแนนเท่าที่ผ่านมาแล้วบางส่วน ไม่ใช่ 0 เพื่อความ inclusive)
- **UI:** โซนที่ต้อง "จำ" กระพริบทีละอันด้วย pause 400ms คั่น ก่อนให้นักเรียนเริ่มชี้ตาม

### 🐊 ไล่ตี Brainrot (`brainrot-swat`)
- **โจทย์:** ไอคอนสัตว์ประหลาดสไตล์ Italian Brainrot (วาดเอง ไม่ใช้ asset ลิขสิทธิ์ของใคร) วิ่งเป็นเส้นทแยงมุมผ่าน
  4 โซนภายใน ~2 วิ/ตัว สุ่มเกิดต่อเนื่อง 10 วิ
- **การจับ:** เช็คว่า zone ที่นักเรียนชี้/แตะ ตรงกับโซนที่ตัวละครกำลังผ่าน ณ ขณะนั้น (คำนวณจาก timestamp การเริ่มวิ่ง)
- **คะแนน:** +35/ตัวที่ตีโดน, combo streak เพิ่ม multiplier เหมือน Skibidi Dodge
- **ความยาก:** เพิ่มจำนวนตัวที่วิ่งพร้อมกัน (1 → 2 ตัว) ในช่วงหลังของ 10 วิ

### หมายเหตุร่วม
- ทั้ง 3 เกมนี้ยังไม่ต้องมี asset ภาพนอกเหนือ emoji ก็เล่นได้ (emoji แทนไอคอนไปก่อน ค่อยเปลี่ยนเป็นภาพวาด/ภาพ generate ทีหลังได้)
- ทุกเกมต้องมี timeout กันเกมค้าง (เผื่อกล้อง/นักเรียนไม่ตอบสนองเลย) แบบเดียวกับ `runReachForSky`
- คะแนนทุกเกมบวกเข้า `bonusScore` รวมกับ `score` ตอนจบเกม (ดู `endGame()` ใน `student/app.js`)
