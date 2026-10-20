import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';
import '../../../domain/agenda/class_charge_entry.dart';
import 'agenda_card_decoration.dart';
import 'agenda_timeline_widgets.dart';

/// "Mensalidades a pagar" no topo da agenda: as mensalidades de aula em aberto
/// (`getMyClassCharges`). Com fatura online, "Pagar" abre a fatura; cobrança
/// manual só informa — o aluno paga direto à arena.
class AgendaClassChargesSection extends StatelessWidget {
  const AgendaClassChargesSection({
    super.key,
    required this.charges,
    required this.onPay,
  });

  final List<ClassChargeEntry> charges;
  final ValueChanged<ClassChargeEntry> onPay;

  @override
  Widget build(BuildContext context) {
    if (charges.isEmpty) return const SizedBox.shrink();
    final count = charges.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AgendaTimelineSectionHeader(
          title: 'Mensalidades a pagar',
          subtitle: count == 1 ? '1 em aberto' : '$count em aberto',
        ),
        for (final charge in charges)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
            child: _ClassChargeCard(
              key: ValueKey('agenda-class-charge-${charge.chargeId}'),
              charge: charge,
              onPay: () => onPay(charge),
            ),
          ),
      ],
    );
  }
}

class _ClassChargeCard extends StatelessWidget {
  const _ClassChargeCard({
    super.key,
    required this.charge,
    required this.onPay,
  });

  final ClassChargeEntry charge;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final accent = agendaCardAccent(
      athleteAgendaClassSessionAccent,
      isDark: colors.isDark,
    );
    final info = classChargeInfoLabel(charge);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: agendaTimelineCardDecoration(
        kind: AthleteAgendaItemKind.classSession,
        accent: accent,
        isDark: colors.isDark,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  charge.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                classChargeDueLabel(charge).toUpperCase(),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: charge.overdue ? colors.live : accent,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            charge.arenaName,
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Text(
                formatBRL(charge.amountReais),
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 12),
              const Spacer(),
              if (info == null)
                FilledButton.icon(
                  key: Key('agenda-class-charge-pay-${charge.chargeId}'),
                  onPressed: onPay,
                  icon: const Icon(
                    Icons.account_balance_wallet_outlined,
                    size: 18,
                    color: AppColors.black,
                  ),
                  label: const Text(
                    'Pagar',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      color: AppColors.black,
                    ),
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 12,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                )
              else
                Flexible(
                  flex: 3,
                  child: Text(
                    info,
                    textAlign: TextAlign.right,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceMuted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
