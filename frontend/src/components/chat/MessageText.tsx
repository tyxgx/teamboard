import { Fragment, useMemo } from "react";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Renders message text with "@Full Name" mentions highlighted. Uses the same rule as the server
 * (case-insensitive, must not run into another letter), so what lights up is what actually notified.
 */
export const MessageText = ({
  text,
  mentionNames,
  selfName,
  isOwn,
}: {
  text: string;
  mentionNames: string[];
  selfName?: string;
  isOwn: boolean;
}) => {
  const regex = useMemo(() => {
    if (!mentionNames.length) return null;
    const alternation = [...mentionNames]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|");
    return new RegExp(`(^|[^\\w])(@(?:${alternation}))(?![\\p{L}\\p{N}_])`, "giu");
  }, [mentionNames]);

  if (!regex || !text.includes("@")) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(regex)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) parts.push(text.slice(last, start));
    const mention = m[2];
    const isSelf = selfName && mention.slice(1).toLowerCase() === selfName.toLowerCase();
    parts.push(
      <span
        key={start}
        className={`rounded px-1 font-semibold ${
          isOwn
            ? "bg-white/25 text-white"
            : isSelf
              ? "bg-amber-400/30 text-amber-800"
              : "bg-emerald-500/15 text-emerald-700"
        }`}
      >
        {mention}
      </span>
    );
    last = start + mention.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
};
