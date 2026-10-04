import fs from 'node:fs';

/**
 * Resolves configuration from the process environment, allowing any secret to be
 * supplied as a *file path* instead of a literal value.
 *
 * The convention is the one Docker, Kubernetes, systemd and most secret managers
 * (Vault, AWS/GCP/Azure secret stores) already speak: if `JWT_ACCESS_SECRET` is not
 * set but `JWT_ACCESS_SECRET_FILE` points at a readable file, the file's contents
 * (minus one trailing newline) are used. This is what keeps production secrets out
 * of `.env` files, process listings and container environment dumps:
 *
 *   - Docker/Kubernetes:  mount a Secret at /run/secrets/jwt_access_secret
 *   - systemd:            `LoadCredential=` then `JWT_ACCESS_SECRET_FILE=%d/jwt_access_secret`
 *   - Vault:              sidecar/agent writes the file, or injects the env var directly
 *   - Render/Fly/Railway: inject the env var — no file needed, `*_FILE` simply stays unset
 *
 * A literal value always wins over a file: the file is a fallback, never an override.
 * That keeps a stale mounted file from silently shadowing a correctly rotated secret.
 */
export const SECRET_FILE_SUFFIX = '_FILE';

/** Reads a secret from `NAME_FILE`, or returns undefined when it is not configured. */
function readSecretFile(name: string): string | undefined {
  const path = process.env[`${name}${SECRET_FILE_SUFFIX}`];
  if (path === undefined || path.trim() === '') {
    return undefined;
  }
  try {
    // Trim only line endings: a base64 or hex secret is never intentionally padded
    // with spaces, but a trailing newline from `echo` or `kubectl create secret` is
    // the single most common way a good secret turns into a broken one.
    return fs.readFileSync(path.trim(), 'utf8').replace(/\r?\n$/, '');
  } catch (err) {
    // Never echo the path's contents, and keep the message free of anything that
    // could identify the secret material itself.
    throw new Error(`Could not read ${name}${SECRET_FILE_SUFFIX} from the configured path.`, { cause: err });
  }
}

/**
 * Folds every `*_FILE` variable into its base name, then re-exports the result so
 * `config/env.ts` sees a single, uniform `process.env`. Idempotent.
 */
export function loadSecretFiles(): void {
  const files = Object.keys(process.env).filter((key) => key.endsWith(SECRET_FILE_SUFFIX));
  for (const fileVar of files) {
    const name = fileVar.slice(0, -SECRET_FILE_SUFFIX.length);
    // A literal value already present is authoritative; the file is only a fallback.
    if (process.env[name] !== undefined && process.env[name] !== '') {
      continue;
    }
    const value = readSecretFile(name);
    if (value !== undefined) {
      process.env[name] = value;
    }
  }
}