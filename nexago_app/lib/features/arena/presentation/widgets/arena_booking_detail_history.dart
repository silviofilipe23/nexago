import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_manager_booking.dart';
import 'arena_async_state.dart';
import 'arena_booking_detail_history_full_page.dart';
import 'arena_dashboard_tokens.dart';

class ArenaBookingDetailHistory extends StatelessWidget {
  const ArenaBookingDetailHistory({
    super.key,
    required this.historyAsync,
    required this.athleteId,
    required this.arenaId,
    required this.currentBookingId,
    required this.athleteName,
    this.onSendMessage,
  });

  final AsyncValue<List<ArenaManagerBooking>>? historyAsync;
  final String athleteId;
  final String arenaId;
  final String currentBookingId;
  final String athleteName;
  final VoidCallback? onSendMessage;

  @override
  Widget build(BuildContext context) {
    if (historyAsync == null) {
      return const _HistoryCard(
        child: Text('Dados insuficientes para carregar o histórico.'),
      );
    }

    return historyAsync!.when(
      data: (history) => _HistoryContent(
        history: history,
        athleteId: athleteId,
        arenaId: arenaId,
        currentBookingId: currentBookingId,
        athleteName: athleteName,
        onSendMessage: onSendMessage,
      ),
      loading: () => const _HistoryCard(
        child: ArenaLoadingState(label: 'Carregando histórico...'),
      ),
      error: (e, _) => _HistoryCard(
        child: Text('Não foi possível carregar o histórico.\n$e'),
      ),
    );
  }
}

class _HistoryContent extends StatelessWidget {
  const _HistoryContent({
    required this.history,
    required this.athleteId,
    required this.arenaId,
    required this.currentBookingId,
    required this.athleteName,
    this.onSendMessage,
  });

  final List<ArenaManagerBooking> history;
  final String athleteId;
  final String arenaId;
  final String currentBookingId;
  final String athleteName;
  final VoidCallback? onSendMessage;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final stats = _HistoryStats.compute(
      history: history,
      currentBookingId: currentBookingId,
    );
    final insight = _HistoryInsight.build(
      history: history,
      athleteName: athleteName,
      stats: stats,
    );

    return _HistoryCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text(
                  'Histórico do atleta',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              Text(
                'NA SUA ARENA',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                  fontSize: 10,
                ),
              ),
            ],
          ),
          SizedBox(height: 14),
          _HistoryPillStrip(filledCount: stats.pillFillCount),
          SizedBox(height: 16),
          _HistoryInsightCard(
            insight: insight,
            onSendMessage: onSendMessage,
          ),
          SizedBox(height: 16),
          Divider(
            height: 1,
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
          ),
          SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _HistoryStatColumn(
                  value: stats.reservasDisplay,
                  label: 'RESERVAS',
                ),
              ),
              Expanded(
                child: _HistoryStatColumn(
                  value: stats.noShowsDisplay,
                  label: 'NO-SHOWS',
                ),
              ),
              Expanded(
                child: _HistoryStatColumn(
                  value: stats.ultimaDisplay,
                  label: 'ÚLTIMA',
                ),
              ),
            ],
          ),
          if (history.length > 1) ...[
            SizedBox(height: 14),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () {
                  Navigator.of(context, rootNavigator: true).push(
                    MaterialPageRoute<void>(
                      builder: (_) => ArenaBookingDetailHistoryFullPage(
                        athleteId: athleteId,
                        arenaId: arenaId,
                      ),
                    ),
                  );
                },
                child: Text('Ver histórico completo'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: child,
      ),
    );
  }
}

class _HistoryPillStrip extends StatelessWidget {
  const _HistoryPillStrip({required this.filledCount});

  final int filledCount;

