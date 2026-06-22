import { NextResponse } from "next/server";
import { AI_PERSONALITIES } from "@/lib/game/constants";
import type { DetectiveId } from "@/lib/game/types";

const DEFAULT_MODEL = "qwen/qwen2.5-omni-7b";
const DEFAULT_BASE_URL = "https://compute-network-6.integratenetwork.work/v1/proxy";

export async function POST(request: Request) {
  try {
    const { agentId, context, action } = await request.json();

    const apiKey = (process.env.ZERO_G_ROUTER_API_KEY || "").trim();
    let baseURL = (process.env.ZERO_G_ROUTER_BASE_URL || DEFAULT_BASE_URL).trim();
    const model = (process.env.ZERO_G_ROUTER_MODEL || DEFAULT_MODEL).trim();

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ZERO_G_ROUTER_API_KEY is not configured in your .env file. Real agent monologues require an API key." },
        { status: 400 }
      );
    }

    // Normalise: strip any trailing slashes, use URL as-is (it already contains the full path)
    baseURL = baseURL.replace(/\/+$/, "");

    const personality = AI_PERSONALITIES[agentId as DetectiveId];

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "DECIDE_SUGGESTION") {
      systemPrompt = `You are ${personality?.name || agentId}, a detective agent at Ashford Manor. You must select one suspect and one weapon from the provided lists of candidates that you have not ruled out yet. You must return your choice strictly in raw JSON format: { "suspect": "SUSPECT_ID", "weapon": "WEAPON_ID" }. Output only valid JSON. Do not include any explanation or markdown formatting.`;
      userPrompt = `Candidates context:
${context}

Please select exactly one suspect and one weapon from the candidates and return them in JSON format: { "suspect": "...", "weapon": "..." }`;
    } else {
      systemPrompt = personality?.systemPrompt || "You are a detective solving a murder mystery at Ashford Manor. Keep replies under 25 words.";
      userPrompt = `
Context about your current state inside Ashford Manor:
${context}

You are currently executing the action: ${action}.
Produce a short phrase or response in your distinct detective persona describing what you are doing, planning, or thinking. Keep it under 25 words. Do NOT wrap in quotes.
`;
    }

    console.log(`[0G Compute] Requesting action ${action} for ${agentId} via Qwen model...`);

    // The 0G proxy router strips "app-sk-" and base64-decodes what follows.
    // If the key is already in "app-sk-<base64>" format (from the SDK), use it directly.
    // If it contains characters invalid for base64 (like hyphens in a UUID-format key),
    // re-encode the secret portion so the router can decode it successfully.
    const authHeader = (() => {
      const PREFIX = "app-sk-";
      const secret = apiKey.startsWith(PREFIX) ? apiKey.slice(PREFIX.length) : apiKey;
      // Test if the secret is already valid base64 (no hyphens, correct charset)
      const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(secret);
      if (isValidBase64) {
        // Already a proper SDK-generated token — use as-is
        return `Bearer ${apiKey}`;
      }
      // UUID / plain-text key — base64-encode it so the router can decode it
      const encoded = Buffer.from(secret).toString("base64");
      return `Bearer ${PREFIX}${encoded}`;
    })();

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: action === "DECIDE_SUGGESTION" ? 0.1 : 0.7, // lower temperature for deterministic JSON structure
        max_tokens: action === "DECIDE_SUGGESTION" ? 150 : 80,
        stream: false
      })
    });

    console.log(`[0G Compute] → POST ${baseURL}/chat/completions  model=${model}  action=${action}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[0G Compute] Router HTTP ${response.status}:`, errText);
      return NextResponse.json(
        { ok: false, error: `0G Router responded with HTTP ${response.status}: ${errText}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || "";

    if (action === "DECIDE_SUGGESTION") {
      try {
        let cleanJson = answer;
        if (cleanJson.includes("```")) {
          const match = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (match) {
            cleanJson = match[1];
          } else {
            cleanJson = cleanJson.replace(/```/g, "");
          }
        }
        const parsed = JSON.parse(cleanJson.trim());
        if (!parsed.suspect || !parsed.weapon) {
          throw new Error("Missing 'suspect' or 'weapon' key in returned JSON decision.");
        }
        return NextResponse.json({ ok: true, decision: parsed });
      } catch (err: any) {
        console.error("[0G Compute] Failed to parse JSON suggestion decision:", answer, err);
        return NextResponse.json(
          { ok: false, error: `Invalid JSON suggestion decision from Qwen: ${err.message || String(err)}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, answer: answer.replace(/^"|"$/g, "") });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}
