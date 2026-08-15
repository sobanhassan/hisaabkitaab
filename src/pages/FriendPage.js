import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  formatTransactionDate,
  getBalanceChange,
  getPairId,
  getUserBalance,
  isFirstMember,
} from "../sharedLedger";
import "./FriendPage.css";

export default function FriendPage() {
  const { friendId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [friend, setFriend] = useState(null);
  const [pair, setPair] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [whoPaid, setWhoPaid] = useState("me");
  const [pendingDeletionIds, setPendingDeletionIds] = useState(new Set());
  const [pendingDeletionRequests, setPendingDeletionRequests] = useState(
    new Map(),
  );
  const [pendingEditRequests, setPendingEditRequests] = useState(new Map());
  const [pendingSettlementRequests, setPendingSettlementRequests] = useState(
    [],
  );

  useEffect(() => {
    return onAuthStateChanged(auth, (signedInUser) => {
      if (!signedInUser) {
        navigate("/", { replace: true });
        return;
      }

      setUser(signedInUser);
    });
  }, [navigate]);

  const pairId = user ? getPairId(user.uid, friendId) : null;
  const load = useCallback(async () => {
    if (!user) return;
    const [friendSnapshot, pairSnapshot, profileSnapshot] = await Promise.all([
      getDoc(doc(db, "users", user.uid, "friends", friendId)),
      getDoc(doc(db, "sharedPairs", getPairId(user.uid, friendId))),
      getDoc(doc(db, "users", friendId)).catch(() => null),
    ]);
    if (!friendSnapshot.exists())
      return navigate("/dashboard", { replace: true });
    const profile = profileSnapshot?.data?.() || {};
    setFriend({
      id: friendSnapshot.id,
      ...friendSnapshot.data(),
      photoURL: profile.customPhotoURL || profile.googlePhotoURL || null,
    });
    let currentPair = pairSnapshot.data();
    if (!currentPair) {
      currentPair = {
        members: [user.uid, friendId].sort(),
        balanceForFirstMember: 0,
      };
      await setDoc(
        doc(db, "sharedPairs", getPairId(user.uid, friendId)),
        currentPair,
      );
    }
    setPair(currentPair);
    const [
      snapshot,
      sentDeletionRequestsSnapshot,
      receivedDeletionRequestsSnapshot,
      sentEditRequestsSnapshot,
      receivedEditRequestsSnapshot,
      sentSettlementRequestsSnapshot,
      receivedSettlementRequestsSnapshot,
    ] = await Promise.all([
      getDocs(
        query(
          collection(
            db,
            "sharedPairs",
            getPairId(user.uid, friendId),
            "transactions",
          ),
          orderBy("createdAt", "desc"),
        ),
      ),
      getDocs(
        query(
          collection(db, "transactionDeletionRequests"),
          where("requesterId", "==", user.uid),
        ),
      ),
      getDocs(
        query(
          collection(db, "transactionDeletionRequests"),
          where("recipientId", "==", user.uid),
        ),
      ),
      getDocs(
        query(
          collection(db, "transactionEditRequests"),
          where("requesterId", "==", user.uid),
        ),
      ),
      getDocs(
        query(
          collection(db, "transactionEditRequests"),
          where("recipientId", "==", user.uid),
        ),
      ),
      getDocs(
        query(
          collection(db, "settlementRequests"),
          where("senderId", "==", user.uid),
        ),
      ),
      getDocs(
        query(
          collection(db, "settlementRequests"),
          where("recipientId", "==", user.uid),
        ),
      ),
    ]);
    setTransactions(
      snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    );
    const deletionRequests = [
      ...sentDeletionRequestsSnapshot.docs,
      ...receivedDeletionRequestsSnapshot.docs,
    ]
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter(
        (request) =>
          request.pairId === getPairId(user.uid, friendId) &&
          request.status === "pending",
      );
    setPendingDeletionRequests(
      new Map(
        deletionRequests.map((request) => [request.transactionId, request]),
      ),
    );
    setPendingDeletionIds(
      new Set(
        deletionRequests
          .filter((request) => request.requesterId === user.uid)
          .map((request) => request.transactionId),
      ),
    );
    const editRequests = [
      ...sentEditRequestsSnapshot.docs,
      ...receivedEditRequestsSnapshot.docs,
    ]
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter(
        (request) =>
          request.pairId === getPairId(user.uid, friendId) &&
          request.status === "pending",
      );
    setPendingEditRequests(
      new Map(editRequests.map((request) => [request.transactionId, request])),
    );
    setPendingSettlementRequests(
      [
        ...sentSettlementRequestsSnapshot.docs,
        ...receivedSettlementRequestsSnapshot.docs,
      ]
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter(
          (request) =>
            request.pairId === getPairId(user.uid, friendId) &&
            request.status === "pending",
        ),
    );
  }, [friendId, navigate, user]);
  useEffect(() => {
    if (!user || !pairId) return undefined;

    const refreshPage = () => load();
    const requestCollection = collection(db, "settlementRequests");
    const deletionRequestCollection = collection(
      db,
      "transactionDeletionRequests",
    );
    const editRequestCollection = collection(db, "transactionEditRequests");
    const unsubscribe = [
      onSnapshot(
        collection(db, "sharedPairs", pairId, "transactions"),
        refreshPage,
      ),
      onSnapshot(
        query(requestCollection, where("senderId", "==", user.uid)),
        refreshPage,
      ),
      onSnapshot(
        query(requestCollection, where("recipientId", "==", user.uid)),
        refreshPage,
      ),
      onSnapshot(
        query(deletionRequestCollection, where("requesterId", "==", user.uid)),
        refreshPage,
      ),
      onSnapshot(
        query(deletionRequestCollection, where("recipientId", "==", user.uid)),
        refreshPage,
      ),
      onSnapshot(
        query(editRequestCollection, where("requesterId", "==", user.uid)),
        refreshPage,
      ),
      onSnapshot(
        query(editRequestCollection, where("recipientId", "==", user.uid)),
        refreshPage,
      ),
    ];

    return () => unsubscribe.forEach((stopListening) => stopListening());
  }, [load, pairId, user]);

  const balance = getUserBalance(pair, user?.uid);
  const changeForPair = (paidById, value) => {
    const localChange = getBalanceChange(paidById, user.uid, value);
    return isFirstMember(user.uid, friendId) ? localChange : -localChange;
  };
  const saveTransaction = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!value || !description.trim()) return;
    const paidById = whoPaid === "me" ? user.uid : friendId;
    await addDoc(collection(db, "sharedPairs", pairId, "transactions"), {
      type: "expense",
      amount: value,
      description: description.trim(),
      paidById,
      createdById: user.uid,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "sharedPairs", pairId), {
      balanceForFirstMember: increment(changeForPair(paidById, value)),
    });
    await addDoc(collection(db, "users", friendId, "notifications"), {
      message: `${user.displayName || user.email || "Your friend"} added “${description.trim()}” for $${value.toFixed(2)}. ${paidById === user.uid ? "They paid." : "You paid."}`,
      type: "transaction_added",
      actorId: user.uid,
      read: false,
      createdAt: serverTimestamp(),
    });
    setAmount("");
    setDescription("");
    await load();
  };
  const requestTransactionDeletion = async (transaction) => {
    if (pendingSettlementRequests.length > 0) {
      window.alert(
        "A settlement request is pending. Resolve it before requesting a transaction change.",
      );
      return;
    }
    if (pendingDeletionIds.has(transaction.id)) return;
    if (
      !window.confirm(
        "Send a request to remove this transaction? The person who paid must approve it.",
      )
    )
      return;
    setPendingDeletionIds((current) => new Set(current).add(transaction.id));
    const recipientId =
      transaction.paidById === user.uid ? friendId : transaction.paidById;
    try {
      const request = await addDoc(
        collection(db, "transactionDeletionRequests"),
        {
          requesterId: user.uid,
          recipientId,
          pairId,
          transactionId: transaction.id,
          description: transaction.description,
          amount: Number(transaction.amount) || 0,
          status: "pending",
          createdAt: serverTimestamp(),
        },
      );
      await addDoc(collection(db, "users", recipientId, "notifications"), {
        message: `${user.displayName || user.email || "Your friend"} requested to remove “${transaction.description}” ($${Number(transaction.amount).toFixed(2)}).`,
        type: "transaction_deletion_request",
        deletionRequestId: request.id,
        actorId: user.uid,
        read: false,
        createdAt: serverTimestamp(),
      });
      setPendingDeletionRequests((current) => {
        const next = new Map(current);
        next.set(transaction.id, {
          requesterId: user.uid,
          recipientId,
          transactionId: transaction.id,
          status: "pending",
        });
        return next;
      });
      window.alert("Deletion request sent.");
    } catch {
      setPendingDeletionIds((current) => {
        const next = new Set(current);
        next.delete(transaction.id);
        return next;
      });
      window.alert(
        "We could not send that deletion request. Please try again.",
      );
    }
  };
  const requestTransactionEdit = async (transaction) => {
    if (pendingSettlementRequests.length > 0) {
      window.alert(
        "A settlement request is pending. Resolve it before requesting a transaction change.",
      );
      return;
    }
    if (pendingEditRequests.has(transaction.id)) return;
    const nextAmount = window.prompt("New amount", String(transaction.amount));
    if (nextAmount === null) return;
    const amountValue = Number(nextAmount);
    if (!amountValue || amountValue < 0) {
      window.alert("Enter a valid amount.");
      return;
    }
    const nextDescription = window.prompt(
      "New description",
      transaction.description,
    );
    if (nextDescription === null || !nextDescription.trim()) return;

    const recipientId =
      transaction.paidById === user.uid ? friendId : transaction.paidById;
    try {
      const request = await addDoc(collection(db, "transactionEditRequests"), {
        requesterId: user.uid,
        recipientId,
        pairId,
        transactionId: transaction.id,
        proposedAmount: amountValue,
        proposedDescription: nextDescription.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "users", recipientId, "notifications"), {
        message: `${user.displayName || user.email || "Your friend"} requested an edit to “${transaction.description}”.`,
        type: "transaction_edit_request",
        editRequestId: request.id,
        actorId: user.uid,
        read: false,
        createdAt: serverTimestamp(),
      });
      setPendingEditRequests((current) =>
        new Map(current).set(transaction.id, {
          id: request.id,
          requesterId: user.uid,
          recipientId,
          transactionId: transaction.id,
          proposedAmount: amountValue,
          proposedDescription: nextDescription.trim(),
          status: "pending",
        }),
      );
    } catch {
      window.alert("We could not send that edit request. Please try again.");
    }
  };
  const requestSettlement = async () => {
    if (pendingDeletionRequests.size > 0 || pendingEditRequests.size > 0) {
      window.alert(
        "Resolve all pending edit and deletion requests before settling up.",
      );
      return;
    }
    if (
      !balance ||
      pendingSettlementRequests.length > 0 ||
      !window.confirm("Send a settlement request?")
    )
      return;

    const amountToSettle = Math.abs(balance);
    const settlementRequestRef = doc(collection(db, "settlementRequests"));
    const settlementTransactionRef = doc(
      collection(db, "sharedPairs", pairId, "transactions"),
    );
    const batch = writeBatch(db);

    batch.set(settlementRequestRef, {
      senderId: user.uid,
      recipientId: friendId,
      senderName: user.displayName || user.email || "A friend",
      amount: amountToSettle,
      senderBalance: balance,
      pairId,
      settlementTransactionId: settlementTransactionRef.id,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    batch.set(settlementTransactionRef, {
      type: "settlement",
      status: "pending",
      amount: amountToSettle,
      description: `Settlement pending: $${amountToSettle.toFixed(2)}`,
      settlementRequestId: settlementRequestRef.id,
      createdById: user.uid,
      createdAt: serverTimestamp(),
    });
    await batch.commit();

    const settlementRequest = { id: settlementRequestRef.id };
    await addDoc(collection(db, "users", friendId, "notifications"), {
      message: `${user.displayName || user.email || "A friend"} requested a settlement.`,
      type: "settlement_request",
      settlementRequestId: settlementRequest.id,
      actorId: user.uid,
      read: false,
      createdAt: serverTimestamp(),
    });
    await load();
    window.alert("Settlement request sent.");
  };
  const cancelSettlementRequest = async (request) => {
    try {
      const requestRef = doc(db, "settlementRequests", request.id);
      const requestSnapshot = await getDoc(requestRef);
      if (
        !requestSnapshot.exists() ||
        requestSnapshot.data().status !== "pending"
      ) {
        await load();
        return;
      }
      if (requestSnapshot.data().senderId !== user.uid) return;

      const batch = writeBatch(db);
      batch.update(requestRef, {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
      });
      if (requestSnapshot.data().settlementTransactionId) {
        batch.update(
          doc(
            db,
            "sharedPairs",
            requestSnapshot.data().pairId,
            "transactions",
            requestSnapshot.data().settlementTransactionId,
          ),
          {
            status: "cancelled",
            description: `Settlement cancelled: $${Number(requestSnapshot.data().amount).toFixed(2)}`,
            cancelledAt: serverTimestamp(),
          },
        );
      }
      batch.set(
        doc(
          collection(
            db,
            "users",
            requestSnapshot.data().recipientId,
            "notifications",
          ),
        ),
        {
          message: `${user.displayName || user.email || "Your friend"} cancelled the settlement request for $${Number(requestSnapshot.data().amount).toFixed(2)}.`,
          type: "settlement_cancelled",
          actorId: user.uid,
          read: false,
          createdAt: serverTimestamp(),
        },
      );
      await batch.commit();
      await load();
    } catch {
      window.alert(
        "We could not cancel this settlement request. Please try again.",
      );
    }
  };
  const respondToSettlementRequest = async (request, approved) => {
    try {
      const requestRef = doc(db, "settlementRequests", request.id);
      const requestSnapshot = await getDoc(requestRef);
      if (
        !requestSnapshot.exists() ||
        requestSnapshot.data().status !== "pending"
      ) {
        await load();
        return;
      }
      const currentRequest = requestSnapshot.data();
      const batch = writeBatch(db);
      if (currentRequest.settlementTransactionId) {
        batch.update(
          doc(
            db,
            "sharedPairs",
            currentRequest.pairId,
            "transactions",
            currentRequest.settlementTransactionId,
          ),
          {
            status: approved ? "approved" : "declined",
            description: `${approved ? "Settled" : "Settlement declined"}: $${Number(currentRequest.amount).toFixed(2)}`,
            respondedAt: serverTimestamp(),
          },
        );
      } else if (approved) {
        batch.set(
          doc(
            collection(
              db,
              "sharedPairs",
              currentRequest.pairId,
              "transactions",
            ),
          ),
          {
            type: "settlement",
            status: "approved",
            amount: currentRequest.amount,
            description: "Settled up",
            createdById: user.uid,
            createdAt: serverTimestamp(),
          },
        );
      }
      if (approved) {
        const settlementChangeForPair = isFirstMember(
          currentRequest.senderId,
          currentRequest.recipientId,
        )
          ? -Number(currentRequest.senderBalance || 0)
          : Number(currentRequest.senderBalance || 0);
        batch.update(doc(db, "sharedPairs", currentRequest.pairId), {
          balanceForFirstMember: increment(settlementChangeForPair),
        });
      }
      batch.update(requestRef, {
        status: approved ? "approved" : "declined",
        respondedAt: serverTimestamp(),
      });
      batch.set(
        doc(collection(db, "users", currentRequest.senderId, "notifications")),
        {
          message: `${user.displayName || user.email || "Your friend"} ${approved ? "approved" : "declined"} the settlement request.`,
          type: approved ? "settlement_approved" : "settlement_declined",
          actorId: user.uid,
          read: false,
          createdAt: serverTimestamp(),
        },
      );
      await batch.commit();
      await load();
    } catch {
      window.alert(
        "We could not process that settlement request. Please try again.",
      );
    }
  };
  const respondToDeletionRequest = async (request, approved) => {
    try {
      const requestRef = doc(db, "transactionDeletionRequests", request.id);
      const requestSnapshot = await getDoc(requestRef);
      if (
        !requestSnapshot.exists() ||
        requestSnapshot.data().status !== "pending"
      ) {
        await load();
        return;
      }
      const currentRequest = requestSnapshot.data();
      const batch = writeBatch(db);
      if (approved) {
        const transactionRef = doc(
          db,
          "sharedPairs",
          currentRequest.pairId,
          "transactions",
          currentRequest.transactionId,
        );
        const transactionSnapshot = await getDoc(transactionRef);
        if (transactionSnapshot.exists()) {
          const transaction = transactionSnapshot.data();
          const changeForPair =
            transaction.paidById === pair.members[0]
              ? -(Number(transaction.amount) || 0)
              : Number(transaction.amount) || 0;
          batch.update(transactionRef, {
            status: "deleted",
            deletedAt: serverTimestamp(),
            deletedById: user.uid,
          });
          batch.update(doc(db, "sharedPairs", currentRequest.pairId), {
            balanceForFirstMember: increment(-changeForPair),
          });
        }
      }
      batch.update(requestRef, {
        status: approved ? "approved" : "declined",
        respondedAt: serverTimestamp(),
      });
      const matchingNotifications = await getDocs(
        query(
          collection(db, "users", user.uid, "notifications"),
          where("deletionRequestId", "==", request.id),
        ),
      );
      matchingNotifications.docs.forEach((notification) => {
        batch.delete(notification.ref);
      });
      batch.set(
        doc(
          collection(db, "users", currentRequest.requesterId, "notifications"),
        ),
        {
          message: `${user.displayName || user.email || "Your friend"} ${approved ? "approved" : "declined"} your request to remove “${currentRequest.description}”.`,
          type: approved
            ? "transaction_deletion_approved"
            : "transaction_deletion_declined",
          actorId: user.uid,
          read: false,
          createdAt: serverTimestamp(),
        },
      );
      await batch.commit();
      await load();
    } catch {
      window.alert(
        "We could not process that deletion request. Please try again.",
      );
    }
  };
  const respondToEditRequest = async (request, approved) => {
    try {
      const requestRef = doc(db, "transactionEditRequests", request.id);
      const requestSnapshot = await getDoc(requestRef);
      if (
        !requestSnapshot.exists() ||
        requestSnapshot.data().status !== "pending"
      ) {
        await load();
        return;
      }
      const currentRequest = requestSnapshot.data();
      const transactionRef = doc(
        db,
        "sharedPairs",
        currentRequest.pairId,
        "transactions",
        currentRequest.transactionId,
      );
      const transactionSnapshot = await getDoc(transactionRef);
      if (
        approved &&
        (!transactionSnapshot.exists() ||
          transactionSnapshot.data().status === "deleted")
      ) {
        window.alert("This transaction is no longer available to edit.");
        await load();
        return;
      }

      const batch = writeBatch(db);
      if (approved) {
        const transaction = transactionSnapshot.data();
        const oldContribution =
          transaction.paidById === pair.members[0]
            ? -(Number(transaction.amount) || 0)
            : Number(transaction.amount) || 0;
        const newContribution =
          transaction.paidById === pair.members[0]
            ? -Number(currentRequest.proposedAmount)
            : Number(currentRequest.proposedAmount);
        batch.update(transactionRef, {
          amount: Number(currentRequest.proposedAmount),
          description: currentRequest.proposedDescription,
          editedAt: serverTimestamp(),
          editedById: user.uid,
        });
        batch.update(doc(db, "sharedPairs", currentRequest.pairId), {
          balanceForFirstMember: increment(newContribution - oldContribution),
        });
      }
      batch.update(requestRef, {
        status: approved ? "approved" : "declined",
        respondedAt: serverTimestamp(),
      });
      batch.set(
        doc(
          collection(db, "users", currentRequest.requesterId, "notifications"),
        ),
        {
          message: `${user.displayName || user.email || "Your friend"} ${approved ? "approved" : "declined"} your transaction edit request.`,
          type: approved
            ? "transaction_edit_approved"
            : "transaction_edit_declined",
          actorId: user.uid,
          read: false,
          createdAt: serverTimestamp(),
        },
      );
      await batch.commit();
      await load();
    } catch {
      window.alert("We could not process that edit request. Please try again.");
    }
  };
  const cancelEditRequest = async (request) => {
    try {
      const requestRef = doc(db, "transactionEditRequests", request.id);
      const requestSnapshot = await getDoc(requestRef);
      if (
        !requestSnapshot.exists() ||
        requestSnapshot.data().status !== "pending"
      ) {
        await load();
        return;
      }
      if (requestSnapshot.data().requesterId !== user.uid) return;

      await updateDoc(requestRef, {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
      });
      await load();
    } catch {
      window.alert("We could not cancel this edit request. Please try again.");
    }
  };
  if (!friend || !pair) return null;
  const lastSettlementAt = transactions
    .filter(
      (transaction) =>
        transaction.type === "settlement" &&
        transaction.status !== "pending" &&
        transaction.status !== "cancelled" &&
        transaction.status !== "declined",
    )
    .reduce(
      (latest, transaction) =>
        Math.max(latest, transaction.createdAt?.toMillis?.() || 0),
      0,
    );
  const activeExpenses = transactions.filter(
    (transaction) =>
      transaction.type === "expense" &&
      transaction.status !== "deleted" &&
      (transaction.createdAt?.toMillis?.() || 0) > lastSettlementAt,
  );
  const youPaidTotal = activeExpenses
    .filter((transaction) => transaction.paidById === user.uid)
    .reduce(
      (total, transaction) => total + (Number(transaction.amount) || 0),
      0,
    );
  const friendPaidTotal = activeExpenses
    .filter((transaction) => transaction.paidById === friendId)
    .reduce(
      (total, transaction) => total + (Number(transaction.amount) || 0),
      0,
    );
  const youOweNow = Math.max(balance, 0);
  const owedToYouNow = Math.max(-balance, 0);
  const pendingSettlementRequest = pendingSettlementRequests[0];
  const sentSettlementRequest =
    pendingSettlementRequest?.senderId === user.uid
      ? pendingSettlementRequest
      : null;
  const getSettlementStatusLabel = (status) => {
    if (status === "pending") return "Pending approval";
    if (status === "cancelled") return "Cancelled";
    if (status === "declined") return "Declined";
    return "Settled";
  };

  const renderTransactionActions = (
    transaction,
    deletionRequest,
    editRequest,
  ) => {
    if (deletionRequest?.requesterId === user.uid) {
      return (
        <button className="secondary-btn" disabled>
          Deletion request sent
        </button>
      );
    }

    if (deletionRequest) {
      return (
        <div className="request-actions">
          <button
            className="primary-btn"
            onClick={() => respondToDeletionRequest(deletionRequest, true)}
          >
            Approve deletion
          </button>
          <button
            className="secondary-btn"
            onClick={() => respondToDeletionRequest(deletionRequest, false)}
          >
            Keep transaction
          </button>
        </div>
      );
    }

    if (editRequest) {
      return editRequest.requesterId === user.uid ? (
        <button
          className="secondary-btn"
          onClick={() => cancelEditRequest(editRequest)}
        >
          Cancel request
        </button>
      ) : (
        <div className="request-actions">
          <button
            className="primary-btn"
            onClick={() => respondToEditRequest(editRequest, true)}
          >
            Approve edit
          </button>
          <button
            className="secondary-btn"
            onClick={() => respondToEditRequest(editRequest, false)}
          >
            Keep original
          </button>
        </div>
      );
    }

    return (
      <div className="request-actions">
        <button
          className="secondary-btn"
          onClick={() => requestTransactionEdit(transaction)}
        >
          Request edit
        </button>
        <button
          className="secondary-btn"
          onClick={() => requestTransactionDeletion(transaction)}
        >
          Request deletion
        </button>
      </div>
    );
  };

  return (
    <div className="friend-screen">
      <div className="topbar">
        <button className="ghost-btn" onClick={() => navigate("/dashboard")}>
          Back
        </button>
        <div className="brand">
          Hisaab <span>Kitaab</span>
        </div>
      </div>
      <div className="card">
        <div className="friend-profile-header">
          {friend.photoURL ? (
            <img
              className="friend-page-avatar"
              src={friend.photoURL}
              alt={`${friend.name}'s profile`}
            />
          ) : (
            <div className="friend-page-avatar friend-page-avatar-fallback">
              {friend.name?.[0]?.toUpperCase() || "U"}
            </div>
          )}
          <h1 className="friend-name">{friend.name}</h1>
        </div>
        <div className="friend-balance-tiles">
          <div className="friend-balance-tile you-owe-tile">
            <span>You owe {friend.name}</span>
            <strong>${friendPaidTotal.toFixed(2)}</strong>
          </div>
          <div className="friend-balance-tile owed-to-you-tile">
            <span>{friend.name} owes you</span>
            <strong>${youPaidTotal.toFixed(2)}</strong>
          </div>
          <div className="friend-balance-tile net-balance-tile">
            <span>Current total</span>
            <strong>
              {balance === 0
                ? "Settled"
                : balance > 0
                  ? `You owe $${youOweNow.toFixed(2)}`
                  : `${friend.name} owes you $${owedToYouNow.toFixed(2)}`}
            </strong>
          </div>
        </div>
        <button
          className="secondary-btn settle-button"
          disabled={Boolean(pendingSettlementRequest) && !sentSettlementRequest}
          onClick={
            sentSettlementRequest
              ? () => cancelSettlementRequest(sentSettlementRequest)
              : requestSettlement
          }
        >
          {sentSettlementRequest
            ? "Cancel request"
            : pendingSettlementRequest
              ? "Settlement request pending"
              : "Settle up"}
        </button>
        {pendingSettlementRequest && (
          <div className="settlement-request">
            <span>
              {pendingSettlementRequest.senderId === user.uid
                ? "Settlement request sent"
                : `${friend.name} requested to settle $${Number(pendingSettlementRequest.amount).toFixed(2)}.`}
            </span>
            {pendingSettlementRequest.recipientId === user.uid && (
              <div className="request-actions">
                <button
                  className="primary-btn"
                  onClick={() =>
                    respondToSettlementRequest(pendingSettlementRequest, true)
                  }
                >
                  Approve settlement
                </button>
                <button
                  className="secondary-btn"
                  onClick={() =>
                    respondToSettlementRequest(pendingSettlementRequest, false)
                  }
                >
                  Keep balance
                </button>
              </div>
            )}
          </div>
        )}
        <form onSubmit={saveTransaction} className="txn-form">
          <input
            type="number"
            step="0.01"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <select value={whoPaid} onChange={(e) => setWhoPaid(e.target.value)}>
            <option value="me">I paid</option>
            <option value="friend">{friend.name} paid</option>
          </select>
          <button className="primary-btn">Add</button>
        </form>
        <ul className="txn-list">
          {transactions.map((t) => {
            const deletionRequest = pendingDeletionRequests.get(t.id);
            const editRequest = pendingEditRequests.get(t.id);
            const proposedEdit = editRequest
              ? `Proposed: $${Number(editRequest.proposedAmount).toFixed(2)} · ${editRequest.proposedDescription}`
              : null;
            const isDeleted = t.status === "deleted";
            const isSettledHistory =
              !isDeleted &&
              t.type === "expense" &&
              lastSettlementAt > 0 &&
              (t.createdAt?.toMillis?.() || 0) <= lastSettlementAt;
            const addedByMe = (t.createdById || t.paidById) === user.uid;
            return (
              <li
                className={`txn-row ${isDeleted ? "deleted-transaction" : isSettledHistory ? "settled-history" : ""}`}
                key={t.id}
              >
                <div className="txn-left">
                  <span className="txn-desc">{t.description}</span>
                  <span className="txn-date">
                    {t.type === "settlement"
                      ? "Settlement"
                      : `Added by ${addedByMe ? "you" : friend.name}`}{" "}
                    · {formatTransactionDate(t.createdAt)}
                  </span>
                  {deletionRequest && (
                    <span className="txn-date">Deletion request pending</span>
                  )}
                  {editRequest && (
                    <span className="txn-date">Edit request pending</span>
                  )}
                </div>
                {isDeleted ? (
                  <>
                    <span className="muted">
                      ${Number(t.amount).toFixed(2)}
                    </span>
                    <span className="muted">Deleted by agreement</span>
                  </>
                ) : t.type === "settlement" ? (
                  <span className="muted">
                    {getSettlementStatusLabel(t.status)}
                  </span>
                ) : (
                  <>
                    <div className="transaction-payment">
                      <span
                        className={
                          t.paidById === user.uid ? "positive" : "negative"
                        }
                      >
                        {t.paidById === user.uid
                          ? `You paid $${Number(t.amount).toFixed(2)}`
                          : `${friend.name} paid $${Number(t.amount).toFixed(2)}`}
                      </span>
                      {proposedEdit && (
                        <span className="edit-request-details">
                          {proposedEdit}
                        </span>
                      )}
                    </div>
                    {isSettledHistory ? (
                      <span className="muted">Settled history</span>
                    ) : (
                      renderTransactionActions(t, deletionRequest, editRequest)
                    )}
                  </>
                )}
              </li>
            );
          })}
          {transactions.length === 0 && (
            <p className="muted">No shared transactions yet.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