  static const _pillCount = 11;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < _pillCount; i++) ...[
          if (i > 0) SizedBox(width: 6),
          Expanded(
            child: Container(
              height: 18,
              decoration: BoxDecoration(
                color: i < filledCount
                    ? AppColors.brand.withValues(alpha: 0.35)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: i < filledCount
                      ? AppColors.brand.withValues(alpha: 0.5)
                      : context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                  width: 1.5,
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _HistoryInsightCard extends StatelessWidget {
  const _HistoryInsightCard({
    required this.insight,
    this.onSendMessage,
  });

  final _HistoryInsight insight;
  final VoidCallback? onSendMessage;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: AppColors.brand.withValues(alpha: 0.15),
                blurRadius: 12,
              ),
            ],
          ),
          child: Icon(
            insight.icon,
            size: 22,
            color: AppColors.brand,
          ),
        ),
        SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                insight.title,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  height: 1.3,
                ),
              ),
              if (insight.bodySpans != null) ...[
                SizedBox(height: 6),
                RichText(
                  text: TextSpan(
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w500,
                      height: 1.45,
                    ),
                    children: insight.bodySpans!(onSendMessage),
                  ),
                ),
              ] else if (insight.body != null) ...[
                SizedBox(height: 6),
                Text(
                  insight.body!,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                    height: 1.45,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _HistoryInsight {
  const _HistoryInsight({
    required this.title,
    required this.icon,
    this.body,
    this.bodySpans,
  });

  final String title;
  final IconData icon;
  final String? body;
  final List<InlineSpan> Function(VoidCallback? onTap)? bodySpans;

  static _HistoryInsight build({
    required List<ArenaManagerBooking> history,
    required String athleteName,
    required _HistoryStats stats,
  }) {
    final firstName = _firstName(athleteName);
    final canceled = history.where(_isCanceled).length;
    final total = history.length;

    if (total <= 1) {
      return _HistoryInsight(
        title: 'Primeira reserva na sua arena.',
        icon: Icons.info_outline_rounded,
        bodySpans: (onTap) => [
          TextSpan(text: '$firstName nunca jogou aqui antes. Boas-vindas conta: '),
          TextSpan(
            text: 'enviar mensagem',
            style: TextStyle(
              color: AppColors.brand,
              fontWeight: FontWeight.w800,
            ),
            recognizer: onTap != null
                ? (TapGestureRecognizer()..onTap = onTap)
                : null,
          ),
          const TextSpan(text: ' aumenta retorno em 3x.'),
        ],
      );
    }

    if (total >= 8) {
      return _HistoryInsight(
        title: 'Cliente frequente na arena.',
        icon: Icons.star_outline_rounded,
        body:
            '$firstName já tem $total reservas aqui. Vale reconhecer a fidelidade.',
      );
    }

    if (canceled >= 3 && total > 0 && (canceled / total) >= 0.35) {
      return _HistoryInsight(
        title: 'Cancela com frequência.',
        icon: Icons.warning_amber_rounded,
        body:
            '$firstName cancelou $canceled de $total reservas nesta arena. Confirme presença com antecedência.',
      );
    }

    return _HistoryInsight(
      title: '${stats.priorCount} reservas na sua arena.',
      icon: Icons.history_rounded,
      body: 'Histórico carregado para apoiar o atendimento desta reserva.',
    );
  }

  static String _firstName(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return 'O atleta';
    return parts.first;
  }
}

class _HistoryStats {
  const _HistoryStats({
    required this.priorCount,
    required this.noShows,
    required this.reservasDisplay,
    required this.noShowsDisplay,
    required this.ultimaDisplay,
    required this.pillFillCount,
  });

  final int priorCount;
  final int noShows;
  final String reservasDisplay;
  final String noShowsDisplay;
  final String ultimaDisplay;
  final int pillFillCount;

  static _HistoryStats compute({
    required List<ArenaManagerBooking> history,
    required String currentBookingId,
  }) {
    final active = history.where((b) => !_isCanceled(b)).toList();
    final prior = active
        .where((b) => b.id != currentBookingId)
        .toList(growable: false);
    final priorCount = prior.length;
    final noShows =
        history.where((b) => b.attendanceStatus == 'no_show').length;

    final isFirstVisit = priorCount == 0;

    String ultimaDisplay = '—';
    if (!isFirstVisit && prior.isNotEmpty) {
      final last = prior.first;
      final d = DateTime.tryParse(
        last.dateKey.length >= 10 ? last.dateKey.substring(0, 10) : '',
      );
      if (d != null) {
        ultimaDisplay = DateFormat('d MMM', 'pt_BR')
            .format(d)
            .replaceAll('.', '');
      }
    }

    return _HistoryStats(
      priorCount: priorCount,
      noShows: noShows,
      reservasDisplay: isFirstVisit ? '—' : '$priorCount',
      noShowsDisplay: isFirstVisit && noShows == 0 ? '—' : '$noShows',
      ultimaDisplay: ultimaDisplay,
      pillFillCount: priorCount.clamp(0, 11),
    );
  }
}

class _HistoryStatColumn extends StatelessWidget {
  const _HistoryStatColumn({
    required this.value,
    required this.label,
  });

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Text(
          value,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            height: 1,
          ),
        ),
        SizedBox(height: 6),
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
            fontSize: 10,
          ),
        ),
      ],
    );
  }
}

bool _isCanceled(ArenaManagerBooking booking) {
  final s = (booking.data['status'] as String?)?.toLowerCase().trim() ?? '';
  return s == 'cancelled' || s == 'canceled';
}
