import { Clipboard, Toast, getPreferenceValues, open, showHUD, showInFinder, showToast } from "@raycast/api";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { basename, join } from "path";
import { Preferences, findYtdlp, formatMarkdown, isYoutubeUrl, runYoutubeConversion, scoreMarkdown } from "./utils";

function sanitizeFilename(s: string): string {
  return s
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function resolveYoutubeOutput(
  title: string | undefined,
  videoId: string | undefined,
  preferences: Preferences,
): string {
  const stem = sanitizeFilename(title || videoId || "youtube-transcript") || "youtube-transcript";
  const name = `${stem}.md`;
  switch (preferences.outputLocation) {
    case "custom":
      return join(preferences.customOutputFolder?.trim() || `${homedir()}/Downloads`, name);
    case "sibling":
    case "downloads":
    default:
      return join(`${homedir()}/Downloads`, name);
  }
}

export default async function Command() {
  const preferences = getPreferenceValues<Preferences>();

  if (!findYtdlp()) {
    await showToast({
      style: Toast.Style.Failure,
      title: "yt-dlp not installed",
      message: "Install with: brew install yt-dlp",
    });
    return;
  }

  const clipboard = await Clipboard.readText();
  const url = clipboard?.trim() ?? "";
  if (!isYoutubeUrl(url)) {
    await showHUD("Clipboard doesn't contain a YouTube URL");
    return;
  }

  await showToast({
    style: Toast.Style.Animated,
    title: "Fetching YouTube transcript…",
    message: url.length > 60 ? url.slice(0, 60) + "…" : url,
  });

  // Initial output path uses video id; renamed after we know the title.
  let outputPath = resolveYoutubeOutput(undefined, undefined, preferences);
  const result = await runYoutubeConversion(url, outputPath);

  if (!result.ok) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Couldn't fetch transcript",
      message: result.error ?? "Unknown error",
    });
    return;
  }

  // Rename to the title-based filename now that we have it.
  if (result.title) {
    const final = resolveYoutubeOutput(result.title, result.videoId, preferences);
    if (final !== outputPath) {
      try {
        const { rename } = await import("fs/promises");
        await rename(outputPath, final);
        outputPath = final;
      } catch {
        // keep the original path if rename fails
      }
    }
  }

  // Format + score using the same post-process as the file pipeline.
  let smell: { score: number; smells: string[] } | null = null;
  try {
    const raw = await readFile(outputPath, "utf-8");
    const formatted = formatMarkdown(raw);
    if (formatted !== raw) {
      const { writeFile } = await import("fs/promises");
      await writeFile(outputPath, formatted, "utf-8");
    }
    smell = scoreMarkdown(formatted);
  } catch {
    // non-fatal
  }

  if (preferences.copyToClipboard) {
    try {
      const content = await readFile(outputPath, "utf-8");
      await Clipboard.copy(content);
    } catch {
      // non-fatal
    }
  }

  if (preferences.openAfterConvert) {
    await open(outputPath);
  }

  const scorePart = smell ? `${smell.score}/100` : "";
  const smellTail = smell && smell.smells.length > 0 ? ` (${smell.smells.join(", ")})` : "";
  await showToast({
    style: Toast.Style.Success,
    title: `Transcribed ${result.title ?? "video"}`,
    message: `→ ${basename(outputPath)}${scorePart ? ` · ${scorePart}` : ""}${smellTail}`,
    primaryAction: {
      title: "Show in Finder",
      onAction: async (toast) => {
        await showInFinder(outputPath);
        await toast.hide();
      },
    },
    secondaryAction: {
      title: "Open Markdown",
      onAction: async (toast) => {
        await open(outputPath);
        await toast.hide();
      },
    },
  });
}
