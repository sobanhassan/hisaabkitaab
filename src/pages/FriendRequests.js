import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import "./Dashboard.css";

export default function FriendRequests() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [sent, setSent] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (signedInUser) => {
      if (!signedInUser) navigate("/", { replace: true });
      else setUser(signedInUser);
    });
    return unsubscribe;
  }, [navigate]);

  const loadRequests = useCallback(async () => {
    if (!user) return;
    const [receivedSnapshot, sentSnapshot] = await Promise.all([
      getDocs(query(collection(db, "friendRequests"), where("recipientId", "==", user.uid))),
      getDocs(query(collection(db, "friendRequests"), where("senderId", "==", user.uid))),
    ]);
    setIncoming(receivedSnapshot.docs.map((request) => ({ id: request.id, ...request.data() })).filter((request) => request.status === "pending"));
    setSent(sentSnapshot.docs.map((request) => ({ id: request.id, ...request.data() })).filter((request) => request.status === "pending"));
  }, [user]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const respondToRequest = async (request, accepted) => {
    setMessage("");
    try {
      const batch = writeBatch(db);
      if (accepted) {
        const friendRef = doc(db, "users", user.uid, "friends", request.senderId);
        const existingFriend = await getDoc(friendRef);
        const previousFriendRef = doc(db, "users", user.uid, "previousFriends", request.senderId);
        const previousFriend = request.reconnect ? await getDoc(previousFriendRef) : null;
        const restoredBalance = previousFriend?.exists()
          ? Number(previousFriend.data().finalBalance) || 0
          : 0;

        if (!existingFriend.exists()) {
          batch.set(friendRef, {
            name: request.senderName || request.senderEmail,
            email: request.senderEmail || null,
            balance: restoredBalance,
          });
        }
        if (request.reconnect) {
          batch.delete(previousFriendRef);
        }
      }
      batch.update(doc(db, "friendRequests", request.id), {
        status: accepted ? "accepted" : "declined",
        respondedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, "users", request.senderId, "notifications")), {
        message: accepted ? `${user.displayName || user.email || "A friend"} accepted your friend request.` : `${user.displayName || user.email || "A friend"} declined your friend request.`,
        type: "friend_request_response", actorId: user.uid, read: false, createdAt: serverTimestamp(),
      });
      await batch.commit();
      setMessage(accepted ? "Friend request accepted." : "Friend request declined.");
      await loadRequests();
    } catch { setMessage("We could not update that friend request. Please try again."); }
  };

  const cancelRequest = async (request) => {
    try {
      await deleteDoc(doc(db, "friendRequests", request.id));
      setMessage("Friend request cancelled.");
      await loadRequests();
    } catch { setMessage("We could not cancel that friend request. Please try again."); }
  };

  return (
    <div className="dash-screen"><div className="page-card">
      <button className="ghost-btn" onClick={() => navigate("/dashboard")}>Back to dashboard</button>
      <h1>Friend requests</h1>
      <h2 className="section-heading">Received</h2>
      {incoming.length === 0 && <p className="muted">You do not have any friend requests yet.</p>}
      <div className="requests-list">{incoming.map((request) => <div className="request-row" key={request.id}><div><strong>{request.senderName || request.senderEmail}</strong>{request.senderEmail && <span>{request.senderEmail}</span>}</div><div className="request-actions"><button className="primary-btn" onClick={() => respondToRequest(request, true)}>Accept</button><button className="secondary-btn" onClick={() => respondToRequest(request, false)}>Decline</button></div></div>)}</div>
      <h2 className="section-heading">Sent</h2>
      {sent.length === 0 && <p className="muted">No pending friend requests sent.</p>}
      <div className="requests-list">{sent.map((request) => <div className="request-row" key={request.id}><div><strong>{request.recipientName || request.recipientEmail}</strong>{request.recipientEmail && <span>{request.recipientEmail}</span>}</div><button className="secondary-btn" onClick={() => cancelRequest(request)}>Cancel</button></div>)}</div>
      {message && <p className="page-message">{message}</p>}
    </div></div>
  );
}
