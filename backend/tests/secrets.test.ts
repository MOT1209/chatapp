import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadSecretFiles } from '../src/config/secrets.js';

describe('loadSecretFiles — P0-5 secret management', () => {
  // A distinctive name per test keeps each case independent, since the loader
  // mutates process.env and nothing else resets it for us.
  const NAME = 'CHATAPP_TEST_SECRET';
  let dir: string;
  const created: string[] = [];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'chatapp-secrets-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const file of created) delete process.env[file];
    delete process.env[NAME];
  });

  function writeSecret(contents: string): string {
    const file = path.join(dir, 'secret.txt');
    writeFileSync(file, contents, 'utf8');
    created.push(`${NAME}_FILE`);
    return file;
  }

  function setFile(contents: string): void {
    process.env[`${NAME}_FILE`] = writeSecret(contents);
  }

  it('folds a *_FILE path into the plain variable name', () => {
    setFile('super-secret-value');
    loadSecretFiles();
    expect(process.env[NAME]).toBe('super-secret-value');
  });

  it('strips exactly one trailing newline, because every editor adds one', () => {
    setFile('super-secret-value\n');
    loadSecretFiles();
    expect(process.env[NAME]).toBe('super-secret-value');
  });

  it('strips a Windows CRLF line ending', () => {
    setFile('super-secret-value\r\n');
    loadSecretFiles();
    expect(process.env[NAME]).toBe('super-secret-value');
  });

  it('keeps interior and surrounding whitespace, which may be part of the secret', () => {
    setFile('  spaces matter  ');
    loadSecretFiles();
    expect(process.env[NAME]).toBe('  spaces matter  ');
  });

  it('lets a literal value win over the file, so an explicit override still works', () => {
    setFile('from-file');
    process.env[NAME] = 'from-env';
    loadSecretFiles();
    expect(process.env[NAME]).toBe('from-env');
  });

  it('falls back to the file when the literal is empty', () => {
    setFile('from-file');
    process.env[NAME] = '';
    loadSecretFiles();
    expect(process.env[NAME]).toBe('from-file');
  });

  it('throws rather than silently booting without a secret that was meant to be mounted', () => {
    created.push(`${NAME}_FILE`);
    process.env[`${NAME}_FILE`] = path.join(dir, 'missing.txt');
    expect(() => loadSecretFiles()).toThrow(new RegExp(`${NAME}_FILE`));
  });

  it('never logs the secret value it reads', () => {
    setFile('do-not-log-this');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      loadSecretFiles();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
    const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
    expect(logged).not.toContain('do-not-log-this');
  });

  it('is idempotent, so a reload cannot corrupt an already-folded value', () => {
    setFile('stable-value');
    loadSecretFiles();
    loadSecretFiles();
    expect(process.env[NAME]).toBe('stable-value');
  });
});