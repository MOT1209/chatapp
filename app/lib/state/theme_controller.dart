import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ThemeController extends ChangeNotifier {
  ThemeController(this._prefs) : _mode = ThemeMode.values.asNameMap()[_prefs.getString(_key)] ?? ThemeMode.system;

  static const _key = 'ui.themeMode';
  final SharedPreferences _prefs;

  ThemeMode _mode;
  ThemeMode get mode => _mode;

  Future<void> setMode(ThemeMode mode) async {
    if (mode == _mode) return;
    _mode = mode;
    notifyListeners();
    await _prefs.setString(_key, mode.name);
  }
}
