// bonus-engine.js
// "เครื่องมือกลาง" สำหรับ Bonus Challenge มินิเกม — ทุกเกมใช้ 4 มุมเดียวกับหน้าคำถามหลัก
// ใช้ zone stream เดียวกับ gesture-detection.js (reuse onZoneUpdate) + tap fallback ฟรีทุกเกม
//
// วิธีเพิ่มเกมใหม่: เพิ่ม entry ใน BONUS_GAMES แล้วเขียนฟังก์ชัน run{ชื่อเกม}(ctx) ที่มี signature เดียวกัน

export const BONUS_GAMES = [
  { id: "skibidi-dodge", name: "ไล่จับ Skibidi!", emoji: "🚽", ready: true },
  { id: "reach-sky", name: "ชูมือสุดขีด!", emoji: "🙌", ready: true },
  { id: "hand-bounce", name: "จังหวะมือ 6-7", emoji: "✋", ready: false }, // TODO: ดู README ส่วน Bonus Design
  { id: "hand-dance-follow", name: "ตามท่ามือ", emoji: "🕺", ready: false }, // TODO
  { id: "brainrot-swat", name: "ไล่ตี Brainrot!", emoji: "🐊", ready: false }, // TODO
];

let bag = [];
export function nextBonusGame() {
  const ready = BONUS_GAMES.filter((g) => g.ready);
  if (bag.length === 0) {
    bag = [...ready].sort(() => Math.random() - 0.5);
  }
  return bag.pop();
}

// --- ctx ที่ทุกเกมได้รับ ---
// {
//   corners: { tl, tr, bl, br } DOM elements (ใช้ box เดิมจากหน้าคำถาม)
//   stage: DOM element ของ quiz-stage (ไว้แปะ banner/overlay)
//   setZoneHandler(fn): ผูก callback รับ {zone, point} ทุกเฟรม (ใช้แทน onZoneUpdate ปกติชั่วคราว)
//   onScore(delta): บวกคะแนนโบนัสสะสม
//   onEnd(): เรียกเมื่อเกมจบ กลับไปโหมดคำถามต่อ
// }

function flashCorner(el, ms = 250) {
  el.classList.add("active");
  setTimeout(() => el.classList.remove("active"), ms);
}

function resetCornerLabels(corners, emojiMap = {}) {
  Object.entries(corners).forEach(([zone, el]) => {
    el.textContent = emojiMap[zone] ?? "";
    el.classList.remove("correct", "wrong", "target");
  });
}

// ============ เกม 1: ไล่จับ Skibidi (reaction game, 6 รอบ เร็วขึ้นเรื่อยๆ) ============
export function runSkibidiDodge(ctx) {
  const { corners, onScore, onEnd } = ctx;
  const zones = ["tl", "tr", "bl", "br"];
  const ROUNDS = 6;
  let round = 0;
  let streak = 0;
  let currentTarget = null;
  let roundTimeout = null;

  resetCornerLabels(corners);

  function cleanup() {
    clearTimeout(roundTimeout);
    ctx.setZoneHandler(null);
    resetCornerLabels(corners);
    ctx.onCleanupExtra?.();
  }

  function nextRound() {
    if (round >= ROUNDS) {
      cleanup();
      onEnd();
      return;
    }
    round += 1;
    currentTarget = zones[Math.floor(Math.random() * zones.length)];
    resetCornerLabels(corners);
    corners[currentTarget].textContent = "🚽";
    corners[currentTarget].classList.add("target");

    const windowMs = Math.max(1200 - round * 80, 700); // เร็วขึ้นทุกรอบ
    roundTimeout = setTimeout(() => {
      streak = 0; // พลาด/ไม่ทัน
      nextRound();
    }, windowMs);
  }

  function onHit(zone) {
    if (!currentTarget) return;
    if (zone === currentTarget) {
      clearTimeout(roundTimeout);
      streak += 1;
      onScore(50 + (streak - 1) * 10); // streak bonus
      currentTarget = null;
      setTimeout(nextRound, 200);
    }
    // ชี้/แตะมุมผิด: ไม่ตัดคะแนน ปล่อยให้ timeout จัดการเอง (เป็นมิตรกับเด็ก)
  }

  // gesture path: hit ทันทีที่ zone ตรงเป้า ไม่ต้องค้าง (เกมจับจังหวะเร็ว)
  ctx.setZoneHandler(({ zone }) => {
    if (zone) onHit(zone);
  });

  // tap fallback: ใช้ event เดิมของ corner element
  const tapHandlers = {};
  Object.entries(corners).forEach(([zone, el]) => {
    const handler = () => onHit(zone);
    tapHandlers[zone] = handler;
    el.addEventListener("click", handler);
  });
  ctx.onCleanupExtra = () => {
    Object.entries(tapHandlers).forEach(([zone, handler]) =>
      corners[zone].removeEventListener("click", handler)
    );
  };

  nextRound();
}

