import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
// TASK 3.1: Lazy load BoardRoomPage for code splitting
const BoardRoomPage = lazy(() => import("./BoardRoomPage"));
import Landing from "./pages/Landing";
import "./index.css";

// TASK 3.1: Loading skeleton for lazy-loaded components
const LoadingSkeleton = () => (
  <div className="flex h-screen items-center justify-center bg-slate-100">
    <div className="flex flex-col items-center gap-4">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-500" />
      <p className="text-sm text-slate-600">Loading...</p>
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID as string}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<App />} />
          <Route 
            path="/board/:boardCode" 
            element={
              <Suspense fallback={<LoadingSkeleton />}>
                <BoardRoomPage />
              </Suspense>
            } 
          />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
