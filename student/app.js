import { startGestureDetection } from "../assets/js/gesture-detection.js";
import { nextBonusGame, BONUS_RUNNERS } from "../assets/js/bonus-engine.js";
import { db, doc, getDoc, setDoc, serverTimestamp } from "../assets/js/firebase-init.js";

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
const holdProgressBar = document.getElementById("hold-progress-bar");
const questionText = document.getElementById("question-text");
const timerBadge = document.getElementById("timer-badge");
const finalScoreEl = document.getElementById("final-score");
const finalSummaryEl = document.getElementById("final-summary");
const bonusBanner = document.getElementById("bonus-banner");
const bonusEmoji = document.getElementById("bonus-emoji");
const bonusTitle = document.getElementById("bonus-title");
const bonusSub = document.getElementById("bonus-sub");

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
let score = 0;
let bonusScore = 0;
let answeredCount = 0;
let answered = false;
let gameEndsAt = null;
let timerInterval = null;

// --- Bonus Challenge state ---
let mode = "quiz"; // "quiz" | "bonus"
let bonusZoneHandler = null; // ผูกโดย bonus-engine ผ่าน ctx.setZoneHandler
let answeredSinceBonus = 0;
let bonusThreshold = randomBonusThreshold();

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
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 640, height: 480 },
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
  answered = false;
  holdProgressBar.style.width = "0%";

  const questions = sessionData.questions;
  const q = questions[questionIndex % questions.length];
  questionText.textContent = q.text;
  corners.tl.textContent = q.options.tl;
  corners.tr.textContent = q.options.tr;
  corners.bl.textContent = q.options.bl;
  corners.br.textContent = q.options.br;
  quizStage.dataset.correctZone = q.correctZone;
}

function nextQuestion() {
  questionIndex += 1; // เมื่อครบชุดจะวนกลับไปข้อแรกอัตโนมัติด้วย modulo
  loadQuestion();
}

function showBonusToast(text) {
  const toast = document.createElement("div");
  toast.className = "bonus-toast";
  toast.textContent = text;
  quizStage.appendChild(toast);
  setTimeout(() => toast.remove(), 1400);
}

function triggerBonusChallenge() {
  mode = "bonus";
  clearRevealClasses();
  questionText.textContent = "";

  const game = nextBonusGame();
  bonusEmoji.textContent = game.emoji;
  bonusTitle.textContent = game.name;
  bonusSub.textContent = "ภารกิจพิเศษ! เตรียมตัว...";
  bonusBanner.style.display = "flex";

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
  }, 1800);
}

function submitAnswer(zone) {
  if (mode !== "quiz" || answered || !gameEndsAt) return;
  answered = true;
  answeredCount += 1;
  answeredSinceBonus += 1;

  const correctZone = quizStage.dataset.correctZone;
  const isCorrect = zone === correctZone;
  if (isCorrect) score += 100; // TODO: ให้คะแนนตามความเร็วในการตอบ เหมือน Kahoot

  Object.entries(corners).forEach(([key, el]) => {
    if (key === correctZone) el.classList.add("correct");
    else if (key === zone) el.classList.add("wrong");
  });

  saveProgress();

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

function onZoneUpdate({ zone, point, progress, confirmed }) {
  if (mode === "bonus") {
    bonusZoneHandler?.({ zone, point });
    return;
  }

  if (answered) return;

  highlightZone(zone);

  if (point) {
    handCursor.style.display = "block";
    handCursor.style.left = `${point.x * 100}%`;
    handCursor.style.top = `${point.y * 100}%`;
  } else {
    handCursor.style.display = "none";
  }

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

function endGame() {
  clearInterval(timerInterval);
  quizStage.style.display = "none";
  endScreen.style.display = "flex";
  finalScoreEl.textContent = score + bonusScore;
  finalSummaryEl.textContent = `ตอบไป ${answeredCount} ข้อ (คะแนนคำถาม ${score} + คะแนนโบนัส ${bonusScore})`;
  saveProgress({ status: "finished", finishedAt: serverTimestamp() });
  // TODO: เปิดปุ่ม "ดูเฉลยย้อนหลัง" ไปหน้า review ต่อจากตรงนี้
}

// --- Tap-to-answer fallback (กันกรณีกล้อง/แสงมีปัญหา) — mode guard กันชนกับ listener ของ bonus game ---
Object.entries(corners).forEach(([zone, el]) => {
  el.addEventListener("click", () => submitAnswer(zone));
});

startBtn.addEventListener("click", async () => {
  setupScreen.style.display = "none";
  quizStage.style.display = "block";

  if (mediaStream) {
    startGestureDetection(cameraFeed, onZoneUpdate, {
      onError: () => {
        setupStatus.textContent = "";
        showBonusToast("โหมดชี้มือใช้ไม่ได้ตอนนี้ — แตะจอตอบแทนได้เลย");
      },
    });
  }

  gameEndsAt = Date.now() + sessionData.durationMinutes * 60 * 1000;
  loadQuestion();
  tickTimer();
  timerInterval = setInterval(tickTimer, 250);
});

startBtn.disabled = true;
setupStatus.textContent = "กำลังโหลดห้อง...";
loadSession();
