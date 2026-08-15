import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import "./Dashboard.css";

const lookupKey = (value) => encodeURIComponent(value);

export default function AddFriend() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (signedInUser) => {
      if (!signedInUser) navigate("/", { replace: true });
      else setUser(signedInUser);
    });
    return unsubscribe;
  }, [navigate]);

  const searchForUser = async (event) => {
    event.preventDefault();
    const term = searchTerm.trim();
    if (!term) return;

    setSearching(true);
    setResult(null);
    setMessage("");
    setRequestPending(false);

    try {
      let lookup = await getDoc(doc(db, "usernames", lookupKey(term)));
      if (!lookup.exists()) {
        lookup = await getDoc(doc(db, "emails", lookupKey(term.toLowerCase())));
      }

      if (!lookup.exists()) {
        setMessage("No user was found with that email or username.");
        return;
      }

      if (lookup.data().uid === user.uid) {
        setMessage("That is your own account.");
        return;
      }

      const profile = await getDoc(doc(db, "users", lookup.data().uid));
      if (!profile.exists()) {
        setMessage("This user is not available right now.");
        return;
      }

      const foundUser = { uid: lookup.data().uid, ...profile.data() };
      const sentRequests = await getDocs(query(
        collection(db, "friendRequests"),
        where("senderId", "==", user.uid)
      ));
      setRequestPending(sentRequests.docs.some((request) => {
        const data = request.data();
        return data.recipientId === foundUser.uid && data.status === "pending";
      }));
      setResult(foundUser);
    } catch {
      setMessage("We could not complete that search. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const addFriend = async () => {
    if (!result || !user) return;
    setSending(true);
    setMessage("");

    try {
      const friendRef = doc(db, "users", user.uid, "friends", result.uid);
      const existingFriend = await getDoc(friendRef);
      if (existingFriend.exists()) {
        setMessage("This user is already in your friends list.");
        return;
      }

      const previousFriendRef = doc(db, "users", user.uid, "previousFriends", result.uid);
      const previousFriend = await getDoc(previousFriendRef);
      const isReconnecting = previousFriend.exists();
      const requestRef = isReconnecting
        ? doc(collection(db, "friendRequests"))
        : doc(db, "friendRequests", `${user.uid}_${result.uid}`);
      const batch = writeBatch(db);
      batch.set(requestRef, {
        senderId: user.uid,
        senderName: user.displayName || user.email || "User",
        senderEmail: user.email || null,
        recipientId: result.uid,
        recipientName: result.displayName || result.username || result.email,
        recipientUsername: result.username || null,
        recipientEmail: result.email || null,
        reconnect: isReconnecting,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, "users", result.uid, "notifications")), {
        message: `${user.displayName || user.email || "Someone"} sent you a friend request.`,
        type: "friend_request",
        actorId: user.uid,
        read: false,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setRequestPending(true);
      setMessage(`Friend request sent to ${result.displayName || result.username || result.email}.`);
    } catch {
      setMessage("We could not send that request. It may already exist, or you can try again.");
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  return (
    <div className="dash-screen">
      <div className="page-card">
        <button className="ghost-btn" onClick={() => navigate("/dashboard")}>Back to dashboard</button>
        <h1>Add friend</h1>
        <p className="muted">Search by an exact username or email address.</p>

        <form className="search-form" onSubmit={searchForUser}>
          <input
            aria-label="Username or email"
            placeholder="Username or email"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <button className="primary-btn" type="submit" disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </button>
        </form>

        {result && (
          <div className="search-result">
            <div>
              <strong>{result.displayName || result.username || result.email}</strong>
              {result.username && <span>@{result.username}</span>}
              {result.email && <span>{result.email}</span>}
            </div>
            <button className="primary-btn" onClick={addFriend} disabled={sending || requestPending}>
              {sending ? "Sending..." : requestPending ? "Friend request sent" : "Send friend request"}
            </button>
          </div>
        )}
        {message && <p className="page-message">{message}</p>}
      </div>
    </div>
  );
}
