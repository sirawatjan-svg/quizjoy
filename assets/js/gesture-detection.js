// gesture-detection.js
// Wrapper รอบ MediaPipe Tasks Vision — รันในเบราว์เซอร์ทั้งหมด ไม่ส่งวิดีโอออกนอกเครื่อง
//
// สถานะการทดสอบ (สำคัญ อ่านก่อนแก้):
//   ✅ ยืนยันแล้วว่า CDN/โมเดลโหลดได้จริง + inference ทำงานถูกต้อง (ดู test/mediapipe-selftest.html
//      และ test/skeleton-selftest.html ที่รันแบบ IMAGE mode กับรูปคนจริง วาดโครงกระดูกออกมาได้)
//   ✅ zone hysteresis ทดสอบด้วย unit test แล้ว (test/gesture-hysteresis-selftest.html)
//   ⚠️ ยังไม่เคยทดสอบกับกล้องสดจริงบนอุปกรณ์ (Browser pane ของ dev sandbox บล็อก getUserMedia เสมอ)
//
// การใช้งาน:
//   startGestureDetection(videoEl, onUpdate, { holdMs, bodySkeleton, onError, onPerf })
//   holdMs default 1400ms — ปรับขึ้นจาก 800ms หลังครูรายงานว่าเลือกคำตอบผิดง่ายเกิน (เวลาไม่พอแก้ตัว)
//   onUpdate({ zone, point, progress, confirmed, handLandmarks, poseLandmarks,
//              handConnections, poseConnections, videoW, videoH, hands, fps, handDetected, frozen })
//   zone/point/progress/confirmed = มือเดียว (ตัวที่ยกสูงสุด) ใช้ตอบคำถามหลัก เหมือนเดิมทุกอย่าง
//   hands = [{ zone, point }, ...] ทุกมือที่เห็น (ไม่เกิน 2) แยกอิสระต่อกัน — ใช้กับมินิเกมที่ต้องรู้
//   ทั้งสองมือพร้อมกัน (เช่น "67" ที่ธรรมชาติท่าคือขยับสองมือสลับกัน)
//   มือหลุดเฟรมสั้นๆ (< LOST_GRACE_MS = 350ms) จะไม่ทำให้ zone/progress รีเซ็ต (ดูคอมเมนต์ LOST_GRACE_MS
//   ด้านล่าง) — กันอาการ "ชี้แล้วค้าง ไม่ติดสักที" บนเครื่องที่หลุดจับมือบ่อย (Android/ชี้ 2 นิ้ว)
//   handDetected = เฟรมนี้กล้องเจอมือจริงไหม (raw, ไม่นับช่วงผ่อนผัน) / frozen = zone/point ที่ส่งมาเป็น
//   "ค่าค้าง" จากช่วงผ่อนผันหรือเปล่า — ใช้แยกแยะตอนดีบักว่าอาการค้างมาจาก "ไม่เจอมือ" หรือ "เจอมือ นับเวลา
//   ไม่ครบ" (ดู #diag-badge ใน student/app.js — โชว์ค่าดิบพวกนี้สดๆ บนจอตอนเทสจริง)

const MEDIAPIPE_VERSION = "1.0.1"; // ตรวจสอบแล้วว่าเป็นเวอร์ชัน stable ล่าสุดบน npm (ส.ค. 2026)
const VISION_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const VISION_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
// ใช้ lite (5.8MB) ไม่ใช่ full — เล็กกว่าและเร็วกว่า เพียงพอสำหรับโครงร่างที่เอาไว้ "ดู" ไม่ได้เอาไปวัดผล
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let handLandmarker = null;
let poseLandmarker = null;
let running = false;
let loadingPromise = null;
let HandLandmarker, PoseLandmarker, FilesetResolver;

// connection topology (คู่ของ index ที่ต้องลากเส้นเชื่อม) — ดึงจาก MediaPipe เองตอนโหลดโมเดล
export let HAND_CONNECTIONS = [];
export let POSE_CONNECTIONS = [];

