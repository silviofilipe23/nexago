import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_providers.dart';
import '../../core/auth/firebase_auth_error_mapper.dart';
import '../../core/observability/analytics_service.dart';
import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../core/ui/app_snackbar.dart';
import '../../core/ui/fade_slide_in.dart';
import 'widgets/auth_form_widgets.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;
  bool _submitting = false;
  bool _googleSubmitting = false;
  String? _emailError;
  String? _passwordError;

  @override
  void dispose() {
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
      ref.read(analyticsServiceProvider).logLogin('password');
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      final classified = classifyFirebaseAuthError(e);
      switch (classified.field) {
        case AuthErrorField.email:
          setState(() => _emailError = classified.message);
        case AuthErrorField.password:
          setState(() => _passwordError = classified.message);
        case AuthErrorField.form:
          showAppSnackBar(context, classified.message, isError: true);
      }
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
      ref.read(analyticsServiceProvider).logLogin('google');
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
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final busy = _submitting || _googleSubmitting;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            top: -80,
            left: 0,
            right: 0,
            height: 360,
            child: const AuthCanvasGlow(),
          ),
          SafeArea(
            top: false,
            child: GestureDetector(
              onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
              behavior: HitTestBehavior.translucent,
              child: FadeSlideIn(
                child: Center(
                  child: SingleChildScrollView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: EdgeInsets.fromLTRB(
                      24,
                      MediaQuery.paddingOf(context).top + 20,
                      24,
                      20,
                    ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const AuthLogo(showTagline: true),
                        SizedBox(height: 28),
                        Text(
                          'Bem-vindo de volta.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.headlineMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                            letterSpacing: -0.5,
                            height: 1.15,
                          ),
                        ),
                        SizedBox(height: 10),
                        Text(
                          'Entra pra continuar de onde parou na quadra.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            height: 1.45,
                          ),
                        ),
                        SizedBox(height: 32),
                        const AuthFieldLabel(label: 'E-MAIL'),
                        AuthTextField(
                          controller: _emailController,
                          hintText: 'seu@email.com',
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.email],
                          errorText: _emailError,
                          borderless: true,
                          onChanged: (_) {
                            if (_emailError != null) {
                              setState(() => _emailError = null);
                            }
                          },
                        ),
                        SizedBox(height: 14),
                        const AuthFieldLabel(label: 'SENHA'),
                        AuthTextField(
                          controller: _passwordController,
                          hintText: '••••••••',
                          obscureText: _obscurePassword,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.password],
                          errorText: _passwordError,
                          borderless: true,
                          onSubmitted: (_) => _submit(),
                          onChanged: (_) {
                            if (_passwordError != null) {
                              setState(() => _passwordError = null);
                            }
                          },
                          suffixIcon: authPasswordVisibilityIcon(
                            obscured: _obscurePassword,
                            onToggle: () {
                              HapticFeedback.selectionClick();
                              setState(
                                () => _obscurePassword = !_obscurePassword,
                              );
                            },
                          ),
                        ),
                        SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerRight,
                          child: AuthLinkButton(
                            label: 'Esqueceu a senha?',
                            onPressed: busy
                                ? null
                                : () => context.push(AppRoutes.forgotPassword),
                          ),
                        ),
                        SizedBox(height: 20),
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: FilledButton(
                            onPressed: busy ? null : _submit,
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.brand,
                              foregroundColor: AppColors.black,
                              disabledBackgroundColor:
                                  AppColors.brand.withValues(alpha: 0.35),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: _submitting
                                ? SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: AppColors.black,
                                    ),
                                  )
                                : Text(
                                    'Entrar',
                                    style:
                                        theme.textTheme.titleMedium?.copyWith(
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.black,
                                    ),
                                  ),
                          ),
                        ),
                        SizedBox(height: 24),
                        AuthOrDivider(color: scheme.outline),
                        SizedBox(height: 24),
                        AuthSocialButton(
                          onPressed: busy ? null : _signInWithGoogle,
                          loading: _googleSubmitting,
                          icon: const AuthGoogleGlyph(),
                          label: 'Continuar com Google',
                        ),
                        SizedBox(height: 28),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Novo por aqui? ',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                              ),
                            ),
                            AuthLinkButton(
                              label: 'Criar conta',
                              onPressed: busy
                                  ? null
                                  : () => context.go(AppRoutes.register),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          ),
        ],
      ),
    );
  }
}
