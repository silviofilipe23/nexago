import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../application/cashback_providers.dart';
import '../domain/cashback_models.dart';
import '../domain/cashback_rules.dart';
import 'cashback_copy.dart';

/// "Meu cashback": saldo, regras e extrato do atleta (`/cashback`).
///
/// Abre mesmo com o recurso desligado (link direto ou push): o saldo já ganho
/// continua do atleta e precisa seguir visível. Só as ENTRADAS (pílula, tile,
/// toggle, nota) somem quando `enabled` é falso.
class CashbackPage extends ConsumerWidget {
  const CashbackPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(cashbackConfigProvider).valueOrNull ??
        CashbackConfig.fallback;
    final walletAsync = ref.watch(cashbackWalletProvider);
    final ledgerAsync = ref.watch(cashbackLedgerProvider);
    final colors = context.themeColors;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        // O push abre com `go` (sem pilha): sem o voltar explícito o atleta
        // ficaria preso aqui.
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Voltar',
          onPressed: () => popOrGo(context, AppRoutes.discover),
        ),
        title: const Text(CashbackCopy.pageTitle),
      ),
      body: NexaAsyncView<CashbackWallet>(
        value: walletAsync,
        onRetry: () => ref.invalidate(cashbackWalletProvider),
        data: (wallet) => ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.sm,
            AppSpacing.screenH,
            AppSpacing.xxxl,
          ),
          children: [
            _BalanceHero(wallet: wallet),
            const SizedBox(height: AppSpacing.xl),
            _HowItWorksCard(config: config),
            const SizedBox(height: AppSpacing.sectionGap),
            Text(
              CashbackCopy.ledgerTitle,
              style: AppTypography.titleM.copyWith(color: colors.onSurface),
            ),
            const SizedBox(height: AppSpacing.xs),
            ledgerAsync.when(
              data: (entries) => entries.isEmpty
                  ? _EmptyLedger(text: CashbackCopy.emptyLedger(config))
                  : _LedgerList(months: groupLedgerByMonth(entries)),
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (_, _) => Text(
                CashbackCopy.ledgerError,
                style: AppTypography.bodyS.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BalanceHero extends StatelessWidget {
  const _BalanceHero({required this.wallet});

  final CashbackWallet wallet;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final muted = AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted);
    final nextExpiryAt = wallet.nextExpiryAt;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: AppRadii.xlAll,
        border: Border.all(color: AppColors.win.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(CashbackCopy.availableLabel, style: muted),
          const SizedBox(height: AppSpacing.xs),
          Text(
            formatBRLFromCents(wallet.availableCents),
            style: AppTypography.displayL.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            CashbackCopy.pendingLine(wallet.pendingCents),
            style: AppTypography.bodyS.copyWith(
              color: AppColors.pending,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (nextExpiryAt != null && wallet.nextExpiryCents > 0) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              CashbackCopy.expiringLine(wallet.nextExpiryCents, nextExpiryAt),
              style: muted,
            ),
          ],
          if (wallet.heldCents > 0) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(CashbackCopy.heldLine(wallet.heldCents), style: muted),
          ],
        ],
      ),
    );
  }
}

class _HowItWorksCard extends StatelessWidget {
  const _HowItWorksCard({required this.config});

  final CashbackConfig config;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final lines = CashbackCopy.howItWorks(config);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: colors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            CashbackCopy.howItWorksTitle,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: AppSpacing.md),
          for (var i = 0; i < lines.length; i++)
            Padding(
              padding: EdgeInsets.only(
                bottom: i == lines.length - 1 ? 0 : AppSpacing.sm,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 22,
                    child: Text(
                      '${i + 1}.',
                      style: AppTypography.bodyS.copyWith(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      lines[i],
                      style: AppTypography.bodyS.copyWith(
                        color: colors.onSurfaceMuted,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _LedgerList extends StatelessWidget {
  const _LedgerList({required this.months});

  final List<CashbackLedgerMonth> months;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final month in months) ...[
          Padding(
            padding: const EdgeInsets.only(
              top: AppSpacing.md,
              bottom: AppSpacing.xs,
            ),
            child: Text(
              month.title,
              style: AppTypography.labelS.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          for (final entry in month.entries) _LedgerRow(entry: entry),
        ],
      ],
    );
  }
}

class _LedgerRow extends StatelessWidget {
  const _LedgerRow({required this.entry});

  final CashbackLedgerEntry entry;

  static IconData _iconFor(CashbackLedgerType type) => switch (type) {
        CashbackLedgerType.earn => Icons.hourglass_top_rounded,
        CashbackLedgerType.release => Icons.check_circle_rounded,
        CashbackLedgerType.cancel => Icons.block_rounded,
        CashbackLedgerType.redeem => Icons.shopping_bag_rounded,
        CashbackLedgerType.expire => Icons.event_busy_rounded,
        CashbackLedgerType.reverse => Icons.undo_rounded,
        CashbackLedgerType.refund => Icons.replay_rounded,
        CashbackLedgerType.unknown => Icons.receipt_long_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color = switch (entry.tone) {
      CashbackLedgerTone.pending => AppColors.pending,
      CashbackLedgerTone.positive => AppColors.win,
      CashbackLedgerTone.brand => AppColors.brand,
      CashbackLedgerTone.muted => colors.onSurfaceMuted,
    };
    final meta = CashbackCopy.ledgerMeta(entry);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(_iconFor(entry.type), size: 18, color: color),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.title,
                  style: AppTypography.bodyM.copyWith(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (entry.label.isNotEmpty)
                  Text(
                    entry.label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                CashbackCopy.signedAmount(entry),
                style: AppTypography.bodyM.copyWith(
                  color: color,
                  fontWeight: FontWeight.w800,
                  decoration: entry.type == CashbackLedgerType.cancel
                      ? TextDecoration.lineThrough
                      : null,
                ),
              ),
              if (meta.isNotEmpty)
                Text(
                  meta,
                  style: AppTypography.labelS.copyWith(
                    color: entry.type == CashbackLedgerType.earn
                        ? AppColors.pending
                        : colors.onSurfaceMuted,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyLedger extends StatelessWidget {
  const _EmptyLedger({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      margin: const EdgeInsets.only(top: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.savings_outlined, color: colors.onSurfaceMuted),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              text,
              style: AppTypography.bodyS.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
