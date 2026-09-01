// bonus-engine.js
// "เครื่องมือกลาง" สำหรับ Bonus Challenge มินิเกม — ทุกเกมใช้ 4 มุมเดียวกับหน้าคำถามหลัก
// ใช้ zone stream เดียวกับ gesture-detection.js (reuse onZoneUpdate) + tap fallback ฟรีทุกเกม
//
// วิธีเพิ่มเกมใหม่: เพิ่ม entry ใน BONUS_GAMES แล้วเขียนฟังก์ชัน run{ชื่อเกม}(ctx) ที่มี signature เดียวกัน

export const BONUS_GAMES = [
  { id: "skibidi-dodge", name: "ไล่จับ Skibidi!", emoji: "🚽", ready: true },
  { id: "reach-sky", name: "ชูมือสุดขีด!", emoji: "🙌", ready: true },
  { id: "hand-bounce", name: "จังหวะมือ 6-7", emoji: "✋", ready: true },
  { id: "hand-dance-follow", name: "ตามท่ามือ", emoji: "🕺", ready: true },
  { id: "brainrot-swat", name: "ไล่ตี Brainrot!", emoji: "🐊", ready: true },
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
  el.classList.add("target");
  setTimeout(() => el.classList.remove("target"), ms);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// ============ เกม 3: จังหวะมือ 6-7 (สลับซ้าย-ขวาให้ตรงจังหวะ, BPM เร่งขึ้นเรื่อยๆ) ============
// หมายเหตุลิขสิทธิ์: ใช้เสียง beep สังเคราะห์เอง (Web Audio API) ไม่ใช้คลิปเพลง/เสียงจากคลิปไวรัลจริง
//
// v2: เปลี่ยนจาก "ชี้ซ้าย/ขวา" เป็น "ยกมือขึ้น-ลง" ตามฟีดแบ็กครู — ตรงกับท่าจริงของเทรนด์ 6-7
// (ท่าเหมือนตาชั่ง ยกมือสลับขึ้น-ลง ไม่ใช่ชี้ซ้ายขวา) ใช้โซนบน (tl+tr) แทน "ขึ้น" และโซนล่าง (bl+br) แทน "ลง"
export function runHandBounce(ctx) {
  const { corners, onScore, onEnd } = ctx;
  const DURATION_MS = 10000;
  const START_BPM = 100;
  const END_BPM = 140;
  const upZones = ["tl", "tr"];
  const downZones = ["bl", "br"];

  let side = "up";
  let beatTime = 0;
  let beatScored = false;
  let beatTimeout = null;
  const startTime = performance.now();
  let audioCtx = null;

  resetCornerLabels(corners, { tl: "⬆️", tr: "⬆️", bl: "⬇️", br: "⬇️" });

  function cleanup() {
    clearTimeout(beatTimeout);
    ctx.setZoneHandler(null);
    resetCornerLabels(corners);
    ctx.onCleanupExtra?.();
  }

  function beep(freq) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // บาง browser ต้องมี user gesture ก่อนถึงเล่นเสียงได้ — ปล่อยผ่านเงียบๆ ไม่กระทบ gameplay
    }
  }

  function highlightSide(activeSide) {
    Object.entries(corners).forEach(([zone, el]) => {
      const zoneSide = upZones.includes(zone) ? "up" : "down";
      el.classList.toggle("target", zoneSide === activeSide);
    });
  }

  function scheduleBeat() {
    const elapsed = performance.now() - startTime;
    if (elapsed >= DURATION_MS) {
      cleanup();
      onEnd();
      return;
    }
    const progress = elapsed / DURATION_MS;
    const bpm = START_BPM + (END_BPM - START_BPM) * progress;
    const intervalMs = 60000 / bpm;

    side = side === "up" ? "down" : "up";
    beatTime = performance.now();
    beatScored = false;
    highlightSide(side);
    beep(side === "up" ? 660 : 440); // เสียงสูง = ขึ้น, เสียงต่ำ = ลง ให้ตรงสัญชาตญาณ

    beatTimeout = setTimeout(scheduleBeat, intervalMs);
  }

  function onHitSide(hitSide) {
    if (beatScored || hitSide !== side) return; // ผิดจังหวะ/ให้คะแนนไปแล้ว: ไม่ตัดคะแนน ปล่อยผ่าน
    const dt = Math.abs(performance.now() - beatTime);
    if (dt <= 250) {
      beatScored = true;
      onScore(dt <= 100 ? 30 : 15);
    }
  }

  ctx.setZoneHandler(({ zone }) => {
    if (zone) onHitSide(upZones.includes(zone) ? "up" : "down");
  });

  const tapHandlers = {};
  Object.entries(corners).forEach(([zone, el]) => {
    const handler = () => onHitSide(upZones.includes(zone) ? "up" : "down");
    tapHandlers[zone] = handler;
    el.addEventListener("click", handler);
  });
  ctx.onCleanupExtra = () => {
    Object.entries(tapHandlers).forEach(([zone, handler]) =>
      corners[zone].removeEventListener("click", handler)
    );
  };

  scheduleBeat();
}

