// gesture-detection.js
// Wrapper รอบ MediaPipe Tasks Vision (HandLandmarker) — รันในเบราว์เซอร์ทั้งหมด ไม่ส่งวิดีโอออกนอกเครื่อง
//
// สถานะ: โครง (stub) — ยังไม่ได้ทดสอบบนอุปกรณ์จริง ต้อง tune threshold/ตำแหน่งโซนหลังทดสอบ
//
// การใช้งาน:
//   import { startGestureDetection } from "./gesture-detection.js";
//   startGestureDetection(videoEl, (zone, point) => { ... });
//   zone เป็นหนึ่งใน "tl" | "tr" | "bl" | "br" | null (ไม่พบมือ/ไม่มั่นใจ)

import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

let handLandmarker = null;
let running = false;

async function loadModel() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1, // ไม่ต้องแม่นยำมาก แค่มือข้างที่ชัดที่สุดพอ
  });
}

// แบ่งเฟรมเป็น 4 โซนตามตำแหน่งปลายนิ้วชี้ (landmark index 8)
// TODO: ปรับ dead-zone ตรงกลางถ้าพบว่าขอบโซนไวเกินไป (สั่นแล้วเปลี่ยนโซนถี่)
function pointToZone(x, y) {
  // x, y เป็นค่า normalized 0-1 จาก MediaPipe (mirrored เพราะเป็นกล้องหน้า)
  const mx = 1 - x; // กลับด้านให้ตรงกับภาพ mirror บนจอ
  if (mx < 0.5 && y < 0.5) return "tl";
  if (mx >= 0.5 && y < 0.5) return "tr";
  if (mx < 0.5 && y >= 0.5) return "bl";
  return "br";
}

export async function startGestureDetection(videoEl, onUpdate, { holdMs = 1000 } = {}) {
  if (!handLandmarker) await loadModel();
  running = true;

  let currentZone = null;
  let zoneStartTs = 0;

  function loop() {
    if (!running) return;
    const now = performance.now();
    const result = handLandmarker.detectForVideo(videoEl, now);

    if (result.landmarks && result.landmarks.length > 0) {
      const tip = result.landmarks[0][8]; // index fingertip
      const zone = pointToZone(tip.x, tip.y);

      if (zone !== currentZone) {
        currentZone = zone;
        zoneStartTs = now;
      }
      const heldMs = now - zoneStartTs;
      onUpdate({ zone, point: { x: 1 - tip.x, y: tip.y }, progress: Math.min(heldMs / holdMs, 1), confirmed: heldMs >= holdMs });
    } else {
      currentZone = null;
      onUpdate({ zone: null, point: null, progress: 0, confirmed: false });
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

export function stopGestureDetection() {
  running = false;
}
