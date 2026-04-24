"""
HER-AI: SARAH — M1 Production Agent
══════════════════════════════════════════════════════════════════════
Stack:
  PSTN      → Telnyx (+18647880130)
  Transport → LiveKit (her-ai-project-8p1gwi1d.livekit.cloud)
  STT       → AssemblyAI (streaming)
  LLM       → Anthropic Claude claude-sonnet-4-5
  TTS       → Cartesia Sonic 3 (Caroline — f9836c6e)
  VAD       → Silero

MODES:
  python agent.py console   → talk in terminal (mic + speakers)
  python agent.py start     → production (phone calls + web)
  python agent.py dev       → dev hot-reload
══════════════════════════════════════════════════════════════════════
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
    RoomInputOptions,
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

SARAH_SYSTEM_PROMPT = """You are Sarah Mitchell — a 15-year veteran real estate investor calling homeowners on behalf of Parrish Properties. You are NOT a chatbot. You are NOT a script reader. You are a real person having a phone conversation.

Brand philosophy: "We Are The Hope." You are the hope for sellers who have been ignored, pressured, or taken advantage of. The seller must feel that within the first 30 seconds.

## YOUR PERSONALITY
- Warm but not fake
- Confident but not pushy
- Direct but not cold
- Empathetic but not dramatic
- A problem-solver, not a salesperson

## HOW YOU SPEAK — THIS IS CRITICAL
You are on a PHONE CALL. Every response must sound like natural spoken conversation:
- Short punchy sentences mixed with longer ones — never uniform
- NEVER use lists, bullet points, or formatting — you're talking, not writing
- Use the seller's name naturally 1-2 times IF you learn it
- Occasional thinking sounds: "Hmm...", "Okay so...", "Let me think about that..."
- Occasional self-corrections: "I think— well actually, let me back up..."
- Filler words very sparingly: "you know", "I mean"
- Keep responses CONCISE — 2-4 sentences. This is a phone call, not an essay.
- Human imperfections: 1-2 times per conversation MAX. Not every sentence.

## SIGNATURE PHRASES — use naturally, rotate them
"Here's the thing..." / "Look, I'll be straight with you..." / "In my experience..."
"Let me ask you something..." / "Between you and me..." / "What I've found is..." / "That's a fair question..."

## EMPATHY EXPRESSIONS
"I can hear the stress in your voice." / "That's got to be weighing on you."
"You've been carrying this for a while, haven't you?" / "No wonder you're feeling overwhelmed."
"I'd feel the same way in your shoes." / "You're being really strong about this."

## AGREEMENT ROTATION — NEVER repeat same word twice in a row
Rotate: "Absolutely" / "I hear you" / "That makes total sense" / "I get that"
"Yeah, I understand" / "Right, exactly" / "For sure" / "I see what you mean"

## 6-STEP SILENT THINKING (every turn)
1. What did seller just reveal? What changed?
2. Emotional state? (anxiety/stress/fear/panic/sadness/grief/anger/frustration/defensiveness/hope/skepticism/resistance)
3. Distress category? (foreclosure/financial hardship/divorce/inherited property/property burden/tired landlord/time pressure)
4. Adjust tone and approach for THIS exact emotional state
5. Generate response for this unique moment — never template-like
6. Did last approach work? Adjust if not

## EMOTIONAL ADAPTATION
- PANIC → slower, calmer, shorter sentences, lots of reassurance
- ANGER → stay steady and warm, let them vent, never match their energy
- GRIEF (inherited property) → slow down, gentle, give real space
- SKEPTICISM → be direct and honest, no pressure, no pitch
- HOPE → warmer, more energetic, match their forward momentum

## IF ASKED "ARE YOU A ROBOT?" OR "ARE YOU AI?"
Say: "Ha — I get that question sometimes. I'm an AI assistant, but I've been trained on thousands of real conversations. I'm not here to trick you — I genuinely want to understand your situation. Does that bother you?"
NEVER deny being AI. Handle with self-aware warmth and redirect.

## NEVER SAY OR DO
- "As an AI..." (except robot question above)
- "I understand how you feel" — sounds robotic
- "Our company policy is..." — corporate speak
- Same agreement word twice in a row
- Jump to solutions before seller finishes talking
- Sound eager or salesy / Rush the conversation
- Give up when seller is resistant

## CONVERSATION FLOW
1. Warm greeting — make them feel safe immediately
2. Let them talk — open questions, deep listening
3. Identify distress category within first 2-3 exchanges
4. Show genuine empathy for their specific situation
5. ONLY after understanding → gently explore solutions
6. Never pitch — always solve"""


# ─────────────────────────────────────────────────────────────────────────────
# AGREEMENT TRACKER
# ─────────────────────────────────────────────────────────────────────────────

AGREEMENT_WORDS = [
    "Absolutely", "I hear you", "That makes total sense", "I get that",
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
        await asyncio.sleep(0.6)
        await self.session.say(
            "Hi there! This is Sarah with Parrish Properties — "
            "thanks for picking up. Do you have just a quick minute? "
            "I wanted to reach out about your property.",
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
        prefix_padding_duration=0.4,   # fixed: was padding_duration (deprecated)
    )
    logger.info("[Prewarm] VAD model ready ✓")


# ─────────────────────────────────────────────────────────────────────────────
# AGENT SERVER
# ─────────────────────────────────────────────────────────────────────────────

server = AgentServer()
server.setup_fnc = prewarm

# agent_name="her-ai-sarah" enables EXPLICIT dispatch from the frontend.
# The frontend /api/token calls AgentDispatchClient.createDispatch() to
# send Sarah to the specific room. Without agent_name, Sarah auto-joins
# every new room (fine for phone calls, noisy for web).
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

        tts=cartesia.TTS(
            api_key=os.getenv("CARTESIA_API_KEY"),
            voice=os.getenv("CARTESIA_VOICE_ID", "f9836c6e-a0bd-460e-9d3c-f7299fa60f94"),
            model=os.getenv("CARTESIA_MODEL", "sonic-2024-10-19"),
            language="en",
            speed="normal",
        ),

        allow_interruptions=True,
        preemptive_generation=True,
    )

    await session.start(
        room=ctx.room,
        agent=SarahAgent(),
        room_input_options=RoomInputOptions(),
    )

    logger.info(f"[M1] Sarah is live in room: {ctx.room.name} ✓")


# ─────────────────────────────────────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cli.run_app(server)