

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB0O_ZzeCl0QwHBv6zvyCI9spFUuCNE7vI",
  authDomain: "marketplace--muey.firebaseapp.com",
  projectId: "marketplace--muey",
  storageBucket: "marketplace--muey.firebasestorage.app",
  messagingSenderId: "901804341944",
  appId: "1:901804341944:web:5ac7421858c038c835924d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
