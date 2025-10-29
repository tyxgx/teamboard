// src/BoardRoomPage.tsx
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { io, Socket } from "socket.io-client";

const BACKEND = import.meta.env.VITE_BACKEND_URL;

export default function BoardRoomPage() {
  const { boardCode } = useParams();
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<
    { sender: string; message: string; visibility?: "EVERYONE" | "ADMIN_ONLY"; actualSender?: string }[]
  >([]);
  const [visibility, setVisibility] = useState<"EVERYONE" | "ADMIN_ONLY">("EVERYONE");
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminRef = useRef(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);

  // ✅ Authenticate and connect socket
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    axios
      .get(`${BACKEND}/api/test-auth`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const currentUser = {
          id: res.data.user.id,
          name: res.data.user.name,
          email: res.data.user.email,
        };
        setUser(currentUser);

        const newSocket = io(BACKEND);
        setSocket(newSocket);

        if (boardCode) {
          // Lookup board by code to retrieve boardId and admin membership
          axios
            .get(`${BACKEND}/api/boards/by-code/${boardCode}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            .then((b) => {
              const board = b.data;
              setBoardId(board.id);
              const me = board.members.find((m: any) => m.userId === currentUser.id);
              const admin = Boolean(me && me.role === 'ADMIN');
              setIsAdmin(admin);
              isAdminRef.current = admin;
              if (board.createdByUser?.name) {
                setAdminName(board.createdByUser.name as string);
              }
              newSocket.emit("join-board", { boardCode, name: currentUser.name });
              // Fetch persisted comments as initial history
              const token = localStorage.getItem("token");
              if (token) {
                setLoadingHistory(true);
                axios
                  .get(`${BACKEND}/api/comments/${board.id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                  })
                  .then((resp) => {
                    const history = resp.data as Array<{
                      sender: string;
                      message: string;
                      visibility: "EVERYONE" | "ADMIN_ONLY";
                      actualSender?: string;
                    }>;
                    setMessages(history);
                  })
                  .finally(() => setLoadingHistory(false));
              }
            })
            .catch(() => {
              // If lookup fails, still join room by code but persistence will be disabled
              newSocket.emit("join-board", { boardCode, name: currentUser.name });
            });
        }

        // ✅ Receive messages (use ref to ensure latest admin state)
        newSocket.on("receive-message", (data) => {
          if (data.visibility === "ADMIN_ONLY" && !isAdminRef.current) return;
          setMessages((prev) => [...prev, data]);
        });

        return () => {
          newSocket.disconnect();
        };
      })
      .catch(() => setUser(null));
  }, [boardCode]);

  // ✅ Emit message with visibility and sender info
  const handleSendMessage = async () => {
    if (!message.trim() || !user || !boardCode || !socket) return;

    socket.emit("send-message", {
      boardCode,
      message,
      visibility,
      sender: anonymousMode ? "Anonymous" : user.name,
      actualSender: user.name,
    });

    // Persist to REST API if we have boardId
    const token = localStorage.getItem("token");
    if (token && boardId) {
      try {
        await axios.post(
          `${BACKEND}/api/comments`,
          { content: message, visibility, boardId, anonymous: anonymousMode },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch {
        // ignore persistence error in UI; realtime already sent
      }
    }

    setMessage("");
  };

  return (
    <div style={{ minHeight: "100vh", padding: "40px", textAlign: "center" }}>
      <h1>Board Room</h1>
      <p><strong>Board Code:</strong> {boardCode}</p>
      {adminName && (
        <p style={{ marginTop: 8 }}>
          Admin: <b>{adminName}{user && adminName === user.name ? ' (You)' : ''}</b>
        </p>
      )}

      {user ? (
        <>
          <p>Welcome, <b>{user.name}</b>!</p>
          <p>Email: {user.email}</p>

          {/* ✅ Only admin can toggle anonymous mode */}
          {isAdmin && (
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
              onChange={(e) => setVisibility(e.target.value as "EVERYONE" | "ADMIN_ONLY")}
              style={{ padding: 8, marginRight: 8 }}
            >
              <option value="EVERYONE">Visible to All</option>
              <option value="ADMIN_ONLY">Only Admin</option>
            </select>
            <button onClick={handleSendMessage}>Send</button>
          </div>

          {/* ✅ Message feed with left/right alignment */}
          <div style={{ marginTop: 32, maxWidth: 700, marginInline: "auto" }}>
            <h3 style={{ textAlign: 'left' }}>Messages:</h3>
            {loadingHistory && <p>Loading history…</p>}
            {messages.map((msg, i) => {
              const isOwn = user ? (msg.actualSender ? msg.actualSender === user.name : msg.sender === user.name) : false;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginTop: 8 }}>
                  <div
                    style={{
                      maxWidth: '75%',
                      background: isOwn ? '#0d6efd' : '#f2f2f2',
                      color: isOwn ? '#fff' : '#222',
                      padding: '8px 12px',
                      borderRadius: 12,
                      borderTopRightRadius: isOwn ? 2 : 12,
                      borderTopLeftRadius: isOwn ? 12 : 2,
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
                      {msg.sender}
                      {isAdmin && msg.sender === 'Anonymous' && msg.actualSender ? ` (${msg.actualSender})` : ''}
                      {msg.visibility === 'ADMIN_ONLY' ? (
                        <span style={{ color: isOwn ? '#ffd2d2' : '#c00', marginLeft: 8 }}>(Admin Only)</span>
                      ) : null}
                    </div>
                    <div>{msg.message}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p>Loading user...</p>
      )}
    </div>
  );
}
