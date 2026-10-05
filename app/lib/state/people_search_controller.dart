import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api_exception.dart';
import '../core/chat_api.dart';
import '../models/user.dart';

/// The server requires at least this many characters before it will search, so
/// the UI does not ask for queries it knows will be rejected.
const kMinPeopleSearchQuery = 2;

/// Debounce between typing and hitting the API.
const kPeopleSearchDebounce = Duration(milliseconds: 300);

/// People lookup for "who can I start a chat with?".
///
/// Search runs through the existing `GET /api/users/search` endpoint, so this
/// never reaches for a directory listing the backend does not expose. Results
/// are exposed as a [ValueListenable] and any query typed while an earlier
/// request is in flight is ignored when it lands.
class PeopleSearchController extends ChangeNotifier {
  PeopleSearchController(this._api);

  final ChatApi _api;

  Timer? _debounce;
  int _seq = 0;
  String _query = '';

  List<User> _people = const [];
  bool _searching = false;
  ApiException? _error;

  String get query => _query;

  /// True while a request is in flight for a query that is still current.
  bool get searching => _searching;

  ApiException? get error => _error;

  /// Matches for the current query; empty until [hasSearched] is true.
  List<User> get people => _people;

  /// True once a query has been sent and answered, successfully or not.
  bool get hasSearched => _error != null || _people.isNotEmpty;

  /// Whether the query is long enough for the endpoint to accept it.
  bool get queryIsSearchable => _query.length >= kMinPeopleSearchQuery;

  /// Called on every keystroke; debounces before hitting the API.
  void updateQuery(String value) {
    final query = value.trim();
    if (query == _query) return;
    _query = query;
    _debounce?.cancel();
    if (query.length < kMinPeopleSearchQuery) {
      _reset();
      notifyListeners();
      return;
    }
    // Drop the previous matches as soon as a new query starts so the UI shows a
    // spinner instead of results that belong to a query the user has changed.
    _seq++;
    _people = const [];
    _searching = true;
    _error = null;
    notifyListeners();
    _debounce = Timer(kPeopleSearchDebounce, () => search());
  }

  void clear() {
    _debounce?.cancel();
    _query = '';
    _reset();
    notifyListeners();
  }

  /// Runs the current query immediately, bypassing the debounce. Used by the
  /// search field's submit action and by retry.
  Future<void> search() async {
    _debounce?.cancel();
    if (!queryIsSearchable) {
      _reset();
      notifyListeners();
      return;
    }
    final seq = ++_seq;
    _searching = true;
    _error = null;
    notifyListeners();
    try {
      final people = await _api.searchUsers(_query);
      if (seq != _seq) return;
      _people = people;
    } on ApiException catch (e) {
      if (seq != _seq) return;
      _error = e;
    } finally {
      if (seq == _seq) {
        _searching = false;
        notifyListeners();
      }
    }
  }

  void _reset() {
    // Invalidate any in-flight response so it cannot repopulate a cleared query.
    _seq++;
    _searching = false;
    _people = const [];
    _error = null;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }
}
