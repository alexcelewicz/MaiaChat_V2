import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "MaiaChat - Self-Hosted AI Assistant Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
            boxShadow: "0 8px 32px rgba(99, 102, 241, 0.3)",
          }}
        >
          <span style={{ color: "white", fontSize: 42, fontWeight: 700 }}>M</span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: "white",
            marginBottom: 12,
            display: "flex",
          }}
        >
          MaiaChat
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 24,
            color: "#a1a1aa",
            marginBottom: 32,
            textAlign: "center",
            maxWidth: 700,
            display: "flex",
          }}
        >
          Self-Hosted AI Assistant Platform
        </div>

        {/* Feature pills */}
        <div style={{ display: "flex", gap: 12 }}>
          {["40+ Models", "Multi-Channel", "Self-Hosted", "Open Source"].map(
            (label) => (
              <div
                key={label}
                style={{
                  padding: "8px 20px",
                  borderRadius: 999,
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  color: "#a5b4fc",
                  fontSize: 16,
                  fontWeight: 500,
                  display: "flex",
                }}
              >
                {label}
              </div>
            )
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
