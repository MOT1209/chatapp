import 'dart:convert';

/// The error envelope from contract §1.1, plus a client-side `NETWORK_ERROR`.
class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.fields = const {},
    this.retryAfter,
  });

  factory ApiException.network() => const ApiException(
    statusCode: 0,
    code: networkError,
    message: 'Could not reach the server. Check your connection.',
  );

  factory ApiException.fromResponse(int statusCode, String body, {String? retryAfterHeader}) {
    Map<String, dynamic>? error;
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic> && decoded['error'] is Map<String, dynamic>) {
        error = decoded['error'] as Map<String, dynamic>;
      }
    } on FormatException {
      error = null;
    }
    final rawFields = error?['fields'];
    final seconds = int.tryParse(retryAfterHeader ?? '');
    return ApiException(
      statusCode: statusCode,
      code: error?['code'] as String? ?? 'SERVER_ERROR',
      message: error?['message'] as String? ?? 'Something went wrong ($statusCode).',
      fields: rawFields is Map ? rawFields.map((k, v) => MapEntry(k.toString(), v.toString())) : const {},
      retryAfter: seconds == null ? null : Duration(seconds: seconds),
    );
  }

  static const networkError = 'NETWORK_ERROR';

  final int statusCode;
  final String code;
  final String message;
  final Map<String, String> fields;
  final Duration? retryAfter;

  bool get isNetwork => code == networkError;

  @override
  String toString() => 'ApiException($statusCode $code: $message)';
}
