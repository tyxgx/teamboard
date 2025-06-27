// src/BoardRoomPage.tsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { io, Socket } from "socket.io-client";

export default function BoardRoomPage() {
  const { boardCode } = useParams();
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<
    { sender: string; message: string; visibility?: string; actualSender?: string }[]
  >([]);
  const [visibility, setVisibility] = useState("public");
  const [anonymousMode, setAnonymousMode] = useState(false); // ✅ Admin-only toggle
  const [socket, setSocket] = useState<Socket | null>(null);

  // ✅ Authenticate and connect socket
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    axios
      .get("http://localhost:5001/api/test-auth", {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const currentUser = {
          name: res.data.user.name,
          email: res.data.user.email,
          role: res.data.user.role,
        };
        setUser(currentUser);

        const newSocket = io("http://localhost:5001");
        setSocket(newSocket);

        if (boardCode) {
          newSocket.emit("join-board", {
            boardCode,
            name: currentUser.name,
          });
        }

        // ✅ Receive messages
        newSocket.on("receive-message", (data) => {
          // Filter out admin-only messages for non-admin users
          if (data.visibility === "admin" && currentUser.role !== "admin") return;
          setMessages((prev) => [...prev, data]);
        });

        return () => {
          newSocket.disconnect();
        };
      })
      .catch(() => setUser(null));
  }, [boardCode]);

  // ✅ Emit message with visibility and sender info
  const handleSendMessage = () => {
    if (!message.trim() || !user || !boardCode || !socket) return;

    socket.emit("send-message", {
      boardCode,
      message,
      visibility,
      sender: anonymousMode ? "Anonymous" : user.name, // 🔒 Mask sender if anonymous
      actualSender: user.name, // 🔐 Always include true sender (for admin)
    });

    setMessage("");
  };

  return (
    <div style={{ minHeight: "100vh", padding: "40px", textAlign: "center" }}>
      <h1>Board Room</h1>
      <p><strong>Board Code:</strong> {boardCode}</p>

      {user ? (
        <>
          <p>Welcome, <b>{user.name}</b>!</p>
          <p>Email: {user.email}</p>

          {/* ✅ Only admin can toggle anonymous mode */}
          {user.role === "admin" && (
            <div style={{ marginTop: 12 }}>
              <label>
                <input
                  type="checkbox"
                  checked={anonymousMode}
                  onChange={(e) => setAnonymousMode(e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Enable Anonymous Mode
              </label>
            </div>
          )}

          {/* ✅ Message input area */}
          <div style={{ marginTop: 24 }}>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message"
              style={{ padding: 8, width: 300, marginRight: 8 }}
            />
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              style={{ padding: 8, marginRight: 8 }}
            >
              <option value="public">Visible to All</option>
              <option value="admin">Only Admin</option>
            </select>
            <button onClick={handleSendMessage}>Send</button>
          </div>

          {/* ✅ Message feed */}
          <div style={{ marginTop: 32, textAlign: "left", maxWidth: 500, marginInline: "auto" }}>
            <h3>Messages:</h3>
            {messages.map((msg, i) => (
              <p key={i}>
                <b>
                  {msg.sender}
                  {/* ✅ Reveal actual sender if admin */}
                  {user.role === "admin" && msg.sender === "Anonymous" && msg.actualSender
                    ? ` (${msg.actualSender})`
                    : ""}
                </b>: {msg.message}
                {msg.visibility === "admin" && (
                  <span style={{ color: "red", marginLeft: 8 }}>(Admin Only)</span>
                )}
              </p>
            ))}
          </div>
        </>
      ) : (
        <p>Loading user...</p>
      )}
    </div>
  );
}