import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { getPairId, getUserBalance } from "../sharedLedger";
import "./Dashboard.css";

export default function FriendsPage() {
  const [user, setUser] = useState(null);
  const [friends, setFriends] = useState([]);
  const [previousFriends, setPreviousFriends] = useState([]);
  const [tab, setTab] = useState("active");
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (signedInUser) => {
      if (!signedInUser) navigate("/", { replace: true });
      else setUser(signedInUser);
    });
    return unsubscribe;
  }, [navigate]);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    const [active, previous] = await Promise.all([
      getDocs(collection(db, "users", user.uid, "friends")),
      getDocs(collection(db, "users", user.uid, "previousFriends")),
    ]);
    const savedFriends = active.docs.map((friend) => ({ id: friend.id, ...friend.data() }));
    const friendsWithCurrentBalances = await Promise.all(savedFriends.map(async (friend) => {
      let balance = 0;
      let photoURL = friend.photoURL || null;
      try {
        const profile = await getDoc(doc(db, "users", friend.id));
        const profileData = profile.data() || {};
        photoURL = profileData.customPhotoURL || profileData.googlePhotoURL || photoURL;
      } catch {
        // A missing profile photo should not prevent the friend from being displayed.
      }
      try {
        const pair = await getDoc(doc(db, "sharedPairs", getPairId(user.uid, friend.id)));
        balance = pair.exists() ? getUserBalance(pair.data(), user.uid) : 0;
      } catch {
        // Older friendships can be missing a shared ledger.
      }
      return { ...friend, balance, photoURL };
    }));
    setFriends(friendsWithCurrentBalances);
    setPreviousFriends(previous.docs.map((friend) => ({ id: friend.id, ...friend.data() })));
  }, [user]);

  useEffect(() => { if (user) loadFriends(); }, [user, loadFriends]);

  const removeFriend = async (friend) => {
    if (!window.confirm(`Remove ${friend.name}? Their history will be kept under Previous friends.`)) return;
    const batch = writeBatch(db);
    batch.set(doc(db, "users", user.uid, "previousFriends", friend.id), {
      name: friend.name,
      username: friend.username || null,
      email: friend.email || null,
      finalBalance: Number(friend.balance) || 0,
      endedAt: serverTimestamp(),
    });
    batch.set(doc(db, "users", friend.id, "previousFriends", user.uid), {
      name: user.displayName || user.email || "Friend",
      email: user.email || null,
      finalBalance: -(Number(friend.balance) || 0),
      endedAt: serverTimestamp(),
    });
    batch.delete(doc(db, "users", user.uid, "friends", friend.id));
    batch.delete(doc(db, "users", friend.id, "friends", user.uid));
    await batch.commit();
    await loadFriends();
  };

  if (!user) return null;

  const getBalanceLabel = (balance) => {
    const amount = Number(balance) || 0;
    if (amount < 0) return `Owes you $${Math.abs(amount).toFixed(2)}`;
    if (amount > 0) return `You owe $${amount.toFixed(2)}`;
    return "Settled";
  };

  const getFinalBalanceLabel = (friend) => {
    const balance = Number(friend.finalBalance) || 0;
    if (balance < 0) return `Ended with ${friend.name} owing you $${Math.abs(balance).toFixed(2)}`;
    if (balance > 0) return `Ended with you owing $${balance.toFixed(2)}`;
    return "Ended with a settled balance";
  };

  return (
    <div className="dash-screen">
      <div className="page-card">
        <button className="ghost-btn" onClick={() => navigate("/dashboard")}>Back to dashboard</button>
        <h1>Friends</h1>
        <div className="tab-buttons">
          <button className={tab === "active" ? "active-tab" : ""} onClick={() => setTab("active")}>Active friends</button>
          <button className={tab === "previous" ? "active-tab" : ""} onClick={() => setTab("previous")}>Previous friends</button>
        </div>

        {tab === "active" && (
          <div className="requests-list">
            {friends.length === 0 ? <p className="muted">No active friends yet.</p> : friends.map((friend) => (
              <div className="request-row friend-list-row" key={friend.id}>
                <div className="friend-summary">
                  {friend.photoURL ? (
                    <img className="friend-avatar" src={friend.photoURL} alt={`${friend.name}'s profile`} />
                  ) : (
                    <div className="friend-avatar friend-avatar-fallback">{friend.name?.[0]?.toUpperCase() || "U"}</div>
                  )}
                  <div className="friend-summary-details">
                    <strong>{friend.name}</strong>
                    <span className="friend-inline-balance">{getBalanceLabel(friend.balance)}</span>
                  </div>
                </div>
                <button className="delete-btn" onClick={() => removeFriend(friend)}>Remove friend</button>
              </div>
            ))}
          </div>
        )}

        {tab === "previous" && (
          <div className="requests-list">
            {previousFriends.length === 0 ? <p className="muted">No previous friends yet.</p> : previousFriends.map((friend) => (
              <div className="request-row previous-friend" key={friend.id} onClick={() => navigate(`/previous-friend/${friend.id}`)}>
                <div><strong>{friend.name}</strong><span>{getFinalBalanceLabel(friend)}</span></div>
                <span>View history</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
