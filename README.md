# Sift

Convert any file on your Mac into clean, token-lean Markdown for Claude, Cursor, ChatGPT, and Gemini — from Raycast.

Native LLM ingestion of PDFs is bloated: page headers, footers, repeated journal names, broken column order, vision tokens on scanned pages. Sift strips that, preserves structure, and gives you Markdown that costs **roughly 20-40% fewer tokens** for the same content — and lets you *see* what the LLM will see before you paste.

Runs entirely locally. No cloud calls, no API keys, no files leaving your machine.

## Commands

**Convert to Markdown** — fuzzy-search any file on your Mac (filename or parent folder name) and convert.
- Streaming Spotlight search with parent-folder matching
- "Recently Converted" + "Recent (last 7 days)" sections
- ✓ accessory when a sibling `.md` already exists; ⚠ when the source is newer than the existing `.md`
- ⌘⇧O — Copy Outline of Headings (extracts every H1 as a numbered list)
- Toast shows file size, token estimate, conversion mode, and a 0-100 readability score

**Convert Selected File in Finder** *(no-view)* — pick file(s) or a folder in Finder, hit your hotkey, done. Folders are walked recursively (depth 5, capped at 200 files).

**Convert Latest Download** *(no-view)* — converts the most recently modified supported file in `~/Downloads`. Useful right after downloading a deck from Moodle / a paper from arXiv.

**Convert YouTube URL from Clipboard** *(no-view)* — copy a YouTube URL, hit the hotkey, get a clean transcript with sentence-level paragraph breaks. Uses `yt-dlp` to fetch captions; falls back to auto-generated when manual subs aren't available.

## What makes the output cleaner

- **Slide-aware PDF mode** — detects landscape decks (5+ pages, 4:3-16:9, low text density, title-like first lines) and emits one H1 per slide with a slide number, joining stranded numbered-list prefixes and stripping recurring footers like "Copyright © 2025"
- **Recurring-line stripping** — short lines (<80 chars) appearing on 30%+ of pages get removed across the whole document
- **Page-number tail stripping** — trailing single-digit "1", "2", "12" lines on each slide get dropped
- **Multi-column preservation** — PDFs route through `pdftotext -layout` so two-column papers, CVs, and slide notes keep their reading order
- **YAML frontmatter** — every output starts with `source`, `converted` timestamp, `mode`, and slide count (toggle in preferences)
- **Smell Test score** — every conversion gets a 0-100 readability score based on heading structure, broken hyphenation, OCR junk, repeating lines, and blank-line bloat. Surfaced in the success toast so you know whether to trust the output before pasting

## Inputs

PDF · Word (`.docx`, `.doc`) · PowerPoint (`.pptx`, `.ppt`) · Excel (`.xlsx`, `.xls`) · Images (PNG, JPEG, HEIC, TIFF — with OCR) · Audio (WAV, MP3, M4A — with local transcription) · HTML · EPUB · CSV · YouTube URLs (via clipboard).

## Requirements

```bash
# MarkItDown — handles all non-PDF formats + provides the PDF fallback
uv tool install 'markitdown[all]'

# poppler — used for PDFs (better column preservation + slide-mode detection)
brew install poppler

# yt-dlp — required only for the YouTube transcript command
brew install yt-dlp
```

The extension auto-detects them in `~/.local/bin`, `/opt/homebrew/bin`, or `/usr/local/bin`. Override paths in preferences.

## Preferences

| Setting | Default | Notes |
|---|---|---|
| MarkItDown Binary Path | auto-detect | Leave blank unless installed elsewhere. |
| Output Location | Sibling to source | Or Downloads / a custom folder. |
| Custom Output Folder | empty | Used when Output Location is "Custom folder". |
| Open after conversion | off | Open the resulting `.md` in your default app. |
| Copy to clipboard | **on** | Auto-copies the Markdown after each conversion. |
| Frontmatter | **on** | Prepend YAML frontmatter (source, timestamp, mode) to outputs. |

## Tips

- Bind **Convert to Markdown** to a hotkey in Raycast → Settings → Extensions → Sift (suggested ⌘⇧M)
- Bind **Convert Selected File in Finder** to a different hotkey for one-keystroke Finder-to-Markdown
- Bind **Convert Latest Download** to a hotkey you hit right after downloading from a browser

## Privacy

`markitdown[all]` audio transcription routes through Google's free Web Speech API by default — don't run it on confidential audio. All other conversions (PDF / Word / PPTX / XLSX / images / YouTube captions) are entirely local.

## License

MIT
