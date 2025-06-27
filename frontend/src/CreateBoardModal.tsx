import React, { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (boardName: string) => void;
};

export default function CreateBoardModal({ open, onClose, onCreate }: Props) {
  const [boardName, setBoardName] = useState("");

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
    }}>
      <div style={{
        background: "#fff", padding: 24, borderRadius: 12, minWidth: 300, boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        display: "flex", flexDirection: "column", gap: 16
      }}>
        <h3 style={{ margin: 0 }}>Create New Board</h3>
        <input
          placeholder="Enter board name"
          value={boardName}
          onChange={e => setBoardName(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 14px" }}>Cancel</button>
          <button
            onClick={() => {
              if (boardName.trim()) {
                onCreate(boardName.trim());
                setBoardName("");
              }
            }}
            style={{ padding: "6px 18px", background: "#007bff", color: "#fff", borderRadius: 6, border: "none" }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}