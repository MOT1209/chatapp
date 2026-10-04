// Unit tests for scripts/validate-artifacts.mjs — mandatory repair test #1:
// the Windows artifact validation script must catch a broken/partial build and
// a ZIP without the required runnable app files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateWindowsBuild, validateWindowsZipExtracted, validateArtifactFile, validateReleaseDist } from './validate-artifacts.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'chatapp-validate-'));
}

/** Builds a minimal but structurally correct Flutter Windows Release tree. */
function writeValidWindowsBuild(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'chat_app.exe'), 'fake-exe-bytes');
  fs.writeFileSync(path.join(root, 'flutter_windows.dll'), 'fake-dll-bytes');
  fs.mkdirSync(path.join(root, 'data', 'flutter_assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'icudtl.dat'), 'icu');
  fs.writeFileSync(path.join(root, 'data', 'flutter_assets', 'kernel_blob.bin'), 'blob');
}

test('accepts a complete Windows build directory', () => {
  const dir = tmpDir();
  writeValidWindowsBuild(dir);
  assert.deepEqual(validateWindowsBuild(dir), []);
});

test('rejects a Windows build directory missing chat_app.exe', () => {
  const dir = tmpDir();
  writeValidWindowsBuild(dir);
  fs.rmSync(path.join(dir, 'chat_app.exe'));
  const problems = validateWindowsBuild(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /chat_app\.exe: missing/);
});

test('rejects a Windows build directory missing flutter_windows.dll or an empty data dir', () => {
  const dir = tmpDir();
  writeValidWindowsBuild(dir);
  fs.rmSync(path.join(dir, 'flutter_windows.dll'));
  fs.writeFileSync(path.join(dir, 'data', 'icudtl.dat'), ''); // empty file is fine; dir emptiness is what matters
  fs.rmSync(path.join(dir, 'data', 'flutter_assets'), { recursive: true });
  const problems = validateWindowsBuild(dir);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /flutter_windows\.dll: missing/);
  assert.match(problems[1], /data directory/);
});

test('rejects a Windows build with a zero-byte chat_app.exe', () => {
  const dir = tmpDir();
  writeValidWindowsBuild(dir);
  fs.writeFileSync(path.join(dir, 'chat_app.exe'), '');
  const problems = validateWindowsBuild(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /0 bytes/);
});

test('rejects a nonexistent build directory', () => {
  const problems = validateWindowsBuild(path.join(tmpDir(), 'does-not-exist'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not found/);
});

test('accepts an extracted ZIP wrapped in ChatApp/ and validates the inner tree', () => {
  const dir = tmpDir();
  writeValidWindowsBuild(path.join(dir, 'ChatApp'));
  assert.deepEqual(validateWindowsZipExtracted(dir), []);
});

test('rejects an extracted ZIP without the ChatApp/ wrapper even when files are present', () => {
  const dir = tmpDir();
  writeValidWindowsBuild(dir);
  const problems = validateWindowsZipExtracted(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ChatApp\/ top-level folder/);
});

test('rejects an empty extracted ZIP', () => {
  const problems = validateWindowsZipExtracted(tmpDir());
  assert.equal(problems.length, 1);
  assert.match(problems[0], /empty/);
});

test('validateArtifactFile rejects missing and empty files, accepts a real one', () => {
  const dir = tmpDir();
  const good = path.join(dir, 'chatapp-android-v0.0.4-beta.apk');
  fs.writeFileSync(good, 'apk-bytes');
  assert.deepEqual(validateArtifactFile(good), []);
  assert.equal(validateArtifactFile(path.join(dir, 'missing.apk')).length, 1);
  const empty = path.join(dir, 'empty.apk');
  fs.writeFileSync(empty, '');
  assert.match(validateArtifactFile(empty)[0], /0 bytes/);
});

test('validateReleaseDist requires all five artifacts plus checksums for the tag', () => {
  const dir = tmpDir();
  const tag = 'v0.0.4-beta';
  for (const name of [
    `chatapp-web-${tag}.zip`,
    `chatapp-android-${tag}.apk`,
    `chatapp-windows-x64-${tag}.zip`,
    `chatapp-linux-x64-${tag}.tar.gz`,
    `chatapp-macos-${tag}.zip`,
  ]) {
    fs.writeFileSync(path.join(dir, name), 'x');
  }
  // No SHA256SUMS.txt yet → exactly one problem.
  let problems = validateReleaseDist(dir, tag);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /SHA256SUMS\.txt: missing/);

  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), `<hash>  chatapp-web-${tag}.zip\n`);
  problems = validateReleaseDist(dir, tag);
  // The four artifacts not yet listed in the checksums file are each a failure.
  assert.equal(problems.length, 4);
  assert.match(problems[0], /does not cover chatapp-android/);
});

test('validateReleaseDist accepts a complete dist with full checksums', () => {
  const dir = tmpDir();
  const tag = 'v0.0.4-beta';
  const names = [
    `chatapp-web-${tag}.zip`,
    `chatapp-android-${tag}.apk`,
    `chatapp-windows-x64-${tag}.zip`,
    `chatapp-linux-x64-${tag}.tar.gz`,
    `chatapp-macos-${tag}.zip`,
  ];
  for (const name of names) {
    fs.writeFileSync(path.join(dir, name), 'x');
  }
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), names.map((n) => `<hash>  ${n}`).join('\n'));
  assert.deepEqual(validateReleaseDist(dir, tag), []);
});
