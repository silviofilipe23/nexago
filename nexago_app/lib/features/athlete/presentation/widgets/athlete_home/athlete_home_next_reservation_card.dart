import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/card_collapse_toggle.dart';
import '../../../../../core/ui/nexa_card.dart';
import '../../../../arenas/domain/my_booking_item.dart';
import '../../../domain/athlete_booking_helpers.dart';

/// Card "Próxima reserva" da Home (paridade com o painel web): time-box com
/// dia + hora, status, valor e ações "Como chegar"/"Detalhes" — e o atalho do
/// story quando [onStoryTap] vem.
///
/// Com [initiallyExpanded] falso (Início) começa compacto: uma linha com
/// dia/hora, arena e status; a seta expande para o card inteiro.
class AthleteHomeNextReservationCard extends StatefulWidget {
  const AthleteHomeNextReservationCard({
    super.key,
    required this.booking,
    required this.onDetailsTap,
    required this.onReserveTap,
    this.onStoryTap,
    this.now,
    this.initiallyExpanded = true,
  });

  final bool initiallyExpanded;

  /// `null` = sem próxima reserva (estado vazio).
  final MyBookingItem? booking;
  final VoidCallback onDetailsTap;
  final VoidCallback onReserveTap;

  /// "Postar no story"; `null` esconde o botão (reserva ainda não garantida).
  final VoidCallback? onStoryTap;

  /// Injetável pra teste/preview determinístico.
  final DateTime? now;

  @override
  State<AthleteHomeNextReservationCard> createState() =>
      _AthleteHomeNextReservationCardState();
}

class _AthleteHomeNextReservationCardState
    extends State<AthleteHomeNextReservationCard> {
  late bool _expanded = widget.initiallyExpanded;

  void _toggle() => setState(() => _expanded = !_expanded);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final item = widget.booking;
    final now = widget.now ?? DateTime.now();

    final Widget child;
    if (item == null) {
      child = _expanded
          ? _EmptyState(onReserveTap: widget.onReserveTap)
          : _CompactEmpty(onReserveTap: widget.onReserveTap);
    } else if (_expanded) {
      child = _ReservationBody(
        booking: item,
        onDetailsTap: widget.onDetailsTap,
        onStoryTap: widget.onStoryTap,
        colors: colors,
        now: now,
        // Só quem começou compacto ganha a seta de recolher.
        onCollapse: widget.initiallyExpanded ? null : _toggle,
      );
    } else {
      child = _CompactReservation(
        booking: item,
        colors: colors,
        now: now,
        onExpand: _toggle,
      );
    }

    return NexaCard(
      side: BorderSide(color: AppColors.brand.withValues(alpha: 0.3)),
      padding: _expanded
          ? const EdgeInsets.all(AppSpacing.lg)
          : const EdgeInsets.fromLTRB(12, 10, 6, 10),
      onTap: item != null && !_expanded ? _toggle : null,
      child: AnimatedSize(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        alignment: Alignment.topCenter,
        child: child,
      ),
    );
  }
}

/// Sem reserva, compacto: uma linha e o atalho para reservar.
class _CompactEmpty extends StatelessWidget {
  const _CompactEmpty({required this.onReserveTap});

  final VoidCallback onReserveTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      key: const Key('home-next-booking-compact-empty'),
      children: [
        Icon(Icons.event_available_outlined, size: 20, color: colors.brandText),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            'Sem próxima reserva agendada.',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
        ),
        TextButton(
          onPressed: onReserveTap,
          style: TextButton.styleFrom(
            foregroundColor: colors.brandText,
            minimumSize: const Size(0, 36),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            textStyle: AppTypography.labelL,
          ),
          child: const Text('Reservar'),
        ),
      ],
    );
  }
}

/// Com reserva, compacto: dia/hora, arena · quadra e status numa linha.
class _CompactReservation extends StatelessWidget {
  const _CompactReservation({
    required this.booking,
    required this.colors,
    required this.now,
    required this.onExpand,
  });

  final MyBookingItem booking;
  final AppThemeColors colors;
  final DateTime now;
  final VoidCallback onExpand;

  @override
  Widget build(BuildContext context) {
    final start = parseBookingStart(booking);
    final status = _ReservationBody._status(booking, colors);
    final court = booking.courtName?.trim() ?? '';
    return Row(
      key: const Key('home-next-booking-compact'),
      children: [
        Container(
          width: 56,
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.12),
            borderRadius: AppRadii.mdAll,
          ),
          child: Column(
            children: [
              Text(
                (start != null
                        ? _ReservationBody._dayLabel(start, now)
                        : 'Próxima')
                    .toUpperCase(),
                maxLines: 1,
                style: AppTypography.eyebrow.copyWith(
                  color: colors.brandText,
                  fontSize: 10,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                booking.startTime,
                style: AppTypography.mono(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                  height: 1,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'PRÓXIMA RESERVA',
                style:
                    AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
              ),
              const SizedBox(height: 2),
              Text(
                court.isEmpty
                    ? booking.arenaName
                    : '${booking.arenaName} · $court',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.titleS.copyWith(
                  color: colors.onSurface,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                status.label,
                maxLines: 1,
                style: AppTypography.labelS.copyWith(
                  color: colors.readableTone(status.color),
                ),
              ),
            ],
          ),
        ),
        CardCollapseToggle(expanded: false, onTap: onExpand),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onReserveTap});

  final VoidCallback onReserveTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Sem próxima reserva agendada.',
          style: AppTypography.titleS.copyWith(color: colors.onSurface),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Assim que sua agenda começar a rodar, este card vira sua '
          'referência rápida do dia.',
          style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton(
            onPressed: onReserveTap,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              minimumSize: const Size(0, 40),
              textStyle: AppTypography.labelL,
            ),
            child: const Text('Reservar quadra'),
          ),
        ),
      ],
    );
  }
}

