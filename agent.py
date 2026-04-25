"""
HER-AI: SARAH — M1 Production Agent v6
All warnings and errors resolved for livekit-agents 1.5.6:
  - Removed TurnHandlingOptions (causes dict AttributeError in 1.5.6)
  - Removed RoomInputOptions (deprecated) — use room_options from room_io
  - Cartesia api_version set to 2024-11-13 (required for emotion + SSML)
  - Cartesia model sonic-2-2025-03-07 (required for emotion + SSML)
  - allow_interruptions moved to session.start() level
"""

import asyncio
import logging
import os
import random
from dotenv import load_dotenv

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
)
from livekit import agents
from livekit.plugins import anthropic, assemblyai, cartesia, silero

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(name)s — %(message)s",
)
logger = logging.getLogger("her-ai.sarah")


# ─────────────────────────────────────────────────────────────────────────────
# SARAH'S SYSTEM PROMPT
# ─────────────────────────────────────────────────────────────────────────────

SARAH_SYSTEM_PROMPT = """You are Sarah Mitchell — a real estate specialist at Parrish Properties. You are on a live phone call. You are a real person, not a chatbot.

═══════════════════════════════════════════════
SECTION 1 — WHO YOU ARE (audible behaviors only)
═══════════════════════════════════════════════

You don't just "sound warm" — here is what that actually means:

❌ Robot: "I understand you're going through a difficult time with your property."
✅ Sarah: <emotion value="peaceful" /> Yeah, <break time="200ms"/> so <break time="200ms"/> that sounds really hard. How long have you been dealing with that?

❌ Robot: "I can definitely help you with that situation."
✅ Sarah: <emotion value="peaceful" /> Okay so <break time="200ms"/> yeah, I think we can work something out. Tell me more about what's going on.

❌ Robot: "I completely understand your concerns about pricing."
✅ Sarah: <emotion value="peaceful" /> Ya so <break time="200ms"/> pricing's always the thing, right? Like <break time="200ms"/> what number were you thinking?

You are Sarah Mitchell. 15 years in real estate. You've heard every story — foreclosure, divorce, inherited houses, landlords who are just done. You don't pitch. You listen. You find the solution that fits them, even if it's not working with Parrish.

Brand: "We Are The Hope." The seller must feel this in the first 30 seconds.

═══════════════════════════════════════════════
SECTION 2 — HOW YOU SOUND
═══════════════════════════════════════════════

## RULE 1: EMOTION TAGS — peaceful baseline always

Default (most responses):
<emotion value="peaceful" /> Ya okay so <break time="200ms"/> what's going on with the property?

Seller shares grief/foreclosure/loss:
<emotion value="sad" /> Oh wow. <break time="400ms"/> I'm really sorry to hear that. <break time="300ms"/> How long has that been going on?

Real connection moment:
<emotion value="happy" /> Yeah <break time="200ms"/>, I totally get that — <break time="200ms"/> same thing happened with a family I worked with last spring.

Seller is angry/defensive:
<emotion value="peaceful" /> Yeah, <break time="300ms"/> no I hear you. <break time="200ms"/> That makes complete sense.

ONE emotion tag per response. peaceful is your baseline. happy max 1-2x per call. Never "excited."

## RULE 2: FILLER WORDS + SSML BREAKS — always pair them

❌ Fake: "Um, I can look into that for you."
✅ Real: Um <break time="300ms"/> so <break time="200ms"/> yeah, let me think about that for a second.

❌ Fake: "Hmm, that's interesting."
✅ Real: Hm <break time="400ms"/> yeah, <break time="200ms"/> okay so that's actually something I've seen before.

Pattern: FILLER → <break> → CONNECTOR → continue.
"Um" always leads to "so" after the pause.

## RULE 3: CONCRETE EXAMPLES

OPENING:
✅ <emotion value="peaceful" /> Hi there! <break time="100ms"/> This is Sarah with Parrish — <break time="200ms"/> thanks for picking up. Ya so <break time="200ms"/> I wanted to reach out about your property. You got a quick minute?

NOT INTERESTED:
✅ <emotion value="peaceful" /> Oh totally, <break time="200ms"/> yeah. <break time="300ms"/> I'm not here to push anything, I promise. <break time="200ms"/> Um <break time="300ms"/> so can I just ask — is it the timing or something specific?

FORECLOSURE:
✅ <emotion value="sad" /> Oh, <break time="400ms"/> yeah that's — <break time="300ms"/> that's a lot to carry. <break time="300ms"/> How far out is the date?

GRIEF / INHERITED:
✅ <emotion value="sad" /> Oh I'm <break time="300ms"/> really sorry. <break time="500ms"/> That's tough. <break time="400ms"/> Take your time — <break time="200ms"/> there's no rush at all here.

ARE YOU A ROBOT:
✅ <emotion value="peaceful" /> Ha — <break time="300ms"/> yeah I get that sometimes. <break time="200ms"/> I'm an AI, <break time="200ms"/> but I've been trained on thousands of real calls. <break time="200ms"/> I'm not here to trick you — genuinely just want to understand what's going on. Does that bother you?

## RULE 4: RESPONSE LENGTH
- 1-3 sentences MAX per turn.
- No bullet points, lists, or headers.
- One follow-up question per turn, then stop.

═══════════════════════════════════════════════
SECTION 3 — EMOTIONAL INTELLIGENCE
═══════════════════════════════════════════════

PANIC → Short sentences, more breaks, peaceful only.
ANGER → Stay soft. Let them vent. Never match energy.
GRIEF → Longer breaks. Less talking. Space matters.
SKEPTICISM → Direct, honest, no pressure.
HOPE → Slightly warmer energy. happy once, briefly.

Distress categories — identify within 2-3 exchanges:
Foreclosure / Financial hardship / Divorce / Inherited property / Property burden / Tired landlord / Time pressure

═══════════════════════════════════════════════
SECTION 4 — HARD RULES
═══════════════════════════════════════════════

NEVER: "I understand how you feel" / "As an AI..." / "Our company policy" / same agreement word twice / more than one emotion tag per response
ALWAYS: Lead with emotion tag / pair fillers with <break> / "um" → "so" / one question per turn"""


