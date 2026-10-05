# Chat App — API Contract

**Status:** agreed between frontend and backend
**Audience:** the developer building the backend
**Rule:** this document is the source of truth. If the frontend and the backend disagree, this file is wrong and must be updated by both sides in the same change.

Everything below is what the frontend is built against. The frontend makes **no assumptions** beyond this file.

---

## 1. Conventions

| Topic | Decision |
| --- | --- |
| Base URL | `http://localhost:4000` in development, set as `API_URL` (`--dart-define`) in the Flutter client |
| API prefix | every REST route is mounted under `/api` |
| Content type | `application/json` for both request and response bodies |
| Auth | `Authorization: Bearer <accessToken>` on every protected route |
| Tokens | register/login/refresh return `accessToken` in the JSON body. The refresh token additionally travels in an `HttpOnly` cookie scoped to `/api/auth`; native clients also receive it in the body. Web clients receive `csrfToken` and must echo it on the cookie-authenticated calls. See §3.1.1 and §3.1.2 |
| Request ID | every response carries an `X-Request-Id` header. See §1.4 |
| IDs | every entity has an `id` of type string. The backend may use UUIDs or CUIDs — the frontend treats it as an opaque string and never parses it |
| Timestamps | ISO 8601 in UTC, e.g. `"2026-09-28T14:03:11.000Z"`. The frontend formats them for display |
| Money/amounts | not applicable at this stage |
| Pagination | cursor-based, never offset |

### 1.1 Error shape

Every non-2xx response must use this exact envelope:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Incorrect username or password.",
    "fields": {
      "password": "Incorrect username or password."
    }
  }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `code` | yes | `SCREAMING_SNAKE_CASE` machine-readable constant. The frontend switches on this |
| `message` | yes | Human-readable English string, safe to show to the user as a fallback |
| `fields` | no | Object of `fieldName -> message`. Only present for validation errors (HTTP 400/422) |

The frontend shows `fields` next to the matching form input. Because `message` and `fields` values are English, the Flutter client translates them by `code` (and field name) into the UI language and never shows the raw text; an unknown `code` gets a generic "Something went wrong. Please try again." **The frontend never swallows an error: every failure is shown, localized.**

### 1.2 Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Request body failed validation. `fields` is present |
| `INVALID_CREDENTIALS` | 401 | Wrong username/email or password |
| `UNAUTHENTICATED` | 401 | Missing or malformed token |
| `TOKEN_EXPIRED` | 401 | Access token expired. The frontend will attempt a silent refresh and retry once |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Resource does not exist or is not visible to this user |
| `CONFLICT` | 409 | Duplicate registration (e.g. username already taken) |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Unhandled failure |

### 1.3 Rate limiting

Auth routes are rate limited. On `RATE_LIMITED` the backend should send a `Retry-After` header in seconds, and expose it via CORS (`Access-Control-Expose-Headers: Retry-After`) so web clients can read it. The client tells the user how long to wait when the header is present.

Each auth endpoint has its **own** bucket rather than sharing one, because the budgets have very different shapes and sharing them couples unrelated failures:

| Endpoint | Budget | Why |
| --- | --- | --- |
| `POST /api/auth/register` | 10 / 15 min / IP | bcrypt-costly write |
| `POST /api/auth/login` | 20 / 15 min / IP | brute-force protection |
| `POST /api/auth/refresh` | 60 / 15 min / IP | routine traffic; several devices can share an IP |
| `POST /api/auth/forgot-password` | 5 / 15 min / IP | triggers outbound email, so it is an amplifier |
| `POST /api/auth/reset-password` | 10 / 15 min / IP | bcrypt plus a password write |

A brute-force run against `login` must not consume the `refresh` budget, or an attacker could deny service to a client's session renewal merely by hammering login from the same address. All are per-IP: these routes are pre-auth, so there is no user id to key on. The per-account cooldown on `forgot-password` is a separate mechanism and is documented in §3.1.

Search and message sending are additionally limited per authenticated user.

### 1.4 Request ID

Every HTTP response carries an `X-Request-Id` header.

