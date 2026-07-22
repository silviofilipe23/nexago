import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../arenas/domain/arenas_providers.dart';
import '../../../../arenas/domain/booking_providers.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';
import '../../booking_details_page.dart';
import 'agenda_card_decoration.dart';

class AgendaTimelineSectionHeader extends StatelessWidget {
  const AgendaTimelineSectionHeader({
    super.key,
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = context.themeColors.onSurfaceMuted;
    final lineColor = context.themeColors.surfaceRaised;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 3,
            height: 22,
            decoration: BoxDecoration(
              color: AppColors.brand,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Container(height: 1, color: lineColor)),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              subtitle.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
              style: theme.textTheme.labelSmall?.copyWith(
                color: muted,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                fontSize: 10,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AgendaTimelineRow extends ConsumerWidget {
  const AgendaTimelineRow({
    super.key,
    required this.row,
    required this.highlightNextId,
    required this.onCancelBooking,
  });

  final AthleteAgendaTimelineRow row;
  final String? highlightNextId;
  final Future<void> Function(AthleteAgendaRentalPayload rental)
  onCancelBooking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final item = row.item;
    final timeLabel = formatAgendaTimelineTimeLabel(item);
    final dateLabel = DateFormat('dd/MM', 'pt_BR').format(item.startsAt);
    final accent = item.accentColor;
    final highlighted = highlightNextId == item.id;

    return Padding(
      padding: const EdgeInsets.only(left: 16, right: 16, bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 52,
            child: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    timeLabel,
                    style: AppTypography.mono(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color:
                          item.rental?.stage ==
                              AthleteAgendaBookingStage.current
                          ? accent
                          : context.themeColors.onSurface,
                    ),
                  ),
                  Text(
                    dateLabel,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
          SizedBox(
            width: 28,
            child: Column(
              children: [
                Container(
                  width: 2,
                  height: 12,
                  color: row.isFirst
                      ? Colors.transparent
                      : context.themeColors.surfaceRaised,
                ),
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: accent,
                    boxShadow:
                        item.rental?.stage == AthleteAgendaBookingStage.current
                        ? [
                            BoxShadow(
                              color: accent.withValues(alpha: 0.35),
                              blurRadius: 10,
                            ),
                          ]
                        : null,
                  ),
                ),
                Container(
                  width: 2,
                  height: 200,
                  color: row.isLast
                      ? Colors.transparent
                      : context.themeColors.surfaceRaised,
                ),
              ],
            ),
          ),
          Expanded(
            child: _AgendaTimelineCard(
              item: item,
              highlighted: highlighted,
              onCancelBooking: onCancelBooking,
            ),
          ),
        ],
      ),
    );
  }
}

class _AgendaTimelineCard extends ConsumerWidget {
  const _AgendaTimelineCard({
    required this.item,
    required this.highlighted,
    required this.onCancelBooking,
  });

  final AthleteAgendaItem item;
  final bool highlighted;
  final Future<void> Function(AthleteAgendaRentalPayload rental)
  onCancelBooking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return switch (item.kind) {
      AthleteAgendaItemKind.rental => _RentalCard(
        item: item,
        highlighted: highlighted,
      ),
      AthleteAgendaItemKind.tournament => _TournamentCard(item: item),
      AthleteAgendaItemKind.challenge => _ChallengeCard(item: item),
      AthleteAgendaItemKind.friendlyMatch => _FriendlyMatchCard(item: item),
      AthleteAgendaItemKind.clubSession => _ClubSessionCard(item: item),
    };
  }
}

class _ClubSessionCard extends StatelessWidget {
  const _ClubSessionCard({required this.item});