// ============ เกม 2: ชูมือสุดขีด (hold ตำแหน่งมือสูงค้าง 3 วิ) ============
export function runReachForSky(ctx) {
  const { corners, onScore, onEnd } = ctx;
  const HOLD_MS = 3000;
  const Y_THRESHOLD = 0.35; // ค่า normalized จากกล้อง: ยิ่งน้อยยิ่งอยู่สูงในเฟรม
  let holdStart = null;
  let done = false;

  resetCornerLabels(corners, { tl: "🙌", tr: "🙌" });

  function cleanup() {
    ctx.setZoneHandler(null);
    resetCornerLabels(corners);
    ctx.onCleanupExtra?.();
  }

  function finish() {
    if (done) return;
    done = true;
    onScore(120); // ให้คะแนนคงที่ เกมนี้เน้น inclusive ไม่ใช่แข่งความแม่น
    cleanup();
    onEnd();
  }

  ctx.setZoneHandler(({ point }) => {
    if (done) return;
    const raised = point && point.y < Y_THRESHOLD;
    if (raised) {
      if (holdStart === null) holdStart = performance.now();
      const held = performance.now() - holdStart;
      corners.tl.style.opacity = corners.tr.style.opacity = 0.6 + 0.4 * (held / HOLD_MS);
      if (held >= HOLD_MS) finish();
    } else {
      holdStart = null;
      corners.tl.style.opacity = corners.tr.style.opacity = 1;
    }
  });

  // tap fallback: กดค้างที่มุมบนซ้ายหรือขวาไว้ 3 วิ (mousedown/touchstart จริง)
  let pressTimer = null;
  function startPress() {
    pressTimer = setTimeout(finish, HOLD_MS);
  }
  function cancelPress() {
    clearTimeout(pressTimer);
  }
  [corners.tl, corners.tr].forEach((el) => {
    el.addEventListener("mousedown", startPress);
    el.addEventListener("touchstart", startPress);
    el.addEventListener("mouseup", cancelPress);
    el.addEventListener("mouseleave", cancelPress);
    el.addEventListener("touchend", cancelPress);
  });
  ctx.onCleanupExtra = () => {
    [corners.tl, corners.tr].forEach((el) => {
      el.removeEventListener("mousedown", startPress);
      el.removeEventListener("touchstart", startPress);
      el.removeEventListener("mouseup", cancelPress);
      el.removeEventListener("mouseleave", cancelPress);
      el.removeEventListener("touchend", cancelPress);
    });
  };

  // timeout กันเกมค้างถ้าไม่มีใครยกมือเลย (จบแบบ inclusive ให้คะแนนบางส่วน)
  setTimeout(() => {
    if (!done) {
      onScore(30); // ความพยายาม/participation score
      done = true;
      cleanup();
      onEnd();
    }
  }, 10000);
}

export const BONUS_RUNNERS = {
  "skibidi-dodge": runSkibidiDodge,
  "reach-sky": runReachForSky,
};
