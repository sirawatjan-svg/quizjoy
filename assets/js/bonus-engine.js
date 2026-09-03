// bonus-engine.js
// "เครื่องมือกลาง" สำหรับ Bonus Challenge มินิเกม — ทุกเกมใช้ 4 มุมเดียวกับหน้าคำถามหลัก
// ใช้ zone stream เดียวกับ gesture-detection.js (reuse onZoneUpdate) + tap fallback ฟรีทุกเกม
//
// วิธีเพิ่มเกมใหม่: เพิ่ม entry ใน BONUS_GAMES แล้วเขียนฟังก์ชัน run{ชื่อเกม}(ctx) ที่มี signature เดียวกัน

// v4: พัก "67" (hand-bounce) ไว้ก่อน — วิเคราะห์ร่วมกับครูแล้วพบสาเหตุเชิงโครงสร้างว่าทำไมแก้เท่าไหร่ก็ยัง
// มีปัญหาบน Android ไม่หายสักที (ลองมาแล้ว 3 รอบ: two-hand tracking, revert เป็น single-hand, grace period
// กันมือหลุดเฟรม) — 67 ต้องการให้ผู้เล่น "สลับโซนสำเร็จ" ต่อเนื่องกันหลายสิบครั้งใน 10 วินาที ขณะที่ทุกจุดอื่น
// ในแอป (ตอบคำถามหลัก, Skibidi Dodge, Brainrot Swat) ต้องการแค่ "hold ค้างสำเร็จ 1 ครั้ง" ต่อ 1 การกระทำ —
// สัญญาณรบกวนเล็กๆ ที่มีอยู่แล้วในระบบตรวจจับ (หลุดเฟรมชั่วครู่/ความมั่นใจโมเดลแกว่ง) แทบไม่กระทบอะไรเลยถ้า
// ต้องแม่นแค่ 1 ครั้ง แต่พอต้องแม่นซ้ำกันหลายสิบครั้งติด ความน่าจะเป็นที่จะพลาดสักครั้งในนั้นสูงขึ้นมาก — อธิบาย
// ได้ว่าทำไม 67 ถึงเป็นจุดเดียวที่มีปัญหาต่อเนื่องข้ามทุกรอบการแก้ ทั้งที่กลไกจับมือจุดเดียวกันเป๊ะๆ ใช้ตอบ
// คำถามหลักได้แม่น 95% เปิด brainrot-swat กลับมาแทน (reskin เป็น "ตกปลา" ตามไอเดียครู) เพราะเป็นกลไก
// hold-ครั้งเดียวเหมือนเกมอื่นที่ไม่เคยมีคนบ่นเรื่องตรวจจับเลย — โค้ดเกม 67 ยังอยู่ครบ แค่ ready:false
// เปลี่ยนกลับเป็น true ได้ทันทีถ้าอยากลองอีกทีในอนาคต
export const BONUS_GAMES = [
  { id: "skibidi-dodge", name: "ไล่จับ Skibidi!", emoji: "🚽", ready: false },
  { id: "reach-sky", name: "ชูมือสุดขีด!", emoji: "🙌", ready: false },
  { id: "hand-bounce", name: "จังหวะมือ 6-7", emoji: "✋", ready: false },
  { id: "hand-dance-follow", name: "ตามท่ามือ", emoji: "🕺", ready: false },
  { id: "brainrot-swat", name: "ตกปลา!", emoji: "🎣", ready: true },
  // v5: เพิ่ม "ขโมยโบนัส" (แนวคิดครู อ้างอิง Blooket) — โชว์ผู้เล่นคะแนนโบนัสสูงสุด 4 คน เลือกขโมย 1 คนด้วย
  // กลไก "ชี้ค้าง 1 ใน 4 มุม" เดียวกับตอบคำถามหลักเป๊ะๆ (ระบบที่แม่นที่สุดในแอป — ไม่ใช่สลับเป้ารัวๆ ต่อเนื่อง
  // แบบ 67 ที่พักไปแล้ว) ตอนนี้มี 2 เกมพร้อมเล่นสลับกัน (ตกปลา + ขโมยโบนัส) ตามที่คุยกันไว้เรื่องความหลากหลาย
  { id: "steal-bonus", name: "ขโมยโบนัส!", emoji: "💰", ready: true },
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
// v3.2: กลับมาใช้ frame.zone (มือเดียว ตัวเดียวกับที่ตอบคำถามหลักใช้ ซึ่งแม่นยำสูงมากในข้อมูลจริง — 95%
// ในเซสชันล่าสุด) แทน frame.hands (2 มือ) ที่เพิ่งลองไป — ครูสังเกตเห็นจากการทดสอบจริงว่านักเรียน "ถือ
// มือถือด้วยมือข้างหนึ่งเสมอ" (ไม่ได้ตั้งวางอย่างที่ออกแบบไว้แต่แรก) เหลือมือว่างจริงแค่ข้างเดียว — ระบบ
// 2 มือที่เพิ่งทำไปกลับกลายเป็นผลเสีย เพราะมือที่ถือโทรศัพท์ (แทบนิ่งแต่ไม่นิ่งสนิท) ถูกนับเป็น "มือที่ 2"
// ไปด้วย บางจังหวะอาจขยับข้ามเส้นแบ่งโซนเองแบบสุ่ม ไปรบกวน/หักล้างกับการสลับฝั่งจริงของมือที่ตั้งใจขยับ
// จริงๆ — ยืนยันจากที่ครูทดสอบเองว่า "ใช้มือเดียวกลับได้แต้มเร็วกว่า" ตรงกับสมมติฐานนี้เป๊ะ
// จุดติดตามมือ 2 จุด (ที่เพิ่มไว้ก่อนหน้า) ยังคงแสดงผลอยู่เหมือนเดิม (เผื่อมีบางคนใช้ 2 มือได้จริง) แค่
// ไม่เอาผลจากมือที่ 2 มาคิดคะแนนเกม 67 อีกต่อไป
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

  ctx.setZoneHandler(({ zone }) => registerSide(zoneToSide(zone)));

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

// ============ เกม 5: ตกปลา (v3: เขียนใหม่ทั้งหมดตามไอเดียครู "ปลาว่ายไปมาอิสระ 2-3 ตัวพร้อมกัน ชี้ค้าง
// ทับตัวปลาแป๊บนึงจับได้แต้มสุ่ม" — v2 ก่อนหน้า (reskin จาก "ไล่ตี Brainrot") ยังโผล่นิ่งที่ 1 ใน 4 มุมคงที่
// เหมือนของเดิม ไม่ใช่ปลาว่ายอิสระแบบที่ครูอยากได้จริงๆ
//
// เปลี่ยนจากระบบ 4 โซนคงที่ มาใช้ตำแหน่งต่อเนื่อง point:{x,y} (0-1 normalized) ที่ gesture-detection.js
// ส่งมาอยู่แล้วทุกเฟรม (ตัวเดียวกับที่ hand-cursor ใช้วาดจุดติดตามมือ) เทียบระยะห่างจากตำแหน่งปลาสดๆ ตรงๆ
// ไม่ผ่าน zone/quadrant เลย — ปลาเลยว่ายไปตำแหน่งไหนของจอก็ได้ ไม่ต้องยึดติด 4 มุม
//
// จับ = ต้องชี้ค้างทับตัวปลาต่อเนื่อง ~500ms (CATCH_HOLD_MS, ครูเลือกเองจาก 2 ทางเลือก: "จับทันที" เสี่ยง
// คะแนนกระเด็นมั่วจากมือสั่นผ่านๆ vs "ค้างสั้นๆ" ตั้งใจชัดเจนกว่า) — สำคัญ: นี่ยังเป็นกลไก "hold ครั้งเดียวต่อ
// เป้าหมาย 1 ตัว" เหมือนเกมอื่นที่ไม่เคยมีปัญหาตรวจจับ ไม่ใช่ "สลับเป้าหมายรัวๆ ต่อเนื่องหลายสิบครั้ง" แบบ 67 ที่
// เพิ่งพักไป (ดูคอมเมนต์ยาวตอนประกาศ BONUS_GAMES ด้านบน) — จับ 1 ตัวไม่สำเร็จก็แค่ปลาตัวนั้นว่ายต่อ ไม่กระทบตัว
// อื่น ต่างจาก 67 ที่พลาดจังหวะเดียวกระทบสถิติทั้งเกม ============
export function runFishSwim(ctx) {
  const { corners, stage, onScore, onEnd } = ctx;
  // v4: ฟีดแบ็กครูหลังทดสอบจริง — "จับยากเกินไป" (ปลาเล็ก/hitbox แคบไป), เวลารอบสั้นไป, และกล่องคำตอบ 4
  // มุมเดิม (ว่างเปล่าแต่ยังโชว์เป็นกรอบสีทึบตลอดเกม) บังตา/รู้สึกเกะกะระหว่างไล่จับปลา — ปรับ 3 จุด:
  // ขยายปลา+hitbox ให้ใหญ่ขึ้นชัดเจน, ยืดเวลารอบให้นานขึ้น, และซ่อนกล่อง 4 มุมทิ้งระหว่างเล่นเกมนี้ (เกมอื่น
  // ยังใช้กล่องพวกนี้เป็นพื้นที่เล่นอยู่ตามปกติ แค่เกมนี้ไม่ได้ใช้แล้วเลยไม่จำเป็นต้องโชว์)
  const DURATION_MS = 15000;
  const MAX_FISH = 3;
  const CATCH_HOLD_MS = 500;
  // ระยะที่นับว่า "ชี้ทับตัวปลา" — ใช้กรอบสี่เหลี่ยม (แกน x/y แยกกัน) แทนระยะวงกลม เพราะจอมือถือแนวตั้ง
  // อัตราส่วนกว้าง:ยาวไม่ใช่ 1:1 ถ้าใช้ระยะวงกลมแบบ normalized ตรงๆ วงจะรีไม่เท่ากันจริงบนจอ ขยายให้กว้างขึ้น
  // อีกรอบ (จากที่ครูรายงานว่ายังจับยากไป) ใจดีกว่าความแม่นยำจริงของกล้องพอสมควร ไม่ต้องชี้เป๊ะกลางตัวปลาเลย
  const CATCH_RX = 0.19;
  const CATCH_RY = 0.13;
  const MIN_Y = 0.22; // เว้นโซนบน (หัวข้อ/badge) กับล่าง (แถบ progress) ไว้ ไม่ให้ปลาว่ายไปโดนบัง
  const MAX_Y = 0.78;
  const MARGIN_X = 0.08;
  const FISH_EMOJI = ["🐟", "🐠", "🐡", "🦐", "🦑"];

  resetCornerLabels(corners); // เกมนี้ไม่ใช้กล่อง 4 มุมแล้ว เคลียร์ label ค้างจากเกมก่อนหน้ากันสับสน
  // ซ่อนกล่องคำตอบ 4 มุมไปเลยทั้งเกม (ว่างเปล่าอยู่แล้วแต่ .answer-corner ยังมีพื้นหลังสีทึบของตัวเอง โชว์
  // เป็นกรอบสี่เหลี่ยมค้างอยู่ตลอด ครูรายงานว่าเกะกะ/บังตาเวลาไล่จับปลาที่ว่ายผ่านบริเวณนั้น) — v2: ต้องใช้
  // class .fish-game-hidden (มี !important ใน style.css) ไม่ใช่ el.style.opacity ตรงๆ แบบรอบแรก เพราะกล่อง
  // เพิ่งผ่านแอนิเมชัน .reveal-in (fill-mode:forwards จากตอนคำถามก่อนหน้าโผล่มา) ซึ่งชนะ inline style
  // normal-priority เสมอตาม CSS cascade — ครูส่งภาพจอมายืนยันว่ากล่องยังโชว์เต็มๆ ทั้งที่ตั้ง opacity ให้แล้ว
  Object.values(corners).forEach((el) => el.classList.add("fish-game-hidden"));

  const startTime = performance.now();
  let fishes = []; // { el, x, y, vx, vy, catchStartTs }
  let ended = false;
  let rafId = null;
  let spawnTimeout = null;
  let lastTick = startTime;

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnFish() {
    const el = document.createElement("div");
    el.className = "fish-swim";
    el.textContent = FISH_EMOJI[Math.floor(Math.random() * FISH_EMOJI.length)];
    stage.appendChild(el);
    const fish = {
      el,
      x: randRange(MARGIN_X, 1 - MARGIN_X),
      y: randRange(MIN_Y, MAX_Y),
      vx: (Math.random() < 0.5 ? -1 : 1) * randRange(0.07, 0.16), // สัดส่วนจอ/วินาที
      vy: (Math.random() < 0.5 ? -1 : 1) * randRange(0.015, 0.045),
      catchStartTs: null,
    };
    fishes.push(fish);
    return fish;
  }

  function removeFish(fish) {
    fish.el.remove();
    fishes = fishes.filter((f) => f !== fish);
  }

  function scheduleReplacement() {
    clearTimeout(spawnTimeout);
    spawnTimeout = setTimeout(maybeSpawn, 250);
  }

  function catchFish(fish) {
    const points = 20 + Math.floor(Math.random() * 61); // สุ่ม 20-80 แต้มตามที่ครูอยากได้ "แต้มสุ่ม"
    onScore(points);
    removeFish(fish);
    scheduleReplacement();
  }

  function cleanup() {
    cancelAnimationFrame(rafId);
    clearTimeout(spawnTimeout);
    clearTimeout(endTimeout);
    fishes.forEach((f) => f.el.remove());
    fishes = [];
    resetCornerLabels(corners);
    Object.values(corners).forEach((el) => el.classList.remove("fish-game-hidden"));
    ctx.setZoneHandler(null);
    ctx.onCleanupExtra?.();
  }

  function finish() {
    if (ended) return;
    ended = true;
    cleanup();
    onEnd();
  }

  // จบเกมด้วย setTimeout เหมือนเกมอื่นทุกเกมในไฟล์นี้ (ไม่ใช่เช็คเวลาใน tick() แบบที่เคยเขียนไว้รอบแรก) —
  // เจอบั๊กจริงตอนทดสอบ: browser จะ "หยุด" requestAnimationFrame เองเวลาแท็บไม่ได้อยู่ตรงหน้า/ไม่ visible
  // (ประหยัดแบต) ถ้าเช็คเงื่อนไขจบเกมอยู่ใน tick() (RAF) แล้วแท็บถูกสลับไปที่อื่นแป๊บเดียวระหว่างเล่น เกมจะ
  // "ค้างไม่จบ" ไปเลยจนกว่าจะกลับมาที่แท็บ (คะแนนยังเข้าปกติเพราะ checkCatch ผูกกับสตรีมกล้อง ไม่ใช่ RAF แต่
  // onEnd()/cleanup ไม่มีวันถูกเรียก) setTimeout ไม่โดน throttle ขนาดนั้น (แค่หน่วงได้บ้างในแท็บพักนานๆ แต่
  // ไม่มีวันหยุดสนิทแบบ RAF) จบเกมได้แน่นอนกว่า ส่วน tick() เหลือหน้าที่แค่ขยับตำแหน่งปลาให้ลื่นตาเท่านั้น
  const endTimeout = setTimeout(finish, DURATION_MS);

  function tick() {
    if (ended) return;
    const now = performance.now();
    const dt = Math.min((now - lastTick) / 1000, 0.1); // cap กัน dt พุ่งเวลาแท็บถูก throttle/สลับแอปสักครู่
    lastTick = now;

    for (const fish of fishes) {
      fish.x += fish.vx * dt;
      fish.y += fish.vy * dt;
      // เด้งกลับที่ขอบเขต แทนที่จะว่ายทะลุออกจากพื้นที่เล่นหายไป
      if (fish.x < MARGIN_X || fish.x > 1 - MARGIN_X) fish.vx *= -1;
      if (fish.y < MIN_Y || fish.y > MAX_Y) fish.vy *= -1;
      fish.x = Math.min(Math.max(fish.x, MARGIN_X), 1 - MARGIN_X);
      fish.y = Math.min(Math.max(fish.y, MIN_Y), MAX_Y);
      fish.el.style.left = `${fish.x * 100}%`;
      fish.el.style.top = `${fish.y * 100}%`;
      // หันหน้าปลาตามทิศที่ว่ายจริง (ว่ายซ้ายก็พลิกซ้าย) + ขยายเล็กน้อยตอนกำลังโดนจับค้างอยู่ ให้เห็นชัดว่า
      // "ใกล้จะได้แล้ว" — รวมไว้ transform เดียว (ไม่แยก class ควบคุม transform เพราะ inline style ทับ
      // stylesheet เสมอ ถ้าแยกกันจะชนกัน .catching ในสไตล์ชีทจะไม่มีผลอะไรเลย)
      const catching = fish.catchStartTs !== null;
      const scale = catching ? 1.32 : 1;
      fish.el.style.transform = `translate(-50%, -50%) scaleX(${fish.vx < 0 ? -1 : 1}) scale(${scale})`;
      fish.el.classList.toggle("catching", catching);
    }

    rafId = requestAnimationFrame(tick);
  }

  function maybeSpawn() {
    if (ended) return;
    if (fishes.length < MAX_FISH) spawnFish();
    const remaining = DURATION_MS - (performance.now() - startTime);
    if (remaining > 600 && fishes.length < MAX_FISH) {
      spawnTimeout = setTimeout(maybeSpawn, randRange(700, 1500));
    }
  }

  function checkCatch(px, py) {
    const now = performance.now();
    for (const fish of fishes) {
      const within =
        px != null && py != null && Math.abs(px - fish.x) <= CATCH_RX && Math.abs(py - fish.y) <= CATCH_RY;
      if (within) {
        if (fish.catchStartTs === null) fish.catchStartTs = now;
        else if (now - fish.catchStartTs >= CATCH_HOLD_MS) catchFish(fish);
      } else {
        fish.catchStartTs = null;
      }
    }
  }

  // ปลาเริ่มต้น 2 ตัวทันที ไม่ต้องรอคิว spawn แรก
  spawnFish();
  spawnFish();
  maybeSpawn();
  rafId = requestAnimationFrame(tick);

  ctx.setZoneHandler(({ point }) => checkCatch(point?.x ?? null, point?.y ?? null));

  // tap fallback: แตะตัวปลาโดยตรงจับได้ทันที ไม่ต้องค้าง (การแตะเองคือความตั้งใจชัดเจนอยู่แล้ว ต่างจากชี้ด้วย
  // กล้องที่อาจสั่น/กวาดผ่านโดยไม่ตั้งใจ) ใช้ event delegation ที่ stage เพราะปลา spawn/หายตลอดเวลา
  function onStageClick(e) {
    const el = e.target.closest(".fish-swim");
    if (!el) return;
    const fish = fishes.find((f) => f.el === el);
    if (fish) catchFish(fish);
  }
  stage.addEventListener("click", onStageClick);
  ctx.onCleanupExtra = () => {
    stage.removeEventListener("click", onStageClick);
  };
}

// ============ เกม 6: ขโมยโบนัส (Blooket-inspired ตามไอเดียครู) ============
// ctx เพิ่ม 2 ตัวเฉพาะเกมนี้ (เกมอื่นไม่ใช้เลย): fetchTargets() -> Promise<[{id,name,bonusScore}]> สูงสุด
// 4 คน, stealFrom(targetId, amount) -> หักคะแนนเป้าหมายจริงใน Firestore — ทั้งสองตัวทำที่ student/app.js
// เพราะไฟล์นี้ตั้งใจไม่แตะ Firestore เลย (แยก concern: ไฟล์นี้ = UI/logic เกมล้วนๆ, หน้าเรียก = network)
//
// ใช้กลไก "ชี้ค้าง 1 ใน 4 มุม" ค้าง HOLD_MS เดียวกับตอบคำถามหลักเป๊ะๆ — เลือกแบบนี้เพราะโดยธรรมชาติ "เลือกจะ
// ขโมยใครใน 4 คน" คือการตัดสินใจ "1 ใน 4" ครั้งเดียว เหมือนตอบคำถาม ไม่ใช่ต้องสลับเป้าหมายรัวๆ ต่อเนื่องแบบ
// 67 ที่พักไปแล้ว (ดูคอมเมนต์ยาวตอนประกาศ BONUS_GAMES ด้านบนสุดของไฟล์) — ไม่ได้ใช้ progress/confirmed จาก
// gesture-detection.js ตรงๆ เพราะ frame ที่ส่งมาโหมด bonus มีแค่ {zone, point, hands} เท่านั้น (ดู onZoneUpdate
// ใน student/app.js) เลยทำนาฬิกาค้างของตัวเองแยกในเกม เหมือนที่ runHandDanceFollow ทำอยู่แล้ว
export function runStealBonus(ctx) {
  const { corners, onScore, onEnd, fetchTargets, stealFrom } = ctx;
  const zones = ["tl", "tr", "bl", "br"];
  const DECIDE_MS = 12000; // เวลาตัดสินใจทั้งรอบ นานกว่าคำถามปกตินิดหน่อย เพราะต้องอ่านชื่อ/คะแนนคนอื่นก่อน
  const HOLD_MS = 1400; // เท่ากับตอบคำถามหลักเป๊ะๆ

  let targets = [null, null, null, null]; // เรียงตำแหน่งตาม zones ด้านบน
  let decided = false;
  let decideTimeout = null;
  let currentZone = null;
  let zoneEnterTs = 0;

  resetCornerLabels(corners, { tl: "⏳", tr: "⏳", bl: "⏳", br: "⏳" });

  function cleanup() {
    clearTimeout(decideTimeout);
    ctx.setZoneHandler(null);
    resetCornerLabels(corners);
    ctx.onCleanupExtra?.();
  }

  function finish() {
    if (decided) return;
    decided = true;
    cleanup();
    onEnd();
  }

  // วาดชื่อ/คะแนนเป้าหมายด้วย DOM API + textContent (ไม่ใช้ innerHTML ต่อ string ชื่อตรงๆ) — ชื่อนี้มาจาก
  // ผู้เล่นคนอื่นพิมพ์เอง (แอปนี้ไม่มีระบบ auth ฝั่งนักเรียน ใครจะพิมพ์อะไรมาเป็นชื่อก็ได้) ถ้าต่อ string
  // แล้วใส่ผ่าน innerHTML ตรงๆ จะเปิดช่องให้แอบใส่ HTML/script ผ่านชื่อได้ (stored XSS) ตั้งใจกันไว้ตั้งแต่
  // เขียนเกมนี้ใหม่ แม้ว่าโค้ดจุดอื่นในโปรเจกต์ (หน้าโพเดียม) จะยังไม่ได้กันแบบนี้ก็ตาม
  function renderTargets(list) {
    targets = zones.map((_, i) => list[i] ?? null);
    zones.forEach((zone, i) => {
      const el = corners[zone];
      const t = targets[i];
      el.innerHTML = "";
      el.classList.toggle("target", !!t);
      if (!t) return;
      const wrap = document.createElement("div");
      const nameLine = document.createElement("div");
      nameLine.style.fontWeight = "800";
      nameLine.textContent = t.name;
      const scoreLine = document.createElement("div");
      scoreLine.style.cssText = "font-size:0.75em; opacity:0.85; margin-top:2px;";
      scoreLine.textContent = `🎁 ${t.bonusScore}`;
      wrap.appendChild(nameLine);
      wrap.appendChild(scoreLine);
      el.appendChild(wrap);
    });
  }

  function steal(zone) {
    const t = targets[zones.indexOf(zone)];
    if (!t || decided) return;
    decided = true;
    clearTimeout(decideTimeout);
    // สุ่มขโมย 25-50% ของคะแนนที่เป้าหมายมีตอนนี้ (ไม่มีวันขโมยเกินที่เขามีจริง กันคะแนนติดลบตั้งแต่ต้นทาง
    // อยู่แล้ว ไม่ต้องรอ Firestore rules ปฏิเสธ) อย่างน้อย 10 แต้มกันได้น้อยจนรู้สึกไม่คุ้มเสี่ยง
    const amount = Math.max(10, Math.round(t.bonusScore * (0.25 + Math.random() * 0.25)));
    corners[zone].classList.add("correct");
    onScore(amount);
    stealFrom(t.id, amount);
    setTimeout(() => {
      cleanup();
      onEnd();
    }, 700); // หน่วงนิดให้เห็น feedback สีเขียวก่อนตัดกลับคำถาม เหมือน pattern ตอบคำถามหลัก
  }

  ctx.setZoneHandler(({ zone }) => {
    if (decided || !zone || !targets[zones.indexOf(zone)]) {
      // ชี้โซนว่าง (ไม่มีเป้าหมายตรงนั้น) หรือหลุดมือ — เคลียร์ไฮไลต์ "กำลังชี้อยู่" ทิ้ง ไม่นับเป็นการค้าง
      if (currentZone) {
        corners[currentZone].classList.remove("active");
        currentZone = null;
      }
      return;
    }
    if (zone !== currentZone) {
      if (currentZone) corners[currentZone].classList.remove("active");
      currentZone = zone;
      corners[zone].classList.add("active");
      zoneEnterTs = performance.now();
    }
    if (performance.now() - zoneEnterTs >= HOLD_MS) steal(zone);
  });

  // tap fallback: แตะตรงคนที่อยากขโมยได้ทันที ไม่ต้องค้าง (เหมือนเกมอื่นทุกเกม)
  const tapHandlers = {};
  zones.forEach((zone) => {
    const handler = () => steal(zone);
    tapHandlers[zone] = handler;
    corners[zone].addEventListener("click", handler);
  });
  ctx.onCleanupExtra = () => {
    zones.forEach((zone) => corners[zone].removeEventListener("click", tapHandlers[zone]));
  };

  // โหลดรายชื่อเป้าหมายก่อนเริ่มนับเวลาตัดสินใจจริง กันเวลารอบไปเสียกับการโหลดข้อมูลเปล่าๆ
  fetchTargets()
    .then((list) => {
      if (decided) return; // เผื่อ cleanup ไปแล้วก่อนโหลดเสร็จ (เช่นเวลาหมดพอดี/เปลี่ยนโหมดกลางทาง)
      if (list.length === 0) {
        // ไม่มีใครให้ขโมยเลย (เล่นคนเดียว/ทุกคนยังไม่มีคะแนนโบนัสเลย) — จบแบบนุ่มนวล ไม่ตัดคะแนนใคร ให้
        // คะแนนความพยายามเล็กน้อยเหมือน Reach for Sky ตอนไม่มีใครทำสำเร็จ กันความรู้สึก "ได้ 0 เฉยๆ งงว่าทำไม"
        onScore(20);
        finish();
        return;
      }
      renderTargets(list);
      decideTimeout = setTimeout(finish, DECIDE_MS);
    })
    .catch((err) => {
      console.error("[bonus-engine] โหลดรายชื่อเป้าหมายขโมยโบนัสไม่สำเร็จ:", err);
      finish(); // โหลดพลาด (เช่นเน็ตหลุดจังหวะนั้นพอดี) จบเกมแบบนุ่มนวล ไม่ปล่อยให้ค้าง
    });
}

export const BONUS_RUNNERS = {
  "skibidi-dodge": runSkibidiDodge,
  "reach-sky": runReachForSky,
  "hand-bounce": runHandBounce,
  "hand-dance-follow": runHandDanceFollow,
  "brainrot-swat": runFishSwim,
  "steal-bonus": runStealBonus,
};