async function loadModels({ bodySkeleton }) {
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const mod = await import(VISION_BUNDLE_URL);
    HandLandmarker = mod.HandLandmarker;
    PoseLandmarker = mod.PoseLandmarker;
    FilesetResolver = mod.FilesetResolver;

    HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS ?? [];
    POSE_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS ?? [];

    const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);

    async function makeHand(delegate) {
      return HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 2, // จับสองมือ เพื่อให้เห็นโครงมือครบทั้งคู่ (เดิมจับข้างเดียว)
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    }
    async function makePose(delegate) {
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    }

    try {
      handLandmarker = await makeHand("GPU");
      if (bodySkeleton) poseLandmarker = await makePose("GPU");
    } catch (gpuErr) {
      // อุปกรณ์บางรุ่น (มือถือรุ่นเก่า/เบราว์เซอร์บางตัว) ไม่รองรับ GPU delegate — ถอยไปใช้ CPU แทน
      console.warn("[gesture-detection] GPU delegate ใช้ไม่ได้ ถอยไปใช้ CPU:", gpuErr);
      handLandmarker = await makeHand("CPU");
      if (bodySkeleton) poseLandmarker = await makePose("CPU");
    }
  })();

  return loadingPromise;
}

// แบ่งเฟรมเป็น 4 โซนตามตำแหน่งปลายนิ้วชี้ (landmark index 8)
// มี hysteresis จริง (ไม่ใช่แค่ dead-zone เฉยๆ) — เมื่ออยู่โซนไหนแล้ว ต้องขยับเลยกึ่งกลางไปอีก
// HYSTERESIS_MARGIN ถึงจะยอมเปลี่ยนโซน กันอาการสั่นตรงเส้นแบ่งกลาง (นี่คือสาเหตุหลักที่ทำให้การเลือก
// รู้สึกไม่นิ่ง/กระโดดไปมาบ่อยๆ ตอนมือชี้ใกล้กึ่งกลางจอ)
const HYSTERESIS_MARGIN = 0.07;
let lastZone = null;

// --- Calibration ---
// จุดศูนย์กลางที่ใช้แบ่งจอเป็น 4 โซน ปกติคือกึ่งกลางจอ (0.5, 0.5) เป๊ะๆ แต่จากข้อมูลทดสอบจริงบนมือถือ
// หลายเครื่อง (ดู backup-test-data/) พบว่า "ชี้บน" มักถูกจับว่าเป็น "ล่าง" บ่อยผิดปกติ (tl→bl, tr→br
// เป็นสัดส่วนสูงสุดของคำตอบผิดทั้งหมด) เพราะท่าถือมือถือ/มุมกล้องจริงทำให้นิ้วที่ชี้ "มุมบน" ของจอ ไม่เคย
// ขยับสูงพอจะข้ามเส้นกึ่งกลาง Y ที่ตายตัวไว้ล่วงหน้า — ให้ผู้เล่น calibrate ก่อนเล่น (ชี้ 4 มุมจริงครั้งละ
// มุม ดู runCalibration ใน student/app.js) แล้วเรียก setCalibration() ขยับจุดศูนย์กลางให้ตรงกับตำแหน่งจริง
// ที่มือของคนๆ นั้นไปถึง แทนที่จะเดาว่ากึ่งกลางจอคือกึ่งกลางระหว่างมุมทั้งสี่เสมอ
let calibCx = 0.5;
let calibCy = 0.5;

export function setCalibration(cx, cy) {
  calibCx = cx;
  calibCy = cy;
}

export function getCalibration() {
  return { cx: calibCx, cy: calibCy };
}

// รีเซ็ตกลับเป็นค่าเริ่มต้น (กึ่งกลางจอเป๊ะๆ) — ใช้ตอนข้าม calibration หรือระหว่างเทส
export function resetCalibration() {
  calibCx = 0.5;
  calibCy = 0.5;
}

