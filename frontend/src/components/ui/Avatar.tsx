import { useEffect, useState } from "react";
import axios from "axios";

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

// userId -> object URL, or null when the user has no uploaded avatar. Module-level so every
// member list shares one fetch per user instead of refetching on each render.
const cache = new Map<string, string | null>();
const listeners = new Set<() => void>();
// People whose photo we know exists (e.g. you just uploaded yours) even if the board payload predates it
const known = new Set<string>();

export const invalidateAvatar = (userId: string) => {
  known.add(userId);
  const url = cache.get(userId);
  if (url) URL.revokeObjectURL(url);
  cache.delete(userId);
  listeners.forEach((l) => l());
};

/** Uploaded photo if the person has one, otherwise their initials. */
/** `hasAvatar` comes with the member list, so people without a photo cost zero requests. */
export const Avatar = ({
  userId,
  name,
  hasAvatar,
  className = "",
}: {
  userId: string;
  name: string;
  hasAvatar?: boolean;
  className?: string;
}) => {
  const [, force] = useState(0);
  const cached = cache.get(userId);

  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  useEffect(() => {
    if (cache.has(userId)) return;
    if (!hasAvatar && !known.has(userId)) return;
    let alive = true;
    const token = localStorage.getItem("token");
    axios
      .get(`${BACKEND}/api/users/${userId}/avatar`, {
        responseType: "blob",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((res) => {
        cache.set(userId, URL.createObjectURL(res.data));
        if (alive) force((n) => n + 1);
      })
      .catch(() => {
        cache.set(userId, null); // 404 = no avatar; also don't hammer the API on other errors
        if (alive) force((n) => n + 1);
      });
    return () => {
      alive = false;
    };
  }, [userId, cached, hasAvatar]);

  return cached ? (
    <img src={cached} alt="" className={`shrink-0 object-cover ${className}`} />
  ) : (
    <span className={`grid shrink-0 place-items-center bg-slate-100 text-[11px] font-semibold text-slate-600 ${className}`}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
};
