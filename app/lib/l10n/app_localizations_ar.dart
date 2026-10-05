// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appTitle => 'تطبيق الدردشة';

  @override
  String get tryAgain => 'حاول مرة أخرى';

  @override
  String get retry => 'إعادة المحاولة';

  @override
  String get cancel => 'إلغاء';

  @override
  String get save => 'حفظ';

  @override
  String get delete => 'حذف';

  @override
  String get somethingWentWrong => 'حدث خطأ ما';

  @override
  String get networkError => 'تعذّر الوصول إلى الخادم. تحقّق من اتصالك.';

  @override
  String get loading => 'جارٍ التحميل';

  @override
  String get checkingSession => 'جارٍ التحقق من جلستك';

  @override
  String get welcomeBack => 'مرحبًا بعودتك';

  @override
  String get signInSubtitle => 'سجّل الدخول للمتابعة إلى تطبيق الدردشة';

  @override
  String get emailOrUsername => 'البريد الإلكتروني أو اسم المستخدم';

  @override
  String get enterEmailOrUsername => 'أدخل بريدك الإلكتروني أو اسم المستخدم';

  @override
  String get password => 'كلمة المرور';

  @override
  String get enterPassword => 'أدخل كلمة المرور';

  @override
  String get showPassword => 'إظهار كلمة المرور';

  @override
  String get hidePassword => 'إخفاء كلمة المرور';

  @override
  String get login => 'تسجيل الدخول';

  @override
  String get noAccount => 'ليس لديك حساب؟';

  @override
  String get register => 'إنشاء حساب';

  @override
  String get forgotPassword => 'نسيت كلمة المرور؟';

  @override
  String get createAccount => 'أنشئ حسابك';

  @override
  String get createAccountSubtitle => 'لن يستغرق الأمر سوى دقيقة';

  @override
  String get username => 'اسم المستخدم';

  @override
  String get displayName => 'الاسم الظاهر';

  @override
  String get email => 'البريد الإلكتروني';

  @override
  String get confirmPassword => 'تأكيد كلمة المرور';

  @override
  String get usernameRequired => 'اختر اسم مستخدم';

  @override
  String get usernameInvalid => 'من 3 إلى 30 حرفًا: أحرف إنجليزية أو أرقام أو _ أو .';

  @override
  String get displayNameRequired => 'أدخل اسمك الظاهر';

  @override
  String get atMost50 => '50 حرفًا كحد أقصى';

  @override
  String get emailRequired => 'أدخل بريدك الإلكتروني';

  @override
  String get emailInvalid => 'أدخل بريدًا إلكترونيًا صحيحًا';

  @override
  String get passwordTooShort => '8 أحرف على الأقل';

  @override
  String get passwordTooLong => 'طويلة جدًا: 72 بايت كحد أقصى (الحرف العربي يُحسب 2)';

  @override
  String get passwordsDontMatch => 'كلمتا المرور غير متطابقتين';

  @override
  String get haveAccount => 'لديك حساب بالفعل؟';

  @override
  String get resetPasswordTitle => 'إعادة تعيين كلمة المرور';

  @override
  String get resetPasswordSubtitle => 'أدخل البريد الإلكتروني لحسابك وسنرسل لك رمز إعادة التعيين.';

  @override
  String get sendResetCode => 'إرسال الرمز';

  @override
  String get resetCodeSent => 'إذا كان هناك حساب بهذا البريد، فسيصلك رمز إعادة التعيين قريبًا.';

  @override
  String get haveResetCode => 'لديّ رمز إعادة التعيين';

  @override
  String get resetCode => 'رمز إعادة التعيين';

  @override
  String get enterResetCode => 'أدخل الرمز الذي وصلك';

  @override
  String get newPassword => 'كلمة المرور الجديدة';

  @override
  String get setNewPassword => 'تعيين كلمة المرور';

  @override
  String get passwordResetDone => 'تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.';

  @override
  String get chats => 'المحادثات';

  @override
  String get profile => 'الملف الشخصي';

  @override
  String get search => 'بحث';

  @override
  String get clearSearch => 'مسح البحث';

  @override
  String get loadingConversations => 'جارٍ تحميل المحادثات';

  @override
  String get noConversations => 'لا توجد محادثات بعد';

  @override
  String get noMatchingChats => 'لا توجد محادثات مطابقة';

  @override
  String get searchPeopleHint => 'ابحث عن الأشخاص بالاسم أو اسم المستخدم لبدء الدردشة.';

  @override
  String get peopleSection => 'الأشخاص';

  @override
  String get searching => 'جارٍ البحث';

  @override
  String get noPeopleFound => 'لم يُعثر على أحد';

  @override
  String get noPeopleFoundHint => 'جرّب اسمًا أو معرّفًا آخر، بحرفين على الأقل.';

  @override
  String get startNewChatTitle => 'ابحث عن شخص للتحدث معه';

  @override
  String get contacts => 'جهات الاتصال';

  @override
  String get settings => 'الإعدادات';

  @override
  String get unreadMessages => 'رسائل غير مقروءة';

  @override
  String get scrollToNewest => 'انتقل إلى الأحدث';

  @override
  String get dismiss => 'إخفاء';

  @override
  String typingNamed(String name) {
    return '$name يكتب الآن…';
  }

  @override
  String youPrefix(String text) {
    return 'أنت: $text';
  }

  @override
  String get noMessagesYet => 'لا توجد رسائل بعد';

  @override
  String unreadCount(int count) {
    return '$count غير مقروءة';
  }

  @override
  String get connecting => 'جارٍ الاتصال…';

  @override
  String get offline => 'غير متصل';

  @override
  String get selectConversation => 'اختر محادثة';

  @override
  String get selectConversationHint => 'اختر محادثة من القائمة، أو ابحث عن شخص لبدء محادثة جديدة.';

  @override
  String get back => 'رجوع';

  @override
  String get online => 'متصل الآن';

  @override
  String lastSeenAt(String time) {
    return 'آخر ظهور الساعة $time';
  }

  @override
  String lastSeenOn(String date) {
    return 'آخر ظهور $date';
  }

  @override
  String get typing => 'يكتب…';

  @override
  String get loadingMessages => 'جارٍ تحميل الرسائل';

  @override
  String sayHello(String name) {
    return 'قل مرحبًا لـ $name 👋';
  }

  @override
  String get today => 'اليوم';

  @override
  String get yesterday => 'أمس';

  @override
  String get notSentRetry => 'لم تُرسل. اضغط لإعادة المحاولة';

  @override
  String get writeMessage => 'اكتب رسالة...';

  @override
  String get send => 'إرسال';

  @override
  String get deleteMessage => 'حذف الرسالة';

  @override
  String get deleteMessageConfirm => 'حذف هذه الرسالة لدى الجميع؟';

  @override
  String get messageDeleted => 'تم حذف هذه الرسالة';

  @override
  String get you => 'أنت';

  @override
  String get statusSending => 'جارٍ الإرسال';

  @override
  String get statusSent => 'أُرسلت';

  @override
  String get statusRead => 'مقروءة';

  @override
  String get statusFailed => 'فشل الإرسال';

  @override
  String get editProfile => 'تعديل الملف الشخصي';

  @override
  String get appearance => 'المظهر';

  @override
  String get themeSystem => 'النظام';

  @override
  String get themeLight => 'فاتح';

  @override
  String get themeDark => 'داكن';

  @override
  String get languageSystemHint => 'يُطبَّق على التطبيق بالكامل فورًا.';

  @override
  String get profileUnavailable => 'الملف الشخصي غير متاح';

  @override
  String get privacy => 'الخصوصية';

  @override
  String get keepMeSignedIn => 'إبقائي مسجّلة الدخول';

  @override
  String get keepMeSignedInHint => 'يحفظ جلستك على هذا الجهاز لتتخطّى شاشة الدخول في المرة القادمة.';

  @override
  String get account => 'الحساب';

  @override
  String get usernameIsPermanent => 'لا يمكن تغيير اسم المستخدم.';

  @override
  String get about => 'حول التطبيق';

  @override
  String get appVersion => 'إصدار التطبيق';

  @override
  String get language => 'اللغة';

  @override
  String get languageSystem => 'النظام';

  @override
  String get logout => 'تسجيل الخروج';

  @override
  String get logoutConfirmTitle => 'تسجيل الخروج؟';

  @override
  String get logoutConfirmBody => 'ستحتاج إلى تسجيل الدخول مجددًا لرؤية محادثاتك.';

  @override
  String get profileImageUrl => 'رابط صورة الملف الشخصي';

  @override
  String get profileImageHint => 'اتركه فارغًا لاستخدام الأحرف الأولى من اسمك';

  @override
  String get enterValidUrl => 'أدخل رابطًا يبدأ بـ http(s)';

  @override
  String get urlTooLong => 'الرابط طويل جدًا';

  @override
  String get somethingWentWrongRetry => 'حدث خطأ ما. حاول مرة أخرى.';

  @override
  String get errorInvalidCredentials => 'اسم المستخدم أو كلمة المرور غير صحيحة.';

  @override
  String get errorRateLimited => 'محاولات كثيرة جدًا. انتظر قليلًا ثم حاول مرة أخرى.';

  @override
  String get errorConflict => 'اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل.';

  @override
  String get errorNotFound => 'هذا العنصر لم يعد موجودًا.';

  @override
  String get errorForbidden => 'غير مسموح لك بهذا الإجراء.';

  @override
  String get errorValidation => 'بعض البيانات غير صالحة. راجعها وحاول مرة أخرى.';

  @override
  String get errorSessionExpired => 'انتهت جلستك. سجّل الدخول مرة أخرى.';

  @override
  String get errorServerUnavailable => 'الخادم غير متاح حاليًا. حاول بعد قليل.';

  @override
  String get errorResetCodeInvalid => 'رمز الاستعادة غير صالح أو منتهي الصلاحية.';

  @override
  String get usernameTaken => 'اسم المستخدم هذا محجوز بالفعل.';

  @override
  String get emailTaken => 'هذا البريد الإلكتروني مسجّل بالفعل.';

  @override
  String get fieldInvalid => 'راجع هذا الحقل.';

  @override
  String get reconnecting => 'جارٍ إعادة الاتصال…';

  @override
  String get connectionLost => 'لا يوجد اتصال. جارٍ إعادة المحاولة…';

  @override
  String get connected => 'تم الاتصال';

  @override
  String get retryNow => 'أعد المحاولة الآن';

  @override
  String get rememberMe => 'إبقائي مسجّلًا الدخول';

  @override
  String get newChat => 'محادثة جديدة';

  @override
  String get passwordInvalid => 'استخدم 8 إلى 72 حرفًا (الحرف العربي يُحسب 2)';

  @override
  String get displayNameInvalid => 'استخدم من 1 إلى 50 حرفًا';

  @override
  String errorRateLimitedSeconds(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ثانية',
      few: '$count ثوانٍ',
      two: 'ثانيتين',
      one: 'ثانية واحدة',
    );
    return 'محاولات كثيرة جدًا. حاول مرة أخرى بعد $_temp0.';
  }

  @override
  String errorRateLimitedMinutes(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count دقيقة',
      few: '$count دقائق',
      two: 'دقيقتين',
      one: 'دقيقة واحدة',
    );
    return 'محاولات كثيرة جدًا. حاول مرة أخرى بعد $_temp0.';
  }
}
