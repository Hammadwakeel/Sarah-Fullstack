/**
 * POST /api/token
 * Generates a LiveKit access token, creates room with caller metadata,
 * and dispatches the Sarah agent.
 *
 * Body: {
 *   participantName?: string
 *   callerName?:      string   (optional — pre-fill if known)
 *   callerPhone?:     string   (optional — from CRM lookup)
 *   propertyAddress?: string   (optional — Sarah will reference it in opening)
 * }
 */

import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL        = process.env.NEXT_PUBLIC_LIVEKIT_URL!;
const AGENT_NAME         = process.env.NEXT_PUBLIC_AGENT_NAME ?? "her-ai-sarah";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const participantName  = body.participantName  ?? `user-${Math.random().toString(36).slice(2, 8)}`;
    const roomName         = body.roomName         ?? `sarah-call-${Date.now()}`;
    const callerName       = body.callerName       ?? "";
    const callerPhone      = body.callerPhone      ?? "";
    const propertyAddress  = body.propertyAddress  ?? "";

    // Caller metadata — passed to agent via room.metadata
    // Sarah uses this to personalize her opening greeting
    const callerMeta = {
      source:           "web",
      participantName,
      caller_name:      callerName,
      caller_phone:     callerPhone,
      property_address: propertyAddress,
      started_at:       new Date().toISOString(),
    };

    // ── 1. Generate user access token ──────────────────────────────────────
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantName,
      ttl:      "1h",
    });
    at.addGrant({
      roomJoin:     true,
      room:         roomName,
      canPublish:   true,
      canSubscribe: true,
    });
    const token = await at.toJwt();

    const httpUrl = LIVEKIT_URL
      .replace("wss://", "https://")
      .replace("ws://",  "http://");

    // ── 2. Create room with caller metadata ────────────────────────────────
    // This metadata is available to the agent as ctx.room.metadata
    try {
      const roomSvc = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      await roomSvc.createRoom({
        name:     roomName,
        metadata: JSON.stringify(callerMeta),
        // Auto-close room 10 minutes after last participant leaves
        emptyTimeout:   600,
        // Max 2 participants (caller + agent)
        maxParticipants: 2,
      });
      console.log(`[token] ✓ Room created: ${roomName}`);
    } catch (roomErr) {
      // Room may already exist — non-fatal
      console.warn("[token] Room create warn:", roomErr);
    }

    // ── 3. Dispatch Sarah to the room ──────────────────────────────────────
    try {
      const dispatchClient = new AgentDispatchClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      const dispatch = await dispatchClient.createDispatch(roomName, AGENT_NAME, {
        metadata: JSON.stringify(callerMeta),
      });
      console.log(`[token] ✓ Sarah dispatched — room: ${roomName} | dispatch: ${dispatch.id}`);
    } catch (dispatchErr) {
      console.error("[token] Dispatch error:", dispatchErr);
    }

    return NextResponse.json({
      token,
      roomName,
      url:        LIVEKIT_URL,
      callerMeta,
    });
  } catch (err) {
    console.error("[token] Fatal error:", err);
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  }
}