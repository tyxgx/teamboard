# RTM Diagnostic Script (Browser Console)

Run this in your browser console to check RTM status:

```javascript
// RTM Diagnostic Script (Browser Console Compatible)
console.log('=== RTM DIAGNOSTIC ===');

// Check RTM enabled status
const rtmLocalStorage = localStorage.getItem('tb.rtm') === '1';
const rtmEnv = typeof window !== 'undefined' && window.__VITE_RTM_ENABLED__ === 'true';
console.log('RTM Enabled (localStorage):', rtmLocalStorage);
console.log('RTM Enabled (env):', rtmEnv);
console.log('RTM Enabled (combined):', rtmLocalStorage || rtmEnv);

// Check Socket
const socket = typeof window !== 'undefined' ? window.__socket__ : null;
console.log('Socket exists:', !!socket);
if (socket) {
  console.log('Socket Connected:', socket.connected);
  console.log('Socket ID:', socket.id);
  console.log('Socket Transport:', socket.io?.engine?.transport?.name);
  console.log('Socket Rooms:', socket.rooms || 'N/A');
} else {
  console.warn('⚠️ Socket not found on window.__socket__');
}

// Check Backend URL
const backendUrl = typeof window !== 'undefined' ? window.__socketBackend__ : null;
console.log('Backend URL:', backendUrl);

// Check if listeners are registered
if (socket) {
  const listeners = socket._callbacks || socket.listeners || {};
  console.log('Socket has message:ack listener:', !!listeners['message:ack']);
  console.log('Socket has message:new listener:', !!listeners['message:new']);
  console.log('Socket has receive-message listener:', !!listeners['receive-message']);
}

console.log('====================');
```

## Quick Test: Send Message and Check ACK

After running the diagnostic above, send a message and then run:

```javascript
// Check if ACK was received (run this AFTER sending a message)
console.log('=== MESSAGE ACK CHECK ===');
console.log('Check browser console for: [rt] 📨 Received message:ack');
console.log('If you see it, ACK is working!');
console.log('If you don\'t see it, check Render logs for: [rtm] Emitting message:ack');
console.log('========================');
```

