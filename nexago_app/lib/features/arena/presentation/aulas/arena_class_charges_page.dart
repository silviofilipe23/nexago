import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/arena_staff_role.dart';
import '../../domain/aulas/arena_class_billing_logic.dart';
import '../../domain/aulas/arena_class_enrollment.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../widgets/arena_async_state.dart';
import 'arena_class_payment_sheet.dart';
import 'widgets/arena_class_atoms.dart';
import 'widgets/arena_class_contact.dart';
import 'widgets/arena_class_form_atoms.dart';

/// Mensalidades das aulas (A7): recebido no mês, a receber, em atraso e as
/// abas Em atraso / Vencendo / Pagos.
///
/// "Cobrar" abre o chat do app com o aluno (quem tem conta) ou o WhatsApp
/// (sem conta) com a mensagem pronta — com o link da fatura quando a
/// mensalidade é online — e "Registrar pagamento" dá baixa no que a
/// arena recebeu direto (na online, cancela o link). Lê quem vê a agenda ou o
/// financeiro; registrar exige escrever na agenda (recepção cobra no balcão).
class ArenaClassChargesPage extends ConsumerWidget {
  const ArenaClassChargesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todayKey = ref.watch(arenaClassTodayKeyProvider);
    final viewAsync = ref.watch(arenaClassChargesViewProvider);
    final month = arenaClassMonthName(todayKey);
    final year = todayKey.length >= 4 ? todayKey.substring(0, 4) : '';

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ArenaClassHeader(
              eyebrow: 'AULAS',
              title: 'Mensalidades',
              subtitle: '$month $year'.toUpperCase(),
              onBack: () => context.pop(),
            ),
            Expanded(
              child: viewAsync.when(
                data: (view) => _Body(view: view, todayKey: todayKey),
                loading: () => const ArenaLoadingState(
                    label: 'Carregando mensalidades...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.view, required this.todayKey});

  final ArenaClassChargesView view;
  final String todayKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final tab = ref.watch(arenaClassChargesTabProvider);
    final canWrite = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final canOpenStudent = ref.watch(arenaCanReadProvider(ArenaArea.agenda));
    final arenaName = ref.watch(managedArenaDetailProvider).valueOrNull?.name;
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
    final onlineOn =
        ref.watch(arenaClassRulesProvider).valueOrNull?.onlineBillingEnabled ??
            false;
    final list = view.of(tab);
    final month = arenaClassMonthName(todayKey);

    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        10,
        16,
        MediaQuery.paddingOf(context).bottom + 32,
      ),
      children: [
        _Hero(view: view, month: month),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final (t, label) in [
                (ArenaClassChargesTab.overdue, 'Em atraso'),
                (ArenaClassChargesTab.upcoming, 'Vencendo'),
                (ArenaClassChargesTab.paid, 'Pagos'),
              ]) ...[
                ArenaClassChip(
                  label: '$label · ${view.of(t).length}',
                  selected: t == tab,
                  onTap: () =>
                      ref.read(arenaClassChargesTabProvider.notifier).state = t,
                ),
                const SizedBox(width: 6),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (list.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 24),
            child: ArenaEmptyState(
              title: switch (tab) {
                ArenaClassChargesTab.overdue => 'Nada em atraso',
                ArenaClassChargesTab.upcoming => 'Nada a vencer',
                ArenaClassChargesTab.paid => 'Nenhum pagamento em $month',
              },
              message: switch (tab) {
                ArenaClassChargesTab.overdue =>
                  'Todas as mensalidades vencidas foram pagas.',
                ArenaClassChargesTab.upcoming =>
                  'As mensais do próximo mês aparecem 10 dias antes do '
                      'vencimento.',
                ArenaClassChargesTab.paid =>
                  'O que você registrar como pago neste mês aparece aqui.',
              },
              icon: tab == ArenaClassChargesTab.paid
                  ? Icons.payments_outlined
                  : Icons.check_circle_outline_rounded,
            ),
          ),
        for (final c in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _ChargeCard(
              charge: c,
              todayKey: todayKey,
              onOpen: canOpenStudent
                  ? () => context.pushNamed(
                        AppRouteNames.arenaClassStudent,
                        pathParameters: {'studentId': c.studentId},
                      )
                  : null,
              onRemind: c.isOpen
                  ? () => contactArenaClassStudent(
                        context,
                        ref,
                        arenaId: arenaId,
                        athleteId: c.athleteId,
                        phone: c.phone,
                        message: arenaClassChargeReminderMessage(
                          c,
                          todayKey: todayKey,
                          arenaName: arenaName,
                        ),
                      )
                  : null,
              onRegister:
                  c.isOpen && canWrite ? () => _register(context, c) : null,
              onCopyLink: switch (arenaClassChargeInvoiceUrl(c)) {
                final url? => () => copyArenaClassInvoiceLink(context, url),
                null => null,
              },
            ),
          ),
        const SizedBox(height: 8),
        Text(
          onlineOn || list.any((c) => c.isOnline)
              ? 'Online: o aluno paga pelo link (PIX ou cartão) e a baixa é '
                  'automática. Manual: a arena recebe direto e registra aqui.'
              : 'Cobrança manual: a arena recebe direto (PIX, dinheiro, '
                  'maquininha ou transferência) e registra aqui. Nada passa '
                  'pela plataforma.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11.5,
            height: 1.45,
            color: colors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }

  Future<void> _register(BuildContext context, ArenaClassCharge c) async {
    final result = await showArenaClassPaymentSheet(context, charge: c);
    if (result == null || !context.mounted) return;
    showAppSnackBar(
      context,
      result == ArenaClassChargeSheetResult.canceled
          ? 'Mensalidade de ${c.name} cancelada.'
          : 'Pagamento de ${c.name} registrado.',
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.view, required this.month});

  final ArenaClassChargesView view;
  final String month;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget stat(String label, String value, Color color, {bool first = false}) {
      return Expanded(
        child: Container(
          padding: EdgeInsets.only(left: first ? 0 : 12),
          decoration: BoxDecoration(
            border: first
                ? null
                : Border(
                    left: BorderSide(
                      color: colors.onSurface.withValues(alpha: 0.08),
                    ),
                  ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(fontSize: 10.5, color: colors.onSurfaceMuted),
              ),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  style: AppTypography.mono(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: colors.readableTone(color),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return ArenaClassPanel(
      highlight: true,
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ArenaClassKicker('Recebido em $month', color: AppColors.brandHover),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              formatBRL(view.receivedReais),
              style: AppTypography.soraRegular(
                fontSize: 36,
                fontWeight: FontWeight.w800,
                letterSpacing: -1.5,
                color: colors.onSurface,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.only(top: 12),
            decoration: BoxDecoration(
              border: Border(
                top:
                    BorderSide(color: colors.onSurface.withValues(alpha: 0.08)),
              ),
            ),
            child: Row(
              children: [
                stat('A receber', formatBRL(view.toReceiveReais),
                    colors.onSurface,
                    first: true),
                stat('Em atraso', formatBRL(view.overdueReais), AppColors.live),
                stat(
                  'Pagas no mês',
                  '${view.paid.length}',
                  AppColors.win,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChargeCard extends StatelessWidget {
  const _ChargeCard({
    required this.charge,
    required this.todayKey,
    required this.onOpen,
    required this.onRemind,
    required this.onRegister,
    required this.onCopyLink,
  });

  final ArenaClassCharge charge;
  final String todayKey;
  final VoidCallback? onOpen;
  final VoidCallback? onRemind;
  final VoidCallback? onRegister;

  /// "Copiar link": só com a fatura online aberta.
  final VoidCallback? onCopyLink;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = charge;
    final statusColor = c.isPaid
        ? AppColors.win
        : arenaClassChargeIsOverdue(c, todayKey)
            ? AppColors.live
            : c.dueDate == todayKey
                ? AppColors.pending
                : colors.onSurfaceMuted;
    final online = arenaClassOnlineChargeStatus(c);
    final header = Row(
      children: [
        ArenaClassAvatar(initials: arenaClassInitials(c.name)),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                c.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                c.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, color: colors.onSurfaceMuted),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              formatBRL(c.amountReais),
              style: AppTypography.mono(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              arenaClassChargeStatusLabel(c, todayKey),
              style: AppTypography.mono(
                fontSize: 10,
                color: colors.readableTone(statusColor),
              ),
            ),
          ],
        ),
      ],
    );
    return ArenaClassPanel(
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (onOpen == null)
            header
          else
            InkWell(
              onTap: onOpen,
              borderRadius: BorderRadius.circular(12),
              child: header,
            ),
          if (online != null)
            _OnlineStatusRow(status: online, onCopyLink: onCopyLink),
          if (onRemind != null || onRegister != null) ...[
            const SizedBox(height: 11),
            Row(
              children: [
                if (onRemind != null)
                  Expanded(
                    child: ArenaClassGhostButton(
                      label: 'Cobrar',
                      icon: Icons.chat_bubble_outline_rounded,
                      height: 36,
                      onPressed: onRemind,
                    ),
                  ),
                if (onRemind != null && onRegister != null)
                  const SizedBox(width: 8),
                if (onRegister != null)
                  Expanded(
                    child: ArenaClassGhostButton(
                      label: 'Registrar pagamento',
                      icon: Icons.payments_outlined,
                      height: 36,
                      onPressed: onRegister,
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Situação da fatura online no cartão ("Fatura enviada") e "Copiar link".
class _OnlineStatusRow extends StatelessWidget {
  const _OnlineStatusRow({required this.status, required this.onCopyLink});

  final ArenaClassOnlineStatus status;
  final VoidCallback? onCopyLink;

  @override
  Widget build(BuildContext context) {
    // Só pinta ícone e texto: vai no tom legível do tema.
    final color = context.themeColors
        .readableTone(arenaClassOnlineToneColor(context, status.tone));
    return Padding(
      padding: EdgeInsets.only(top: onCopyLink == null ? 10 : 4),
      child: Row(
        children: [
          Icon(Icons.bolt_rounded, size: 14, color: color),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              status.label,
              style: AppTypography.mono(
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          ),
          if (onCopyLink != null)
            TextButton.icon(
              onPressed: onCopyLink,
              icon: const Icon(Icons.link_rounded, size: 15),
              label: const Text('Copiar link'),
              style: TextButton.styleFrom(
                visualDensity: VisualDensity.compact,
                // Sem a família, o estilo trocaria a Sora do tema pela do sistema.
                textStyle: AppTypography.soraRegular(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
