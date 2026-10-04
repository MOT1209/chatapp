import 'package:http/http.dart' as http;

import 'http_client_factory_native.dart'
    if (dart.library.js_interop) 'http_client_factory_web.dart' as platform;

/// The HTTP client used by `ApiClient` on the current platform.
///
/// On web this is a `BrowserClient` with `withCredentials = true`, which is what
/// makes the cross-origin `Set-Cookie` on login actually reach the browser's cookie
/// jar. The default is `false`, and a plain `http.Client()` cannot be configured
/// after construction — hence the conditional import rather than a flag.
http.Client createApiHttpClient() => platform.createPlatformHttpClient();