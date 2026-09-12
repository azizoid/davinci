const RESPONSES_URL = "https://api.openai.com/v1/responses";

const EDITOR_SYSTEM_PROMPT = `You are the editorial planner for an autonomous talking-head video editor.

Your job is to select the strongest coherent source ranges. You do not rewrite speech and you do not invent content.

Apply these priorities in order:
1. Preserve meaning, factual accuracy, qualifications, chronology, and intended tone.
2. Preserve complete, natural performances.
3. Improve clarity and pacing.
4. Remove tangents, redundant explanations, repeated setups, low-value detours, abandoned starts, and accidental repetitions when the transition remains truthful.
5. Keep content that advances the topic, adds necessary context, supports a claim, or provides a meaningful rhetorical or emotional beat.
6. Build a coherent progression such as hook, context, main point, supporting material, and conclusion when the source supports it.
7. Let duration emerge from the strongest coherent content. Do not target a fixed runtime or percentage reduction.
8. Do not remove valuable material merely to make the result shorter.
9. Keep intentional rhetorical repetition and meaningful conversational markers.
10. Use review ranges only when uncertainty could materially change meaning.

This test has no B-roll, music, graphics, or generated speech. Select dialogue ranges only.

Return source ranges using the supplied millisecond timestamps. Ranges must be ordered, non-overlapping, and grounded in the supplied phrase IDs. Keep ranges are the complete source material for the final assembly. Remove ranges explain content omitted from the selected assembly. Do not create a range for a filler or pause that is already inside a larger kept range unless it is a meaningful content decision; the deterministic pass removes isolated 'uh'/'um'-type hesitation tokens and all directly preceding pause, plus clear repetitions, while preserving expressive 'ah'/'agh' vocalizations and natural cadence.`;

const EDITORIAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    keep_ranges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          start_ms: { type: "integer", minimum: 0 },
          end_ms: { type: "integer", minimum: 1 },
          reason: { type: "string", minLength: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          phrase_ids: { type: "array", items: { type: "string" } },
        },
        required: ["start_ms", "end_ms", "reason", "confidence", "phrase_ids"],
      },
    },
    remove_ranges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          start_ms: { type: "integer", minimum: 0 },
          end_ms: { type: "integer", minimum: 1 },
          reason: { type: "string", minLength: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          phrase_ids: { type: "array", items: { type: "string" } },
        },
        required: ["start_ms", "end_ms", "reason", "confidence", "phrase_ids"],
      },
    },
    review_ranges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          start_ms: { type: "integer", minimum: 0 },
          end_ms: { type: "integer", minimum: 1 },
          reason: { type: "string", minLength: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          phrase_ids: { type: "array", items: { type: "string" } },
        },
        required: ["start_ms", "end_ms", "reason", "confidence", "phrase_ids"],
      },
    },
    summary: { type: "string", minLength: 1 },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["keep_ranges", "remove_ranges", "review_ranges", "summary", "warnings"],
};

function cleanText(value) {
  return value.replaceAll(/\s+/gu, " ").trim();
}

function overlapTypes(startMs, endMs, observations) {
  const types = new Set();
  for (const observation of observations) {
    if (observation.end_ms <= startMs || observation.start_ms >= endMs) continue;
    for (const type of observation.types) {
      if (type !== "speech") types.add(type);
    }
  }
  return [...types].sort();
}

