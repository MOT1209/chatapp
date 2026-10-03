import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Per-device UI preferences. A null [locale] follows the system language.
class SettingsController extends ChangeNotifier {
  SettingsController(this._prefs)
    : _themeMode = ThemeMode.values.asNameMap()[_prefs.getString(_themeKey)] ?? ThemeMode.system,
      _locale = switch (_prefs.getString(_localeKey)) {
        final String code => Locale(code),
        null => null,
      };

  static const _themeKey = 'ui.themeMode';
  static const _rememberKey = 'auth.rememberSession';
  static const _localeKey = 'ui.locale';
  static const supportedLocales = [Locale('ar'), Locale('en'), Locale('de')];

  final SharedPreferences _prefs;

  ThemeMode _themeMode;
  ThemeMode get themeMode => _themeMode;

  Locale? _locale;
  Locale? get locale => _locale;

  /// "Keep me signed in": whether tokens are stored on the device (see `RememberingTokenStorage`).
  bool get rememberSession => _prefs.getBool(_rememberKey) ?? true;

  Future<void> setRememberSession(bool value) async {
    if (value == rememberSession) return;
    await _prefs.setBool(_rememberKey, value);
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    if (mode == _themeMode) return;
    _themeMode = mode;
    notifyListeners();
    await _prefs.setString(_themeKey, mode.name);
  }

  Future<void> setLocale(Locale? locale) async {
    if (locale == _locale) return;
    _locale = locale;
    notifyListeners();
    if (locale == null) {
      await _prefs.remove(_localeKey);
    } else {
      await _prefs.setString(_localeKey, locale.languageCode);
    }
  }
}