- If the client sent an `X-Request-Id` matching `^[A-Za-z0-9._-]{8,64}$`, it is echoed back; otherwise the server generates a UUID.
- The value is a **correlation handle only**. It is never a secret, never a credential, and never anything a client may present to gain access. Treat it as untrusted input.
- The same ID appears in the server's structured log lines for the request, including the unhandled-error log.

The frontend does not currently send or use it; it is provided so a user-reported failure can be traced to exactly one request.

---

## 1.5 Health and readiness

Both are unauthenticated and outside the `/api` prefix.

| Endpoint | Meaning | Depends on the database |
| --- | --- | --- |
| `GET /health` | liveness: the process is up and serving | **No** |
| `GET /ready` | readiness: the process is up *and* its dependencies are usable | Yes (`SELECT 1`) |

`/health` must stay cheap and database-free so a liveness probe can be aggressive without adding load. `/ready` is what a load balancer or orchestrator should route on: it returns 503 when PostgreSQL is unreachable.

```json
// 200
{ "status": "ok", "service": "chatapp-api", "checks": { "database": "up" } }
// 503
{ "status": "degraded", "service": "chatapp-api", "checks": { "database": "down" } }
```

---

## 2. Entities

### 2.1 User

```ts
type User = {
  id: string;
  username: string;      // unique, lowercase, 3-30 chars
  email: string;         // unique, lowercase
  displayName: string;   // 1-50 chars, shown in the UI
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;  // ISO 8601, null when never seen
  createdAt: string;
};
```

The backend returns the same shape everywhere, including inside conversations and messages. Nested occurrences use the same field names (no `sender.user` indirection).

> **Clarification (added when the backend was implemented):** `email` is only ever present on the caller's *own* record — the response body of `register`, `login`, and `GET`/`PATCH /api/users/me`. Every other occurrence of `User` (a conversation's `participant`, a message's `sender`, a search result, `GET /api/users/:id`) omits the `email` key entirely rather than sending another user's address. The Flutter client's `User.email` is nullable and only the profile screen for the signed-in user shows it.

### 2.2 Conversation

```ts
type Conversation = {
  id: string;
  type: "direct";
  participant: User;          // the *other* user. Never the current user
  lastMessage: Message | null;
  unreadCount: number;
  updatedAt: string;          // ISO 8601. Sort key for the conversation list
};
```

- `type` is always `"direct"` for now. Groups are explicitly out of scope in v1. The field exists so the UI can branch later without a breaking change.
- `unreadCount` is per current user and resets when the conversation is opened.

### 2.3 Message

```ts
type Message = {
  id: string;
  clientId: string;        // generated by the sender's client, echoed back
  conversationId: string;
  sender: User;
  body: string;            // 1-4000 chars, trimmed. "" when deletedAt is set
  createdAt: string;       // ISO 8601, set by the *server*
  status: "sent" | "read"; // as known by the backend
  readAt: string | null;   // when the recipient read it
  deletedAt: string | null; // ISO 8601, set by §3.4.1. Added after the original contract — optional to read
};
```

**`clientId` is the backbone of the send flow.** The frontend generates it before sending, shows the message immediately as optimistic, and reconciles by matching `clientId`. This gives the frontend idempotency and makes retries safe. The backend must:

1. Reject a second insert with the same `(senderId, clientId)` and instead return the already-stored message with HTTP 200. This makes retries safe.
2. Echo `clientId` back in the response and in every realtime push.
3. Set `createdAt` server-side, never from the client.

`status` reflects what the backend knows. The client additionally keeps a local-only `pending` / `failed` state; see §5.4.

---

## 3. REST endpoints

### 3.1 Authentication

#### `POST /api/auth/register` → 201

Request:

```json
{
  "username": "ahmad",
  "email": "ahmad@example.com",
  "password": "correct-horse-battery",
  "displayName": "Ahmad"
}
```

Validation:

| Field | Rules |
| --- | --- |
| `username` | required, 3–30 chars, `a-z0-9_.`, must be unique |
| `email` | required, valid email, must be unique |
| `password` | required, min 8 chars, max **72 bytes** (bcrypt only uses the first 72 bytes; non-Latin letters take 2 or more bytes each, so e.g. 36 Arabic letters is the limit) |
| `displayName` | required, 1–50 chars |

Success response:

