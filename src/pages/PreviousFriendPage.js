import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { formatTransactionDate, getPairId } from "../sharedLedger";
import "./FriendPage.css";

export default function PreviousFriendPage() {
  const { friendId } = useParams();
  const [user, setUser] = useState(null);
  const [friend, setFriend] = useState(null);
  const [transactions, setTransactions] = useState([]);
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
    if (!user) return;
    const load = async () => {
      const friendSnapshot = await getDoc(
        doc(db, "users", user.uid, "previousFriends", friendId),
      );
      setFriend(friendSnapshot.data() || null);
      try {
        const transactionSnapshot = await getDocs(
          query(
            collection(
              db,
              "sharedPairs",
              getPairId(user.uid, friendId),
              "transactions",
            ),
            orderBy("createdAt", "desc"),
          ),
        );
        setTransactions(
          transactionSnapshot.docs.map((transaction) => ({
            id: transaction.id,
            ...transaction.data(),
          })),
        );
      } catch {
        setTransactions([]);
      }
    };
    load();
  }, [friendId, user]);

  if (!friend) return null;

  const finalBalance = Number(friend.finalBalance) || 0;
  return (
    <div className="friend-screen">
      <div className="topbar">
        <button className="ghost-btn" onClick={() => navigate("/friends")}>
          Back to friends
        </button>
        <div className="brand">
          Hisaab <span>Kitaab</span>
        </div>
      </div>
      <div className="card">
        <h1 className="friend-name">{friend.name}</h1>
        <h2 className="balance">
          Final balance:{" "}
          {finalBalance < 0
            ? `${friend.name} owed you $${Math.abs(finalBalance).toFixed(2)}`
            : finalBalance > 0
              ? `You owed $${finalBalance.toFixed(2)}`
              : "Settled"}
        </h2>
        <h3>Transaction history</h3>
        <ul className="txn-list">
          {transactions.length === 0 ? (
            <p className="muted">No transactions recorded.</p>
          ) : (
            transactions.map((transaction) => {
              const isDeleted = transaction.status === "deleted";
              const addedByMe =
                (transaction.createdById || transaction.paidById) === user.uid;
              return (
                <li
                  className={`txn-row ${isDeleted ? "deleted-transaction" : ""}`}
                  key={transaction.id}
                >
                  <div className="txn-left">
                    <span className="txn-desc">{transaction.description}</span>
                    <span className="txn-date">
                      {transaction.type === "settlement"
                        ? "Settlement"
                        : `Added by ${addedByMe ? "you" : friend.name}`}{" "}
                      · {formatTransactionDate(transaction.createdAt)}
                    </span>
                  </div>
                  {isDeleted ? (
                    <>
                      <span className="muted">
                        ${Number(transaction.amount).toFixed(2)}
                      </span>
                      <span className="muted">Deleted by agreement</span>
                    </>
                  ) : transaction.type === "settlement" ? (
                    <span className="muted">Settled</span>
                  ) : (
                    <span
                      className={
                        transaction.paidById === user.uid
                          ? "positive"
                          : "negative"
                      }
                    >
                      {transaction.paidById === user.uid
                        ? `You paid $${Number(transaction.amount).toFixed(2)}`
                        : `${friend.name} paid $${Number(transaction.amount).toFixed(2)}`}
                    </span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
