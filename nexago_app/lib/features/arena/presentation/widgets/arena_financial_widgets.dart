import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../data/arena_wallet_repository.dart';
import '../../domain/arena_financial_logic.dart';
import '../../domain/payout_pix_key_type.dart';
import 'arena_dashboard_tokens.dart';

class ArenaFinancialHeader extends StatelessWidget {
  const ArenaFinancialHeader({
    super.key,
    required this.onBack,
    this.onReport,
  });

  final VoidCallback onBack;
  final VoidCallback? onReport;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
      child: Row(
        children: [
          _ArenaFinancialIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          Expanded(
            child: Text(
              'Financeiro',
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          if (onReport != null)
            _ArenaFinancialIconButton(
              icon: Icons.description_outlined,
              onPressed: onReport!,
            )
          else
            const SizedBox(width: 40),
        ],
      ),
    );
  }
}

class ArenaFinancialBalanceCard extends StatelessWidget {
  const ArenaFinancialBalanceCard({
    super.key,
    required this.wallet,
    required this.period,
    required this.stats,
    required this.onPeriodChanged,
  });

  final ArenaWalletSummary wallet;
  final ArenaFinancialPeriod period;
  final ArenaFinancialPeriodStats stats;
  final ValueChanged<ArenaFinancialPeriod> onPeriodChanged;

