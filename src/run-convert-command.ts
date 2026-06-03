import { Clipboard, Toast, getPreferenceValues, open, showInFinder, showToast } from "@raycast/api";
import { readFile, stat, writeFile } from "fs/promises";
import { basename } from "path";
import {
  ConvertResult,
  Preferences,
  binaryExistsOrOnPath,
  formatMarkdown,
  resolveBinaryPath,
  resolveOutputPath,
  runMarkitdown,
  scoreMarkdown,
} from "./utils";

async function postProcessOutput(
  result: ConvertResult,
  preferences: Preferences,
): Promise<{ score: number; smells: string[] }> {
  const raw = await readFile(result.output, "utf-8");
  const formatted = formatMarkdown(raw);
  let final = formatted;
  if (preferences.addFrontmatter !== false && !formatted.startsWith("---\n")) {
    const fmLines = ["---", `source: ${result.source}`, `converted: ${new Date().toISOString()}`];
    if (result.mode) fmLines.push(`mode: ${result.mode}`);
    if (result.slides) fmLines.push(`slides: ${result.slides}`);
    fmLines.push("---", "", "");
    final = fmLines.join("\n") + formatted;
  }
  if (final !== raw) {
    await writeFile(result.output, final, "utf-8");
  }
  return scoreMarkdown(final);
}

async function approxTokensFromOutput(outputPath: string): Promise<string> {
  try {
    const { size } = await stat(outputPath);
    // ~3.5 chars per token is a reasonable heuristic for converted Markdown.
    const tokens = Math.round(size / 3.5);
    if (tokens >= 1000) return `~${(tokens / 1000).toFixed(1)}k tokens`;
    return `~${tokens} tokens`;
  } catch {
    return "";
  }
}

function modeAccent(result: ConvertResult): string {
  if (result.mode === "slide-aware" && result.slides) {
    return ` · Slide mode · ${result.slides} slides`;
  }
  return "";
}

export interface RunConvertOptions {
  onSuccess?: (result: ConvertResult) => void | Promise<void>;
}

// Shared between the view command (convert.tsx) and the no-view commands
// (convert-selected, convert-latest). Handles binary probe, conversion,
// clipboard, open, and success/failure toasts identically.
export async function runConvertCommand(path: string, options: RunConvertOptions = {}): Promise<ConvertResult | null> {
  const preferences = getPreferenceValues<Preferences>();
  const binary = resolveBinaryPath(preferences);

  if (!binaryExistsOrOnPath(binary)) {
    await showToast({
      style: Toast.Style.Failure,
      title: "MarkItDown not found",
      message: "Install with: uv tool install 'markitdown[all]'",
    });
    return null;
  }

  await showToast({
    style: Toast.Style.Animated,
    title: `Converting ${basename(path)}…`,
  });

  const output = resolveOutputPath(path, preferences);
  const result = await runMarkitdown(path, output, binary);

  if (!result.ok) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Conversion failed",
      message: result.error ?? "Unknown error",
    });
    return result;
  }

  let smellReport: { score: number; smells: string[] } | null = null;
  try {
    smellReport = await postProcessOutput(result, preferences);
  } catch {
    // non-fatal — output is still usable in raw form
  }

  if (preferences.copyToClipboard) {
    try {
      const content = await readFile(result.output, "utf-8");
      await Clipboard.copy(content);
    } catch {
      // non-fatal
    }
  }

  if (preferences.openAfterConvert) {
    await open(result.output);
  }

  const tokens = await approxTokensFromOutput(result.output);
  const scorePart = smellReport ? `${smellReport.score}/100` : "";
  const detail = [tokens, modeAccent(result).replace(/^ · /, ""), scorePart].filter(Boolean).join(" · ");
  const smellTail = smellReport && smellReport.smells.length > 0 ? ` (${smellReport.smells.join(", ")})` : "";
  await showToast({
    style: Toast.Style.Success,
    title: `Converted ${basename(result.source)}`,
    message: detail
      ? `→ ${basename(result.output)} · ${detail}${smellTail}`
      : `→ ${basename(result.output)}${smellTail}`,
    primaryAction: {
      title: "Show in Finder",
      onAction: async (toast) => {
        await showInFinder(result.output);
        await toast.hide();
      },
    },
    secondaryAction: {
      title: "Open Markdown",
      onAction: async (toast) => {
        await open(result.output);
        await toast.hide();
      },
    },
  });

  if (options.onSuccess) {
    await options.onSuccess(result);
  }

  return result;
}
