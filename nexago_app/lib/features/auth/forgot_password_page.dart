import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_providers.dart';
import '../../core/auth/firebase_auth_error_mapper.dart';
import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/ui/app_snackbar.dart';

class ForgotPasswordPage extends ConsumerStatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  ConsumerState<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends ConsumerState<ForgotPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  bool _submitting = false;
  bool _sent = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      await ref.read(authServiceProvider).sendPasswordResetEmail(
            email: _emailController.text,
          );
      if (!mounted) return;
      setState(() => _sent = true);
      showAppSnackBar(
        context,
        '"Se o email estiver cadastrado, você receberá um link"',
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
      appBar: AppBar(title: const Text('Recuperar senha')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Esqueceu sua senha?',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppColors.black,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Informe seu e-mail e enviaremos um link para redefinir sua senha.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.onSurfaceMuted,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _submit(),
                      decoration: const InputDecoration(
                        labelText: 'E-mail',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) {
                        final v = value?.trim() ?? '';
                        if (v.isEmpty) return 'Informe o e-mail.';
                        final validEmail =
                            RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v);
                        if (!validEmail) return 'E-mail inválido.';
                        return null;
                      },
                    ),
                    const SizedBox(height: 18),
                    FilledButton(
                      onPressed: _submitting ? null : _submit,
                      child: _submitting
                          ? const SizedBox(
                              height: 22,
                              width: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Enviar link'),
                    ),
                    if (_sent) ...[
                      const SizedBox(height: 12),
                      Text(
                        '"Se o email estiver cadastrado, você receberá um link"',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: const Color(0xFF2E7D32),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed:
                          _submitting ? null : () => context.go(AppRoutes.login),
                      child: const Text('Voltar para login'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