```json
{
  "user": { "id": "...", "username": "ahmad", "email": "ahmad@example.com", "displayName": "Ahmad", "avatarUrl": null, "isOnline": false, "lastSeenAt": null, "createdAt": "2026-09-28T10:00:00.000Z" },
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "csrfToken": "0f3c…"
}
```

Also sets `Set-Cookie: chatapp_rt=<refreshToken>` (see §3.1.1). A browser that sends
`X-Client-Platform: web` gets the same response **without** `refreshToken` in the body
(see §3.1.2).

Errors: `VALIDATION_ERROR` (400), `CONFLICT` (409) when username or email is taken.

#### `POST /api/auth/login` → 200

Request:

```json
{ "identifier": "ahmad", "password": "correct-horse-battery" }
```

`identifier` accepts **either** username **or** email. This keeps the login form to a single field.

Success response: identical to register.

Errors: `VALIDATION_ERROR` (400), `INVALID_CREDENTIALS` (401).

> Deliberately returns the same error for "unknown user" and "wrong password" so the endpoint cannot be used to enumerate accounts.

#### 3.1.1 Refresh cookie and CSRF (web clients)

The web build keeps the refresh token in an `HttpOnly` cookie so that JavaScript
running on the origin — an injected script, a compromised dependency, an XSS in
any bundled library — cannot read it. `localStorage` is readable by any such
script, so nothing long-lived goes there.

Cookie: `chatapp_rt=<refreshToken>`, set on register, login and refresh, and
cleared on logout and password reset.

| Attribute | Value |
| --- | --- |
| `HttpOnly` | always |
| `Secure` | in production |
| `SameSite` | `Lax` by default; configurable |
| `Path` | `/api/auth` |
| `Max-Age` | matches the refresh token lifetime |

Because that cookie is ambient authority, every request that relies on it must
also echo `X-CSRF-Token`. The token is an HMAC of the refresh token keyed by
`JWT_REFRESH_SECRET`, so it is derivable server-side and can be re-issued by
`GET /api/auth/csrf` after a page reload. The client holds it in memory only.

Cross-origin web deployments must send the cookie (`credentials: 'include'`) and
the API answers with an exact-origin CORS allowlist — never `*` — plus
`Access-Control-Allow-Credentials: true`. A wildcard is rejected at startup.

#### `GET /api/auth/csrf` → 200

Returns a CSRF token matching the caller's current refresh cookie, for a client
that has to rebuild its session after a reload (the cookie survived, the
in-memory access token and CSRF token did not).

```json
{ "csrfToken": "0f3c…" }
```

Errors: `UNAUTHENTICATED` (401) when there is no usable refresh cookie. Reading
the session does not rotate or revoke it.

#### `POST /api/auth/refresh` → 200

Request, native client:

```json
{ "refreshToken": "eyJhbGciOi..." }
```

Request, web client: **no body at all.** The cookie is sent automatically and
`X-CSRF-Token` is required.

| Sent | Accepted |
| --- | --- |
| `refreshToken` in the body, no cookie | ✅ native clients, unchanged |
| `X-CSRF-Token` + `chatapp_rt` cookie, no body | ✅ web clients |
| cookie **and** body | ✅ body wins, but the cookie's presence still requires a matching `X-CSRF-Token` |
| cookie, no `X-CSRF-Token` | ❌ 401 `UNAUTHENTICATED` — this is the forged-request case |
| `{ "refreshToken": "" }` | ❌ 400 `VALIDATION_ERROR` |

Success response — **both** tokens are returned, because the backend is free to rotate the refresh token:

```json
{ "accessToken": "eyJ...", "refreshToken": "eyJ...", "csrfToken": "0f3c…" }
```

Both the cookie and the body's refresh token are rotated together, and the
returned `csrfToken` matches the new value.

A failed CSRF check does **not** consume the session, so a real client whose
token went stale is not locked out.

Errors: `UNAUTHENTICATED` (401) when the refresh token is missing, malformed, expired or revoked.

#### 3.1.2 Cookie transport — `X-Client-Platform: web`

A server cannot tell a browser from a native app by looking at `POST /auth/login`:
both send the same JSON, and only the browser honours `Set-Cookie`. So the client
says which one it is, and the server shapes the response to match.

