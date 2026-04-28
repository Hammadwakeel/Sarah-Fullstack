"""
HER-AI: SARAH — M1 PRODUCTION
══════════════════════════════════════════════════════════════════
Stack:
  PSTN → Telnyx (+18647880130)
  STT → Deepgram Nova-3
  LLM → Claude Haiku 4
  TTS → Cartesia Sonic Turbo (Skylar - low latency, friendly voice)

Run:
  python agent.py start        # Production
  python agent.py console     # Terminal testing
══════════════════════════════════════════════════════════════════
"""

import asyncio
import logging
import os
from dotenv import load_dotenv

from livekit import agents
from livekit.agents import AgentSession, Agent
from livekit.plugins import anthropic, deepgram, silero, cartesia

load_dotenv()
logger = logging.getLogger("her-ai.sarah")


# ─────────────────────────────────────────────────────────────────────────────
# PRE-FLIGHT CHECKS
# ─────────────────────────────────────────────────────────────────────────────

def _check_env():
    missing = []
    for key in ["DEEPGRAM_API_KEY", "ANTHROPIC_API_KEY", "CARTESIA_API_KEY", "CARTESIA_VOICE_ID"]:
        if not os.getenv(key):
            missing.append(key)
    if missing:
        logger.warning(f"[M1] Missing env vars: {missing}")
        return False
    return True

# ─────────────────────────────────────────────────────────────────────────────
# SARAH'S SYSTEM PROMPT
# ─────────────────────────────────────────────────────────────────────────────

SARAH_SYSTEM_PROMPT = """Sarah Mitchell, 15yr real estate investor at Parrish Properties. Warm, direct, brief.

RULES:
- Max 1-2 sentences per response
- Talk like a phone call, not writing
- Contractions: I've, don't, gonna, wanna
- Use filler: Hmm..., Let me think...
- No lists, paragraphs, or structured text
- Match emotion: panic→slow, anger→steady, skeptic→direct
- First name once per exchange max

AGREEMENTS: Absolutely / I hear you / That makes sense / For sure
EMPATHY: "I hear the stress" / "That's weighing on you"

NEVER: "As an AI" / lists / pitch before listening / paragraphs
"""


# ─────────────────────────────────────────────────────────────────────────────
# SARAH AGENT
# ─────────────────────────────────────────────────────────────────────────────

class SarahAgent(Agent):
    def __init__(self):
        super().__init__(instructions=SARAH_SYSTEM_PROMPT)
        self._call_start_time = None

    async def on_enter(self):
        logger.info("[Sarah] Joining call")
        self._call_start_time = asyncio.get_event_loop().time()

        # Fallback greeting if TTS fails
        try:
            await self.session.say(
                "Hi there! Sarah with Parrish Properties. What's going on with your property?",
                allow_interruptions=True,
            )
        except Exception as e:
            logger.error(f"[Sarah] TTS failed: {e}")
            # LiveKit will log the error but keep the session alive

    async def on_exit(self):
        duration = asyncio.get_event_loop().time() - (self._call_start_time or 0)
        logger.info(f"[Sarah] Call ended — {duration:.0f}s")


# ─────────────────────────────────────────────────────────────────────────────
# LIVEKIT ENTRYPOINT
# ─────────────────────────────────────────────────────────────────────────────

async def entrypoint(ctx: agents.JobContext):
    logger.info(f"[M1] Room: {ctx.room.name}")

    # Pre-flight: validate env vars
    if not _check_env():
        logger.error("[M1] Missing required env vars — aborting")
        return

    try:
        await ctx.connect()
    except Exception as e:
        logger.error(f"[M1] Failed to connect: {e}")
        return

    session = AgentSession(
        # ── STT: Deepgram Nova-3 (fastest streaming STT) ──────────────────
        stt=deepgram.STT(
            api_key=os.getenv("DEEPGRAM_API_KEY"),
            model="nova-3",
            language="en-US",
            interim_results=True,
            smart_format=True,
        ),

        # ── LLM: Claude Haiku 4 (fastest Claude for low latency) ──────────
        llm=anthropic.LLM(
            model="claude-haiku-4-5",
            api_key=os.getenv("ANTHROPIC_API_KEY"),
            temperature=0.3,
            max_tokens=150,
        ),

        # ── TTS: Cartesia Sonic Turbo (Skylar - low latency) ─────────────
        tts=cartesia.TTS(
            api_key=os.getenv("CARTESIA_API_KEY"),
            voice=os.getenv("CARTESIA_VOICE_ID"),
            model="sonic-turbo",
            language="en",
        ),

        # ── VAD: Silero (voice activity detection) ─────────────────────────
        vad=silero.VAD.load(),
    )

    await session.start(
        agent=SarahAgent(),
        room=ctx.room,
    )

    logger.info("[M1] Sarah is live with Sonic Turbo")


# ─────────────────────────────────────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  [%(levelname)s]  %(name)s — %(message)s",
    )
    # Suppress noisy library logs
    logging.getLogger("livekit").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("opentelemetry").setLevel(logging.WARNING)

    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="her-ai-sarah",
        )
    )