class _ReservationBody extends StatelessWidget {
  const _ReservationBody({
    required this.booking,
    required this.onDetailsTap,
    required this.onStoryTap,
    required this.colors,
    required this.now,
    this.onCollapse,
  });

  final MyBookingItem booking;
  final VoidCallback onDetailsTap;
  final VoidCallback? onStoryTap;
  final AppThemeColors colors;
  final DateTime now;
  final VoidCallback? onCollapse;

  /// "Hoje" / "Amanhã" / "15 abr" — o topo do bloco de horário.
  static String _dayLabel(DateTime start, DateTime now) {
    final startDay = DateTime(start.year, start.month, start.day);
    final today = DateTime(now.year, now.month, now.day);
    final diff = startDay.difference(today).inDays;
    if (diff == 0) return 'Hoje';
    if (diff == 1) return 'Amanhã';
    return DateFormat('d MMM', 'pt_BR').format(start).replaceAll('.', '');
  }

  static ({String label, Color color}) _status(
    MyBookingItem booking,
    AppThemeColors colors,
  ) {
    return switch (booking.rawStatus.trim().toUpperCase()) {
      'CONFIRMED' || 'BOOKED' || 'ACTIVE' => (
          label: 'Confirmada',
          color: AppColors.win,
        ),
      'PAY_AT_ARENA' => (label: 'Pagar na arena', color: AppColors.pending),
      'CHECKIN_OPEN' => (label: 'Check-in aberto', color: AppColors.brand),
      'PENDING_PAYMENT' => (
          label: 'Pagamento pendente',
          color: AppColors.pending,
        ),
      'PENDING' => (label: 'Em processamento', color: AppColors.brand),
      _ => (label: 'Reservada', color: colors.onSurfaceMuted),
    };
  }

  static String _caption(MyBookingItem booking, String statusLabel) {
    if (statusLabel == 'Pagar na arena' || statusLabel == 'Pagamento pendente') {
      return 'Leve um documento e chegue alguns minutos antes.';
    }
    if (booking.attendanceConfirmed) {
      return 'Presença confirmada. Bom jogo!';
    }
    return 'Acompanhe detalhes e combinados por aqui.';
  }

  Future<void> _openMaps() async {
    final query = Uri.encodeComponent(booking.arenaName);
    final url =
        Uri.parse('https://www.google.com/maps/search/?api=1&query=$query');
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final start = parseBookingStart(booking);
    final status = _status(booking, colors);
    final amount = booking.amountReais;
    final court = booking.courtName?.trim() ?? '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 74,
              padding: const EdgeInsets.symmetric(
                vertical: AppSpacing.md,
                horizontal: AppSpacing.sm,
              ),
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.12),
                borderRadius: AppRadii.mdAll,
              ),
              child: Column(
                children: [
                  Text(
                    (start != null ? _dayLabel(start, now) : 'Próxima')
                        .toUpperCase(),
                    style:
                        AppTypography.eyebrow.copyWith(color: colors.brandText),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    booking.startTime,
                    style: AppTypography.mono(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                      height: 1,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'PRÓXIMA RESERVA · ${booking.startTime} - ${booking.endTime}',
                    style: AppTypography.eyebrow
                        .copyWith(color: colors.onSurfaceMuted),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    court.isEmpty
                        ? booking.arenaName
                        : '${booking.arenaName} · $court',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style:
                        AppTypography.titleS.copyWith(color: colors.onSurface),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    _caption(booking, status.label),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS
                        .copyWith(color: colors.onSurfaceMuted),
                  ),
                ],
              ),
            ),
            if (onCollapse != null)
              Transform.translate(
                offset: const Offset(8, -8),
                child: CardCollapseToggle(
                  key: const Key('home-next-booking-collapse'),
                  expanded: true,
                  onTap: onCollapse!,
                ),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            Expanded(
              child: Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _Pill(label: status.label, color: status.color),
                  if (amount != null && amount > 0)
                    _Pill(
                      label: NumberFormat.currency(
                        locale: 'pt_BR',
                        symbol: r'R$',
                        decimalDigits: 0,
                      ).format(amount),
                      color: colors.onSurfaceMuted,
                    ),
                ],
              ),
            ),
            // Na linha das etiquetas, não na dos botões: três botões em 375 pt
            // quebravam o "Como chegar" em duas linhas.
            if (onStoryTap != null)
              Tooltip(
                message: 'Postar no story',
                child: TextButton.icon(
                  key: const Key('home-next-booking-story'),
                  onPressed: onStoryTap,
                  style: TextButton.styleFrom(
                    foregroundColor: colors.brandText,
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                    ),
                    textStyle: AppTypography.labelL,
                  ),
                  icon: const Icon(Icons.amp_stories_outlined, size: 18),
                  label: const Text('Story'),
                ),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            Expanded(
              child: FilledButton(
                onPressed: _openMaps,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  minimumSize: const Size(0, 44),
                  textStyle: AppTypography.labelL,
                ),
                child: const Text('Como chegar'),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: OutlinedButton(
                onPressed: onDetailsTap,
                style: OutlinedButton.styleFrom(
                  foregroundColor: colors.onSurface,
                  side: BorderSide(color: colors.outline),
                  minimumSize: const Size(0, 44),
                  textStyle: AppTypography.labelL,
                ),
                child: const Text('Detalhes'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm + 2,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: AppRadii.pillAll,
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: AppTypography.labelS.copyWith(
          color: context.themeColors.readableTone(color),
        ),
      ),
    );
  }
}
