import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import "./FriendPage.css";

export default function FriendPage() {
  const { friendId } = useParams();
  const [user, setUser] = useState(null);
  const [friend, setFriend] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [whoPaid, setWhoPaid] = useState("me"); // me or friend
  const navigate = useNavigate();

  // check auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/");
      else setUser(u);
    });
    return () => unsub();
  }, [navigate]);

  const loadFriend = useCallback(async () => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "friends", friendId);
    const snap = await getDoc(ref);
    if (snap.exists()) setFriend({ id: snap.id, ...snap.data() });

    const q = query(
      collection(db, "users", user.uid, "friends", friendId, "transactions"),
      orderBy("createdAt", "desc")
    );
    const txnSnap = await getDocs(q);
    setTransactions(txnSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, [user, friendId]); // ✅ dependencies

  useEffect(() => {
    if (user) loadFriend();
  }, [user, loadFriend]); // ✅ add it here too

  // load friend + transactions
  // const loadFriend = async () => {
  //   if (!user) return;
  //   const ref = doc(db, "users", user.uid, "friends", friendId);
  //   const snap = await getDoc(ref);
  //   if (snap.exists()) setFriend({ id: snap.id, ...snap.data() });

  //   const q = query(
  //     collection(db, "users", user.uid, "friends", friendId, "transactions"),
  //     orderBy("createdAt", "desc")
  //   );
  //   const txnSnap = await getDocs(q);
  //   setTransactions(txnSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  // };

  // useEffect(() => {
  //   if (user) loadFriend();
  // }, [user]);

  // add new transaction
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!amount || !desc) return;

    const amt = parseFloat(amount);
    const direction = whoPaid === "me" ? "paid_for_friend" : "paid_by_friend";

    // save txn
    await addDoc(
      collection(db, "users", user.uid, "friends", friendId, "transactions"),
      {
        amount: amt,
        description: desc,
        direction,
        createdAt: serverTimestamp(), // Firestore timestamp
      }
    );

    // update balance
    const friendRef = doc(db, "users", user.uid, "friends", friendId);
    const newBalance =
      friend.balance + (direction === "paid_for_friend" ? -amt : amt);
    await updateDoc(friendRef, { balance: newBalance });

    setAmount("");
    setDesc("");
    loadFriend();
  };

  if (!friend) return <p>Loading...</p>;

  return (
    <div className="friend-screen">
      <div className="topbar">
        <button className="ghost-btn" onClick={() => navigate("/dashboard")}>
          ← Back
        </button>
        <div className="brand">
          Hisaab <span>Kitaab</span>
        </div>
      </div>

      <div className="card">
        <h1 className="friend-name">{friend.name}</h1>
        <h2
          className={`balance ${friend.balance >= 0 ? "positive" : "negative"}`}
        >
          Balance: {friend.balance >= 0 ? "+" : "-"}$
          {Math.abs(friend.balance).toFixed(2)}
        </h2>

        {/* Add Transaction Form */}
        <form onSubmit={handleAddTransaction} className="txn-form">
          <input
            type="number"
            step="0.01"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            type="text"
            placeholder="Description"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <select value={whoPaid} onChange={(e) => setWhoPaid(e.target.value)}>
            <option value="me">I paid</option>
            <option value="friend">Friend paid</option>
          </select>
          <button type="submit" className="primary-btn">
            Add
          </button>
        </form>

        {/* Transactions list */}
        <ul className="txn-list">
          {transactions.map((t) => {
            let d;
            if (t.createdAt?.toDate)
              d = t.createdAt.toDate(); // Firestore Timestamp
            else if (typeof t.createdAt === "number") d = new Date(t.createdAt); // old data

            const dateStr = d
              ? d.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "";

            return (
              <li key={t.id} className="txn-row">
                <div className="txn-left">
                  <span className="txn-desc">{t.description}</span>
                  {dateStr && <span className="txn-date">{dateStr}</span>}
                </div>
                <span
                  className={
                    t.direction === "paid_for_friend" ? "negative" : "positive"
                  }
                >
                  {t.direction === "paid_for_friend" ? "-" : "+"}$
                  {t.amount.toFixed(2)}
                </span>
              </li>
            );
          })}
          {transactions.length === 0 && (
            <p className="muted">No transactions yet — add one above.</p>
          )}
        </ul>
      </div>

      <footer className="footnote">Made with ⚡ React + Firebase</footer>
    </div>
  );
}
