import { useEffect, useState } from "react";
import axios from "axios";

// ✅ Use backend URL from environment variables
const BACKEND = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [boardName, setBoardName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // ✅ Fetch user if token exists in localStorage
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    axios
      .get(`${BACKEND}/api/test-auth`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setUser({ name: res.data.user.name, email: res.data.user.email });
      })
      .catch(() => setUser(null));
  }, []);

  // ✅ Google login callback
  const handleCallbackResponse = async (response: { credential: string }) => {
    try {
      const idToken = response.credential;

      // ✅ Send token to backend auth route
      const res = await axios.post(`${BACKEND}/api/auth/google`, { idToken });
      const token = res.data.token;

      localStorage.setItem("token", token);

      const userRes = await axios.get(`${BACKEND}/api/test-auth`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUser({
        name: userRes.data.user.name,
        email: userRes.data.user.email,
      });
    } catch (error) {
      console.error("Google login error:", error);
    }
  };

  useEffect(() => {
    /* global google */
    // ✅ Initialize Google Sign-In with client ID from env variable
    google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: handleCallbackResponse,
    });

    google.accounts.id.renderButton(
      document.getElementById("signInDiv")!,
      {
        type: "standard",
        theme: "outline",
        size: "large",
      }
    );
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  const handleCreateBoard = async () => {
    const token = localStorage.getItem("token");
    if (!token || !boardName.trim()) return;

    const res = await axios.post(
      `${BACKEND}/api/boards`,
      { name: boardName },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    window.location.href = `/board/${res.data.code}`;
  };

  const handleJoinBoard = async () => {
    const token = localStorage.getItem("token");
    if (!token || !joinCode.trim()) return;

    const res = await axios.post(
      `${BACKEND}/api/boards/join`,
      { code: joinCode.trim() },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    window.location.href = `/board/${res.data.code}`;
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50 p-4">
      <h1 className="text-4xl font-bold mb-6">TeamBoard</h1>

      {!user ? (
        <div id="signInDiv" className="mb-4"></div>
      ) : (
        <>
          <p className="mb-4">Welcome, {user.name}</p>
          <button
            onClick={handleLogout}
            className="mb-4 px-4 py-2 bg-red-500 text-white rounded"
          >
            Logout
          </button>

          <div className="flex flex-col space-y-4 w-full max-w-xs">
            <input
              type="text"
              placeholder="Enter Board Name"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              className="p-2 border rounded"
            />
            <button
              onClick={handleCreateBoard}
              className="px-4 py-2 bg-blue-500 text-white rounded"
            >
              Create Board
            </button>

            <input
              type="text"
              placeholder="Enter Join Code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="p-2 border rounded"
            />
            <button
              onClick={handleJoinBoard}
              className="px-4 py-2 bg-green-500 text-white rounded"
            >
              Join Board
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default App;