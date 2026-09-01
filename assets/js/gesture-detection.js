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
//              handConnections, poseConnections, videoW, videoH })

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

// นาฬิกาจับเวลา "ค้างชี้นานพอหรือยัง" — ต้องอยู่ระดับโมดูล (ไม่ใช่ตัวแปรในฟังก์ชัน) เพราะต้องรีเซ็ตได้
// จากภายนอกทุกครั้งที่ขึ้นคำถามใหม่ ไม่งั้นเวลาค้างจากคำถามก่อนหน้าจะไหลต่อเนื่องข้ามคำถาม — ถ้ามือดัน
// พักอยู่โซนเดิมพอดีตอนคำถามใหม่ขึ้น จะกลายเป็น "ตอบให้เลยทันที" ทั้งที่ยังไม่ได้ตั้งใจชี้ข้อนั้นเลย
// (นี่คือสาเหตุจริงของอาการ "ตอบให้เองก่อนจะชี้" ที่ครูรายงานมา)
let currentZone = null;
let zoneStartTs = 0;

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
const SMOOTHING = 0.55; // 0 = ไม่ smooth เลย, 1 = ไม่ขยับเลย
let smoothX = null;
let smoothY = null;

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
    const poses = usePose ? poseResult?.landmarks ?? [] : [];
    const pointing = pickPointingHand(hands);

    const common = {
      handLandmarks: hands,
      poseLandmarks: poses,
      handConnections: HAND_CONNECTIONS,
      poseConnections: POSE_CONNECTIONS,
      videoW: videoEl.videoWidth,
      videoH: videoEl.videoHeight,
      fps: currentFps,
    };

    if (pointing) {
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
      });
    } else {
      currentZone = null;
      smoothX = null;
      smoothY = null;
      lastZone = null; // มือหลุดเฟรม รีเซ็ต hysteresis กันค้างโซนเก่าตอนมือกลับเข้ามาที่อื่น
      onUpdate({ ...common, zone: null, point: null, progress: 0, confirmed: false });
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
}

// เฉพาะ test: อ่าน state ภายในของนาฬิกาจับเวลา ยืนยันว่า resetHoldTimer() รีเซ็ตจริง
export function _debugGetHoldState() {
  return { currentZone, zoneStartTs };
}
