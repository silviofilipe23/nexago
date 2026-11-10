import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_segmented_control.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../athlete/domain/agenda/athlete_agenda_providers.dart'
    show myClassChargesProvider;
import '../../athlete_training/presentation/widgets/training_widgets.dart'
    show TrainingSectionTitle;
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart'
    show ProfessorMutedText;
import '../../payment_card/application/payment_card_providers.dart';
import '../application/athlete_billing_providers.dart';
import '../domain/athlete_billing.dart';
import 'widgets/athlete_billing_widgets.dart';

enum AthleteBillingTab { open, recurring, history }

/// `?aba=` da rota: `recorrentes`, `historico`; o resto é "Em aberto".
AthleteBillingTab athleteBillingTabFromKey(String? key) => switch (key) {
      'recorrentes' => AthleteBillingTab.recurring,
      'historico' => AthleteBillingTab.history,
      _ => AthleteBillingTab.open,
    };

/// C1–C3 · Cobranças: tudo que o atleta paga, de todas as origens — Em
/// aberto (com filtro por tipo), Recorrentes e Histórico. Cada cobrança leva
/// à tela de pagar de quem recebe; o NexaGO só reúne.
class AthleteBillingPage extends ConsumerStatefulWidget {
  const AthleteBillingPage({
    super.key,
    this.initialTab = AthleteBillingTab.open,
    this.initialKind,
  });

  final AthleteBillingTab initialTab;
  final AthleteChargeKind? initialKind;

  @override
  ConsumerState<AthleteBillingPage> createState() => _AthleteBillingPageState();
}

class _AthleteBillingPageState extends ConsumerState<AthleteBillingPage> {
  late AthleteBillingTab _tab = widget.initialTab;
  late AthleteChargeKind? _kind = widget.initialKind;
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    // Volta do pagamento (fatura no navegador, app do banco): relê tudo.
    _lifecycle = AppLifecycleListener(onResume: () {
      if (mounted) refreshAthleteBilling(ref);
    });
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    refreshAthleteBilling(ref);
    // Espera a origem mais lenta (callable das aulas) para o indicador.
    await ref.read(myClassChargesProvider.future);
  }

  @override
  Widget build(BuildContext context) {
    final summary = ref.watch(athleteChargesSummaryProvider);
    final cardEnabled =
        ref.watch(scheduleCardAutopayEnabledProvider).valueOrNull ?? false;
    return ProfessorLinksScaffold(
      title: 'Cobranças',
      subtitle: summary == null
          ? 'AULAS · HORÁRIO FIXO · RESERVAS · TORNEIOS'
          : summary.isEmpty
              ? 'NADA EM ABERTO'
              : '${formatBRL(summary.total)} EM ABERTO'.toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.home),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            NexaSegmentedControl<AthleteBillingTab>(
              key: const Key('athlete-billing-tabs'),
              segments: const [
                NexaSegment(value: AthleteBillingTab.open, label: 'Em aberto'),
                NexaSegment(
                  value: AthleteBillingTab.recurring,
                  label: 'Recorrentes',
                ),
                NexaSegment(
                  value: AthleteBillingTab.history,
                  label: 'Histórico',
                ),
              ],
              selected: _tab,
              onChanged: (t) => setState(() => _tab = t),
            ),
            const SizedBox(height: 14),
            if (cardEnabled) ...[
              ProfessorLinksSheetRow(
                key: const Key('athlete-billing-saved-card'),
                icon: Icons.credit_card_rounded,
                title: 'Cartão salvo',
                subtitle: 'Débito automático dos planos de horário',
                onTap: () => context.push(AppRoutes.savedPaymentCard),
              ),
              const SizedBox(height: 14),
            ],
            ...switch (_tab) {
              AthleteBillingTab.open => _open(),
              AthleteBillingTab.recurring => _recurring(),
              AthleteBillingTab.history => _history(),
            },
          ],
        ),
      ),
    );
  }

  List<Widget> _open() {
    final open = ref.watch(athleteOpenChargesProvider);
    if (open == null) return const [_Loading()];
    final kind = _kind;
    final list =
        kind == null ? open : open.where((c) => c.kind == kind).toList();
    return [
      if (open.isNotEmpty) ...[
        AthleteOpenSummaryCard(charges: open),
        const SizedBox(height: 14),
      ],
      AthleteChargeKindFilter(
        selected: _kind,
        onChanged: (k) => setState(() => _kind = k),
      ),
      const SizedBox(height: 12),
      if (list.isEmpty)
        ProfessorLinksCard(
          key: const Key('athlete-billing-open-empty'),
          child: ProfessorMutedText(
            kind == null
                ? 'Nada em aberto. Quando uma arena, um professor, um centro '
                    'de treinamento ou um torneio cobrar você, aparece aqui.'
                : 'Nada em aberto em ${kind.label}.',
          ),
        )
      else
        for (final c in list) ...[
          AthleteChargeRow(
            charge: c,
            onTap: () => openAthleteCharge(context, c),
          ),
          const SizedBox(height: 8),
        ],
      const SizedBox(height: 6),
      const _Footnote(
        'Cada cobrança mostra quem recebe. Arena, centro, professor e '
        'organizador cobram direto; o NexaGO só reúne tudo aqui.',
      ),
    ];
  }

  List<Widget> _recurring() {
    final list = ref.watch(athleteRecurringChargesProvider);
    if (list == null) return const [_Loading()];
    if (list.isEmpty) {
      return const [
        ProfessorLinksCard(
          key: Key('athlete-billing-recurring-empty'),
          child: ProfessorMutedText(
            'Nenhum plano ativo. Horário fixo na arena, turma, centro de '
            'treinamento e mensalidade com professor aparecem aqui.',
          ),
        ),
      ];
    }
    final colors = context.themeColors;
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Text(
                'Compromisso mensal',
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ),
            Text(
              formatBRL(monthlyCommitment(list)),
              key: const Key('athlete-billing-monthly'),
              style: ProfessorLinksStyle.display(20, color: colors.onSurface),
            ),
          ],
        ),
      ),
      for (final r in list) ...[
        AthleteRecurringCard(
          item: r,
          onTap: () => openRecurringCharge(context, r),
        ),
        const SizedBox(height: 10),
      ],
    ];
  }

  List<Widget> _history() {
    final months = ref.watch(athletePaidHistoryProvider);
    if (months == null) return const [_Loading()];
    if (months.isEmpty) {
      return const [
        ProfessorLinksCard(
          key: Key('athlete-billing-history-empty'),
          child: ProfessorMutedText(
            'Nenhum pagamento ainda. As mensalidades pagas de aulas e do '
            'horário fixo ficam aqui, com o comprovante quando houver.',
          ),
        ),
      ];
    }
    return [
      AthletePaidMonthSummary(month: months.first),
      for (final m in months) ...[
        TrainingSectionTitle(paidMonthLabel(m.monthKey)),
        AthletePaidMonthList(month: m),
      ],
      const SizedBox(height: 12),
      const _Footnote(
        'Reservas e inscrições pagas ficam em Minhas reservas e Meus '
        'torneios.',
      ),
    ];
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => const NexaListSkeleton.cards(
        count: 4,
        cardHeight: 68,
        padding: EdgeInsets.zero,
        gap: 8,
      );
}

class _Footnote extends StatelessWidget {
  const _Footnote(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Text(
          text,
          style: AppTypography.bodyS.copyWith(
            fontSize: 11.5,
            height: 1.45,
            color: ProfessorLinksStyle.dim(context.themeColors),
          ),
        ),
      );
}
