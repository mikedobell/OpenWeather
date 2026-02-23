import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Get these from Firebase Console → Project Settings → Your apps → (web app)
// Add them to a local .env file as VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: 'openweather-826fc.firebaseapp.com',
  projectId: 'openweather-826fc',
  storageBucket: 'openweather-826fc.appspot.com',
  messagingSenderId: '499606156061',
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