| Header on register / login / refresh | Body contains `refreshToken` | Why |
| --- | --- | --- |
| `X-Client-Platform: web` | ❌ omitted | the token is already in the `HttpOnly` cookie; a body copy is readable by any script on the page, so it is exfiltratable regardless of what the client does with it |
| absent | ✅ as before | native has no cookie jar, so the body is its only copy of the credential |

The `Set-Cookie` header is sent in **both** cases, so a web client that forgets the
header on one call still has a working cookie. The bet is one-directional: a client
that lies can only withhold the token from itself, and a client that never sends the
header (every native build released so far) behaves exactly as it did.

```json
// X-Client-Platform: web
{ "accessToken": "eyJ...", "csrfToken": "0f3c…" }

// no header (native)
{ "accessToken": "eyJ...", "refreshToken": "eyJ...", "csrfToken": "0f3c…" }
```

The value is compared case-insensitively after trimming; anything else is treated as
"not a browser" rather than guessed at.

#### `POST /api/auth/logout` → 204

**Logs out every session for the account — every device, not just the caller's.**
The caller is identified by whichever of these it sends (either or both):

- `Authorization: Bearer <accessToken>` — while it is still valid.
- An optional JSON body `{ "refreshToken": "<token>" }` — **additive since the post-Alpha hardening; older clients that send no body keep working.** This is what makes logout work after the 15-minute access token has expired, which is the normal case for a user who returns after a pause.
- The `chatapp_rt` cookie plus `X-CSRF-Token` — what the web client sends.

Every identity found has all its active sessions revoked at once. There is no
per-device "log out this device only" in v1 — logging out on a phone also
signs out the desktop client, the web tab, everything.

The frontend clears local storage and returns to the login screen regardless
of what the server did. A failure here must not block logout on the client.
The endpoint **always** responds 204 and always clears the cookie: a missing,
expired, unknown or malformed token or body is not an error and identifies no
one (it never affects another user's sessions).

> A logout request that carries a cookie **without** a valid `X-CSRF-Token` clears
> the cookie and returns 204 but does **not** revoke anything. The request is
> untrusted, so acting on it would let a third-party site sign the user out.

> Limitation that remains: an access token that was already issued stays valid
> until it expires (up to 15 minutes) even after logout, because it is a
> stateless JWT.

#### `POST /api/auth/forgot-password` → 202

Request:

```json
{ "email": "ahmad@example.com" }
```

Response body: `{}` — always HTTP 202, **whether or not the email exists**. The frontend shows the same confirmation either way, so the endpoint cannot be used to discover which addresses are registered.

The reset link is emailed, not returned. It points at
`APP_BASE_URL/reset-password?token=…`.

Two rate limits apply, both invisible to the caller:

- **Per-account cooldown** (`PASSWORD_RESET_COOLDOWN_SECONDS`): a second request for
  the same address is silently ignored and mints no new token, so no unusable link
  is ever created. One abuser cannot lock any other account out.
- **Unknown addresses send no mail at all**, which keeps the endpoint from being used
  as a spam amplifier against arbitrary third parties.

SMTP must be configured in production; the API refuses to start without it. A
mail that fails to send is logged without the token or the provider's error text
and the endpoint still answers 202 — a bounce must never become a 500 that tells
an attacker the address exists.

#### `POST /api/auth/reset-password` → 204

Request:

```json
{ "token": "<token from the email link>", "newPassword": "new-correct-horse" }
```

Errors: `VALIDATION_ERROR` (400) when the token is invalid or already used.

---

### 3.2 Users

#### `GET /api/users/me` → 200 · protected

Returns the current `User`. Used on app boot to validate the stored token.

Errors: `UNAUTHENTICATED` (401), `TOKEN_EXPIRED` (401).

#### `GET /api/users/search?q=&limit=` → 200 · protected

Searches users **by username and display name**. Must exclude the current user and never return email addresses.

| Query param | Default | Rules |
| --- | --- | --- |
| `q` | — | required, min 2 chars. The frontend debounces input by 300ms |
| `limit` | 20 | max 50 |

Response:

```json
{
  "users": [
    { "id": "...", "username": "sara", "displayName": "Sara", "avatarUrl": null, "isOnline": true, "lastSeenAt": "2026-09-28T14:00:00.000Z", "createdAt": "2026-08-01T09:00:00.000Z" }
  ]
}
```

> `createdAt` is included to keep the `User` type identical everywhere. It is not displayed.

Errors: `VALIDATION_ERROR` (400) when `q` is shorter than 2 chars, `RATE_LIMITED` (429).

#### `GET /api/users/:id` → 200 · protected

Returns a single `User`. Used when opening a conversation from a deep link.

Errors: `UNAUTHENTICATED` (401), `NOT_FOUND` (404).

#### `PATCH /api/users/me` → 200 · protected

Request — every field optional, at least one required:

```json
{ "displayName": "Ahmad H.", "avatarUrl": "https://example.com/a.png" }
```

- `displayName` 1–50 chars.
- `avatarUrl` a valid `http(s)` URL, max 2048 chars, or `null` to clear it.
- Backend returns the updated `User`.

Errors: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401).

