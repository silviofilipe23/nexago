import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/squad_providers.dart';
import '../../domain/squad_models.dart';
import 'squad_ui.dart';

/// Entrada do NexaSquad na home e no perfil do atleta.
///
/// Só aparece com `appConfig/squad.enabled` ligado e quando o atleta é
/// embaixador (abre o Squad) ou tem convite em aberto (abre o convite). Fora
/// disso — inclusive carregando ou com erro — não ocupa espaço nenhum.
class SquadEntryCard extends ConsumerWidget {
  const SquadEntryCard({super.key, this.padding = EdgeInsets.zero});

  /// Respiro em volta do card; só aplicado quando ele aparece.
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final squad = ref.watch(squadEntryProvider);
    final member = squad.member;
    final invite = squad.invite;
    if (member == null && invite == null) return const SizedBox.shrink();

    final colors = context.themeColors;
    final String title;
    final String subtitle;
    final VoidCallback onTap;
    if (member != null) {
      title = 'NexaGO Squad';
      subtitle =
          '${formatBRLFromCents(member.earnings.totalCents)} '
          '${member.isPilot ? 'no piloto' : 'no ciclo'} · código ${member.code}';
      onTap = () => context.pushNamed(AppRouteNames.squad);
    } else {
      title = 'Você foi convidado pro NexaGO Squad';
      subtitle = 'Veja o convite de ${invite!.tier.label} e escolha seu código';
      onTap = () => context.pushNamed(
        AppRouteNames.squadInvite,
        pathParameters: {'inviteId': invite.id},
      );
    }

    return Padding(
      padding: padding,
      child: Material(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: const Key('squad-entry'),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              borderRadius: AppRadii.lgAll,
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.25),
              ),
              gradient: LinearGradient(
                colors: [
                  AppColors.brand.withValues(alpha: 0.10),
                  colors.surfaceCard,
                ],
                stops: const [0, 0.7],
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: SquadStyle.tint(),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    member != null
                        ? Icons.groups_rounded
                        : Icons.mail_outline_rounded,
                    color: colors.brandText,
                    size: 22,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.titleS.copyWith(
                                color: colors.onSurface,
                              ),
                            ),
                          ),
                          if (member != null) ...[
                            const SizedBox(width: 8),
                            SquadTierBadge(member.tier, small: true),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          color: SquadStyle.mute(colors),
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: SquadStyle.dim(colors),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
