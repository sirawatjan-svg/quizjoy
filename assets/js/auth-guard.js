// auth-guard.js
// ใช้ในทุกหน้าครู (teacher/*.html ยกเว้น login.html เอง) — เช็คว่า login แล้วหรือยัง
// ถ้ายัง เด้งไปหน้า login.html ทันที ถ้า login แล้วเรียก onReady(user) กลับไป
//
// หมายเหตุ: การป้องกันนี้เป็นแค่ฝั่ง client (UX เฉยๆ) ความปลอดภัยจริงอยู่ที่ Firestore Security Rules
// (ดู firestore.rules ที่ root ของ repo) ที่บล็อกการอ่าน/เขียนถ้าไม่ login อยู่แล้วไม่ว่า client จะพยายามข้ามยังไง

import { auth, onAuthStateChanged, signOut } from "./firebase-init.js";

export function requireAuth(onReady) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      location.href = "login.html";
      return;
    }
    onReady(user);
  });
}

export function wireLogoutButton(buttonEl) {
  buttonEl?.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "login.html";
  });
}
