import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import FriendPage from "./pages/FriendPage";
import CreateUsername from "./pages/CreateUsername";
import AccountSettings from "./pages/AccountSettings";
import FriendRequests from "./pages/FriendRequests";
import AddFriend from "./pages/AddFriend";
import Notifications from "./pages/Notifications";
import FriendsPage from "./pages/FriendsPage";
import PreviousFriendPage from "./pages/PreviousFriendPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/create-username" element={<CreateUsername />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/friend/:friendId" element={<FriendPage />} />
      <Route path="/account-settings" element={<AccountSettings />} />
      <Route path="/friend-requests" element={<FriendRequests />} />
      <Route path="/add-friend" element={<AddFriend />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/friends" element={<FriendsPage />} />
      <Route
        path="/previous-friend/:friendId"
        element={<PreviousFriendPage />}
      />
    </Routes>
  );
}
