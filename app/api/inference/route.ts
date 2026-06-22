import { NextResponse } from "next/server";
import { AI_PERSONALITIES } from "@/lib/game/constants";
import type { DetectiveId } from "@/lib/game/types";

const DEFAULT_MODEL = "qwen/qwen-2.5-7b-instruct";
const DEFAULT_BASE_URL = "https://router.integratenetwork.xyz/openapi/v1";

const FALLBACK_PHRASES: Record<DetectiveId, string[]> = {
  VANCE: [
    "I must analyze the coordinates. Every step must be deliberate.",
    "The evidence is starting to show a pattern. I need more data.",
    "The room holds secrets, but patience is a detective's best tool."
  ],
  ROSEWOOD: [
    "No time to waste! I'm moving in to inspect immediately.",
    "Someone here is lying. I can feel the tension in the room!",
    "This clue is hot. I need to make a bold move now."
  ],
  BLACKWOOD: [
    "There is a 78% probability the solution is close.",
    "Calculating the most efficient search coordinates now.",
    "My notebook matches the statistical distributions of cards."
  ],
  STERLING: [
    "Move out! We are checking every corner of this manor.",
    "Out of my way. I'm interrogating the suspects next.",
    "Relentless exploration is the only way to break this case."
  ],
  ASHCROFT: [
    "Perhaps a little suggestion will distract my rivals...",
    "Things are not always as they seem. Let's see who falls for it.",
    "A clever misdirection is worth ten raw facts."
  ]
};

export async function POST(request: Request) {
  try {
    const { agentId, context, action } = await request.json();

    const apiKey = (process.env.ZERO_G_ROUTER_API_KEY || "").trim();
    let baseURL = (process.env.ZERO_G_ROUTER_BASE_URL || DEFAULT_BASE_URL).trim();
    const model = (process.env.ZERO_G_ROUTER_MODEL || DEFAULT_MODEL).trim();

    // In-character fallback if API key is not configured
    if (!apiKey) {
      console.warn(`[0G Compute] ZERO_G_ROUTER_API_KEY not found in .env. Using in-character fallback for ${agentId}.`);
      const phrases = FALLBACK_PHRASES[agentId as DetectiveId] || FALLBACK_PHRASES.VANCE;
      const fallbackMsg = phrases[Math.floor(Math.random() * phrases.length)];
      return NextResponse.json({ ok: true, answer: fallbackMsg });
    }

    // Standardise endpoint URL format
    baseURL = baseURL.replace(/\/+$/, "");
    if (!/\/v1$/i.test(baseURL)) {
      baseURL = `${baseURL}/v1`;
    }

    const personality = AI_PERSONALITIES[agentId as DetectiveId];
    const systemPrompt = personality?.systemPrompt || "You are a detective solving a murder mystery at Ashford Manor. Keep replies under 25 words.";

    const userPrompt = `
Context about your current state inside Ashford Manor:
${context}

You are currently executing the action: ${action}.
Produce a short phrase or response in your distinct detective persona describing what you are doing, planning, or thinking. Keep it under 25 words. Do NOT wrap in quotes.
`;

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 80,
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[0G Compute] API response error: ${response.status} - ${errText}`);
      // Fallback on HTTP error
      const phrases = FALLBACK_PHRASES[agentId as DetectiveId] || FALLBACK_PHRASES.VANCE;
      const fallbackMsg = phrases[Math.floor(Math.random() * phrases.length)];
      return NextResponse.json({ ok: true, answer: fallbackMsg });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({ ok: true, answer: answer.replace(/^"|"$/g, "") });
  } catch (error: any) {
    console.error("[0G Compute] Handler error:", error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) });
  }
}
