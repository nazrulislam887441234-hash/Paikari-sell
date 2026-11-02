import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCIRWmozT0XcEXuXtQ6RDiDo6vtT1T9mU",
  authDomain: "paikarisell-ghotimarket.firebaseapp.com",
  projectId: "paikarisell-ghotimarket",
  storageBucket: "paikarisell-ghotimarket.firebasestorage.app",
  messagingSenderId: "464086432830",
  appId: "1:464086432830:web:a10fdd9884954e380e656f",
  measurementId: "G-E3HR2F9TC5"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);

export function showCustomError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerText = message;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 6000);
  }
}

export function translateFirebaseError(errorCode) {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'এই ইমেইলটি ইতিমধ্যে ব্যবহৃত হয়েছে।';
    case 'auth/invalid-email':
      return 'সঠিক ইমেইল ঠিকানা প্রদান করুন।';
    case 'auth/weak-password':
      return 'পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।';
    case 'auth/wrong-password':
      return 'প্রদানকৃত পাসওয়ার্ডটি ভুল।';
    case 'auth/user-not-found':
      return 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।';
    default:
      return 'একটি প্রযুক্তিগত ত্রুটি ঘটেছে। আবার চেষ্টা করুন।';
  }
}
