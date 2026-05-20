import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_providers.dart';
import '../../core/auth/firebase_auth_error_mapper.dart';
import '../../core/router/routes.dart';
import '../../core/ui/app_snackbar.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage>
    with SingleTickerProviderStateMixin {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;
  bool _submitting = false;
  bool _googleSubmitting = false;
  String? _emailError;
  String? _passwordError;

  late AnimationController _fadeController;

  @override
  void initState() {
    super.initState();
    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    )..forward();
  }

  @override
  void dispose() {
    _fadeController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    String? emailError;
    String? passwordError;

    if (email.isEmpty) {
      emailError = 'Informe o e-mail';
    } else {
      final validEmail =
          RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email);
      if (!validEmail) emailError = 'E-mail inválido';
    }
    if (password.isEmpty) {
      passwordError = 'Informe a senha';
    }

    setState(() {
      _emailError = emailError;
      _passwordError = passwordError;
    });
    if (emailError != null || passwordError != null) return;

    HapticFeedback.mediumImpact();
    setState(() => _submitting = true);
    try {
      await ref.read(authServiceProvider).signInWithEmailAndPassword(
            email: email,
            password: password,
          );
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, mapFirebaseAuthException(e), isError: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Erro inesperado: $e'.length > 120
            ? 'Erro inesperado. Tente novamente.'
            : 'Erro inesperado: $e',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _signInWithGoogle() async {
    if (_submitting || _googleSubmitting) return;
    HapticFeedback.mediumImpact();
    setState(() => _googleSubmitting = true);
    try {
      final cred = await ref.read(authServiceProvider).signInWithGoogle();
      if (!mounted) return;
      if (cred == null) return;
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, mapFirebaseAuthException(e), isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível entrar com Google. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _googleSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const pageBg = Color(0xFFF4F4F5);
    const fieldBg = Color(0xFFEDEDEF);
    const primary = Color(0xFF6657F6);
    const textMuted = Color(0xFF6E6E73);

    return CupertinoPageScaffold(
      backgroundColor: pageBg,
      child: SafeArea(
        child: FadeTransition(
          opacity: _fadeController,
          child: DefaultTextStyle.merge(
            style: const TextStyle(decoration: TextDecoration.none),
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 10),
                  const _LoginLogoBadge(),
                  const SizedBox(height: 18),
                  const Text(
                    'Bem-vindo de volta',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: CupertinoColors.black,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Viva uma nova experiência no esporte',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontWeight: FontWeight.w400,
                      fontSize: 14,
                      color: textMuted,
                    ),
                  ),
                  const SizedBox(height: 26),
                  _fieldLabel('E-MAIL'),
                  _buildField(
                    controller: _emailController,
                    placeholder: 'seu@email.com',
                    backgroundColor: fieldBg,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                    errorText: _emailError,
                    onChanged: (_) {
                      if (_emailError != null) {
                        setState(() => _emailError = null);
                      }
                    },
                  ),
                  const SizedBox(height: 8),
                  _fieldLabel('SENHA'),
                  _buildField(
                    controller: _passwordController,
                    placeholder: '••••••••',
                    backgroundColor: fieldBg,
                    obscure: _obscurePassword,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.password],
                    onSubmitted: (_) => _submit(),
                    errorText: _passwordError,
                    suffix: _buildEye(
                      isObscured: _obscurePassword,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() => _obscurePassword = !_obscurePassword);
                      },
                    ),
                    onChanged: (_) {
                      if (_passwordError != null) {
                        setState(() => _passwordError = null);
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  Center(
                    child: CupertinoButton(
                      padding: EdgeInsets.zero,
                      minimumSize: Size.zero,
                      onPressed: (_submitting || _googleSubmitting)
                          ? null
                          : () => context.push(AppRoutes.forgotPassword),
                      child: const Text(
                        'Esqueceu a senha?',
                        style: TextStyle(
                          color: primary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: (_submitting || _googleSubmitting) ? null : _submit,
                    child: Container(
                      height: 54,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        gradient: const LinearGradient(
                          colors: [Color(0xFF5F63F6), Color(0xFF7A4EF4)],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF7B61FF).withValues(alpha: 0.35),
                            blurRadius: 16,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      alignment: Alignment.center,
                      child: _submitting
                          ? const CupertinoActivityIndicator(
                              color: CupertinoColors.white,
                            )
                          : const Text(
                              'Entrar',
                              style: TextStyle(
                                color: CupertinoColors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.1,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  const _OrDivider(),
                  const SizedBox(height: 14),
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: (_submitting || _googleSubmitting)
                        ? null
                        : _signInWithGoogle,
                    child: Container(
                      height: 50,
                      decoration: BoxDecoration(
                        color: fieldBg,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      alignment: Alignment.center,
                      child: _googleSubmitting
                          ? const CupertinoActivityIndicator()
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              mainAxisSize: MainAxisSize.min,
                              children: const [
                                _GoogleGlyph(size: 20),
                                SizedBox(width: 10),
                                Text(
                                  'Continuar com Google',
                                  style: TextStyle(
                                    color: CupertinoColors.black,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: (_submitting || _googleSubmitting) ? null : () {},
                    child: Container(
                      height: 50,
                      decoration: BoxDecoration(
                        color: fieldBg,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      alignment: Alignment.center,
                      child: const Text(
                        'Continuar com Apple',
                        style: TextStyle(
                          color: CupertinoColors.black,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text(
                        'Não tem conta? ',
                        style: TextStyle(
                          color: textMuted,
                          fontSize: 14,
                        ),
                      ),
                      GestureDetector(
                        onTap: (_submitting || _googleSubmitting)
                            ? null
                            : () => context.push(AppRoutes.register),
                        child: const Text(
                          'Criar conta',
                          style: TextStyle(
                            color: primary,
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _fieldLabel(String label) {
    return Padding(
      padding: const EdgeInsets.only(left: 2, bottom: 6),
      child: Text(
        label,
        style: const TextStyle(
          color: Color(0xFF636366),
          fontWeight: FontWeight.w400,
          fontSize: 11,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildField({
    required TextEditingController controller,
    required String placeholder,
    required Color backgroundColor,
    TextInputType? keyboardType,
    bool obscure = false,
    Widget? suffix,
    String? errorText,
    List<String>? autofillHints,
    TextInputAction? textInputAction,
    ValueChanged<String>? onSubmitted,
    ValueChanged<String>? onChanged,
  }) {
    final hasError = errorText != null && errorText.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(12),
            border: hasError
                ? Border.all(color: CupertinoColors.systemRed, width: 1)
                : null,
          ),
          child: CupertinoTextField(
            controller: controller,
            keyboardType: keyboardType,
            obscureText: obscure,
            autofillHints: autofillHints,
            textInputAction: textInputAction,
            onSubmitted: onSubmitted,
            onChanged: onChanged,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            placeholder: placeholder,
            placeholderStyle: const TextStyle(
              color: Color(0xFF9B9BA1),
              fontSize: 17,
              fontWeight: FontWeight.w400,
              letterSpacing: -0.1,
            ),
            style: const TextStyle(
              color: CupertinoColors.black,
              fontSize: 17,
              fontWeight: FontWeight.w400,
              letterSpacing: -0.1,
            ),
            decoration: const BoxDecoration(
              color: CupertinoColors.transparent,
            ),
            suffix: suffix == null
                ? null
                : Padding(
                    padding: const EdgeInsets.only(right: 10),
                    child: suffix,
                  ),
          ),
        ),
        if (hasError) ...[
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              errorText,
              style: const TextStyle(
                fontWeight: FontWeight.w400,
                color: CupertinoColors.systemRed,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildEye({
    required bool isObscured,
    required VoidCallback onTap,
  }) {
    return CupertinoButton(
      padding: EdgeInsets.zero,
      minimumSize: const Size(28, 28),
      onPressed: onTap,
      child: Icon(
        isObscured ? CupertinoIcons.eye : CupertinoIcons.eye_slash,
        size: 18,
        color: const Color(0xFF7D7D83),
      ),
    );
  }
}

class _GoogleGlyph extends StatelessWidget {
  const _GoogleGlyph({this.size = 20});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: const Color(0xFFE0E0E0)),
      ),
      child: Text(
        'G',
        style: TextStyle(
          color: const Color(0xFF4285F4),
          fontSize: size * 0.65,
          fontWeight: FontWeight.w800,
          height: 1,
        ),
      ),
    );
  }
}

class _LoginLogoBadge extends StatelessWidget {
  const _LoginLogoBadge();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            colors: [Color(0xFF5F63F6), Color(0xFF7A4EF4)],
          ),
        ),
        alignment: Alignment.center,
        child: const Icon(
          CupertinoIcons.sportscourt_fill,
          size: 30,
          color: CupertinoColors.white,
        ),
      ),
    );
  }
}

class _OrDivider extends StatelessWidget {
  const _OrDivider();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Container(height: 1, color: const Color(0xFFD6D6DB)),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 8),
          child: Text(
            'OU',
            style: TextStyle(
              fontSize: 16,
              color: Color(0xFF8A8A8F),
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        Expanded(
          child: Container(height: 1, color: const Color(0xFFD6D6DB)),
        ),
      ],
    );
  }
}
