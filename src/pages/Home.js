import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect } from "react";
import "./Home.css"; // custom styles

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      const profile = await getDoc(doc(db, "users", u.uid));
      navigate(profile.data()?.username ? "/dashboard" : "/create-username");
    });
    return () => unsub();
  }, [navigate]);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const profile = await getDoc(doc(db, "users", result.user.uid));
    navigate(profile.data()?.username ? "/dashboard" : "/create-username");
  };

  return (
    <div className="home-container">
      <div className="card">
        <h1>
          Welcome to <span className="highlight">Hisaab Kitaab</span>
        </h1>
        <p>Manage your expenses effortlessly. Sign in to get started!</p>
        <button onClick={signIn}>Sign in with Google</button>
      </div>
      <footer>Built with 💙 React + Firebase</footer>
    </div>
  );
}