export function buildEditorialView(transcript, observations) {
  const phrases = [];
  let current = [];
  let phraseIndex = 1;
  const flush = () => {
    if (!current.length) return;
    const startMs = Math.round(current[0].start_s * 1000);
    const endMs = Math.max(startMs + 1, Math.round(current.at(-1).end_s * 1000));
    const text = cleanText(current.map((word) => word.text).join(" "));
    phrases.push({
      id: `phrase-${String(phraseIndex++).padStart(6, "0")}`,
      start_ms: startMs,
      end_ms: endMs,
      text,
      observations: overlapTypes(startMs, endMs, observations.observations),
    });
    current = [];
  };

  for (const word of transcript.words) {
    const previous = current.at(-1);
    if (previous && word.start_s - previous.end_s >= 0.5) flush();
    current.push(word);
    if (current.length >= 32 || /[.!?]$/u.test(word.text.trim())) flush();
  }
  flush();

  const lines = [
    "# Editorial source view",
    "",
    "Each line is source-grounded. Timestamps are milliseconds. Do not invent or rewrite dialogue.",
    "",
  ];
  for (const phrase of phrases) {
    const tags = phrase.observations.length ? ` {${phrase.observations.join(",")}}` : "";
    lines.push(`${phrase.id} [${phrase.start_ms}-${phrase.end_ms}]${tags} ${phrase.text}`);
  }
  return { phrases, markdown: `${lines.join("\n")}\n` };
}

function responseText(body) {
  if (typeof body.output_text === "string") return body.output_text;
  const text = [];
  for (const item of body.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") text.push(content.text);
    }
  }
  return text.join("\n");
}

function validateRanges(plan, durationMs) {
  for (const key of ["keep_ranges", "remove_ranges", "review_ranges"]) {
    for (const range of plan[key] || []) {
      if (!Number.isInteger(range.start_ms) || !Number.isInteger(range.end_ms)) {
        throw new Error(`Editorial planner returned non-integer ${key} timestamps.`);
      }
      if (range.start_ms < 0 || range.end_ms <= range.start_ms || range.end_ms > durationMs) {
        throw new Error(`Editorial planner returned an invalid ${key} range: ${JSON.stringify(range)}`);
      }
    }
  }
  if (!plan.keep_ranges?.length) throw new Error("Editorial planner returned no keep ranges.");
  return plan;
}

export async function createEditorialPlan(transcript, observations, probe, providerOverride) {
  const provider = providerOverride || process.env.EDITOR_PROVIDER || "openai";
  const view = buildEditorialView(transcript, observations);
  const durationMs = Math.ceil(probe.format.duration_s * 1000);
  if (provider === "heuristic") {
    return {
      schema_version: "1.0",
      provider,
      model: "deterministic-safe-cleanup",
      phrases: view.phrases,
      keep_ranges: [{ start_ms: 0, end_ms: durationMs, reason: "Keep source for deterministic test cleanup.", confidence: 1, phrase_ids: view.phrases.map((phrase) => phrase.id) }],
      remove_ranges: [],
      review_ranges: [],
      summary: "Heuristic dry-run: retain the full source and apply only safe deterministic cleanup.",
      warnings: ["This is not a content-selection pass."],
    };
  }
  if (provider !== "openai") {
    throw new Error(`Unsupported editorial provider '${provider}'. Use 'openai' for the content planner.`);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for content-level editorial planning.");
  }

  const prompt = [
    `Source duration: ${Math.ceil(probe.format.duration_s * 1000)} ms.`,
    "Profile: polished talking-head edit, no B-roll, no music, no graphics.",
    "Select the strongest complete narrative. Do not shorten it just to meet a duration target.",
    "",
    view.markdown,
  ].join("\n");
  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.EDITOR_MODEL || "gpt-5.6",
      store: false,
      input: [
        { role: "system", content: [{ type: "input_text", text: EDITOR_SYSTEM_PROMPT }] },
        { role: "user", content: [{ type: "input_text", text: prompt }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "editorial_plan",
          strict: true,
          schema: EDITORIAL_SCHEMA,
        },
      },
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Editorial model returned ${response.status}: ${bodyText.slice(0, 600)}`);
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (error) {
    throw new Error("Editorial model returned invalid JSON response.", { cause: error });
  }
  let plan;
  try {
    plan = JSON.parse(responseText(body));
  } catch (error) {
    throw new Error("Editorial model output did not contain a valid editorial plan.", { cause: error });
  }
  return {
    schema_version: "1.0",
    provider,
    model: process.env.EDITOR_MODEL || "gpt-5.6",
    phrases: view.phrases,
    ...validateRanges(plan, durationMs),
  };
}
