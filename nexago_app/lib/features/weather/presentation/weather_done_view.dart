import 'package:flutter/material.dart';

import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../domain/weather_models.dart';
import '../infrastructure/weather_service.dart';
import 'weather_ui.dart';
import 'widgets/weather_choice_widgets.dart';

/// A4 — sucesso: crédito guardado ou remarcação confirmada.
class WeatherDoneView extends StatelessWidget {
  const WeatherDoneView({
    super.key,
    required this.result,
    required this.arenaName,
    required this.originalStart,
    required this.onPrimary,
    required this.onHome,
    this.pick,
    this.pickCourtName,
  });

  final WeatherChoiceResult result;
  final String arenaName;
  final DateTime originalStart;
  final WeatherReschedulePick? pick;
  final String? pickCourtName;

  /// Crédito: "Reservar agora" (abre a arena). Remarcação: "Ver minhas reservas".
  final VoidCallback onPrimary;
  final VoidCallback onHome;

  bool get _isReschedule => result.choice == WeatherChoice.reschedule;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: const NexaAppBar(automaticallyImplyLeading: false),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        children: [
          const SizedBox(height: 18),
          Center(
            child: Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.win.withValues(alpha: 0.14),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.check_rounded, size: 32, color: colors.win),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            _isReschedule ? 'Remarcação confirmada' : 'Crédito guardado',
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _isReschedule
                ? 'Sua reserva das ${WeatherCopy.time(originalStart)} foi trocada sem custo.'
                : 'Sua reserva das ${WeatherCopy.time(originalStart)} foi cancelada sem '
                    'custo. A equipe foi avisada.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: colors.onSurfaceMuted,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 20),
          if (_isReschedule) _rescheduleCard(context) else _creditCard(context),
          const SizedBox(height: 14),
          Text(
            _isReschedule
                ? 'O novo horário já está em Minhas reservas.'
                : 'Aplicado automaticamente na sua próxima reserva nesta arena. '
                    'Fica em Ajustes › Créditos de chuva.',
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 12, height: 1.5, color: colors.onSurfaceMuted),
          ),
        ],
      ),
      bottomNavigationBar: WeatherBottomBar(
        ctaKey: const ValueKey('weather-done-primary'),
        ctaLabel: _isReschedule ? 'Ver minhas reservas' : 'Reservar agora',
        ctaIcon: true,
        onCta: onPrimary,
        secondaryLabel: 'Voltar ao início',
        onSecondary: onHome,
      ),
    );
  }

  Widget _creditCard(BuildContext context) {
    final colors = context.themeColors;
    return _OrangeCard(
      kicker: 'Crédito · $arenaName',
      amount: WeatherCopy.money(result.creditReais),
      rows: [
        (
          'Válido até',
          result.expiresAt == null
              ? 'SEM VALIDADE'
              : WeatherCopy.fullDate(result.expiresAt!).toUpperCase(),
          colors.onSurface,
        ),
      ],
    );
  }

  Widget _rescheduleCard(BuildContext context) {
    final colors = context.themeColors;
    final p = pick;
    final day = parseWeatherDateKey(p?.dateKey);
    return _OrangeCard(
      kicker: '$arenaName${pickCourtName == null ? '' : ' · $pickCourtName'}',
      caption: day == null ? null : WeatherCopy.ticketDate(day),
      amount: p == null ? 'Novo horário' : '${p.startTime} – ${p.endTime}',
      amountIsText: true,
      rows: [
        if (result.coveredByCreditReais > 0)
          (
            'Coberto pela reserva cancelada',
            WeatherCopy.money(result.coveredByCreditReais),
            colors.onSurface,
          ),
        (
          'A pagar na arena',
          WeatherCopy.money(result.dueOnsiteReais),
          colors.onSurface,
        ),
        if (result.leftoverCreditReais > 0)
          (
            'Sobra em crédito',
            WeatherCopy.money(result.leftoverCreditReais),
            colors.win,
          ),
      ],
    );
  }
}

class _OrangeCard extends StatelessWidget {
  const _OrangeCard({
    required this.kicker,
    required this.amount,
    required this.rows,
    this.amountIsText = false,
    this.caption,
  });

  final String kicker;

  /// Linha acima do valor (ex.: a data do horário novo).
  final String? caption;
  final String amount;
  final bool amountIsText;
  final List<(String, String, Color)> rows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.brand.withValues(alpha: colors.isDark ? 0.18 : 0.08),
            colors.surfaceCard,
          ],
        ),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: WeatherKicker(kicker, color: colors.brandText)),
              WeatherRainIcon(size: 18, color: WeatherTone.rainText(context)),
            ],
          ),
          const SizedBox(height: 14),
          if (caption != null) ...[
            Text(
              caption!,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 4),
          ],
          Text(
            amount,
            style: AppTypography.mono(
              fontSize: amountIsText ? 30 : 38,
              fontWeight: FontWeight.w800,
              letterSpacing: amountIsText ? 0 : -0.6,
              color: colors.onSurface,
            ),
          ),
          if (rows.isNotEmpty) ...[
            const SizedBox(height: 16),
            Divider(height: 1, color: colors.onSurface.withValues(alpha: 0.14)),
            const SizedBox(height: 12),
            for (final (label, value, color) in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: TextStyle(
                            fontSize: 12, color: colors.onSurfaceMuted),
                      ),
                    ),
                    Text(
                      value,
                      style: AppTypography.mono(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}
