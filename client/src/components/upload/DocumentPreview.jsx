import React from "react";

export default function DocumentPreview({ previewImage, isScanning, onClear }) {
  if (!previewImage) return null;

  return (
    <div className="preview-container" style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        title="Remove Image"
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          background: "rgba(220, 38, 38, 0.9)",
          color: "white",
          border: "none",
          borderRadius: "50%",
          width: "32px",
          height: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
          zIndex: 10
        }}
      >
        <i className="fa-solid fa-xmark"></i>
      </button>

      {previewImage.startsWith("__PDF__:") ? (
        <div>
          <i className="fa-solid fa-file-pdf"></i>
          <h4>{previewImage.replace("__PDF__:", "")}</h4>
          <p>{isScanning ? "Extracting text from PDF document..." : "PDF Document Loaded"}</p>
        </div>
      ) : previewImage.startsWith("__MULTI__:") ? (
        <div>
          <i className="fa-solid fa-copy"></i>
          <h4>{previewImage.split(":")[1]} Files Selected</h4>
          <p>{previewImage.split(":").slice(2).join(":")}</p>
        </div>
      ) : previewImage === "__PROCESSING__" ? (
        <div>
          <i className="fa-solid fa-file-image"></i>
          <p>
            {isScanning
              ? "Processing image — preview will appear after extraction..."
              : "Image uploaded — server-side preview loading..."}
          </p>
        </div>
      ) : (
        <img
          src={previewImage}
          crossOrigin="use-credentials"
          alt="Document Preview"
          className="passport-preview-img"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}

      {isScanning && (
        <div className="processing-overlay">
          <div className="spinner"></div>
          <span>Extracting text...</span>
        </div>
      )}
    </div>
  );
}