// นาฬิกาจับเวลา "ค้างชี้นานพอหรือยัง" — ต้องอยู่ระดับโมดูล (ไม่ใช่ตัวแปรในฟังก์ชัน) เพราะต้องรีเซ็ตได้
// จากภายนอกทุกครั้งที่ขึ้นคำถามใหม่ ไม่งั้นเวลาค้างจากคำถามก่อนหน้าจะไหลต่อเนื่องข้ามคำถาม — ถ้ามือดัน
// พักอยู่โซนเดิมพอดีตอนคำถามใหม่ขึ้น จะกลายเป็น "ตอบให้เลยทันที" ทั้งที่ยังไม่ได้ตั้งใจชี้ข้อนั้นเลย
// (นี่คือสาเหตุจริงของอาการ "ตอบให้เองก่อนจะชี้" ที่ครูรายงานมา)
let currentZone = null;
let zoneStartTs = 0;

// --- Grace period กันมือ "หลุดเฟรมชั่วครู่" รีเซ็ตนาฬิกาทั้งที่ยังไม่ได้ขยับไปไหนจริง ---
// ปัญหาที่พบจากฟีดแบ็กจริง (ก.ย. 2026): นักเรียนหลายคนรายงานว่า "ชี้แล้วค้าง ไม่ติดสักที" / "ปุ่มไม่ค่อย
// ติด" / "กล้องไม่ค่อยตรวจจับ" — ไม่ใช่แค่โหมด 67 แต่เป็นทั้งระบบ (รวมตอบคำถามหลักด้วย) พบมากขึ้นบน Android
// และตอนชี้ 2 นิ้ว (ความมั่นใจของโมเดลต่ำกว่าชี้ 1 นิ้วเพียวๆ) สาเหตุคือโค้ดเดิมพอ handLandmarker หลุดจับ
// มือไปแม้แค่ 1 เฟรม (มือเบลอตอนขยับเร็ว/แสงไม่พอ/ความมั่นใจโมเดลแกว่ง) currentZone จะถูกบังคับเป็น null
// ทันที พอมือกลับมาติดเฟรมถัดไป ระบบเห็นว่า zone เปลี่ยน (จาก null) เลยรีเซ็ต zoneStartTs ใหม่ทั้งหมด —
// เครื่องที่หลุดเฟรมบ่อย (Android FPS ต่ำกว่า/detection แกว่งง่ายกว่า iPhone) จะโดนรีเซ็ตซ้ำๆ จนไม่มีทาง
// นับครบ holdMs (1400ms) สักที ทั้งที่ผู้เล่นชี้ตำแหน่งเดิมนิ่งๆ อยู่ตลอด
// วิธีแก้: ถ้าหลุดเฟรมไม่เกิน LOST_GRACE_MS ให้ถือว่า "ยังชี้ตำแหน่งเดิมต่อ" ไม่รีเซ็ตอะไรเลย จะรีเซ็ตจริง
// ก็ต่อเมื่อหลุดต่อเนื่องเกินช่วงนี้ (แปลว่ามือหายไปจากจอจริงๆ ไม่ใช่แค่เบลอเฟรมเดียว)
const LOST_GRACE_MS = 350;
let lostSinceTs = null;

// export ไว้เฉพาะเพื่อทดสอบ (test/gesture-hysteresis-selftest.html) — ตัวแอปจริงเรียกผ่าน
// startGestureDetection เท่านั้น ไม่ได้เรียก pointToZone ตรงๆ
export function pointToZone(mx, y) {
  const dx = mx - calibCx;
  const dy = y - calibCy;
  const candidate = dx < 0 ? (dy < 0 ? "tl" : "bl") : dy < 0 ? "tr" : "br";

  if (lastZone && candidate !== lastZone) {
    // ยังใกล้กึ่งกลางไปในแกนใดแกนหนึ่งไม่พอ ให้ถือว่ายังอยู่โซนเดิมไปก่อน (กันสั่น)
    if (Math.abs(dx) < HYSTERESIS_MARGIN || Math.abs(dy) < HYSTERESIS_MARGIN) {
      return lastZone;
    }
  }
  lastZone = candidate;
  return candidate;
}

