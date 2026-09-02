import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth/auth_providers.dart';
import '../../core/auth/auth_service.dart';
import '../../core/observability/analytics_service.dart';
import '../../features/athlete/onboarding/domain/athlete_onboarding_providers.dart';
import '../../core/auth/firebase_auth_error_mapper.dart';
import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../core/ui/app_snackbar.dart';
import '../../core/ui/feedback/feedback_page.dart';
import '../../core/ui/fade_slide_in.dart';
import 'auth_legal_urls.dart';
import 'domain/auth_password_strength.dart';
import 'widgets/auth_form_widgets.dart';

/// Tempo máximo esperando `createUserWithEmailAndPassword` responder. O SDK
/// pode criar a conta e abrir a sessão sem a chamada voltar (resposta nativa
/// perdida); o atleta não pode ficar com o botão girando para sempre.
@visibleForTesting
const Duration kRegisterCreateTimeout = Duration(seconds: 30);

/// Janela para o evento de auth chegar DEPOIS de a chamada falhar — no
/// Android a sessão pode aparecer alguns instantes após a exceção.
@visibleForTesting
const Duration kRegisterLateSessionGrace = Duration(milliseconds: 1500);

@visibleForTesting
const String kRegisterTimeoutMessage =
    'A criação da conta está demorando mais que o normal. '
    'Verifique sua conexão e tente de novo.';

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

  /// Assinatura do `authStateChanges` durante o cadastro por e-mail/senha:
  /// a sessão virando a conta pedida É o sucesso, venha ou não a resposta
  /// da chamada (ver [_submit]).
  StreamSubscription<User?>? _signupSessionSub;
  bool _signupSettled = false;

  bool _isSuccessPhase(BuildContext context) =>
      _pendingSuccess ||
      GoRouterState.of(context).uri.queryParameters['step'] == 'success';

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
    _signupSessionSub?.cancel();
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
      await ref.read(appSignOutProvider)();
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

    // Capturados antes dos awaits: a criação da conta muda o estado de auth
    // no meio do fluxo e a árvore acima do router reage (gate biométrico).
    // A navegação para o sucesso não pode depender deste State continuar vivo.
    final router = GoRouter.of(context);
    final auth = ref.read(authServiceProvider);
    final firebaseAuth = ref.read(firebaseAuthProvider);
    final analytics = ref.read(analyticsServiceProvider);

    // A SESSÃO é a fonte da verdade, não o retorno da chamada. O SDK pode
    // criar a conta e abrir a sessão sem a chamada voltar (resposta nativa
    // perdida) ou lançando antes de `currentUser` ser preenchido — nos dois
    // casos a conta existe e o atleta tem de chegar à tela de sucesso, como
    // o login já faz pelo redirect do router. Assinado ANTES da chamada para
    // não perder o evento; a intercalação normal (evento antes da resposta)
    // também passa por aqui.
    _signupSettled = false;
    await _signupSessionSub?.cancel();
    _signupSessionSub = firebaseAuth.authStateChanges().listen((user) {
      if (_isSessionOf(user, email)) {
        _finishSignup(router: router, auth: auth, analytics: analytics);
      }
    });

    Object? createError;
    StackTrace? createStack;
    try {
      await auth
          .registerWithEmailAndPassword(email: email, password: password)
          .timeout(kRegisterCreateTimeout);
    } catch (e, st) {
      createError = e;
      createStack = st;
    }

    if (_signupSettled) {
      // O evento de auth chegou primeiro e já levou ao sucesso. Se mesmo
      // assim a chamada falhou (ou nunca respondeu), fica registrado: é o
      // SDK se comportando mal e é isso que o Crashlytics precisa mostrar.
      if (createError != null) {
        _logRegisterFlowError(
          'createUserAfterSession',
          createError,
          createStack!,
        );
      }
      return;
    }

    if (createError == null) {
      _finishSignup(router: router, auth: auth, analytics: analytics);
      return;
    }

    // A chamada falhou, mas a conta pode ter nascido mesmo assim — o SDK
    // já lançou exceção DEPOIS de criar e logar (bug histórico do
    // firebase_auth no Android), e "e-mail já em uso" num novo toque cai
    // aqui também. Se a sessão atual é da conta pedida, o cadastro DE FATO
    // aconteceu: registra o erro e segue ao sucesso em vez de prender o
    // atleta num formulário que nunca mais vai passar.
    if (_isSessionOf(firebaseAuth.currentUser, email)) {
      _logRegisterFlowError('createUserRecovered', createError, createStack!);
      _finishSignup(router: router, auth: auth, analytics: analytics);
      return;
    }

    // `currentUser` ainda vazio: o evento de auth pode estar a caminho. Dá
    // uma janela curta antes de dizer que falhou — se a sessão aparecer, o
    // listener acima resolve sozinho.
    await Future<void>.delayed(kRegisterLateSessionGrace);
    if (_signupSettled) {
      _logRegisterFlowError(
        'createUserRecoveredLate',
        createError,
        createStack!,
      );
      return;
    }

    _logRegisterFlowError('createUser', createError, createStack!);
    if (!mounted) return;
    setState(() => _submitting = false);
    showAppSnackBar(
      context,
      switch (createError) {
        TimeoutException() => kRegisterTimeoutMessage,
        FirebaseAuthException e => mapFirebaseAuthException(e),
        _ => 'Erro inesperado. Tente novamente.',
      },
      isError: true,
    );
  }

  static bool _isSessionOf(User? user, String email) =>
      user?.email?.toLowerCase() == email.toLowerCase();

  /// A conta EXISTE e o atleta está autenticado: nada abaixo pode segurá-lo
  /// fora da tela de sucesso. Idempotente — chega aqui por quem resolver
  /// primeiro (evento de auth ou retorno da chamada). A navegação vai na
  /// frente; e-mail de verificação e analytics são efeitos colaterais que
  /// correm depois, sem prender o fluxo numa rede lenta (a tela de sucesso já
  /// pede a confirmação do e-mail e o reenvio existe).
  void _finishSignup({
    required GoRouter router,
    required AuthService auth,
    required AnalyticsService analytics,
  }) {
    if (_signupSettled) return;
    _signupSettled = true;
    unawaited(_signupSessionSub?.cancel());
    _signupSessionSub = null;

    if (mounted) {
      setState(() {
        _pendingSuccess = true;
        _submitting = false;
      });
    }
    router.go(
      Uri(
        path: AppRoutes.register,
        queryParameters: const {'step': 'success'},
      ).toString(),
    );

    unawaited(() async {
      try {
        await auth.sendEmailVerification();
      } catch (e, st) {
        _logRegisterFlowError('sendEmailVerification', e, st);
      }
    }());
    try {
      analytics.logSignUp('password');
    } catch (e, st) {
      _logRegisterFlowError('logSignUp', e, st);
    }
  }

  /// Erros do fluxo de cadastro nunca somem em silêncio: em produção vão ao
  /// Crashlytics como não-fatais (o guard cobre testes sem Firebase).
  void _logRegisterFlowError(String stage, Object e, StackTrace st) {
    debugPrint('cadastro: falha em $stage: $e');
    try {
      FirebaseCrashlytics.instance.recordError(
        e,
        st,
        reason: 'register:$stage',
        fatal: false,
      );
    } catch (_) {}
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

    if (_isSuccessPhase(context)) {
      return FeedbackPage.success(
        title: 'Conta criada!',
        description:
            'Confirme seu e-mail e complete o perfil para competir nos torneios.',
        primaryAction: FeedbackAction(
          label: 'Completar perfil de atleta',
          onPressed: _busy ? () {} : _completeProfile,
        ),
        secondaryAction: FeedbackAction(
          label: 'Entrar depois',
          isPrimary: false,
          onPressed: _busy ? () {} : _signOutAndGoLogin,
        ),
      );
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Stack(
          children: [
            const AuthCanvasGlow(),
            FadeSlideIn(
              child: Center(
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
