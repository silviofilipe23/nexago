import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_wallet.dart';
import '../../domain/professor_students_logic.dart' show professorShortDate;
import '../../domain/professor_wallet_logic.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_wallet_widgets.dart';

/// Regra fixa do aluno da carteira.
const kProfessorWalletStudentRule =
    'Aluno da sua carteira: a arena não vê dados nem valores.';

/// B4 Aluno da carteira (independente): o combinado (plano e recorrência),
/// os pagamentos e "Cobrar" (B15). Arquivar fica no menu.
class ProfessorWalletStudentPage extends ConsumerWidget {
  const ProfessorWalletStudentPage({super.key, required this.athleteId});

  final String athleteId;

  void _back(BuildContext context) =>
      popOrGo(context, AppRoutes.professorWallet);

  Future<void> _archive(
    BuildContext context,
    WidgetRef ref,
    ProfessorWalletStudent s,
  ) async {
    final ok = await confirmProfessorWalletAction(
      context,
      title: s.invited ? 'Cancelar convite?' : 'Arquivar aluno?',
      body: s.invited
          ? '${s.name} não entra na sua carteira. Você pode convidar de novo '
              'depois.'
          : '${s.name} sai da sua carteira e a cobrança recorrente para. As '
              'cobranças já enviadas continuam valendo.',
      confirmLabel: s.invited ? 'Cancelar convite' : 'Arquivar',
    );
    if (!ok || !context.mounted) return;
    final done = await runProfessorWalletAction(
      context,
      () =>
          ref.read(professorWalletRepositoryProvider).archiveStudent(athleteId),
      message: s.invited ? 'Convite cancelado.' : '${s.name} foi arquivado.',
    );
    if (done && context.mounted) _back(context);
  }

  Future<void> _stopRecurring(
    BuildContext context,
    WidgetRef ref,
    ProfessorWalletStudent s,
  ) async {
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Parar a cobrança recorrente?',
      body: 'Não geramos mais a cobrança do mês para ${s.name}. As já '
          'enviadas continuam valendo.',
      confirmLabel: 'Parar',
    );
    if (!ok || !context.mounted) return;
    await runProfessorWalletAction(
      context,
      () =>
          ref.read(professorWalletRepositoryProvider).stopRecurring(athleteId),
      message: 'Recorrência parada.',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(professorWalletAllStudentsProvider);
    ProfessorWalletStudent? student;
    for (final s in async.valueOrNull ?? const <ProfessorWalletStudent>[]) {
      if (s.athleteId == athleteId) student = s;
    }
    if (student == null || !student.inWallet) {
      return ProfessorLinksScaffold(
        title: 'Aluno',
        onBack: () => _back(context),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (!async.hasValue && !async.hasError)
              const ProfessorWalletLoading()
            else if (async.hasError && !async.hasValue)
              ProfessorRetryCard(
                message: 'Não foi possível carregar o aluno.',
                onRetry: () =>
                    ref.invalidate(professorWalletAllStudentsProvider),
              )
            else
              const ProfessorLinksCard(
                key: Key('professor-wallet-student-missing'),
                child: ProfessorMutedText(
                  'Este aluno não está mais na sua carteira.',
                ),
              ),
          ],
        ),
      );
    }

    final s = student;
    final todayKey = ref.watch(professorWalletTodayKeyProvider);
    final plans =
        ref.watch(professorWalletPlansProvider).valueOrNull ?? const [];
    final charges = ref.watch(professorWalletChargesProvider).valueOrNull;
    final mine =
        charges == null ? null : professorStudentCharges(charges, athleteId);
    final plan = professorPlanById(plans, s.planId);

    return ProfessorLinksScaffold(
      title: s.name,
      subtitle: 'CARTEIRA PRÓPRIA',
      onBack: () => _back(context),
      trailing: PopupMenuButton<String>(
        key: const Key('professor-wallet-student-menu'),
        icon: const Icon(Icons.more_horiz_rounded),
        onSelected: (_) => _archive(context, ref, s),
        itemBuilder: (_) => [
          PopupMenuItem(
            key: const Key('professor-wallet-student-archive'),
            value: 'archive',
            child: Text(s.invited ? 'Cancelar convite' : 'Arquivar aluno'),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                _Header(student: s),
                if (s.invited) ...[
                  const SizedBox(height: 14),
                  const ProfessorLinksNote(
                    'Convite enviado. Quando o aluno aceitar no app dele, você '
                    'já pode cobrar.',
                    key: Key('professor-wallet-student-invited-note'),
                    tone: ProfessorLinksNoteTone.yellow,
                  ),
                ],
                const SizedBox(height: 22),
                const ProfessorLinksKicker('Combinado com o aluno'),
                const SizedBox(height: 8),
                ProfessorRowsBlock(
                  children: [
                    ProfessorInfoRow(
                      label: 'Seu plano',
                      value: plan?.name ?? 'Sem plano padrão',
                      sub: plan == null ? null : professorPlanSubtitle(plan),
                      last: plan == null && s.recurring == null,
                    ),
                    if (plan != null)
                      ProfessorInfoRow(
                        label: 'Valor',
                        value: formatBRL(plan.priceReais),
                        last: s.recurring == null,
                      ),
                    if (s.recurring != null)
                      ProfessorInfoRow(
                        key: const Key('professor-wallet-student-recurring'),
                        label: 'Cobrança recorrente',
                        value: formatBRL(s.recurring!.amountReais),
                        sub: professorRecurringLabel(s.recurring!),
                        last: true,
                      ),
                  ],
                ),
                if (s.recurring != null) ...[
                  const SizedBox(height: 10),
                  ProfessorLinksGhostButton(
                    key: const Key('professor-wallet-stop-recurring'),
                    label: 'Parar recorrência',
                    height: 42,
                    color: AppColors.live,
                    onPressed: () => _stopRecurring(context, ref, s),
                  ),
                ],
                const SizedBox(height: 22),
                const ProfessorLinksKicker('Pagamentos'),
                const SizedBox(height: 4),
                if (mine == null)
                  const ProfessorWalletLoading()
                else if (mine.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8),
                    child: ProfessorMutedText('Nenhuma cobrança ainda.'),
                  )
                else
                  for (final c in mine)
                    ProfessorChargeRow(
                      key: Key('professor-wallet-student-charge-${c.id}'),
                      charge: c,
                      todayKey: todayKey,
                      onTap: () => showProfessorChargeSheet(context, c),
                    ),
                const SizedBox(height: 22),
                const ProfessorLinksNote(
                  kProfessorWalletStudentRule,
                  tone: ProfessorLinksNoteTone.blue,
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('professor-wallet-student-charge'),
                label: s.invited ? 'Aguardando aceite' : 'Cobrar',
                onPressed: s.active
                    ? () => context.pushNamed(
                          AppRouteNames.professorWalletCharge,
                          pathParameters: {'athleteId': athleteId},
                        )
                    : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.student});

  final ProfessorWalletStudent student;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      borderColor: ProfessorLinksStyle.blue.withValues(alpha: 0.35),
      child: Row(
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(student.name),
            photoUrl: student.photoUrl,
            size: 52,
            zoomName: student.name,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    const ProfessorLinkTypeTag(
                      ArenaProfessorLinkType.independent,
                      small: true,
                    ),
                    if (student.invited) const ProfessorWalletTag.invited(),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Preço e cobrança combinados por você',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          const Icon(
            Icons.lock_outline_rounded,
            size: 18,
            color: ProfessorLinksStyle.blue,
          ),
        ],
      ),
    );
  }
}