  final AthleteAgendaItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = item.accentColor;
    final sessionId = item.clubSession?.sessionId;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: sessionId == null
            ? null
            : () => context.push('/clubinho/$sessionId'),
        borderRadius: BorderRadius.circular(agendaTimelineCardRadius),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: agendaTimelineCardDecoration(
            kind: AthleteAgendaItemKind.clubSession,
            accent: accent,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _KindBadge(label: 'CLUBINHO', color: accent),
                  const Spacer(),
                  Text(
                    item.statusLabel,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: accent,
                      fontWeight: FontWeight.w800,
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
            ],
          ),
        ),
      ),
    );
  }
}

class _RentalCard extends ConsumerWidget {
  const _RentalCard({required this.item, required this.highlighted});

  final AthleteAgendaItem item;
  final bool highlighted;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rental = item.rental!;
    final theme = Theme.of(context);
    final stage = rental.stage;
    final isCanceled = stage == AthleteAgendaBookingStage.canceled;
    final isFuture = stage == AthleteAgendaBookingStage.future;
    final endHour = DateFormat('HH:mm', 'pt_BR').format(rental.endAt);
    final startHour = DateFormat('HH:mm', 'pt_BR').format(rental.startAt);
    final arenaAsync = rental.arenaId == null
        ? null
        : ref.watch(arenaByIdProvider(rental.arenaId!));
    final managedArenaName = arenaAsync?.valueOrNull?.name.trim();
    final displayArenaName =
        rental.arenaName.trim().isNotEmpty && rental.arenaName.trim() != 'Arena'
        ? rental.arenaName.trim()
        : (managedArenaName != null && managedArenaName.isNotEmpty
              ? managedArenaName
              : 'Arena');

