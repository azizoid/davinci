import { run, parseRational } from "./runtime.mjs";

export async function probeMedia(sourcePath) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-print_format",
    "json",
    sourcePath,
  ]);
  const raw = JSON.parse(stdout);
  const video = raw.streams?.find((stream) => stream.codec_type === "video");
  const audio = raw.streams?.find((stream) => stream.codec_type === "audio");

  if (!video) throw new Error("The source does not contain a video stream.");
  if (!audio) throw new Error("The source does not contain an audio stream.");

  return {
    format: {
      filename: raw.format?.filename,
      duration_s: Number(raw.format?.duration ?? video.duration ?? 0),
      size_bytes: Number(raw.format?.size ?? 0),
      format_name: raw.format?.format_name,
    },
    video: {
      codec: video.codec_name,
      width: Number(video.width),
      height: Number(video.height),
      fps: parseRational(video.r_frame_rate || video.avg_frame_rate),
      fps_expression: video.r_frame_rate || video.avg_frame_rate,
      time_base: video.time_base,
      start_time_s: Number(video.start_time ?? 0),
      frames: video.nb_frames ? Number(video.nb_frames) : null,
    },
    audio: {
      codec: audio.codec_name,
      channels: Number(audio.channels ?? 0),
      sample_rate: Number(audio.sample_rate ?? 48000),
      time_base: audio.time_base,
    },
  };
}

export async function extractAnalysisAudio(sourcePath, outputPath) {
  await run("ffmpeg", [
    "-y",
    "-i",
    sourcePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}
