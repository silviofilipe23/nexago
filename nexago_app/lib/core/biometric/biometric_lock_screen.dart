import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/athlete/domain/athlete_profile_providers.dart';
import '../auth/auth_providers.dart';
import '../auth/firebase_auth_error_mapper.dart';
import '../errors/friendly_error_message.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme_colors.dart';
import 'biometric_providers.dart';

/// Tela de bloqueio por Face ID / biometria, no padrão visual nexaGO.
///
/// Mostrada pelo `BiometricAppGate` por cima do app. Sempre há saída: senha
/// (contas e-mail/senha) e "Sair da conta" para qualquer conta.
class BiometricLockScreen extends ConsumerStatefulWidget {
  const BiometricLockScreen({super.key, required this.onUnlocked});

  final VoidCallback onUnlocked;

  @override
  ConsumerState<BiometricLockScreen> createState() =>
      _BiometricLockScreenState();
}

class _BiometricLockScreenState extends ConsumerState<BiometricLockScreen> {
  bool _busy = false;
  String _methodLabel =
      defaultTargetPlatform == TargetPlatform.iOS ? 'Face ID' : 'biometria';

  bool get _isFace => _methodLabel == 'Face ID';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadMethodLabel());
  }

  Future<void> _loadMethodLabel() async {
    final label = await ref.read(biometricServiceProvider).primaryMethodLabel();
    if (!mounted) return;
    setState(() => _methodLabel = label);
  }

  Future<void> _tryBiometric() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final ok = await ref.read(biometricServiceProvider).authenticate(
            localizedReason: 'Use $_methodLabel para acessar o nexaGO.',
          );
      if (!mounted) return;
      if (ok) widget.onUnlocked();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openPasswordSheet(String email) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (_) => _PasswordUnlockSheet(email: email),
    );
    if (ok == true && mounted) widget.onUnlocked();
  }

  Future<void> _signOut() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(appSignOutProvider)();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            friendlyErrorMessage(e, action: 'Não foi possível sair da conta'),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final user = ref.watch(authProvider).valueOrNull;
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final email = user?.email?.trim() ?? '';
    final canUsePassword = email.isNotEmpty && _hasPasswordProvider(user);
    final displayName = _displayName(
      profile?.nickname ?? profile?.name ?? user?.displayName,
    );
    final avatarUrl = profile?.avatarUrl ?? user?.photoURL;

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: colors.canvas,
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: constraints.maxHeight - 48,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const _Wordmark(),
                        const SizedBox(height: 32),
                        Column(
                          children: [
                            _MethodBadge(isFace: _isFace),
                            if (displayName != null) ...[
                              const SizedBox(height: 32),
                              _AccountChip(
                                name: displayName,
                                avatarUrl: avatarUrl,
                              ),
                            ],
                            const SizedBox(height: 20),
                            Text(
                              'Desbloqueie o nexaGO',
                              textAlign: TextAlign.center,
                              style: theme.textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.6,
                                height: 1.15,
                                color: colors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'Confirme que é você para continuar de onde '
                              'parou.',
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodyLarge?.copyWith(
                                color: colors.onSurfaceMuted,
                                fontWeight: FontWeight.w500,
                                height: 1.5,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 40),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _PrimaryButton(
                              key: const Key('biometric-unlock'),
                              label: 'Usar $_methodLabel',
                              icon: _isFace
                                  ? Icons.face_unlock_rounded
                                  : Icons.fingerprint_rounded,
                              busy: _busy,
                              onPressed: _busy ? null : _tryBiometric,
                            ),
                            if (canUsePassword) ...[
                              const SizedBox(height: 8),
                              _SecondaryButton(
                                key: const Key('biometric-password'),
                                label: 'Entrar com senha',
                                onPressed: _busy
                                    ? null
                                    : () => _openPasswordSheet(email),
                              ),
                            ],
                            const SizedBox(height: 8),
                            TextButton(
                              key: const Key('biometric-sign-out'),
                              onPressed: _busy ? null : _signOut,
                              style: TextButton.styleFrom(
                                minimumSize: const Size.fromHeight(44),
                                foregroundColor: colors.onSurfaceMuted,
                              ),
                              child: Text.rich(
                                TextSpan(
                                  text: 'Não é você? ',
                                  children: [
                                    TextSpan(
                                      text: 'Sair da conta',
                                      style: TextStyle(
                                        color: colors.onSurface,
                                        decoration: TextDecoration.underline,
                                        decorationColor: colors.onSurface,
                                      ),
                                    ),
                                  ],
                                ),
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
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
      ),
    );
  }

  static bool _hasPasswordProvider(User? user) =>
      user?.providerData.any((p) => p.providerId == 'password') ?? false;

  static String? _displayName(String? raw) {
    final parts = (raw ?? '').trim().split(RegExp(r'\s+'));
    if (parts.first.isEmpty) return null;
    if (parts.length == 1) return parts.first;
    return '${parts.first} ${parts.last}';
  }
}

class _Wordmark extends StatelessWidget {
  const _Wordmark();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = Theme.of(context).textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: -0.4,
        );
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: 'nexa', style: TextStyle(color: colors.onSurface)),
          TextSpan(text: 'GO', style: TextStyle(color: colors.brandText)),
        ],
      ),
      textAlign: TextAlign.center,
      style: style,
      semanticsLabel: 'nexaGO',
    );
  }
}

