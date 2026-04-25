"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  useVoiceAssistant,
  useLocalParticipant,
  BarVisualizer,
  DisconnectButton,
  TrackToggle,
  useTrackTranscription,
  useRoomContext,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";

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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AgentAudioVisualizerAura = require("@/components/agents-ui/agent-audio-visualizer-aura").AgentAudioVisualizerAura;
} catch { /* fallback */ }

interface Props {
  roomName: string;
  onEndCall: () => void;
}

type CallPhase = "connecting" | "greeting" | "listening" | "thinking" | "speaking" | "idle";

interface TranscriptEntry {
  id: string;
  role: "sarah" | "you";
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

// Strip SSML/emotion tags — they're for TTS, not display
function cleanText(raw: string): string {
  return raw
    .replace(/<emotion[^>]*\/>/g, "")
    .replace(/<break[^>]*\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function SarahInterface({ roomName, onEndCall }: Props) {
  // useVoiceAssistant gives: state, audioTrack (agent's), agentAudioTrack
  // exact property names differ by @livekit/components-react version
  const voiceAssistant = useVoiceAssistant();
  const state = voiceAssistant.state;
  // Try both property names — newer versions use audioTrack, some use agentAudioTrack
  const agentTrack = (voiceAssistant as unknown as Record<string,unknown>).agentAudioTrack
    ?? (voiceAssistant as unknown as Record<string,unknown>).audioTrack
    ?? undefined;

  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const room = useRoomContext();

  const [phase,       setPhase]       = useState<CallPhase>("connecting");
  const [callSeconds, setCallSeconds] = useState(0);
  const [messages,    setMessages]    = useState<TranscriptEntry[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const timerRef         = useRef<NodeJS.Timeout | null>(null);

  // ── Phase mapping ──────────────────────────────────────────────────────
  useEffect(() => {
    const map: Record<string, CallPhase> = {
      connecting: "connecting", initializing: "greeting",
      listening: "listening", thinking: "thinking",
      speaking: "speaking",
    };
    setPhase(map[state] ?? "idle");
  }, [state]);

  // ── Timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "connecting" && !timerRef.current) {
      timerRef.current = setInterval(() => setCallSeconds(s => s + 1), 1000);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [phase]);

  // ── Capture transcripts via RoomEvent ──────────────────────────────────
  // This works across all @livekit/components-react versions because it
  // uses the underlying livekit-client RoomEvent directly
  useEffect(() => {
    if (!room) return;

    const handleTranscription = (segments: unknown[], participant: unknown) => {
      const segs = segments as Array<{
        id?: string; text?: string; final?: boolean; isFinal?: boolean;
        firstReceivedTime?: number; language?: string;
      }>;
      const p = participant as { identity?: string } | undefined;

      setMessages(prev => {
        const updated = [...prev];
        for (const seg of segs) {
          const text = cleanText(seg.text ?? "");
          if (!text) continue;

          const id      = seg.id ?? `${Date.now()}-${Math.random()}`;
          const isFinal = seg.isFinal ?? seg.final ?? false;
          const role: TranscriptEntry["role"] =
            p?.identity?.includes("agent") || p?.identity?.includes("sarah") || p?.identity?.includes("her-ai")
              ? "sarah" : "you";

          const idx = updated.findIndex(m => m.id === id);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], text, isFinal };
          } else {
            updated.push({ id, role, text, isFinal, timestamp: new Date(seg.firstReceivedTime ?? Date.now()) });
          }
        }
        return updated;
      });
    };

    // RoomEvent.TranscriptionReceived fires for both agent and user transcripts
    room.on(RoomEvent.TranscriptionReceived, handleTranscription);
    return () => { room.off(RoomEvent.TranscriptionReceived, handleTranscription); };
  }, [room]);

  // ── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Copy transcript ────────────────────────────────────────────────────
  const copyTranscript = useCallback(() => {
    const finalMsgs = messages.filter(m => m.isFinal);
    const lines = finalMsgs.map(m => {
      const t = m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return `[${t}] ${m.role === "sarah" ? "Sarah" : "You"}: ${m.text}`;
    }).join("\n");
    navigator.clipboard.writeText(
      `HER-AI Sarah — Call Transcript\nRoom: ${roomName}\nDate: ${new Date().toLocaleString()}\n${"─".repeat(50)}\n\n${lines}`
    ).then(() => { setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); });
  }, [messages, roomName]);

  // ── Download transcript ────────────────────────────────────────────────
  const downloadTranscript = useCallback(() => {
    const finalMsgs = messages.filter(m => m.isFinal);
    const lines = finalMsgs.map(m => {
      const t = m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return `[${t}] ${m.role === "sarah" ? "Sarah Mitchell (AI)" : "Caller"}:\n${m.text}\n`;
    }).join("\n");
    const content = `HER-AI SARAH — CALL TRANSCRIPT\nParrish Global AI Solutions\n${"═".repeat(50)}\nRoom:   ${roomName}\nDate:   ${new Date().toLocaleString()}\nLength: ${formatTime(callSeconds)}\n${"═".repeat(50)}\n\n${lines}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `sarah-transcript-${roomName}.txt`; a.click();
    URL.revokeObjectURL(url);
  }, [messages, roomName, callSeconds]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const phaseLabel: Record<CallPhase, string> = {
    connecting: "Connecting...", greeting: "Sarah is speaking",
    listening: "Listening...", thinking: "Sarah is thinking...",
    speaking: "Sarah is speaking", idle: "On call",
  };
  const phaseColor: Record<CallPhase, string> = {
    connecting: "#7a7268", greeting: "#b8892a", listening: "#22c55e",
    thinking: "#818cf8", speaking: "#b8892a", idle: "#7a7268",
  };
  const auraColor = phase === "listening" ? "#22c55e" : phase === "thinking" ? "#818cf8" : "#b8892a";

  const finalMsgs   = messages.filter(m => m.isFinal);
  const interimMsg  = messages.find(m => !m.isFinal);

  return (
    <div style={styles.shell}>
      {/* ══ LEFT PANEL ══ */}
      <div style={styles.leftPanel}>
        <div style={styles.brand}>
          <div style={styles.brandLogo}>P</div>
          <div>
            <p style={styles.brandCompany}>PARRISH PROPERTIES</p>
            <p style={styles.brandSub}>HER-AI Voice Platform</p>
          </div>
        </div>

        <div style={styles.auraWrap}>
          {AgentAudioVisualizerAura ? (
            <AgentAudioVisualizerAura size="lg" state={state} color={auraColor}
              colorShift={0.9} themeMode="dark" audioTrack={agentTrack} className="w-full h-full" />
          ) : (
            <div style={styles.auraFallback}>
              <div style={{ ...styles.avatarRing, boxShadow: phase === "speaking"
                ? "0 0 0 12px rgba(184,137,42,0.15), 0 0 0 28px rgba(184,137,42,0.06)"
                : "0 0 0 8px rgba(184,137,42,0.07)", transition: "box-shadow 0.5s ease" }}>
                <div style={styles.avatar}>S</div>
              </div>
              <div style={styles.barVizWrap}>
                {agentTrack ? (
                  <BarVisualizer trackRef={agentTrack as Parameters<typeof BarVisualizer>[0]["trackRef"]}
                    state={state} barCount={24} style={{ height: 48, width: "100%" }} options={{ minHeight: 3 }} />
                ) : (
                  <div style={styles.barsPlaceholder}>
                    {[...Array(24)].map((_, i) => (
                      <div key={i} style={{ ...styles.bar, height: 3 + (i % 5) * 3, opacity: 0.15 }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={styles.agentMeta}>
          <p style={styles.agentName}>Sarah Mitchell</p>
          <p style={styles.agentTitle}>Real Estate Specialist</p>
        </div>

        <div style={styles.statusPill}>
          <span style={{ ...styles.statusDot, background: phaseColor[phase] }} />
          <span style={{ color: phaseColor[phase], fontWeight: 500, fontSize: 12 }}>{phaseLabel[phase]}</span>
        </div>

        <div style={styles.timer}>{formatTime(callSeconds)}</div>

        <div style={styles.controls}>
          <TrackToggle source={Track.Source.Microphone} style={{
            ...styles.controlBtn,
            background: isMicrophoneEnabled ? "rgba(255,255,255,0.07)" : "rgba(220,38,38,0.15)",
            border: `1px solid ${isMicrophoneEnabled ? "rgba(255,255,255,0.12)" : "rgba(220,38,38,0.4)"}`,
            color: isMicrophoneEnabled ? "rgba(255,255,255,0.8)" : "#f87171",
          }}>
            {isMicrophoneEnabled ? <MicOnIcon /> : <MicOffIcon />}
            <span style={{ fontSize: 11 }}>{isMicrophoneEnabled ? "Mute" : "Unmute"}</span>
          </TrackToggle>
          <DisconnectButton onClick={onEndCall} style={styles.endBtn}>
            <PhoneOffIcon />
            <span style={{ fontSize: 11 }}>End Call</span>
          </DisconnectButton>
        </div>

        <div style={styles.roomBadge}>{roomName}</div>
      </div>

      {/* ══ RIGHT PANEL — TRANSCRIPT ══ */}
      <div style={styles.rightPanel}>
        <div style={styles.transcriptHeader}>
          <div>
            <h2 style={styles.transcriptTitle}>Conversation</h2>
            <p style={styles.transcriptSub}>
              {finalMsgs.length} message{finalMsgs.length !== 1 ? "s" : ""} · {formatTime(callSeconds)}
            </p>
          </div>
          <div style={styles.headerActions}>
            <span style={styles.liveBadge}>● LIVE</span>
            <button onClick={copyTranscript} disabled={finalMsgs.length === 0}
              style={{ ...styles.actionBtn, opacity: finalMsgs.length === 0 ? 0.4 : 1 }} title="Copy transcript">
              {copySuccess ? <CheckIcon /> : <CopyIcon />}
              <span>{copySuccess ? "Copied!" : "Copy"}</span>
            </button>
            <button onClick={downloadTranscript} disabled={finalMsgs.length === 0}
              style={{ ...styles.actionBtn, opacity: finalMsgs.length === 0 ? 0.4 : 1 }} title="Download .txt">
              <DownloadIcon />
              <span>Save</span>
            </button>
          </div>
        </div>

        <div style={styles.transcriptBody}>
          {finalMsgs.length === 0 && !interimMsg ? (
            <div style={styles.emptyState}>
              <WaveIcon />
              <p style={styles.emptyTitle}>Conversation will appear here</p>
              <p style={styles.emptySubtitle}>Both Sarah&apos;s responses and your words are captured in real time</p>
            </div>
          ) : (
            <>
              {finalMsgs.map(msg => (
                <div key={msg.id} style={{ ...styles.messageRow, flexDirection: msg.role === "you" ? "row-reverse" : "row" }}>
                  <div style={{ ...styles.msgAvatar,
                    background: msg.role === "sarah"
                      ? "linear-gradient(135deg, #b8892a, #d4a84b)"
                      : "linear-gradient(135deg, #1e293b, #334155)" }}>
                    {msg.role === "sarah" ? "S" : "Y"}
                  </div>
                  <div style={{ ...styles.bubble, ...(msg.role === "sarah" ? styles.bubbleSarah : styles.bubbleYou) }}>
                    <div style={styles.bubbleMeta}>
                      <span style={styles.bubbleSpeaker}>{msg.role === "sarah" ? "Sarah Mitchell" : "You"}</span>
                      <span style={styles.bubbleTime}>
                        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                    <p style={styles.bubbleText}>{msg.text}</p>
                  </div>
                </div>
              ))}

              {interimMsg && (
                <div style={{ ...styles.messageRow, flexDirection: interimMsg.role === "you" ? "row-reverse" : "row" }}>
                  <div style={{ ...styles.msgAvatar, opacity: 0.6,
                    background: interimMsg.role === "sarah"
                      ? "linear-gradient(135deg, #b8892a, #d4a84b)"
                      : "linear-gradient(135deg, #1e293b, #334155)" }}>
                    {interimMsg.role === "sarah" ? "S" : "Y"}
                  </div>
                  <div style={{ ...styles.bubble,
                    ...(interimMsg.role === "sarah" ? styles.bubbleSarah : styles.bubbleYou),
                    opacity: 0.65, border: "1px dashed rgba(184,137,42,0.5)" }}>
                    <div style={styles.bubbleMeta}>
                      <span style={styles.bubbleSpeaker}>{interimMsg.role === "sarah" ? "Sarah Mitchell" : "You"}</span>
                      <span style={{ ...styles.bubbleTime, color: "#b8892a" }}>live…</span>
                    </div>
                    <p style={{ ...styles.bubbleText, fontStyle: "italic" }}>{interimMsg.text}</p>
                  </div>
                </div>
              )}

              {phase === "thinking" && (
                <div style={{ ...styles.messageRow, flexDirection: "row" }}>
                  <div style={{ ...styles.msgAvatar, background: "linear-gradient(135deg, #b8892a, #d4a84b)" }}>S</div>
                  <div style={{ ...styles.bubble, ...styles.bubbleSarah }}>
                    <div style={styles.typingDots}>
                      <span style={styles.dot1} /><span style={styles.dot2} /><span style={styles.dot3} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={transcriptEndRef} />
        </div>

        <div style={styles.micBar}>
          <div style={{ ...styles.micDot,
            background: isMicrophoneEnabled && phase === "listening" ? "#22c55e" : "#374151",
            boxShadow: isMicrophoneEnabled && phase === "listening" ? "0 0 0 4px rgba(34,197,94,0.2)" : "none" }} />
          <span style={styles.micLabel}>
            {isMicrophoneEnabled
              ? phase === "listening" ? "Mic active — Sarah is listening" : "Mic on"
              : "Mic muted — click to unmute"}
          </span>
          <span style={styles.msgCount}>{finalMsgs.length > 0 && `${finalMsgs.length} messages`}</span>
        </div>
      </div>
    </div>
  );
}

function MicOnIcon()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>; }
function MicOffIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/></svg>; }
function PhoneOffIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 9.12 19.79 19.79 0 01.1.5 2 2 0 012.08 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.07 7.9a16 16 0 002.61 3.41"/><line x1="23" y1="1" x2="1" y2="23"/></svg>; }
function WaveIcon()     { return <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ddd5c5" strokeWidth="1.5"><path d="M2 12h2M6 8v8M10 5v14M14 9v6M18 7v10M22 12h-2"/></svg>; }
function CopyIcon()     { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>; }
function CheckIcon()    { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>; }
function DownloadIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>; }

const styles: Record<string, React.CSSProperties> = {
  shell: { display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", background: "#0d1117" },
  leftPanel: { width: 300, flexShrink: 0, background: "#0d1117", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem 1.25rem 1rem", gap: "0.875rem" },
  brand: { display: "flex", alignItems: "center", gap: "0.75rem", width: "100%", paddingBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.07)" },
  brandLogo: { width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #b8892a, #d4a84b)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 17, flexShrink: 0 },
  brandCompany: { fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", color: "#b8892a", textTransform: "uppercase" as const },
  brandSub: { fontSize: 10, color: "rgba(255,255,255,0.3)" },
  auraWrap: { width: "100%", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.02)" },
  auraFallback: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: "1rem", width: "100%", height: "100%" },
  avatarRing: { borderRadius: "50%", padding: 5, background: "rgba(255,255,255,0.03)" },
  avatar: { width: 90, height: 90, borderRadius: "50%", background: "linear-gradient(135deg, #b8892a, #d4a84b)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: "'Playfair Display', serif", fontSize: 42, fontWeight: 700 },
  barVizWrap: { width: "100%", height: 48, display: "flex", alignItems: "center", padding: "0 0.5rem" },
  barsPlaceholder: { display: "flex", alignItems: "center", gap: 3, width: "100%", justifyContent: "center" },
  bar: { width: 3, borderRadius: 2, background: "#b8892a" },
  agentMeta: { textAlign: "center" as const },
  agentName: { fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.9)", lineHeight: 1.2 },
  agentTitle: { fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 },
  statusPill: { display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 100, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12 },
  statusDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0, transition: "background 0.3s" },
  timer: { fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 300, color: "rgba(255,255,255,0.65)", letterSpacing: "0.06em" },
  controls: { display: "flex", gap: "0.625rem", width: "100%", marginTop: "auto" },
  controlBtn: { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4, padding: "0.625rem 0.5rem", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, transition: "all 0.15s ease" },
  endBtn: { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4, padding: "0.625rem 0.5rem", borderRadius: 10, background: "rgba(220,38,38,0.85)", border: "1px solid rgba(220,38,38,0.5)", color: "white", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 11 },
  roomBadge: { fontSize: 9, color: "rgba(255,255,255,0.18)", textAlign: "center" as const, fontFamily: "monospace", letterSpacing: "0.04em", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  rightPanel: { flex: 1, display: "flex", flexDirection: "column", background: "#f7f3ee", overflow: "hidden" },
  transcriptHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 1.75rem 1rem", borderBottom: "1px solid #efe9e0", background: "white" },
  transcriptTitle: { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600, color: "#0d1117" },
  transcriptSub: { fontSize: 11, color: "#7a7268", marginTop: 2 },
  headerActions: { display: "flex", alignItems: "center", gap: "0.5rem" },
  liveBadge: { fontSize: 11, fontWeight: 600, color: "#22c55e", letterSpacing: "0.08em", marginRight: "0.25rem" },
  actionBtn: { display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid #ddd5c5", background: "white", color: "#4a4540", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  transcriptBody: { flex: 1, overflowY: "auto" as const, padding: "1.25rem 1.75rem", display: "flex", flexDirection: "column" as const, gap: "1rem" },
  emptyState: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", height: "100%", gap: "0.75rem", textAlign: "center" as const },
  emptyTitle: { fontSize: 15, fontWeight: 500, color: "#9ca3af" },
  emptySubtitle: { fontSize: 13, color: "#b8c1c8", lineHeight: 1.5, maxWidth: 280 },
  messageRow: { display: "flex", alignItems: "flex-start", gap: "0.625rem" },
  msgAvatar: { width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 },
  bubble: { maxWidth: "72%", padding: "0.75rem 1rem", borderRadius: 14, lineHeight: 1.55 },
  bubbleSarah: { background: "white", border: "1px solid #efe9e0", borderBottomLeftRadius: 4, boxShadow: "0 1px 6px rgba(13,17,23,0.06)" },
  bubbleYou: { background: "linear-gradient(135deg, #1a1f2e, #2d3548)", color: "white", borderBottomRightRadius: 4, boxShadow: "0 1px 6px rgba(13,17,23,0.2)" },
  bubbleMeta: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: "1rem" },
  bubbleSpeaker: { fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, opacity: 0.5 },
  bubbleTime: { fontSize: 10, opacity: 0.4, fontFamily: "monospace", flexShrink: 0 },
  bubbleText: { fontSize: 14, margin: 0 },
  typingDots: { display: "flex", gap: 4, alignItems: "center", padding: "2px 0" },
  dot1: { width: 7, height: 7, borderRadius: "50%", background: "#b8892a", animation: "pulse 1.2s ease-in-out 0s infinite" },
  dot2: { width: 7, height: 7, borderRadius: "50%", background: "#b8892a", animation: "pulse 1.2s ease-in-out 0.2s infinite" },
  dot3: { width: 7, height: 7, borderRadius: "50%", background: "#b8892a", animation: "pulse 1.2s ease-in-out 0.4s infinite" },
  micBar: { display: "flex", alignItems: "center", gap: 8, padding: "0.75rem 1.75rem", borderTop: "1px solid #efe9e0", background: "white" },
  micDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0, transition: "all 0.3s ease" },
  micLabel: { fontSize: 12, color: "#7a7268", fontWeight: 500, flex: 1 },
  msgCount: { fontSize: 11, color: "#b8c1c8", fontFamily: "monospace" },
};