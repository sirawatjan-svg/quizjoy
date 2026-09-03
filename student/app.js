import { startGestureDetection, resetHoldTimer, setCalibration } from "../assets/js/gesture-detection.js";
import { nextBonusGame, BONUS_RUNNERS } from "../assets/js/bonus-engine.js";
import { computeGameEndsAt, sortResultsByScore, findRank } from "../assets/js/session-sync.js";
import {
  db,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
} from "../assets/js/firebase-init.js";

const params = new URLSearchParams(location.search);
const room = params.get("room") || sessionStorage.getItem("quizjoy_room");
const studentName = sessionStorage.getItem("quizjoy_name");
const studentId = sessionStorage.getItem("quizjoy_studentId");

if (!room || !studentName) {
  location.href = "../index.html";
}

const setupScreen = document.getElementById("setup-screen");
const quizStage = document.getElementById("quiz-stage");
const endScreen = document.getElementById("end-screen");
const previewVideo = document.getElementById("preview-video");
const cameraFeed = document.getElementById("camera-feed");
const startBtn = document.getElementById("start-btn");
const setupStatus = document.getElementById("setup-status");
const handCursor = document.getElementById("hand-cursor");
const handCursor2 = document.getElementById("hand-cursor-2");
const holdProgressBar = document.getElementById("hold-progress-bar");
const questionText = document.getElementById("question-text");
const questionLabel = document.getElementById("question-label");
const questionBar = document.getElementById("question-bar");
const questionIntro = document.getElementById("question-intro");
const prepCountdown = document.getElementById("prep-countdown");
const timerBadge = document.getElementById("timer-badge");
const finalScoreEl = document.getElementById("final-score");
const finalSummaryEl = document.getElementById("final-summary");
const reviewToggleBtn = document.getElementById("review-toggle-btn");
const reviewPanel = document.getElementById("review-panel");
const reviewList = document.getElementById("review-list");
const bonusBanner = document.getElementById("bonus-banner");
const bonusEmoji = document.getElementById("bonus-emoji");
const bonusTitle = document.getElementById("bonus-title");
const bonusSub = document.getElementById("bonus-sub");
const perfBadge = document.getElementById("perf-badge");
const calibSkipBtn = document.getElementById("calib-skip-btn");
const lobbyOverlay = document.getElementById("lobby-overlay");
const lobbyCountEl = document.getElementById("lobby-count");
const lobbyPlayerListEl = document.getElementById("lobby-player-list");
const rankSummaryEl = document.getElementById("rank-summary");
const podiumPanelEl = document.getElementById("podium-panel");
const podiumListEl = document.getElementById("podium-list");

const corners = {
  tl: document.getElementById("answer-tl"),
  tr: document.getElementById("answer-tr"),
  bl: document.getElementById("answer-bl"),
  br: document.getElementById("answer-br"),
};

const resultsRef = doc(db, "sessions", room, "results", studentId);

let sessionData = null; // { quizTitle, durationMinutes, questions[] } จาก Firestore
let mediaStream = null;
let questionIndex = 0; // วนซ้ำด้วย modulo ความยาวชุดคำถาม ไม่หยุดแม้ตอบครบชุด
let currentQuestionId = null; // ใช้ผูกคำตอบกับคำถามตอนบันทึกลง answerHistory
let score = 0;
let bonusScore = 0;
let answeredCount = 0;
let answered = false;
let gameEndsAt = null;
let timerInterval = null;
let answerHistory = []; // { questionId, selectedZone, isCorrect, answeredAt } ทุกครั้งที่ตอบ ใช้ทำหน้าเฉลยย้อนหลัง

// --- ล็อบบี้ + เริ่มเกมพร้อมกันทั้งห้อง ---
// เดิม: แต่ละคนกด "เริ่มเล่น" แล้วนาฬิกาถอยหลังของตัวเองก็เริ่มทันที ต่างคนต่างเวลากันหมด ไม่มีจุดไหน
// ในระบบซิงค์เวลาข้ามเครื่องเลย ตอนนี้ทุกคนต้องรอครูกด "เริ่มเกมพร้อมกัน" ที่ host.html ก่อน (เขียน
// sessions/{room}.status="active" + startedAt=serverTimestamp() ครั้งเดียว) แล้วทุกเครื่องคำนวณ
// gameEndsAt จากค่า startedAt เดียวกันนั้น (ไม่ใช่ Date.now() ของตัวเอง) การันตีว่าจบเกมพร้อมกันจริง
let sessionStartUnsub = null;
let lobbyPlayersUnsub = null;

