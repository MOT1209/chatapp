# Chat App — Flutter client (Alpha v0.0.1)

One codebase for Android, iOS, Windows, macOS, Linux and Web. Talks to the backend
only through [`docs/api-contract.md`](../docs/api-contract.md) — no mock data in the app.

## Run

```bash
cd app
flutter pub get
flutter run -d chrome        # or: -d linux / macos / windows / <device-id>
```

Backend URLs are compile-time settings (defaults shown):

```bash
flutter run \
  --dart-define=API_URL=http://localhost:4000 \
  --dart-define=WS_URL=ws://localhost:4000/ws
```

The Android emulator reaches the host machine at `10.0.2.2`, so use
`API_URL=http://10.0.2.2:4000` and `WS_URL=ws://10.0.2.2:4000/ws` there.
Cleartext HTTP is allowed in Android **debug** builds only.

## Check

```bash
dart format --set-exit-if-changed lib test
flutter analyze
flutter test
flutter build web --release
```

## Layout

```
lib/
├── core/      API client (refresh flow), endpoint methods, WebSocket client, token storage
├── models/    User, Conversation, Message — parsed exactly as the contract defines them
├── state/     ChangeNotifier controllers: session, conversations, one open chat, theme
└── ui/        screens, shared widgets, theme, responsive breakpoints
test/
├── support/   in-memory implementation of the contract (HTTP + WebSocket) — tests only
└── ...        unit tests (client, realtime, chat state, models) and widget tests (flows, layouts)
```

Responsive breakpoints: `< 600` compact (bottom navigation, full-screen chat),
`600–1023` medium and `≥ 1024` expanded (navigation rail, conversation sidebar, chat area).

## Known limits in Alpha

- Tokens live in `shared_preferences` as the contract specifies. On Web that is `localStorage`
  and XSS-readable; move to platform secure storage before a public release.
- Typing indicators are not sent or shown yet, though the contract supports them.
- The message list is not virtualised beyond `ListView.builder`'s lazy building.
- UI strings are English only; layouts use directional alignment so RTL can be added.
