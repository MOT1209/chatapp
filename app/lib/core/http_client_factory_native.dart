import 'package:http/http.dart' as http;

/// Native/desktop/mobile: no cookie jar to configure. `dart:html` is unavailable
/// here, so this file must never be imported on web.
http.Client createPlatformHttpClient() => http.Client();
