/**
 * POST /api/token
 * Generates a LiveKit access token + dispatches Sarah agent to the room.
 */

import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL        = process.env.NEXT_PUBLIC_LIVEKIT_URL!;
const AGENT_NAME         = process.env.NEXT_PUBLIC_AGENT_NAME ?? "her-ai-sarah";

export async function POST(req: NextRequest) {
  try {
    const body            = await req.json().catch(() => ({}));
    const participantName = body.participantName ?? `user-${Math.random().toString(36).slice(2, 8)}`;
    const roomName        = body.roomName        ?? `sarah-call-${Date.now()}`;

    // ── 1. Generate user access token ───────────────────────────────────────
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

    // ── 2. Dispatch Sarah using AgentDispatchClient (correct SDK method) ────
    const httpUrl = LIVEKIT_URL
      .replace("wss://", "https://")
      .replace("ws://",  "http://");

    try {
      const dispatchClient = new AgentDispatchClient(
        httpUrl,
        LIVEKIT_API_KEY,
        LIVEKIT_API_SECRET,
      );

      const dispatch = await dispatchClient.createDispatch(roomName, AGENT_NAME, {
        metadata: JSON.stringify({ source: "web", participantName }),
      });

      console.log(`[token] ✓ Sarah dispatched — room: ${roomName} dispatch: ${dispatch.id}`);
    } catch (dispatchErr) {
      console.error("[token] Dispatch error:", dispatchErr);
      // Non-fatal: agent may still join via auto-dispatch if configured
    }

    return NextResponse.json({ token, roomName, url: LIVEKIT_URL });
  } catch (err) {
    console.error("[token] Fatal error:", err);
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  }
}