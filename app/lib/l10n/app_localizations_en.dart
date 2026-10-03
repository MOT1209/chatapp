// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Chat App';

  @override
  String get tryAgain => 'Try again';

  @override
  String get retry => 'Retry';

  @override
  String get cancel => 'Cancel';

  @override
  String get save => 'Save';

  @override
  String get delete => 'Delete';

  @override
  String get somethingWentWrong => 'Something went wrong';

  @override
  String get networkError => 'Could not reach the server. Check your connection.';

  @override
  String get loading => 'Loading';

  @override
  String get checkingSession => 'Checking your session';

  @override
  String get welcomeBack => 'Welcome back';

  @override
  String get signInSubtitle => 'Sign in to continue to Chat App';

  @override
  String get emailOrUsername => 'Email or username';

  @override
  String get enterEmailOrUsername => 'Enter your email or username';

  @override
  String get password => 'Password';

  @override
  String get enterPassword => 'Enter your password';

  @override
  String get showPassword => 'Show password';

  @override
  String get hidePassword => 'Hide password';

  @override
  String get login => 'Login';

  @override
  String get noAccount => 'Don\'t have an account?';

  @override
  String get register => 'Register';

  @override
  String get forgotPassword => 'Forgot password?';

  @override
  String get createAccount => 'Create your account';

  @override
  String get createAccountSubtitle => 'It only takes a minute';

  @override
  String get username => 'Username';

  @override
  String get displayName => 'Display name';

  @override
  String get email => 'Email';

  @override
  String get confirmPassword => 'Confirm password';

  @override
  String get usernameRequired => 'Choose a username';

  @override
  String get usernameInvalid => '3–30 characters: letters, numbers, _ or .';

  @override
  String get displayNameRequired => 'Enter your display name';

  @override
  String get atMost50 => 'At most 50 characters';

  @override
  String get emailRequired => 'Enter your email';

  @override
  String get emailInvalid => 'Enter a valid email address';

  @override
  String get passwordTooShort => 'At least 8 characters';

  @override
  String get passwordTooLong => 'Too long: at most 72 bytes (Arabic letters count as 2)';

  @override
  String get passwordsDontMatch => 'Passwords do not match';

  @override
  String get haveAccount => 'Already have an account?';

  @override
  String get resetPasswordTitle => 'Reset your password';

  @override
  String get resetPasswordSubtitle => 'Enter your account email and we\'ll send you a reset code.';

  @override
  String get sendResetCode => 'Send reset code';

  @override
  String get resetCodeSent => 'If an account exists for that email, a reset code is on its way.';

  @override
  String get haveResetCode => 'I have a reset code';

  @override
  String get resetCode => 'Reset code';

  @override
  String get enterResetCode => 'Enter the code you received';

  @override
  String get newPassword => 'New password';

  @override
  String get setNewPassword => 'Set new password';

  @override
  String get passwordResetDone => 'Password updated. You can log in now.';

  @override
  String get chats => 'Chats';

  @override
  String get profile => 'Profile';

  @override
  String get search => 'Search';

  @override
  String get clearSearch => 'Clear search';

  @override
  String get loadingConversations => 'Loading conversations';

  @override
  String get noConversations => 'No conversations yet';

  @override
  String get noMatchingChats => 'No matching chats';

  @override
  String get searchPeopleHint => 'Search for people by name or username to start chatting.';

  @override
  String get peopleSection => 'People';

  @override
  String get searching => 'Searching';

  @override
  String get noPeopleFound => 'No people found';

  @override
  String youPrefix(String text) {
    return 'You: $text';
  }

  @override
  String get noMessagesYet => 'No messages yet';

  @override
  String unreadCount(int count) {
    return '$count unread';
  }

  @override
  String get connecting => 'Connecting…';

  @override
  String get offline => 'Offline';

  @override
  String get selectConversation => 'Select a conversation';

  @override
  String get selectConversationHint => 'Choose a chat from the list, or search for someone to start a new one.';

  @override
  String get back => 'Back';

  @override
  String get online => 'Online';

  @override
  String lastSeenAt(String time) {
    return 'Last seen at $time';
  }

  @override
  String lastSeenOn(String date) {
    return 'Last seen $date';
  }

  @override
  String get typing => 'typing…';

  @override
  String get loadingMessages => 'Loading messages';

  @override
  String sayHello(String name) {
    return 'Say hello to $name 👋';
  }

  @override
  String get today => 'Today';

  @override
  String get yesterday => 'Yesterday';

  @override
  String get notSentRetry => 'Not sent. Tap to retry';

  @override
  String get writeMessage => 'Write a message...';

  @override
  String get send => 'Send';

  @override
  String get deleteMessage => 'Delete message';

  @override
  String get deleteMessageConfirm => 'Delete this message for everyone?';

  @override
  String get messageDeleted => 'This message was deleted';

  @override
  String get you => 'You';

  @override
  String get statusSending => 'Sending';

  @override
  String get statusSent => 'Sent';

  @override
  String get statusRead => 'Read';

  @override
  String get statusFailed => 'Failed';

  @override
  String get editProfile => 'Edit profile';

  @override
  String get appearance => 'Appearance';

  @override
  String get themeSystem => 'System';

  @override
  String get themeLight => 'Light';

  @override
  String get themeDark => 'Dark';

  @override
  String get language => 'Language';

  @override
  String get languageSystem => 'System';

  @override
  String get logout => 'Logout';

  @override
  String get logoutConfirmTitle => 'Log out?';

  @override
  String get logoutConfirmBody => 'You will need to sign in again to see your chats.';

  @override
  String get profileImageUrl => 'Profile image URL';

  @override
  String get profileImageHint => 'Leave empty to use your initials';

  @override
  String get enterValidUrl => 'Enter an http(s) URL';

  @override
  String get urlTooLong => 'URL is too long';

  @override
  String get somethingWentWrongRetry => 'Something went wrong. Please try again.';

  @override
  String get errorInvalidCredentials => 'Incorrect username or password.';

  @override
  String get errorRateLimited => 'Too many attempts. Please wait a moment and try again.';

  @override
  String get errorConflict => 'Username or email is already in use.';

  @override
  String get errorNotFound => 'This item no longer exists.';

  @override
  String get errorForbidden => 'You are not allowed to do this.';

  @override
  String get errorValidation => 'Some details are not valid. Check them and try again.';

  @override
  String get errorSessionExpired => 'Your session has ended. Please sign in again.';

  @override
  String get errorServerUnavailable => 'The server is unavailable right now. Please try again shortly.';

  @override
  String get errorResetCodeInvalid => 'This reset code is invalid or has expired.';

  @override
  String get usernameTaken => 'This username is already taken.';

  @override
  String get emailTaken => 'This email is already registered.';

  @override
  String get fieldInvalid => 'Check this field.';

  @override
  String get reconnecting => 'Reconnecting…';

  @override
  String get connectionLost => 'No connection. Retrying…';

  @override
  String get connected => 'Connected';

  @override
  String get retryNow => 'Retry now';

  @override
  String get rememberMe => 'Keep me signed in';

  @override
  String get newChat => 'New chat';

  @override
  String get passwordInvalid => 'Use 8–72 characters (Arabic letters count as 2)';

  @override
  String get displayNameInvalid => 'Use 1–50 characters';

  @override
  String errorRateLimitedSeconds(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count seconds', one: '1 second');
    return 'Too many attempts. Try again in $_temp0.';
  }

  @override
  String errorRateLimitedMinutes(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count minutes', one: '1 minute');
    return 'Too many attempts. Try again in $_temp0.';
  }
}
