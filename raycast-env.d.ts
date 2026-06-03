/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** MarkItDown Binary Path - Path to the markitdown executable. Leave blank to auto-detect (~/.local/bin, /opt/homebrew/bin, /usr/local/bin). */
  "markitdownPath": string,
  /** Output Location - Where to save the converted Markdown. */
  "outputLocation": "sibling" | "downloads" | "custom",
  /** Custom Output Folder - Used when Output Location is set to 'Custom folder'. */
  "customOutputFolder": string,
  /** After Conversion - When enabled, opens the converted Markdown file in your default app. */
  "openAfterConvert": boolean,
  /** Clipboard - When enabled, copies the converted Markdown content to your clipboard after each conversion. */
  "copyToClipboard": boolean,
  /** Frontmatter - When enabled, adds a YAML frontmatter block with source path, timestamp, and conversion mode to every Markdown output. */
  "addFrontmatter": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `convert` command */
  export type Convert = ExtensionPreferences & {}
  /** Preferences accessible in the `convert-selected` command */
  export type ConvertSelected = ExtensionPreferences & {}
  /** Preferences accessible in the `convert-latest` command */
  export type ConvertLatest = ExtensionPreferences & {}
  /** Preferences accessible in the `convert-youtube` command */
  export type ConvertYoutube = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `convert` command */
  export type Convert = {}
  /** Arguments passed to the `convert-selected` command */
  export type ConvertSelected = {}
  /** Arguments passed to the `convert-latest` command */
  export type ConvertLatest = {}
  /** Arguments passed to the `convert-youtube` command */
  export type ConvertYoutube = {}
}

