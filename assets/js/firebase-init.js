// ใช้ Firebase modular SDK ผ่าน CDN (ไม่ต้องมี build step ใช้กับ GitHub Pages ได้ตรงๆ)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
};
