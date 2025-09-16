import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs, addDoc, doc, deleteDoc} from "firebase/firestore";
import "./Dashboard.css";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [friends, setFriends] = useState([]);
  const [newFriend, setNewFriend] = useState("");
  const navigate = useNavigate();

  // check auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/");
      else setUser(u);
    });
    return () => unsub();
  }, [navigate]);

  // load friends
  const loadFriends = async () => {
    if (!user) return;
    const snap = await getDocs(collection(db, "users", user.uid, "friends"));
    setFriends(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    if (user) loadFriends();
  }, [user]);

  // add friend
  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (!newFriend.trim()) return;
    await addDoc(collection(db, "users", user.uid, "friends"), {
      name: newFriend.trim(),
      balance: 0,
    });
    setNewFriend("");
    await loadFriends();
  };

  const handleDeleteFriend = async (friendId) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this friend and all their transactions?"
      )
    )
      return;

    // delete all transactions first
    const txns = await getDocs(
      collection(db, "users", user.uid, "friends", friendId, "transactions")
    );
    for (let t of txns.docs) {
      await deleteDoc(
        doc(db, "users", user.uid, "friends", friendId, "transactions", t.id)
      );
    }

    // delete the friend doc
    await deleteDoc(doc(db, "users", user.uid, "friends", friendId));

    loadFriends(); // refresh
  };

  if (!user) return null;

  return (
    <div className="dash-screen">
      <div className="topbar">
        <div className="brand">
          Hisaab <span>Kitaab</span>
        </div>
        <button className="ghost-btn" onClick={() => signOut(auth)}>
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
            <h1>
              Welcome,{" "}
              <span className="accent">{user?.displayName || user?.email}</span>
            </h1>
            {user?.email && <p className="muted">{user.email}</p>}
          </div>
        </div>

        {/* Add Friend form */}
        <form onSubmit={handleAddFriend} className="friend-form">
          <input
            type="text"
            placeholder="Add a new friend..."
            value={newFriend}
            onChange={(e) => setNewFriend(e.target.value)}
          />
          <button type="submit" className="primary-btn">
            Add
          </button>
        </form>

        {/* Friends list */}
        <div className="friends-list">
          {friends.length === 0 && (
            <p className="muted">No friends yet — add one above.</p>
          )}
          {friends.map((f) => (
            <div
              key={f.id}
              className="friend-row"
              onClick={() => navigate(`/friend/${f.id}`)}
            >
              <span className="friend-name">{f.name}</span>
              <span
                className={`friend-balance ${
                  Number(f.balance) >= 0 ? "positive" : "negative"
                }`}
              >
                {Number(f.balance) >= 0
                  ? `+$${Number(f.balance).toFixed(2)}`
                  : `-$${Math.abs(Number(f.balance)).toFixed(2)}`}
              </span>

              {/* stop event bubbling so row click doesn't trigger */}
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFriend(f.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <footer className="footnote">Made with ⚡ React + Firebase</footer>
    </div>
  );
}
