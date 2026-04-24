"use client";

import { useEffect, useState, useRef } from "react";
import {
  useVoiceAssistant,
  useLocalParticipant,
  BarVisualizer,
  DisconnectButton,
  TrackToggle,
} from "@livekit/components-react";
import { Track } from "livekit-client";

interface Props {
  roomName: string;
  onEndCall: () => void;
}

type CallPhase = "connecting" | "greeting" | "listening" | "thinking" | "speaking" | "idle";

export function SarahInterface({ roomName, onEndCall }: Props) {
  const { state, audioTrack, agentAudioTrack } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  const [phase,       setPhase]       = useState<CallPhase>("connecting");
  const [transcript,  setTranscript]  = useState<{ role: "sarah" | "you"; text: string; ts: number }[]>([]);
  const [callSeconds, setCallSeconds] = useState(0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const timerRef         = useRef<NodeJS.Timeout | null>(null);

  // ── Map LiveKit voice assistant state → our phase ──────────────────────
  useEffect(() => {
    switch (state) {
      case "connecting":   setPhase("connecting"); break;
      case "initializing": setPhase("greeting");   break;
      case "listening":    setPhase("listening");  break;
      case "thinking":     setPhase("thinking");   break;
      case "speaking":     setPhase("speaking");   break;
      default:             setPhase("idle");
    }
  }, [state]);

  // ── Call timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "greeting" || phase === "listening") {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setCallSeconds((s) => s + 1), 1000);
      }
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [phase]);

  // ── Auto-scroll transcript ─────────────────────────────────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const phaseLabel: Record<CallPhase, string> = {
    connecting: "Connecting...",
    greeting:   "Sarah is speaking",
    listening:  "Listening...",
    thinking:   "Sarah is thinking...",
    speaking:   "Sarah is speaking",
    idle:       "On call",
  };

  const phaseColor: Record<CallPhase, string> = {
    connecting: "#7a7268",
    greeting:   "#b8892a",
    listening:  "#22c55e",
    thinking:   "#6366f1",
    speaking:   "#b8892a",
    idle:       "#7a7268",
  };

  return (
    <div style={styles.shell}>
      {/* ── Left panel: Sarah avatar + visualizer ── */}
      <div style={styles.leftPanel}>
        {/* Parrish branding */}
        <div style={styles.brand}>
          <div style={styles.brandLogo}>P</div>
          <div>
            <p style={styles.brandCompany}>PARRISH PROPERTIES</p>
            <p style={styles.brandSub}>HER-AI Voice Platform</p>
          </div>
        </div>

        {/* Avatar */}
        <div style={styles.avatarWrap}>
          <div style={{
            ...styles.avatarRing,
            boxShadow: phase === "speaking"
              ? "0 0 0 8px rgba(184,137,42,0.2), 0 0 0 16px rgba(184,137,42,0.08)"
              : "0 0 0 8px rgba(184,137,42,0.08)",
            transition: "box-shadow 0.4s ease",
          }}>
            <div style={styles.avatar}>S</div>
          </div>
          <div style={styles.avatarName}>Sarah Mitchell</div>
          <div style={styles.avatarTitle}>Real Estate Specialist</div>
        </div>

        {/* Visualizer */}
        <div style={styles.visualizerWrap}>
          {agentAudioTrack ? (
            <BarVisualizer
              trackRef={agentAudioTrack}
              state={state}
              barCount={20}
              style={{ height: 56, width: "100%" }}
              options={{ minHeight: 3 }}
            />
          ) : (
            <div style={styles.visualizerPlaceholder}>
              {[...Array(20)].map((_, i) => (
                <div key={i} style={{
                  ...styles.bar,
                  height: 4 + Math.random() * 6,
                  opacity: 0.2,
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Status */}
        <div style={styles.statusPill}>
          <span style={{ ...styles.statusDot, background: phaseColor[phase] }} />
          <span style={{ color: phaseColor[phase], fontWeight: 500 }}>
            {phaseLabel[phase]}
          </span>
        </div>

        {/* Timer */}
        <div style={styles.timer}>{formatTime(callSeconds)}</div>

        {/* Controls */}
        <div style={styles.controls}>
          <TrackToggle
            source={Track.Source.Microphone}
            style={{
              ...styles.controlBtn,
              background: isMicrophoneEnabled ? "white" : "#fef2f2",
              border: `1px solid ${isMicrophoneEnabled ? "#ddd5c5" : "#fecaca"}`,
              color: isMicrophoneEnabled ? "#0d1117" : "#dc2626",
            }}
          >
            {isMicrophoneEnabled ? <MicOnIcon /> : <MicOffIcon />}
            <span style={{ fontSize: 12 }}>{isMicrophoneEnabled ? "Mute" : "Unmute"}</span>
          </TrackToggle>

          <DisconnectButton
            onClick={onEndCall}
            style={styles.endBtn}
          >
            <PhoneOffIcon />
            <span style={{ fontSize: 12 }}>End Call</span>
          </DisconnectButton>
        </div>

        <div style={styles.roomBadge}>Room: {roomName}</div>
      </div>

      {/* ── Right panel: transcript ── */}
      <div style={styles.rightPanel}>
        <div style={styles.transcriptHeader}>
          <h2 style={styles.transcriptTitle}>Conversation</h2>
          <span style={styles.transcriptLive}>● LIVE</span>
        </div>

        <div style={styles.transcriptBody}>
          {transcript.length === 0 ? (
            <div style={styles.transcriptEmpty}>
              <WaveIcon />
              <p>Sarah will greet you shortly.<br />Your conversation appears here.</p>
            </div>
          ) : (
            transcript.map((msg, i) => (
              <div key={i} style={{
                ...styles.bubble,
                ...(msg.role === "sarah" ? styles.bubbleSarah : styles.bubbleYou),
              }}>
                <div style={styles.bubbleRole}>
                  {msg.role === "sarah" ? "Sarah" : "You"}
                </div>
                <div style={styles.bubbleText}>{msg.text}</div>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Mic indicator */}
        <div style={styles.micStatus}>
          <div style={{
            ...styles.micDot,
            background: isMicrophoneEnabled && phase === "listening" ? "#22c55e" : "#d1d5db",
            boxShadow: isMicrophoneEnabled && phase === "listening"
              ? "0 0 0 4px rgba(34,197,94,0.2)" : "none",
          }} />
          <span style={styles.micLabel}>
            {isMicrophoneEnabled
              ? phase === "listening" ? "Mic active — speak now" : "Mic on"
              : "Mic muted"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────
function MicOnIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>;
}
function MicOffIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/></svg>;
}
function PhoneOffIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 9.12 19.79 19.79 0 01.1 .5 2 2 0 012.08 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.07 7.9a16 16 0 002.61 3.41"/><line x1="23" y1="1" x2="1" y2="23"/></svg>;
}
function WaveIcon() {
  return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ddd5c5" strokeWidth="1.5"><path d="M2 12h2M6 8v8M10 5v14M14 9v6M18 7v10M22 12h-2"/></svg>;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    height: "100vh",
    fontFamily: "'DM Sans', sans-serif",
    background: "#f7f3ee",
  },
  leftPanel: {
    width: 300,
    flexShrink: 0,
    background: "white",
    borderRight: "1px solid #ddd5c5",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "1.5rem 1.5rem 1rem",
    gap: "1rem",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    width: "100%",
    paddingBottom: "1rem",
    borderBottom: "1px solid #efe9e0",
  },
  brandLogo: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #b8892a, #d4a84b)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontFamily: "'Playfair Display', serif",
    fontWeight: 700,
    fontSize: 18,
    flexShrink: 0,
  },
  brandCompany: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.1em",
    color: "#b8892a",
    textTransform: "uppercase" as const,
  },
  brandSub: { fontSize: 11, color: "#7a7268" },
  avatarWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.5rem",
    paddingTop: "0.5rem",
  },
  avatarRing: {
    borderRadius: "50%",
    padding: 4,
    background: "white",
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #b8892a, #d4a84b)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontFamily: "'Playfair Display', serif",
    fontSize: 42,
    fontWeight: 700,
  },
  avatarName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    fontWeight: 600,
    color: "#0d1117",
  },
  avatarTitle: { fontSize: 12, color: "#7a7268" },
  visualizerWrap: {
    width: "100%",
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f7f3ee",
    borderRadius: 10,
    overflow: "hidden",
    padding: "0 0.5rem",
  },
  visualizerPlaceholder: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    height: "100%",
  },
  bar: {
    width: 3,
    borderRadius: 2,
    background: "#b8892a",
  },
  statusPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 100,
    background: "#f7f3ee",
    border: "1px solid #ddd5c5",
    fontSize: 12,
    fontWeight: 500,
    color: "#4a4540",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
    transition: "background 0.3s",
  },
  timer: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 28,
    fontWeight: 300,
    color: "#0d1117",
    letterSpacing: "0.05em",
  },
  controls: {
    display: "flex",
    gap: "0.75rem",
    width: "100%",
    marginTop: "auto",
  },
  controlBtn: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 4,
    padding: "0.75rem 0.5rem",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 500,
    transition: "all 0.15s ease",
  },
  endBtn: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 4,
    padding: "0.75rem 0.5rem",
    borderRadius: 10,
    background: "#dc2626",
    border: "none",
    color: "white",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 500,
    fontSize: 12,
    transition: "all 0.15s ease",
  },
  roomBadge: {
    fontSize: 10,
    color: "#b8c1c8",
    textAlign: "center" as const,
    fontFamily: "monospace",
    letterSpacing: "0.04em",
  },
  rightPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  transcriptHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1.5rem 2rem 1rem",
    borderBottom: "1px solid #efe9e0",
  },
  transcriptTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    fontWeight: 600,
    color: "#0d1117",
  },
  transcriptLive: {
    fontSize: 11,
    fontWeight: 600,
    color: "#22c55e",
    letterSpacing: "0.08em",
  },
  transcriptBody: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "1.5rem 2rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  transcriptEmpty: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "1rem",
    color: "#b8c1c8",
    textAlign: "center" as const,
    fontSize: 14,
    lineHeight: 1.6,
  },
  bubble: {
    maxWidth: "75%",
    padding: "0.875rem 1.125rem",
    borderRadius: 16,
    lineHeight: 1.6,
  },
  bubbleSarah: {
    background: "white",
    border: "1px solid #efe9e0",
    alignSelf: "flex-start" as const,
    borderBottomLeftRadius: 4,
    boxShadow: "0 2px 8px rgba(13,17,23,0.05)",
  },
  bubbleYou: {
    background: "linear-gradient(135deg, #b8892a, #d4a84b)",
    color: "white",
    alignSelf: "flex-end" as const,
    borderBottomRightRadius: 4,
    boxShadow: "0 2px 8px rgba(184,137,42,0.3)",
  },
  bubbleRole: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    marginBottom: 4,
    opacity: 0.6,
  },
  bubbleText: { fontSize: 14 },
  micStatus: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0.875rem 2rem",
    borderTop: "1px solid #efe9e0",
    background: "white",
  },
  micDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
    transition: "all 0.3s ease",
  },
  micLabel: { fontSize: 12, color: "#7a7268", fontWeight: 500 },
};