---

### 3.3 Conversations

#### `GET /api/conversations?cursor=&limit=50` → 200 · protected

Returns the current user's conversations, **sorted by `updatedAt` descending** (most recent first). The frontend renders the list in the returned order without re-sorting.

Query parameters (both optional):

| Parameter | Default | Notes |
| --- | --- | --- |
| `cursor` | — | Opaque cursor from a previous page's `nextCursor`. Omit for the first page |
| `limit` | `50` | 1–100 |

Response:

```json
{
  "conversations": [
    {
      "id": "c_1",
      "type": "direct",
      "participant": { "id": "u_2", "username": "sara", "displayName": "Sara", "avatarUrl": null, "isOnline": true, "lastSeenAt": "2026-09-28T14:00:00.000Z", "createdAt": "2026-08-01T09:00:00.000Z" },
      "lastMessage": {
        "id": "m_9",
        "clientId": "c_1b3f...",
        "conversationId": "c_1",
        "sender": { "id": "u_2", "username": "sara", "displayName": "Sara", "avatarUrl": null, "isOnline": true, "lastSeenAt": "2026-09-28T14:00:00.000Z", "createdAt": "2026-08-01T09:00:00.000Z" },
        "body": "Hi, are you free later?",
        "createdAt": "2026-09-28T14:02:00.000Z",
        "status": "read",
        "readAt": "2026-09-28T14:02:30.000Z"
      },
      "unreadCount": 2,
      "updatedAt": "2026-09-28T14:02:00.000Z"
    }
  ],
  "nextCursor": "eyJpZCI6ImMxIiwiYXQiOiIyMDI2LTA5LTI4VDE0OjAyOjAwLjAwMFoifQ"
}
```

Notes:
- `nextCursor` is `null` on the last page. The ordering is total (`updatedAt` desc, then `id` desc as a tiebreaker), so a cursor names an exact position and paging cannot skip or repeat a row.
- **Backward compatible:** a client that sends neither `cursor` nor `limit` and ignores `nextCursor` still gets the first page and behaves exactly as before. Pagination only becomes relevant to a client that needs more than one page.
- An empty `conversations` array means "no conversations yet" → the frontend shows an empty state with a *new conversation* call to action. It is not an error.
- `lastMessage` is `null` for a conversation that was created but never had a message.

Errors: `UNAUTHENTICATED` (401), `VALIDATION_ERROR` (400) for a malformed `cursor` or a `limit` outside 1–100.

#### `POST /api/conversations` → 200 · protected

Request:

```json
{ "participantId": "u_2" }
```

**Must be idempotent.** If a direct conversation between the two users already exists, return it with HTTP 200 rather than creating a duplicate or returning 409. The frontend relies on this to make "start a chat" safe to press twice.

Validation: `participantId` required, must exist, must not be the current user.

Response: a single `Conversation` (same shape as an item in the list above).

Errors: `VALIDATION_ERROR` (400), `NOT_FOUND` (404) for an unknown `participantId`.

#### `GET /api/conversations/:id/messages?cursor=&limit=30` → 200 · protected

History for one conversation, **oldest → newest** in the response so the frontend can render in order.

| Query param | Default | Rules |
| --- | --- | --- |
| `cursor` | — | Opaque string from a previous `nextCursor`. Omit for the first page |
| `limit` | 30 | min 1, max 100 |

Response:

