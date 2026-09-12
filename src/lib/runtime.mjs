import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function loadDotEnv(filePath) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export async function ensureDir(directory) {
  await mkdir(directory, { recursive: true });
}

export async function writeJson(filePath, value) {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function run(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      maxBuffer: 20 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    const stderr = error.stderr ? `\n${error.stderr.trim()}` : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}${stderr}`, {
      cause: error,
    });
  }
}

export async function sha256(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

export async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function listFiles(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => extensions.has(name.slice(name.lastIndexOf(".")).toLowerCase()))
    .sort()
    .map((name) => `${directory}/${name}`);
}

export function parseRational(value) {
  if (typeof value === "number") return value;
  const [numerator, denominator] = String(value).split("/").map(Number);
  if (!Number.isFinite(numerator)) return 0;
  return Number.isFinite(denominator) && denominator !== 0
    ? numerator / denominator
    : numerator;
}

export function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .toLowerCase();
  return slug || "untitled-video";
}

export function isoTimestamp() {
  return new Date().toISOString().replaceAll(/[-:.TZ]/gu, "").slice(0, 14);
}
