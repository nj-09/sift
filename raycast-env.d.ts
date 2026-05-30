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
  "copyToClipboard": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `convert` command */
  export type Convert = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `convert` command */
  export type Convert = {}
}