```json
{
  "messages": [ /* oldest → newest */ ],
  "nextCursor": "eyJpZCI6Im1fMTAifQ" 
}
```

- `nextCursor` is `null` when the last page has been reached.
- The cursor value is opaque to the frontend. It must not be parsed or constructed by hand.
- The backend must not include the current user's `unreadCount` here; opening a conversation is a separate call (§3.4).

Errors: `UNAUTHENTICATED` (401), `NOT_FOUND` (404), `VALIDATION_ERROR` (400).

---

### 3.4 Messages

#### `POST /api/conversations/:id/messages` → 201 · protected

Request:

```json
{ "clientId": "c_1b3f8a90-1c2d-4e5f-8a9b-0c1d2e3f4a5b", "body": "Hello" }
```

- `clientId` required, a UUID the client generated. Unique per sender.
- `body` required, 1–4000 chars after trimming. Empty or whitespace-only is a validation error.

Response — the created `Message`, with the server-assigned `id` and `createdAt`:

```json
{
  "id": "m_10",
  "clientId": "c_1b3f8a90-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  "conversationId": "c_1",
  "sender": { "id": "u_1", "username": "ahmad", "displayName": "Ahmad", "avatarUrl": null, "isOnline": true, "lastSeenAt": null, "createdAt": "2026-08-01T09:00:00.000Z" },
  "body": "Hello",
  "createdAt": "2026-09-28T14:03:11.000Z",
  "status": "sent",
  "readAt": null
}
```

**Duplicate `clientId` from the same sender** → return the existing message with HTTP 200 (not 201, not an error).

Errors: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `NOT_FOUND` (404), `RATE_LIMITED` (429) for spam.

#### `POST /api/conversations/:id/read` → 204 · protected

Request:

```json
{ "messageId": "m_10" }
```

Marks the conversation read up to and including `messageId`: clears `unreadCount`, sets `readAt` on the recipient's unread messages, and resets the conversation's `updatedAt` ordering only if the backend chooses to. Idempotent — safe to call repeatedly.

The frontend calls this when: the conversation is opened, the tab regains focus with unread messages, and new messages arrive while the window is visible.

No response body. Errors: `UNAUTHENTICATED` (401), `NOT_FOUND` (404).

#### 3.4.1 `DELETE /api/conversations/:id/messages/:messageId` → 204 · protected

**Added when the backend was implemented — not in the original v1 contract**, which listed message deletion as out of scope (§6). Alpha v0.0.1's backend task required "basic message deletion," so it was added here rather than left undocumented. It is additive: no existing endpoint, field, or frame changed shape, so a frontend built against the original contract keeps working unchanged.

No request body. Only the message's own sender may delete it. Deletion is soft: the row is kept for conversation history, `body` is cleared server-side, and `deletedAt` is set. Every place a `Message` appears (REST responses, `message:new`, `message:updated`) now carries this optional `deletedAt` field — `null` for a normal message.

A delete broadcasts `message:updated` (§4.4) with the updated (now-empty) message to both participants, the same event already used for read-state changes.

Errors:

| Code | HTTP | When |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | Missing/invalid token |
| `NOT_FOUND` | 404 | Message or conversation doesn't exist, or isn't visible to the caller |
| `FORBIDDEN` | 403 | The caller is a conversation member but not the message's sender |

---

## 4. WebSocket

### 4.1 Connection

