import { useEffect, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BoardRoomPage from "./BoardRoomPage";

const REDIRECT_KEY = "tb.redirect";

// Loading skeleton component
const LoadingSkeleton = () => (
  <div className="flex h-screen items-center justify-center bg-slate-100">
    <div className="flex flex-col items-center gap-4">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-500" />
      <p className="text-sm text-slate-600">Loading...</p>
    </div>
  </div>
);

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Immediate synchronous check (non-blocking for render)
    const token = localStorage.getItem("token");
    
    if (!token) {
      localStorage.setItem(REDIRECT_KEY, `${location.pathname}${location.search}`);
      navigate("/");
    }
  }, [location.pathname, location.search, navigate]);

  // Render immediately (non-blocking) - Suspense handles loading state
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <BoardRoomPage />
    </Suspense>
  );
}

export default App;
