import 'package:firebase_auth/firebase_auth.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/auth/firebase_auth_error_mapper.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../auth/domain/auth_password_strength.dart';
import '../../auth/widgets/auth_form_widgets.dart' show AuthFieldLabel, AuthPasswordStrength, AuthTextField, authPasswordVisibilityIcon;

class AthleteChangePasswordPage extends ConsumerStatefulWidget {
  const AthleteChangePasswordPage({super.key});

  @override
  ConsumerState<AthleteChangePasswordPage> createState() =>
      _AthleteChangePasswordPageState();
}

class _AthleteChangePasswordPageState
    extends ConsumerState<AthleteChangePasswordPage> {
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;
  bool _submitting = false;
  bool _sendingReset = false;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitPassword() async {
    final current = _currentCtrl.text;
    final newPwd = _newCtrl.text;
    final confirm = _confirmCtrl.text;

    if (current.isEmpty) {
      showAppSnackBar(context, 'Informe a senha atual.', isError: true);
      return;
    }
    if (!evaluatePasswordStrength(newPwd).isStrongEnough) {
      showAppSnackBar(
        context,
        'A nova senha não atende aos requisitos mínimos.',
        isError: true,
      );
      return;
    }
    if (newPwd != confirm) {
      showAppSnackBar(context, 'As senhas não coincidem.', isError: true);
      return;
    }

    HapticFeedback.mediumImpact();
    setState(() => _submitting = true);
    try {
      await ref.read(authServiceProvider).updatePassword(
            currentPassword: current,
            newPassword: newPwd,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Senha atualizada com sucesso.');
      context.pop();
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        mapFirebaseAuthException(e),
        isError: true,
      );
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Não foi possível alterar a senha: $e', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _sendResetLink() async {
    final email = ref.read(authProvider).valueOrNull?.email?.trim();
    if (email == null || email.isEmpty) {
      showAppSnackBar(context, 'Conta sem e-mail cadastrado.', isError: true);
      return;
    }

    setState(() => _sendingReset = true);
    try {
      await ref.read(authServiceProvider).sendPasswordResetEmail(email: email);
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Enviamos um link de redefinição para $email.',
      );
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, mapFirebaseAuthException(e), isError: true);
    } finally {
      if (mounted) setState(() => _sendingReset = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasPassword = ref.watch(authServiceProvider).hasPasswordProvider;
    final newStrength = evaluatePasswordStrength(_newCtrl.text);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: Icon(Icons.chevron_left_rounded),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(AppRoutes.athletePrivacySecurity);
            }
          },
        ),
        title: Text(
          'Alterar senha',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          if (!hasPassword) ...[
            Text(
              'Sua conta usa login social (Google). Para definir uma senha, envie um link de redefinição ao seu e-mail.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.45,
              ),
            ),
            SizedBox(height: 24),
            FilledButton(
              onPressed: _sendingReset ? null : _sendResetLink,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _sendingReset
                  ? SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      'Enviar link de redefinição',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
            ),
          ] else ...[
            const AuthFieldLabel(label: 'SENHA ATUAL'),
            AuthTextField(
              controller: _currentCtrl,
              hintText: '••••••••',
              obscureText: _obscureCurrent,
              textInputAction: TextInputAction.next,
              borderless: true,
              suffixIcon: authPasswordVisibilityIcon(
                obscured: _obscureCurrent,
                onToggle: () =>
                    setState(() => _obscureCurrent = !_obscureCurrent),
              ),
            ),
            SizedBox(height: 16),
            const AuthFieldLabel(label: 'NOVA SENHA'),
            AuthTextField(
              controller: _newCtrl,
              hintText: '••••••••',
              obscureText: _obscureNew,
              textInputAction: TextInputAction.next,
              borderless: true,
              onChanged: (_) => setState(() {}),
              suffixIcon: authPasswordVisibilityIcon(
                obscured: _obscureNew,
                onToggle: () => setState(() => _obscureNew = !_obscureNew),
              ),
            ),
            SizedBox(height: 10),
            AuthPasswordStrength(
              result: newStrength,
              visible: _newCtrl.text.isNotEmpty,
            ),
            SizedBox(height: 16),
            const AuthFieldLabel(label: 'CONFIRMAR NOVA SENHA'),
            AuthTextField(
              controller: _confirmCtrl,
              hintText: '••••••••',
              obscureText: _obscureConfirm,
              textInputAction: TextInputAction.done,
              borderless: true,
              onSubmitted: (_) => _submitPassword(),
              suffixIcon: authPasswordVisibilityIcon(
                obscured: _obscureConfirm,
                onToggle: () =>
                    setState(() => _obscureConfirm = !_obscureConfirm),
              ),
            ),
            SizedBox(height: 28),
            FilledButton(
              onPressed: _submitting ? null : _submitPassword,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _submitting
                  ? SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      'Salvar nova senha',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
            ),
          ],
        ],
      ),
    );
  }
}
