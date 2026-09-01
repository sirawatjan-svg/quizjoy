// skeleton-overlay.js
// วาดโครงกระดูก (มือ 21 จุด/ข้าง + ทั้งตัว 33 จุด) ทับภาพกล้อง ให้เห็นรายละเอียดการจับท่าทางจริงๆ
// แทนที่จะเห็นแค่จุดกลมจุดเดียวแบบเดิม
//
// ทำไมต้องมีไฟล์นี้: MediaPipe ส่ง landmark มาครบอยู่แล้ว (21 จุด/มือ) แต่โค้ดเดิมใช้แค่ปลายนิ้วชี้
// จุดเดียวแล้วทิ้งที่เหลือ ทำให้ดูเหมือนระบบ "ไม่มีรายละเอียด" ทั้งที่ข้อมูลมีครบ

// --- ระบบพิกัด ---
// landmark ที่ได้จาก MediaPipe เป็น normalized 0-1 เทียบกับ "เฟรมวิดีโอ" ไม่ใช่พื้นที่ที่แสดงบนจอ
// แต่ <video> ของเราใช้ object-fit: cover ซึ่งมีการ crop ถ้าไม่คำนวณชดเชย เส้นโครงจะเหลื่อมกับภาพจริง
// ฟังก์ชันนี้แปลงพิกัด normalized -> พิกัดบน canvas ให้ตรงกับที่ตาเห็นจริง
function makeCoverMapper(videoW, videoH, displayW, displayH) {
  const videoAspect = videoW / videoH;
  const displayAspect = displayW / displayH;
  let scale, offsetX, offsetY;

  if (videoAspect > displayAspect) {
    // วิดีโอกว้างกว่าจอ -> ขยายให้เต็มความสูง แล้วโดน crop ด้านข้าง
    scale = displayH / videoH;
    offsetX = (displayW - videoW * scale) / 2;
    offsetY = 0;
  } else {
    // วิดีโอสูงกว่าจอ -> ขยายให้เต็มความกว้าง แล้วโดน crop บน/ล่าง
    scale = displayW / videoW;
    offsetX = 0;
    offsetY = (displayH - videoH * scale) / 2;
  }

  return (nx, ny) => ({
    x: offsetX + nx * videoW * scale,
    y: offsetY + ny * videoH * scale,
  });
}

const COLORS = {
  handBone: "#22d3ee",
  handJoint: "#a5f3fc",
  handTip: "#fbbf24", // ปลายนิ้วชี้ เน้นสีต่างเพราะเป็นจุดที่ใช้เลือกคำตอบจริง
  bodyBoneLeft: "#f97316",
  bodyBoneRight: "#22c55e",
  bodyJoint: "#e2e8f0",
};

// landmark ฝั่งซ้ายของร่างกายใน MediaPipe Pose เป็นเลขคี่ ฝั่งขวาเป็นเลขคู่ (ตั้งแต่ index 11 ขึ้นไป)
// ใช้แยกสีซ้าย/ขวาให้ดูเหมือนภาพ mocap อ้างอิง (ฝั่งนึงส้ม ฝั่งนึงเขียว)
function boneColor(startIdx) {
  if (startIdx < 11) return COLORS.bodyJoint;
  return startIdx % 2 === 1 ? COLORS.bodyBoneLeft : COLORS.bodyBoneRight;
}

export function createSkeletonRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function resizeToDisplay() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap ที่ 2 กันมือถือ retina วาดหนักเกินจำเป็น
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr };
  }

  /**
   * วาดหนึ่งเฟรม
   * @param {object} opts
   * @param {Array<Array<{x,y}>>} opts.handLandmarks  - array ของมือ แต่ละมือ 21 จุด
   * @param {Array<Array<{x,y}>>} opts.poseLandmarks  - array ของคน แต่ละคน 33 จุด
   * @param {Array<[number,number]>} opts.handConnections
   * @param {Array<[number,number]>} opts.poseConnections
   * @param {number} opts.videoW @param {number} opts.videoH
   */
  function draw({ handLandmarks, poseLandmarks, handConnections, poseConnections, videoW, videoH }) {
    const { w, h } = resizeToDisplay();
    ctx.clearRect(0, 0, w, h);

    if (!videoW || !videoH) return;
    const map = makeCoverMapper(videoW, videoH, w, h);
    const unit = Math.min(w, h) / 400; // ปรับความหนาเส้น/ขนาดจุดตามขนาดจอ ให้ดูพอดีทั้งมือถือและจอใหญ่

    // ---- โครงร่างกาย (วาดก่อน ให้อยู่ชั้นล่าง) ----
    if (poseLandmarks?.length && poseConnections?.length) {
      for (const person of poseLandmarks) {
        ctx.lineWidth = 3 * unit;
        ctx.lineCap = "round";
        for (const conn of poseConnections) {
          const a = person[conn.start ?? conn[0]];
          const b = person[conn.end ?? conn[1]];
          if (!a || !b) continue;
          const pa = map(a.x, a.y);
          const pb = map(b.x, b.y);
          ctx.strokeStyle = boneColor(conn.start ?? conn[0]);
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
        ctx.fillStyle = COLORS.bodyJoint;
        for (const lm of person) {
          const p = map(lm.x, lm.y);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3 * unit, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ---- โครงมือ (วาดทับ ให้เด่นสุด เพราะเป็นส่วนที่ใช้เลือกคำตอบ) ----
    if (handLandmarks?.length && handConnections?.length) {
      for (const hand of handLandmarks) {
        ctx.strokeStyle = COLORS.handBone;
        ctx.lineWidth = 2.5 * unit;
        ctx.lineCap = "round";
        for (const conn of handConnections) {
          const a = hand[conn.start ?? conn[0]];
          const b = hand[conn.end ?? conn[1]];
          if (!a || !b) continue;
          const pa = map(a.x, a.y);
          const pb = map(b.x, b.y);
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
        hand.forEach((lm, i) => {
          const p = map(lm.x, lm.y);
          const isIndexTip = i === 8;
          ctx.fillStyle = isIndexTip ? COLORS.handTip : COLORS.handJoint;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (isIndexTip ? 6 : 3) * unit, 0, Math.PI * 2);
          ctx.fill();
          if (isIndexTip) {
            // วงแหวนรอบปลายนิ้วชี้ ให้เห็นชัดว่าจุดไหนคือ "ตัวชี้" ที่ใช้เลือกคำตอบ
            ctx.strokeStyle = COLORS.handTip;
            ctx.lineWidth = 2 * unit;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12 * unit, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
      }
    }
  }

  function clear() {
    const { w, h } = resizeToDisplay();
    ctx.clearRect(0, 0, w, h);
  }

  return { draw, clear };
}