// สร้าง "ตัวติดตามโซน" แยกอิสระ 1 ชุด มี hysteresis ของตัวเอง (อัลกอริทึมเดียวกับ pointToZone() ข้างบน
// เป๊ะๆ แค่ไม่ใช้ lastZone ตัวเดียวร่วมกันทั้งโมดูล) ใช้ตอนต้องติดตามหลายจุดพร้อมกันเป็นอิสระต่อกัน โดยไม่
// ปนกับ/ไม่กระทบตัวติดตามหลัก (pointToZone) ที่ยังใช้ path เดิมสำหรับตอบคำถามด้วยมือเดียว
// กรณีใช้จริง: ติดตามมือ 2 ข้างแยกกันในมินิเกม "67" (ท่าธรรมชาติคือขยับสองมือสลับกัน — ถ้าเลือกติดตาม
// แค่มือเดียวแล้วระบบสลับไปดูอีกข้างกลางเฟรม จะเห็นข้อมูลกระตุกทั้งที่มือจริงๆ ขยับถูกต้อง)
export function createZoneTracker() {
  let trackerLastZone = null;
  return {
    classify(mx, y) {
      const dx = mx - calibCx;
      const dy = y - calibCy;
      const candidate = dx < 0 ? (dy < 0 ? "tl" : "bl") : dy < 0 ? "tr" : "br";
      if (trackerLastZone && candidate !== trackerLastZone) {
        if (Math.abs(dx) < HYSTERESIS_MARGIN || Math.abs(dy) < HYSTERESIS_MARGIN) {
          return trackerLastZone;
        }
      }
      trackerLastZone = candidate;
      return candidate;
    },
    reset() {
      trackerLastZone = null;
    },
  };
}

// Exponential moving average ลดอาการสั่น/กระตุกของจุดที่จับได้ ให้ประสบการณ์ลื่นขึ้น
// ลดจาก 0.55 -> 0.4 (ก.ย. 2026) ตามฟีดแบ็กครู: "ดึงมือออกเร็วๆ แล้วระบบช้า เลือกคำตอบผิด" และ "บางทีค้าง
// อยู่ที่คำตอบก่อนหน้าทั้งที่ไม่ได้ตั้งใจ" — ทั้งสองอาการตรงกับ "อาการคลาสสิกของ EMA smooth มากไป": ตำแหน่งที่
// ใช้จำแนกโซนจริงๆ (smoothX/smoothY) จะ "ตามหลัง" ตำแหน่งนิ้วจริงอยู่เสมอ ยิ่ง SMOOTHING สูงยิ่งตามหลังนาน
// เวลาขยับมือเร็ว (เช่นรีบดึงมือออกไปเปลี่ยนคำตอบ) ตำแหน่งที่จำแนกโซนจะยัง "ค้าง" อยู่แถวๆ ตำแหน่งเก่าไปอีก
// หลายเฟรมกว่าจะตามทัน — ถ้าค้างนานพอ (ผนวกกับ hysteresis ที่ตั้งใจหน่วงการเปลี่ยนโซนอยู่แล้ว) อาจไปโดน
// confirm ที่คำตอบเก่าไปก่อนจะตามทันจริง ลดค่าลงให้ตามทันไวขึ้น แลกกับสั่นไหวเพิ่มขึ้นเล็กน้อย (ยังไม่ใช่ 0 —
// ปิด smoothing ไปเลยจะกลับไปเจอปัญหาเดิมที่เคยแก้คือมือสั่นเบาๆ ทำให้โซนกระโดดไปมา) ยังไม่เคยทดสอบค่าใหม่นี้
// กับกล้องจริง (แซนด์บ็อกซ์เปิดกล้องไม่ได้) ต้องรอผลทดสอบจริงยืนยันอีกที
const SMOOTHING = 0.4; // 0 = ไม่ smooth เลย, 1 = ไม่ขยับเลย
let smoothX = null;
let smoothY = null;

