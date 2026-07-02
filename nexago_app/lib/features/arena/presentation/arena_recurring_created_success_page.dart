import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../arenas/presentation/widgets/booking_success/booking_success_confetti.dart';
import '../domain/arena_recurring_created_args.dart';

/// Celebração animada após criar um horário fixo na agenda.
class ArenaRecurringCreatedSuccessPage extends StatefulWidget {
  const ArenaRecurringCreatedSuccessPage({super.key, required this.args});

  final ArenaRecurringCreatedArgs args;

  @override
  State<ArenaRecurringCreatedSuccessPage> createState() =>
      _ArenaRecurringCreatedSuccessPageState();
}

class _ArenaRecurringCreatedSuccessPageState
    extends State<ArenaRecurringCreatedSuccessPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  late final Animation<double> _heroT;
  late final Animation<double> _heroScale;
  late final Animation<double> _counterT;
  late final Animation<double> _contentT;
  late final Animation<double> _cardT;
  late final Animation<double> _actionsT;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 920),
    );

    _heroT = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.0, 0.42, curve: Curves.easeOutCubic),
    );
    _heroScale = Tween<double>(begin: 0.72, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.48, curve: Curves.easeOutCubic),
      ),
    );
    _counterT = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.18, 0.62, curve: Curves.easeOutCubic),
    );
    _contentT = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.32, 0.72, curve: Curves.easeOutCubic),
    );
    _cardT = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.46, 0.84, curve: Curves.easeOutCubic),
    );
    _actionsT = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.58, 1.0, curve: Curves.easeOutCubic),
    );

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _openDetail() {
    context.pushReplacementNamed(
      AppRouteNames.arenaRecurringDetail,
      pathParameters: {'seriesId': widget.args.seriesId},
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final args = widget.args;
    final statusBarHeight = MediaQuery.paddingOf(context).top;
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final weekdayLabel = _weekdayLabel(args.weekday);

    return Scaffold(
      backgroundColor: colors.canvas,
      body: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return Stack(
            children: [
              Positioned(
                top: -80,
                left: 0,
                right: 0,
                child: Container(
                  height: 240,
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: Alignment.topCenter,
                      radius: 1.2,
                      colors: [
                        colors.brand.withValues(alpha: 0.16),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: statusBarHeight + 280,
                child: IgnorePointer(
                  child: BookingSuccessConfetti(
                    statusBarHeight: statusBarHeight,
                  ),
                ),
              ),
              SafeArea(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _AnimatedBlock(
                              t: _heroT.value,
                              yOffset: 18,
                              child: Transform.scale(
                                scale: _heroScale.value,
                                child: _RecurringHero(accent: colors.brand),
                              ),
                            ),
                            const SizedBox(height: 28),
                            _AnimatedBlock(
                              t: _counterT.value,
                              yOffset: 14,
                              child: _ReservationCounter(
                                count: args.createdCount,
                                progress: _counterT.value,
                              ),
                            ),
                            const SizedBox(height: 20),
                            _AnimatedBlock(
                              t: _contentT.value,
                              yOffset: 12,
                              child: Column(
                                children: [
                                  Text(
                                    'Horário fixo criado',
                                    textAlign: TextAlign.center,
                                    style: AppTypography.soraRegular(
                                      fontSize: 26,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: -0.6,
                                      height: 1.15,
                                      color: colors.onSurface,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  Text(
                                    _subtitle(args),
                                    textAlign: TextAlign.center,
                                    style: AppTypography.soraRegular(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w500,
                                      color: colors.onSurfaceMuted,
                                      height: 1.45,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 24),
                            _AnimatedBlock(
                              t: _cardT.value,
                              yOffset: 10,
                              child: _SummaryCard(
                                colors: colors,
                                customerName: args.customerName,
                                courtName: args.courtName,
                                scheduleLabel:
                                    'Toda $weekdayLabel · ${args.startTime}–${args.endTime}',
                                skippedCount: args.skippedCount,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Padding(
                      padding:
                          EdgeInsets.fromLTRB(20, 0, 20, 12 + bottomInset),
                      child: _AnimatedBlock(
                        t: _actionsT.value,
                        yOffset: 8,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SizedBox(
                              height: 54,
                              child: FilledButton(
                                onPressed: _openDetail,
                                style: FilledButton.styleFrom(
                                  backgroundColor: colors.brand,
                                  foregroundColor: colors.black,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                ),
                                child: Text(
                                  'Ver horário fixo',
                                  style: AppTypography.soraRegular(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: () =>
                                  context.go(AppRoutes.arenaRecurring),
                              child: Text(
                                'Voltar à lista',
                                style: AppTypography.soraRegular(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: colors.onSurfaceMuted,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  static String _weekdayLabel(int weekday) {
    return _weekdayLabels[weekday.clamp(1, 7) - 1];
  }

  static const List<String> _weekdayLabels = [
    'segunda-feira',
    'terça-feira',
    'quarta-feira',
    'quinta-feira',
    'sexta-feira',
    'sábado',
    'domingo',
  ];

  static String _subtitle(ArenaRecurringCreatedArgs args) {
    final n = args.createdCount;
    final reservas = n == 1 ? 'reserva' : 'reservas';
    if (args.skippedCount > 0) {
      final puladas = args.skippedCount == 1 ? 'data' : 'datas';
      return '$n $reservas na agenda. ${args.skippedCount} $puladas '
          'ficaram de fora por conflito.';
    }
    return '$n $reservas já estão na agenda da arena.';
  }
}

class _AnimatedBlock extends StatelessWidget {
  const _AnimatedBlock({
    required this.t,
    required this.child,
    this.yOffset = 12,
  });

  final double t;
  final double yOffset;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: t,
      child: Transform.translate(
        offset: Offset(0, (1 - t) * yOffset),
        child: child,
      ),
    );
  }
}

class _RecurringHero extends StatelessWidget {
  const _RecurringHero({required this.accent});

  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 116,
            height: 116,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: accent.withValues(alpha: 0.38),
                  blurRadius: 36,
                  spreadRadius: 4,
                ),
              ],
            ),
          ),
          Container(
            width: 92,
            height: 92,
            decoration: BoxDecoration(
              color: accent,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.event_repeat_rounded,
              size: 46,
              color: AppColors.black,
            ),
          ),
        ],
      ),
    );
  }
}

class _ReservationCounter extends StatelessWidget {
  const _ReservationCounter({
    required this.count,
    required this.progress,
  });

  final int count;
  final double progress;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final value = (count * progress).round().clamp(0, count);
    final fontSize = 44 + (12 * progress);

    return Column(
      children: [
        Text(
          '$value',
          style: AppTypography.soraRegular(
            fontSize: fontSize,
            fontWeight: FontWeight.w800,
            letterSpacing: -1.2,
            color: colors.brand,
            height: 1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          count == 1 ? 'reserva criada' : 'reservas criadas',
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
            color: colors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.colors,
    required this.customerName,
    required this.courtName,
    required this.scheduleLabel,
    required this.skippedCount,
  });

  final AppThemeColors colors;
  final String customerName;
  final String courtName;
  final String scheduleLabel;
  final int skippedCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.outline.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SummaryRow(
            icon: Icons.person_outline_rounded,
            label: customerName,
            colors: colors,
          ),
          const SizedBox(height: 12),
          _SummaryRow(
            icon: Icons.sports_tennis_rounded,
            label: courtName,
            colors: colors,
          ),
          const SizedBox(height: 12),
          _SummaryRow(
            icon: Icons.schedule_rounded,
            label: scheduleLabel,
            colors: colors,
          ),
          if (skippedCount > 0) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.pending.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                skippedCount == 1
                    ? '1 data com conflito não foi incluída.'
                    : '$skippedCount datas com conflito não foram incluídas.',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurface,
                  height: 1.35,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.icon,
    required this.label,
    required this.colors,
  });

  final IconData icon;
  final String label;
  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: colors.onSurfaceMuted),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: colors.onSurface,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}
