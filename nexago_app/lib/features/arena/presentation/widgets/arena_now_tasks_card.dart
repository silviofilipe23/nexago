import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/arena_now.dart';
import '../../domain/comandas/arena_comanda.dart';
import 'arena_dashboard_tokens.dart';
import 'arena_now_booking_label.dart';

/// Caixa "Precisa de você": uma linha por pendência, cada uma com a ação.
class ArenaNowTasksCard extends StatelessWidget {
  const ArenaNowTasksCard({
    super.key,
    required this.tasks,
    required this.seesMoney,
    required this.now,
  });

  final List<ArenaNowTask> tasks;

  /// Relógio da aba (idade das comandas).
  final DateTime now;

  /// Valores em R$ só para quem lê o financeiro.
  final bool seesMoney;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final total = tasks.fold<int>(0, (acc, t) => acc + t.count);

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Precisa de você',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                if (total > 0)
                  Container(
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '$total',
                      style: const TextStyle(
                        color: AppColors.black,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            if (tasks.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(0, 6, 8, 10),
                child: Row(
                  children: [
                    Icon(
                      Icons.check_circle_rounded,
                      color: colors.win,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Tudo em dia. Nenhuma pendência agora.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else
              for (var i = 0; i < tasks.length; i++) ...[
                if (i > 0)
                  Divider(
                    height: 1,
                    color: colors.onSurfaceMuted.withValues(alpha: 0.12),
                  ),
                _TaskRow(task: tasks[i], seesMoney: seesMoney, now: now),
              ],
          ],
        ),
      ),
    );
  }
}

class _TaskRow extends StatelessWidget {
  const _TaskRow({
    required this.task,
    required this.seesMoney,
    required this.now,
  });

  final ArenaNowTask task;
  final bool seesMoney;
  final DateTime now;

  String _age(ArenaComanda c) {
    final opened = c.openedAt ?? c.createdAt;
    if (opened == null) return 'mais de 2h';
    return '${now.difference(opened).inHours}h';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final view = _view(context);

    return InkWell(
      onTap: () => view.onTap(context),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: view.tone.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                view.icon,
                size: 18,
                color: colors.readableTone(view.tone),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    view.title,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  if (view.subtitle != null) view.subtitle!,
                ],
              ),
            ),
            TextButton(
              onPressed: () => view.onTap(context),
              style: TextButton.styleFrom(foregroundColor: colors.brandText),
              child: Text(view.action),
            ),
          ],
        ),
      ),
    );
  }

  _TaskView _view(BuildContext context) {
    final colors = context.themeColors;
    final muted = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted);
    final money = seesMoney && task.amountReais > 0
        ? formatBRL(task.amountReais)
        : null;

    switch (task.kind) {
      case ArenaNowTaskKind.checkIn:
        final one = task.count == 1 ? task.booking : null;
        return _TaskView(
          icon: Icons.how_to_reg_rounded,
          tone: colors.live,
          title: task.count == 1
              ? 'Check-in pendente'
              : '${task.count} check-ins pendentes',
          subtitle: one != null
              ? _WhoLine(
                  prefix: '${one.courtName} · ${one.startTime} · ',
                  booking: one,
                  suffix: money == null ? '' : '$money a receber no local',
                  style: muted,
                )
              : Text(
                  money == null
                      ? 'Reservas que já começaram'
                      : '$money a receber no local',
                  style: muted,
                ),
          action: 'Abrir',
          onTap: (ctx) => one != null
              ? openArenaNowBooking(ctx, one)
              : ctx.go(AppRoutes.arenaBookings),
        );
      case ArenaNowTaskKind.openComanda:
        final c = task.comanda;
        final one = task.count == 1 ? c : null;
        return _TaskView(
          icon: Icons.receipt_long_rounded,
          tone: colors.pending,
          title: one != null
              ? 'Comanda #${one.displayNumber} aberta há ${_age(one)}'
              : '${task.count} comandas abertas há mais de 2h',
          subtitle: _optionalLine(
            [
              if (one != null && one.customerName.trim().isNotEmpty)
                one.customerName.trim(),
              if (money != null) money,
            ].join(' · '),
            muted,
          ),
          action: 'Fechar',
          onTap: (ctx) => one != null
              ? ctx.pushNamed(
                  AppRouteNames.arenaComandaDetail,
                  pathParameters: {'comandaId': one.id},
                )
              : ctx.go(AppRoutes.arenaComandas),
        );
      case ArenaNowTaskKind.reviews:
        return _TaskView(
          icon: Icons.star_rounded,
          tone: AppColors.brand,
          title: task.count == 1
              ? '1 avaliação sem resposta'
              : '${task.count} avaliações sem resposta',
          subtitle: Text('Responder rápido melhora sua nota', style: muted),
          action: 'Responder',
          onTap: (ctx) => ctx.pushNamed(AppRouteNames.arenaManagerReviews),
        );
    }
  }
}

Widget? _optionalLine(String text, TextStyle? style) =>
    text.isEmpty ? null : Text(text, style: style);

class _TaskView {
  const _TaskView({
    required this.icon,
    required this.tone,
    required this.title,
    required this.action,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final Color tone;
  final String title;
  final Widget? subtitle;
  final String action;
  final void Function(BuildContext) onTap;
}

class _WhoLine extends StatelessWidget {
  const _WhoLine({
    required this.prefix,
    required this.booking,
    required this.suffix,
    this.style,
  });

  final String prefix;
  final ArenaManagerBooking booking;
  final String suffix;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(prefix, style: style),
            Flexible(
              child: ArenaNowBookingWho(booking: booking, style: style),
            ),
          ],
        ),
        if (suffix.isNotEmpty) Text(suffix, style: style),
      ],
    );
  }
}