// --- Kahoot-style: โชว์คำถามอย่างเดียวก่อน แล้วค่อยเปิดตัวเลือกทีหลัง (จังหวะที่ 2) ---
// จังหวะที่ 0 (ใหม่ ตามฟีดแบ็กครู): คำถามโผล่กลางจอใหญ่ๆ ให้อ่านชัดๆ ก่อน แล้วค่อย "บิน" ย่อขึ้นไป
// อยู่แถบบน (question-bar) จากนั้นค่อยนับถอยหลัง 2-1 (ลดจากเดิม 3-2-1 เพราะช่วง intro ก็ให้เวลาอ่านไปแล้ว
// ส่วนหนึ่ง ไม่อยากให้รวมแล้วช้ากว่าเดิมมาก)
const QUESTION_INTRO_SHOW_MS = 2200; // ครูรายงานว่าโผล่มาแวบเดียวแล้วหายไป อ่านไม่ทัน (เดิม 800ms สั้นไป)
const QUESTION_INTRO_FLY_MS = 450;
const PREP_COUNTDOWN_START = 2;
const PREP_MS = QUESTION_INTRO_SHOW_MS + QUESTION_INTRO_FLY_MS + PREP_COUNTDOWN_START * 1000; // รวมเวลาตั้งแต่ขึ้นคำถามใหม่จนถึงเปิดให้ตอบได้จริง
let totalQuestionsShown = 0; // นับเพิ่มทุกครั้งที่ขึ้นคำถามใหม่ (ไม่ใช้ questionIndex ตรงๆ เพราะมันวนซ้ำ)
let prepTimeout = null;
let prepCountdownInterval = null;
let introFlyTimeout = null;
let introCountdownTimeout = null;

// --- Bonus Challenge state ---
let mode = "quiz"; // "quiz" | "bonus" | "calib"
let bonusZoneHandler = null; // ผูกโดย bonus-engine ผ่าน ctx.setZoneHandler
let answeredSinceBonus = 0;
let bonusThreshold = randomBonusThreshold();

// --- Calibration: ก่อนเริ่มเล่นจริง ให้ชี้ 4 มุมจริงคนละครั้ง แล้วใช้ตำแหน่งที่มือไปถึงจริงๆ มาขยับ
// จุดศูนย์กลางที่ใช้แบ่งโซน แทนที่จะเดาว่ากึ่งกลางจอ (0.5, 0.5) คือกึ่งกลางระหว่างมุมทั้งสี่เสมอ — จากข้อมูล
// ทดสอบจริง (backup-test-data/) พบว่าอันนี้เป็นสาเหตุหลักของ "ชี้บนแต่ตอบเป็นล่าง" บนมือถือบางเครื่อง
// สำคัญ: ตั้งใจ "ไม่" ใช้ zone/hold-timer ของ gesture-detection.js เดิมมาช่วยจับจังหวะตอน calibrate เพราะ
// ระบบ zone เดิมมีจุดศูนย์กลางที่ยังไม่ calibrate (นี่แหละคือของที่กำลังจะแก้) ถ้าใช้มันมาคุมเวลาค้าง จะเกิด
// วนซ้ำ (ชี้บนจริงแต่ zone สลับเป็น "ล่าง" ไปมา ทำให้ hold ไม่มีวันครบ) — ใช้นาฬิกาจับเวลานิ่งๆ ของตัวเองแทน
const CALIB_STEPS = ["tl", "tr", "bl", "br"];
const CALIB_LABELS = { tl: "มุมบนซ้าย", tr: "มุมบนขวา", bl: "มุมล่างซ้าย", br: "มุมล่างขวา" };
const CALIB_HOLD_MS = 1200;
let calibIndex = 0;
let calibPoints = {};
let calibCaptured = false;
let calibStepStartTs = 0;

function startCalibration() {
  mode = "calib";
  calibIndex = 0;
  calibPoints = {};
  prepCountdown.style.display = "none";
  calibSkipBtn.style.display = "block";
  Object.values(corners).forEach((el) => {
    el.classList.remove("prep-hidden", "reveal-in", "correct", "wrong");
  });
  showCalibStep();
}

function showCalibStep() {
  const zone = CALIB_STEPS[calibIndex];
  calibCaptured = false;
  calibStepStartTs = performance.now();
  questionLabel.textContent = `🎯 ปรับเทียบตำแหน่งมือ (${calibIndex + 1}/${CALIB_STEPS.length})`;
  questionText.textContent = `ชี้ไปที่ ${CALIB_LABELS[zone]} ของจอ แล้วค้างไว้นิ่งๆ`;
  holdProgressBar.style.width = "0%";
  Object.entries(corners).forEach(([key, el]) => {
    el.textContent = key === zone ? "👉 ชี้ตรงนี้" : "";
    el.classList.toggle("target", key === zone);
    el.classList.toggle("calib-dim", key !== zone);
  });
}

