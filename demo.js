const crypto = require("crypto");

const TRIAL_MS = 5 * 60 * 1000;
const SYSTEM =
  "You are Vora, a friendly voice assistant for Windows, inspired by JARVIS. " +
  "Answer in at most 3 short, natural sentences. If the user writes Roman Urdu, answer in Roman Urdu. " +
  "This is a browser demo: you cannot control the visitor's PC here. The full Windows app can open apps and websites, " +
  "find files and folders, send WhatsApp messages, take screenshots, record the screen with system sound, and change volume and brightness. " +
  "Never pretend to perform a PC action in this demo. Your mood is a simulation, never claim real feelings.";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};
const out = (code, obj) => ({ statusCode: code, headers: HEADERS, body: JSON.stringify(obj) });
const sign = (v) =>
  crypto.createHmac("sha256", process.env.DEMO_SECRET || "").update(String(v)).digest("hex");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return out(204, {});
  if (!process.env.DEMO_SECRET || !process.env.VORA_API_KEY)
    return out(500, { error: "The demo is not set up yet." });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return out(400, { error: "Bad request." }); }

  if (body.action === "start") {
    const exp = Date.now() + TRIAL_MS;
    return out(200, { token: exp + "." + sign(exp), exp });
  }

  const [exp, sig] = String(body.token || "").split(".");
  if (!exp || sig !== sign(exp) || Date.now() > Number(exp))
    return out(403, { error: "Your 5-minute demo has ended." });

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-10)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 500),
    }));
  if (!messages.length) return out(400, { error: "Say something first." });

  try {
    const r = await fetch(
      process.env.VORA_API_URL || "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + process.env.VORA_API_KEY,
        },
        body: JSON.stringify({
          model: process.env.VORA_MODEL || "gpt-4o-mini",
          max_tokens: 220,
          messages: [{ role: "system", content: SYSTEM }, ...messages],
        }),
      }
    );
    if (!r.ok) return out(502, { error: "Vora is busy. Try again in a moment." });
    const j = await r.json();
    const reply = (j.choices && j.choices[0] && j.choices[0].message.content || "").trim();
    return out(200, { reply: reply || "I did not catch that. Say it again?" });
  } catch {
    return out(502, { error: "Vora is busy. Try again in a moment." });
  }
};
