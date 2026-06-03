import { showHUD } from "@raycast/api";
import { readdir, stat } from "fs/promises";
import { homedir } from "os";
import { extname, join } from "path";
import { runConvertCommand } from "./run-convert-command";

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

function getExt(path: string): string {
  return extname(path).replace(/^\./, "").toLowerCase();
}

export default async function Command() {
  const downloads = join(homedir(), "Downloads");

  let entries: string[];
  try {
    entries = await readdir(downloads);
  } catch {
    await showHUD("Couldn't read ~/Downloads");
    return;
  }

  const supported = entries.filter((name) => SUPPORTED_EXTS.has(getExt(name)));
  if (supported.length === 0) {
    await showHUD("No convertible files in ~/Downloads");
    return;
  }

  const stamped = await Promise.all(
    supported.map(async (name) => {
      const full = join(downloads, name);
      try {
        const s = await stat(full);
        if (!s.isFile()) return null;
        return { path: full, mtime: s.mtimeMs };
      } catch {
        return null;
      }
    }),
  );

  const ranked = stamped
    .filter((s): s is { path: string; mtime: number } => s !== null)
    .sort((a, b) => b.mtime - a.mtime);

  if (ranked.length === 0) {
    await showHUD("No convertible files in ~/Downloads");
    return;
  }

  await runConvertCommand(ranked[0].path);
}