    final partnerName = rental.partnerName;
    final partnerInitials = rental.partnerInitials ?? '??';
    final showPartner = partnerName != null && partnerName.isNotEmpty;
    final showWeather = rental.startAt.hour >= 17 && !isCanceled;
    final showTravel = isFuture && !isCanceled;
    final showActions = isFuture && !isCanceled;
    final payLabel = agendaRentalPaymentButtonLabel(rental.amountReais);
    final accent = item.accentColor;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _openBookingDetails(context, rental),
        borderRadius: BorderRadius.circular(agendaTimelineCardRadius),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 260),
          padding: const EdgeInsets.all(16),
          decoration: agendaTimelineCardDecoration(
            kind: AthleteAgendaItemKind.rental,
            accent: accent,
            highlighted: highlighted,
            isCanceled: isCanceled,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _OutlinedKindBadge(
                    label: 'ALUGUEL',
                    icon: Icons.add_circle_outline,
                    color: accent,
                  ),
                  const Spacer(),
                  // if (highlighted) ...[
                  //   _MiniPill(label: 'Próximo', color: AppColors.brand),
                  //   const SizedBox(width: 6),
                  // ],
                  Text(
                    item.statusLabel.toUpperCase(),
                    style: AppTypography.mono(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: accent,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                displayArenaName,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  fontSize: 20,
                  color: context.themeColors.onSurface,
                  letterSpacing: -0.3,
                  decoration: isCanceled ? TextDecoration.lineThrough : null,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                item.subtitle,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Icon(
                    Icons.calendar_today_outlined,
                    size: 15,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '$startHour - $endHour',
                    style: AppTypography.mono(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  if (showPartner) ...[
                    const SizedBox(width: 14),
                    _PartnerChip(initials: partnerInitials, name: partnerName),
                  ],
                  const Spacer(),
                  // if (showWeather)
                  //   _WeatherPill(
                  //     temperature: '22°',
                  //     color: athleteAgendaTournamentAccent,
                  //   ),
                ],
              ),
              if (showTravel) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Icon(
                      Icons.place_outlined,
                      size: 15,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '14 min · car',
                      style: AppTypography.mono(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ],
              if (showActions) ...[
                const SizedBox(height: 14),
                Row(
                  children: [
                    // Expanded(
                    //   child: OutlinedButton.icon(
                    //     onPressed: () => _openBookingDetails(context, rental),
                    //     icon: Icon(
                    //       Icons.person_add_outlined,
                    //       size: 18,
                    //       color: context.themeColors.onSurface,
                    //     ),
                    //     label: Text(
                    //       'Convidar +1',
                    //       style: theme.textTheme.labelLarge?.copyWith(
                    //         fontWeight: FontWeight.w700,
                    //         color: context.themeColors.onSurface,
                    //       ),
                    //     ),
                    //     style: OutlinedButton.styleFrom(
                    //       backgroundColor: context.themeColors.surfaceRaised,
                    //       padding: const EdgeInsets.symmetric(vertical: 12),
                    //       side: BorderSide(
                    //         color: context.themeColors.surfaceRaised,
                    //       ),
                    //       shape: RoundedRectangleBorder(
                    //         borderRadius: BorderRadius.circular(12),
                    //       ),
                    //     ),
                    //   ),
                    // ),
                    if (rental.needsPayment) ...[
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 2,
                        child: FilledButton.icon(
                          onPressed: () => _openBookingDetails(context, rental),
                          icon: const Icon(
                            Icons.account_balance_wallet_outlined,
                            size: 18,
                            color: AppColors.black,
                          ),
                          label: Text(
                            payLabel ?? 'Pagar',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 14,
                              color: AppColors.black,
                            ),
                          ),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brand,
                            foregroundColor: AppColors.black,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _openBookingDetails(
    BuildContext context,
    AthleteAgendaRentalPayload rental,
  ) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BookingDetailsPage(
          bookingId: rental.bookingId,
          arenaId: rental.arenaId,
          arenaName: rental.arenaName,
          courtName: rental.courtName,
          startAt: rental.startAt,
          endAt: rental.endAt,
          status: rental.rawStatus,
          confirmedParticipants: rental.confirmedParticipants,
          amountReais: rental.amountReais,
          paymentType: rental.paymentType,
        ),
      ),
    );
  }
}

void _openAgendaTournamentBracket(
  BuildContext context,
  AthleteAgendaTournamentPayload tournament,
) {
  final tournamentId = tournament.tournamentId.trim();
  final categoryId = tournament.categoryId.trim();
  if (tournamentId.isEmpty) {
    showAppSnackBar(context, 'Torneio indisponível.');
    return;
  }
  if (categoryId.isEmpty) {
    showAppSnackBar(context, 'Categoria indisponível. Abrindo detalhes do torneio.');
    _openAgendaTournamentDetail(context, tournamentId);
    return;
  }
  context.pushNamed(
    AppRouteNames.tournamentDoubleEliminationBracket,
    pathParameters: {
      'tournamentId': tournamentId,
      'categoryId': categoryId,
    },
  );
}

void _openAgendaTournamentDetail(BuildContext context, String tournamentId) {
  final id = tournamentId.trim();
  if (id.isEmpty) {
    showAppSnackBar(context, 'Torneio indisponível.');
    return;
  }
  context.pushNamed(
    AppRouteNames.tournamentDetail,
    pathParameters: {'tournamentId': id},
  );
}

class _TournamentCard extends StatelessWidget {
  const _TournamentCard({required this.item});

  final AthleteAgendaItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tournament = item.tournament!;
    final isLive = tournament.isLive;
    final accent = isLive ? AppColors.live : item.accentColor;

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(agendaTimelineCardRadius),
      clipBehavior: Clip.antiAlias,
      child: Container(
        decoration: agendaTimelineCardDecoration(
          kind: AthleteAgendaItemKind.tournament,
          accent: accent,
          isLive: isLive,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () =>
                    _openAgendaTournamentDetail(context, tournament.tournamentId),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          _KindBadge(label: 'TORNEIO', color: accent),
                          const SizedBox(width: 6),
                          if (isLive)
                            _MiniPill(label: 'AO VIVO', color: AppColors.live),
                          const Spacer(),
                          Text(
                            item.statusLabel.toUpperCase(),
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: accent,
                              fontWeight: FontWeight.w800,
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
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Row(
                children: [
                  if (isLive) ...[
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () =>
                            _openAgendaTournamentBracket(context, tournament),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.live,
                          side: BorderSide(
                            color: AppColors.live.withValues(alpha: 0.5),
                          ),
                        ),
                        child: const Text('Bracket'),
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _openAgendaTournamentDetail(
                        context,
                        tournament.tournamentId,
                      ),
                      child: const Text('Ver torneio'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChallengeCard extends StatelessWidget {
  const _ChallengeCard({required this.item});

  final AthleteAgendaItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = item.accentColor;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(
              const SnackBar(content: Text('Desafios em breve no app.')),
            );
        },
        borderRadius: BorderRadius.circular(agendaTimelineCardRadius),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: agendaTimelineCardDecoration(
            kind: AthleteAgendaItemKind.challenge,
            accent: accent,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _KindBadge(label: 'DESAFIO', color: accent),
                  const Spacer(),
                  Text(
                    item.statusLabel,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: accent,
                      fontWeight: FontWeight.w800,
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
              const SizedBox(height: 8),
              Text(
                '#5 → #4 · H2H 2-1',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: accent,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () {
                  ScaffoldMessenger.of(context)
                    ..hideCurrentSnackBar()
                    ..showSnackBar(
                      const SnackBar(content: Text('Chat em breve.')),
                    );
                },
                icon: const Icon(Icons.chat_bubble_outline, size: 18),
                label: const Text('Combinar no chat'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: accent,
                  side: BorderSide(color: accent.withValues(alpha: 0.45)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Jogo do Bora Jogar na agenda — leva ao detalhe do match.
class _FriendlyMatchCard extends StatelessWidget {
  const _FriendlyMatchCard({required this.item});

  final AthleteAgendaItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = item.accentColor;
    final matchId = item.friendlyMatch?.matchId;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: matchId == null
            ? null
            : () => context.push('/bora-jogar/$matchId'),
        borderRadius: BorderRadius.circular(agendaTimelineCardRadius),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: agendaTimelineCardDecoration(
            kind: AthleteAgendaItemKind.friendlyMatch,
            accent: accent,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _KindBadge(label: 'BORA JOGAR', color: accent),
                  const Spacer(),
                  Text(
                    item.statusLabel,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: accent,
                      fontWeight: FontWeight.w800,
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
            ],
          ),
        ),
      ),
    );
  }
}

class _OutlinedKindBadge extends StatelessWidget {
  const _OutlinedKindBadge({
    required this.label,
    required this.icon,
    required this.color,
  });

  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.65)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
              fontSize: 10,
            ),
          ),
        ],
      ),
    );
  }
}

class _PartnerChip extends StatelessWidget {
  const _PartnerChip({required this.initials, required this.name});

  final String initials;
  final String name;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: Color(0xFF6B4C9A),
            shape: BoxShape.circle,
          ),
          child: Text(
            initials,
            style: theme.textTheme.labelSmall?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 10,
            ),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          name,
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurface,
          ),
        ),
      ],
    );
  }
}

class _WeatherPill extends StatelessWidget {
  const _WeatherPill({required this.temperature, required this.color});

  final String temperature;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.nightlight_round, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            temperature,
            style: AppTypography.mono(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _KindBadge extends StatelessWidget {
  const _KindBadge({required this.label, required this.color});

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

class _MiniPill extends StatelessWidget {
  const _MiniPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

Future<void> cancelAgendaBooking(
  WidgetRef ref,
  BuildContext context,
  AthleteAgendaRentalPayload rental,
) async {
  final uid = ref.read(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) return;
  try {
    await ref
        .read(bookingServiceProvider)
        .cancelBooking(bookingId: rental.bookingId, athleteId: uid);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Reserva cancelada.')));
  } catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('Não foi possível cancelar: $e')));
  }
}
