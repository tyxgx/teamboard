import { useEffect, useState } from "react";
import axios from "axios";

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

/**
 * Attachments are auth-gated (only people who can see the message may fetch the bytes), so an
 * <img src> can't be used: it can't send the Authorization header. Fetch as a blob instead.
 */
export const AttachmentImage = ({ id, mime }: { id: string; mime: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    const token = localStorage.getItem("token");
    axios
      .get(`${BACKEND}/api/attachments/${id}`, {
        responseType: "blob",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((res) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(new Blob([res.data], { type: mime }));
        setUrl(objectUrl);
      })
      .catch(() => !revoked && setFailed(true));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, mime]);

  if (failed) {
    return <div className="mb-1 rounded-xl bg-black/5 px-3 py-6 text-center text-xs opacity-70">Image unavailable</div>;
  }
  if (!url) {
    return <div className="mb-1 h-40 w-56 animate-pulse rounded-xl bg-black/10" aria-label="Loading image" />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mb-1 block">
      <img src={url} alt="Shared image" className="max-h-64 max-w-full rounded-xl object-cover" />
    </a>
  );
};
