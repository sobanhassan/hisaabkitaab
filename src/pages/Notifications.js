import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import "./Dashboard.css";

export default function Notifications() {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(
    () =>
      onAuthStateChanged(auth, (signedInUser) => {
        if (!signedInUser) navigate("/", { replace: true });
        else setUser(signedInUser);
      }),
    [navigate],
  );

  useEffect(() => {
    if (!user) return undefined;

    return onSnapshot(
      collection(db, "users", user.uid, "notifications"),
      async (snapshot) => {
        const items = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort(
            (first, second) =>
              (second.createdAt?.toMillis?.() || 0) -
              (first.createdAt?.toMillis?.() || 0),
          );
        setNotifications(items);
        await Promise.all(
          items
            .filter((item) => !item.read)
            .map((item) =>
              updateDoc(doc(db, "users", user.uid, "notifications", item.id), {
                read: true,
              }),
            ),
        );
      },
    );
  }, [user]);

  const clearNotifications = async () => {
    try {
      await Promise.all(
        notifications.map((notification) =>
          deleteDoc(
            doc(db, "users", user.uid, "notifications", notification.id),
          ),
        ),
      );
    } catch {
      window.alert("We could not clear the notifications. Please try again.");
    }
  };

  return (
    <div className="dash-screen">
      <div className="page-card">
        <button className="ghost-btn" onClick={() => navigate("/dashboard")}>
          Back to dashboard
        </button>
        <div className="page-heading">
          <h1>Notifications</h1>
          {notifications.length > 0 && (
            <button className="secondary-btn" onClick={clearNotifications}>
              Clear notifications
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="muted">You have no notifications.</p>
        ) : (
          <div className="requests-list">
            {notifications.map((item) => (
              <div className="request-row" key={item.id}>
                <span>{item.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
