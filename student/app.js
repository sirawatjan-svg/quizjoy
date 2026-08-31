import { startGestureDetection } from "../assets/js/gesture-detection.js";
// TODO: เมื่อมี Firebase config จริงแล้ว ค่อยเปิดใช้บรรทัดนี้และต่อ sync คำถาม/คะแนน
// import { db, doc, onSnapshot, setDoc, collection } from "../assets/js/firebase-init.js";

const params = new URLSearchParams(location.search);
const room = params.get("room") || sessionStorage.getItem("quizjoy_room");
const studentName = sessionStorage.getItem("quizjoy_name");
const studentId = sessionStorage.getItem("quizjoy_studentId");

if (!room || !studentName) {
  location.href = "../index.html";
}

const setupScreen = document.getElementById("setup-screen");
const quizStage = document.getElementById("quiz-stage");
const previewVideo = document.getElementById("preview-video");
const cameraFeed = document.getElementById("camera-feed");
const startBtn = document.getElementById("start-btn");
const setupStatus = document.getElementById("setup-status");
const handCursor = document.getElementById("hand-cursor");
const holdProgressBar = document.getElementById("hold-progress-bar");
const questionText = document.getElementById("question-text");

const corners = {
  tl: document.getElementById("answer-tl"),
  tr: document.getElementById("answer-tr"),
  bl: document.getElementById("answer-bl"),
  br: document.getElementById("answer-br"),
};

let mediaStream = null;
let currentQuestion = null; // TODO: มาจาก Firestore sync
let answered = false;

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

function revealAnswer(selectedZone, correctZone) {
  Object.entries(corners).forEach(([key, el]) => {
    if (key === correctZone) el.classList.add("correct");
    else if (key === selectedZone) el.classList.add("wrong");
  });
}

function onZoneUpdate({ zone, point, progress, confirmed }) {
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

function submitAnswer(zone) {
  if (answered || !currentQuestion) return;
  answered = true;

  // TODO: เขียนคำตอบลง Firestore sessions/{room}/results/{studentId}
  // แล้วรอ server-confirmed correctZone กลับมา (กันการโกงฝั่ง client)
  const correctZone = currentQuestion.correctZone; // ชั่วคราว ใช้ค่าจาก client เพื่อทดสอบ UI
  revealAnswer(zone, correctZone);
}

// --- Tap-to-answer fallback (กันกรณีกล้อง/แสงมีปัญหา) ---
Object.entries(corners).forEach(([zone, el]) => {
  el.addEventListener("click", () => submitAnswer(zone));
});

startBtn.addEventListener("click", async () => {
  setupScreen.style.display = "none";
  quizStage.style.display = "block";

  if (mediaStream) {
    startGestureDetection(cameraFeed, onZoneUpdate);
  }

  // TODO: subscribe คำถามจาก Firestore แทนของ mock นี้
  currentQuestion = {
    text: "ตัวอย่างคำถาม: เมืองหลวงเก่าของไทยก่อนกรุงเทพฯ คือเมืองใด?",
    options: { tl: "สุโขทัย", tr: "อยุธยา", bl: "เชียงใหม่", br: "นครปฐม" },
    correctZone: "tr",
  };
  questionText.textContent = currentQuestion.text;
  corners.tl.textContent = currentQuestion.options.tl;
  corners.tr.textContent = currentQuestion.options.tr;
  corners.bl.textContent = currentQuestion.options.bl;
  corners.br.textContent = currentQuestion.options.br;
});

setupCamera();