| Topic | Decision |
| --- | --- |
| URL | `ws://localhost:4000/ws`, from `WS_URL` (`--dart-define`) |
| Protocol | raw WebSocket, no library. Frame format is JSON text |
| Auth | **not** a query parameter. The first frame the client sends must be `auth` (§4.3). The backend closes the socket with code `4401` if it does not arrive within 5 seconds |
| Authorization | authentication alone is not authorization. Every `typing` and `read` frame is checked against real conversation membership, the same check the REST endpoints use. A frame for a conversation the sender does not belong to is dropped silently — no error frame, no broadcast to anyone, connection stays open. Silent rather than an explicit `FORBIDDEN` on purpose: it doesn't confirm or deny that the conversation exists to someone outside it |
| Lifetime | a socket never outlives the credentials it authenticated with. The server closes it with code `4401` when the access token in its `auth` frame expires, and immediately when the user logs out (all sessions) or resets their password. The client treats `4401` as "refresh, then reconnect"; if the refresh fails it returns to Login. A normal `/auth/refresh` does not close the socket |
| Limits | abuse guards, all closing with code `4429` (a transient failure: the client reconnects with the normal backoff and does **not** refresh tokens). (1) **Connections per account:** at most `WS_MAX_CONNECTIONS_PER_USER` (default 10) authenticated sockets at once. The socket that would exceed it receives an `error` frame with `code: "RATE_LIMITED"` and is closed; sockets already open are never evicted, because evicting would make two over-limit clients kick each other off in a loop. (2) **Frames per socket:** more than 200 frames of any kind (valid, invalid or `ping`) in a 10 s window closes the socket. Separately, `typing`/`read` frames over 20 per 10 s are silently dropped. (3) **Slow readers:** a socket with more than 1 MiB of unsent data queued is terminated; it resyncs from REST on reconnect |
| Heartbeat | client sends `ping` every 25s. The server replies `pong`. The frontend tolerates up to 2 missed pongs before forcing a reconnect |
| Reconnect | client-side only, exponential backoff 1s → 2s → 4s → 8s → 15s cap, with jitter. The frontend never reconnects automatically while the tab is hidden, and retries once immediately on `online` |

### 4.2 Frame envelope

Every frame in both directions is:

```json
{ "type": "<string>", "payload": { } }
```

No frame may be sent without a `type`.

**Every incoming frame is validated at runtime against the exact shapes in
§4.3** (backend: Zod; the TypeScript/Dart types describe the intent, not the
enforcement). A frame that isn't valid JSON, has an unrecognized `type`, is
missing a required payload field, or has a field of the wrong type is
rejected: the server replies `{ "type": "error", "payload": { "code":
"VALIDATION_ERROR", "message": "..." } }` and drops that one frame — the
connection stays open. A frame larger than 16KB is rejected at the transport
level (the connection closes; legitimate frames are a few hundred bytes at
most, so this is a size-limit backstop, not a business rule).

### 4.3 Client → server

| `type` | Payload | When |
| --- | --- | --- |
| `auth` | `{ "token": "eyJhbGciOi..." }` | First frame, immediately after connecting |
| `typing` | `{ "conversationId": "c_1", "isTyping": true }` | On typing start and stop. Client throttles to at most one frame per 2s and always sends a final `false` after 2s of inactivity |
| `read` | `{ "conversationId": "c_1", "messageId": "m_10" }` | Same triggers as the REST `read` call. The socket version must produce the same effect |
| `ping` | `{}` | Every 25s |

### 4.4 Server → client

| `type` | Payload |
| --- | --- |
| `ready` | `{ "userId": "u_1" }` — sent once after a successful `auth`, confirming the connection is authenticated |
| `message:new` | `{ "message": <Message> }` |
| `message:updated` | `{ "message": <Message> }` — fired when `status`, `readAt`, or `deletedAt` changes |
| `typing` | `{ "conversationId": "c_1", "userId": "u_2", "isTyping": true }` |
| `presence` | `{ "userId": "u_2", "isOnline": true, "lastSeenAt": null }` |
| `read` | `{ "conversationId": "c_1", "userId": "u_2", "messageId": "m_10", "readAt": "2026-09-28T14:03:40.000Z" }` |
| `pong` | `{}` |
| `error` | `{ "code": "UNAUTHENTICATED", "message": "..." }` — same `code` values as REST §1.2 |

### 4.5 Delivery expectations

| Event | Target latency |
| --- | --- |
| `message:new` to the recipient | under 500ms |
| `typing` | under 200ms |
| `presence` | under 1s |

### 4.6 How the frontend uses realtime

The socket is **not** a state store. It is an invalidation signal:

- `message:new` → append into the messages query cache, and patch the matching conversation's `lastMessage` / `unreadCount` / `updatedAt`
- `message:updated` / `read` → patch the message in the cache
- `presence` → patch `isOnline` on that user wherever it appears
- `typing` → a transient in-memory signal, never cached, auto-cleared after 3s

The HTTP endpoints in §3 stay authoritative. A full page reload always produces correct state from REST alone, so the frontend is never dependent on having missed a socket frame.

---

## 5. Frontend implementation notes

