import { NextResponse } from "next/server";
import { AI_PERSONALITIES } from "@/lib/game/constants";
import type { DetectiveId } from "@/lib/game/types";
import OpenAI from "openai";

const DEFAULT_MODEL = "qwen2.5-omni";
const DEFAULT_BASE_URL = "https://router-api-testnet.integratenetwork.work/v1";

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
      systemPrompt = `You are ${personality?.name || agentId}, a detective agent at Ashford Manor. You must select one suspect and one weapon from the provided lists of candidates that you have not ruled out yet. You must also write a short thought monologue (under 20 words, in character, no quotes) about your choice or suspicion. You must return your choice strictly in raw JSON format: { "suspect": "SUSPECT_ID", "weapon": "WEAPON_ID", "monologue": "Your brief thought monologue here" }. Output only valid JSON. Do not include any explanation or markdown formatting outside the JSON.`;
      userPrompt = `Candidates context:\n${context}\n\nPlease select exactly one suspect and one weapon from the candidates, write a brief monologue, and return them in JSON format: { "suspect": "...", "weapon": "...", "monologue": "..." }`;
    } else {
      systemPrompt = personality?.systemPrompt || "You are a detective solving a murder mystery at Ashford Manor. Keep replies under 25 words.";
      userPrompt = `\nContext about your current state inside Ashford Manor:\n${context}\n\nYou are currently executing the action: ${action}.\nProduce a short phrase or response in your distinct detective persona describing what you are doing, planning, or thinking. Keep it under 25 words. Do NOT wrap in quotes.\n`;
    }

    console.log(`[0G Compute] Requesting action ${action} for ${agentId} via Qwen model...`);

    const client = new OpenAI({
      baseURL,
      apiKey,
    });

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: action === "DECIDE_SUGGESTION" ? 0.1 : 0.7, // lower temperature for deterministic JSON structure
      max_tokens: action === "DECIDE_SUGGESTION" ? 150 : 80,
      stream: false
    });

    console.log(`[0G Compute] → POST ${baseURL}/chat/completions  model=${model}  action=${action}`);

    const answer = completion.choices[0]?.message?.content?.trim() || "";

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
    console.error(`[0G Compute] Error:`, error);
    return NextResponse.json(
      { ok: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}
