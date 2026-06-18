import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/active_role_providers.dart';
import '../../../core/auth/app_mobile_role.dart';
import '../../../core/auth/auth_providers.dart';
import '../../../core/auth/user_roles.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/athlete_public_profile_models.dart';
import '../../athlete/domain/athlete_public_profile_providers.dart';

/// Piso mínimo da tela de loading pós-login — um breve "flash" de marca, não
/// uma espera. O destino é liberado assim que o bootstrap essencial conclui;
/// este piso só evita um flicker quando os dados voltam quase instantâneos.
const kPostLoginBootstrapMinDuration = Duration(milliseconds: 600);

/// Timeout generoso para não travar a navegação.
const kPostLoginBootstrapTimeout = Duration(seconds: 15);

enum SessionBootstrapState { pending, complete }

/// Decide se uma transição do estado de auth deve disparar o bootstrap em tela
/// cheia (a tela de marca). A PRIMEIRA resolução do auth no processo é o cold
/// start (sessão restaurada ou ausência de sessão) e vai direto ao destino —
/// só logins/logouts com o app já em execução é que mostram a tela.
bool shouldBootstrapForAuthTransition({
  required bool sawFirstAuthState,
  required bool hadUser,
  required bool hasUser,
}) {
  if (!sawFirstAuthState) return false;
  if (!hadUser && hasUser) return true; // login dentro do app
  if (!hasUser) return true; // logout (próximo login mostra a tela)
  return false;
}

final sessionBootstrapProvider =
    NotifierProvider<SessionBootstrapNotifier, SessionBootstrapState>(
  SessionBootstrapNotifier.new,
);

class SessionBootstrapNotifier extends Notifier<SessionBootstrapState> {
  bool _sawFirstAuthState = false;

  @override
  SessionBootstrapState build() {
    ref.listen<AsyncValue<User?>>(authProvider, (previous, next) {
      if (next.isLoading) return;
      final hadUser = previous?.valueOrNull != null;
      final hasUser = next.valueOrNull != null;
      final sawFirst = _sawFirstAuthState;
      _sawFirstAuthState = true;
      if (shouldBootstrapForAuthTransition(
        sawFirstAuthState: sawFirst,
        hadUser: hadUser,
        hasUser: hasUser,
      )) {
        state = SessionBootstrapState.pending;
      }
    });
    // Cold start assume sessão pronta: navega direto e os dados carregam sob
    // demanda nas telas. Login dentro do app reverte para pending (acima).
    return SessionBootstrapState.complete;
  }

  void markComplete() {
    state = SessionBootstrapState.complete;
  }

  void reset() {
    state = SessionBootstrapState.pending;
  }
}

class PostLoginBootstrapResult {
  const PostLoginBootstrapResult({
    required this.success,
    this.errorMessage,
  });

  final bool success;
  final String? errorMessage;
}

typedef PostLoginBootstrapProgress = void Function(
  double progress,
  String statusLabel,
);

/// Aguarda `max(3s, bootstrap)` antes de liberar a navegação pós-auth.
Future<PostLoginBootstrapResult> runPostLoginBootstrap(
  Ref ref, {
  PostLoginBootstrapProgress? onProgress,
}) async {
  try {
    await Future.wait([
      Future<void>.delayed(kPostLoginBootstrapMinDuration),
      _loadAppData(ref, onProgress: onProgress),
    ]).timeout(kPostLoginBootstrapTimeout);
    return const PostLoginBootstrapResult(success: true);
  } on TimeoutException {
    return const PostLoginBootstrapResult(
      success: true,
      errorMessage: 'Alguns dados demoraram; continuando…',
    );
  } catch (e) {
    return PostLoginBootstrapResult(
      success: false,
      errorMessage: e.toString(),
    );
  }
}

Future<void> _loadAppData(
  Ref ref, {
  PostLoginBootstrapProgress? onProgress,
}) async {
  onProgress?.call(0.08, 'CONECTANDO');

  final user = ref.read(authProvider).valueOrNull;
  if (user == null) return;

  final token = await user.getIdTokenResult(true);
  final roles = mobileRolesFromIdToken(token);
  onProgress?.call(0.28, 'CONECTANDO');

  await ref.read(availableMobileRolesProvider.future);
  onProgress?.call(0.48, 'CARREGANDO RANKING · GO');

  await resolveActiveMobileRole(ref);
  onProgress?.call(0.68, 'CARREGANDO RANKING · GO');

  if (roles.contains(AppMobileRole.athlete)) {
    try {
      await ref.read(athleteProfileProvider.future);
    } catch (_) {
      // Perfil ausente ou erro de rede — destino será resolvido depois.
    }
    unawaited(
      ref.read(athletePublicRankingProvider(user.uid).future).catchError(
            (_) => const AthletePublicRankingSnapshot(),
          ),
    );
  }

  onProgress?.call(0.92, 'TUDO PRONTO · BORA JOGAR');
  onProgress?.call(1.0, 'TUDO PRONTO · BORA JOGAR');
}

typedef RunPostLoginBootstrap =
    Future<PostLoginBootstrapResult> Function({
  PostLoginBootstrapProgress? onProgress,
});

final runPostLoginBootstrapProvider = Provider<RunPostLoginBootstrap>((ref) {
  return ({onProgress}) =>
      runPostLoginBootstrap(ref, onProgress: onProgress);
});
