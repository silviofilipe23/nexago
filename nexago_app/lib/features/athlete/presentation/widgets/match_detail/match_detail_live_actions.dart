import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/deep_link/deep_link_providers.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../organizer/presentation/match_ops/organizer_match_navigation.dart';
import '../../../../tournaments/domain/followed_matches_providers.dart';
import '../../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_status.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_share_section.dart';

/// Card "AO VIVO" + timer de duração do jogo + aviso de placar em tempo real.
class MatchDetailLiveStatusCard extends StatefulWidget {
  const MatchDetailLiveStatusCard({
    super.key,
    required this.detail,
    this.matchStartedAt,
    this.liveElapsedSec = 0,
  });

  final AthleteMatchDetail detail;

  /// Início real da partida — preferido para o timer tickando.
  final DateTime? matchStartedAt;

  /// Fallback quando ainda não há [matchStartedAt] no documento.
  final int liveElapsedSec;

  @override
  State<MatchDetailLiveStatusCard> createState() =>
      _MatchDetailLiveStatusCardState();
}

class _MatchDetailLiveStatusCardState extends State<MatchDetailLiveStatusCard> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _syncTicker();
  }

  @override
  void didUpdateWidget(covariant MatchDetailLiveStatusCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.matchStartedAt != widget.matchStartedAt) {
      _syncTicker();
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _syncTicker() {
    _ticker?.cancel();
    _ticker = null;
    if (widget.matchStartedAt == null) return;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final timer = liveMatchDurationLabel(
      matchStartedAt: widget.matchStartedAt,
      liveElapsedSec: widget.liveElapsedSec,
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: AppColors.live,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'AO VIVO',
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.live,
                      letterSpacing: 0.4,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    timer,
                    style: AppTypography.mono(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: context.themeColors.onSurfaceMuted,
                      letterSpacing: 0.3,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: AppColors.brand.withValues(alpha: 0.28),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.cell_tower_rounded,
                      size: 20,
                      color: AppColors.brand,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Placar atualizado em tempo real pela organização.',
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: context.themeColors.onSurface,
                          fontWeight: FontWeight.w600,
                          height: 1.35,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Dupla de ações do protótipo: seguir partida + compartilhar.
class MatchDetailLiveActionsRow extends ConsumerWidget {
  const MatchDetailLiveActionsRow({
    super.key,
    required this.detail,
    this.showFollow = true,
  });

  final AthleteMatchDetail detail;
  final bool showFollow;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final match =
        ref.watch(matchDetailTournamentMatchProvider(detail.id)).valueOrNull;

    final shareCard = _ActionCard(
      icon: Icons.ios_share_rounded,
      title: 'Compartilhar',
      subtitle: 'Enviar para amigos',
      onTap: () {
        final poster = detail.sharePoster;
        if (poster != null) {
          showMatchDetailShareSheet(context, poster);
        } else {
          showAppSnackBar(context, 'Em breve.');
        }
      },
    );

    if (!showFollow) {
      return shareCard;
    }

    return Row(
      children: [
        Expanded(child: _FollowActionCard(match: match)),
        const SizedBox(width: 8),
        Expanded(child: shareCard),
      ],
    );
  }
}

/// Stream cru da partida — timer AO VIVO e botão seguir.
final matchDetailTournamentMatchProvider =
    StreamProvider.autoDispose.family<TournamentMatch?, String>((ref, matchId) {
  final id = matchId.trim();
  if (id.isEmpty) return Stream<TournamentMatch?>.value(null);
  return ref.watch(tournamentMatchesRepositoryProvider).watchById(id);
});

class _FollowActionCard extends ConsumerWidget {
  const _FollowActionCard({required this.match});

  final TournamentMatch? match;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final m = match;
    final followable = m != null &&
        (TournamentMatchStatus.isScheduled(m.status) ||
            TournamentMatchStatus.isInProgress(m.status));
    final following =
        m == null ? false : ref.watch(isFollowingMatchProvider(m.id));

    return _ActionCard(
      icon: following
          ? Icons.bookmark_rounded
          : Icons.bookmark_border_rounded,
      title: following ? 'Seguindo' : 'Seguir partida',
      subtitle: 'Receba notificações',
      accent: following ? AppColors.live : AppColors.brand,
      onTap: () {
        if (m == null) {
          showAppSnackBar(context, 'Carregando partida…');
          return;
        }
        if (!followable) {
          showAppSnackBar(context, 'Só dá pra seguir partidas em andamento.');
          return;
        }
        _toggleFollow(context, ref, m);
      },
    );
  }

  Future<void> _toggleFollow(
    BuildContext context,
    WidgetRef ref,
    TournamentMatch match,
  ) async {
    final uid = ref.read(authProvider).valueOrNull?.uid.trim() ?? '';
    if (uid.isEmpty) {
      ref.read(pendingDeepLinkPathProvider.notifier).state =
          publicMatchLivePath(match.tournamentId, match.id);
      if (context.mounted) context.go(AppRoutes.login);
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
      showAppSnackBar(context, 'Não deu pra atualizar. Tente de novo.');
    }
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.accent = AppColors.brand,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
              ),
              child: Row(
                children: [
                  Icon(icon, size: 18, color: accent),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          title,
                          style: theme.textTheme.labelLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          subtitle,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            fontWeight: FontWeight.w600,
                            fontSize: 10,
                            height: 1.2,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
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

String formatLiveElapsed(int liveElapsedSec) {
  final sec = liveElapsedSec < 0 ? 0 : liveElapsedSec;
  final m = sec ~/ 60;
  final s = sec % 60;
  return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
}

/// Duração do jogo ao vivo: [matchStartedAt] → agora; senão [liveElapsedSec].
String liveMatchDurationLabel({
  DateTime? matchStartedAt,
  int liveElapsedSec = 0,
  DateTime? now,
}) {
  if (matchStartedAt != null) {
    final clock = now ?? DateTime.now();
    return formatLiveElapsed(clock.difference(matchStartedAt).inSeconds);
  }
  return formatLiveElapsed(liveElapsedSec);
}
