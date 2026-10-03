import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../state/session_controller.dart';
import '../l10n.dart';
import '../widgets/state_views.dart';
import 'auth_layout.dart';

/// Client-side rules mirror contract §3.1 so most mistakes never reach the server.
class RegisterValidators {
  const RegisterValidators(this.l);
  final AppLocalizations l;

  static final _username = RegExp(r'^[a-z0-9_.]{3,30}$');
  static final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  String? username(String? v) {
    final value = v?.trim().toLowerCase() ?? '';
    if (value.isEmpty) return l.usernameRequired;
    if (!_username.hasMatch(value)) return l.usernameInvalid;
    return null;
  }

  String? displayName(String? v) {
    final value = v?.trim() ?? '';
    if (value.isEmpty) return l.displayNameRequired;
    if (value.length > 50) return l.atMost50;
    return null;
  }

  String? email(String? v) {
    final value = v?.trim() ?? '';
    if (value.isEmpty) return l.emailRequired;
    if (!_email.hasMatch(value)) return l.emailInvalid;
    return null;
  }

  String? password(String? v) {
    final value = v ?? '';
    if (value.length < 8) return l.passwordTooShort;
    // The server limit is 72 UTF-8 bytes (bcrypt), not characters: Arabic letters take 2.
    if (utf8.encode(value).length > 72) return l.passwordTooLong;
    return null;
  }
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _displayName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _loading = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  @override
  void dispose() {
    for (final c in [_username, _displayName, _email, _password, _confirm]) {
      c.dispose();
    }
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
      await context.read<SessionController>().register(
        username: _username.text.trim().toLowerCase(),
        email: _email.text.trim().toLowerCase(),
        password: _password.text,
        displayName: _displayName.text.trim(),
      );
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

  Widget _field({
    required String key,
    required TextEditingController controller,
    required String label,
    required IconData icon,
    required String? Function(String?) validator,
    List<String>? autofill,
    TextInputType? keyboard,
    bool obscure = false,
    bool last = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: TextFormField(
      key: Key('register.$key'),
      controller: controller,
      obscureText: obscure,
      enabled: !_loading,
      keyboardType: keyboard,
      autofillHints: autofill,
      textInputAction: last ? TextInputAction.done : TextInputAction.next,
      onFieldSubmitted: last ? (_) => _submit() : null,
      decoration: InputDecoration(labelText: label, prefixIcon: Icon(icon), errorText: _fieldErrors[key]),
      validator: validator,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final v = RegisterValidators(l);
    return AuthLayout(
      title: l.createAccount,
      subtitle: l.createAccountSubtitle,
      child: Form(
        key: _formKey,
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[ErrorBanner(message: _error!), const SizedBox(height: 16)],
              _field(
                key: 'username',
                controller: _username,
                label: l.username,
                icon: Icons.alternate_email,
                validator: v.username,
                autofill: const [AutofillHints.newUsername],
              ),
              _field(
                key: 'displayName',
                controller: _displayName,
                label: l.displayName,
                icon: Icons.badge_outlined,
                validator: v.displayName,
                autofill: const [AutofillHints.name],
              ),
              _field(
                key: 'email',
                controller: _email,
                label: l.email,
                icon: Icons.email_outlined,
                validator: v.email,
                autofill: const [AutofillHints.email],
                keyboard: TextInputType.emailAddress,
              ),
              _field(
                key: 'password',
                controller: _password,
                label: l.password,
                icon: Icons.lock_outline,
                validator: v.password,
                autofill: const [AutofillHints.newPassword],
                obscure: true,
              ),
              _field(
                key: 'confirmPassword',
                controller: _confirm,
                label: l.confirmPassword,
                icon: Icons.lock_outline,
                validator: (value) => value != _password.text ? l.passwordsDontMatch : null,
                obscure: true,
                last: true,
              ),
              const SizedBox(height: 8),
              SubmitButton(label: l.register, loading: _loading, onPressed: _submit),
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(l.haveAccount),
                  TextButton(onPressed: _loading ? null : () => Navigator.of(context).pop(), child: Text(l.login)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
