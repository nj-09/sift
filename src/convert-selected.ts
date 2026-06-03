import { Toast, getSelectedFinderItems, showHUD, showToast } from "@raycast/api";
import { readdir, stat } from "fs/promises";
import { basename, extname, join } from "path";
import { runConvertCommand } from "./run-convert-command";
import { isReadableFile } from "./utils";

const SUPPORTED_EXTS = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "html",
  "htm",
  "epub",
  "csv",
  "json",
  "xml",
  "wav",
  "mp3",
  "m4a",
  "msg",
  "jpg",
  "jpeg",
  "png",
  "tiff",
  "tif",
  "heic",
]);

const MAX_BULK_DEPTH = 5;
const MAX_BULK_FILES = 200;

function getExt(path: string): string {
  return extname(path).replace(/^\./, "").toLowerCase();
}

async function walkSupported(root: string, depth: number, collected: string[]): Promise<void> {
  if (depth > MAX_BULK_DEPTH || collected.length >= MAX_BULK_FILES) return;
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }
  for (const name of entries) {
    if (collected.length >= MAX_BULK_FILES) return;
    if (name.startsWith(".")) continue; // skip hidden / dotfolders
    const full = join(root, name);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      await walkSupported(full, depth + 1, collected);
    } else if (s.isFile() && SUPPORTED_EXTS.has(getExt(name))) {
      collected.push(full);
    }
  }
}

export default async function Command() {
  let items: { path: string }[] = [];
  try {
    items = await getSelectedFinderItems();
  } catch {
    await showHUD("No file selected in Finder");
    return;
  }

  if (items.length === 0) {
    await showHUD("No file selected in Finder");
    return;
  }

  // Expand folder selections into their supported files (recursive, capped).
  const candidates: string[] = [];
  for (const item of items) {
    let s;
    try {
      s = await stat(item.path);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      await walkSupported(item.path, 0, candidates);
    } else if (isReadableFile(item.path) && SUPPORTED_EXTS.has(getExt(item.path))) {
      candidates.push(item.path);
    }
  }

  if (candidates.length === 0) {
    await showHUD("Selection has no supported files");
    return;
  }

  if (candidates.length === 1) {
    await runConvertCommand(candidates[0]);
    return;
  }

  // Multi-file: sequential conversion, final summary toast.
  let okCount = 0;
  let failCount = 0;
  let lastError: string | undefined;
  for (const path of candidates) {
    const result = await runConvertCommand(path);
    if (result?.ok) {
      okCount++;
    } else {
      failCount++;
      lastError = result?.error ?? lastError;
    }
  }

  await showToast({
    style: failCount > 0 ? Toast.Style.Failure : Toast.Style.Success,
    title: failCount === 0 ? `Converted ${okCount} files` : `Converted ${okCount} of ${candidates.length}`,
    message: lastError ? `Last error: ${lastError}` : `${basename(candidates[0])} + ${candidates.length - 1} more`,
  });
}
