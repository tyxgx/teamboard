import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

export default function Landing() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const buttonRenderedRef = useRef(false);

  // If token exists, fetch user
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios
      .get(`${BACKEND}/api/test-auth`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setUser({ name: res.data.user.name, email: res.data.user.email }))
      .catch(() => setUser(null));
  }, []);

  // Google One Tap callback
  const handleCallbackResponse = async (response: { credential: string }) => {
    try {
      setAuthenticating(true);
      setAuthError(null);
      const idToken = response.credential;
      const res = await axios.post(`${BACKEND}/api/auth/google`, { idToken });
      const token = res.data.token;
      localStorage.setItem('token', token);
      const me = await axios.get(`${BACKEND}/api/test-auth`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser({ name: me.data.user.name, email: me.data.user.email });
      setAuthenticating(false);
    } catch (e) {
      console.error('Google login error', e);
      setAuthError('Sign-in failed. Check console/network and env.');
      setAuthenticating(false);
    }
  };

  // Render Google button
  useEffect(() => {
    const tryRender = () => {
      // @ts-ignore global
      if (!buttonRenderedRef.current && window.google?.accounts?.id) {
        // @ts-ignore global
        google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
          callback: handleCallbackResponse,
        });
        // @ts-ignore global
        google.accounts.id.renderButton(document.getElementById('signInDiv')!, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
        });
        // Also show One Tap prompt (non-blocking)
        // @ts-ignore global
        google.accounts.id.prompt();
        buttonRenderedRef.current = true;
        return true;
      }
      return false;
    };

    // Try immediately, then poll briefly in case script loads late
    if (!tryRender()) {
      const id = setInterval(() => {
        if (tryRender()) clearInterval(id);
      }, 200);
      // Safety timeout to stop polling after 10s
      setTimeout(() => clearInterval(id), 10000);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const handleCreateBoard = async () => {
    const token = localStorage.getItem('token');
    if (!token || !boardName.trim()) return;
    setCreating(true);
    try {
      const res = await axios.post(
        `${BACKEND}/api/boards`,
        { name: boardName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      window.location.href = `/board/${res.data.code}`;
    } catch (e) {
      setCreating(false);
    }
  };

  const handleJoinBoard = async () => {
    const token = localStorage.getItem('token');
    if (!token || !joinCode.trim()) return;
    try {
      const res = await axios.post(
        `${BACKEND}/api/boards/join`,
        { code: joinCode.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const code = res.data?.board?.code || res.data?.code;
      window.location.href = `/board/${code}`;
    } catch (e) {
      // ignore
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 720, textAlign: 'center' }}>
        <h1 style={{ fontSize: 56, fontFamily: 'cursive', marginBottom: 8 }}>TeamBoard</h1>
        <p style={{ color: '#555', marginBottom: 24 }}>
          Speak freely. Real-time team feedback with optional anonymity and admin-only sharing.
        </p>

        {!user ? (
          <>
            <div id="signInDiv" style={{ display: 'inline-block', marginTop: 12 }} />
            {authenticating && (
              <p style={{ marginTop: 8, color: '#555' }}>Signing in…</p>
            )}
            {authError && (
              <p style={{ marginTop: 8, color: '#c00' }}>{authError}</p>
            )}
          </>
        ) : (
          <div style={{ marginTop: 12 }}>
            <p style={{ marginBottom: 16 }}>Welcome, <b>{user.name}</b></p>
            <button onClick={handleLogout} style={{ padding: '6px 12px', marginBottom: 16 }}>
              Logout
            </button>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Enter board name"
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd', minWidth: 240 }}
              />
              <button
                onClick={handleCreateBoard}
                disabled={creating}
                style={{ padding: '8px 14px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6 }}
              >
                {creating ? 'Creating…' : 'Create Board'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Enter join code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd', minWidth: 240 }}
              />
              <button
                onClick={handleJoinBoard}
                style={{ padding: '8px 14px', background: '#198754', color: '#fff', border: 'none', borderRadius: 6 }}
              >
                Join Board
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
