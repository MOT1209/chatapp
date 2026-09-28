/// Set at build time: `flutter run --dart-define=API_URL=... --dart-define=WS_URL=...`.
class AppConfig {
  static const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:4000');
  static const wsUrl = String.fromEnvironment('WS_URL', defaultValue: 'ws://localhost:4000/ws');
}