// ============ เกม 4: ตามท่ามือ (Simon Says โซน — ลำดับยาวขึ้นทุกรอบ) ============
// v2: ปรับให้เข้าใจง่ายขึ้นตามฟีดแบ็กครู (บอกว่าเกมนี้ทำให้งง/ไม่สนุก) — ลำดับสั้นลง (2→4 แทน 3→6),
// โชว์แต่ละท่านานขึ้น + มี badge บอกความคืบหน้าตลอดเวลา (ทั้งตอนดูและตอนทำตาม) กันเด็กหลงว่าอยู่ขั้นไหน
export function runHandDanceFollow(ctx) {
  const { corners, onScore, onEnd } = ctx;
  const zones = ["tl", "tr", "bl", "br"];
  const MAX_ROUNDS = 3; // ความยาวลำดับ: รอบ 1-3 = 2,3,4 โซน (สั้นลงจากเดิม 3-6 ที่ยาวเกินไป)
  let sequence = [];
  let round = 0;
  let playerIndex = 0;
  let accepting = false;
  let lastZone = null;
  let safetyTimeout = null;
  let ended = false;

  resetCornerLabels(corners, { tl: "👉", tr: "👉", bl: "👉", br: "👉" });

  const badge = document.createElement("div");
  badge.className = "bonus-progress-badge";
  ctx.stage.appendChild(badge);

  function cleanup() {
    clearTimeout(safetyTimeout);
    ctx.setZoneHandler(null);
    resetCornerLabels(corners);
    badge.remove();
    ctx.onCleanupExtra?.();
  }

  function finish() {
    if (ended) return;
    ended = true;
    cleanup();
    onEnd();
  }

  function randomZone() {
    return zones[Math.floor(Math.random() * zones.length)];
  }

  async function playSequence() {
    for (let i = 0; i < sequence.length; i++) {
      badge.textContent = `👀 จำไว้นะ... ท่าที่ ${i + 1}/${sequence.length}`;
      flashCorner(corners[sequence[i]], 550);
      await wait(750);
    }
    if (ended) return;
    accepting = true;
    lastZone = null;
    badge.textContent = `ทำตามลำดับ: 0/${sequence.length}`;

    // กันเกมค้างถ้านักเรียนไม่ตอบสนองเลย — ให้คะแนนรอบที่ผ่านมาแล้วแล้วจบแบบนุ่มนวล
    safetyTimeout = setTimeout(() => {
      onScore((round - 1) * 40);
      finish();
    }, 7000);
  }

  function startRound() {
    round += 1;
    const targetLength = 1 + round; // รอบ1=2, รอบ2=3, รอบ3=4
    while (sequence.length < targetLength) sequence.push(randomZone());

    if (round > MAX_ROUNDS) {
      onScore(60); // bonus ผ่านครบทุกรอบ
      finish();
      return;
    }

    playerIndex = 0;
    accepting = false;
    playSequence();
  }

  function onPointerZone(zone) {
    if (!accepting || !zone || zone === lastZone) return; // debounce: ต้องเปลี่ยนโซนก่อนนับเป็น input ใหม่
    lastZone = zone;

    const expected = sequence[playerIndex];
    if (zone === expected) {
      flashCorner(corners[zone], 200);
      playerIndex += 1;
      badge.textContent = `ทำตามลำดับ: ${playerIndex}/${sequence.length}`;
      if (playerIndex === sequence.length) {
        clearTimeout(safetyTimeout);
        accepting = false;
        onScore(40);
        setTimeout(startRound, 500);
      }
    } else {
      clearTimeout(safetyTimeout);
      accepting = false;
      onScore((round - 1) * 40); // partial credit จากรอบที่ผ่านมาแล้ว ไม่ใช่ 0
      finish();
    }
  }

  ctx.setZoneHandler(({ zone }) => onPointerZone(zone));

  const tapHandlers = {};
  Object.entries(corners).forEach(([zone, el]) => {
    const handler = () => onPointerZone(zone);
    tapHandlers[zone] = handler;
    el.addEventListener("click", handler);
  });
  ctx.onCleanupExtra = () => {
    Object.entries(tapHandlers).forEach(([zone, handler]) =>
      corners[zone].removeEventListener("click", handler)
    );
  };

  startRound();
}

