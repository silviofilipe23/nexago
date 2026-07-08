import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../domain/friendly_match_models.dart';
import '../../domain/friendly_match_providers.dart';

/// Card-resumo do Bora Jogar usado na Comunidade e no Início.
///
/// Estado vivo com prioridade: convite aguardando resposta > check-in aberto
/// ou jogo próximo > avaliação pendente > CTA de descoberta. Some por inteiro
/// quando o recurso está desligado (`appConfig/friendlyMatch.enabled`).
class FriendlyMatchSummaryCard extends ConsumerWidget {
  const FriendlyMatchSummaryCard({super.key, this.margin = EdgeInsets.zero});

  final EdgeInsetsGeometry margin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(friendlyMatchConfigProvider).value;
    if (config == null || !config.enabled) return const SizedBox.shrink();

    final uid = ref.watch(authProvider).value?.uid ?? '';
    final inbox = ref.watch(friendlyMatchInboxProvider).value ?? const [];
    final active = ref.watch(friendlyMatchActiveProvider).value ?? const [];
    final colors = context.themeColors;
    final theme = Theme.of(context);

    final (title, subtitle, targetRoute) = _liveState(uid, inbox, active);

    return Padding(
      padding: margin,
      child: Material(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => context.push(targetRoute),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.sports_volleyball_rounded,
                      color: AppColors.brand),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: colors.onSurfaceMuted),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ),
      ),
    );
  }

  (String, String, String) _liveState(
    String uid,
    List<FriendlyMatch> inbox,
    List<FriendlyMatch> active,
  ) {
    if (inbox.isNotEmpty) {
      final other = inbox.first.otherName(uid);
      return (
        'Bora Jogar',
        inbox.length == 1
            ? '$other quer jogar com você — responda o convite!'
            : '${inbox.length} convites aguardando sua resposta',
        AppRoutes.friendlyMatchHub,
      );
    }

    final now = DateTime.now();
    for (final match in active) {
      if (match.status == FriendlyMatchStatus.confirmed) {
        final openAt = match.checkInOpenAt;
        if (openAt != null &&
            now.isAfter(openAt) &&
            !match.hasCheckedIn(uid)) {
          return (
            'Bora Jogar',
            'Check-in aberto para o jogo com ${match.otherName(uid)}!',
            AppRoutes.friendlyMatchDetail.replaceFirst(':matchId', match.id),
          );
        }
        final when =
            DateFormat("EEE d/MM 'às' HH:mm", 'pt_BR').format(match.scheduledAt.toLocal());
        return (
          'Bora Jogar',
          'Jogo com ${match.otherName(uid)} $when',
          AppRoutes.friendlyMatchDetail.replaceFirst(':matchId', match.id),
        );
      }
      if (match.status == FriendlyMatchStatus.completed &&
          !match.hasReviewed(uid)) {
        return (
          'Bora Jogar',
          'Avalie seu jogo com ${match.otherName(uid)}',
          AppRoutes.friendlyMatchDetail.replaceFirst(':matchId', match.id),
        );
      }
    }

    return (
      'Bora Jogar',
      'Encontre alguém do seu nível e marque um jogo.',
      AppRoutes.friendlyMatchHub,
    );
  }
}
