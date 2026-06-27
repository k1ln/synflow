import React from "react";

type OpenDialogProps = {
  open: boolean;
  items: string[];
  onSelect: (item: string) => void;
  onClose: () => void;
  title?: string;
};

export const OpenDialog: React.FC<OpenDialogProps> = ({ open, items, onSelect, onClose, title }) => {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#222",
          color: "#fff",
          padding: "24px",
          borderRadius: "8px",
          minWidth: "320px",
          maxHeight: "80vh",
          boxShadow: "0 2px 16px #000",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column"
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ marginBottom: "16px", fontWeight: "bold", fontSize: "1.2em" }}>
          {title || "Open Item"}
        </div>
        <ol style={{ paddingLeft: "20px", flex: 1, overflowY: "auto", marginBottom: "16px" }}>
          {items.map((item, idx) => (
        <li key={item} style={{ margin: "8px 0" }}>
          <button
            style={{
          background: "#444",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          padding: "8px 16px",
          cursor: "pointer",
          width: "100%",
          textAlign: "left"
            }}
            onClick={() => onSelect(item)}
          >
            {item}
          </button>
        </li>
          ))}
        </ol>
        <button
          style={{
        marginTop: "auto",
        background: "#666",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        padding: "8px 16px",
        cursor: "pointer"
          }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default OpenDialog;