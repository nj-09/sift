import { execFile } from "child_process";
import { existsSync, statSync } from "fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { homedir } from "os";
import { basename, dirname, extname, join } from "path";
import { promisify } from "util";

const PDFTOTEXT_CANDIDATES = ["/opt/homebrew/bin/pdftotext", "/usr/local/bin/pdftotext"];
const PDFINFO_CANDIDATES = ["/opt/homebrew/bin/pdfinfo", "/usr/local/bin/pdfinfo"];
const YTDLP_CANDIDATES = ["/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp", `${homedir()}/.local/bin/yt-dlp`];

function findPdftotext(): string | null {
  for (const p of PDFTOTEXT_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

function findPdfinfo(): string | null {
  for (const p of PDFINFO_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function findYtdlp(): string | null {
  for (const p of YTDLP_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

const YOUTUBE_URL_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)[\w-]+|youtu\.be\/[\w-]+)/i;

export function isYoutubeUrl(s: string): boolean {
  return YOUTUBE_URL_RE.test(s.trim());
}

export interface Preferences {
  markitdownPath: string;
  outputLocation: "sibling" | "downloads" | "custom";
  customOutputFolder: string;
  openAfterConvert: boolean;
  copyToClipboard: boolean;
  addFrontmatter: boolean;
}

const execFileAsync = promisify(execFile);

const DEFAULT_CANDIDATES = [
  `${homedir()}/.local/bin/markitdown`,
  "/opt/homebrew/bin/markitdown",
  "/usr/local/bin/markitdown",
];

export function resolveBinaryPath(preferences: Preferences): string {
  const configured = preferences.markitdownPath?.trim();
  if (configured) return configured;
  for (const candidate of DEFAULT_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return "markitdown";
}

export function resolveOutputPath(sourcePath: string, preferences: Preferences): string {
  const outName = basename(sourcePath).replace(/\.[^.]+$/, "") + ".md";
  switch (preferences.outputLocation) {
    case "downloads":
      return join(`${homedir()}/Downloads`, outName);
    case "custom":
      return join(preferences.customOutputFolder?.trim() || `${homedir()}/Downloads`, outName);
    case "sibling":
    default:
      return join(dirname(sourcePath), outName);
  }
}

export function expandHome(path: string): string {
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  if (path === "~") return homedir();
  return path;
}

export function isReadableFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

export function isNonEmptyFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    return false;
  }
}

export type ConvertMode = "markitdown" | "pdftotext" | "slide-aware";

export interface ConvertResult {
  source: string;
  output: string;
  ok: boolean;
  error?: string;
  mode?: ConvertMode;
  slides?: number;
}

interface SlideDetection {
  isSlide: boolean;
  pageCount: number;
  charsPerPage: number;
  titleRate: number;
}

// Detect whether a PDF is structurally a slide deck. All four rules must pass.
// Short-circuits on the first failure so non-decks add ~80ms, decks ~600ms.
async function detectSlideMode(pdfPath: string): Promise<SlideDetection> {
  const pdfinfo = findPdfinfo();
  const pdftotext = findPdftotext();
  if (!pdfinfo || !pdftotext) {
    return { isSlide: false, pageCount: 0, charsPerPage: 0, titleRate: 0 };
  }

  try {
    const { stdout: info } = await execFileAsync(pdfinfo, [pdfPath], { timeout: 5000 });
    const pageMatch = info.match(/Pages:\s+(\d+)/);
    const sizeMatch = info.match(/Page size:\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
    if (!pageMatch || !sizeMatch) {
      return { isSlide: false, pageCount: 0, charsPerPage: 0, titleRate: 0 };
    }

    const pageCount = parseInt(pageMatch[1], 10);
    const width = parseFloat(sizeMatch[1]);
    const height = parseFloat(sizeMatch[2]);
    const aspect = width / height;

    // Rule 1: >= 5 pages
    if (pageCount < 5) return { isSlide: false, pageCount, charsPerPage: 0, titleRate: 0 };
    // Rule 2: landscape with 4:3 to 16:9 aspect
    if (width <= height || aspect < 1.25 || aspect > 1.85) {
      return { isSlide: false, pageCount, charsPerPage: 0, titleRate: 0 };
    }

    // Sample first up-to-8 pages for density + title rate
    const sampleLast = Math.min(8, pageCount);
    const { stdout: sampleText } = await execFileAsync(
      pdftotext,
      ["-layout", "-f", "1", "-l", String(sampleLast), pdfPath, "-"],
      { maxBuffer: 16 * 1024 * 1024, timeout: 10_000 },
    );

    const pages = sampleText.split("\f").filter((p) => p.trim().length > 0);
    if (pages.length === 0) {
      return { isSlide: false, pageCount, charsPerPage: 0, titleRate: 0 };
    }

    const sorted = [...pages.map((p) => p.length)].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Rule 3: median chars/page < 900
    if (median >= 900) return { isSlide: false, pageCount, charsPerPage: median, titleRate: 0 };

    // Rule 4: >= 60% of pages have a title-like first line
    let titleHits = 0;
    for (const page of pages) {
      const firstLine = page
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0);
      if (!firstLine) continue;
      if (firstLine.length > 80) continue;
      const words = firstLine.split(/\s+/).length;
      if (words >= 12) continue;
      if (firstLine.endsWith(".")) continue;
      if (/^[-*•→>]/.test(firstLine)) continue;
      titleHits++;
    }
    const titleRate = titleHits / pages.length;
    if (titleRate < 0.6) return { isSlide: false, pageCount, charsPerPage: median, titleRate };

    return { isSlide: true, pageCount, charsPerPage: median, titleRate };
  } catch {
    return { isSlide: false, pageCount: 0, charsPerPage: 0, titleRate: 0 };
  }
}

// Render a slide-mode PDF to Markdown: one H1 per slide, body under each.
// Empty / image-only pages get a placeholder so slide numbering matches the source.
// Lines that recur on >= 30% of pages and are short (<80 chars) are stripped as footers/headers.
async function runSlideAwareConversion(
  pdfPath: string,
  outputPath: string,
): Promise<{ ok: boolean; error?: string; slides: number }> {
  const pdftotext = findPdftotext();
  if (!pdftotext) return { ok: false, error: "pdftotext not available", slides: 0 };

  try {
    // Plain pdftotext (no -layout) — single-column slide content reads cleaner without spatial whitespace.
    const { stdout } = await execFileAsync(pdftotext, [pdfPath, "-"], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    });

    const rawPages = stdout.split("\f");
    // Drop a trailing empty entry if pdftotext ended with \f.
    if (rawPages.length > 0 && rawPages[rawPages.length - 1].trim().length === 0) {
      rawPages.pop();
    }

    // Pass 1: count line frequency across pages to identify recurring headers/footers.
    const lineFreq = new Map<string, number>();
    const perPageLines: string[][] = rawPages.map((p) => p.split("\n").map((l) => l.trim()));
    for (const lines of perPageLines) {
      const uniqueOnPage = new Set<string>();
      for (const line of lines) {
        if (line.length === 0 || line.length > 80) continue;
        if (uniqueOnPage.has(line)) continue;
        uniqueOnPage.add(line);
        lineFreq.set(line, (lineFreq.get(line) ?? 0) + 1);
      }
    }
    const threshold = Math.max(2, Math.ceil(perPageLines.length * 0.3));
    const recurring = new Set<string>();
    for (const [line, count] of lineFreq) {
      if (count >= threshold) recurring.add(line);
    }

    // Pass 2: emit slides.
    const slides: string[] = [];
    for (let i = 0; i < perPageLines.length; i++) {
      const slideNum = i + 1;
      const cleaned: string[] = [];
      let prevBlank = false;
      for (const line of perPageLines[i]) {
        if (recurring.has(line)) continue;
        if (line.length === 0) {
          if (!prevBlank && cleaned.length > 0) cleaned.push("");
          prevBlank = true;
        } else {
          cleaned.push(line);
          prevBlank = false;
        }
      }
      while (cleaned.length > 0 && cleaned[cleaned.length - 1] === "") cleaned.pop();
      // Strip a trailing page-number tail (e.g. "1", "12") — common slide footer artifact.
      while (cleaned.length > 0 && /^\d{1,3}$/.test(cleaned[cleaned.length - 1])) {
        cleaned.pop();
        while (cleaned.length > 0 && cleaned[cleaned.length - 1] === "") cleaned.pop();
      }
      // Join stranded number prefixes ("1." on its own line) with the next content line.
      const joined: string[] = [];
      for (let k = 0; k < cleaned.length; k++) {
        const line = cleaned[k];
        if (/^\d+[.)]$/.test(line)) {
          let m = k + 1;
          while (m < cleaned.length && cleaned[m] === "") m++;
          if (m < cleaned.length) {
            joined.push(`${line} ${cleaned[m]}`);
            k = m;
            continue;
          }
        }
        joined.push(line);
      }
      cleaned.length = 0;
      cleaned.push(...joined);

      if (cleaned.length === 0) {
        slides.push(`# Slide ${slideNum}\n\n*(image-only slide or no extractable text)*`);
        continue;
      }

      const first = cleaned[0];
      const startsWithBullet = /^[-*•‣→>]/.test(first);
      let title: string;
      let bodyStart: number;
      if (startsWithBullet) {
        title = `Slide ${slideNum}`;
        bodyStart = 0;
      } else {
        title = first.replace(/^#+\s*/, "").trim() || `Slide ${slideNum}`;
        bodyStart = 1;
      }

      const body = cleaned.slice(bodyStart).join("\n").trim();
      slides.push(body ? `# ${title}\n\n*Slide ${slideNum}*\n\n${body}` : `# ${title}\n\n*Slide ${slideNum}*`);
    }

    if (slides.length === 0) {
      return { ok: false, error: "no slide content extracted", slides: 0 };
    }

    // Frontmatter is now added uniformly by runConvertCommand based on the addFrontmatter pref.
    await writeFile(outputPath, slides.join("\n\n") + "\n", "utf-8");
    return { ok: true, slides: slides.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), slides: 0 };
  }
}

export async function runMarkitdown(source: string, output: string, binary: string): Promise<ConvertResult> {
  const execEnv = {
    ...process.env,
    PATH: `${homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
  };

  if (extname(source).toLowerCase() === ".pdf") {
    // Try slide-aware first if detection passes — gives lecture decks H1-per-slide structure.
    const detection = await detectSlideMode(source);
    if (detection.isSlide) {
      const slideResult = await runSlideAwareConversion(source, output);
      if (slideResult.ok && isNonEmptyFile(output)) {
        return { source, output, ok: true, mode: "slide-aware", slides: slideResult.slides };
      }
      // fall through to pdftotext / markitdown
    }

    // Plain pdftotext -layout preserves multi-column layout for CVs and two-column papers.
    const pdftotext = findPdftotext();
    if (pdftotext) {
      try {
        await execFileAsync(pdftotext, ["-layout", "-nopgbrk", source, output], {
          env: execEnv,
          maxBuffer: 64 * 1024 * 1024,
          timeout: 15 * 60 * 1000,
        });
        if (isNonEmptyFile(output)) {
          return { source, output, ok: true, mode: "pdftotext" };
        }
      } catch {
        // fall through to markitdown
      }
    }
  }

  try {
    await execFileAsync(binary, [source, "-o", output], {
      env: execEnv,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    });
    if (!isNonEmptyFile(output)) {
      return { source, output, ok: false, error: "Empty output" };
    }
    return { source, output, ok: true, mode: "markitdown" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { source, output, ok: false, error: message };
  }
}

export function binaryExistsOrOnPath(binary: string): boolean {
  if (binary.startsWith("/")) return existsSync(binary);
  return true; // bare command name — trust PATH, execFile will error if missing
}

// Parse a WebVTT subtitle file into deduped, time-free plain text.
// YouTube auto-captions repeat lines for rolling display; collapse adjacent duplicates,
// and break paragraphs on sentence-ending punctuation for readability.
export function vttToPlainText(vtt: string): string {
  const lines = vtt.split("\n");
  const out: string[] = [];
  let lastEmitted = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    if (line === "WEBVTT") continue;
    if (line.startsWith("NOTE")) continue;
    if (line.startsWith("Kind:") || line.startsWith("Language:")) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^\d{2}:\d{2}/.test(line)) continue;
    const cleaned = line
      .replace(/<\/?[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (!cleaned) continue;
    if (cleaned === lastEmitted) continue;
    out.push(cleaned);
    lastEmitted = cleaned;
  }
  const joined: string[] = [];
  let buffer = "";
  for (const seg of out) {
    if (buffer) buffer += " " + seg;
    else buffer = seg;
    if (/[.!?]$/.test(seg)) {
      joined.push(buffer);
      buffer = "";
    }
  }
  if (buffer) joined.push(buffer);
  return joined.join("\n\n");
}

export interface YoutubeResult {
  ok: boolean;
  error?: string;
  title?: string;
  videoId?: string;
}

// Download captions for a YouTube URL via yt-dlp and write a transcript .md to outputPath.
// Prefers manual subtitles in English, falls back to auto-generated.
export async function runYoutubeConversion(url: string, outputPath: string): Promise<YoutubeResult> {
  const ytdlp = findYtdlp();
  if (!ytdlp) {
    return { ok: false, error: "yt-dlp not installed (brew install yt-dlp)" };
  }
  const tmp = await mkdtemp(join(homedir(), "Library/Caches/sift-yt-"));
  try {
    const { stdout: meta } = await execFileAsync(
      ytdlp,
      ["--print", "%(id)s\t%(title)s", "--no-warnings", "--skip-download", url],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const metaLine = meta.trim().split("\n")[0] ?? "";
    const [videoId, ...titleParts] = metaLine.split("\t");
    const title = titleParts.join("\t") || videoId || "YouTube transcript";

    // yt-dlp can 429 on later language variants — we tolerate non-zero exit if a VTT was written.
    try {
      await execFileAsync(
        ytdlp,
        [
          "--skip-download",
          "--write-subs",
          "--write-auto-subs",
          "--sub-langs",
          "en",
          "--sub-format",
          "vtt",
          "--no-warnings",
          "-o",
          join(tmp, "%(id)s.%(ext)s"),
          url,
        ],
        { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
      );
    } catch {
      // soft-fail; we'll check below whether a VTT actually made it to disk
    }

    const files = await readdir(tmp);
    // Prefer the plain ".en.vtt" if multiple variants were written.
    const vttFile = files.find((f) => /\.en\.vtt$/.test(f)) ?? files.find((f) => f.endsWith(".vtt"));
    if (!vttFile) {
      return { ok: false, error: "no captions available for this video", videoId, title };
    }
    const vtt = await readFile(join(tmp, vttFile), "utf-8");
    const plain = vttToPlainText(vtt);

    const md = [`# ${title}`, "", `Source: ${url}`, "", plain, ""].join("\n");
    await writeFile(outputPath, md, "utf-8");
    return { ok: true, title, videoId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// Deterministic readability score 0-100 for converted Markdown.
// Penalties (capped per rule): no headings, broken hyphenation, OCR junk glyphs,
// repeated short lines (page footers), runs of 4+ blank lines.
// Returns a score plus the top smells for the success-toast tagline.
export interface SmellReport {
  score: number;
  smells: string[];
}

export function scoreMarkdown(content: string): SmellReport {
  let body = content;
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---\n", 4);
    if (end !== -1) body = body.slice(end + 5);
  }
  const lines = body.split("\n");
  const penalties: { reason: string; weight: number }[] = [];

  // 1. Heading structure: -15 if no H1 found.
  const hasH1 = lines.some((l) => /^#\s+\S/.test(l));
  if (!hasH1) penalties.push({ reason: "no headings", weight: 15 });

  // 2. Broken hyphenation: cap -15.
  let hyphenBreaks = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (/\w-$/.test(lines[i]) && /^\w/.test(lines[i + 1])) hyphenBreaks++;
  }
  if (hyphenBreaks > 0) {
    const w = Math.min(15, hyphenBreaks);
    penalties.push({ reason: `${hyphenBreaks} broken hyphens`, weight: w });
  }

  // 3. OCR junk: count private use area characters (U+E000-U+F8FF) per 100 chars. Cap -15.
  const juncMatches = body.match(/[-]/g);
  const juncCount = juncMatches ? juncMatches.length : 0;
  if (juncCount > 20) {
    const w = Math.min(15, Math.floor(juncCount / 10));
    penalties.push({ reason: `${juncCount} OCR junk glyphs`, weight: w });
  }

  // 4. Repeated short lines (page footers / running headers).
  // Skip blank lines, lines with no alphanumeric content, intentional headings,
  // and italic-wrapped annotations like "*Slide 3*" or "*(image-only slide)*".
  const lineFreq = new Map<string, number>();
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0 || line.length > 80) continue;
    if (!/[a-zA-Z0-9]/.test(line)) continue;
    if (/^#{1,6}\s/.test(line)) continue; // skip headings
    if (/^\*[^*]+\*$/.test(line)) continue; // skip italic annotations
    lineFreq.set(line, (lineFreq.get(line) ?? 0) + 1);
  }
  let repeatTotal = 0;
  for (const count of lineFreq.values()) {
    if (count >= 4) repeatTotal += count - 1;
  }
  if (repeatTotal > 0) {
    const w = Math.min(15, repeatTotal);
    penalties.push({ reason: `${repeatTotal} repeating lines`, weight: w });
  }

  // 5. Excessive blank-line runs.
  let bigBlankRuns = 0;
  let run = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      run++;
    } else {
      if (run >= 4) bigBlankRuns++;
      run = 0;
    }
  }
  if (run >= 4) bigBlankRuns++;
  if (bigBlankRuns > 0) {
    const w = Math.min(10, bigBlankRuns);
    penalties.push({ reason: `${bigBlankRuns} blank-line bloat runs`, weight: w });
  }

  const totalPenalty = penalties.reduce((a, p) => a + p.weight, 0);
  const score = Math.max(0, Math.min(100, 100 - totalPenalty));
  const smells = penalties
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((p) => p.reason);
  return { score, smells };
}

