import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_earnings_providers.dart';
import '../../application/professor_wallet_providers.dart';
import '../../../arena/domain/payout_pix_key_type.dart';
import '../../domain/professor_earnings.dart';
import '../../domain/professor_students_logic.dart' show professorShortDate;
import '../../domain/professor_wallet_logic.dart' show professorMonthName;
import '../widgets/professor_students_widgets.dart';
import '../wallet/professor_wallet_widgets.dart';

/// "20 out" de um instante.
String professorDayLabelOf(DateTime? at) {
  if (at == null) return '';
  final l = at.toLocal();
  return professorShortDate('${l.year.toString().padLeft(4, '0')}-'
      '${l.month.toString().padLeft(2, '0')}-'
      '${l.day.toString().padLeft(2, '0')}');
}

Color professorWithdrawalColor(
  ProfessorWithdrawalStanding s,
  AppThemeColors colors,
) =>
    switch (s) {
      ProfessorWithdrawalStanding.done ||
      ProfessorWithdrawalStanding.manual =>
        AppColors.win,
      ProfessorWithdrawalStanding.sending => ProfessorLinksStyle.blue,
      ProfessorWithdrawalStanding.awaitingApproval ||
      ProfessorWithdrawalStanding.review =>
        AppColors.pending,
      ProfessorWithdrawalStanding.failed => AppColors.live,
    };

/// Linha de saque (C1 e C8).
class ProfessorWithdrawalRow extends StatelessWidget {
  const ProfessorWithdrawalRow({super.key, required this.withdrawal});

