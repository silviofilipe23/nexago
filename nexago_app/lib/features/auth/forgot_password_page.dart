import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_providers.dart';
import '../../core/auth/firebase_auth_error_mapper.dart';
import '../../core/router/routes.dart';
import '../../core/ui/app_snackbar.dart';

class ForgotPasswordPage extends ConsumerStatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  ConsumerState<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends ConsumerState<ForgotPasswordPage>
    with SingleTickerProviderStateMixin {
  final _emailController = TextEditingController();

  bool _submitting = false;
  bool _sent = false;
  String? _emailError;

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
    super.dispose();
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
    const pageBg = CupertinoColors.white;
    const fieldBg = Color(0xFFEDEDEF);
    const textMuted = Color(0xFF6E6E73);
    const infoBlue = Color(0xFF3249E8);
    const infoBg = Color(0xFFDFE5FF);
    const infoBorder = Color(0xFFC8D2FF);

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
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      CupertinoButton(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(36, 36),
                        onPressed: _submitting
                            ? null
                            : () {
                                if (context.canPop()) {
                                  context.pop();
                                } else {
                                  context.go(AppRoutes.login);
                                }
                              },
                        child: const Icon(
                          CupertinoIcons.chevron_back,
                          size: 26,
                          color: CupertinoColors.black,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  const _ForgotLogoBadge(),
                  const SizedBox(height: 18),
                  const Text(
                    'Recuperar senha',
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
                    'Insira seu e-mail para receber um link de recuperação',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontWeight: FontWeight.w400,
                      fontSize: 14,
                      color: textMuted,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 26),
                  _fieldLabel('E-MAIL DE RECUPERAÇÃO'),
                  _buildEmailField(fieldBg: fieldBg),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: infoBg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: infoBorder),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: infoBlue,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          alignment: Alignment.center,
                          child: const Icon(
                            CupertinoIcons.info,
                            size: 16,
                            color: CupertinoColors.white,
                          ),
                        ),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            'Enviaremos um link de recuperação para seu e-mail. '
                            'Verifique a caixa de spam se não encontrar.',
                            style: TextStyle(
                              color: infoBlue,
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              height: 1.35,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  if (_sent) ...[
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(
                        'E-mail enviado! Verifique sua caixa de entrada.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: CupertinoColors.activeGreen.darkColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: _submitting ? null : _submit,
                    child: Container(
                      height: 54,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        gradient: const LinearGradient(
                          colors: [Color(0xFF5F63F6), Color(0xFF7A4EF4)],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF7B61FF)
                                .withValues(alpha: 0.35),
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
                              'Enviar link de recuperação',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: CupertinoColors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.1,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: _submitting
                        ? null
                        : () => context.go(AppRoutes.login),
                    child: Container(
                      height: 50,
                      decoration: BoxDecoration(
                        color: fieldBg,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      alignment: Alignment.center,
                      child: const Text(
                        'Voltar para login',
                        style: TextStyle(
                          color: CupertinoColors.black,
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
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
          letterSpacing: 1.0,
        ),
      ),
    );
  }

  Widget _buildEmailField({required Color fieldBg}) {
    final hasError = _emailError != null && _emailError!.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            color: fieldBg,
            borderRadius: BorderRadius.circular(12),
            border: hasError
                ? Border.all(color: CupertinoColors.systemRed, width: 1)
                : null,
          ),
          child: CupertinoTextField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
            onChanged: (_) {
              if (_emailError != null) setState(() => _emailError = null);
            },
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            placeholder: 'seu@email.com',
            placeholderStyle: const TextStyle(
              color: Color(0xFF9B9BA1),
              fontSize: 17,
              fontWeight: FontWeight.w400,
            ),
            style: const TextStyle(
              color: CupertinoColors.black,
              fontSize: 17,
              fontWeight: FontWeight.w400,
            ),
            decoration: const BoxDecoration(
              color: CupertinoColors.transparent,
            ),
          ),
        ),
        if (hasError) ...[
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              _emailError!,
              style: const TextStyle(
                color: CupertinoColors.systemRed,
                fontSize: 12,
                fontWeight: FontWeight.w400,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _ForgotLogoBadge extends StatelessWidget {
  const _ForgotLogoBadge();

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
