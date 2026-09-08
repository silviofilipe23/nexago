import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/deep_link/deep_link_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../organizer/presentation/match_ops/organizer_match_navigation.dart';
import '../../domain/followed_match.dart';
import '../../domain/followed_matches_providers.dart';
import '../../domain/tournament_match.dart';
import '../../domain/tournament_match_status.dart';
import 'tournament_match_live_badge.dart';

/// "Seguir partida": liga o placar ao vivo na tela bloqueada.
///
/// Some em partida encerrada ou cancelada — seguir jogo que acabou não faz
/// sentido e ainda encheria `followedMatches` de lixo.
///
/// O follow é MANUAL de propósito. Além da escolha de produto, é o que torna a
/// notificação elegível à promoção a Live Update no Android 16: placar
/// esportivo só qualifica quando o usuário optou por monitorar aquele jogo.
/// Ver `docs/superpowers/specs/2026-09-05-seguir-partida-tela-bloqueada-design.md`.
class FollowMatchButton extends ConsumerWidget {
  const FollowMatchButton({
    super.key,
    required this.match,
    this.compact = false,
  });

  final TournamentMatch match;

  /// Só o ícone, para caber no card. `false` mostra ícone + rótulo.
  final bool compact;

  bool get _isFollowable {
    return TournamentMatchStatus.isScheduled(match.status) ||
        TournamentMatchStatus.isInProgress(match.status);
  }

  Future<void> _toggle(BuildContext context, WidgetRef ref) async {
    final uid = ref.read(authProvider).valueOrNull?.uid.trim() ?? '';

    if (uid.isEmpty) {
      // Mesmo mecanismo do toque em push sem sessão: guarda o destino e o
      // router o consome ao sair do login.
      ref.read(pendingDeepLinkPathProvider.notifier).state =
          publicMatchLivePath(match.tournamentId, match.id);
      context.go(AppRoutes.login);
      return;
    }

    final repository = ref.read(followedMatchesRepositoryProvider);
    final following = ref.read(isFollowingMatchProvider(match.id));

    try {
      if (following) {
        await repository.unfollow(uid: uid, matchId: match.id);
      } else {
        await repository.follow(uid: uid, match: match);
      }
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não deu pra atualizar. Tente de novo.')),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!_isFollowable) return const SizedBox.shrink();

    final following = ref.watch(isFollowingMatchProvider(match.id));
    final label = following ? 'Seguindo' : 'Seguir';
    if (compact) {
      return IconButton(
        onPressed: () => _toggle(context, ref),
        tooltip: following ? 'Deixar de seguir' : 'Seguir partida',
        icon: following
            ? const TournamentMatchCardLiveDot(size: 10)
            : const Icon(Icons.notifications_none_rounded),
      );
    }

    return TextButton.icon(
      onPressed: () => _toggle(context, ref),
      icon: following
          ? const TournamentMatchCardLiveDot(size: 10)
          : const Icon(Icons.notifications_none_rounded, size: 18),
      label: Text(label),
      style: TextButton.styleFrom(
        foregroundColor: following ? AppColors.live : null,
      ),
    );
  }
}

/// Botão a partir de um [FollowedMatch] — usado onde só existe o follow, sem a
/// partida carregada (a seção "Acompanhando").
class UnfollowMatchButton extends ConsumerWidget {
  const UnfollowMatchButton({super.key, required this.followed});

  final FollowedMatch followed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return IconButton(
      tooltip: 'Deixar de seguir',
      icon: const Icon(Icons.notifications_off_outlined),
      onPressed: () async {
        final uid = ref.read(authProvider).valueOrNull?.uid.trim() ?? '';
        if (uid.isEmpty) return;
        await ref
            .read(followedMatchesRepositoryProvider)
            .unfollow(uid: uid, matchId: followed.matchId);
      },
    );
  }
}
