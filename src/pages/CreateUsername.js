import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import "./Home.css";

const usernameKey = (username) => encodeURIComponent(username);

export default function CreateUsername() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState("idle");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (signedInUser) => {
      if (!signedInUser) {
        navigate("/", { replace: true });
        return;
      }

      const profile = await getDoc(doc(db, "users", signedInUser.uid));
      if (profile.data()?.username) {
        navigate("/dashboard", { replace: true });
        return;
      }

      setUser(signedInUser);
    });

    return unsubscribe;
  }, [navigate]);

  useEffect(() => {
    if (username.length < 4) {
      setAvailability("idle");
      return undefined;
    }

    let cancelled = false;
    setAvailability("checking");

    const timer = window.setTimeout(async () => {
      try {
        const usernameDoc = await Promise.race([
          getDocFromServer(doc(db, "usernames", usernameKey(username))),
          new Promise((_, reject) =>
            window.setTimeout(
              () => reject(new Error("Availability check timed out.")),
              8000,
            ),
          ),
        ]);
        if (!cancelled)
          setAvailability(usernameDoc.exists() ? "taken" : "available");
      } catch {
        if (!cancelled) setAvailability("error");
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username]);

  const saveUsername = async (event) => {
    event.preventDefault();
    if (username.length < 4) {
      setError("Your username needs at least 4 characters.");
      return;
    }

    if (availability !== "available") {
      setError(
        availability === "taken"
          ? "This username is unavailable. Please choose something else."
          : "Please wait while we check availability.",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      await runTransaction(db, async (transaction) => {
        const usernameRef = doc(db, "usernames", usernameKey(username));
        const usernameDoc = await transaction.get(usernameRef);

        if (usernameDoc.exists()) {
          throw new Error("That username is already taken.");
        }

        transaction.set(
          doc(db, "users", user.uid),
          {
            username,
            email: user.email || null,
            displayName: user.displayName || user.email || null,
            googlePhotoURL: user.photoURL || null,
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
        transaction.set(usernameRef, { uid: user.uid });
        if (user.email) {
          transaction.set(doc(db, "emails", usernameKey(user.email)), {
            uid: user.uid,
            email: user.email,
          });
        }
      });

      navigate("/dashboard", { replace: true });
    } catch (saveError) {
      setError(
        saveError.message ||
          "We could not save your username. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const displayedError =
    error ||
    (username.length > 0 && username.length < 4
      ? "Your username needs at least 4 characters."
      : availability === "taken"
        ? "This username is unavailable. Please choose something else."
        : availability === "error"
          ? "We could not check availability. Please try again."
          : "");

  return (
    <div className="home-container">
      <div className="card">
        <h1>
          Choose your <span className="highlight">username</span>
        </h1>
        <p>This is how you will appear in Hisaab Kitaab.</p>
        <form onSubmit={saveUsername} className="username-form">
          <div className="username-input-wrap">
            <input
              aria-label="Username"
              aria-describedby="username-requirement username-error"
              aria-invalid={Boolean(displayedError)}
              autoComplete="username"
              autoFocus
              placeholder="Choose a username"
              value={username}
              onChange={(event) => {
                const nextUsername = event.target.value;
                setUsername(nextUsername);
                setAvailability(nextUsername.length >= 4 ? "checking" : "idle");
                setError("");
              }}
            />
            {availability === "available" && (
              <span
                className="availability-icon"
                aria-label="Username available"
              >
                ✓
              </span>
            )}
          </div>
          <p id="username-requirement" className="username-requirement">
            At least 4 characters.
          </p>
          {availability === "checking" && (
            <p className="availability-status">Checking availability...</p>
          )}
          {displayedError && (
            <p id="username-error" className="form-error" role="alert">
              {displayedError}
            </p>
          )}
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Continue"}
          </button>
        </form>
      </div>
      <footer>Built with 💙 React + Firebase</footer>
    </div>
  );
}
