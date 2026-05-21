import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_providers.dart';
import '../../core/auth/firebase_auth_error_mapper.dart';
import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/ui/app_snackbar.dart';
import '../../core/ui/fade_slide_in.dart';
import 'widgets/auth_form_widgets.dart';

class ForgotPasswordPage extends ConsumerStatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  ConsumerState<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends ConsumerState<ForgotPasswordPage> {
  final _emailController = TextEditingController();

  bool _submitting = false;
  bool _sent = false;
  String? _emailError;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  void _goBack() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.login);
    }
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();

    String? emailError;
    if (email.isEmpty) {
      emailError = 'Informe o e-mail';
    } else {
      final valid =
          RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email);
      if (!valid) emailError = 'E-mail inválido';
    }

    setState(() {
      _emailError = emailError;
      _sent = false;
    });
    if (emailError != null) return;

    HapticFeedback.mediumImpact();
    setState(() => _submitting = true);
    try {
      await ref.read(authServiceProvider).sendPasswordResetEmail(email: email);
      if (!mounted) return;
      setState(() => _sent = true);
      showAppSnackBar(
        context,
        'Se o e-mail estiver cadastrado, você receberá um link em instantes.',
      );
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      final mapped = mapFirebaseAuthException(e);
      showAppSnackBar(
        context,
        mapped.contains('(')
            ? 'Não foi possível enviar o link agora. Tente novamente.'
            : mapped,
        isError: true,
      );
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível enviar o link agora. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: Stack(
          children: [
            const AuthCanvasGlow(),
            FadeSlideIn(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                    child: AuthBackButton(
                      onPressed: _submitting ? null : _goBack,
                    ),
                  ),
                  Expanded(
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
                              const AuthLogo(),
                              const SizedBox(height: 12),
                              const AuthKicker(label: 'RESET · ACESSO'),
                              const SizedBox(height: 24),
                              Text(
                                'Recuperar\nsenha.',
                                textAlign: TextAlign.center,
                                style: theme.textTheme.headlineMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.onSurface,
                                  letterSpacing: -0.5,
                                  height: 1.12,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                'Insere o e-mail da sua conta pra receber um '
                                'link de recuperação.',
                                textAlign: TextAlign.center,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: AppColors.onSurfaceMuted,
                                  height: 1.45,
                                ),
                              ),
                              const SizedBox(height: 32),
                              const AuthFieldLabel(
                                label: 'E-MAIL DE RECUPERAÇÃO',
                              ),
                              AuthTextField(
                                controller: _emailController,
                                hintText: 'seu@email.com',
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.done,
                                autofillHints: const [AutofillHints.email],
                                errorText: _emailError,
                                borderless: true,
                                onSubmitted: (_) => _submit(),
                                onChanged: (_) {
                                  if (_emailError != null) {
                                    setState(() => _emailError = null);
                                  }
                                },
                              ),
                              const SizedBox(height: 14),
                              const AuthResetInfoBanner(),
                              if (_sent) ...[
                                const SizedBox(height: 14),
                                DecoratedBox(
                                  decoration: BoxDecoration(
                                    color: AppColors.win.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: AppColors.win.withValues(alpha: 0.35),
                                    ),
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 12,
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(
                                          Icons.check_circle_outline_rounded,
                                          size: 20,
                                          color: AppColors.win,
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Text(
                                            'E-mail enviado! Verifique sua caixa de entrada.',
                                            style: theme.textTheme.bodyMedium
                                                ?.copyWith(
                                              color: AppColors.win,
                                              fontWeight: FontWeight.w700,
                                              height: 1.35,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 420),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SizedBox(
                              width: double.infinity,
                              height: 52,
                              child: FilledButton(
                                onPressed: _submitting ? null : _submit,
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
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: AppColors.black,
                                        ),
                                      )
                                    : Text(
                                        'Enviar link de recuperação',
                                        textAlign: TextAlign.center,
                                        style: theme.textTheme.titleMedium
                                            ?.copyWith(
                                          fontWeight: FontWeight.w800,
                                          color: AppColors.black,
                                        ),
                                      ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              height: 50,
                              child: OutlinedButton(
                                onPressed: _submitting ? null : _goBack,
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: AppColors.onSurface,
                                  backgroundColor: Colors.transparent,
                                  side: BorderSide(
                                    color: AppColors.onSurfaceMuted
                                        .withValues(alpha: 0.35),
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                child: Text(
                                  'Voltar para login',
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.onSurface,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
