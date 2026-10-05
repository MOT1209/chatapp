import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

/// Web: the refresh token is an `HttpOnly` cookie on a *different* origin than the
/// Flutter app (the app is served from the web host, the API from its own).
///
/// `BrowserClient.withCredentials` defaults to `false`, which maps to XHR's
/// `same-origin` credentials mode — the cookie would simply never be sent, and
/// every session would end at the first refresh. `include` is required, and is only
/// safe because the API sets an exact-origin CORS allowlist and never a wildcard.
http.Client createPlatformHttpClient() => BrowserClient()..withCredentials = true;