/// Ações da cobrança: copiar o link e cancelar (aberta ou presa gerando).
Future<void> showProfessorChargeSheet(
  BuildContext context,
  ProfessorCharge charge,
) =>
    showProfessorLinksSheet<void>(
      context,
      builder: (_) => _ChargeSheet(charge: charge),
    );

class _ChargeSheet extends ConsumerStatefulWidget {
  const _ChargeSheet({required this.charge});

  final ProfessorCharge charge;

  @override
  ConsumerState<_ChargeSheet> createState() => _ChargeSheetState();
}

class _ChargeSheetState extends ConsumerState<_ChargeSheet> {
  bool _canceling = false;

  Future<void> _cancel() async {
    final c = widget.charge;
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Cancelar cobrança?',
      body: 'A fatura de ${formatBRL(c.amountReais)} é cancelada no Asaas e '
          'o aluno não consegue mais pagar por ela.',
      confirmLabel: 'Cancelar cobrança',
    );
    if (!ok || !mounted) return;
    setState(() => _canceling = true);
    final navigator = Navigator.of(context);
    final done = await runProfessorWalletAction(
      context,
      () => ref.read(professorWalletRepositoryProvider).cancelCharge(c.id),
      message: 'Cobrança cancelada.',
    );
    if (!mounted) return;
    if (done) {
      navigator.pop();
    } else {
      setState(() => _canceling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.charge;
    final todayKey = ref.watch(professorWalletTodayKeyProvider);
    final url = c.invoiceUrl;
    return ProfessorLinksSheetBody(
      title: c.description,
      subtitle: '${formatBRL(c.amountReais)} · '
          '${professorChargeSubtitle(c, todayKey)}',
      children: [
        const SizedBox(height: 16),
        ProfessorRowsBlock(
          children: [
            ProfessorInfoRow(
              label: 'Situação',
              value: professorChargeStanding(c, todayKey).label,
            ),
            if (c.status == ProfessorChargeStatus.paid)
              ProfessorInfoRow(
                label: 'Você recebeu',
                value: formatBRL(professorChargeNet(c)),
                valueColor: AppColors.win,
                sub: c.netReais == null ? 'estimado' : 'líquido',
              ),
            ProfessorInfoRow(
              label: 'Vencimento',
              value: professorShortDate(c.dueDate),
              last: true,
            ),
          ],
        ),
        if (url != null) ...[
          const SizedBox(height: 14),
          ProfessorLinksGhostButton(
            key: const Key('professor-charge-copy-link'),
            label: 'Copiar link de pagamento',
            onPressed: () => copyProfessorInvoiceLink(context, url),
          ),
        ],
        if (professorChargeCancelable(c)) ...[
          const SizedBox(height: 10),
          ProfessorLinksGhostButton(
            key: const Key('professor-charge-cancel'),
            label: 'Cancelar cobrança',
            color: AppColors.live,
            loading: _canceling,
            onPressed: _cancel,
          ),
        ],
      ],
    );
  }
}