class _MethodBadge extends StatelessWidget {
  const _MethodBadge({required this.isFace});

  final bool isFace;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      width: 132,
      height: 132,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.brand.withValues(alpha: 0.10),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.24)),
      ),
      child: Icon(
        isFace ? Icons.face_unlock_outlined : Icons.fingerprint_rounded,
        size: 60,
        color: colors.brandText,
      ),
    );
  }
}

class _AccountChip extends StatelessWidget {
  const _AccountChip({required this.name, this.avatarUrl});

  final String name;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final initials = name
        .split(' ')
        .where((p) => p.isNotEmpty)
        .map((p) => p[0].toUpperCase())
        .take(2)
        .join();
    final url = avatarUrl?.trim() ?? '';
    return Container(
      padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colors.outline.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: colors.surfaceSheet,
            foregroundImage: url.isEmpty ? null : NetworkImage(url),
            child: Text(
              initials,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: colors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    super.key,
    required this.label,
    required this.icon,
    required this.busy,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final bool busy;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.white,
          disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.5),
          disabledForegroundColor: AppColors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.2,
          ),
        ),
        child: busy
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.4,
                  color: AppColors.white,
                ),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 22),
                  const SizedBox(width: 10),
                  Text(label),
                ],
              ),
      ),
    );
  }
}

class _SecondaryButton extends StatelessWidget {
  const _SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SizedBox(
      height: 52,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: colors.surfaceRaised,
          foregroundColor: colors.onSurface,
          side: BorderSide(color: colors.outline.withValues(alpha: 0.4)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
        child: Text(label),
      ),
    );
  }
}

/// Folha "Entrar com senha": reautentica no Firebase e devolve `true`.
class _PasswordUnlockSheet extends ConsumerStatefulWidget {
  const _PasswordUnlockSheet({required this.email});

  final String email;

  @override
  ConsumerState<_PasswordUnlockSheet> createState() =>
      _PasswordUnlockSheetState();
}

class _PasswordUnlockSheetState extends ConsumerState<_PasswordUnlockSheet> {
  final _controller = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final password = _controller.text;
    if (password.isEmpty) {
      setState(() => _error = 'Informe a senha.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authServiceProvider).reauthenticateWithEmailAndPassword(
            email: widget.email,
            password: password,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = switch (e.code) {
          'wrong-password' ||
          'invalid-credential' =>
            'Senha incorreta. Tente de novo.',
          _ => tryMapFirebaseAuthException(e) ??
              friendlyErrorMessage(e, action: 'Não foi possível entrar'),
        };
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = friendlyErrorMessage(e, action: 'Não foi possível entrar');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: colors.onSurfaceMuted.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Entrar com senha',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              Text.rich(
                TextSpan(
                  text: 'Digite a senha da conta ',
                  children: [
                    TextSpan(
                      text: widget.email,
                      style: TextStyle(
                        color: colors.onSurface,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 24),
              TextField(
                key: const Key('biometric-password-field'),
                controller: _controller,
                autofocus: true,
                obscureText: _obscure,
                enabled: !_busy,
                autofillHints: const [AutofillHints.password],
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
                decoration: InputDecoration(
                  labelText: 'Senha',
                  errorText: _error,
                  errorMaxLines: 3,
                  suffixIcon: IconButton(
                    tooltip: _obscure ? 'Mostrar senha' : 'Ocultar senha',
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: Icon(
                      _obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 28),
              _PrimaryButton(
                key: const Key('biometric-password-submit'),
                label: 'Desbloquear',
                icon: Icons.lock_open_rounded,
                busy: _busy,
                onPressed: _busy ? null : _submit,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed:
                    _busy ? null : () => Navigator.of(context).pop(false),
                style: TextButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                  foregroundColor: colors.onSurfaceMuted,
                  textStyle: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                child: const Text('Cancelar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