function finishCalibration() {
  calibSkipBtn.style.display = "none";
  const p = calibPoints;
  if (p.tl && p.tr && p.bl && p.br) {
    const leftX = (p.tl.x + p.bl.x) / 2;
    const rightX = (p.tr.x + p.br.x) / 2;
    const topY = (p.tl.y + p.tr.y) / 2;
    const bottomY = (p.bl.y + p.br.y) / 2;
    const cx = (leftX + rightX) / 2;
    const cy = (topY + bottomY) / 2;
    // กันค่าผิดปกติ (เช่น มือหลุดเฟรมกลางคันแล้วจับจุดสุดขอบมาเป็นค่า calibrate) ไม่ให้แย่กว่าค่าเริ่มต้น
    const safeCx = Number.isFinite(cx) && cx > 0.15 && cx < 0.85 ? cx : 0.5;
    const safeCy = Number.isFinite(cy) && cy > 0.15 && cy < 0.85 && bottomY > topY ? cy : 0.5;
    setCalibration(safeCx, safeCy);
  }
  Object.values(corners).forEach((el) => el.classList.remove("target", "calib-dim"));
  enterLobby();
}

function skipCalibration() {
  calibSkipBtn.style.display = "none";
  Object.values(corners).forEach((el) => el.classList.remove("target", "calib-dim"));
  enterLobby();
}

calibSkipBtn.addEventListener("click", skipCalibration);

// เข้าล็อบบี้ (หลังปรับเทียบ/ข้ามปรับเทียบเสร็จ หรือไม่มีกล้องเลยก็ต้องผ่านจุดนี้เหมือนกัน) — รอครูกด
// "เริ่มเกมพร้อมกัน" ที่ host.html ก่อนถึงจะเริ่มนับเวลาจริง เห็นรายชื่อเพื่อนที่เข้าห้องแล้วระหว่างรอ
function enterLobby() {
  mode = "lobby";
  timerBadge.textContent = "รอเริ่ม";
  lobbyOverlay.style.display = "flex";

  lobbyPlayersUnsub = onSnapshot(collection(db, "sessions", room, "players"), (snap) => {
    const players = snap.docs.map((d) => d.data());
    lobbyCountEl.textContent = players.length;
    lobbyPlayerListEl.innerHTML =
      players.length === 0
        ? '<li style="color:var(--muted)">ยังไม่มีใครเข้าห้อง</li>'
        : players.map((p) => `<li>🙋 ${p.name ?? "?"}</li>`).join("");
  });

  sessionStartUnsub = onSnapshot(doc(db, "sessions", room), (snap) => {
    const data = snap.data();
    if (!data || data.status !== "active" || !data.startedAt) return;

    sessionStartUnsub?.();
    sessionStartUnsub = null;
    lobbyPlayersUnsub?.();
    lobbyPlayersUnsub = null;
    lobbyOverlay.style.display = "none";

    // ใช้ startedAt ที่ commit จริงจากเซิร์ฟเวอร์ (ไม่ใช่ Date.now() ของเครื่องตัวเอง) คำนวณเวลาจบเกม
    // ให้ตรงกับค่าที่ทุกเครื่องในห้องคำนวณออกมาเหมือนกันทุกตัว ต่อให้นาฬิกาเครื่องใครไม่ตรงกันก็ตาม
    const endsAt = computeGameEndsAt(data.startedAt, sessionData.durationMinutes);

    if (endsAt === null || Date.now() >= endsAt) {
      // เข้าห้องช้าเกินไป (เช่น เพิ่งปรับเทียบเสร็จตอนหมดเวลาไปแล้ว) — ไม่มีเวลาให้เล่นแล้ว จบเกมทันที
      quizStage.style.display = "none";
      endScreen.style.display = "flex";
      finalScoreEl.textContent = "0";
      finalSummaryEl.textContent = "เกมจบไปแล้วก่อนที่คุณจะเริ่มทัน — รอรอบหน้าจากครูนะ";
      return;
    }

    beginQuiz(endsAt);
  });
}

function beginQuiz(sharedEndsAt) {
  mode = "quiz";
  gameEndsAt = sharedEndsAt;
  loadQuestion();
  tickTimer();
  timerInterval = setInterval(tickTimer, 250);
}

function randomBonusThreshold() {
  return 3 + Math.floor(Math.random() * 3); // สุ่ม 3-5 ข้อ
}

async function loadSession() {
  try {
    const snap = await getDoc(doc(db, "sessions", room));
    if (!snap.exists()) {
      setupStatus.textContent = `❌ ไม่พบห้อง "${room}" — ตรวจสอบรหัสห้องจากครูอีกครั้ง`;
      startBtn.disabled = true;
      return;
    }
    sessionData = snap.data();
    if (!sessionData.questions || sessionData.questions.length === 0) {
      setupStatus.textContent = "❌ ห้องนี้ยังไม่มีคำถาม — แจ้งครูให้ตรวจสอบ";
      startBtn.disabled = true;
      return;
    }

    // ลงทะเบียนเป็นผู้เล่นในห้องทันทีที่รู้ว่าห้องมีอยู่จริง (ไม่ต้องรอกดเริ่มเล่น)
    await setDoc(
      doc(db, "sessions", room, "players", studentId),
      { name: studentName, joinedAt: serverTimestamp() },
      { merge: true }
    );

    setupCamera();
  } catch (err) {
    setupStatus.textContent = `❌ โหลดห้องไม่สำเร็จ: ${err.message}`;
    startBtn.disabled = true;
  }
}

