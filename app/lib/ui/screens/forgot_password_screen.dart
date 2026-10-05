import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/chat_api.dart';
import '../l10n.dart';
import '../components/state_views.dart';
import 'auth_layout.dart';
import 'register_screen.dart';

/// Contract §3.1: request a reset code, then set a new password with it.
/// The request step always shows the same confirmation, so it can't reveal
/// which emails have accounts.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _requestForm = GlobalKey<FormState>();
  final _resetForm = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _loading = false;
  bool _codeStep = false;
  bool _requested = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  @override
  void dispose() {
    for (final c in [_email, _code, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _run(GlobalKey<FormState> form, Future<void> Function(ChatApi api) action) async {
    setState(() {
      _error = null;
      _fieldErrors = const {};
    });
    if (!form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await action(context.read<ChatApi>());
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

  Future<void> _requestCode() => _run(_requestForm, (api) async {
    await api.forgotPassword(_email.text.trim().toLowerCase());
    if (mounted) setState(() => _requested = true);
  });

  Future<void> _reset() => _run(_resetForm, (api) async {
    await api.resetPassword(token: _code.text.trim(), newPassword: _password.text);
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final done = context.l10n.passwordResetDone;
    Navigator.of(context).pop();
    messenger.showSnackBar(SnackBar(content: Text(done)));
  });

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final v = RegisterValidators(l);
    return AuthLayout(
      title: l.resetPasswordTitle,
      subtitle: l.resetPasswordSubtitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[ErrorBanner(message: _error!), const SizedBox(height: 16)],
          if (!_codeStep) ...[
            if (_requested) ...[
              ErrorBanner(message: l.resetCodeSent, kind: ErrorBannerKind.success),
              const SizedBox(height: 16),
            ],
            Form(
              key: _requestForm,
              child: TextFormField(
                key: const Key('forgot.email'),
                controller: _email,
                enabled: !_loading,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: InputDecoration(
                  labelText: l.email,
                  prefixIcon: const Icon(Icons.email_outlined),
                  errorText: _fieldErrors['email'],
                ),
                onFieldSubmitted: (_) => _requestCode(),
                validator: v.email,
              ),
            ),
            const SizedBox(height: 24),
            SubmitButton(label: l.sendResetCode, loading: _loading, onPressed: _requestCode),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _loading ? null : () => setState(() => _codeStep = true),
              child: Text(l.haveResetCode),
            ),
          ] else
            Form(
              key: _resetForm,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextFormField(
                    key: const Key('reset.code'),
                    controller: _code,
                    enabled: !_loading,
                    decoration: InputDecoration(
                      labelText: l.resetCode,
                      prefixIcon: const Icon(Icons.key_outlined),
                      errorText: _fieldErrors['token'],
                    ),
                    validator: (value) => (value == null || value.trim().isEmpty) ? l.enterResetCode : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    key: const Key('reset.password'),
                    controller: _password,
                    enabled: !_loading,
                    obscureText: true,
                    autofillHints: const [AutofillHints.newPassword],
                    decoration: InputDecoration(
                      labelText: l.newPassword,
                      prefixIcon: const Icon(Icons.lock_outline),
                      errorText: _fieldErrors['newPassword'],
                    ),
                    validator: v.password,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    key: const Key('reset.confirm'),
                    controller: _confirm,
                    enabled: !_loading,
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: l.confirmPassword,
                      prefixIcon: const Icon(Icons.lock_outline),
                    ),
                    onFieldSubmitted: (_) => _reset(),
                    validator: (value) => value != _password.text ? l.passwordsDontMatch : null,
                  ),
                  const SizedBox(height: 24),
                  SubmitButton(label: l.setNewPassword, loading: _loading, onPressed: _reset),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
