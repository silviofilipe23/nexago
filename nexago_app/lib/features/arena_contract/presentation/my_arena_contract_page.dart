import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/links/open_external_url.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassInitials;
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart'
    show ArenaClassAvatar;
import '../../schedule_plans/presentation/widgets/schedule_plan_ui.dart';
import '../application/arena_contract_providers.dart';
import '../domain/arena_contract.dart';
import '../domain/arena_contract_logic.dart';

/// Meu contrato: o contrato de mensalista que a arena registrou no CRM — plano,
/// valor, parcelas, vencimentos, o que está em aberto (com o link de pagar,
/// quando a arena gerou) e o banco de horas da semana. Destino dos lembretes
/// automáticos do contrato (`arena_crm_*`). Layout: canvas nexaGO, "Meu
/// contrato · mensalista da arena no app do atleta".
class MyArenaContractPage extends ConsumerStatefulWidget {
  const MyArenaContractPage({super.key, this.contractId});

  /// Contrato aberto pelo push; sem ele (ou se não existir mais), o primeiro.
  final String? contractId;

  @override
  ConsumerState<MyArenaContractPage> createState() =>
      _MyArenaContractPageState();
}

class _MyArenaContractPageState extends ConsumerState<MyArenaContractPage> {
  String? _selectedId;

  @override
  void initState() {
    super.initState();
    _selectedId = widget.contractId;
  }

  Future<void> _refresh() async {
    ref.invalidate(myArenaContractsProvider);
    try {
      await ref.read(myArenaContractsProvider.future);
    } catch (_) {
      // O NexaAsyncView mostra o erro.
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        centerTitle: true,
        // O push abre com `go` (sem pilha).
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Voltar',
          onPressed: () => popOrGo(context, AppRoutes.athleteBilling),
        ),
        title: const Text('Meu contrato'),
      ),
      body: NexaAsyncView<MyArenaContracts>(
        value: ref.watch(myArenaContractsProvider),
        onRetry: () => ref.invalidate(myArenaContractsProvider),
        errorMessage:
            'Não foi possível carregar o seu contrato. Tente novamente.',
        emptyWhen: (d) => d.contracts.isEmpty,
        empty: const _EmptyContract(),
        data: (data) => RefreshIndicator(
          onRefresh: _refresh,
          color: AppColors.brand,
          child: _content(data),
        ),
      ),
    );
  }

  Widget _content(MyArenaContracts data) {
    final contract = data.byId(_selectedId)!;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        if (data.contracts.length > 1) ...[
          _ContractSelector(
            contracts: data.contracts,
            selectedId: contract.id,
            onSelect: (id) => setState(() => _selectedId = id),
          ),
          const SizedBox(height: 12),
        ],
        _Hero(contract: contract),
        const SizedBox(height: 12),
        if (contract.isOverdue)
          _DebtCard(contract: contract)
        else if (contract.nextDueDate != null)
          _NextDueCard(contract: contract),
        const SizedBox(height: 12),
        _HoursCard(contract: contract),
        if (contract.installments.isNotEmpty) ...[
          const SizedBox(height: 20),
          _SectionTitle(
            title: 'Parcelas',
            trailing: arenaContractPaidLine(contract),
          ),
          const SizedBox(height: 10),
          _Installments(items: contract.installments),
        ],
        if (contract.payments.isNotEmpty) ...[
          const SizedBox(height: 20),
          _SectionTitle(
            title: 'Pagamentos',
            trailing: '${contract.payments.length}',
          ),
          const SizedBox(height: 10),
          _Payments(items: contract.payments),
        ],
        if (contract.arenaWhatsapp != null) ...[
          const SizedBox(height: 20),
          _WhatsappButton(contract: contract),
        ],
      ],
    );
  }
}

Future<void> _openPayLink(BuildContext context, ArenaContract c) async {
  final url = c.payLink?.invoiceUrl;
  if (url == null) return;
  final opened = await openExternalUrl(url);
  if (!opened && context.mounted) {
    showAppSnackBar(context, 'Não foi possível abrir o pagamento.',
        isError: true);
  }
}