async function saveProgress(extra = {}) {
  try {
    await setDoc(
      resultsRef,
      {
        name: studentName,
        score,
        bonusScore,
        answeredCount,
        updatedAt: serverTimestamp(),
        ...extra,
      },
      { merge: true }
    );
  } catch (err) {
    console.error("[quizjoy] บันทึกคะแนนไม่สำเร็จ:", err);
    // ไม่ block gameplay ถ้าเน็ตสะดุดชั่วคราว — ลองใหม่รอบถัดไปเอง
  }
}

async function setupCamera() {
  try {
    // ลดความละเอียดที่ขอจากกล้องลง (เดิม 640x480 คงที่) — MediaPipe ย่อภาพลงไปประมวลผลภายในอยู่แล้ว
    // ความละเอียดสูงกว่านั้นไม่ได้ช่วยความแม่นยำของการจับมือเลย แต่เพิ่มภาระถอดรหัส/คัดลอกเฟรมทุกครั้ง
    // ก่อนถึง MediaPipe — ครูรายงาน FPS ต่ำต่อเนื่อง (~14fps) บนเครื่อง Android รุ่นกลาง-ล่าง จึงลองลด
    // ภาระตรงนี้ก่อน ใช้ ideal (ไม่ใช่ exact) ให้เครื่องที่รองรับความละเอียดต่ำกว่านี้อยู่แล้วไม่พังด้วย
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } },
      audio: false,
    });
    previewVideo.srcObject = mediaStream;
    cameraFeed.srcObject = mediaStream;
    setupStatus.textContent = "พร้อมแล้ว — กดเริ่มเล่นได้เลย";
    startBtn.disabled = false;
  } catch (err) {
    setupStatus.textContent =
      "❌ ไม่สามารถเปิดกล้องได้ (" + err.message + ") — ตรวจสอบสิทธิ์กล้องแล้วรีเฟรชอีกครั้ง";
    // Fallback: ยังให้เล่นต่อได้ด้วยการแตะจอ แม้ไม่มีกล้อง
    startBtn.disabled = false;
  }
}

function highlightZone(zone) {
  Object.entries(corners).forEach(([key, el]) => {
    el.classList.toggle("active", key === zone);
  });
}

function clearRevealClasses() {
  Object.values(corners).forEach((el) => el.classList.remove("correct", "wrong", "active", "target"));
}

function loadQuestion() {
  clearRevealClasses();
  clearTimeout(prepTimeout);
  clearInterval(prepCountdownInterval);
  clearTimeout(introFlyTimeout);
  clearTimeout(introCountdownTimeout);

  // จังหวะที่ 1 (แบบ Kahoot): โชว์คำถามอย่างเดียวก่อน ซ่อนตัวเลือกไว้ ยังตอบไม่ได้
  answered = true;
  holdProgressBar.style.width = "0%";
  // สำคัญ: บังคับให้ต้อง "ค้างชี้ใหม่" ครบเวลาก่อนถึงจะตอบข้อนี้ได้ ไม่งั้นเวลาค้างจากข้อก่อนหน้า
  // จะไหลข้ามมา ทำให้ระบบตอบให้เองทันทีที่ขึ้นคำถามใหม่ (บั๊กที่ครูรายงานว่า "ตอบให้เองก่อนจะชี้")
  resetHoldTimer();

  totalQuestionsShown += 1;
  questionLabel.textContent = `🎯 คำถามข้อที่ ${totalQuestionsShown}`;

  const questions = sessionData.questions;
  const q = questions[questionIndex % questions.length];
  currentQuestionId = q.id;
  questionText.textContent = q.text;
  corners.tl.textContent = q.options.tl;
  corners.tr.textContent = q.options.tr;
  corners.bl.textContent = q.options.bl;
  corners.br.textContent = q.options.br;
  quizStage.dataset.correctZone = q.correctZone;

  Object.values(corners).forEach((el) => {
    el.classList.remove("reveal-in");
    el.classList.add("prep-hidden");
  });

  // จังหวะที่ 0: คำถามโผล่กลางจอใหญ่ๆ ก่อน (อ่านง่ายชัดเจน) — question-bar จริงยังโปร่งใสอยู่
  prepCountdown.style.display = "none";
  questionIntro.textContent = q.text;
  questionIntro.classList.remove("intro-fly-up");
  // reflow บังคับก่อนใส่ class ใหม่ กัน browser รวม "remove แล้ว add" เป็นสเต็ปเดียวจนไม่เล่นแอนิเมชันซ้ำ
  // (สำคัญเวลาคำถามก่อนหน้าเพิ่งเล่น intro-fly-up ค้างอยู่แล้วขึ้นคำถามใหม่ทันที)
  void questionIntro.offsetWidth;
  questionIntro.classList.add("intro-show");
  questionBar.classList.add("bar-pending");

  // จังหวะที่ 0.5: คำถาม "บิน" ย่อขึ้นไปอยู่แถบบน พร้อมๆ กับที่แถบบนจริงเฟดเข้ามาแทนที่
  introFlyTimeout = setTimeout(() => {
    questionIntro.classList.remove("intro-show");
    questionIntro.classList.add("intro-fly-up");
    questionBar.classList.remove("bar-pending");
  }, QUESTION_INTRO_SHOW_MS);

  // จังหวะที่ 1: นับถอยหลังสั้นๆ ในแถบบน ก่อนเปิดตัวเลือก (เริ่มหลัง intro บินขึ้นเสร็จ)
  introCountdownTimeout = setTimeout(() => {
    questionIntro.classList.remove("intro-fly-up");
    let remaining = PREP_COUNTDOWN_START;
    prepCountdown.style.display = "block";
    prepCountdown.textContent = remaining;
    prepCountdownInterval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) prepCountdown.textContent = remaining;
      else clearInterval(prepCountdownInterval);
    }, 1000);
  }, QUESTION_INTRO_SHOW_MS + QUESTION_INTRO_FLY_MS);

  // จังหวะที่ 2: เปิดตัวเลือกให้ตอบได้จริง
  prepTimeout = setTimeout(() => {
    if (Date.now() >= gameEndsAt) return; // เวลาหมดพอดีระหว่างช่วงเตรียมตัว — ไม่ต้องเปิดตัวเลือกแล้ว
    prepCountdown.style.display = "none";
    Object.values(corners).forEach((el) => {
      el.classList.remove("prep-hidden");
      el.classList.add("reveal-in");
    });
    resetHoldTimer(); // รีเซ็ตอีกรอบตอนเปิดให้ตอบจริง กันเวลาระหว่างช่วงเตรียมตัวสะสมข้ามมา
    answered = false;
  }, PREP_MS);
}

