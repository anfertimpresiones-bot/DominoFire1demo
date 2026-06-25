import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDXDkUS4iLj_NgWS9DGBX5WNzzGzh12vTs",
  authDomain: "dominofiredemo.firebaseapp.com",
  projectId: "dominofiredemo",
  storageBucket: "dominofiredemo.firebasestorage.app",
  messagingSenderId: "569780133532",
  appId: "1:569780133532:web:744c8bdca9ba513a109759",
  measurementId: "G-DCEVHQ5FWB"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
