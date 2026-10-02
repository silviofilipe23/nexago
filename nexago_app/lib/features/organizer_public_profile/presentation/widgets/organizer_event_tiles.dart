import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/rebuild_at.dart';
import '../../../tournaments/data/tournament_inscriptions_repository.dart';
import '../../../tournaments/domain/tournament_category_spots.dart';
import '../../../tournaments/domain/tournament_detail_logic.dart';
import '../../../tournaments/domain/tournament_discovery_labels.dart';
import '../../domain/organizer_event.dart';
import '../../domain/organizer_public_profile_logic.dart';

/// Card de evento próximo: selo, tipo, nome, data, local, barra de vagas (contagem real de
/// `inscriptions`), preço e CTA. Tocar em qualquer parte leva ao evento.
class OrganizerUpcomingEventCard extends ConsumerWidget {
  const OrganizerUpcomingEventCard({
    super.key,
    required this.event,
    required this.onOpen,
  });

  final OrganizerEvent event;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // `watch` aqui, no build do consumer — dentro do builder do RebuildAt rodaria no ciclo de
    // outro elemento.
    final countsAsync = ref.watch(
      tournamentCategoryEnrollmentCountsProvider(event.id),
    );
    final stats = tournamentDetailStats(
      event.detail,
      enrollmentByCategoryId: countsAsync.valueOrNull ?? const <String, int>{},
      enrollmentCountsResolved: countsAsync.hasValue,
    );

    // "Em breve" vira "Inscrições abertas" sozinho na hora marcada.
    return RebuildAt(
      instant: event.detail.registrationOpensAt,
      builder: (context, now) => _buildCard(
        context,
        enrolled: stats.spotsEnrolled,
        capacity: stats.spotsTotal,
        now: now,
      ),
    );
  }

  Widget _buildCard(
    BuildContext context, {
    required int enrolled,
    required int capacity,
    required DateTime now,
  }) {
    final colors = context.themeColors;
    final detail = event.detail;
    final badge = organizerEventBadge(
      event,
      enrolled: enrolled,
      capacity: capacity,
      now: now,
    );
    final register = organizerEventCtaIsRegister(badge);
    final price = organizerEventPriceLabel(detail);
    final fill = organizerEventFill(enrolled: enrolled, capacity: capacity);

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: colors.onSurfaceMuted.withValues(alpha: 0.14),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              OrganizerEventBadgeChip(badge: badge),
              const SizedBox(height: 12),
              Text(
                organizerEventTypeLabel(detail).toUpperCase(),
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurfaceMuted,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                detail.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 8),
              _MetaLine(
                icon: Icons.calendar_today_outlined,
                text: organizerEventDateLabel(detail, withYear: false),
              ),
              const SizedBox(height: 4),
              _MetaLine(icon: Icons.place_outlined, text: detail.location),
              if (capacity > 0) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: fill,
                          minHeight: 5,
                          backgroundColor: colors.surfaceRaised,
                          color: badge == OrganizerEventBadge.live
                              ? colors.onSurfaceMuted
                              : AppColors.brand,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      '$enrolled/$capacity',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: price == null
                        ? const SizedBox.shrink()
                        : Text(
                            price,
                            style: AppTypography.soraRegular(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                  ),
                  const SizedBox(width: 10),
                  register
                      ? FilledButton(
                          onPressed: onOpen,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brand,
                            foregroundColor: AppColors.black,
                            minimumSize: const Size(0, 38),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          child: const Text('Inscrever'),
                        )
                      : OutlinedButton(
                          onPressed: onOpen,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: colors.onSurface,
                            minimumSize: const Size(0, 38),
                            side: BorderSide(
                              color: colors.onSurfaceMuted.withValues(
                                alpha: 0.3,
                              ),
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          child: const Text('Acompanhar'),
                        ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class OrganizerEventBadgeChip extends StatelessWidget {
  const OrganizerEventBadgeChip({super.key, required this.badge});

  final OrganizerEventBadge badge;

  @override
  Widget build(BuildContext context) {
    final color = switch (badge) {
      OrganizerEventBadge.registrationOpen => AppColors.win,
      OrganizerEventBadge.lastSpots => AppColors.pending,
      OrganizerEventBadge.live => AppColors.live,
      OrganizerEventBadge.comingSoon => AppColors.brand,
      OrganizerEventBadge.registrationClosed =>
        context.themeColors.onSurfaceMuted,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Text(
        badge.label.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

/// Linha de evento realizado: nome, esporte, data e — no histórico da Visão geral — o número
/// de duplas e os campeões da primeira categoria.
class OrganizerCompletedEventRow extends ConsumerWidget {
  const OrganizerCompletedEventRow({
    super.key,
    required this.event,
    required this.championNames,
    required this.onOpen,
    this.showEntries = false,
  });

  final OrganizerEvent event;
  final Map<String, String> championNames;
  final VoidCallback onOpen;

  /// Liga a contagem viva de inscrições. Fica só no histórico curto (3 linhas): na aba
  /// Eventos seriam dezenas de consultas abertas para um número secundário.
  final bool showEntries;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final detail = event.detail;
    String? entries;
    if (showEntries) {
      final countsAsync = ref.watch(
        tournamentCategoryEnrollmentCountsProvider(event.id),
      );
      if (countsAsync.hasValue) {
        entries = tournamentEnrolledEntriesLabel(
          tournamentEnrolledEntries(
            offers: detail.categoryOffers,
            counts: countsAsync.value!,
            countsResolved: true,
            fallbackEnrolled: detail.enrolledCount,
          ),
          detail.format,
        );
      }
    }
    final champion = organizerEventChampionLine(event, championNames);
    final sport = detail.sport.trim();

    return InkWell(
      onTap: onOpen,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    detail.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      organizerEventDateLabel(detail),
                      if (sport.isNotEmpty) organizerSportLabel(sport),
                    ].join(' · '),
                    style: AppTypography.soraRegular(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                  if (entries != null || champion != null) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        if (champion != null) ...[
                          const Icon(
                            Icons.emoji_events_outlined,
                            size: 14,
                            color: AppColors.pending,
                          ),
                          const SizedBox(width: 4),
                        ],
                        Flexible(
                          child: Text(
                            [
                              if (entries != null) entries,
                              if (champion != null) champion,
                            ].join(' · '),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
          ],
        ),
      ),
    );
  }
}

class _MetaLine extends StatelessWidget {
  const _MetaLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    return Row(
      children: [
        Icon(icon, size: 14, color: muted),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: muted,
            ),
          ),
        ),
      ],
    );
  }
}