function nextQuestion() {
  questionIndex += 1; // เมื่อครบชุดจะวนกลับไปข้อแรกอัตโนมัติด้วย modulo
  loadQuestion();
}

const CONFETTI_COLORS = ["#f59e0b", "#3b82f6", "#ec4899", "#10b981", "#a855f7", "#facc15"];

// เอฟเฟกต์ฉลองตอนตอบถูก — เม็ดสีพุ่งกระจายจากกลางจอ (เบามาก แค่ element DOM ธรรมดา + CSS animation
// ไม่ใช้ library ภายนอก) ลบตัวเองทิ้งอัตโนมัติหลังแอนิเมชันจบ กัน DOM รก
function triggerConfetti() {
  const count = 18;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "confetti-particle";
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const distance = 90 + Math.random() * 90;
    p.style.setProperty("--confetti-x", `${Math.cos(angle) * distance}px`);
    p.style.setProperty("--confetti-y", `${Math.sin(angle) * distance}px`);
    p.style.setProperty("--confetti-rot", `${Math.random() > 0.5 ? "" : "-"}${360 + Math.random() * 360}deg`);
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    quizStage.appendChild(p);
    setTimeout(() => p.remove(), 950);
  }
}

function showBonusToast(text) {
  const toast = document.createElement("div");
  toast.className = "bonus-toast";
  toast.textContent = text;
  quizStage.appendChild(toast);
  setTimeout(() => toast.remove(), 1400);
}

// ตัวอย่างท่าทางแบบเคลื่อนไหว โชว์ตอนนับถอยหลังก่อนเริ่มมินิเกม (แทน "คำอธิบายเฉยๆ" ที่ครูบอกว่าดูไม่ออก
// ว่าต้องทำท่าไหน) — เพิ่มเกมใหม่ในอนาคต: ใส่ entry ที่นี่พร้อม anim class ใน style.css
const BONUS_DEMOS = {
  "hand-bounce": {
    anim: "anim-updown",
    // บอกทางเลือกแตะจอไว้ด้วยเสมอ (ไม่ใช่แค่ตอนกล้องพังแล้วค่อยรู้) — เจอเคสจริงที่กล้องเปิดไม่ติด
    // นักเรียนแตะตอบเองแต่ไม่รู้ว่าต้อง "แตะสลับมุมบน-ล่าง" ถึงจะได้แต้ม เลยแตะมุมเดิมซ้ำๆ ได้ 0 คะแนน
    // เน้นย้ำว่าใช้ "มืออีกข้างที่ว่าง" ข้างเดียวพอ — ตามฟีดแบ็กครูว่านักเรียนถือมือถือด้วยมือข้างหนึ่งเสมอ
    // เหลือมือว่างจริงแค่ข้างเดียว ใช้ 2 มือพร้อมกันกลับทำให้แม่นน้อยลง (มือที่ถือโทรศัพท์ไปรบกวนสัญญาณ)
    caption: "ใช้แค่มืออีกข้างที่ว่าง (มือที่ถือมือถืออยู่ไม่ต้องขยับ) ยกขึ้น-ลงสลับไปเรื่อยๆ ตามจังหวะของตัวเอง! (กล้องมีปัญหา แตะลูกศร ⬆️/⬇️ สลับมุมกันก็ได้)",
    durationMs: 3200,
  },
};

