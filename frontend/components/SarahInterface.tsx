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

// AgentAudioVisualizerAura is installed via:
// npx shadcn@latest add @agents-ui/agent-audio-visualizer-aura
// It lands at components/agents-ui/agent-audio-visualizer-aura.tsx
// If not yet installed, the BarVisualizer fallback renders instead.
let AgentAudioVisualizerAura: React.ComponentType<{
  size?: "sm" | "md" | "lg" | "xl";
  state?: string;
  color?: string;
  colorShift?: number;
  themeMode?: string;
  audioTrack?: unknown;
  className?: string;
}> | null = null;

try {
  // Dynamic require so the file compiles even before shadcn install
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AgentAudioVisualizerAura = require("@/components/agents-ui/agent-audio-visualizer-aura").AgentAudioVisualizerAura;
} catch {
  // Component not yet installed — will use BarVisualizer fallback below
}

interface Props {
  roomName: string;
  onEndCall: () => void;
}

type CallPhase = "connecting" | "greeting" | "listening" | "thinking" | "speaking" | "idle";

export function SarahInterface({ roomName, onEndCall }: Props) {
  const { state, audioTrack, agentAudioTrack } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  const [phase,       setPhase]       = useState<CallPhase>("connecting");
  const [callSeconds, setCallSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
    if (phase !== "connecting") {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setCallSeconds((s) => s + 1), 1000);
      }
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [phase]);

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

  // Aura color: gold when Sarah speaks, green when listening, indigo when thinking
  const auraColor =
    phase === "listening" ? "#22c55e" :
    phase === "thinking"  ? "#818cf8" :
    "#b8892a"; // gold for speaking/greeting/idle

  return (
    <div style={styles.shell}>
      {/* ── Left panel ── */}
      <div style={styles.leftPanel}>

        {/* Parrish branding */}
        <div style={styles.brand}>
          <div style={styles.brandLogo}>P</div>
          <div>
            <p style={styles.brandCompany}>PARRISH PROPERTIES</p>
            <p style={styles.brandSub}>HER-AI Voice Platform</p>
          </div>
        </div>

        {/* ── AURA VISUALIZER (centre piece) ── */}
        <div style={styles.auraWrap}>
          {AgentAudioVisualizerAura ? (
            // Installed via shadcn — full WebGL shader aura
            <AgentAudioVisualizerAura
              size="lg"
              state={state}
              color={auraColor}
              colorShift={0.9}
              themeMode="dark"
              audioTrack={agentAudioTrack}
              className="w-full h-full"
            />
          ) : (
            // Fallback: avatar + BarVisualizer until shadcn install runs
            <div style={styles.auraFallback}>
              <div style={{
                ...styles.avatarRing,
                boxShadow: phase === "speaking"
                  ? `0 0 0 12px rgba(184,137,42,0.15), 0 0 0 24px rgba(184,137,42,0.07)`
                  : `0 0 0 8px rgba(184,137,42,0.08)`,
              }}>
                <div style={styles.avatar}>S</div>
              </div>
              <div style={styles.barVizWrap}>
                {agentAudioTrack ? (
                  <BarVisualizer
                    trackRef={agentAudioTrack}
                    state={state}
                    barCount={24}
                    style={{ height: 52, width: "100%" }}
                    options={{ minHeight: 3 }}
                  />
                ) : (
                  <div style={styles.barsPlaceholder}>
                    {[...Array(24)].map((_, i) => (
                      <div key={i} style={{ ...styles.bar, height: 3 + (i % 5) * 3, opacity: 0.18 }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Agent name + title */}
        <div style={styles.agentMeta}>
          <p style={styles.agentName}>Sarah Mitchell</p>
          <p style={styles.agentTitle}>Real Estate Specialist</p>
        </div>

        {/* Status pill */}
        <div style={styles.statusPill}>
          <span style={{ ...styles.statusDot, background: phaseColor[phase] }} />
          <span style={{ color: phaseColor[phase], fontWeight: 500, fontSize: 12 }}>
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
              background: isMicrophoneEnabled ? "rgba(255,255,255,0.08)" : "rgba(220,38,38,0.15)",
              border: `1px solid ${isMicrophoneEnabled ? "rgba(255,255,255,0.15)" : "rgba(220,38,38,0.4)"}`,
              color: isMicrophoneEnabled ? "rgba(255,255,255,0.85)" : "#f87171",
            }}
          >
            {isMicrophoneEnabled ? <MicOnIcon /> : <MicOffIcon />}
            <span style={{ fontSize: 11 }}>{isMicrophoneEnabled ? "Mute" : "Unmute"}</span>
          </TrackToggle>

          <DisconnectButton onClick={onEndCall} style={styles.endBtn}>
            <PhoneOffIcon />
            <span style={{ fontSize: 11 }}>End Call</span>
          </DisconnectButton>
        </div>

        {/* Room badge */}
        <div style={styles.roomBadge}>{roomName}</div>

        {/* Install hint if aura not installed */}
        {!AgentAudioVisualizerAura && (
          <div style={styles.installHint}>
            Run <code style={styles.code}>npx shadcn@latest add @agents-ui/agent-audio-visualizer-aura</code> for the WebGL aura
          </div>
        )}
      </div>

      {/* ── Right panel: live transcript ── */}
      <div style={styles.rightPanel}>
        <div style={styles.transcriptHeader}>
          <h2 style={styles.transcriptTitle}>Conversation</h2>
          <span style={styles.transcriptLive}>● LIVE</span>
        </div>

        <div style={styles.transcriptBody}>
          <div style={styles.transcriptEmpty}>
            <WaveIcon />
            <p>Sarah will greet you shortly.<br />Your conversation appears here in real time.</p>
          </div>
        </div>

        {/* Mic indicator bar */}
        <div style={styles.micStatus}>
          <div style={{
            ...styles.micDot,
            background: isMicrophoneEnabled && phase === "listening" ? "#22c55e" : "#374151",
            boxShadow: isMicrophoneEnabled && phase === "listening"
              ? "0 0 0 4px rgba(34,197,94,0.2)" : "none",
          }} />
          <span style={styles.micLabel}>
            {isMicrophoneEnabled
              ? phase === "listening" ? "Mic active — speak now" : "Mic on"
              : "Mic muted — click to unmute"}
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
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 9.12 19.79 19.79 0 01.1.5 2 2 0 012.08 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.07 7.9a16 16 0 002.61 3.41"/><line x1="23" y1="1" x2="1" y2="23"/></svg>;
}
function WaveIcon() {
  return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"><path d="M2 12h2M6 8v8M10 5v14M14 9v6M18 7v10M22 12h-2"/></svg>;
}

// ── Styles (dark theme for the left panel) ────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    height: "100vh",
    fontFamily: "'DM Sans', sans-serif",
    background: "#0d1117",
  },
  leftPanel: {
    width: 320,
    flexShrink: 0,
    background: "#0d1117",
    borderRight: "1px solid rgba(255,255,255,0.07)",
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
    borderBottom: "1px solid rgba(255,255,255,0.07)",
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
  brandSub: { fontSize: 11, color: "rgba(255,255,255,0.35)" },

  // Aura container — square, fills the panel width
  auraWrap: {
    width: "100%",
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    overflow: "hidden",
    background: "rgba(255,255,255,0.02)",
  },
  // Fallback when shadcn component not installed
  auraFallback: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "1.25rem",
    width: "100%",
    height: "100%",
  },
  avatarRing: {
    borderRadius: "50%",
    padding: 6,
    background: "rgba(255,255,255,0.03)",
    transition: "box-shadow 0.5s ease",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #b8892a, #d4a84b)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontFamily: "'Playfair Display', serif",
    fontSize: 48,
    fontWeight: 700,
  },
  barVizWrap: {
    width: "100%",
    height: 52,
    display: "flex",
    alignItems: "center",
    padding: "0 0.5rem",
  },
  barsPlaceholder: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    width: "100%",
    justifyContent: "center",
  },
  bar: {
    width: 3,
    borderRadius: 2,
    background: "#b8892a",
  },

  agentMeta: { textAlign: "center" as const },
  agentName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    fontWeight: 600,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 1.2,
  },
  agentTitle: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 },

  statusPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 14px",
    borderRadius: 100,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: 12,
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
    fontSize: 30,
    fontWeight: 300,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: "0.06em",
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
    background: "rgba(220,38,38,0.85)",
    border: "1px solid rgba(220,38,38,0.6)",
    color: "white",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 500,
    fontSize: 11,
    transition: "all 0.15s ease",
  },
  roomBadge: {
    fontSize: 10,
    color: "rgba(255,255,255,0.2)",
    textAlign: "center" as const,
    fontFamily: "monospace",
    letterSpacing: "0.04em",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  installHint: {
    fontSize: 10,
    color: "rgba(255,255,255,0.25)",
    textAlign: "center" as const,
    lineHeight: 1.5,
    padding: "0.5rem",
    borderRadius: 6,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    maxWidth: "100%",
  },
  code: {
    fontFamily: "monospace",
    color: "#b8892a",
    display: "block",
    marginTop: 2,
    fontSize: 9,
    wordBreak: "break-all" as const,
  },

  // Right panel (light)
  rightPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    background: "#f7f3ee",
    overflow: "hidden",
  },
  transcriptHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1.5rem 2rem 1rem",
    borderBottom: "1px solid #efe9e0",
    background: "white",
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