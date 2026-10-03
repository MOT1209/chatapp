// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appTitle => 'Chat App';

  @override
  String get tryAgain => 'Erneut versuchen';

  @override
  String get retry => 'Wiederholen';

  @override
  String get cancel => 'Abbrechen';

  @override
  String get save => 'Speichern';

  @override
  String get delete => 'Löschen';

  @override
  String get somethingWentWrong => 'Etwas ist schiefgelaufen';

  @override
  String get networkError => 'Der Server ist nicht erreichbar. Prüfe deine Verbindung.';

  @override
  String get loading => 'Wird geladen';

  @override
  String get checkingSession => 'Sitzung wird geprüft';

  @override
  String get welcomeBack => 'Willkommen zurück';

  @override
  String get signInSubtitle => 'Melde dich an, um Chat App weiter zu nutzen';

  @override
  String get emailOrUsername => 'E-Mail oder Benutzername';

  @override
  String get enterEmailOrUsername => 'Gib deine E-Mail oder deinen Benutzernamen ein';

  @override
  String get password => 'Passwort';

  @override
  String get enterPassword => 'Gib dein Passwort ein';

  @override
  String get showPassword => 'Passwort anzeigen';

  @override
  String get hidePassword => 'Passwort verbergen';

  @override
  String get login => 'Anmelden';

  @override
  String get noAccount => 'Noch kein Konto?';

  @override
  String get register => 'Registrieren';

  @override
  String get forgotPassword => 'Passwort vergessen?';

  @override
  String get createAccount => 'Konto erstellen';

  @override
  String get createAccountSubtitle => 'Dauert nur eine Minute';

  @override
  String get username => 'Benutzername';

  @override
  String get displayName => 'Anzeigename';

  @override
  String get email => 'E-Mail';

  @override
  String get confirmPassword => 'Passwort bestätigen';

  @override
  String get usernameRequired => 'Wähle einen Benutzernamen';

  @override
  String get usernameInvalid => '3–30 Zeichen: Buchstaben, Ziffern, _ oder .';

  @override
  String get displayNameRequired => 'Gib deinen Anzeigenamen ein';

  @override
  String get atMost50 => 'Höchstens 50 Zeichen';

  @override
  String get emailRequired => 'Gib deine E-Mail ein';

  @override
  String get emailInvalid => 'Gib eine gültige E-Mail-Adresse ein';

  @override
  String get passwordTooShort => 'Mindestens 8 Zeichen';

  @override
  String get passwordTooLong => 'Zu lang: höchstens 72 Bytes (arabische Buchstaben zählen doppelt)';

  @override
  String get passwordsDontMatch => 'Die Passwörter stimmen nicht überein';

  @override
  String get haveAccount => 'Schon ein Konto?';

  @override
  String get resetPasswordTitle => 'Passwort zurücksetzen';

  @override
  String get resetPasswordSubtitle =>
      'Gib die E-Mail deines Kontos ein, und wir senden dir einen Code zum Zurücksetzen.';

  @override
  String get sendResetCode => 'Code senden';

  @override
  String get resetCodeSent => 'Falls ein Konto mit dieser E-Mail existiert, ist ein Code unterwegs.';

  @override
  String get haveResetCode => 'Ich habe einen Code';

  @override
  String get resetCode => 'Code';

  @override
  String get enterResetCode => 'Gib den erhaltenen Code ein';

  @override
  String get newPassword => 'Neues Passwort';

  @override
  String get setNewPassword => 'Neues Passwort festlegen';

  @override
  String get passwordResetDone => 'Passwort geändert. Du kannst dich jetzt anmelden.';

  @override
  String get chats => 'Chats';

  @override
  String get profile => 'Profil';

  @override
  String get search => 'Suchen';

  @override
  String get clearSearch => 'Suche löschen';

  @override
  String get loadingConversations => 'Unterhaltungen werden geladen';

  @override
  String get noConversations => 'Noch keine Unterhaltungen';

  @override
  String get noMatchingChats => 'Keine passenden Chats';

  @override
  String get searchPeopleHint => 'Suche nach Namen oder Benutzernamen, um einen Chat zu beginnen.';

  @override
  String get peopleSection => 'Personen';

  @override
  String get searching => 'Suche läuft';

  @override
  String get noPeopleFound => 'Keine Personen gefunden';

  @override
  String youPrefix(String text) {
    return 'Du: $text';
  }

  @override
  String get noMessagesYet => 'Noch keine Nachrichten';

  @override
  String unreadCount(int count) {
    return '$count ungelesen';
  }

  @override
  String get connecting => 'Verbinden…';

  @override
  String get offline => 'Offline';

  @override
  String get selectConversation => 'Wähle eine Unterhaltung';

  @override
  String get selectConversationHint => 'Wähle links einen Chat oder suche nach jemandem, um einen neuen zu beginnen.';

  @override
  String get back => 'Zurück';

  @override
  String get online => 'Online';

  @override
  String lastSeenAt(String time) {
    return 'Zuletzt online um $time';
  }

  @override
  String lastSeenOn(String date) {
    return 'Zuletzt online $date';
  }

  @override
  String get typing => 'schreibt…';

  @override
  String get loadingMessages => 'Nachrichten werden geladen';

  @override
  String sayHello(String name) {
    return 'Sag Hallo zu $name 👋';
  }

  @override
  String get today => 'Heute';

  @override
  String get yesterday => 'Gestern';

  @override
  String get notSentRetry => 'Nicht gesendet. Zum Wiederholen tippen';

  @override
  String get writeMessage => 'Nachricht schreiben...';

  @override
  String get send => 'Senden';

  @override
  String get deleteMessage => 'Nachricht löschen';

  @override
  String get deleteMessageConfirm => 'Diese Nachricht für alle löschen?';

  @override
  String get messageDeleted => 'Diese Nachricht wurde gelöscht';

  @override
  String get you => 'Du';

  @override
  String get statusSending => 'Wird gesendet';

  @override
  String get statusSent => 'Gesendet';

  @override
  String get statusRead => 'Gelesen';

  @override
  String get statusFailed => 'Fehlgeschlagen';

  @override
  String get editProfile => 'Profil bearbeiten';

  @override
  String get appearance => 'Darstellung';

  @override
  String get themeSystem => 'System';

  @override
  String get themeLight => 'Hell';

  @override
  String get themeDark => 'Dunkel';

  @override
  String get language => 'Sprache';

  @override
  String get languageSystem => 'System';

  @override
  String get logout => 'Abmelden';

  @override
  String get logoutConfirmTitle => 'Abmelden?';

  @override
  String get logoutConfirmBody => 'Du musst dich erneut anmelden, um deine Chats zu sehen.';

  @override
  String get profileImageUrl => 'Profilbild-URL';

  @override
  String get profileImageHint => 'Leer lassen, um deine Initialen zu verwenden';

  @override
  String get enterValidUrl => 'Gib eine http(s)-URL ein';

  @override
  String get urlTooLong => 'Die URL ist zu lang';

  @override
  String get somethingWentWrongRetry => 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';

  @override
  String get errorInvalidCredentials => 'Benutzername oder Passwort ist falsch.';

  @override
  String get errorRateLimited => 'Zu viele Versuche. Warte kurz und versuche es dann erneut.';

  @override
  String get errorConflict => 'Benutzername oder E-Mail wird bereits verwendet.';

  @override
  String get errorNotFound => 'Dieses Element existiert nicht mehr.';

  @override
  String get errorForbidden => 'Das darfst du nicht.';

  @override
  String get errorValidation => 'Einige Angaben sind ungültig. Prüfe sie und versuche es erneut.';

  @override
  String get errorSessionExpired => 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';

  @override
  String get errorServerUnavailable => 'Der Server ist gerade nicht verfügbar. Bitte versuche es gleich noch einmal.';

  @override
  String get errorResetCodeInvalid => 'Dieser Code ist ungültig oder abgelaufen.';

  @override
  String get usernameTaken => 'Dieser Benutzername ist bereits vergeben.';

  @override
  String get emailTaken => 'Diese E-Mail ist bereits registriert.';

  @override
  String get fieldInvalid => 'Prüfe dieses Feld.';

  @override
  String get reconnecting => 'Verbindung wird wiederhergestellt…';

  @override
  String get connectionLost => 'Keine Verbindung. Neuer Versuch läuft…';

  @override
  String get connected => 'Verbunden';

  @override
  String get retryNow => 'Jetzt versuchen';

  @override
  String get rememberMe => 'Angemeldet bleiben';

  @override
  String get newChat => 'Neuer Chat';

  @override
  String get passwordInvalid => '8–72 Zeichen verwenden (arabische Buchstaben zählen doppelt)';

  @override
  String get displayNameInvalid => '1–50 Zeichen verwenden';

  @override
  String errorRateLimitedSeconds(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count Sekunden', one: 'einer Sekunde');
    return 'Zu viele Versuche. Versuche es in $_temp0 erneut.';
  }

  @override
  String errorRateLimitedMinutes(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count Minuten', one: 'einer Minute');
    return 'Zu viele Versuche. Versuche es in $_temp0 erneut.';
  }
}
