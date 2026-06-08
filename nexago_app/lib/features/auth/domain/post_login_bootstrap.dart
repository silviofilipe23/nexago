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

/// Duração mínima da tela de loading pós-login.
const kPostLoginBootstrapMinDuration = Duration(seconds: 3);

/// Timeout generoso para não travar a navegação.
const kPostLoginBootstrapTimeout = Duration(seconds: 15);

enum SessionBootstrapState { pending, complete }

final sessionBootstrapProvider =
    NotifierProvider<SessionBootstrapNotifier, SessionBootstrapState>(
  SessionBootstrapNotifier.new,
);

class SessionBootstrapNotifier extends Notifier<SessionBootstrapState> {
  @override
  SessionBootstrapState build() {
    ref.listen<AsyncValue<User?>>(authProvider, (previous, next) {
      final prevUser = previous?.valueOrNull;
      final nextUser = next.valueOrNull;
      if (prevUser == null && nextUser != null) {
        state = SessionBootstrapState.pending;
      }
      if (nextUser == null) {
        state = SessionBootstrapState.pending;
      }
    });
    return SessionBootstrapState.pending;
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
