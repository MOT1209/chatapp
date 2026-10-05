# UI plan — Flutter client

**Status:** v0.0.2-beta mobile + desktop pass, implemented in `app/`. One Flutter codebase
for Android, iOS, Windows, macOS, Linux and Web. It talks to the backend only through
[`api-contract.md`](./api-contract.md).

## Screens

| Screen | Contents |
| --- | --- |
| Splash | Restores the session with `GET /users/me`, then routes to Login or Home. Retry on network failure |
| Login | Email or username, password, "Keep me signed in", forgot-password link, register link. Loading and error states |
| Register | Username, display name, email, password, confirm password. Client rules mirror contract §3.1 |
| Forgot / reset password | Request a reset link by email. Opening the link (web) goes straight to the new-password step with the code pre-filled; otherwise paste the code under "I have a reset code" |
| Home | Conversation list with search (local filter + `/users/search` for people), a "New chat" entry point, connection banner |
| Chat | Participant with presence or "typing…", messages with day dividers and times, composer |
| Profile | Avatar, username, display name, email, edit profile, theme, language, logout |

## Responsive layout

| Width | Layout |
| --- | --- |
| `< 600` (compact) | Bottom navigation (Chats / Profile). A chat opens full screen with a back button. "New chat" FAB |
| `600–719` (medium, narrow) | Navigation rail, then **one pane at a time**: the conversation list, or the open chat with a back button (Esc and the system Back also close it). "New chat" header button. A list beside a chat would leave the chat ~218px wide at 600, too narrow for bubbles or the composer |
| `720–1023` (medium) | Navigation rail, 300px conversation sidebar, chat area. "New chat" header button. The two-pane threshold is `kTwoPaneMinWidth` in `app/lib/ui/responsive.dart` |
| `≥ 1024` (expanded) | Navigation rail, 360px conversation sidebar, chat area. "New chat" header button |

## Desktop keyboard shortcuts

`Ctrl`/`⌘`+`K` focuses the people-search field (same entry point as "New chat"); `Esc`
closes the open chat and returns to the conversation list. Defined once in
`HomeScreen._withShortcuts` with `CallbackShortcuts`, so they apply at every layout.

## Connection state (`lib/ui/widgets/connection_banner.dart`)

`RealtimeClient.phase` (`idle` / `connecting` / `reconnecting` / `lost` / `connected`) is
derived from the socket's existing status and retry count — the socket logic itself is
unchanged. `ConnectionBanner` turns that into a plain-language strip shown on Home and in
the full-screen phone chat: nothing for a fast first connect, "Connecting…" / "Reconnecting…"
while retrying, "No connection. Retrying…" with a "Retry now" button after 3 failed
attempts, and a 2-second "Connected" confirmation on recovery. No raw socket state or
error code ever reaches this text.

## Behaviour that follows the contract

- **Send (§5.2):** a `clientId` UUID per message, shown immediately as pending, reconciled
  by `clientId`, kept with a retry button if it fails.
- **Status ticks (§5.4):** pending one grey tick, sent two grey, read two blue, failed red.
- **Read (§5.3):** opening a chat or receiving a message in it calls `POST /read` and
  clears the unread badge immediately.
- **Deletion (§3.4.1):** long-press (touch) or right-click (desktop/web) on your own
  message, then confirm. Deleted messages show as "This message was deleted".
- **Typing (§4.3):** at most one `typing: true` frame per 2s while composing, and a final
  `false` after 2s idle or on send. Incoming typing clears itself after 3s.
- **Realtime (§4):** `auth` first frame, 25s ping, reconnect with 1s→15s backoff and jitter,
  token refresh on close code `4401`. After a reconnect the app reloads from REST.
- **Tokens (§5.1):** one shared refresh on `TOKEN_EXPIRED`, then a single retry. An
  `UNAUTHENTICATED` response on a protected call signs the user out.

## Localization and accessibility

- Arabic, English and German via `flutter_localizations` and ARB files in `app/lib/l10n/`.
  The app follows the device language; Profile can override it (chips, not a 4-segment
  button, so they wrap on narrow phones). Arabic is fully right-to-left.
- Noto Sans Arabic is bundled so Arabic renders without a font CDN on web.
- Backend errors are mapped by contract `code` (and field name) to localized messages
  (`errorMessage` / `fieldErrors` in `lib/ui/l10n.dart`); the server's English `message`
  text never reaches the UI. An unrecognized code, or a `502`/`503`/`504`, falls back to a
  generic localized message rather than a raw status.
- Icon buttons have tooltips, headers are marked for screen readers, and status changes
  (typing, connection, errors) are live regions. Layout uses directional alignment.
- Every button, icon button and tappable list row meets a 48px minimum tap target
  (`minTapTarget` in `ui/theme.dart`), checked across ten viewport sizes (360×800 through
  1920×1080) at both 1.0x and 1.3x text scale in `test/viewport_sweep_test.dart`.

## Design tokens (`lib/ui/theme.dart`)

`AppSpacing` (4/8/16/24/32) and `AppRadius` (8/12/16) replace ad-hoc pixel values in the
screens that use them; `buildTheme` also sets shared `ThemeData` for cards, dialogs, list
tiles, the app bar, snackbars (floating) and chips, on top of the existing Material 3 seed
scheme, light/dark/system modes and bundled Arabic font. This is additive theming, not a
visual rewrite — existing screens keep their look.

## Session storage (`lib/core/token_storage.dart`)

| Platform | Store |
| --- | --- |
| Android, iOS, Windows, macOS, Linux | OS credential store via `flutter_secure_storage` (Keystore, Keychain, DPAPI, libsecret). macOS uses the legacy (non-data-protection) keychain so an unsigned build needs no Keychain Sharing entitlement or provisioning profile. |
| Web | `localStorage`. **Trade-off, accepted as-is:** readable by any XSS on the page; there is no OS-level secure store in a browser. |

`RememberingTokenStorage` sits in front of that store: tokens always live in memory, and
are written to the persistent store only while "Keep me signed in" (Profile → Login,
default on) is true. Unticking it keeps the session usable for the current run but leaves
nothing behind for the next launch — the use case is a shared or borrowed device. If the
persistent store itself fails (e.g. Linux with no keyring running), writes and reads
degrade to memory-only rather than falling back to plaintext; the cost is one extra sign-in,
never an unencrypted token on disk. `main.dart` migrates any v0.0.1 plaintext desktop
tokens into the secure store once, and deletes the plaintext copy either way.

## Code layout

```
app/lib/
├── core/      API client, endpoint methods, WebSocket client, token storage, config
├── models/    User, Conversation, Message
├── state/     session, conversations, one open chat, settings (theme + language)
├── l10n/      ARB files and generated localizations
└── ui/        screens, widgets, theme, format helpers, breakpoints
```

State is `ChangeNotifier` controllers exposed with `provider`. The socket is not a state
store: controllers apply its frames to state loaded from REST.

## Deferred beyond this pass

Groups, file sharing, voice and video calls, AI features, message editing, avatar upload,
push notifications, virtualised history for very long conversations, and a signed/notarized
release build for any platform (all current release artifacts are debug-signed or
unsigned; see `docs/development.md` → Releases).