// Extract H1 lines from a Markdown file. Skips frontmatter, returns titles in order.
// Used by the "Copy Outline" action for slide-mode files.
export function extractH1Outline(content: string): string[] {
  let body = content;
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---\n", 4);
    if (end !== -1) body = body.slice(end + 5);
  }
  const titles: string[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) titles.push(m[1].trim());
  }
  return titles;
}

// Conservative Markdown cleanup. Strip trailing whitespace per line,
// collapse 3+ consecutive blank lines to 2, trim leading/trailing blank lines.
// Does not touch fenced code blocks (between ``` markers) so internal spacing is preserved.
export function formatMarkdown(input: string): string {
  const lines = input.split("\n");
  const cleaned: string[] = [];
  let inFence = false;
  for (let raw of lines) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      cleaned.push(raw.replace(/\s+$/, ""));
      continue;
    }
    if (inFence) {
      cleaned.push(raw.replace(/\s+$/, ""));
      continue;
    }
    raw = raw.replace(/\s+$/, "");
    cleaned.push(raw);
  }
  // Collapse 3+ blank line runs to 2.
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const line of cleaned) {
    if (line === "") {
      blankRun++;
      if (blankRun <= 2) collapsed.push(line);
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }
  // Trim leading and trailing blanks.
  while (collapsed.length > 0 && collapsed[0] === "") collapsed.shift();
  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === "") collapsed.pop();
  return collapsed.join("\n") + (collapsed.length > 0 ? "\n" : "");
}
