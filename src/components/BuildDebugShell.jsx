import { BUILD_DEBUG } from "../config/env.js";

function supabaseProjectRef() {
  try {
    return new URL(String(BUILD_DEBUG.supabaseUrl || "")).hostname.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

const BANNER_TEXT = `BUILD DEBUG · REV ${BUILD_DEBUG.rev} · ${String(BUILD_DEBUG.branch).toUpperCase()} · SUPABASE ${supabaseProjectRef()}`;

const BANNER_HEIGHT = 52;

export function BuildDebugShell({ children }) {
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2147483647,
          margin: 0,
          padding: "14px 16px",
          background: "#dc2626",
          color: "#ffffff",
          fontSize: 15,
          fontWeight: 900,
          letterSpacing: 0.4,
          textAlign: "center",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          lineHeight: 1.25,
          boxShadow: "0 6px 24px rgba(0,0,0,.55), 0 0 0 4px #7f1d1d",
          textTransform: "uppercase",
        }}
      >
        {BANNER_TEXT}
      </div>
      <div
        style={{
          minHeight: "100dvh",
          boxSizing: "border-box",
          border: "8px solid #dc2626",
          paddingTop: BANNER_HEIGHT + 8,
          background: "#fff",
        }}
      >
        {children}
      </div>
    </>
  );
}
