import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

class AgendaNeedsYouSection extends StatelessWidget {
  const AgendaNeedsYouSection({
    super.key,
    required this.items,
    required this.onAcceptChallenge,
    required this.onDeclineChallenge,
    required this.onBookingTap,
  });

  final List<AthleteAgendaNeedsYouItem> items;
  final VoidCallback onAcceptChallenge;
  final VoidCallback onDeclineChallenge;
  final ValueChanged<String> onBookingTap;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 3,
                height: 18,
                decoration: BoxDecoration(
                  color: const Color(0xFFFF6B9D),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Precisa de você',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final item in items) ...[
            _NeedsYouCard(
              item: item,
              onAcceptChallenge: onAcceptChallenge,
              onDeclineChallenge: onDeclineChallenge,
              onBookingTap: onBookingTap,
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

class _NeedsYouCard extends StatelessWidget {
  const _NeedsYouCard({
    required this.item,
    required this.onAcceptChallenge,
    required this.onDeclineChallenge,
    required this.onBookingTap,
  });

  final AthleteAgendaNeedsYouItem item;
  final VoidCallback onAcceptChallenge;
  final VoidCallback onDeclineChallenge;
  final ValueChanged<String> onBookingTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = switch (item.kind) {
      AthleteAgendaNeedsYouKind.rankingChallenge =>
        const Color(0xFFFF6B9D),
      AthleteAgendaNeedsYouKind.partnerInvite => AppColors.pending,
      AthleteAgendaNeedsYouKind.bookingConfirmation => athleteAgendaRentalAccent,
    };

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () => _handleTap(context),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: accent.withValues(alpha: 0.45)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _StatusBadge(label: item.statusLabel, color: accent),
                  const Spacer(),
                  if (item.isMock)
                    Text(
                      'DEMO',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                item.title,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                item.subtitle,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                item.meta,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              if (item.kind == AthleteAgendaNeedsYouKind.rankingChallenge) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: onDeclineChallenge,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: context.themeColors.onSurfaceMuted,
                          side: BorderSide(
                            color: context.themeColors.surfaceRaised,
                          ),
                        ),
                        child: const Text('Recusar'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton(
                        onPressed: onAcceptChallenge,
                        style: FilledButton.styleFrom(
                          backgroundColor: accent,
                          foregroundColor: Colors.white,
                        ),
                        child: const Text('Aceitar'),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _handleTap(BuildContext context) {
    switch (item.kind) {
      case AthleteAgendaNeedsYouKind.partnerInvite:
        final inviteId = item.inviteId;
        if (inviteId != null && inviteId.isNotEmpty) {
          context.pushNamed(
            AppRouteNames.tournamentPartnerInvite,
            pathParameters: {'inviteId': inviteId},
          );
        }
      case AthleteAgendaNeedsYouKind.bookingConfirmation:
        final bookingId = item.bookingId;
        if (bookingId != null && bookingId.isNotEmpty) {
          onBookingTap(bookingId);
        }
      case AthleteAgendaNeedsYouKind.rankingChallenge:
        break;
    }
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.3,
            ),
      ),
    );
  }
}
