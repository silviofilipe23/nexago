import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_providers.dart';
import '../../features/athlete/domain/athlete_profile_providers.dart';
import 'biometric_providers.dart';

/// Coloca um bloqueio sobre o app quando [useBiometric] está ativo até o desbloqueio.
///
/// Nunca tranca sem alternativa: sempre há "Entrar com senha" (reautenticação Firebase).
class BiometricAppGate extends ConsumerStatefulWidget {
  const BiometricAppGate({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<BiometricAppGate> createState() => _BiometricAppGateState();
}

class _BiometricAppGateState extends ConsumerState<BiometricAppGate> {
  bool _sessionUnlocked = false;

  void _setUnlocked(bool v) {
    if (_sessionUnlocked == v) return;
    setState(() => _sessionUnlocked = v);
  }

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) {
      return widget.child;
    }

    final authAsync = ref.watch(authProvider);
    final profileAsync = ref.watch(athleteProfileProvider);

    ref.listen<AsyncValue<User?>>(authProvider, (prev, next) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (next.valueOrNull == null) {
          _setUnlocked(true);
        } else if (prev?.valueOrNull == null && next.valueOrNull != null) {
          _setUnlocked(false);
        }
      });
    });

    ref.listen(athleteProfileProvider, (prev, next) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final useBio = next.valueOrNull?.useBiometric ?? false;
        if (!useBio) {
          _setUnlocked(true);
        } else if (prev?.valueOrNull?.useBiometric != true &&
            next.valueOrNull?.useBiometric == true) {
          _setUnlocked(false);
        }
      });
    });

    final user = authAsync.valueOrNull;

    if (user == null) {
      return widget.child;
    }

    if (profileAsync.isLoading) {
      return Directionality(
        textDirection: TextDirection.ltr,
        child: Stack(
          fit: StackFit.expand,
          children: [
            widget.child,
            const ModalBarrier(
              dismissible: false,
              color: Color(0xCCFFFFFF),
            ),
            const Center(
              child: CircularProgressIndicator(),
            ),
          ],
        ),
      );
    }

    if (profileAsync.hasError) {
      return widget.child;
    }

    final useBio = profileAsync.valueOrNull?.useBiometric ?? false;
    if (!useBio || _sessionUnlocked) {
      return widget.child;
    }

    return Directionality(
      textDirection: TextDirection.ltr,
      child: Stack(
        fit: StackFit.expand,
        children: [
          widget.child,
          _BiometricLockLayer(
            onUnlocked: () => _setUnlocked(true),
          ),
        ],
      ),
    );
  }
}

class _BiometricLockLayer extends ConsumerStatefulWidget {
  const _BiometricLockLayer({required this.onUnlocked});

  final VoidCallback onUnlocked;

  @override
  ConsumerState<_BiometricLockLayer> createState() =>
      _BiometricLockLayerState();
}

class _BiometricLockLayerState extends ConsumerState<_BiometricLockLayer> {
  bool _busy = false;
  String _unlockButtonLabel = 'Usar Face ID';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadUnlockLabel());
  }

  Future<void> _loadUnlockLabel() async {
    final svc = ref.read(biometricServiceProvider);
    final method = await svc.primaryMethodLabel();
    if (!mounted) return;
    setState(() {
      _unlockButtonLabel = method.toLowerCase().contains('face')
          ? 'Usar Face ID'
          : 'Usar $method';
    });
  }

  Future<void> _tryBiometric() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final svc = ref.read(biometricServiceProvider);
      final label = await svc.primaryMethodLabel();
      final ok = await svc.authenticate(
        localizedReason:
            'Use $label para acessar o Nexago.',
      );
      if (!mounted) return;
      if (ok) widget.onUnlocked();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _passwordFallback() async {
    final user = ref.read(authProvider).valueOrNull;
    if (user == null) return;

    final email = user.email?.trim();
    if (email == null || email.isEmpty) {
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Conta sem e-mail'),
          content: const Text(
            'Esta conta não usa senha. Encerre a sessão e entre novamente com o método original.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }

    final passCtrl = TextEditingController();
    final formKey = GlobalKey<FormState>();
    bool? ok;
    String? password;
    try {
      ok = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Text('Entrar com senha'),
          content: Form(
            key: formKey,
            child: TextFormField(
              controller: passCtrl,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Senha',
                border: OutlineInputBorder(),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'Informe a senha';
                return null;
              },
              onFieldSubmitted: (_) {
                if (formKey.currentState?.validate() == true) {
                  Navigator.pop(ctx, true);
                }
              },
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () {
                if (formKey.currentState?.validate() == true) {
                  Navigator.pop(ctx, true);
                }
              },
              child: const Text('Confirmar'),
            ),
          ],
        ),
      );
      if (ok == true) password = passCtrl.text;
    } finally {
      passCtrl.dispose();
    }

    if (ok != true || !mounted || password == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(authServiceProvider).reauthenticateWithEmailAndPassword(
            email: email,
            password: password,
          );
      if (!mounted) return;
      widget.onUnlocked();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Senha inválida ou erro: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface.withValues(alpha: 0.97),
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.lock_rounded,
                    size: 56,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Nexago bloqueado',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Confirme sua identidade para continuar.',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _busy ? null : _tryBiometric,
                      icon: _busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.fingerprint_rounded),
                      label: Text(_busy ? 'Aguarde…' : _unlockButtonLabel),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _busy ? null : _passwordFallback,
                    child: const Text('Entrar com senha'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
