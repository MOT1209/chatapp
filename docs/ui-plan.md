# UI plan — Flutter client

**Status:** Alpha v0.0.1, implemented in `app/`. One Flutter codebase for Android, iOS,
Windows, macOS, Linux and Web. It talks to the backend only through
[`api-contract.md`](./api-contract.md).

## Screens

| Screen | Contents |
| --- | --- |
| Splash | Restores the session with `GET /users/me`, then routes to Login or Home. Retry on network failure |
| Login | Email or username, password, forgot-password link, register link. Loading and error states |
| Register | Username, display name, email, password, confirm password. Client rules mirror contract §3.1 |
| Forgot / reset password | Request a reset code by email, then set a new password with the code |
| Home | Conversation list with search (local filter + `/users/search` for people) |
| Chat | Participant with presence or "typing…", messages with day dividers and times, composer |
| Profile | Avatar, username, display name, email, edit profile, theme, language, logout |

## Responsive layout

| Width | Layout |
| --- | --- |
| `< 600` (compact) | Bottom navigation (Chats / Profile). A chat opens full screen with a back button |
| `600–1023` (medium) | Navigation rail, 300px conversation sidebar, chat area |
| `≥ 1024` (expanded) | Navigation rail, 360px conversation sidebar, chat area |

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

- Arabic, English and German via `flutter_localizations` and ARB files in `app/lib/l10n/`. The app
  follows the device language; Profile can override it. Arabic is fully right-to-left.
- Noto Sans Arabic is bundled so Arabic renders without a font CDN on web.
- English, Arabic and German. Backend errors are mapped by `code` to localized messages
  (`errorMessage` / `fieldErrors` in `lib/ui/l10n.dart`); raw server text is never shown.
- Icon buttons have tooltips, headers are marked for screen readers, and status changes
  (typing, connection, errors) are live regions. Layout uses directional alignment.

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

## Deferred beyond Alpha

Groups, file sharing, voice and video calls, AI features, message editing, avatar upload,
push notifications, and virtualised history for very long conversations.
