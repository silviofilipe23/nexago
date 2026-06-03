import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth/auth_providers.dart';
import '../../features/athlete/onboarding/domain/athlete_onboarding_providers.dart';
import '../../core/auth/firebase_auth_error_mapper.dart';
import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../core/ui/app_snackbar.dart';
import '../../core/ui/fade_slide_in.dart';
import 'auth_legal_urls.dart';
import 'domain/auth_password_strength.dart';
import 'widgets/auth_form_widgets.dart';

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _passwordFocusNode = FocusNode();

  bool _obscurePassword = true;
  bool _obscureConfirm = true;
  bool _submitting = false;
  bool _googleSubmitting = false;
  bool _termsAccepted = false;
  bool _passwordFocused = false;
  bool _pendingSuccess = false;

  bool _isSuccessPhase(BuildContext context) =>
      _pendingSuccess ||
      GoRouterState.of(context).uri.queryParameters['step'] == 'success';

  void _goToSuccessScreen() {
    context.go(
      Uri(
        path: AppRoutes.register,
        queryParameters: const {'step': 'success'},
      ).toString(),
    );
  }

  String? _emailError;
  String? _passwordError;
  String? _confirmPasswordError;

  @override
  void initState() {
    super.initState();
    _passwordFocusNode.addListener(_onPasswordFocusChange);
    _passwordController.addListener(_onPasswordFieldsChanged);
    _confirmPasswordController.addListener(_onPasswordFieldsChanged);
  }

  void _onPasswordFocusChange() {
    setState(() => _passwordFocused = _passwordFocusNode.hasFocus);
  }

  void _onPasswordFieldsChanged() {
    if (_confirmPasswordController.text.isNotEmpty) {
      _syncConfirmError();
    }
    if (mounted) setState(() {});
  }

  void _syncConfirmError() {
    final confirm = _confirmPasswordController.text;
    final password = _passwordController.text;
    if (confirm.isEmpty) {
      _confirmPasswordError = null;
    } else if (confirm != password) {
      _confirmPasswordError = 'Senhas ainda não conferem.';
    } else {
      _confirmPasswordError = null;
    }
  }

  @override
  void dispose() {
    _passwordFocusNode.removeListener(_onPasswordFocusChange);
    _passwordFocusNode.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  bool get _busy => _submitting || _googleSubmitting;

  PasswordStrengthResult get _passwordStrength =>
      evaluatePasswordStrength(_passwordController.text);

  Future<void> _openLegalUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!mounted) return;
    if (!ok) {
      showAppSnackBar(
        context,
        'Não foi possível abrir o link.',
        isError: true,
      );
    }
  }

  void _goBack() {
    if (_isSuccessPhase(context)) {
      _signOutAndGoLogin();
      return;
    }
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.login);
    }
  }

  Future<void> _signOutAndGoLogin() async {
    setState(() => _submitting = true);
    try {
      await ref.read(authServiceProvider).signOut();
      if (!mounted) return;
      context.go(AppRoutes.login);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível sair. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    final confirm = _confirmPasswordController.text;
    final strength = _passwordStrength;

    String? emailError;
    String? passwordError;
    String? confirmPasswordError;

    if (email.isEmpty) {
      emailError = 'Informe o e-mail';
    } else if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      emailError = 'E-mail inválido';
    }

    if (password.isEmpty) {
      passwordError = 'Informe a senha';
    } else if (!strength.isStrongEnough) {
      passwordError = 'A senha não atende todos os requisitos';
    }

    if (confirm.isEmpty) {
      confirmPasswordError = 'Confirme a senha';
    } else if (confirm != password) {
      confirmPasswordError = 'Senhas ainda não conferem.';
    }

    if (!_termsAccepted) {
      showAppSnackBar(
        context,
        'Aceite os termos para continuar.',
        isError: true,
      );
    }

    setState(() {
      _emailError = emailError;
      _passwordError = passwordError;
      _confirmPasswordError = confirmPasswordError;
    });

    if (emailError != null ||
        passwordError != null ||
        confirmPasswordError != null ||
        !_termsAccepted) {
      return;
    }

    HapticFeedback.mediumImpact();
    setState(() {
      _submitting = true;
      _pendingSuccess = false;
    });

    try {
      await ref.read(authServiceProvider).registerWithEmailAndPassword(
            email: email,
            password: password,
          );
      await ref.read(authServiceProvider).sendEmailVerification();
      if (!mounted) return;
      setState(() => _pendingSuccess = true);
      _goToSuccessScreen();
    } on FirebaseAuthException catch (e) {
      if (mounted) setState(() => _pendingSuccess = false);
      if (!mounted) return;
      showAppSnackBar(context, mapFirebaseAuthException(e), isError: true);
    } catch (_) {
      if (mounted) setState(() => _pendingSuccess = false);
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Erro inesperado. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _signInWithGoogle() async {
    if (_busy) return;
    HapticFeedback.mediumImpact();
    setState(() => _googleSubmitting = true);
    try {
      final cred = await ref.read(authServiceProvider).signInWithGoogle();
      if (!mounted) return;
      if (cred == null) return;
      context.go(AppRoutes.discover);
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

  void _completeProfile() {
    ref.read(athleteOnboardingDraftProvider.notifier).reset();
    context.go(AppRoutes.athleteOnboardingWelcome);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final strength = _passwordStrength;
    final showStrength = _passwordController.text.isNotEmpty;
    final confirmMismatch = _confirmPasswordError != null;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Stack(
          children: [
            const AuthCanvasGlow(),
            FadeSlideIn(
              child: _isSuccessPhase(context)
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
                          child: Center(
                            child: ConstrainedBox(
                              constraints:
                                  const BoxConstraints(maxWidth: 420),
                              child: Row(
                                children: [
                                  AuthBackButton(
                                    onPressed: _busy ? null : _goBack,
                                  ),
                                  Spacer(),
                                  const AuthStepBadge(
                                    current: 1,
                                    total: 5,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: Center(
                            child: SingleChildScrollView(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 24,
                                vertical: 12,
                              ),
                              child: Center(
                                child: ConstrainedBox(
                                  constraints:
                                      const BoxConstraints(maxWidth: 420),
                                  child: const AuthRegisterSuccessHero(),
                                ),
                              ),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
                          child: Center(
                            child: ConstrainedBox(
                              constraints:
                                  const BoxConstraints(maxWidth: 420),
                              child: AuthContinueButton(
                                label: 'Completar perfil de atleta',
                                loading: _submitting,
                                onPressed:
                                    _busy ? null : _completeProfile,
                              ),
                            ),
                          ),
                        ),
                      ],
                    )
                  : Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 12,
                        ),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 420),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  AuthBackButton(
                                    onPressed: _busy ? null : _goBack,
                                  ),
                                  Spacer(),
                                  const AuthStepBadge(current: 1, total: 5),
                                ],
                              ),
                              _buildCredentialsForm(
                                theme,
                                scheme,
                                strength,
                                showStrength,
                                confirmMismatch,
                              ),
                              SizedBox(height: 24),
                              _buildBottomActions(theme, scheme),
                            ],
                          ),
                        ),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCredentialsForm(
    ThemeData theme,
    ColorScheme scheme,
    PasswordStrengthResult strength,
    bool showStrength,
    bool confirmMismatch,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AuthLogo(),
        SizedBox(height: 12),
        const AuthKicker(label: 'NOVA CONTA • ATLETA'),
        SizedBox(height: 24),
        Text(
          'Criar conta.',
          textAlign: TextAlign.center,
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            letterSpacing: -0.5,
            height: 1.12,
          ),
        ),
        SizedBox(height: 10),
        Text(
          'Faça parte da maior comunidade de beach volley do Brasil.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            height: 1.45,
          ),
        ),
        SizedBox(height: 28),
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
            if (_emailError != null) setState(() => _emailError = null);
          },
        ),
        SizedBox(height: 14),
        AuthFieldLabel(
          label: 'SENHA',
          highlighted: _passwordFocused,
        ),
        AuthTextField(
          controller: _passwordController,
          focusNode: _passwordFocusNode,
          hintText: '••••••••',
          obscureText: _obscurePassword,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.newPassword],
          errorText: _passwordError,
          borderless: true,
          suffixIcon: authPasswordVisibilityIcon(
            obscured: _obscurePassword,
            onToggle: () {
              HapticFeedback.selectionClick();
              setState(() => _obscurePassword = !_obscurePassword);
            },
          ),
          onChanged: (_) {
            if (_passwordError != null) setState(() => _passwordError = null);
          },
        ),
        SizedBox(height: 10),
        AuthPasswordStrength(
          result: strength,
          visible: showStrength,
        ),
        SizedBox(height: 14),
        AuthFieldLabel(
          label: 'CONFIRMAR SENHA',
          highlighted: confirmMismatch,
        ),
        AuthTextField(
          controller: _confirmPasswordController,
          hintText: '••••••••',
          obscureText: _obscureConfirm,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.newPassword],
          errorText: _confirmPasswordError,
          borderless: true,
          onSubmitted: (_) => _submit(),
          suffixIcon: authPasswordVisibilityIcon(
            obscured: _obscureConfirm,
            onToggle: () {
              HapticFeedback.selectionClick();
              setState(() => _obscureConfirm = !_obscureConfirm);
            },
          ),
          onChanged: (_) {
            _syncConfirmError();
            setState(() {});
          },
        ),
        SizedBox(height: 16),
        AuthTermsConsent(
          value: _termsAccepted,
          onChanged: _busy
              ? null
              : (v) => setState(() => _termsAccepted = v ?? false),
          onTermsTap: () => _openLegalUrl(AuthLegalUrls.termsUrl),
          onPrivacyTap: () => _openLegalUrl(AuthLegalUrls.privacyUrl),
        ),
      ],
    );
  }

  Widget _buildBottomActions(ThemeData theme, ColorScheme scheme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton(
            onPressed: (_busy || !_termsAccepted) ? null : _submit,
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
                    'Criar conta',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.black,
                    ),
                  ),
          ),
        ),
        SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          height: 50,
          child: OutlinedButton(
            onPressed: _busy ? null : () => context.go(AppRoutes.login),
            style: OutlinedButton.styleFrom(
              foregroundColor: context.themeColors.onSurface,
              backgroundColor: Colors.transparent,
              side: BorderSide(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              'Cancelar',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        SizedBox(height: 20),
        AuthOrDivider(
          color: scheme.outline,
          label: 'OU CADASTRA-SE COM',
          uppercaseLabel: true,
        ),
        SizedBox(height: 20),
        AuthSocialButton(
          onPressed: _busy ? null : _signInWithGoogle,
          loading: _googleSubmitting,
          icon: const AuthGoogleGlyph(),
          label: 'Continuar com Google',
        ),
        SizedBox(height: 10),
        AuthSocialButton(
          onPressed: null,
          icon: Icon(
            Icons.apple,
            size: 22,
            color: context.themeColors.onSurface,
          ),
          label: 'Continuar com Apple',
        ),
        SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Já tem conta? ',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
            AuthLinkButton(
              label: 'Entrar',
              onPressed: _busy ? null : () => context.go(AppRoutes.login),
            ),
          ],
        ),
        SizedBox(height: 16),
      ],
    );
  }
}
