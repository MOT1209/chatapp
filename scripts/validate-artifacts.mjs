#!/usr/bin/env node
// Release artifact validation for ChatApp (repair brief §3, §19, §22).
//
// A release is only publishable when every artifact provably exists, is
// non-empty, and — for Windows — actually contains a runnable Flutter app
// (chat_app.exe + flutter_windows.dll + data/), verified by extracting the ZIP
// and checking the extracted tree, not by trusting the packaging step.
//
// Usage:
//   node scripts/validate-artifacts.mjs windows-build <dir>      unpacked Flutter Windows Release dir
//   node scripts/validate-artifacts.mjs windows-zip <dir>        extracted ZIP (expects a ChatApp/ wrapper)
//   node scripts/validate-artifacts.mjs file <path> [--min-size N]   any artifact (apk, zip, tar.gz, ...)
//   node scripts/validate-artifacts.mjs release-dist <dir> --tag v0.0.4-beta         full dist before publishing
//
// Exit codes: 0 = all checks passed, 1 = at least one check failed.

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_WINDOWS_FILES = ['chat_app.exe', 'flutter_windows.dll'];
const REQUIRED_WINDOWS_DIRS = ['data', path.join('data', 'flutter_assets')];

function fail(messages, message) {
  messages.push(message);
}

function checkRegularFileNonEmpty(messages, filePath, label, minSize = 1) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    fail(messages, `${label}: missing (expected at ${filePath}).`);
    return;
  }
  if (!stat.isFile()) {
    fail(messages, `${label}: exists but is not a regular file (${filePath}).`);
    return;
  }
  if (stat.size < minSize) {
    fail(messages, `${label}: exists but is ${stat.size} bytes (required: >= ${minSize}).`);
  }
}

function checkNonEmptyDir(messages, dirPath, label) {
  let stat;
  try {
    stat = fs.statSync(dirPath);
  } catch {
    fail(messages, `${label}: missing (expected directory at ${dirPath}).`);
    return;
  }
  if (!stat.isDirectory()) {
    fail(messages, `${label}: exists but is not a directory (${dirPath}).`);
    return;
  }
  const entries = fs.readdirSync(dirPath);
  if (entries.length === 0) {
    fail(messages, `${label}: directory exists but is empty (${dirPath}).`);
  }
}

/**
 * Validates an unpacked Flutter Windows Release build directory.
 * @returns {string[]} list of problems; empty when valid
 */
export function validateWindowsBuild(dir) {
  const messages = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return [`Windows build directory not found: ${dir}. Did 'flutter build windows --release' run?`];
  }
  for (const file of REQUIRED_WINDOWS_FILES) {
    checkRegularFileNonEmpty(messages, path.join(dir, file), file, 1);
  }
  for (const dirEntry of REQUIRED_WINDOWS_DIRS) {
    checkNonEmptyDir(messages, path.join(dir, dirEntry), `data directory (${dirEntry})`);
  }
  return messages;
}

/**
 * Validates an extracted Windows ZIP. The release ZIP must wrap everything in a
 * `ChatApp/` top-level folder; a stray root-level layout is rejected so the
 * archive can never regress to a pile of loose files.
 * @returns {string[]} list of problems; empty when valid
 */
export function validateWindowsZipExtracted(extractedDir) {
  const messages = [];
  if (!fs.existsSync(extractedDir) || !fs.statSync(extractedDir).isDirectory()) {
    return [`Extracted ZIP directory not found: ${extractedDir}.`];
  }
  const entries = fs.readdirSync(extractedDir);
  if (entries.length === 0) {
    return [`Extracted ZIP is empty (${extractedDir}).`];
  }
  const wrapper = path.join(extractedDir, 'ChatApp');
  const usesWrapper = fs.existsSync(wrapper) && fs.statSync(wrapper).isDirectory();
  const appRoot = usesWrapper ? wrapper : extractedDir;
  if (!usesWrapper) {
    messages.push('Windows ZIP must contain a ChatApp/ top-level folder wrapping the application.');
  }
  messages.push(...validateWindowsBuild(appRoot));
  return messages;
}

/**
 * Validates a single artifact file: exists and is at least `minSize` bytes.
 * @returns {string[]} list of problems; empty when valid
 */
export function validateArtifactFile(filePath, minSize = 1) {
  const messages = [];
  checkRegularFileNonEmpty(messages, filePath, path.basename(filePath), minSize);
  return messages;
}

/**
 * Validates the complete dist directory against the expected artifact names
 * for a tag. The tag string is embedded in every artifact name, so a mismatch
 * here is a release-consistency failure (repair brief §5).
 * @returns {string[]} list of problems; empty when valid
 */
export function validateReleaseDist(distDir, tag) {
  const messages = [];
  const expected = [
    `chatapp-web-${tag}.zip`,
    `chatapp-android-${tag}.apk`,
    `chatapp-windows-x64-${tag}.zip`,
    `chatapp-linux-x64-${tag}.tar.gz`,
    `chatapp-macos-${tag}.zip`,
    'SHA256SUMS.txt',
  ];
  if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
    return [`dist directory not found: ${distDir}.`];
  }
  for (const name of expected) {
    checkRegularFileNonEmpty(messages, path.join(distDir, name), name, 1);
  }
  // Every expected artifact must be covered by the checksums file.
  const sumsPath = path.join(distDir, 'SHA256SUMS.txt');
  if (fs.existsSync(sumsPath)) {
    const sums = fs.readFileSync(sumsPath, 'utf8');
    for (const name of expected.filter((n) => n !== 'SHA256SUMS.txt')) {
      if (!sums.includes(name)) {
        fail(messages, `SHA256SUMS.txt does not cover ${name}.`);
      }
    }
  }
  return messages;
}

function main(argv) {
  const [command, target, ...rest] = argv;
  const flag = (name) => {
    const i = rest.indexOf(name);
    return i === -1 ? undefined : rest[i + 1];
  };

  let problems;
  switch (command) {
    case 'windows-build':
      problems = validateWindowsBuild(target);
      break;
    case 'windows-zip':
      problems = validateWindowsZipExtracted(target);
      break;
    case 'file':
      problems = validateArtifactFile(target, Number(flag('--min-size') ?? 1));
      break;
    case 'release-dist':
      problems = validateReleaseDist(target, flag('--tag'));
      break;
    default:
      console.error(`Unknown command: ${command ?? '(none)'}. See scripts/validate-artifacts.mjs header for usage.`);
      process.exit(1);
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`::error::${problem}`);
    }
    console.error(`Artifact validation failed: ${problems.length} problem(s).`);
    process.exit(1);
  }
  console.log(`Artifact validation passed (${command}).`);
}

// Only run as a CLI, so unit tests can import the functions safely.
const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invoked) {
  main(process.argv.slice(2));
}