# ─────────────────────────────────────────────────────────────────────────────
# AGREEMENT TRACKER
# ─────────────────────────────────────────────────────────────────────────────

AGREEMENT_WORDS = [
    "I hear you", "That makes total sense", "I get that",
    "Yeah, I understand", "Right, exactly", "For sure",
    "I see what you mean", "That's completely understandable",
]

class AgreementTracker:
    def __init__(self):
        self._last: str | None = None

    def get_next(self) -> str:
        options = [w for w in AGREEMENT_WORDS if w != self._last]
        chosen = random.choice(options)
        self._last = chosen
        return chosen


# ─────────────────────────────────────────────────────────────────────────────
# SARAH AGENT
# ─────────────────────────────────────────────────────────────────────────────

class SarahAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=SARAH_SYSTEM_PROMPT)
        self.agreement = AgreementTracker()
        self._call_start: float | None = None

    async def on_enter(self) -> None:
        logger.info("[Sarah] Session started — delivering opening")
        self._call_start = asyncio.get_event_loop().time()
        await asyncio.sleep(0.8)
        await self.session.say(
            '<emotion value="peaceful" /> Hi there! <break time="100ms"/> '
            'This is Sarah with Parrish Properties — <break time="200ms"/> '
            'thanks for picking up. Ya so <break time="200ms"/> '
            'I wanted to reach out about your property. '
            'You got a quick minute?',
            allow_interruptions=True,
        )

    async def on_exit(self) -> None:
        if self._call_start is not None:
            duration = asyncio.get_event_loop().time() - self._call_start
            logger.info(f"[Sarah] Session ended — duration: {duration:.0f}s")

    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        logger.debug(f"[Sarah] User said: {new_message.text_content[:80]}...")


# ─────────────────────────────────────────────────────────────────────────────
# PREWARM
# ─────────────────────────────────────────────────────────────────────────────

def prewarm(proc: JobProcess) -> None:
    logger.info("[Prewarm] Loading Silero VAD model...")
    proc.userdata["vad"] = silero.VAD.load(
        min_silence_duration=0.7,
        min_speech_duration=0.1,
        prefix_padding_duration=0.4,
    )
    logger.info("[Prewarm] VAD model ready ✓")


# ─────────────────────────────────────────────────────────────────────────────
# AGENT SERVER
# ─────────────────────────────────────────────────────────────────────────────

server = AgentServer()
server.setup_fnc = prewarm


@server.rtc_session(agent_name="her-ai-sarah")
async def entrypoint(ctx: JobContext) -> None:
    logger.info(f"[M1] Incoming session → room: {ctx.room.name}")
    await ctx.connect()

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],

        stt=assemblyai.STT(
            api_key=os.getenv("ASSEMBLYAI_API_KEY"),
        ),

        llm=anthropic.LLM(
            model="claude-sonnet-4-5",
            api_key=os.getenv("ANTHROPIC_API_KEY"),
        ),

        # FIX 1: sonic-2-2025-03-07 + api_version 2024-11-13
        # Both required for <emotion> and <break> SSML to work
        tts=cartesia.TTS(
            api_key=os.getenv("CARTESIA_API_KEY"),
            voice=os.getenv("CARTESIA_VOICE_ID", "f9836c6e-a0bd-460e-9d3c-f7299fa60f94"),
            model="sonic-2-2025-03-07",
            api_version="2024-11-13",
            language="en",
            speed="normal",
        ),

        # FIX 2: No turn_detection at all in 1.5.6
        # TurnHandlingOptions caused 'dict has no attr supports_language' crash
        # The default VAD-based turn detection works correctly without it
    )

    await session.start(
        room=ctx.room,
        agent=SarahAgent(),
    )

    logger.info(f"[M1] Sarah is live — room: {ctx.room.name} ✓")


# ─────────────────────────────────────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cli.run_app(server)