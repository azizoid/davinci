import { basename } from "node:path";
import { readFile } from "node:fs/promises";

const SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";

export async function transcribeAudio(audioPath, options = {}) {
  const provider = options.provider || process.env.TRANSCRIBER || "elevenlabs";

  if (provider === "mock") {
    if (!options.mockPath) throw new Error("Mock transcription requires --mock-transcript.");
    return JSON.parse(await readFile(options.mockPath, "utf8"));
  }

  if (provider !== "elevenlabs") {
    throw new Error(
      `Unsupported transcriber '${provider}'. The first E2E path supports 'elevenlabs' or 'mock'.`,
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is required for the first E2E path. Put it in .env; do not commit it.",
    );
  }

  const form = new FormData();
  const audio = await readFile(audioPath);
  form.append("file", new Blob([audio], { type: "audio/wav" }), basename(audioPath));
  form.append("model_id", "scribe_v2");
  form.append("diarize", "false");
  form.append("tag_audio_events", "true");
  form.append("timestamps_granularity", "word");
  if (process.env.LANGUAGE_CODE) form.append("language_code", process.env.LANGUAGE_CODE);

  const response = await fetch(SCRIBE_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`ElevenLabs Scribe returned ${response.status}: ${body.slice(0, 500)}`);
  }
  return JSON.parse(body);
}

export function normalizeTranscript(raw) {
  const words = (raw.words || [])
    .filter(
      (word) =>
        word.type === "word" &&
        Number.isFinite(Number(word.start)) &&
        Number.isFinite(Number(word.end)) &&
        typeof word.text === "string",
    )
    .map((word, index) => ({
      id: `transcript-token-${String(index + 1).padStart(6, "0")}`,
      text: word.text,
      start_s: Number(word.start),
      end_s: Number(word.end),
      confidence: Number.isFinite(Number(word.logprob))
        ? Math.exp(Number(word.logprob))
        : null,
      speaker_id: word.speaker_id || null,
    }));

  return {
    schema_version: "1.0",
    provider: "elevenlabs",
    model: "scribe_v2",
    language_code: raw.language_code || null,
    text: raw.text || words.map((word) => word.text).join(" "),
    words,
  };
}
