# Chat App — Flutter client (Alpha v0.0.1)

One codebase for Android, iOS, Windows, macOS, Linux and Web. Talks to the backend
only through [`docs/api-contract.md`](../docs/api-contract.md) — no mock data in the app.

## Run

```bash
cd app
flutter pub get
flutter run -d chrome --web-port 5173   # or: -d linux / macos / windows / <device-id>
```

Port 5173 matches the backend's default `CORS_ORIGIN`. Native apps don't need CORS.

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
flutter build web --release --no-web-resources-cdn
```

## Layout

```
lib/
├── core/      API client (refresh flow), endpoint methods, WebSocket client, token storage
├── models/    User, Conversation, Message — parsed exactly as the contract defines them
├── state/     ChangeNotifier controllers: session, conversations, one open chat, settings
├── l10n/      Arabic and English ARB files (+ generated code)
└── ui/        screens, shared widgets, theme, responsive breakpoints
test/
├── support/   in-memory implementation of the contract (HTTP + WebSocket) — tests only
└── ...        unit tests (client, realtime, chat state, models) and widget tests (flows, layouts)
```

Responsive breakpoints: `< 600` compact (bottom navigation, full-screen chat),
`600–1023` medium and `≥ 1024` expanded (navigation rail, conversation sidebar, chat area).

## Languages

Arabic (right-to-left) and English. The app follows the device language, and Profile can
override it. Strings live in `lib/l10n/app_en.arb` and `lib/l10n/app_ar.arb`; add a key to
both, then `flutter gen-l10n` (also runs on `flutter pub get`). Noto Sans Arabic is bundled
(`assets/fonts`, SIL Open Font License) so web builds don't need a font CDN.

## Known limits in Alpha

- Tokens use Keychain/Keystore on iOS and Android. On web they are in `localStorage`
  (readable by any XSS) and on desktop in a plain preferences file.
- Backend error messages are shown verbatim (contract §1.1), so they stay English in the
  Arabic UI. Client-side errors are localized.
- The message list is not virtualised beyond `ListView.builder`'s lazy building.
