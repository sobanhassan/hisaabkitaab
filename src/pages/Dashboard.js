import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import "./Dashboard.css";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        navigate("/");
      } else {
        setUser(u);
      }
      setChecking(false);
    });
    return () => unsub();
  }, [navigate]);

  if (checking) {
    return (
      <div className="dash-screen">
        <div className="topbar">
          <div className="brand">Hisaab <span>Kitaab</span></div>
          <div className="pulse-dot" />
        </div>
        <div className="card skeleton">
          <div className="skeleton-avatar" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </div>
      </div>
    );
  }

  return (
    <div className="dash-screen">
      <div className="topbar">
        <div className="brand">Hisaab <span>Kitaab</span></div>
        <button
          className="ghost-btn"
          onClick={async () => {
            await signOut(auth);
            navigate("/");
          }}
        >
          Sign out
        </button>
      </div>

      <div className="card">
        <div className="profile">
          {user?.photoURL ? (
            <img className="avatar" src={user.photoURL} alt="avatar" />
          ) : (
            <div className="avatar fallback">
              {user?.displayName?.[0]?.toUpperCase() || "U"}
            </div>
          )}
          <div className="who">
            <h1>Welcome, <span className="accent">{user?.displayName || user?.email}</span></h1>
            {user?.email && <p className="muted">{user.email}</p>}
          </div>
        </div>

        {/* Pretty placeholders for what's coming next */}
        <div className="grid">
          <div className="stat">
            <div className="stat-label">This Month</div>
            <div className="stat-value">—</div>
          </div>
          <div className="stat">
            <div className="stat-label">Total Entries</div>
            <div className="stat-value">—</div>
          </div>
          <div className="stat">
            <div className="stat-label">Savings</div>
            <div className="stat-value">—</div>
          </div>
        </div>

        <div className="cta-row">
          <button className="primary-btn" disabled>+ Add Entry (soon)</button>
          <button className="secondary-btn" disabled>View Reports (soon)</button>
        </div>
      </div>

      <footer className="footnote">Made with ⚡ React + Firebase</footer>
    </div>
  );
}
