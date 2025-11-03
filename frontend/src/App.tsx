import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BoardRoomPage from "./BoardRoomPage";

const REDIRECT_KEY = "tb.redirect";

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      localStorage.setItem(REDIRECT_KEY, `${location.pathname}${location.search}`);
      navigate("/");
    }
  }, [location.pathname, location.search, navigate]);

  return <BoardRoomPage />;
}

export default App;
