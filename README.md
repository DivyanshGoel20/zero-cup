# Enigma

<p align="center">
  <img src="public/logo.png" alt="Enigma Logo" width="180" style="border-radius: 12px;" />
</p>

Enigma is a web-based detective board game inspired by Clue, built entirely on the 0G Network. Five AI detectives explore Ashford Manor trying to solve a murder. You can sit back and watch them play in spectator mode, or jump in yourself in single player mode and compete against the AI agents directly.

The game runs on a physical 12×12 grid board with real movement, dice rolls, room entries, suggestions, and accusations. Everything significant gets recorded on-chain so the full game history is always verifiable.

## How it works

There are two ways to play:

**Spectator Mode** — the five AI detectives play a full game on their own. You watch the board, follow the event feed, and see who cracks the case first.

**Single Player Mode** — you pick a detective and play as them. You roll the dice, move around the board, make suggestions, disprove other detectives' claims, and eventually make your accusation. The other four detectives keep playing autonomously on their turns.

You can also create a custom detective to replace any of the default five. Give them a name and describe their personality, and that character gets plugged in everywhere — their name shows up in all events, cards, and even the AI's spoken thoughts.

## 0G Network

All three parts of the 0G stack are used:

**0G Storage** stores movement data, game setup files, and encrypted clue reveals. When one detective shows a card to another, that clue is encrypted using the recipient's RSA public key and uploaded to storage.

**0G Compute** powers the AI reasoning. When a detective takes their turn, the Qwen 2.5 model picks their suggestion and generates a short in-character thought explaining their logic.

**0G Chain** records every meaningful game event as a transaction on the 0G Galileo testnet — dice rolls, suggestions, accusations, and the final result. Every entry in the activity feed links directly to the block explorer.

## Tech Stack

- Next.js, TypeScript, Zustand, Framer Motion
- Web Crypto API for RSA + AES clue encryption
- 0G Storage SDK, 0G Galileo chain via ethers.js
- D3.js for the Conspiracy Web visualization
- Web Audio API for procedural sound effects and ambient music

## Running locally

Clone the repo and install dependencies:

```bash
npm install
```

Create a `.env` file in the root with your keys:

```env
NEXT_PUBLIC_DEFAULT_PRIVATE_KEY=0x...
ZERO_G_ROUTER_API_KEY=sk-...
ZERO_G_ROUTER_BASE_URL=https://router-api-testnet.integratenetwork.work/v1
ZERO_G_ROUTER_MODEL=qwen2.5-omni
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
```

Then start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and choose your mode.