// ============ เกม 5: ไล่ตี Brainrot (หลายตัวพร้อมกันได้ในช่วงท้าย, combo multiplier) ============
export function runBrainrotSwat(ctx) {
  const { corners, onScore, onEnd } = ctx;
  const zones = ["tl", "tr", "bl", "br"];
  const DURATION_MS = 10000;
  // ไอคอน emoji ล้วนๆ แบบขำๆ สไตล์ brainrot — ไม่ใช้ asset/ภาพจากที่ไหนที่มีลิขสิทธิ์
  const CREATURES = ["🐊", "🦐", "🐬", "👟", "🦈"];

  const startTime = performance.now();
  let active = {}; // zone -> { timeout }
  let combo = 0;
  let spawnTimeout = null;

  resetCornerLabels(corners);

  function cleanup() {
    clearTimeout(spawnTimeout);
    Object.values(active).forEach((a) => clearTimeout(a.timeout));
    active = {};
    ctx.setZoneHandler(null);
    resetCornerLabels(corners);
    ctx.onCleanupExtra?.();
  }

  function pickFreeZone() {
    const free = zones.filter((z) => !active[z]);
    if (free.length === 0) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function despawn(zone, hit) {
    if (!active[zone]) return;
    clearTimeout(active[zone].timeout);
    delete active[zone];
    corners[zone].textContent = "";
    corners[zone].classList.remove("target");
    if (!hit) combo = 0;
  }

  function spawnCreature() {
    const elapsed = performance.now() - startTime;
    if (elapsed >= DURATION_MS) {
      if (Object.keys(active).length === 0) {
        cleanup();
        onEnd();
      } else {
        spawnTimeout = setTimeout(spawnCreature, 300); // รอให้ตัวที่ยังค้างอยู่หมดอายุก่อนค่อยจบ
      }
      return;
    }

    const zone = pickFreeZone();
    if (zone) {
      const emoji = CREATURES[Math.floor(Math.random() * CREATURES.length)];
      corners[zone].textContent = emoji;
      corners[zone].classList.add("target");
      const timeout = setTimeout(() => despawn(zone, false), 900);
      active[zone] = { timeout };
    }

    const progress = elapsed / DURATION_MS;
    const allowDouble = progress > 0.6; // ช่วงท้ายมีโอกาสเกิดซ้อนกัน 2 ตัว
    const gap = Math.max(950 - progress * 400, 450);
    spawnTimeout = setTimeout(spawnCreature, allowDouble && Math.random() < 0.5 ? gap / 2 : gap);
  }

  function onHit(zone) {
    if (!active[zone]) return;
    despawn(zone, true);
    combo += 1;
    onScore(35 + Math.min(combo - 1, 5) * 5); // combo multiplier มี cap กันคะแนนพุ่งเกินไป
  }

  ctx.setZoneHandler(({ zone }) => {
    if (zone) onHit(zone);
  });

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

  spawnCreature();
}

export const BONUS_RUNNERS = {
  "skibidi-dodge": runSkibidiDodge,
  "reach-sky": runReachForSky,
  "hand-bounce": runHandBounce,
  "hand-dance-follow": runHandDanceFollow,
  "brainrot-swat": runBrainrotSwat,
};