Shared with the backend developer so both sides know how the client behaves.

### 5.1 Token handling

1. On boot the client reads its token storage, then calls `GET /api/users/me` to confirm the token is still valid. On web it first calls `GET /api/auth/csrf` and refreshes, because only the access token survives a reload — the refresh cookie and the in-memory CSRF token have to be re-adopted.
2. On any `401 TOKEN_EXPIRED`, the frontend calls `POST /api/auth/refresh` once and retries the original request. Concurrent 401s share a single refresh call.
3. If refresh fails, it clears storage and returns to `/login`. It does **not** retry in a loop.

What the client stores differs by platform, and the client decides by asking its
token storage rather than by checking the platform, so both paths are testable:

| | Native (Android/iOS/Desktop) | Web |
| --- | --- | --- |
| Access token | OS credential store | `localStorage` (15 min, acceptable) |
| Refresh token | OS credential store | **not stored** — `HttpOnly` cookie |
| CSRF token | not needed | memory only, re-fetched on boot |
| Refresh call | `refreshToken` in the body | no body, `X-CSRF-Token` header |
| Requests | no credentials mode | `credentials: 'include'` |
| Token requests | no extra header | `X-Client-Platform: web`, so the server omits `refreshToken` from the body |

An older build left the refresh token in web `localStorage`; the client deletes
that key on boot so the old secret cannot sit there forever.

### 5.2 Sending a message

1. Generate a `clientId` UUID.
2. Insert the message into the UI immediately, flagged `pending` locally.
3. `POST` it. On success replace the optimistic entry with the server's version by matching `clientId`.
4. On failure, keep the bubble and mark it `failed` with a retry button. The frontend **never removes a failed message silently.**

### 5.3 Reading a conversation

Opening a conversation triggers `POST /read` with the newest message id, and the frontend sets `unreadCount` to 0 in the cache immediately without waiting for a response.

### 5.4 Message status shown in the UI

| Local state | Appearance |
| --- | --- |
| `pending` | one grey check |
| `sent` | two grey checks |
| `read` | two blue checks |
| `failed` | red indicator plus a retry button |

---

## 6. Open items

These are not blocking the frontend. Confirm when convenient.

1. **Avatar upload** — v1 sets `avatarUrl` to a URL string, with no upload endpoint. If you want real uploads, that needs an endpoint and storage. The UI is built to accept a URL and degrades to initial-letter avatars when it is `null`.
2. **Rate limit values** — the frontend will not surface a specific retry duration beyond the `Retry-After` header.
3. **Message editing** — still not in v1. **Deletion** was added — see §3.4.1 — because Alpha v0.0.1's backend task required it; the frontend doesn't need to call it to keep working, but should adopt `DELETE .../messages/:messageId` and the `deletedAt` field when convenient.
4. **Registration open or invite-only** — v1 assumes open registration. If it must be invite-only, say so and the frontend will hide the register link.
5. **Rate limit values (concrete numbers)** — implemented as: register/login/forgot-password/reset-password 20 requests / 15 min per IP; user search 30 requests / min per authenticated user; message send 60 requests / min per authenticated user. These are Alpha judgment calls, not requirements — tell the backend if the UI needs them adjusted.
6. **Forgot/reset password email delivery** — **resolved.** `forgot-password` now sends the reset link over SMTP, so production can complete a reset. Configuration lives in `backend/.env.example`; the API refuses to start in production without it.
   - The token is emailed as a link to `APP_BASE_URL/reset-password?token=…`, which must be an **https** URL in production. The provider's error text and the token itself are never logged.
   - A failed send still answers 202, so a bounce cannot become a 500 that reveals whether an address is registered.
   - Outside production the raw token also comes back from `requestPasswordReset`, so tests can read it directly. It is never returned over HTTP in any environment.
7. ~~**Refresh token still in the JSON body**~~ — **resolved.** register/login/refresh omit `refreshToken` from the body when the request carries `X-Client-Platform: web`, and still return it when the header is absent, so native builds are untouched. See §3.1.2.
8. **Refresh cookie name and CSRF shape** — `chatapp_rt` on `/api/auth`, and a CSRF token that is an HMAC of the refresh token. Both are internal choices, not requirements; changing either only needs the two clients to move together.
