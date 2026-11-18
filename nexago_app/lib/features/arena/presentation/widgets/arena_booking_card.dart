import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arenas/domain/booking_players.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/arena_booking_card_pills.dart';
import '../../domain/arena_booking_day_timeline.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_bookings_grouping.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/arena_slot_detail_providers.dart';
import 'arena_booking_card_actions.dart';
import 'arena_dashboard_tokens.dart';
import 'arena_now_booking_label.dart';

/// Azul de aula/professor no tema claro (o #5B9BFF do escuro fica a ~2,6:1
/// no branco).
const Color _blueOnLight = Color(0xFF2F5BD3);

/// Avatares de convidados mostrados antes do contador "+N".
const int _maxGuestAvatars = 2;

/// Card de uma reserva na aba Reservas.
///
/// Separa os três eixos (pagamento, presença e tipo) em selos com ícone,
/// texto e cor; mostra quanto falta receber; e, quando [showActions], põe
/// Check-in, Receber e Conversar no próprio card.
class ArenaBookingCard extends ConsumerWidget {
  const ArenaBookingCard({
    super.key,
    required this.booking,
    this.now,
    this.phase = ArenaTimelinePhase.upcoming,
    this.progress = 0,
    this.minutesLeft,
    this.showActions = false,
  });

  final ArenaManagerBooking booking;

  /// Relógio da linha do dia (presença: "Chega em", "Atrasado").
  final DateTime? now;

  final ArenaTimelinePhase phase;

  /// Quanto da reserva em quadra já passou (só em [ArenaTimelinePhase.live]).
  final double progress;
  final int? minutesLeft;

  /// Ações rápidas: só na linha de hoje e em reserva ativa.
  final bool showActions;

  bool get _isLive => phase == ArenaTimelinePhase.live;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final clock = now ?? DateTime.now();
    final amount = ArenaBookingsGrouping.amountReais(booking.data);
    final due = arenaBookingDueReais(booking);
    final payment = arenaBookingPaymentPill(booking);
    final presence = arenaBookingPresencePill(booking, now: clock);
    final pills = [
      if (payment != null) payment,
      if (presence != null) presence,
      ...arenaBookingTypePills(booking),
    ];
    final duration =
        arenaBookingDurationLabel(booking.startTime, booking.endTime);

    final decoration = ArenaDashboardTokens.cardDecoration(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: Key('arena-booking-card-${booking.id}'),
        onTap: () => _open(context),
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        child: Ink(
          decoration: _isLive
              ? decoration.copyWith(
                  border: Border.all(
                    color: AppColors.brand.withValues(alpha: 0.6),
                    width: 1.4,
                  ),
                )
              : decoration,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_isLive) ...[
                  _LiveHeader(minutesLeft: minutesLeft),
                  const SizedBox(height: 10),
                ],
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      booking.startTime,
                      style: AppTypography.mono(
                        fontSize: 18,
                        color: colors.onSurface,
                        letterSpacing: -0.3,
                        height: 1.1,
                      ),
                    ),
                    const SizedBox(width: 6),
                    // Flexível: em card estreito a duração encolhe antes do
                    // valor (o que o balcão precisa ler).
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          duration.isEmpty
                              ? '–${booking.endTime}'
                              : '–${booking.endTime} · $duration',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.mono(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ),
                    ),
                    if (amount != null) ...[
                      const SizedBox(width: 8),
                      _Amount(amount: amount, due: due),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                _WhoRow(booking: booking),
                if (pills.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [for (final p in pills) ArenaBookingPillChip(p)],
                  ),
                ],
                if (_isLive) ...[
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: progress,
                      minHeight: 4,
                      color: AppColors.brand,
                      backgroundColor: colors.surfaceRaised,
                    ),
                  ),
                ],
                if (showActions && !booking.isCanceled && !booking.isClassBlock)
                  ArenaBookingCardActions(booking: booking, dueReais: due),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _open(BuildContext context) {
    // Bloqueio de aula abre Aulas (a presença é a chamada da aula).
    if (booking.isClassBlock) {
      openArenaNowBooking(context, booking);
      return;
    }
    context.pushNamed(
      AppRouteNames.arenaBookingDetail,
      pathParameters: {'bookingId': booking.id},
      extra: booking,
    );
  }
}

class _LiveHeader extends StatelessWidget {
  const _LiveHeader({required this.minutesLeft});

  final int? minutesLeft;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final left = minutesLeft;
    return Row(
      children: [
        const ArenaBookingPillChip(
          ArenaBookingPill(
              'Em quadra', ArenaPillTone.brand, ArenaPillKind.live),
        ),
        const SizedBox(width: 8),
        if (left != null)
          Flexible(
            child: Text(
              'termina em ${arenaMinutesLabel(left)}',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: colors.onSurfaceMuted,
              ),
            ),
          ),
      ],
    );
  }
}

class _Amount extends StatelessWidget {
  const _Amount({required this.amount, required this.due});

  final double amount;
  final double? due;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final owed = due;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          formatBRL(amount),
          style: AppTypography.mono(fontSize: 14, color: colors.onSurface),
        ),
        if (owed != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              'falta ${formatBRL(owed)}',
              key: const Key('arena-booking-card-due'),
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: colors.pending,
              ),
            ),
          ),
      ],
    );
  }
}

/// Avatares do grupo + nome de quem reservou + quadra e esporte.
class _WhoRow extends ConsumerWidget {
  const _WhoRow({required this.booking});

