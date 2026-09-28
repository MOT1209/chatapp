import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../state/session_controller.dart';
import '../widgets/state_views.dart';
import 'auth_layout.dart';

/// Client-side rules mirror contract §3.1 so most mistakes never reach the server.
class RegisterValidators {
  static final _username = RegExp(r'^[a-z0-9_.]{3,30}$');
  static final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  static String? username(String? v) {
    final value = v?.trim().toLowerCase() ?? '';
    if (value.isEmpty) return 'Choose a username';
    if (!_username.hasMatch(value)) {
      return '3–30 characters: letters, numbers, _ or .';
    }
    return null;
  }

  static String? displayName(String? v) {
    final value = v?.trim() ?? '';
    if (value.isEmpty) return 'Enter your display name';
    if (value.length > 50) return 'At most 50 characters';
    return null;
  }

  static String? email(String? v) {
    final value = v?.trim() ?? '';
    if (value.isEmpty) return 'Enter your email';
    if (!_email.hasMatch(value)) return 'Enter a valid email address';
    return null;
  }

  static String? password(String? v) {
    final value = v ?? '';
    if (value.length < 8) return 'At least 8 characters';
    if (value.length > 72) return 'At most 72 characters';
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
        _error = e.message;
        _fieldErrors = e.fields;
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
    return AuthLayout(
      title: 'Create your account',
      subtitle: 'It only takes a minute',
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
                label: 'Username',
                icon: Icons.alternate_email,
                validator: RegisterValidators.username,
                autofill: const [AutofillHints.newUsername],
              ),
              _field(
                key: 'displayName',
                controller: _displayName,
                label: 'Display name',
                icon: Icons.badge_outlined,
                validator: RegisterValidators.displayName,
                autofill: const [AutofillHints.name],
              ),
              _field(
                key: 'email',
                controller: _email,
                label: 'Email',
                icon: Icons.email_outlined,
                validator: RegisterValidators.email,
                autofill: const [AutofillHints.email],
                keyboard: TextInputType.emailAddress,
              ),
              _field(
                key: 'password',
                controller: _password,
                label: 'Password',
                icon: Icons.lock_outline,
                validator: RegisterValidators.password,
                autofill: const [AutofillHints.newPassword],
                obscure: true,
              ),
              _field(
                key: 'confirmPassword',
                controller: _confirm,
                label: 'Confirm password',
                icon: Icons.lock_outline,
                validator: (v) => v != _password.text ? 'Passwords do not match' : null,
                obscure: true,
                last: true,
              ),
              const SizedBox(height: 8),
              SubmitButton(label: 'Register', loading: _loading, onPressed: _submit),
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  const Text('Already have an account?'),
                  TextButton(
                    onPressed: _loading ? null : () => Navigator.of(context).pop(),
                    child: const Text('Login'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