class _ContractSelector extends StatelessWidget {
  const _ContractSelector({
    required this.contracts,
    required this.selectedId,
    required this.onSelect,
  });

  final List<ArenaContract> contracts;
  final String selectedId;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final c in contracts) ...[
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                key: ValueKey('arena-contract-tab-${c.id}'),
                label: Text('${c.arenaName} · ${c.planName}'),
                selected: c.id == selectedId,
                onSelected: (_) => onSelect(c.id),
                selectedColor: AppColors.brand,
                labelStyle: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: c.id == selectedId
                      ? AppColors.black
                      : context.themeColors.onSurface,
                ),
                showCheckmark: false,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({super.key, required this.label, required this.tone});

  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final ink = context.themeColors.readableTone(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: tone.withValues(alpha: 0.45)),
      ),
      child: Text(
        label.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 9.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.1,
          color: ink,
        ),
      ),
    );
  }
}

Color _statusTone(ArenaContract c) => switch (c.status) {
      ArenaContractStatus.overdue => AppColors.live,
      ArenaContractStatus.expiring => AppColors.pending,
      ArenaContractStatus.active => AppColors.win,
      _ => AppColors.pending,
    };

class _Hero extends StatelessWidget {
  const _Hero({required this.contract});

  final ArenaContract contract;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = contract;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheduleLine(context)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.6],
          colors: [
            AppColors.brand.withValues(alpha: colors.isDark ? 0.10 : 0.07),
            colors.surfaceCard,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ArenaClassAvatar(
                initials: arenaClassInitials(c.arenaName),
                photoUrl: c.arenaLogoUrl,
                size: 34,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  c.arenaName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
                ),
              ),
              _Pill(
                key: const Key('arena-contract-status'),
                label: arenaContractStatusLabel(c),
                tone: _statusTone(c),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            c.planName,
            style: AppTypography.soraRegular(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            arenaContractPriceLine(c, scheduleMoney(c.monthlyPriceReais)),
            style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final t in arenaContractTags(c))
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: scheduleLine(context)),
                  ),
                  child: Text(
                    t,
                    style: AppTypography.mono(
                      fontSize: 10.5,
                      color: colors.onSurface,
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

class _DebtCard extends StatelessWidget {
  const _DebtCard({required this.contract});

  final ArenaContract contract;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = contract;
    final link = c.payLink;
    return Container(
      key: const Key('arena-contract-debt'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.live.withValues(alpha: 0.45)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.65],
          colors: [
            AppColors.live.withValues(alpha: colors.isDark ? 0.12 : 0.08),
            colors.surfaceCard,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ScheduleKicker(
            c.overdueSince == null
                ? 'Em aberto'
                : 'Em aberto desde ${arenaContractDayMonth(c.overdueSince)}',
            color: colors.readableTone(AppColors.live),
          ),
          const SizedBox(height: 6),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: scheduleMoney(c.overdueReais),
                  style: AppTypography.soraRegular(
                    fontSize: 26,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                TextSpan(
                  text: c.overdueCount == 1
                      ? '  · 1 mensalidade'
                      : '  · ${c.overdueCount} mensalidades',
                  style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (link != null) ...[
            SchedulePrimaryButton(
              key: const Key('arena-contract-pay'),
              label: 'Pagar ${scheduleMoney(link.amountReais)} · Pix ou cartão',
              icon: null,
              onPressed: () => _openPayLink(context, c),
            ),
            const SizedBox(height: 10),
            _Caption(
              'Pago pelo link, a baixa é automática. Pagou na recepção? A '
              'arena dá baixa e some daqui.',
            ),
          ] else
            _Caption(
              'Pague na arena, por Pix ou na recepção. Assim que a arena der '
              'baixa, some daqui.',
            ),
        ],
      ),
    );
  }
}

class _NextDueCard extends StatelessWidget {
  const _NextDueCard({required this.contract});

  final ArenaContract contract;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = contract;
    final next = c.nextDueDate ?? '';
    final weekday = DateTime.tryParse(next);
    const names = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
    return ScheduleCard(
      key: const Key('arena-contract-next'),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 52,
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      weekday == null ? '' : names[weekday.weekday - 1],
                      style: AppTypography.mono(
                        fontSize: 9,
                        letterSpacing: 1.2,
                        color: colors.readableTone(AppColors.pending),
                      ),
                    ),
                    Text(
                      next.length >= 10 ? next.substring(8, 10) : '',
                      style: AppTypography.soraRegular(
                        fontSize: 19,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Próxima mensalidade',
                      style: AppTypography.soraRegular(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      arenaContractNextLine(c) ?? '',
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                scheduleMoney(c.monthlyPriceReais),
                style: AppTypography.mono(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
          if (c.payLink != null) ...[
            const SizedBox(height: 12),
            SchedulePrimaryButton(
              key: const Key('arena-contract-pay'),
              label:
                  'Pagar ${scheduleMoney(c.payLink!.amountReais)} · Pix ou cartão',
              icon: null,
              onPressed: () => _openPayLink(context, c),
            ),
          ],
        ],
      ),
    );
  }
}

class _HoursCard extends StatelessWidget {
  const _HoursCard({required this.contract});

  final ArenaContract contract;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = contract;
    final weeks = c.weekHours;
    final maxBar = c.weeklyHours <= 0 ? 1.0 : c.weeklyHours;
    return ScheduleCard(
      key: const Key('arena-contract-hours'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                  child: ScheduleKicker('Banco de horas · esta semana')),
              ScheduleKicker('seg a dom'),
            ],
          ),
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: arenaContractHoursLabel(c.hoursThisWeek),
                  style: AppTypography.soraRegular(
                    fontSize: 26,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                TextSpan(
                  text: '  ${arenaContractHoursLine(c)}',
                  style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: arenaContractHoursFraction(c),
              minHeight: 8,
              color: AppColors.brand,
              backgroundColor: colors.onSurface.withValues(alpha: 0.08),
            ),
          ),
          if (weeks.isNotEmpty) ...[
            const SizedBox(height: 12),
            Semantics(
              label: 'Horas reservadas nas últimas ${weeks.length} semanas',
              child: Container(
                height: 34,
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(
                      color: colors.onSurface.withValues(alpha: 0.18),
                    ),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    for (final (i, h) in weeks.indexed) ...[
                      if (i > 0) const SizedBox(width: 5),
                      Expanded(
                        child: FractionallySizedBox(
                          heightFactor: (h / maxBar).clamp(0.06, 1.0),
                          alignment: Alignment.bottomCenter,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: i == weeks.length - 1
                                  ? AppColors.brand
                                  : colors.onSurface.withValues(alpha: 0.14),
                              borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(3),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 8),
          _Caption(
            'Jogue no dia e horário que quiser. Conta o que você reservou na '
            'semana; a linha de cima são as '
            '${arenaContractHoursLabel(c.weeklyHours)} do contrato.',
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 44,
            child: OutlinedButton.icon(
              key: const Key('arena-contract-book'),
              style: OutlinedButton.styleFrom(
                foregroundColor: colors.onSurface,
                side:
                    BorderSide(color: colors.onSurface.withValues(alpha: 0.14)),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: () => context.pushNamed(
                AppRouteNames.arenaDetail,
                pathParameters: {'arenaId': c.arenaId},
              ),
              icon: const Icon(Icons.calendar_today_outlined, size: 16),
              label: const Text('Reservar horário'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Installments extends StatelessWidget {
  const _Installments({required this.items});

  final List<ArenaContractInstallment> items;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return LayoutBuilder(
      builder: (context, box) {
        const gap = 6.0;
        final perRow = items.length >= 4 ? 4 : items.length;
        final width = (box.maxWidth - gap * (perRow - 1)) / perRow;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final i in items)
              _InstallmentTile(item: i, width: width, colors: colors),
          ],
        );
      },
    );
  }
}

class _InstallmentTile extends StatelessWidget {
  const _InstallmentTile({
    required this.item,
    required this.width,
    required this.colors,
  });

  final ArenaContractInstallment item;
  final double width;
  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    final tone = switch (item.state) {
      ArenaInstallmentState.paid => AppColors.win,
      ArenaInstallmentState.open => AppColors.pending,
      ArenaInstallmentState.late => AppColors.live,
      ArenaInstallmentState.link => AppColors.brand,
      ArenaInstallmentState.future => null,
    };
    return Container(
      key: ValueKey('arena-contract-installment-${item.number}'),
      width: width,
      padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 4),
      decoration: BoxDecoration(
        color: tone == null || item.state == ArenaInstallmentState.paid
            ? colors.surfaceRaised
            : tone.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(
          color: tone?.withValues(alpha: 0.5) ?? scheduleLine(context),
        ),
      ),
      child: Column(
        children: [
          Text(
            arenaContractMonthShort(item.month),
            style: AppTypography.mono(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            arenaInstallmentLabel(item).toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.mono(
              fontSize: 8.5,
              letterSpacing: 0.6,
              color: tone == null
                  ? colors.onSurfaceMuted
                  : colors.readableTone(tone),
            ),
          ),
        ],
      ),
    );
  }
}

class _Payments extends StatelessWidget {
  const _Payments({required this.items});

  final List<ArenaContractPayment> items;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ScheduleCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      child: Column(
        children: [
          for (final (i, p) in items.indexed)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 11),
              decoration: BoxDecoration(
                border: i == 0
                    ? null
                    : Border(top: BorderSide(color: scheduleLine(context))),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${arenaContractDayMonth(p.paidOn)} · ${scheduleMoney(p.amountReais)}',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                        Text(
                          '${p.method} · ${p.installments == 1 ? '1 parcela' : '${p.installments} parcelas'}',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const _Pill(label: 'Pago', tone: AppColors.win),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _WhatsappButton extends StatelessWidget {
  const _WhatsappButton({required this.contract});

  final ArenaContract contract;

  @override
  Widget build(BuildContext context) {
    final c = contract;
    final ink = context.themeColors.readableTone(AppColors.win);
    return SizedBox(
      height: 44,
      child: OutlinedButton.icon(
        key: const Key('arena-contract-whatsapp'),
        style: OutlinedButton.styleFrom(
          foregroundColor: ink,
          backgroundColor: AppColors.win.withValues(alpha: 0.08),
          side: BorderSide(color: AppColors.win.withValues(alpha: 0.4)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        onPressed: () async {
          final text = arenaContractWhatsappMessage(
            c,
            scheduleMoney(c.overdueReais),
          );
          final url =
              'https://wa.me/${c.arenaWhatsapp}?text=${Uri.encodeComponent(text)}';
          final opened = await openExternalUrl(url);
          if (!opened && context.mounted) {
            showAppSnackBar(
              context,
              'Não foi possível abrir o WhatsApp.',
              isError: true,
            );
          }
        },
        icon: const Icon(Icons.chat_outlined, size: 16),
        label: const Text('Falar com a arena'),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.trailing});

  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: ScheduleKicker(title)),
        if (trailing != null) ScheduleKicker(trailing!),
      ],
    );
  }
}

class _Caption extends StatelessWidget {
  const _Caption(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 11.5,
        height: 1.45,
        color: context.themeColors.onSurfaceMuted,
      ),
    );
  }
}

class _EmptyContract extends StatelessWidget {
  const _EmptyContract();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.card_membership_outlined,
                size: 40, color: colors.onSurfaceMuted),
            const SizedBox(height: 12),
            Text(
              'Nenhum contrato de mensalista',
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Quando uma arena registrar você como mensalista, o plano, as '
              'parcelas e os vencimentos aparecem aqui.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
            ),
          ],
        ),
      ),
    );
  }
}
