# HER-AI: Sarah — Next.js Frontend

Talk to Sarah, Parrish Properties' AI real estate specialist, through a beautiful browser UI.

## Setup

```bash
cd frontend
npm install
cp .env.local .env.local   # already pre-filled with your LiveKit credentials
npm run dev
```

Open http://localhost:3000 — click **Start Call with Sarah**.

## Requirements

Make sure `agent.py` is running first:
```bash
# In your M1 directory (separate terminal)
python agent.py start
```

## Architecture

```
Browser (Next.js)
  │
  ├── POST /api/token  → generates LiveKit JWT + dispatches Sarah agent
  │
  └── LiveKitRoom (WebRTC)
        ├── RoomAudioRenderer  → plays Sarah's Cartesia voice
        ├── BarVisualizer      → real-time audio waveform
        └── TrackToggle        → mic mute/unmute
              │
              └── LiveKit Cloud (her-ai-project-8p1gwi1d.livekit.cloud)
                    │
                    └── agent.py worker
                          ├── AssemblyAI STT
                          ├── Claude LLM (Sarah's brain)
                          └── Cartesia TTS (Caroline voice)
```

## Environment Variables

```env
LIVEKIT_API_KEY=APIQykXAKy2Dvg2
LIVEKIT_API_SECRET=VrmCBBNGiRjsi5lrQPaL4Mes0nza5UI5IrFHpWsXX6L
NEXT_PUBLIC_LIVEKIT_URL=wss://her-ai-project-8p1gwi1d.livekit.cloud
NEXT_PUBLIC_AGENT_NAME=her-ai-sarah
```
