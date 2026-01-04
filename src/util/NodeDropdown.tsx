import React, { useState } from "react";

type NodeDropdownProps = {
  nodeTypes: Record<string, React.FC<any>>;
  onAddNode: (type: string) => void;
};

const NodeDropdown: React.FC<NodeDropdownProps> = ({ nodeTypes, onAddNode }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div style={{ position: "relative" ,zIndex: 20}}>
      {/* Toggle Dropdown Button */}
      <button
        onClick={() => setShowDropdown((prev) => !prev)}
        style={{
          padding: "10px 20px",
          background: "#007bff",
          color: "#fff",
          border: "none",
          width: '113px',
          borderRadius: "5px",
          cursor: "pointer",
        }} // Close dropdown on blur
      >
        + Add Node
      </button>      {/* Dropdown Menu */}
      {showDropdown && (
        <div
          style={{
            marginTop: "2px",
            padding: "2px",
            background: "#333",
            border: "1px solid #ddd",
            borderRadius: "5px",
            boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
            position: "absolute",
            width: "130px",
            maxHeight: "200px",
            overflowY: "auto",
            zIndex: 100,
          }}
        >
          {Object.keys(nodeTypes)
            .sort((a, b) => a.localeCompare(b)) // Sort alphabetically
            .map((type) => (
            <button
              key={type}
              onClick={() => {
                onAddNode(type);
                setShowDropdown(false); // Close dropdown after adding a node
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "4px 8px",
                background: "#333",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                fontSize: "12px",
                color: "#eee",
                borderRadius: "3px",
                marginBottom: "1px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#555";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#333";
              }}
            >
              {type.replace(/([A-Z])/g, " $1").replace(" Node","").replace("Flow","").trim()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default NodeDropdown;