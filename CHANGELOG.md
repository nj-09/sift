# Sift Changelog

## [Initial Version] - {PR_MERGE_DATE}

### Commands

- **Convert to Markdown** — fuzzy-search any file on your Mac (filename or parent folder name) and convert it to clean Markdown
- **Convert Selected File in Finder** — single-keystroke conversion of Finder-selected files; supports folders (recursive, depth 5, capped at 200 files)
- **Convert Latest Download** — converts the most recently modified supported file in `~/Downloads`
- **Convert YouTube URL from Clipboard** — copy a YouTube URL, run command, get a clean transcript (via `yt-dlp`)

### Conversion pipeline

- Streaming Spotlight-based search with parent-folder name matching
- **Slide-aware PDF mode** — auto-detects landscape decks (≥5 pages, 4:3-16:9 aspect, low text density, title-like first lines) and emits one H1 per slide with slide numbers
- Recurring-line stripping (footers, headers appearing on 30%+ of pages)
- Page-number tail stripping (trailing `\d{1,3}` lines)
- Number-prefix joining (`1.` orphaned on its own line gets merged with next content)
- `pdftotext -layout` fallback for PDFs to preserve multi-column layouts (CVs, two-column papers); MarkItDown takes over when poppler isn't available
- Empty / image-only slides get a placeholder so numbering matches the source

### Output

- **YAML frontmatter** on every output (source path, timestamp, conversion mode, slide count when applicable) — toggleable in preferences
- **Markdown formatter pass** — strips trailing whitespace, collapses 3+ blank-line runs to 2, preserves fenced code blocks
- **Smell Test score** (0-100) shown in the success toast based on heading structure, broken hyphenation, OCR junk glyphs, repeating short lines, and blank-line bloat
- **Stale Markdown detection** — yellow accessory + "Re-convert Updated Source" primary action when the source is newer than an existing output

### List view

- **Recently Converted** section (persistent history) and **Recent** section (last 7 days via Spotlight)
- ✓ accessory when a sibling `.md` already exists; ⚠ when stale
- ⌘⇧O — **Copy Outline of Headings** action (extracts H1s as a numbered list)
- Token estimate, conversion mode, and Smell Test score in success toasts

### Inputs

PDF · Word · PowerPoint · Excel · Images (OCR) · Audio · HTML · EPUB · CSV · YouTube URLs

### Preferences

MarkItDown binary path · output location (sibling / Downloads / custom) · open after conversion · copy to clipboard · frontmatter on/off
