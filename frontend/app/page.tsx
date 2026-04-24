"use client";

import { useState, useCallback } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { SarahInterface } from "@/components/SarahInterface";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

export default function Home() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [token,     setToken]     = useState<string>("");
  const [roomName,  setRoomName]  = useState<string>("");
  const [lkUrl,     setLkUrl]     = useState<string>("");
  const [error,     setError]     = useState<string>("");

  const startCall = useCallback(async () => {
    setConnectionState("connecting");
    setError("");
    try {
      const res = await fetch("/api/token", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantName: `user-${Date.now()}` }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setToken(data.token);
      setRoomName(data.roomName);
      setLkUrl(data.url);
      setConnectionState("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
      setConnectionState("error");
    }
  }, []);

  const endCall = useCallback(() => {
    setConnectionState("idle");
    setToken("");
    setRoomName("");
  }, []);

  // ── Idle / Error state ─────────────────────────────────────────────────
  if (connectionState !== "connected") {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.logoMark}>P</div>
            <div>
              <p style={styles.company}>PARRISH GLOBAL AI SOLUTIONS</p>
              <h1 style={styles.agentName}>Sarah Mitchell</h1>
              <p style={styles.tagline}>Real Estate Specialist · 15 Years Experience</p>
            </div>
          </div>

          {/* Divider */}
          <div style={styles.divider} />

          {/* Description */}
          <p style={styles.description}>
            Talk directly with Sarah, Parrish Properties' AI real estate specialist.
            She's here to understand your situation and explore solutions — no pressure,
            no scripts. Just a real conversation.
          </p>

          {/* Status indicators */}
          <div style={styles.statusRow}>
            {["AssemblyAI STT", "Claude LLM", "Cartesia Voice"].map((s) => (
              <div key={s} style={styles.statusBadge}>
                <span style={styles.dot} />
                {s}
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={startCall}
            disabled={connectionState === "connecting"}
            style={{
              ...styles.callButton,
              ...(connectionState === "connecting" ? styles.callButtonDisabled : {}),
            }}
          >
            {connectionState === "connecting" ? (
              <span style={styles.buttonInner}>
                <span style={styles.spinner} />
                Connecting Sarah...
              </span>
            ) : (
              <span style={styles.buttonInner}>
                <PhoneIcon />
                Start Call with Sarah
              </span>
            )}
          </button>

          {/* Error */}
          {error && (
            <div style={styles.errorBox}>
              <strong>Connection error:</strong> {error}
            </div>
          )}

          {/* Footer */}
          <p style={styles.footer}>
            "We Are The Hope." — Parrish Global AI Solutions
          </p>
        </div>
      </main>
    );
  }

  // ── Connected state ────────────────────────────────────────────────────
  return (
    <LiveKitRoom
      token={token}
      serverUrl={lkUrl}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={endCall}
      style={{ height: "100vh", background: "var(--paper)" }}
    >
      <RoomAudioRenderer />
      <SarahInterface roomName={roomName} onEndCall={endCall} />
    </LiveKitRoom>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────
function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.1 1.18 2 2 0 012.08 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.19 7.9a16 16 0 006.72 6.72l1.26-1.26a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
    </svg>
  );
}

// ── Inline styles ────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    background: "linear-gradient(135deg, #f7f3ee 0%, #efe9e0 100%)",
  },
  card: {
    background: "white",
    borderRadius: 20,
    padding: "3rem",
    maxWidth: 480,
    width: "100%",
    boxShadow: "0 20px 60px rgba(13,17,23,0.12), 0 4px 16px rgba(13,17,23,0.06)",
    border: "1px solid #ddd5c5",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "1.25rem",
    marginBottom: "1.5rem",
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #b8892a, #d4a84b)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontFamily: "'Playfair Display', serif",
    fontSize: 24,
    fontWeight: 700,
    flexShrink: 0,
    boxShadow: "0 4px 12px rgba(184,137,42,0.35)",
  },
  company: {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.12em",
    color: "#b8892a",
    textTransform: "uppercase" as const,
    marginBottom: 2,
  },
  agentName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 26,
    fontWeight: 700,
    color: "#0d1117",
    lineHeight: 1.1,
  },
  tagline: {
    fontSize: 13,
    color: "#7a7268",
    marginTop: 2,
  },
  divider: {
    height: 1,
    background: "linear-gradient(to right, transparent, #ddd5c5, transparent)",
    margin: "1.5rem 0",
  },
  description: {
    fontSize: 15,
    lineHeight: 1.65,
    color: "#4a4540",
    marginBottom: "1.5rem",
  },
  statusRow: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
    marginBottom: "2rem",
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 100,
    background: "#f0fdf4",
    border: "1px solid #86efac",
    fontSize: 11,
    fontWeight: 500,
    color: "#166534",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#22c55e",
    display: "inline-block",
  },
  callButton: {
    width: "100%",
    padding: "1rem 1.5rem",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #b8892a, #d4a84b)",
    color: "white",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "0 4px 16px rgba(184,137,42,0.4)",
    fontFamily: "'DM Sans', sans-serif",
    marginBottom: "1.25rem",
  },
  callButtonDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
  buttonInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.625rem",
  },
  spinner: {
    width: 18,
    height: 18,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "white",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
  },
  errorBox: {
    padding: "0.75rem 1rem",
    borderRadius: 8,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    fontSize: 13,
    marginBottom: "1rem",
  },
  footer: {
    textAlign: "center" as const,
    fontSize: 12,
    color: "#b8892a",
    fontStyle: "italic",
    marginTop: "0.5rem",
  },
};
