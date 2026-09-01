// gesture-detection.js
// Wrapper รอบ MediaPipe Tasks Vision (HandLandmarker) — รันในเบราว์เซอร์ทั้งหมด ไม่ส่งวิดีโอออกนอกเครื่อง
//
// สถานะการทดสอบ (สำคัญ อ่านก่อนแก้):
//   ✅ ยืนยันแล้วว่า CDN/โมเดลโหลดได้จริง + inference pipeline ทำงานถูกต้อง (ดู test/mediapipe-selftest.html
//      รันแบบ IMAGE mode กับรูปมือจริง เจอ landmark ครบ 21 จุด)
//   ⚠️ ยังไม่เคยทดสอบกับกล้องสดจริงบนอุปกรณ์ (Browser pane ของ dev sandbox บล็อก getUserMedia เสมอ)
//      ต้องทดสอบ threshold โซน/ความไวบนมือถือจริงก่อนใช้งานจริงในห้องเรียน
//
// การใช้งาน:
//   import { startGestureDetection } from "./gesture-detection.js";
//   startGestureDetection(videoEl, ({ zone, point, progress, confirmed }) => { ... }, { onError });
//   zone เป็นหนึ่งใน "tl" | "tr" | "bl" | "br" | null (ไม่พบมือ/ไม่มั่นใจ)

const MEDIAPIPE_VERSION = "1.0.1"; // ตรวจสอบแล้วว่าเป็นเวอร์ชัน stable ล่าสุดบน npm (ส.ค. 2026)
const VISION_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const VISION_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let handLandmarker = null;
let running = false;
let loadingPromise = null;

async function createLandmarker(vision, delegate) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_ASSET_URL, delegate },
    runningMode: "VIDEO",
    numHands: 1, // ไม่ต้องแม่นยำมาก แค่มือข้างที่ชัดที่สุดพอ (เกม Bonus บางเกมอาจต้องการ numHands:2 ในอนาคต)
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

let HandLandmarker, FilesetResolver;

async function loadModel() {
  if (handLandmarker) return handLandmarker;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const mod = await import(VISION_BUNDLE_URL);
    HandLandmarker = mod.HandLandmarker;
    FilesetResolver = mod.FilesetResolver;

    const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
    try {
      handLandmarker = await createLandmarker(vision, "GPU");
    } catch (gpuErr) {
      // อุปกรณ์บางรุ่น (มือถือรุ่นเก่า/เบราว์เซอร์บางตัว) ไม่รองรับ GPU delegate — ถอยไปใช้ CPU แทน
      console.warn("[gesture-detection] GPU delegate ใช้ไม่ได้ ถอยไปใช้ CPU:", gpuErr);
      handLandmarker = await createLandmarker(vision, "CPU");
    }
    return handLandmarker;
  })();

  return loadingPromise;
}

// แบ่งเฟรมเป็น 4 โซนตามตำแหน่งปลายนิ้วชี้ (landmark index 8)
// มี hysteresis จริง (ไม่ใช่แค่ dead-zone เฉยๆ) — เมื่ออยู่โซนไหนแล้ว ต้องขยับเลยกึ่งกลางไปอีก
// HYSTERESIS_MARGIN ถึงจะยอมเปลี่ยนโซน กันอาการสั่นตรงเส้นแบ่งกลาง (นี่คือสาเหตุหลักที่ทำให้การเลือก
// รู้สึกไม่นิ่ง/กระโดดไปมาบ่อยๆ ตอนมือชี้ใกล้กึ่งกลางจอ)
const HYSTERESIS_MARGIN = 0.07;
let lastZone = null;

// export ไว้เฉพาะเพื่อทดสอบ (test/gesture-hysteresis-selftest.html) — ตัวแอปจริงเรียกผ่าน
// startGestureDetection เท่านั้น ไม่ได้เรียก pointToZone ตรงๆ
export function pointToZone(mx, y) {
  const dx = mx - 0.5;
  const dy = y - 0.5;
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

// Exponential moving average ลดอาการสั่น/กระตุกของจุดที่จับได้ ให้ประสบการณ์ลื่นขึ้น
// (ปรับเพิ่มจาก 0.4 หลังพบว่าจุดยังสั่นเกินไป — ค่านี้ tune ต่อได้จากการทดสอบจริงบนมือถือ)
const SMOOTHING = 0.55; // 0 = ไม่ smooth เลย, 1 = ไม่ขยับเลย
let smoothX = null;
let smoothY = null;

export async function startGestureDetection(videoEl, onUpdate, { holdMs = 800, onError } = {}) {
  try {
    await loadModel();
  } catch (err) {
    console.error("[gesture-detection] โหลดโมเดลไม่สำเร็จ:", err);
    onError?.(err);
    return; // ผู้เรียกควร fallback ไปที่ tap-to-answer เพียงอย่างเดียว
  }

  running = true;
  smoothX = null;
  smoothY = null;

  let currentZone = null;
  let zoneStartTs = 0;

  function loop() {
    if (!running) return;

    let result;
    try {
      const now = performance.now();
      result = handLandmarker.detectForVideo(videoEl, now);
    } catch (err) {
      console.error("[gesture-detection] detectForVideo ล้มเหลว:", err);
      onError?.(err);
      running = false;
      return;
    }

    const now = performance.now();

    if (result.landmarks && result.landmarks.length > 0) {
      const tip = result.landmarks[0][8]; // index fingertip
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
        zone,
        point: { x: smoothX, y: smoothY },
        progress: Math.min(heldMs / holdMs, 1),
        confirmed: heldMs >= holdMs,
      });
    } else {
      currentZone = null;
      smoothX = null;
      smoothY = null;
      lastZone = null; // มือหลุดเฟรม รีเซ็ต hysteresis กันค้างโซนเก่าตอนมือกลับเข้ามาที่อื่น
      onUpdate({ zone: null, point: null, progress: 0, confirmed: false });
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