  final ArenaManagerBooking booking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final athleteId = booking.athleteId.trim();
    // Aula mostra o nome da turma (o selo "Aula" já diz o que é).
    final fixed = booking.isClassBlock
        ? (booking.customerName ?? 'Aula')
        : arenaNowStaticWho(booking);
    final String name = fixed ??
        ref.watch(athleteDisplayLabelProvider(athleteId)).maybeWhen<String>(
              data: (v) => v,
              orElse: () => 'Carregando…',
            );
    final ownerPhoto = athleteId.isEmpty
        ? null
        : ref
            .watch(athleteProfileByIdProvider(athleteId))
            .valueOrNull
            ?.avatarUrl
            ?.trim();

    final guests = bookingGuestsOf(booking.data, ownerUid: athleteId)
        .take(_maxGuestAvatars)
        .toList();
    final rest = arenaBookingExtraPlayers(booking) - guests.length;

    final sport = arenaBookingSportLabel(booking.data);
    final where =
        sport == null ? booking.courtName : '${booking.courtName} · $sport';

    final avatars = <Widget>[
      if (booking.isClassBlock)
        const _Avatar(icon: Icons.school_rounded)
      else
        _Avatar(
          imageUrl: ownerPhoto,
          label: ArenaBookingsGrouping.athleteInitials(name),
        ),
      for (final g in guests)
        _Avatar(
          imageUrl: g.athlete.avatarUrl,
          label: ArenaBookingsGrouping.athleteInitials(
            g.athlete.displayName ?? '',
          ),
        ),
      if (rest > 0) _Avatar(label: '+$rest', neutral: true),
    ];

    return Row(
      children: [
        _AvatarStack(children: avatars),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  height: 1.25,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                where,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _AvatarStack extends StatelessWidget {
  const _AvatarStack({required this.children});

  final List<Widget> children;

  static const double size = 30;
  static const double _step = 20;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size + (children.length - 1) * _step,
      height: size,
      child: Stack(
        // Pinta do último para o primeiro: o dono fica por cima e as
        // iniciais dele não somem atrás do "+N".
        children: [
          for (var i = children.length - 1; i >= 0; i--)
            Positioned(left: i * _step, child: children[i]),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({this.imageUrl, this.label, this.icon, this.neutral = false});

  final String? imageUrl;
  final String? label;
  final IconData? icon;

  /// Contador "+N": fundo neutro do tema.
  final bool neutral;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const size = _AvatarStack.size;
    final bg = neutral
        ? colors.surfaceRaised
        : AppColors.brand.withValues(alpha: 0.22);
    final fg = neutral ? colors.onSurface : colors.brandText;
    final raw = label ?? '';
    final text = raw.length > 3 ? raw.substring(0, 3) : raw;

    Widget fallback() => Container(
          color: bg,
          alignment: Alignment.center,
          child: icon != null
              ? Icon(icon, size: 15, color: fg)
              : Text(
                  text,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    color: fg,
                  ),
                ),
        );

    final url = imageUrl?.trim();
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: colors.surfaceCard, width: 2),
      ),
      child: ClipOval(
        child: url == null || url.isEmpty
            ? fallback()
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                placeholder: (_, __) => fallback(),
                errorWidget: (_, __, ___) => fallback(),
              ),
      ),
    );
  }
}

/// Selo do card: ícone + texto + cor (nunca só a cor).
class ArenaBookingPillChip extends StatelessWidget {
  const ArenaBookingPillChip(this.pill, {super.key});

  final ArenaBookingPill pill;

  @override
  Widget build(BuildContext context) {
    final (ink, tint) = arenaPillColors(context.themeColors, pill.tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: tint,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(arenaPillIcon(pill.kind), size: 13, color: ink),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              pill.label,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                height: 1.1,
                color: ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Cor do texto (tom do tema) e do fundo (cru translúcido) de um selo.
(Color, Color) arenaPillColors(AppThemeColors colors, ArenaPillTone tone) {
  return switch (tone) {
    ArenaPillTone.ok => (colors.win, AppColors.win.withValues(alpha: 0.14)),
    ArenaPillTone.pending => (
        colors.pending,
        AppColors.pending.withValues(alpha: 0.16),
      ),
    ArenaPillTone.live => (colors.live, AppColors.live.withValues(alpha: 0.14)),
    ArenaPillTone.brand => (
        colors.brandText,
        AppColors.brand.withValues(alpha: 0.14),
      ),
    ArenaPillTone.blue => (
        colors.isDark ? ProfessorLinksStyle.blue : _blueOnLight,
        ProfessorLinksStyle.blue.withValues(alpha: 0.14),
      ),
    ArenaPillTone.muted => (colors.onSurfaceMuted, colors.surfaceRaised),
  };
}

IconData arenaPillIcon(ArenaPillKind kind) => switch (kind) {
      ArenaPillKind.paid => Icons.check_circle_rounded,
      ArenaPillKind.deposit => Icons.payments_rounded,
      ArenaPillKind.awaitingPayment => Icons.hourglass_top_rounded,
      ArenaPillKind.payOnsite => Icons.storefront_rounded,
      ArenaPillKind.paymentFailed => Icons.error_outline_rounded,
      ArenaPillKind.checkedIn => Icons.how_to_reg_rounded,
      ArenaPillKind.confirmed => Icons.thumb_up_alt_rounded,
      ArenaPillKind.arriving => Icons.directions_walk_rounded,
      ArenaPillKind.late => Icons.schedule_rounded,
      ArenaPillKind.noShow => Icons.person_off_rounded,
      ArenaPillKind.checkInPending => Icons.schedule_rounded,
      ArenaPillKind.recurring => Icons.event_repeat_rounded,
      ArenaPillKind.classBlock => Icons.school_rounded,
      ArenaPillKind.professor => Icons.school_outlined,
      ArenaPillKind.canceled => Icons.cancel_rounded,
      ArenaPillKind.live => Icons.sports_tennis_rounded,
    };