function triggerBonusChallenge() {
  mode = "bonus";
  clearRevealClasses();
  clearTimeout(prepTimeout);
  clearInterval(prepCountdownInterval);
  clearTimeout(introFlyTimeout);
  clearTimeout(introCountdownTimeout);
  prepCountdown.style.display = "none";
  // โหมดบอนัสไม่ใช้จังหวะคำถามกลางจอ — เคลียร์ทิ้งเผื่อค้างจากคำถามก่อนหน้าพอดี (เช่นเวลาหมดกลาง intro)
  questionIntro.classList.remove("intro-show", "intro-fly-up");
  questionIntro.textContent = "";
  questionBar.classList.remove("bar-pending");
  questionText.textContent = "";
  questionLabel.textContent = "🎁 ภารกิจพิเศษ";

  const game = nextBonusGame();
  bonusEmoji.textContent = game.emoji;
  bonusTitle.textContent = game.name;
  bonusSub.textContent = "ภารกิจพิเศษ! เตรียมตัว...";
  bonusBanner.style.display = "flex";

  const demo = BONUS_DEMOS[game.id];
  const bonusDemo = document.getElementById("bonus-demo");
  const bonusDemoHand = document.getElementById("bonus-demo-hand");
  const bonusDemoCaption = document.getElementById("bonus-demo-caption");
  let bannerDurationMs = 1800;

  if (demo) {
    bonusDemoHand.className = `bonus-demo-hand ${demo.anim}`;
    bonusDemoCaption.textContent = demo.caption;
    bonusDemo.style.display = "block";
    bannerDurationMs = demo.durationMs;
  } else {
    bonusDemo.style.display = "none";
  }

  setTimeout(() => {
    bonusBanner.style.display = "none";
    if (Date.now() >= gameEndsAt) return; // เวลาหมดพอดีระหว่าง banner โชว์

    const runner = BONUS_RUNNERS[game.id];
    runner({
      corners,
      stage: quizStage,
      setZoneHandler: (fn) => {
        bonusZoneHandler = fn;
      },
      onScore: (delta) => {
        bonusScore += delta;
        showBonusToast(`+${delta}`);
        saveProgress();
      },
      onEnd: () => {
        mode = "quiz";
        bonusZoneHandler = null;
        if (Date.now() < gameEndsAt) nextQuestion();
      },
    });
  }, bannerDurationMs);
}

function submitAnswer(zone) {
  if (mode !== "quiz" || answered || !gameEndsAt) return;
  answered = true;
  answeredCount += 1;
  answeredSinceBonus += 1;

  const correctZone = quizStage.dataset.correctZone;
  const isCorrect = zone === correctZone;
  if (isCorrect) {
    score += 100; // TODO: ให้คะแนนตามความเร็วในการตอบ เหมือน Kahoot
    triggerConfetti();
  }

  Object.entries(corners).forEach(([key, el]) => {
    if (key === correctZone) el.classList.add("correct");
    else if (key === zone) el.classList.add("wrong");
  });

  const answerEntry = {
    questionId: currentQuestionId,
    selectedZone: zone,
    isCorrect,
    answeredAt: Date.now(), // เก็บเป็น number ธรรมดา — serverTimestamp() ใช้ในอาร์เรย์ไม่ได้
  };
  answerHistory.push(answerEntry);

  saveProgress({ answers: arrayUnion(answerEntry) });

  setTimeout(() => {
    if (Date.now() >= gameEndsAt) return;

    if (answeredSinceBonus >= bonusThreshold) {
      answeredSinceBonus = 0;
      bonusThreshold = randomBonusThreshold();
      triggerBonusChallenge();
    } else {
      nextQuestion();
    }
  }, 1200); // เผื่อเวลาให้เห็นเฉลยก่อนขึ้นข้อถัดไป/บอนัส
}

