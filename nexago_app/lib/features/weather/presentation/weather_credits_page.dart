import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../application/weather_providers.dart';
import '../domain/weather_models.dart';
import 'weather_ui.dart';

/// `/weather-credits` — créditos de chuva: saldo por arena, validade e os
/// créditos usados ou vencidos.
class WeatherCreditsPage extends ConsumerWidget {
  const WeatherCreditsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final creditsAsync = ref.watch(weatherCreditsProvider);
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        centerTitle: true,
        // O push de crédito vencendo abre com `go` (sem pilha).
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Voltar',
          onPressed: () => popOrGo(context, AppRoutes.athleteSettings),
        ),
        title: const Text('Créditos de chuva'),
      ),
      body: NexaAsyncView<List<WeatherCredit>>(
        value: creditsAsync,
        onRetry: () => ref.invalidate(weatherCreditsProvider),
        emptyWhen: (credits) => credits.isEmpty,
        empty: const _EmptyCredits(),
        data: (credits) {
          final balances =
              summarizeWeatherCreditsByArena(credits, DateTime.now());
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Text(
                'Quando a arena libera um horário por chuva, o valor pago vira '
                'crédito para reservar de novo nela.',
                style: TextStyle(
                    fontSize: 13, height: 1.45, color: colors.onSurfaceMuted),
              ),
              const SizedBox(height: 16),
              for (final b in balances) ...[
                _ArenaCreditCard(balance: b),
                const SizedBox(height: 12),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _EmptyCredits extends StatelessWidget {
  const _EmptyCredits();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            WeatherRainIcon(size: 40, color: WeatherTone.rainText(context)),
            const SizedBox(height: 12),
            Text(
              'Nenhum crédito de chuva',
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Quando uma arena liberar seu horário por chuva, o crédito aparece aqui.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 13, height: 1.45, color: colors.onSurfaceMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _ArenaCreditCard extends StatelessWidget {
  const _ArenaCreditCard({required this.balance});

  final WeatherArenaBalance balance;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final hasBalance = balance.balanceReais > 0;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: hasBalance
            ? LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppColors.brand
                      .withValues(alpha: colors.isDark ? 0.16 : 0.07),
                  colors.surfaceCard,
                ],
              )
            : null,
        color: hasBalance ? null : colors.surfaceCard,
        border: Border.all(
          color: hasBalance
              ? AppColors.brand.withValues(alpha: 0.25)
              : colors.onSurface.withValues(alpha: 0.08),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: WeatherKicker(
                  'Crédito · ${balance.arenaName}',
                  color: hasBalance ? colors.brandText : null,
                ),
              ),
              WeatherRainIcon(size: 18, color: WeatherTone.rainText(context)),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            WeatherCopy.money(balance.balanceReais),
            style: AppTypography.mono(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: hasBalance ? colors.onSurface : colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            hasBalance
                ? (balance.nextExpiresAt == null
                    ? 'Disponível · sem validade'
                    : 'Disponível · vence em ${WeatherCopy.fullDate(balance.nextExpiresAt!)}')
                : 'Sem saldo disponível',
            style: TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: 12),
          Divider(height: 1, color: colors.onSurface.withValues(alpha: 0.08)),
          for (final c in balance.credits) _CreditRow(credit: c),
        ],
      ),
    );
  }
}

class _CreditRow extends StatelessWidget {
  const _CreditRow({required this.credit});

  final WeatherCredit credit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final now = DateTime.now();
    final origin = _originLabel(credit);
    final usable = credit.usableAt(now);
    final expired = credit.status == WeatherCreditStatus.expired ||
        (credit.status == WeatherCreditStatus.open &&
            credit.expiresAt != null &&
            !credit.expiresAt!.isAfter(now));
    final (String status, Color tone) = expired
        ? ('Vencido', colors.live)
        : credit.status == WeatherCreditStatus.used || credit.balanceReais <= 0
            ? ('Usado', colors.onSurfaceMuted)
            : (
                credit.expiresAt == null
                    ? 'Sem validade'
                    : 'Vence ${WeatherCopy.fullDate(credit.expiresAt!)}',
                colors.win
              );
    final usedReais = credit.uses.fold<double>(0, (s, u) => s + u.amountReais);
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  origin,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    'Crédito de ${WeatherCopy.money(credit.amountReais)}',
                    if (usedReais > 0) 'usado ${WeatherCopy.money(usedReais)}',
                    if (expired && (credit.expiredReais ?? 0) > 0)
                      'venceu ${WeatherCopy.money(credit.expiredReais!)}',
                  ].join(' · '),
                  style:
                      TextStyle(fontSize: 11.5, color: colors.onSurfaceMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                WeatherCopy.money(usable ? credit.balanceReais : 0),
                style: AppTypography.mono(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: usable ? colors.onSurface : colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 2),
              Text(status, style: TextStyle(fontSize: 11, color: tone)),
            ],
          ),
        ],
      ),
    );
  }

  static String _originLabel(WeatherCredit c) {
    final day = parseWeatherDateKey(c.originDate);
    final parts = <String>[
      if (day != null) WeatherCopy.dayShortMonth(day),
      if (c.originStartTime != null) c.originStartTime!,
      if (c.originCourtName != null) c.originCourtName!,
    ];
    return parts.isEmpty ? 'Reserva liberada por chuva' : parts.join(' · ');
  }
}