// ตัวติดตามแยกต่อมือ (คีย์ด้วย handedness "Left"/"Right" จากโมเดล ซึ่งเสถียรข้ามเฟรมกว่า index ในอาร์เรย์
// landmarks เฉยๆ — index อาจสลับได้ถ้ามือสองข้างสลับตำแหน่งการตรวจจับในเฟรมถัดไป) ใช้เสริมข้าง pointToZone
// หลัก ไม่ได้แทนที่ — ยังคำนวณ zone/point แบบมือเดียว (ตัวสูงสุด) ไว้ให้โค้ดเดิม (ตอบคำถามหลัก) ใช้เหมือนเดิม
const handTrackers = new Map(); // label -> { tracker, smoothX, smoothY }

function getHandTracker(label) {
  let t = handTrackers.get(label);
  if (!t) {
    t = { tracker: createZoneTracker(), smoothX: null, smoothY: null };
    handTrackers.set(label, t);
  }
  return t;
}

// เลือก "มือที่ใช้ชี้" เมื่อเจอสองมือ — ใช้มือที่ยกสูงกว่า (y น้อยกว่า) ตรงกับสัญชาตญาณว่า
// "มือที่ยกขึ้นมาคือมือที่ตั้งใจชี้" ส่วนอีกมือที่ห้อยอยู่ยังวาดโครงให้เห็นแต่ไม่นับเป็นตัวเลือก
function pickPointingHand(hands) {
  let best = null;
  for (const h of hands) {
    const tip = h[8];
    if (!tip) continue;
    if (!best || tip.y < best[8].y) best = h;
  }
  return best;
}