function onZoneUpdate(frame) {
  const { zone, point, progress, confirmed, hands } = frame;

  // อัปเดตจุดติดตามมือทุกครั้งเสมอ ไม่ว่าจะอยู่โหมดคำถามหรือโหมดบอนัส — เดิมโค้ดนี้ return ก่อนถึงบรรทัดนี้
  // ตอนอยู่โหมดบอนัส ทำให้ไม่เห็นจุดติดตามเลยระหว่างเล่นมินิเกม (ทั้งที่มินิเกมคือเรื่องขยับมือล้วนๆ)
  // ดูเหมือนระบบ "ไม่ทำงานคู่ขนานกัน" ทั้งที่จริงๆ กล้องยังจับมืออยู่ตลอด แค่ไม่ได้โชว์ให้เห็น
  //
  // โชว์ 2 จุดถ้าเห็น 2 มือจริง (จาก frame.hands) ตามฟีดแบ็กครู — เดิมโชว์แค่จุดเดียวจากมือที่ "ถูกเลือก"
  // ตัวเดียว (ตัวที่ยกสูงกว่า) ทำให้เห็นภาพว่าระบบไม่รู้จักอีกมือเลย ทั้งที่จริงๆ กล้องเห็นทั้งสองมือ
  const handList = hands ?? [];
  if (handList[0]?.point) {
    handCursor.style.display = "block";
    handCursor.style.left = `${handList[0].point.x * 100}%`;
    handCursor.style.top = `${handList[0].point.y * 100}%`;
  } else if (point) {
    // สำรอง: เผื่อกรณีไม่มี frame.hands (เช่นโค้ดเทสเก่า) ใช้จุดมือเดียวแบบเดิม
    handCursor.style.display = "block";
    handCursor.style.left = `${point.x * 100}%`;
    handCursor.style.top = `${point.y * 100}%`;
  } else {
    handCursor.style.display = "none";
  }
  if (handList[1]?.point) {
    handCursor2.style.display = "block";
    handCursor2.style.left = `${handList[1].point.x * 100}%`;
    handCursor2.style.top = `${handList[1].point.y * 100}%`;
  } else {
    handCursor2.style.display = "none";
  }

  if (mode === "calib") {
    if (point) {
      const elapsed = performance.now() - calibStepStartTs;
      holdProgressBar.style.width = `${Math.min(elapsed / CALIB_HOLD_MS, 1) * 100}%`;
      if (!calibCaptured && elapsed >= CALIB_HOLD_MS) {
        calibCaptured = true;
        calibPoints[CALIB_STEPS[calibIndex]] = { x: point.x, y: point.y };
        calibIndex += 1;
        if (calibIndex >= CALIB_STEPS.length) finishCalibration();
        else showCalibStep();
      }
    } else {
      // มือหลุดเฟรมระหว่าง calibrate — รีเซ็ตนาฬิกาขั้นตอนนี้ใหม่ ไม่งั้นจะนับเวลาที่มือไม่อยู่ไปด้วย
      calibStepStartTs = performance.now();
      holdProgressBar.style.width = "0%";
    }
    return;
  }

  if (mode === "lobby") {
    // แค่รอครูกดเริ่ม ยังไม่มีคำถามให้ตอบ — จุดติดตามมือด้านบนอัปเดตให้เห็นตามปกติ แต่ไม่ประมวลผลอะไรต่อ
    return;
  }

  if (mode === "bonus") {
    // บั๊กจริงที่เพิ่งเจอ: ตอนเพิ่มระบบติดตาม 2 มือ (frame.hands) ให้ bonus-engine.js ใช้ ลืมส่ง hands
    // มาที่นี่ด้วย! ส่งแต่ zone/point แบบเดิม ทำให้ runHandBounce() ตกไปใช้ทาง fallback (มือเดียว)
    // ตลอดมาโดยไม่รู้ตัว การแก้ "ใช้ 2 มือ" ที่ทำไปก่อนหน้านี้เลย "ไม่มีผลจริง" เลยสักครั้งตั้งแต่ขึ้นเว็บ
    // — อธิบายได้ว่าทำไมครูรายงานว่า 67 ยังจับไม่ติดเหมือนเดิมทุกประการหลังแก้ไปแล้ว
    bonusZoneHandler?.({ zone, point, hands });
    return;
  }

  if (answered) return;

  highlightZone(zone);
  holdProgressBar.style.width = `${(progress || 0) * 100}%`;

  if (confirmed && zone) {
    submitAnswer(zone);
  }
}

function formatTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function tickTimer() {
  const remaining = gameEndsAt - Date.now();
  timerBadge.textContent = formatTime(remaining);
  timerBadge.classList.toggle("low-time", remaining <= 30000);

  if (remaining <= 0) {
    endGame();
  }
}

const ZONE_LABELS = { tl: "A (บนซ้าย)", tr: "B (บนขวา)", bl: "C (ล่างซ้าย)", br: "D (ล่างขวา)" };

function renderReview() {
  if (answerHistory.length === 0) {
    reviewList.innerHTML = `<p style="color:var(--muted)">ยังไม่ได้ตอบคำถามข้อไหนเลย</p>`;
    return;
  }

  reviewList.innerHTML = answerHistory
    .map((a, i) => {
      const q = sessionData.questions.find((q) => q.id === a.questionId);
      if (!q) return ""; // กันเคส data ไม่ครบ (ไม่ควรเกิดขึ้นปกติ)
      return `
        <div class="review-item">
          <div class="q-num">ข้อที่ ${i + 1}</div>
          <div class="q-text">${q.text}</div>
          <div class="your-answer ${a.isCorrect ? "correct" : "wrong"}">
            คำตอบของคุณ: ${ZONE_LABELS[a.selectedZone]} — ${q.options[a.selectedZone]} ${a.isCorrect ? "✓" : "✗"}
          </div>
          ${
            a.isCorrect
              ? ""
              : `<div class="correct-answer">เฉลย: ${ZONE_LABELS[q.correctZone]} — ${q.options[q.correctZone]}</div>`
          }
          ${q.explanation ? `<div class="explanation">💡 ${q.explanation}</div>` : ""}
        </div>`;
    })
    .join("");
}

