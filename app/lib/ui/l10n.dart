import 'package:flutter/widgets.dart';

import '../core/api_exception.dart';
import '../l10n/app_localizations.dart';

export '../l10n/app_localizations.dart';

extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}

/// Client-side failures are localized. Server messages are shown verbatim (contract §1.1).
String errorMessage(AppLocalizations l, ApiException e) => e.isNetwork ? l.networkError : e.message;