export async function startGestureDetection(
  videoEl,
  onUpdate,
  { holdMs = 1400, bodySkeleton = true, onError, onPerf } = {}
) {
  try {
    await loadModels({ bodySkeleton });
  } catch (err) {
    console.error("[gesture-detection] โหลดโมเดลไม่สำเร็จ:", err);
    onError?.(err);
    return; // ผู้เรียกควร fallback ไปที่ tap-to-answer เพียงอย่างเดียว
  }

  running = true;
  smoothX = null;
  smoothY = null;
  lastZone = null;
  currentZone = null;
  zoneStartTs = performance.now();
  lostSinceTs = null;
  handTrackers.clear();
  let usePose = bodySkeleton && !!poseLandmarker;

  // --- FPS watchdog ---
  // โครงร่างกาย (pose) เป็นโมเดลตัวที่สองที่ต้องรันทุกเฟรม มือถือรุ่นกลาง-ล่างอาจไม่ไหว
  // ถ้าเฟรมเรตตกต่ำกว่าเกณฑ์ต่อเนื่อง ให้ปิดโครงร่างกายอัตโนมัติ (เหลือโครงมือซึ่งเบากว่า)
  // แทนที่จะปล่อยให้เกมกระตุกจนเล่นไม่ได้
  let frameCount = 0;
  let fpsWindowStart = performance.now();
  let lowFpsStreak = 0;
  let currentFps = 0;

  function loop() {
    if (!running) return;

    const now = performance.now();
    let handResult, poseResult;
    try {
      handResult = handLandmarker.detectForVideo(videoEl, now);
      if (usePose) poseResult = poseLandmarker.detectForVideo(videoEl, now + 0.01);
    } catch (err) {
      console.error("[gesture-detection] detect ล้มเหลว:", err);
      onError?.(err);
      running = false;
      return;
    }

    // วัด FPS ทุก ๆ 1 วินาที
    frameCount += 1;
    if (now - fpsWindowStart >= 1000) {
      currentFps = Math.round((frameCount * 1000) / (now - fpsWindowStart));
      frameCount = 0;
      fpsWindowStart = now;
      onPerf?.({ fps: currentFps, bodySkeleton: usePose });

      if (usePose && currentFps < 12) {
        lowFpsStreak += 1;
        if (lowFpsStreak >= 3) {
          // ช้าติดกัน 3 วินาที -> ปิดโครงร่างกายทิ้ง เหลือแค่โครงมือ
          console.warn("[gesture-detection] FPS ต่ำต่อเนื่อง ปิดโครงร่างกายอัตโนมัติ");
          usePose = false;
          onPerf?.({ fps: currentFps, bodySkeleton: false, autoDowngraded: true });
        }
      } else {
        lowFpsStreak = 0;
      }
    }

    const hands = handResult?.landmarks ?? [];
    const handednesses = handResult?.handednesses ?? [];
    const poses = usePose ? poseResult?.landmarks ?? [] : [];
    const pointing = pickPointingHand(hands);

    // ข้อมูลของ "ทุกมือ" ที่เห็นเฟรมนี้ (ไม่เกิน 2 ข้าง ตาม numHands:2) — แยกอิสระต่อมือด้วย
    // createZoneTracker() ของตัวเอง ใช้กับมินิเกมที่อยากรู้ทั้งสองมือพร้อมกัน (เช่น "67") โดยไม่กระทบ
    // zone/point แบบมือเดียวด้านล่างที่โค้ดเดิม (ตอบคำถามหลัก) ยังใช้เหมือนเดิมทุกอย่าง
    const presentLabels = new Set();
    const allHandsData = hands
      .map((h, i) => {
        const tip = h[8];
        if (!tip) return null;
        const label = handednesses[i]?.[0]?.categoryName ?? `hand${i}`;
        presentLabels.add(label);
        const mx = 1 - tip.x;
        const t = getHandTracker(label);
        t.smoothX = t.smoothX === null ? mx : t.smoothX * SMOOTHING + mx * (1 - SMOOTHING);
        t.smoothY = t.smoothY === null ? tip.y : t.smoothY * SMOOTHING + tip.y * (1 - SMOOTHING);
        return { zone: t.tracker.classify(t.smoothX, t.smoothY), point: { x: t.smoothX, y: t.smoothY } };
      })
      .filter(Boolean);

    // มือที่เคยเห็นแต่หายไปจากเฟรมนี้แล้ว — รีเซ็ตทิ้ง กันค่า smoothing/hysteresis ค้างตอนกลับมาใหม่
    for (const [label, t] of handTrackers) {
      if (!presentLabels.has(label)) {
        t.smoothX = null;
        t.smoothY = null;
        t.tracker.reset();
      }
    }

    const common = {
      handLandmarks: hands,
      poseLandmarks: poses,
      handConnections: HAND_CONNECTIONS,
      poseConnections: POSE_CONNECTIONS,
      videoW: videoEl.videoWidth,
      videoH: videoEl.videoHeight,
      fps: currentFps,
      hands: allHandsData,
      // handDetected = เฟรมนี้กล้องเจอมือ "จริง" ไหม (ไม่นับช่วงผ่อนผัน) ใช้แยกแยะเวลาดีบักว่าอาการค้าง
      // มาจาก "กล้องไม่เจอมือ" หรือ "เจอมือแต่ยังนับเวลาไม่ครบ" — ดู test/diagnostic-overlay ใน student/app.js
      handDetected: !!pointing,
    };

    if (pointing) {
      if (lostSinceTs !== null) {
        // กำลังกลับมาจากช่วงผ่อนผัน — เลื่อน zoneStartTs ไปข้างหน้าเท่ากับเวลาที่หลุดเฟรมไปพอดี (= "หยุด
        // นาฬิกาไว้ชั่วคราว" ระหว่างหลุด ไม่ใช่ปล่อยให้เดินต่อ) กันเคส heldMs ทะลุ holdMs ไปเองระหว่างที่มือ
        // ไม่ได้อยู่ในเฟรมจริงๆ (ดูคอมเมนต์ยาวที่ branch ผ่อนผันด้านล่างว่าทำไมเรื่องนี้ถึงสำคัญมาก)
        zoneStartTs += now - lostSinceTs;
        lostSinceTs = null;
        // v2: บั๊กที่เพิ่งเจอจากการทดสอบจริง (ทั้ง Android และ iPhone) — "ชี้ค้างเผลอติดที่คำตอบหนึ่งแล้ว
        // ยกมือเปลี่ยนไปชี้คำตอบใหม่ กลับล็อกคำตอบเดิมทันที" สาเหตุคือ smoothX/smoothY (EMA) ไม่ได้ถูกรีเซ็ต
        // ตอนกลับจากช่วงผ่อนผัน เลยยัง "ลาก" ค่าเก่าก่อนหลุดเฟรมมาผสมต่อ ทำให้เฟรมแรกๆ หลังมือกลับมา ตำแหน่ง
        // ที่ใช้จำแนกโซนยังไม่ทันตามตำแหน่งจริงใหม่ทัน (ยังชี้ว่าเป็นโซนเดิม) — โค้ดด้านบนเห็นว่า zone ยังตรง
        // กับ currentZone (เดิม) เลยไม่รีเซ็ต zoneStartTs ให้ และ heldMs ที่เลื่อนมาแล้ว (เกือบครบ/ครบพอดี
        // ตั้งแต่ก่อนยกมือ) เลยทะลุ holdMs ทันทีบนเฟรมที่ยังจำแนกผิดอยู่นั้นเอง — ทางแก้: รีเซ็ต smoothX/Y ทิ้ง
        // ตรงนี้ด้วย บังคับให้เฟรมแรกหลังกลับมา "สแนป" ไปที่ตำแหน่งดิบทันทีไม่ผ่าน EMA เลย จะได้จำแนกโซนถูกต้อง
        // ตามตำแหน่งจริงตั้งแต่เฟรมแรก ถ้าเป็นคนละโซนจริงจะได้ reset zoneStartTs ตามปกติทันที ไม่ล็อกโซนเก่า
        smoothX = null;
        smoothY = null;
      }
      const tip = pointing[8];
      const mx = 1 - tip.x; // กลับด้านให้ตรงกับภาพ mirror บนจอ (กล้องหน้า)

      smoothX = smoothX === null ? mx : smoothX * SMOOTHING + mx * (1 - SMOOTHING);
      smoothY = smoothY === null ? tip.y : smoothY * SMOOTHING + tip.y * (1 - SMOOTHING);

      const zone = pointToZone(smoothX, smoothY);
      if (zone !== currentZone) {
        currentZone = zone;
        zoneStartTs = now;
      }
      const heldMs = now - zoneStartTs;
      onUpdate({
        ...common,
        zone,
        point: { x: smoothX, y: smoothY },
        progress: Math.min(heldMs / holdMs, 1),
        confirmed: heldMs >= holdMs,
        frozen: false,
      });
    } else if (currentZone !== null && (lostSinceTs === null || now - lostSinceTs < LOST_GRACE_MS)) {
      // หลุดเฟรมแต่ยังอยู่ในช่วงผ่อนผัน — ถือว่ายังชี้ตำแหน่ง/โซนเดิมต่อ "ไม่รีเซ็ต" แต่นาฬิกาต้อง "หยุดนับ
      // ชั่วคราว" ด้วย (ใช้ heldMs ค่าเดิม ณ วินาทีที่หลุด ไม่คำนวณจาก now ซ้ำทุกเฟรม) ไม่ใช่ปล่อยให้เดินต่อ —
      // เดิม (บั๊กที่เพิ่งเจอจากการทดสอบจริงบน iPhone) ปล่อยให้ heldMs เดินต่อด้วย now แม้มือจะไม่อยู่ในเฟรม
      // จริงๆ เลย ผลคือถ้า heldMs ใกล้ครบ holdMs พอดีตอนมือหลุด (เช่น กำลังขยับมือย้ายไปจุดถัดไปพอดี) แค่หลุด
      // เฟรมแป๊บเดียวระหว่างเปลี่ยนท่า ก็ทะลุ holdMs แล้ว confirmed:true ยิงคำตอบให้เองทั้งที่ผู้เล่นไม่ได้
      // ตั้งใจชี้ค้างจริงจนครบเวลาเลย — นี่คือสาเหตุของ "เลือกคำตอบไปเองก่อนจะตั้งใจ" ที่ครูรายงานมาบน iPhone
      // (FPS สูง เจอเคสนี้ง่ายกว่า เพราะ progress ไต่ขึ้นใกล้ 100% เร็ว โอกาสหลุดเฟรมตรงจังหวะท้ายๆ พอดีสูงกว่า)
      // ทางแก้: ห้าม confirm ระหว่างช่วงผ่อนผันเด็ดขาด (ต้องเห็นมือจริงในเฟรมถึงจะยืนยันคำตอบได้) และห้าม
      // heldMs ขยับต่อจนกว่าจะเห็นมือกลับมาจริง (ดู "zoneStartTs += now - lostSinceTs" ใน branch pointing
      // ด้านบน ซึ่งจะ "เติมเวลาที่หายไป" กลับเข้า zoneStartTs ให้ตอนมือกลับมา แทนที่จะนับเวลาที่หลุดไปด้วย)
      const frozenHeldMs = lostSinceTs === null ? now - zoneStartTs : lostSinceTs - zoneStartTs;
      if (lostSinceTs === null) lostSinceTs = now;
      onUpdate({
        ...common,
        zone: currentZone,
        point: smoothX !== null ? { x: smoothX, y: smoothY } : null,
        progress: Math.min(frozenHeldMs / holdMs, 1),
        confirmed: false, // ห้าม confirm ตอนไม่เห็นมือจริงในเฟรมเด็ดขาด ไม่ว่า heldMs ที่ค้างไว้จะครบแค่ไหน
        frozen: true, // กำลังใช้ "ค่าค้าง" จากตอนก่อนหลุดเฟรม ไม่ใช่ตำแหน่งสดจากกล้องเฟรมนี้
      });
    } else {
      // หลุดเฟรมนานเกินช่วงผ่อนผัน (หรือไม่เคยจับโซนได้เลยตั้งแต่แรก) — ถือว่ามือหายไปจากจอจริงๆ รีเซ็ตทุกอย่าง
      currentZone = null;
      smoothX = null;
      smoothY = null;
      lastZone = null; // มือหลุดเฟรม รีเซ็ต hysteresis กันค้างโซนเก่าตอนมือกลับเข้ามาที่อื่น
      lostSinceTs = null;
      onUpdate({ ...common, zone: null, point: null, progress: 0, confirmed: false, frozen: false });
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

export function stopGestureDetection() {
  running = false;
}

// เฉพาะ test: รีเซ็ต state ของ pointToZone ระหว่างเทสต์เคสต่างๆ ไม่ให้ค้างข้ามกัน
export function resetZoneTracking() {
  lastZone = null;
}

// เรียกทุกครั้งที่ขึ้นคำถามใหม่ (หรือกลับจากโหมดบอนัสมาโหมดคำถาม) — บังคับให้ต้อง "ค้างชี้ใหม่" ครบ
// holdMs เต็มๆ ก่อนถึงจะ confirm ได้ กันเวลาค้างเก่าจากคำถามก่อนหน้าไหลข้ามมาทำให้ตอบให้เองทันที
export function resetHoldTimer() {
  currentZone = null;
  zoneStartTs = performance.now();
  lostSinceTs = null;
}

// เฉพาะ test: อ่าน state ภายในของนาฬิกาจับเวลา ยืนยันว่า resetHoldTimer() รีเซ็ตจริง
export function _debugGetHoldState() {
  return { currentZone, zoneStartTs, lostSinceTs };
}
