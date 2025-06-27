import React, { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import type { CredentialResponse } from "@react-oauth/google";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function App() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    axios
      .get("http://localhost:5001/api/test-auth", {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) =>
        setUser({ name: res.data.user.name, email: res.data.user.email })
      )
      .catch(() => setUser(null));
  }, []);

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;
    if (!idToken) {
      alert("No ID token from Google!");
      return;
    }

    try {
      const res = await axios.post(
        "http://localhost:5001/api/auth/google",
        { idToken }
      );
      localStorage.setItem("token", res.data.token);

      const userRes = await axios.get("http://localhost:5001/api/test-auth", {
        headers: { Authorization: `Bearer ${res.data.token}` },
      });
      setUser({
        name: userRes.data.user.name,
        email: userRes.data.user.email,
      });
      alert("Login success! JWT saved to localStorage.");
    } catch (err: any) {
      alert("Backend auth failed: " + (err?.response?.data?.message || err.message));
    }
  };

  const handleGoogleError = () => {
    alert("Google Sign-In Failed");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:5001/api/boards",
        { name: boardName },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      alert(`✅ Board Created: ${res.data.name} (Code: ${res.data.code})`);
      setShowModal(false);
      setBoardName("");
      navigate(`/board/${res.data.code}`);
    } catch (err: any) {
      alert("❌ Board create failed: " + (err?.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinBoard = async () => {
    if (!joinCode.trim()) return;
    const token = localStorage.getItem("token");
    try {
      const res = await axios.post(
        "http://localhost:5001/api/boards/join",
        { code: joinCode.trim() },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      alert(`✅ Joined board: ${res.data.name}`);
      setJoinCode("");
      navigate(`/board/${joinCode.trim()}`);
    } catch (err: any) {
      alert("❌ Failed to join board: " + (err?.response?.data?.message || err.message));
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      <h1>TeamBoard</h1>

      {user ? (
        <>
          <h2>Welcome, {user.name}!</h2>
          <p>
            You are logged in as <b>{user.email}</b>
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={() => setShowModal(true)} style={{ padding: "8px 16px" }}>+ New Board</button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="text"
                placeholder="Enter a code or link"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ccc" }}
              />
              <button onClick={handleJoinBoard} style={{ padding: "8px 16px" }}>
                Join
              </button>
            </div>
            <button
              style={{
                background: "red",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: "8px",
              }}
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </>
      ) : (
        <GoogleLogin onSuccess={handleGoogleSuccess} onError={handleGoogleError} />
      )}

      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <form
            style={{
              background: "white",
              padding: 32,
              borderRadius: 12,
              minWidth: 300,
              boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              position: "relative",
            }}
            onSubmit={handleModalSubmit}
          >
            <h2 style={{ margin: 0 }}>Create Board</h2>
            <input
              type="text"
              placeholder="Enter board name"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              required
              style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              disabled={loading}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  padding: "8px 16px",
                  background: "#eee",
                  border: "none",
                  borderRadius: 8,
                  color: "#333",
                }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: "8px 16px",
                  background: "blue",
                  border: "none",
                  borderRadius: 8,
                  color: "white",
                }}
                disabled={loading}
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}