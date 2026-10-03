import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../state/session_controller.dart';
import '../../state/settings_controller.dart';
import '../l10n.dart';
import '../widgets/state_views.dart';
import 'auth_layout.dart';
import 'forgot_password_screen.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _fieldErrors = const {};
    });
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await context.read<SessionController>().login(_identifier.text.trim(), _password.text);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorMessage(context.l10n, e);
        _fieldErrors = fieldErrors(context.l10n, e);
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _push(Widget screen) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AuthLayout(
      title: l.welcomeBack,
      subtitle: l.signInSubtitle,
      child: Form(
        key: _formKey,
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[ErrorBanner(message: _error!), const SizedBox(height: 16)],
              TextFormField(
                key: const Key('login.identifier'),
                controller: _identifier,
                decoration: InputDecoration(
                  labelText: l.emailOrUsername,
                  prefixIcon: const Icon(Icons.person_outline),
                  errorText: _fieldErrors['identifier'],
                ),
                autofillHints: const [AutofillHints.username, AutofillHints.email],
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                enabled: !_loading,
                validator: (v) => (v == null || v.trim().isEmpty) ? l.enterEmailOrUsername : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                key: const Key('login.password'),
                controller: _password,
                obscureText: _obscure,
                decoration: InputDecoration(
                  labelText: l.password,
                  prefixIcon: const Icon(Icons.lock_outline),
                  errorText: _fieldErrors['password'],
                  suffixIcon: IconButton(
                    tooltip: _obscure ? l.showPassword : l.hidePassword,
                    icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                autofillHints: const [AutofillHints.password],
                textInputAction: TextInputAction.done,
                enabled: !_loading,
                onFieldSubmitted: (_) => _submit(),
                validator: (v) => (v == null || v.isEmpty) ? l.enterPassword : null,
              ),
              const SizedBox(height: 8),
              // Wraps on narrow phones and long translations instead of overflowing.
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _RememberMe(enabled: !_loading),
                  TextButton(
                    onPressed: _loading ? null : () => _push(const ForgotPasswordScreen()),
                    child: Text(l.forgotPassword),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              SubmitButton(label: l.login, loading: _loading, onPressed: _submit),
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(l.noAccount),
                  TextButton(onPressed: _loading ? null : () => _push(const RegisterScreen()), child: Text(l.register)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Keep me signed in". Off keeps the session in memory only, for shared devices.
class _RememberMe extends StatelessWidget {
  const _RememberMe({required this.enabled});
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<SettingsController>();
    void toggle() => settings.setRememberSession(!settings.rememberSession);
    return MergeSemantics(
      child: InkWell(
        key: const Key('login.remember'),
        borderRadius: BorderRadius.circular(8),
        onTap: enabled ? toggle : null,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Checkbox(value: settings.rememberSession, onChanged: enabled ? (_) => toggle() : null),
            Flexible(child: Text(context.l10n.rememberMe)),
            const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }
}