reviewToggleBtn.addEventListener("click", () => {
  const showing = reviewPanel.style.display === "block";
  if (showing) {
    reviewPanel.style.display = "none";
    reviewToggleBtn.textContent = "📖 ดูเฉลยย้อนหลัง";
  } else {
    renderReview();
    reviewPanel.style.display = "block";
    reviewToggleBtn.textContent = "🔼 ซ่อนเฉลย";
  }
});

function endGame() {
  clearInterval(timerInterval);
  clearTimeout(prepTimeout);
  clearInterval(prepCountdownInterval);
  clearTimeout(introFlyTimeout);
  clearTimeout(introCountdownTimeout);
  quizStage.style.display = "none";
  endScreen.style.display = "flex";
  finalScoreEl.textContent = score + bonusScore;
  finalSummaryEl.textContent = `ตอบไป ${answeredCount} ข้อ (คะแนนคำถาม ${score} + คะแนนโบนัส ${bonusScore})`;
  saveProgress({ status: "finished", finishedAt: serverTimestamp() });
  showRankAndPodium();
}

// อันดับตัวเอง + ประกาศ 3 อันดับแรกของห้องทั้งหมด (ไม่ใช่แค่ของตัวเอง) — ทุกคนคำนวณ gameEndsAt จาก
// startedAt ค่าเดียวกัน เกมของทุกคนเลยจบพร้อมๆ กันจริง (คลาดเคลื่อนกันแค่เศษเสี้ยววินาทีจาก network/เฟรม)
// พอถึงตอนนี้ผลคะแนนของเกือบทุกคนก็เขียนลง Firestore ครบแล้ว จึงดึงมาสรุปอันดับได้เลยโดยไม่ต้องรอสัญญาณ
// "ห้องจบแล้ว" จากครูเพิ่ม
async function showRankAndPodium() {
  try {
    const snap = await getDocs(collection(db, "sessions", room, "results"));
    const all = sortResultsByScore(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

    const myRank = findRank(all, studentId);
    if (myRank !== null) {
      rankSummaryEl.textContent = `🏅 อันดับที่ ${myRank} จาก ${all.length} คน`;
    }

    const top3 = all.slice(0, 3);
    if (top3.length > 0) {
      podiumListEl.innerHTML = top3
        .map(
          (r, i) =>
            `<li><span class="medal-badge medal-${i + 1}">${i + 1}</span> ${r.name ?? "?"} — ${(r.score ?? 0) + (r.bonusScore ?? 0)} คะแนน</li>`
        )
        .join("");
      podiumPanelEl.style.display = "block";
    }
  } catch (err) {
    console.error("[quizjoy] โหลดอันดับ/โพเดียมไม่สำเร็จ:", err);
    // ไม่ block การแสดงคะแนนของตัวเอง — แค่ไม่โชว์ส่วนอันดับ/โพเดียมถ้าโหลดพลาด
  }
}

// --- Tap-to-answer fallback (กันกรณีกล้อง/แสงมีปัญหา) — mode guard กันชนกับ listener ของ bonus game ---
Object.entries(corners).forEach(([zone, el]) => {
  el.addEventListener("click", () => submitAnswer(zone));
});

startBtn.addEventListener("click", async () => {
  setupScreen.style.display = "none";
  quizStage.style.display = "block";

  if (mediaStream) {
    // bodySkeleton: false — เอาโครงร่างกายออกตามฟีดแบ็กครู (ไม่จำเป็น + กินประมวลผลเปล่าๆ
    // ตัดโมเดล pose ตัวที่สองออกไปเลย ช่วยให้เหลือ CPU/GPU ให้ hand-tracking แม่นและลื่นขึ้นด้วย)
    startGestureDetection(cameraFeed, onZoneUpdate, {
      bodySkeleton: false,
      onPerf: ({ fps }) => {
        perfBadge.textContent = `${fps} fps`;
      },
      onError: () => {
        setupStatus.textContent = "";
        showBonusToast("โหมดชี้มือใช้ไม่ได้ตอนนี้ — แตะจอตอบแทนได้เลย");
      },
    });
    // มีกล้อง -> ให้ calibrate ก่อน (ไม่งั้นเวลาเล่นจะเสียไปกับขั้นตอนปรับเทียบ) แล้วค่อยเข้าล็อบบี้รอครู
    startCalibration();
  } else {
    // ไม่มีกล้อง (ขอสิทธิ์ไม่สำเร็จ) — ไม่มี gesture ให้ calibrate แต่ก็ยังต้องรอครูกดเริ่มเหมือนกัน
    // (ตอบด้วยการแตะจอแทนได้ แต่ต้องเริ่มนาฬิกาพร้อมทั้งห้องเหมือนกันทุกคน)
    enterLobby();
  }
});

startBtn.disabled = true;
setupStatus.textContent = "กำลังโหลดห้อง...";
loadSession();
