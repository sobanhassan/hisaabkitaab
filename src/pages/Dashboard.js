import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  getDoc,
  onSnapshot,
  setDoc,
  query,
  where,
} from "firebase/firestore";
import { getPairId, getUserBalance } from "../sharedLedger";
import "./Dashboard.css";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState("");
  const [friends, setFriends] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [leavingRecentTransactions, setLeavingRecentTransactions] = useState(
    [],
  );
  const [friendSearch, setFriendSearch] = useState("");
  const [friendSort, setFriendSort] = useState("name");
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const friendIdsKey = friends
    .map((friend) => friend.id)
    .sort()
    .join("|");
  const recentTransactionNodes = useRef(new Map());
  const recentTransactionPositions = useRef(new Map());
  const previousRecentTransactions = useRef([]);

  // check auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate("/");
        return;
      }

      const profile = await getDoc(doc(db, "users", u.uid));
      if (!profile.data()?.username) {
        navigate("/create-username", { replace: true });
        return;
      }

      setUsername(profile.data().username);
      setUser(u);

      try {
        await setDoc(
          doc(db, "users", u.uid),
          {
            displayName: u.displayName || u.email || null,
            googlePhotoURL: profile.data()?.customPhotoURL
              ? profile.data()?.googlePhotoURL || null
              : u.photoURL || profile.data()?.googlePhotoURL || null,
          },
          { merge: true },
        );

        if (u.email) {
          const emailRef = doc(db, "emails", encodeURIComponent(u.email));
          const emailIndex = await getDoc(emailRef);
          if (!emailIndex.exists()) {
            await setDoc(emailRef, { uid: u.uid, email: u.email });
          }
        }
      } catch {
        // The dashboard remains usable if the directory update is temporarily unavailable.
      }
    });
    return () => unsub();
  }, [navigate]);

  // load friends
  const loadFriends = useCallback(async () => {
    if (!user) return;
    const [snap, previousFriendsSnapshot] = await Promise.all([
      getDocs(collection(db, "users", user.uid, "friends")),
      getDocs(collection(db, "users", user.uid, "previousFriends")),
    ]);
    const savedFriends = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const savedFriendIds = new Set(savedFriends.map((friend) => friend.id));
    const archivedFriends = new Map(
      previousFriendsSnapshot.docs.map((friend) => [friend.id, friend.data()]),
    );
    const sentRequests = await getDocs(
      query(
        collection(db, "friendRequests"),
        where("senderId", "==", user.uid),
      ),
    );
    const acceptedFriends = sentRequests.docs
      .map((request) => request.data())
      .map((request) => {
        const archivedFriend = archivedFriends.get(request.recipientId);
        const archiveEndedAt = archivedFriend?.endedAt?.toMillis?.() || 0;
        const requestAcceptedAt = request.respondedAt?.toMillis?.() || 0;
        const shouldRestoreArchivedFriend = Boolean(
          request.reconnect &&
            archivedFriend &&
            archiveEndedAt < requestAcceptedAt,
        );
        return { ...request, archivedFriend, shouldRestoreArchivedFriend };
      })
      .filter(
        (request) =>
          request.status === "accepted" &&
          !savedFriendIds.has(request.recipientId) &&
          (!request.archivedFriend || request.shouldRestoreArchivedFriend),
      )
      .map((request) => ({
        ...request,
        restoredBalance: request.shouldRestoreArchivedFriend
          ? Number(request.archivedFriend.finalBalance) || 0
          : 0,
      }));

    await Promise.all(
      acceptedFriends.map((request) =>
        setDoc(doc(db, "users", user.uid, "friends", request.recipientId), {
          name:
            request.recipientName ||
            request.recipientUsername ||
            request.recipientEmail,
          username: request.recipientUsername || null,
          email: request.recipientEmail || null,
          balance: request.restoredBalance,
        }),
      ),
    );
    await Promise.all(
      acceptedFriends
        .filter((request) => request.shouldRestoreArchivedFriend)
        .map((request) =>
          deleteDoc(
            doc(db, "users", user.uid, "previousFriends", request.recipientId),
          ),
        ),
    );

    const allFriends = [
      ...savedFriends,
      ...acceptedFriends.map((request) => ({
        id: request.recipientId,
        name:
          request.recipientName ||
          request.recipientUsername ||
          request.recipientEmail,
        username: request.recipientUsername || null,
        email: request.recipientEmail || null,
        balance: request.restoredBalance,
      })),
    ];
    const ledgerFriends = await Promise.all(
      allFriends.map(async (friend) => {
        try {
          const pair = await getDoc(
            doc(db, "sharedPairs", getPairId(user.uid, friend.id)),
          );
          return pair.exists()
            ? {
                ...friend,
                balance: getUserBalance(pair.data(), user.uid),
                hasLedger: true,
              }
            : { ...friend, balance: 0, hasLedger: false };
        } catch {
          // Older friendships do not have a shared ledger until their friend page is opened.
          return { ...friend, balance: 0, hasLedger: false };
        }
      }),
    );
    setFriends(ledgerFriends);

    const transactionsByFriend = await Promise.all(
      ledgerFriends.map(async (friend) => {
        if (!friend.hasLedger) return [];
        try {
          const transactions = await getDocs(
            collection(
              db,
              "sharedPairs",
              getPairId(user.uid, friend.id),
              "transactions",
            ),
          );
          return transactions.docs.map((transaction) => ({
            id: transaction.id,
            friendName: friend.name,
            ...transaction.data(),
          }));
        } catch {
          return [];
        }
      }),
    );
    setRecentTransactions(
      transactionsByFriend
        .flat()
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
        )
        .slice(0, 5),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    const unsubscribeFriends = onSnapshot(
      collection(db, "users", user.uid, "friends"),
      loadFriends,
    );
    const unsubscribePreviousFriends = onSnapshot(
      collection(db, "users", user.uid, "previousFriends"),
      loadFriends,
    );

    return () => {
      unsubscribeFriends();
      unsubscribePreviousFriends();
    };
  }, [user, loadFriends]);

  useEffect(() => {
    if (!user || !friendIdsKey) return undefined;

    const unsubscribe = friendIdsKey
      .split("|")
      .map((friendId) =>
        onSnapshot(
          collection(
            db,
            "sharedPairs",
            getPairId(user.uid, friendId),
            "transactions",
          ),
          loadFriends,
        ),
      );

    return () => unsubscribe.forEach((stopListening) => stopListening());
  }, [friendIdsKey, loadFriends, user]);

  useLayoutEffect(() => {
    const nextPositions = new Map();

    recentTransactions.forEach((transaction) => {
      const key = `${transaction.friendName}-${transaction.id}`;
      const node = recentTransactionNodes.current.get(key);
      if (!node) return;

      const nextTop = node.getBoundingClientRect().top;
      const previousTop = recentTransactionPositions.current.get(key);
      nextPositions.set(key, nextTop);
      if (previousTop === undefined || previousTop === nextTop) return;

      node.style.transition = "none";
      node.style.transform = `translateY(${previousTop - nextTop}px)`;
      requestAnimationFrame(() => {
        node.style.transition =
          "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)";
        node.style.transform = "translateY(0)";
      });
    });

    recentTransactionPositions.current = nextPositions;
  }, [recentTransactions]);

  useEffect(() => {
    const currentIds = new Set(
      recentTransactions.map((transaction) => transaction.id),
    );
    const removedTransactions = previousRecentTransactions.current.filter(
      (transaction) => !currentIds.has(transaction.id),
    );
    previousRecentTransactions.current = recentTransactions;
    if (removedTransactions.length === 0) return undefined;

    setLeavingRecentTransactions((current) => [
      ...current,
      ...removedTransactions.filter(
        (transaction) => !current.some((item) => item.id === transaction.id),
      ),
    ]);
    const timeout = window.setTimeout(() => {
      setLeavingRecentTransactions((current) =>
        current.filter(
          (transaction) =>
            !removedTransactions.some((item) => item.id === transaction.id),
        ),
      );
    }, 420);

    return () => window.clearTimeout(timeout);
  }, [recentTransactions]);

  useEffect(() => {
    if (!user) return undefined;

    return onSnapshot(
      query(
        collection(db, "sharedPairs"),
        where("members", "array-contains", user.uid),
      ),
      loadFriends,
    );
  }, [user, loadFriends]);

  useEffect(() => {
    if (!user) return undefined;

    return onSnapshot(
      collection(db, "users", user.uid, "notifications"),
      (notifications) => {
        setUnreadNotificationCount(
          notifications.docs.filter((notification) => !notification.data().read)
            .length,
        );
      },
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadPendingRequestCount = async () => {
      const requests = await getDocs(
        query(
          collection(db, "friendRequests"),
          where("recipientId", "==", user.uid),
        ),
      );
      setPendingRequestCount(
        requests.docs.filter((request) => request.data().status === "pending")
          .length,
      );
    };
    loadPendingRequestCount();
  }, [user]);

  if (!user) return null;

  const owedToYou = friends.reduce((total, friend) => {
    const balance = Number(friend.balance) || 0;
    return total + (balance < 0 ? Math.abs(balance) : 0);
  }, 0);
  const youOwe = friends.reduce((total, friend) => {
    const balance = Number(friend.balance) || 0;
    return total + (balance > 0 ? balance : 0);
  }, 0);
  const visibleFriends = [...friends]
    .filter((friend) =>
      friend.name?.toLowerCase().includes(friendSearch.toLowerCase()),
    )
    .sort((a, b) =>
      friendSort === "owed-to-you"
        ? (Number(a.balance) || 0) - (Number(b.balance) || 0)
        : friendSort === "you-owe"
          ? (Number(b.balance) || 0) - (Number(a.balance) || 0)
          : a.name.localeCompare(b.name),
    );
  const recentActivityItems = [
    ...recentTransactions.map((transaction) => ({
      ...transaction,
      isLeaving: false,
    })),
    ...leavingRecentTransactions.map((transaction) => ({
      ...transaction,
      isLeaving: true,
    })),
  ];

  return (
    <div className="dash-screen">
      <div className="topbar">
        <div className="topbar-left">
          <button
            className="menu-toggle"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span></span>
            <span></span>
            <span></span>
            {unreadNotificationCount > 0 && (
              <span className="menu-notification-badge">
                {unreadNotificationCount}
              </span>
            )}
          </button>
          <div className="brand">
            Hisaab <span>Kitaab</span>
          </div>
        </div>
        <button className="ghost-btn" onClick={() => signOut(auth)}>
          Sign out
        </button>
      </div>

      {menuOpen && (
        <button
          className="menu-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={`side-menu ${menuOpen ? "open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <div className="side-menu-header">
          <span>Menu</span>
          <button
            className="menu-close"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>
        </div>
        <nav className="side-menu-links" aria-label="Dashboard navigation">
          <button onClick={() => navigate("/account-settings")}>
            Account settings
          </button>
          <button onClick={() => navigate("/friend-requests")}>
            Friend requests{" "}
            {pendingRequestCount > 0 && (
              <span className="request-badge">{pendingRequestCount}</span>
            )}
          </button>
          <button onClick={() => navigate("/notifications")}>
            Notifications{" "}
            {unreadNotificationCount > 0 && (
              <span className="request-badge">{unreadNotificationCount}</span>
            )}
          </button>
          <button onClick={() => navigate("/friends")}>Friends</button>
          <button onClick={() => navigate("/add-friend")}>Add friend</button>
        </nav>
      </aside>

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
            <p className="muted">@{username}</p>
            {user?.email && <p className="muted">{user.email}</p>}
          </div>
        </div>

        <div className="balance-summary" aria-label="Balance summary">
          <div className="summary-tile owed-to-you">
            <span>Others owe you</span>
            <strong>${owedToYou.toFixed(2)}</strong>
          </div>
          <div className="summary-tile you-owe">
            <span>You owe others</span>
            <strong>${youOwe.toFixed(2)}</strong>
          </div>
        </div>

        <div className="recent-transactions">
          <h2>Recent activity</h2>
          {recentActivityItems.length === 0 ? (
            <p className="muted">No transactions yet.</p>
          ) : (
            recentActivityItems.map((transaction) => (
              <div
                className={`recent-transaction ${transaction.isLeaving ? "recent-activity-exit" : "recent-activity-arrival"}`}
                key={`${transaction.friendName}-${transaction.id}`}
                ref={(node) => {
                  const key = `${transaction.friendName}-${transaction.id}`;
                  if (node) recentTransactionNodes.current.set(key, node);
                  else recentTransactionNodes.current.delete(key);
                }}
              >
                <span>
                  {transaction.friendName}: {transaction.description}
                </span>
                {transaction.type === "settlement" ? (
                  <strong className="muted">
                    {transaction.status === "pending"
                      ? "Settlement pending"
                      : transaction.status === "cancelled"
                        ? "Settlement cancelled"
                        : transaction.status === "declined"
                          ? "Settlement declined"
                          : "Settled"}
                  </strong>
                ) : (
                  <strong
                    className={
                      transaction.paidById === user.uid
                        ? "positive"
                        : "negative"
                    }
                  >
                    {transaction.paidById === user.uid
                      ? `You paid $${Number(transaction.amount).toFixed(2)}`
                      : `${transaction.friendName} paid $${Number(transaction.amount).toFixed(2)}`}
                  </strong>
                )}
              </div>
            ))
          )}
        </div>

        {/* Friends list */}
        <div className="friends-list">
          <div className="friends-controls">
            <input
              placeholder="Search friends"
              value={friendSearch}
              onChange={(event) => setFriendSearch(event.target.value)}
            />
            <select
              value={friendSort}
              onChange={(event) => setFriendSort(event.target.value)}
            >
              <option value="name">Sort: Name</option>
              <option value="owed-to-you">Sort: Owed to you</option>
              <option value="you-owe">Sort: You owe</option>
            </select>
          </div>
          {friends.length === 0 && (
            <p className="muted">No friends yet — add one from the menu.</p>
          )}
          {visibleFriends.map((f) => (
            <div
              key={f.id}
              className="friend-row"
              onClick={() => navigate(`/friend/${f.id}`)}
            >
              <span className="friend-name">{f.name}</span>
              <span
                className={`friend-balance ${
                  Number(f.balance) > 0
                    ? "negative"
                    : Number(f.balance) < 0
                      ? "positive"
                      : "muted"
                }`}
              >
                {Number(f.balance) === 0
                  ? "Settled"
                  : Number(f.balance) > 0
                    ? `You owe ${f.name} $${Number(f.balance).toFixed(2)}`
                    : `${f.name} owes you $${Math.abs(Number(f.balance)).toFixed(2)}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <footer className="footnote">Made with ⚡ React + Firebase</footer>
    </div>
  );
}
