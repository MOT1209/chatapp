/**
 * Bridges API errors into react-hook-form.
 *
 * When the backend rejects a request it returns a `fields` map naming the offending
 * inputs. Applying that map is what makes a server-side rule, such as "that username
 * is taken", appear next to the right field instead of as a generic banner.
 */

import type { UseFormSetError, FieldValues, Path } from "react-hook-form";

import { ApiError } from "./api-client";

/** Applies `error.fields` onto the form. Returns a banner message when there is no field to blame. */
export function applyApiFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : null;
  }

  if (error.fields) {
    for (const [field, message] of Object.entries(error.fields)) {
      // Only paths the form actually knows about are set, so a typo in the backend
      // contract cannot crash the form.
      setError(field as Path<T>, { type: "server", message });
    }
    // Field-level problems are already visible in the form; no banner needed.
    return null;
  }

  return error.message;
}
