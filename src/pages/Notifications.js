import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";
import "./Dashboard.css";

export default function Notifications() {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const snapshot = await getDocs(collection(db, "users", user.uid, "notifications"));
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    setNotifications(items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
    await Promise.all(items
      .filter((item) => !item.read)
      .map((item) => updateDoc(doc(db, "users", user.uid, "notifications", item.id), { read: true })));
  }, [user]);

  useEffect(() => onAuthStateChanged(auth, (signedInUser) => {
    if (!signedInUser) navigate("/", { replace: true });
    else setUser(signedInUser);
  }), [navigate]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const clearNotifications = async () => {
    try {
      await Promise.all(notifications.map((notification) =>
        deleteDoc(doc(db, "users", user.uid, "notifications", notification.id))));
      await loadNotifications();
    } catch {
      window.alert("We could not clear the notifications. Please try again.");
    }
  };

  return (
    <div className="dash-screen">
      <div className="page-card">
        <button className="ghost-btn" onClick={() => navigate("/dashboard")}>Back to dashboard</button>
        <div className="page-heading">
          <h1>Notifications</h1>
          {notifications.length > 0 && <button className="secondary-btn" onClick={clearNotifications}>Clear notifications</button>}
        </div>
        {notifications.length === 0 ? (
          <p className="muted">You have no notifications.</p>
        ) : (
          <div className="requests-list">
            {notifications.map((item) => <div className="request-row" key={item.id}><span>{item.message}</span></div>)}
          </div>
        )}
      </div>
    </div>
  );
}