  final ProfessorWithdrawal withdrawal;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final w = withdrawal;
    final s = w.standing;
    final color = professorWithdrawalColor(s, colors);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: ProfessorLinksStyle.line(colors)),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      w.pixKey.isEmpty
                          ? 'Pix'
                          : 'Pix · ${professorMaskedPixKey(w.pixKey, PayoutPixKeyType.initial(storedType: w.pixKeyType, pixKey: w.pixKey))}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        13.5,
                        weight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    Text(
                      professorDayLabelOf(w.createdAt),
                      style: ProfessorLinksStyle.mono(
                        10,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    formatBRL(w.amountReais),
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w700,
                      color: s == ProfessorWithdrawalStanding.failed
                          ? ProfessorLinksStyle.dim(colors)
                          : colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    s.label.toUpperCase(),
                    key: Key('professor-withdrawal-status-${w.id}'),
                    style: ProfessorLinksStyle.mono(9.5, color: color),
                  ),
                ],
              ),
            ],
          ),
          if (w.payoutError != null &&
              s != ProfessorWithdrawalStanding.done) ...[
            const SizedBox(height: 6),
            Text(
              w.payoutError!,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// C1 Ganhos: o saldo do REPASSE (equipe da arena) para sacar por PIX, o
/// que está em liberação (repasse fechado, ainda não pago), de onde veio e
/// os saques. A carteira do independente não passa por aqui.
class ProfessorEarningsPage extends ConsumerWidget {
  const ProfessorEarningsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final walletAsync = ref.watch(professorEarningsWalletProvider);
    final wallet = walletAsync.valueOrNull;
    final ledger = ref.watch(professorEarningsLedgerProvider).valueOrNull;
    final withdrawals = ref.watch(professorWithdrawalsProvider).valueOrNull;
    final pendingAsync = ref.watch(professorPendingPayoutsProvider);
    final pending = pendingAsync.valueOrNull ?? const [];
    final staff = ref.watch(professorHasStaffLinkProvider);
    final independent = ref.watch(professorHasIndependentLinkProvider);
    final inProgress = withdrawals?.any((w) => w.inProgress) ?? false;
    final hasHistory = (wallet?.availableReais ?? 0) > 0 ||
        (wallet?.pendingReais ?? 0) > 0 ||
        (ledger?.isNotEmpty ?? false) ||
        (withdrawals?.isNotEmpty ?? false);
    final pendingTotal = pending.fold(0.0, (s, p) => s + p.amountReais);
    final now = DateTime.now();

    return ProfessorLinksScaffold(
      title: 'Ganhos',
      subtitle: '${professorMonthName('${now.year}-'
                  '${now.month.toString().padLeft(2, '0')}')} ${now.year} · '
              'REPASSE DAS ARENAS'
          .toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.professorMore),
      trailing: ProfessorLinksRoundButton(
        key: const Key('professor-earnings-history'),
        icon: Icons.history_rounded,
        semanticLabel: 'Histórico de saques',
        onTap: () => context.pushNamed(AppRouteNames.professorWithdrawals),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (!staff && !hasHistory && wallet != null) ...[
            ProfessorLinksCard(
              key: const Key('professor-earnings-independent'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Aqui entra o repasse das arenas',
                    style: ProfessorLinksStyle.display(
                      15,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const ProfessorMutedText(
                    'Quando uma arena em que você é da equipe paga seu repasse '
                    'pelo nexaGO, o valor cai aqui e você saca por PIX. O que '
                    'seus alunos da carteira pagam vai direto para a sua conta '
                    'Asaas, sem passar por este saldo.',
                  ),
                ],
              ),
            ),
            if (independent) ...[
              const SizedBox(height: 12),
              ProfessorLinksGhostButton(
                key: const Key('professor-earnings-go-payout'),
                label: 'Receber pelo nexaGO (carteira)',
                onPressed: () =>
                    context.pushNamed(AppRouteNames.professorPayoutAccount),
              ),
            ],
          ] else if (wallet == null && walletAsync.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar seu saldo.',
              onRetry: () => ref.invalidate(professorEarningsWalletProvider),
            )
          else if (wallet == null)
            const ProfessorWalletLoading()
          else ...[
            _BalanceCard(
              wallet: wallet,
              pendingTotal: pendingTotal,
              inProgress: inProgress,
            ),
            if (pending.isNotEmpty) ...[
              const SizedBox(height: 22),
              const ProfessorLinksKicker('Em liberação'),
              const SizedBox(height: 8),
              ProfessorRowsBlock(
                children: [
                  for (var i = 0; i < pending.length; i++)
                    ProfessorInfoRow(
                      key: Key('professor-earnings-pending-'
                          '${pending[i].payoutId}'),
                      label: 'Repasse ${pending[i].arenaName}',
                      value: formatBRL(pending[i].amountReais),
                      sub: '${professorEarningsMonthLabel(pending[i].month)} · '
                          'fechado, aguardando a arena pagar',
                      last: i == pending.length - 1,
                    ),
                ],
              ),
            ],
            const SizedBox(height: 22),
            const ProfessorLinksKicker('De onde veio'),
            const SizedBox(height: 8),
            if (ledger == null)
              const ProfessorWalletLoading()
            else if (ledger.isEmpty)
              const ProfessorMutedText(
                'Ainda nada. O repasse que a arena pagar pelo nexaGO aparece '
                'aqui.',
              )
            else
              ProfessorRowsBlock(
                children: [
                  for (var i = 0; i < ledger.length && i < 12; i++)
                    ProfessorInfoRow(
                      key: Key('professor-earnings-entry-${ledger[i].id}'),
                      label: 'Repasse ${ledger[i].arenaName}',
                      value: '+ ${formatBRL(ledger[i].amountReais)}',
                      valueColor: AppColors.win,
                      sub: [
                        if (ledger[i].month.isNotEmpty)
                          professorEarningsMonthLabel(ledger[i].month),
                        if (ledger[i].createdAt != null)
                          'pago ${professorDayLabelOf(ledger[i].createdAt)}',
                      ].join(' · '),
                      last: i == ledger.length - 1 || i == 11,
                    ),
                ],
              ),
            const SizedBox(height: 22),
            Row(
              children: [
                const Expanded(child: ProfessorLinksKicker('Últimos saques')),
                if ((withdrawals?.length ?? 0) > 3)
                  TextButton(
                    key: const Key('professor-earnings-all-withdrawals'),
                    onPressed: () =>
                        context.pushNamed(AppRouteNames.professorWithdrawals),
                    child: const Text('Ver todos'),
                  ),
              ],
            ),
            if (withdrawals == null)
              const ProfessorWalletLoading()
            else if (withdrawals.isEmpty)
              const ProfessorMutedText('Nenhum saque ainda.')
            else
              for (final w in withdrawals.take(3))
                ProfessorWithdrawalRow(
                  key: Key('professor-withdrawal-${w.id}'),
                  withdrawal: w,
                ),
          ],
        ],
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({
    required this.wallet,
    required this.pendingTotal,
    required this.inProgress,
  });

  final ProfessorEarningsWallet wallet;
  final double pendingTotal;
  final bool inProgress;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const green = AppColors.win;
    final canWithdraw =
        !inProgress && wallet.availableReais >= kProfessorWithdrawalMinReais;
    return Container(
      key: const Key('professor-earnings-balance'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: green.withValues(alpha: 0.3)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.62],
          colors: [green.withValues(alpha: 0.16), colors.surfaceCard],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ProfessorLinksKicker('Disponível para saque', color: green),
          const SizedBox(height: 8),
          Text(
            formatBRL(wallet.availableReais),
            key: const Key('professor-earnings-available'),
            style: ProfessorLinksStyle.display(36, color: colors.onSurface),
          ),
          if (wallet.pendingReais > 0) ...[
            const SizedBox(height: 4),
            Text(
              '${formatBRL(wallet.pendingReais)} EM SAQUE',
              key: const Key('professor-earnings-in-withdrawal'),
              style: ProfessorLinksStyle.mono(
                10.5,
                color: ProfessorLinksStyle.blue,
              ),
            ),
          ],
          if (pendingTotal > 0) ...[
            const SizedBox(height: 4),
            Text(
              '+ ${formatBRL(pendingTotal)} EM LIBERAÇÃO',
              key: const Key('professor-earnings-releasing'),
              style: ProfessorLinksStyle.mono(
                10.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
          const SizedBox(height: 16),
          ProfessorLinksPrimaryButton(
            key: const Key('professor-earnings-withdraw'),
            label: inProgress ? 'Saque em andamento' : 'Sacar',
            height: 46,
            onPressed: canWithdraw
                ? () => context.pushNamed(AppRouteNames.professorWithdraw)
                : null,
          ),
          if (inProgress) ...[
            const SizedBox(height: 8),
            const ProfessorMutedText(
              'Um saque por vez: o próximo libera quando este terminar.',
            ),
          ],
        ],
      ),
    );
  }
}