  @override
  Widget build(BuildContext context) {
    final nextPayout = formatNextPayoutLabel(wallet.pendingReais);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        gradient: RadialGradient(
          center: Alignment.topRight,
          radius: 1.2,
          colors: [
            AppColors.brand.withValues(alpha: 0.18),
            context.themeColors.surfaceRaised,
          ],
        ),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'SALDO DISPONÍVEL',
                style: AppTypography.mono(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                  letterSpacing: 0.8,
                ),
              ),
              const Spacer(),
              _PeriodSegment(
                period: period,
                onChanged: onPeriodChanged,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            formatBRL(wallet.availableReais),
            style: AppTypography.soraRegular(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _BalanceStatColumn(
                  label: 'Recebido',
                  value: formatBRL(stats.receivedReais),
                  valueColor: AppColors.win,
                ),
              ),
              _BalanceDivider(color: context.themeColors.onSurfaceMuted),
              Expanded(
                child: _BalanceStatColumn(
                  label: 'Sacado',
                  value: formatBRL(stats.withdrawnReais),
                  valueColor: context.themeColors.onSurfaceMuted,
                ),
              ),
              _BalanceDivider(color: context.themeColors.onSurfaceMuted),
              Expanded(
                child: _BalanceStatColumn(
                  label: 'Próx. repasse',
                  value: nextPayout,
                  valueColor: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class ArenaFinancialWithdrawSection extends StatelessWidget {
  const ArenaFinancialWithdrawSection({
    super.key,
    required this.amountController,
    required this.pixKey,
    required this.amountError,
    required this.canSubmit,
    required this.submitting,
    required this.onWithdrawAll,
    required this.onEditPix,
    required this.onSubmit,
  });

  final TextEditingController amountController;
  final String pixKey;
  final String? amountError;
  final bool canSubmit;
  final bool submitting;
  final VoidCallback onWithdrawAll;
  final VoidCallback onEditPix;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text(
              'Solicitar saque',
              style: AppTypography.soraRegular(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            const Spacer(),
            Text(
              'Min. ${formatBRL(arenaMinWithdrawalReais)}',
              style: AppTypography.mono(
                fontSize: 10,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          'VALOR',
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 4, 6, 4),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: amountError != null
                  ? AppColors.live.withValues(alpha: 0.5)
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: amountController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                  ],
                  style: AppTypography.soraRegular(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                  decoration: InputDecoration(
                    hintText: 'R\$ 0,00',
                    hintStyle: AppTypography.soraRegular(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      color: context.themeColors.onSurfaceMuted
                          .withValues(alpha: 0.5),
                    ),
                    border: InputBorder.none,
                    errorText: amountError,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                ),
              ),
              TextButton(
                onPressed: onWithdrawAll,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  side: BorderSide(color: AppColors.brand.withValues(alpha: 0.6)),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  'Sacar tudo',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'CHAVE PIX DE DESTINO',
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.win.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.diamond_rounded,
                  size: 14,
                  color: AppColors.win,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  pixKey.trim().isEmpty
                      ? 'Cadastre uma chave PIX'
                      : maskPixKey(pixKey),
                  style: AppTypography.mono(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              TextButton(
                onPressed: onEditPix,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  padding: EdgeInsets.zero,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  'Editar',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: canSubmit ? onSubmit : null,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.35),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            icon: submitting
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.black,
                    ),
                  )
                : const Icon(Icons.arrow_upward_rounded, size: 18),
            label: Text(
              'Solicitar saque',
              style: AppTypography.soraRegular(
                fontSize: 15,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Tarifa de R\$ 1,75 por saque · grátis no plano Elite.',
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(
            fontSize: 12,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class ArenaFinancialHistorySection extends StatelessWidget {
  const ArenaFinancialHistorySection({
    super.key,
    required this.movements,
    required this.filter,
    required this.onFilterChanged,
  });

  final List<ArenaFinancialMovement> movements;
  final ArenaFinancialHistoryFilter filter;
  final ValueChanged<ArenaFinancialHistoryFilter> onFilterChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text(
              'HISTÓRICO',
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.8,
              ),
            ),
            const Spacer(),
            Text(
              '${movements.length} movimentações',
              style: AppTypography.mono(
                fontSize: 10,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final f in ArenaFinancialHistoryFilter.values) ...[
                if (f != ArenaFinancialHistoryFilter.values.first)
                  const SizedBox(width: 8),
                _HistoryFilterChip(
                  label: switch (f) {
                    ArenaFinancialHistoryFilter.all => 'Todos',
                    ArenaFinancialHistoryFilter.receipts => 'Recebimentos',
                    ArenaFinancialHistoryFilter.withdrawals => 'Saques',
                  },
                  selected: filter == f,
                  onTap: () => onFilterChanged(f),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 8),
        if (movements.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              'Nenhuma movimentação neste filtro.',
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 13,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          )
        else
          DecoratedBox(
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.1),
              ),
            ),
            child: Column(
              children: [
                for (var i = 0; i < movements.length; i++) ...[
                  ArenaFinancialMovementTile(movement: movements[i]),
                  if (i < movements.length - 1)
                    Divider(
                      height: 1,
                      thickness: 1,
                      color: context.themeColors.onSurfaceMuted
                          .withValues(alpha: 0.08),
                    ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class ArenaFinancialMovementTile extends StatelessWidget {
  const ArenaFinancialMovementTile({super.key, required this.movement});

  final ArenaFinancialMovement movement;

  @override
  Widget build(BuildContext context) {
    final iconColor = movement.isFailed
        ? AppColors.live
        : movement.isPositive
            ? AppColors.win
            : context.themeColors.onSurfaceMuted;
    final badgeColor = movement.isFailed
        ? AppColors.live
        : AppColors.win;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(
              movement.isPositive
                  ? Icons.arrow_downward_rounded
                  : Icons.arrow_upward_rounded,
              size: 18,
              color: iconColor,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  movement.title,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        formatFinancialMovementTimestamp(movement.at),
                        style: AppTypography.mono(
                          fontSize: 10,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: badgeColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        movement.statusLabel,
                        style: AppTypography.mono(
                          fontSize: 8,
                          fontWeight: FontWeight.w800,
                          color: badgeColor,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                  ],
                ),
                // Saque com tarifa: o valor acima é o líquido recebido, esta
                // linha mostra de onde saiu a diferença.
                if (movement.note case final note?) ...[
                  const SizedBox(height: 4),
                  Text(
                    note,
                    style: AppTypography.soraRegular(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            movement.isPositive
                ? '+${formatBRL(movement.amountReais)}'
                : '-${formatBRL(movement.amountReais)}',
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: movement.isPositive
                  ? AppColors.win
                  : context.themeColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> showArenaFinancialPixEditSheet({
  required BuildContext context,
  required PayoutPixKeyType initialType,
  required String initialKey,
  required ValueChanged<(PayoutPixKeyType type, String key)> onSave,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) {
      var type = initialType;
      final controller = TextEditingController(text: initialKey);
      String? error;

      return StatefulBuilder(
        builder: (context, setSheetState) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              16,
              20,
              16 + MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Chave PIX de destino',
                  style: AppTypography.soraRegular(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<PayoutPixKeyType>(
                  initialValue: type,
                  dropdownColor: context.themeColors.surfaceRaised,
                  decoration: InputDecoration(
                    labelText: 'Tipo da chave',
                    filled: true,
                    fillColor: context.themeColors.surfaceRaised,
                  ),
                  items: [
                    for (final t in PayoutPixKeyType.values)
                      DropdownMenuItem(value: t, child: Text(t.label)),
                  ],
                  onChanged: (v) {
                    if (v != null) setSheetState(() => type = v);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  decoration: InputDecoration(
                    labelText: 'Chave PIX',
                    hintText: type.hintForField(),
                    errorText: error,
                    filled: true,
                    fillColor: context.themeColors.surfaceRaised,
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () {
                    final key = controller.text.trim();
                    final validation = type.validateKey(key);
                    if (validation != null) {
                      setSheetState(() => error = validation);
                      return;
                    }
                    onSave((type, key));
                    Navigator.of(context).pop();
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                  ),
                  child: const Text('Salvar'),
                ),
              ],
            ),
          );
        },
      );
    },
  );
}

class _ArenaFinancialIconButton extends StatelessWidget {
  const _ArenaFinancialIconButton({
    required this.icon,
    required this.onPressed,
  });

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class _PeriodSegment extends StatelessWidget {
  const _PeriodSegment({
    required this.period,
    required this.onChanged,
  });

  final ArenaFinancialPeriod period;
  final ValueChanged<ArenaFinancialPeriod> onChanged;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceSheet.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(3),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final p in ArenaFinancialPeriod.values)
              _PeriodChip(
                label: p.label,
                selected: period == p,
                onTap: () => onChanged(p),
              ),
          ],
        ),
      ),
    );
  }
}

class _PeriodChip extends StatelessWidget {
  const _PeriodChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.brand : Colors.transparent,
      borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: selected
                  ? AppColors.black
                  : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class _BalanceStatColumn extends StatelessWidget {
  const _BalanceStatColumn({
    required this.label,
    required this.value,
    required this.valueColor,
  });

  final String label;
  final String value;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 9,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          textAlign: TextAlign.center,
          style: AppTypography.mono(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: valueColor,
          ),
        ),
      ],
    );
  }
}

class _BalanceDivider extends StatelessWidget {
  const _BalanceDivider({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 28,
      color: color.withValues(alpha: 0.15),
    );
  }
}

class _HistoryFilterChip extends StatelessWidget {
  const _HistoryFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.brand : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: selected
                  ? AppColors.black
                  : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}
