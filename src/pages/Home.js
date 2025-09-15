import { useNavigate } from "react-router-dom";
import { auth } from "../firebaseClient";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "firebase/auth";
import { useEffect } from "react";
import "./Home.css"; // custom styles

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) navigate("/dashboard");
    });
    return () => unsub();
  }, [navigate]);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    navigate("/dashboard");
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
