// bonus-engine.js
// "เครื่องมือกลาง" สำหรับ Bonus Challenge มินิเกม — ทุกเกมใช้ 4 มุมเดียวกับหน้าคำถามหลัก
// ใช้ zone stream เดียวกับ gesture-detection.js (reuse onZoneUpdate) + tap fallback ฟรีทุกเกม
//
// วิธีเพิ่มเกมใหม่: เพิ่ม entry ใน BONUS_GAMES แล้วเขียนฟังก์ชัน run{ชื่อเกม}(ctx) ที่มี signature เดียวกัน

// ตัดเหลือแค่เกม "67" เกมเดียวตามที่ครูขอ (บอกว่าเกมอื่นดูรก/ไม่สนุกเท่า) — เกมที่เหลือยังอยู่ในโค้ด
// เต็มรูปแบบ แค่ตั้ง ready:false ไว้ก่อน เปลี่ยนกลับเป็น true ได้ทันทีถ้าอยากเปิดใช้อีกทีในอนาคต
export const BONUS_GAMES = [
  { id: "skibidi-dodge", name: "ไล่จับ Skibidi!", emoji: "🚽", ready: false },
  { id: "reach-sky", name: "ชูมือสุดขีด!", emoji: "🙌", ready: false },
  { id: "hand-bounce", name: "จังหวะมือ 6-7", emoji: "✋", ready: true },
  { id: "hand-dance-follow", name: "ตามท่ามือ", emoji: "🕺", ready: false },
  { id: "brainrot-swat", name: "ไล่ตี Brainrot!", emoji: "🐊", ready: false },
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

// รับได้ทั้งอีโมจิ (string เดิม) และ HTML/SVG (เช่น ICON_UP/ICON_DOWN ด้านล่าง) — ใช้ innerHTML แทน
// textContent เพื่อให้แปะไอคอน SVG ได้ ปลอดภัยเพราะ markup มาจากค่าคงที่ในไฟล์นี้เองเท่านั้น ไม่ใช่
// input จากผู้ใช้
function resetCornerLabels(corners, contentMap = {}) {
  Object.entries(corners).forEach(([zone, el]) => {
    el.innerHTML = contentMap[zone] ?? "";
    el.classList.remove("correct", "wrong", "target");
  });
}

// ลูกศรขึ้น/ลงแบบ SVG แทนอีโมจิ ⬆️⬇️ — อีโมจิหน้าตาไม่เหมือนกันข้าม iOS/Android/Windows (เห็นชัดเทียบ
// กันในห้องเดียวกัน) SVG นี้ใช้ currentColor รับสีจาก .answer-corner (ขาว) หน้าตาเหมือนกันเป๊ะทุกเครื่อง
const ICON_UP =
  '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"/></svg>';
const ICON_DOWN =
  '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

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

// ============ เกม 3: จังหวะมือ 6-7 (อิสระ ไม่บังคับจังหวะ) ============
// v3: ตัดระบบ BPM/จังหวะ/เสียงบี๊บออกทั้งหมดตามคำขอครู — อ้างอิงแนวทางจากงาน Science Day
// ม.แม่โจ้ เชียงใหม่ ที่ให้เด็กยกมือขึ้น-ลงตามจังหวะของตัวเอง ไม่กดดันเรื่องเวลา วัดแค่ว่า "สลับฝั่งสำเร็จ
// กี่ครั้ง" เท่านั้น (v2 เดิมบังคับจับจังหวะในหน้าต่าง ±250ms ต่อบีต ซึ่งพบว่าทำให้เครื่อง Android ที่
// ประมวลผลช้ากว่าเสียเปรียบมาก — คะแนนโบนัสต่างกันถึง ~5.5 เท่าระหว่าง iPhone/Android ทั้งที่ความแม่นยำ
// คำถามปกติเท่ากันเป๊ะ พิสูจน์ว่าปัญหาอยู่ที่ "หน้าต่างเวลาแคบเกินไป" ไม่ใช่ความแม่นยำของท่าทาง)
//
// ใช้ zone เดิม (ผ่านการปรับเทียบจาก calibration แล้ว) tl/tr = โซนบน, bl/br = โซนล่าง — ตั้งใจไม่โหลด
// โมเดล pose/skeleton เพิ่มเพื่อตรวจท่าทาง (เคยลองแล้วพบว่าทำให้ FPS ตกและมือจับแม่นน้อยลง โดยเฉพาะ
// เครื่องกลาง-ล่าง คือปัญหาสายเดียวกับที่กำลังจะแก้ ถ้าเปิดโมเดลหนักเพิ่มอาจยิ่งซ้ำเติม Android)
//
// v3.1: ใช้ frame.hands (ทุกมือที่เห็น ไม่เกิน 2 ข้าง แต่ละมือมี zone แยกอิสระของตัวเอง) แทน frame.zone
// (มือเดียวที่ถูก "เลือก" มาแล้ว) ตามฟีดแบ็กครู — ท่า "67" จริงๆ คือขยับสองมือสลับกันแบบตาชั่ง ถ้าดูแค่
// มือเดียว (ตัวที่ยกสูงกว่าในแต่ละเฟรม) ระบบอาจ "สลับไปดูอีกข้าง" กลางคันเวลาสองมืออยู่สูงใกล้เคียงกัน
// ทำให้เห็นข้อมูลกระตุกทั้งที่ท่าจริงถูกต้องอยู่แล้ว — ให้ทุกมือ "โหวต" การสลับฝั่งได้เท่ากันแทน
export function runHandBounce(ctx) {
  const { corners, onScore, onEnd } = ctx;
  const DURATION_MS = 10000;
  const MIN_SWITCH_GAP_MS = 150; // กันนับซ้ำเร็วเกินจริงจากมือสั่นเบาๆ (hysteresis ของ pointToZone กันไว้ชั้นหนึ่งแล้ว อันนี้กันซ้ำอีกชั้น)
  const upZones = ["tl", "tr"];
  const downZones = ["bl", "br"];

  let currentSide = null; // "up" | "down" | null (ยังไม่เคยจับฝั่งได้เลย)
  let lastSwitchTs = 0;
  let endTimeout = null;

  resetCornerLabels(corners, { tl: ICON_UP, tr: ICON_UP, bl: ICON_DOWN, br: ICON_DOWN });

  function cleanup() {
    clearTimeout(endTimeout);
    ctx.setZoneHandler(null);
    resetCornerLabels(corners);
    ctx.onCleanupExtra?.();
  }

  function finish() {
    cleanup();
    onEnd();
  }

  function zoneToSide(zone) {
    if (upZones.includes(zone)) return "up";
    if (downZones.includes(zone)) return "down";
    return null;
  }

  // ไฮไลต์ฝั่งที่ควรไป "ต่อไป" (ไม่ใช่ฝั่งที่อยู่ตอนนี้) — ชัดเจนกว่าสำหรับทั้งคนใช้มือจริงและคนแตะจอ
  // (กล้องเสีย/เปิดไม่ติด): เห็นไฟกระพริบที่มุมไหนก็รู้เลยว่าต้องขยับ/แตะไปทางนั้นต่อถึงจะได้แต้ม
  function highlightTarget(currentActiveSide) {
    const targetSide = currentActiveSide === "up" ? "down" : "up";
    Object.entries(corners).forEach(([zone, el]) => {
      const zoneSide = upZones.includes(zone) ? "up" : "down";
      el.classList.toggle("target", zoneSide === targetSide);
    });
  }

  // เรียกทุกเฟรมที่มีโซนจากมือ/แตะจอ — ครั้งแรกแค่จำฝั่งเริ่มต้นไว้ (ยังไม่ได้แต้ม) ต้องสลับฝั่งจริง
  // อย่างน้อย 1 ครั้งถึงจะเริ่มนับ ป้องกันได้แต้มฟรีจากการ "อยู่เฉยๆ" ตอนเริ่มเกม
  function registerSide(side) {
    if (!side || side === currentSide) return;

    if (currentSide === null) {
      currentSide = side;
      highlightTarget(side);
      return;
    }

    const now = performance.now();
    if (now - lastSwitchTs < MIN_SWITCH_GAP_MS) return;

    lastSwitchTs = now;
    currentSide = side;
    highlightTarget(side);
    onScore(20); // คงที่ต่อการสลับฝั่งสำเร็จ 1 ครั้ง ไม่ผูกกับความเร็ว/จังหวะแล้ว — เร็วช้าตามตัวเด็กเอง
  }

  ctx.setZoneHandler(({ zone, hands }) => {
    if (hands && hands.length > 0) {
      // มีข้อมูลแยกต่อมือ (2 ข้อมือ) — ให้ทุกมือ "โหวต" ได้ ไม่ใช่แค่มือที่ถูกเลือกมือเดียว
      hands.forEach((h) => registerSide(zoneToSide(h.zone)));
    } else {
      // เผื่อ ctx จำลอง/เทสเก่าที่ยังส่งแค่ zone เดียวมาไม่มี hands (เช่น bonus-selftest.html)
      registerSide(zoneToSide(zone));
    }
  });

  // tap fallback: แตะสลับบน/ล่างเอง ใช้กติกาเดียวกันทุกอย่างกับทาง gesture (registerSide ร่วมกัน)
  const tapHandlers = {};
  Object.entries(corners).forEach(([zone, el]) => {
    const handler = () => registerSide(zoneToSide(zone));
    tapHandlers[zone] = handler;
    el.addEventListener("click", handler);
  });
  ctx.onCleanupExtra = () => {
    Object.entries(tapHandlers).forEach(([zone, handler]) =>
      corners[zone].removeEventListener("click", handler)
    );
  };

  endTimeout = setTimeout(finish, DURATION_MS);
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
