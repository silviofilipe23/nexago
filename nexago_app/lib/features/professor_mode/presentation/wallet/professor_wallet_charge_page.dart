import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_students_logic.dart' show professorShortDate;
import '../../domain/professor_wallet.dart';
import '../../domain/professor_wallet_logic.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_wallet_widgets.dart';

/// B15 Nova cobrança: plano da tabela do professor ou valor personalizado,
/// vencimento e "Repetir todo mês". Sai uma fatura do Asaas (PIX ou cartão)
/// com o split para a conta do professor; só com a conta aprovada.
class ProfessorWalletChargePage extends ConsumerStatefulWidget {
  const ProfessorWalletChargePage({super.key, required this.athleteId});

  final String athleteId;

  @override
  ConsumerState<ProfessorWalletChargePage> createState() =>
      _ProfessorWalletChargePageState();
}

/// Escolha "Valor personalizado" (sem plano).
const _custom = '__custom__';

class _ProfessorWalletChargePageState
    extends ConsumerState<ProfessorWalletChargePage> {
  final _amount = TextEditingController();
  final _description = TextEditingController();
  String? _choice;
  String? _dueDate;
  bool _repeat = false;
  bool _saving = false;

  @override
  void dispose() {
    _amount.dispose();
    _description.dispose();
    super.dispose();
  }

  void _back() => popOrGo(
        context,
        AppRoutes.professorWalletStudent
            .replaceAll(':athleteId', widget.athleteId),
      );

  Future<void> _pickDate(String todayKey, String current) async {
    final today = DateTime.parse(todayKey);
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(current),
      firstDate: today,
      lastDate: today.add(const Duration(days: 365)),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _dueDate = '${picked.year.toString().padLeft(4, '0')}-'
          '${picked.month.toString().padLeft(2, '0')}-'
          '${picked.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _submit(ProfessorChargeInput input, String name) async {
    setState(() => _saving = true);
    final ok = await runProfessorWalletAction(
      context,
      () => ref.read(professorWalletRepositoryProvider).createCharge(input),
      message: 'Cobrança enviada para $name.',
    );
    if (!mounted) return;
    if (ok) {
      _back();
    } else {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final todayKey = ref.watch(professorWalletTodayKeyProvider);
    final accountAsync = ref.watch(professorPayoutAccountProvider);
    final account = accountAsync.valueOrNull;
    final plansAsync = ref.watch(professorWalletPlansProvider);
    final studentsAsync = ref.watch(professorWalletStudentsProvider);
    ProfessorWalletStudent? student;
    for (final s
        in studentsAsync.valueOrNull ?? const <ProfessorWalletStudent>[]) {
      if (s.athleteId == widget.athleteId) student = s;
    }
    final name = student?.name ?? 'Aluno';
    final loaded = plansAsync.hasValue && studentsAsync.hasValue;
    final plans = [
      for (final p in plansAsync.valueOrNull ?? const <ProfessorWalletPlan>[])
        if (p.active) p,
    ];

    // Padrão: o plano combinado com o aluno, senão o primeiro, senão valor.
    final choice = _choice ??
        (professorPlanById(plans, student?.planId)?.id ??
            (plans.isEmpty ? _custom : plans.first.id));
    final plan = choice == _custom ? null : professorPlanById(plans, choice);
    final canRepeat = professorCanRepeatMonthly(plan);
    final repeat = _repeat && canRepeat;
    final dueDate = _dueDate ?? professorAddDays(todayKey, 3);
    final customAmount = professorParseMoney(_amount.text);
    final amount = plan?.priceReais ?? customAmount;

    final approved = account?.isApproved ?? false;
    final studentActive = student?.active ?? false;
    final amountOk = amount != null &&
        amount >= kProfessorPriceMinReais &&
        amount <= kProfessorPriceMaxReais;
    final ready = loaded && approved && studentActive && amountOk;

    return ProfessorLinksScaffold(
      title: 'Nova cobrança',
      subtitle: '${name.toUpperCase()} · CARTEIRA',
      onBack: _back,
      body: !loaded || !accountAsync.hasValue
          ? const ProfessorWalletLoading()
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    children: [
                      if (!approved) ...[
                        ProfessorAccountBanner(account: account),
                        const SizedBox(height: 14),
                      ] else if (!studentActive) ...[
                        const ProfessorLinksNote(
                          'Só dá para cobrar depois que o aluno aceitar o '
                          'convite para a sua carteira.',
                          key: Key('professor-charge-student-not-active'),
                          tone: ProfessorLinksNoteTone.yellow,
                        ),
                        const SizedBox(height: 14),
                      ],
                      const ProfessorLinksKicker('Plano'),
                      const SizedBox(height: 8),
                      for (final p in plans) ...[
                        ArenaClassChoiceCard(
                          key: Key('professor-charge-plan-${p.id}'),
                          title: p.name,
                          subtitle: professorPlanSubtitle(p),
                          selected: choice == p.id,
                          trailing: Text(
                            formatBRL(p.priceReais),
                            style: ProfessorLinksStyle.display(
                              14,
                              color: choice == p.id
                                  ? colors.onSurface
                                  : ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                          onTap: () => setState(() => _choice = p.id),
                        ),
                        const SizedBox(height: 8),
                      ],
                      ArenaClassChoiceCard(
                        key: const Key('professor-charge-custom'),
                        title: 'Valor personalizado',
                        selected: choice == _custom,
                        onTap: () => setState(() => _choice = _custom),
                      ),
                      if (choice == _custom) ...[
                        const SizedBox(height: 14),
                        ProfessorWalletField(
                          key: const Key('professor-charge-amount'),
                          label: 'Valor (R\$)',
                          hint: 'Ex.: 150',
                          controller: _amount,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 14),
                        ProfessorWalletField(
                          key: const Key('professor-charge-description'),
                          label: 'Descrição',
                          hint: 'Ex.: Aula particular sábado',
                          controller: _description,
                          maxLength: 200,
                          textCapitalization: TextCapitalization.sentences,
                        ),
                      ],
                      const SizedBox(height: 18),
                      ProfessorRowsBlock(
                        children: [
                          InkWell(
                            key: const Key('professor-charge-due'),
                            onTap: () => _pickDate(todayKey, dueDate),
                            child: ProfessorInfoRow(
                              label: 'Vencimento',
                              value: professorShortDate(dueDate),
                              sub: 'toque para trocar',
                            ),
                          ),
                          ProfessorInfoRow(
                            label: 'Valor',
                            value: amount == null ? '—' : formatBRL(amount),
                          ),
                          ProfessorInfoRow(
                            key: const Key('professor-charge-you-receive'),
                            label: 'Você recebe',
                            value: amount == null
                                ? '—'
                                : '≈ ${formatBRL(professorShareOf(amount))}',
                            valueColor: AppColors.win,
                            sub:
                                '${100 - kProfessorChargeFeePercent}% do valor '
                                'menos a tarifa do Asaas',
                          ),
                          const ProfessorInfoRow(
                            label: 'Multa por atraso',
                            value: '2% + 1% a.m.',
                          ),
                          const ProfessorInfoRow(
                            label: 'Pagamento',
                            value: 'PIX ou cartão pelo link',
                            last: true,
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      ProfessorLinksCard(
                        padding: const EdgeInsets.fromLTRB(14, 4, 6, 4),
                        child: ProfessorWalletToggleRow(
                          key: const Key('professor-charge-repeat'),
                          title: 'Repetir todo mês',
                          subtitle: canRepeat
                              ? 'Geramos a do mês 5 dias antes do vencimento, '
                                  'até você parar'
                              : 'Só para plano mensal ou valor personalizado',
                          value: repeat,
                          onChanged: canRepeat
                              ? (v) => setState(() => _repeat = v)
                              : null,
                        ),
                      ),
                    ],
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                    child: ProfessorLinksPrimaryButton(
                      key: const Key('professor-charge-submit'),
                      label: approved
                          ? 'Enviar cobrança pelo app'
                          : 'Conta de recebimento não aprovada',
                      loading: _saving,
                      onPressed: !ready
                          ? null
                          : () => _submit(
                                ProfessorChargeInput(
                                  athleteId: widget.athleteId,
                                  planId: plan?.id,
                                  amountReais: plan == null ? amount : null,
                                  description:
                                      plan == null ? _description.text : null,
                                  dueDate: dueDate,
                                  repeatMonthly: repeat,
                                ),
                                name,
                              ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
