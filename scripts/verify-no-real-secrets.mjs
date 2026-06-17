#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const excludedDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "tmp"
]);

const excludedFiles = new Set([
  "modelfaucet_spec_package.zip",
  "pnpm-lock.yaml"
]);

const textExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".go",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

const textFileNames = new Set([
  ".gitignore",
  "CHANGELOG",
  "CODE_OF_CONDUCT",
  "CONTRIBUTING",
  "LICENSE",
  "README",
  "SECURITY"
]);

const placeholderWords = [
  "...",
  "<",
  "changeme",
  "dev",
  "dummy",
  "example",
  "fake",
  "placeholder",
  "replace",
  "sample",
  "test",
  "your-"
];

const checks = [
  {
    name: "OpenAI project key",
    regex: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g
  },
  {
    name: "OpenAI live key",
    regex: /\bsk-live-[A-Za-z0-9_-]{20,}\b/g
  },
  {
    name: "Stripe live secret key",
    regex: /\bsk_live_[A-Za-z0-9]{20,}\b/g
  },
  {
    name: "Stripe live restricted key",
    regex: /\brk_live_[A-Za-z0-9]{20,}\b/g
  },
  {
    name: "Stripe webhook secret",
    regex: /\bwhsec_[A-Za-z0-9]{20,}\b/g
  },
  {
    name: "provider API env assignment",
    regex: /\b(?:OPENAI_API_KEY|OPENROUTER_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)\s*=\s*["']?([^"'\s#]+)["']?/g
  },
  {
    name: "Stripe secret env assignment",
    regex: /\b(?:STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)\s*=\s*["']?([^"'\s#]+)["']?/g
  }
];

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return placeholderWords.some((word) => normalized.includes(word));
}

function isTextFile(filePath) {
  const name = basename(filePath);

  if (name.startsWith(".env")) {
    return true;
  }

  if (textFileNames.has(name) || textFileNames.has(name.replace(/\..+$/, ""))) {
    return true;
  }

  return textExtensions.has(extname(name));
}

function shouldSkip(filePath) {
  const name = basename(filePath);
  return excludedFiles.has(name);
}

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (!excludedDirectories.has(entry)) {
        walk(fullPath, files);
      }
      continue;
    }

    if (stats.isFile() && !shouldSkip(fullPath) && isTextFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function redact(value) {
  if (value.length <= 10) {
    return "[redacted]";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

const findings = [];

for (const filePath of walk(repoRoot)) {
  if (!existsSync(filePath)) {
    continue;
  }

  const relativePath = relative(repoRoot, filePath);
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const check of checks) {
      check.regex.lastIndex = 0;
      let match;

      while ((match = check.regex.exec(line)) !== null) {
        const candidate = match[1] ?? match[0];

        if (isPlaceholder(candidate)) {
          continue;
        }

        findings.push({
          check: check.name,
          line: index + 1,
          path: relativePath,
          value: redact(candidate)
        });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Potential real secrets found:");
  for (const finding of findings) {
    console.error(
      `- ${finding.path}:${finding.line} ${finding.check} ${finding.value}`
    );
  }
  process.exit(1);
}

console.log("No high-confidence raw secrets found.");
