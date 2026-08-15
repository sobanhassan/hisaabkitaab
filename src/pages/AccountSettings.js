import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseClient";
import { deleteUser, onAuthStateChanged, updateProfile } from "firebase/auth";
import { deleteDoc, doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import "./Dashboard.css";

const MAX_PROFILE_PHOTO_SIZE = 5 * 1024 * 1024;
const supabaseFunctionURL = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/profile-photo`;

async function callProfilePhotoFunction(user, method, body) {
  const publishableKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;
  if (!process.env.REACT_APP_SUPABASE_URL || !publishableKey) {
    throw new Error("supabase-not-configured");
  }
  const token = await user.getIdToken();
  const response = await fetch(supabaseFunctionURL, {
    method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
    },
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "profile-photo-request-failed");
  return result;
}

export default function AccountSettings() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [googlePhotoURL, setGooglePhotoURL] = useState(null);
  const [customPhotoURL, setCustomPhotoURL] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (signedInUser) => {
      if (!signedInUser) {
        navigate("/", { replace: true });
        return;
      }

      const profile = await getDoc(doc(db, "users", signedInUser.uid));
      const profileData = profile.data() || {};
      const savedCustomPhotoURL = profileData.customPhotoURL || null;
      const savedGooglePhotoURL = profileData.googlePhotoURL || (savedCustomPhotoURL ? null : signedInUser.photoURL || null);

      setUsername(profileData.username || "");
      setNewUsername(profileData.username || "");
      setGooglePhotoURL(savedGooglePhotoURL);
      setCustomPhotoURL(savedCustomPhotoURL);
      setUser(signedInUser);

      if (!profileData.googlePhotoURL && savedGooglePhotoURL) {
        await setDoc(doc(db, "users", signedInUser.uid), {
          googlePhotoURL: savedGooglePhotoURL,
        }, { merge: true });
      }
    });

    return unsubscribe;
  }, [navigate]);

  const uploadProfilePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_SIZE) {
      setMessage("Please choose an image smaller than 5 MB.");
      return;
    }

    setUploadingPhoto(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { url: nextCustomPhotoURL } = await callProfilePhotoFunction(user, "POST", formData);
      await updateProfile(auth.currentUser, { photoURL: nextCustomPhotoURL });
      await setDoc(doc(db, "users", user.uid), {
        customPhotoURL: nextCustomPhotoURL,
        googlePhotoURL: googlePhotoURL || null,
      }, { merge: true });
      setCustomPhotoURL(nextCustomPhotoURL);
      setMessage("Your profile photo was updated.");
    } catch (error) {
      setMessage(error.message === "supabase-not-configured"
        ? "Supabase profile-photo settings are not configured yet."
        : "We could not upload that profile photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removeProfilePhoto = async () => {
    if (!customPhotoURL) return;
    setUploadingPhoto(true);
    setMessage("");
    try {
      await callProfilePhotoFunction(user, "DELETE");
      await updateProfile(auth.currentUser, { photoURL: googlePhotoURL || null });
      await setDoc(doc(db, "users", user.uid), {
        customPhotoURL: null,
      }, { merge: true });
      setCustomPhotoURL(null);
      setMessage("Your Google profile photo is being used again.");
    } catch {
      setMessage("We could not remove that profile photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const saveUsername = async (event) => {
    event.preventDefault();
    const nextUsername = newUsername.trim();
    if (nextUsername.length < 4) {
      setMessage("Your username needs at least 4 characters.");
      return;
    }
    if (nextUsername === username) return;
    try {
      await runTransaction(db, async (transaction) => {
        const nextUsernameRef = doc(db, "usernames", encodeURIComponent(nextUsername));
        if ((await transaction.get(nextUsernameRef)).exists()) {
          throw new Error("That username is unavailable.");
        }
        transaction.delete(doc(db, "usernames", encodeURIComponent(username)));
        transaction.set(nextUsernameRef, { uid: user.uid });
        transaction.update(doc(db, "users", user.uid), { username: nextUsername });
      });
      setUsername(nextUsername);
      setMessage("Your username was updated.");
    } catch (error) {
      setMessage(error.message || "We could not update your username.");
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm("Delete your account? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(auth.currentUser);
      navigate("/", { replace: true });
    } catch {
      setMessage("For security, you may need to sign in again before deleting your account.");
    }
  };

  if (!user) return null;

  const displayedPhotoURL = customPhotoURL || googlePhotoURL;
  return (
    <div className="dash-screen">
      <div className="page-card">
        <button className="ghost-btn" onClick={() => navigate("/dashboard")}>Back to dashboard</button>
        <h1>Account settings</h1>
        <p><strong>Username:</strong> @{username}</p>
        <p><strong>Email:</strong> {user.email}</p>

        <section className="settings-form profile-photo-settings">
          <h2>Profile picture</h2>
          {displayedPhotoURL ? <img className="avatar settings-avatar" src={displayedPhotoURL} alt="Your profile" /> : <div className="avatar fallback settings-avatar">{user.displayName?.[0]?.toUpperCase() || "U"}</div>}
          <label className="primary-btn upload-photo-button" htmlFor="profile-photo-upload">
            {uploadingPhoto ? "Uploading..." : "Change profile picture"}
          </label>
          <input id="profile-photo-upload" type="file" accept="image/*" hidden disabled={uploadingPhoto} onChange={uploadProfilePhoto} />
          <button className="secondary-btn" type="button" disabled={!customPhotoURL || uploadingPhoto} onClick={removeProfilePhoto}>
            Remove profile picture
          </button>
          <p className="muted">If you remove a custom photo, your Google profile photo will be used.</p>
        </section>

        <form className="settings-form" onSubmit={saveUsername}>
          <label htmlFor="username">Username</label>
          <input id="username" minLength="4" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} />
          <button className="primary-btn" type="submit">Change username</button>
        </form>
        <button className="delete-btn" onClick={deleteAccount}>Delete account</button>
        {message && <p className="page-message">{message}</p>}
      </div>
    </div>
  );
}
