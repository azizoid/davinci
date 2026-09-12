import { basename } from "node:path";
import { pathToFileURL } from "node:url";

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function parseRate(expression) {
  const [numerator, denominator] = String(expression).split("/").map(Number);
  if (!Number.isFinite(numerator) || numerator <= 0) throw new Error(`Invalid frame rate: ${expression}`);
  return { numerator, denominator: denominator > 0 ? denominator : 1 };
}

function timeFromFrames(frames, expression) {
  if (frames === 0) return "0s";
  const rate = parseRate(expression);
  const numerator = Math.round(frames * rate.denominator);
  const denominator = rate.numerator;
  const divisor = gcd(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}s`;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;");
}

function talkingHeadScale(segments, fps) {
  const minimumDurationFrames = Math.ceil(fps * 3);
  let punchIn = false;
  let hasEstablishedComposition = false;

  return segments.map((segment) => {
    const duration = segment.source_end_frame - segment.source_start_frame;
    if (duration >= minimumDurationFrames) {
      if (hasEstablishedComposition) punchIn = !punchIn;
      hasEstablishedComposition = true;
    }
    return punchIn ? "1.15 1.15" : null;
  });
}

export function createFcpXml(editPlan, probe, options) {
  const rateExpression = probe.video.fps_expression;
  const rate = parseRate(rateExpression);
  const frameDuration = timeFromFrames(1, rateExpression);
  const sourceFrames = probe.video.frames || Math.ceil(probe.format.duration_s * probe.video.fps);
  const timelineFrames = editPlan.segments.reduce(
    (total, segment) => total + segment.source_end_frame - segment.source_start_frame,
    0,
  );
  const sourceName = basename(options.hostSourcePath);
  const sourceUrl = pathToFileURL(options.hostSourcePath).href;
  const scales = talkingHeadScale(editPlan.segments, probe.video.fps);
  const clips = editPlan.segments
    .map((segment, index) => {
      const duration = segment.source_end_frame - segment.source_start_frame;
      const attributes = `name="${xmlEscape(sourceName)}" ref="r2" offset="${timeFromFrames(segment.timeline_start_frame, rateExpression)}" start="${timeFromFrames(segment.source_start_frame, rateExpression)}" duration="${timeFromFrames(duration, rateExpression)}"`;
      if (!scales[index]) return `      <asset-clip ${attributes} />`;
      return `      <asset-clip ${attributes}>
        <adjust-transform scale="${scales[index]}" />
      </asset-clip>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="AI Edit ${rate.numerator}/${rate.denominator}" frameDuration="${frameDuration}" width="${probe.video.width}" height="${probe.video.height}" />
    <asset id="r2" name="${xmlEscape(sourceName)}" src="${xmlEscape(sourceUrl)}" start="0s" duration="${timeFromFrames(sourceFrames, rateExpression)}" hasVideo="1" hasAudio="1" format="r1" />
  </resources>
  <library>
    <event name="${xmlEscape(options.projectName)}">
      <project name="${xmlEscape(options.projectName)}">
        <sequence format="r1" duration="${timeFromFrames(timelineFrames, rateExpression)}" tcStart="0s" tcFormat="NDF">
          <spine>
${clips}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}
