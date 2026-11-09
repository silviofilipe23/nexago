import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_providers.dart';
import '../theme/app_theme.dart';
import '../theme/theme_mode_provider.dart';
import '../../features/athlete/domain/athlete_profile.dart';
import '../../features/athlete/domain/athlete_profile_providers.dart';
import '../../shared/constants/app_strings.dart';
import 'biometric_lock_screen.dart';

/// Coloca um bloqueio sobre o app quando [useBiometric] está ativo até o desbloqueio.
///
/// Nunca tranca sem alternativa: há "Entrar com senha" (contas e-mail/senha,
/// reautenticação Firebase) e "Sair da conta" para qualquer conta.
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

    // O app (o `MaterialApp.router`) fica SEMPRE na mesma posição da árvore e
    // só a camada por cima muda. Alternar entre devolver `widget.child` cru e
    // embrulhá-lo num `Stack` recriava o `Router` a cada vez que o perfil
    // recarregava — e o Router novo reaplicava a rota antiga: ao concluir o
    // onboarding, a ida para a home era desfeita e o atleta voltava ao
    // formulário já salvo, tocando "Concluir cadastro" de novo.
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Stack(
        fit: StackFit.expand,
        children: [
          widget.child,
          ..._overlay(
            signedIn: authAsync.valueOrNull != null,
            profileAsync: profileAsync,
          ),
        ],
      ),
    );
  }

  List<Widget> _overlay({
    required bool signedIn,
    required AsyncValue<AthleteProfile?> profileAsync,
  }) {
    if (!signedIn) return const [];

    if (profileAsync.isLoading) {
      // Scrim escuro translúcido, não branco: este gate vive ACIMA do
      // MaterialApp (sem Theme do app) e um flash branco em tema escuro era
      // percebido como "a tela piscou" a cada login/cadastro dentro do app.
      return const [
        ModalBarrier(
          dismissible: false,
          color: Color(0x99000000),
        ),
        Center(
          child: CircularProgressIndicator(),
        ),
      ];
    }

    if (profileAsync.hasError) return const [];

    final useBio = profileAsync.valueOrNull?.useBiometric ?? false;
    if (!useBio || _sessionUnlocked) return const [];

    // A camada tem o próprio `MaterialApp` (tema nexaGO, Navigator,
    // localizações), como o `AppUpdateGate`: este gate vive ACIMA do app,
    // então sem isso a tela saía no tema Material padrão e a folha de senha
    // não tinha Navigator para abrir.
    return [
      MaterialApp(
        title: AppStrings.appName,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ref.watch(resolvedThemeModeProvider),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [
          Locale('pt', 'BR'),
          Locale('en'),
        ],
        home: BiometricLockScreen(
          onUnlocked: () => _setUnlocked(true),
        ),
      ),
    ];
  }
}
