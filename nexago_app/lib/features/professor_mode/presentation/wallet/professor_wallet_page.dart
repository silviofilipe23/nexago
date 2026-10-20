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
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_lessons.dart';
import '../../domain/professor_wallet.dart';
import '../../domain/professor_wallet_logic.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_wallet_widgets.dart';

/// Abre o aluno da carteira (B4).
void openProfessorWalletStudent(BuildContext context, String athleteId) =>
    context.pushNamed(
      AppRouteNames.professorWalletStudent,
      pathParameters: {'athleteId': athleteId},
    );

/// B16 Carteira própria: líquido do mês (recebido − custo de quadra), a
/// receber, atrasados com "Lembrar", custo de quadra (reservas como
/// professor), alunos da carteira e as cobranças recentes.
class ProfessorWalletPage extends ConsumerWidget {
  const ProfessorWalletPage({super.key});

  static const _recentLimit = 10;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todayKey = ref.watch(professorWalletTodayKeyProvider);
    final account = ref.watch(professorPayoutAccountProvider);
    final chargesAsync = ref.watch(professorWalletChargesProvider);
    final studentsAsync = ref.watch(professorWalletStudentsProvider);
    final plans =
        ref.watch(professorWalletPlansProvider).valueOrNull ?? const [];
    final charges = chargesAsync.valueOrNull;
    final students = studentsAsync.valueOrNull;
    final summary = charges == null
        ? null
        : professorWalletSummary(charges, todayKey: todayKey);
    final month = professorMonthName(todayKey.substring(0, 7));
    final bookingsAsync = ref.watch(professorCourtBookingsProvider);
    final courtCost = professorCourtCostOfMonth(
      bookingsAsync.valueOrNull ?? const [],
      todayKey: todayKey,
    );

    return ProfessorLinksScaffold(
      title: 'Carteira própria',
      subtitle: month.toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.professorMore),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (account.hasValue &&
              !(account.valueOrNull?.isApproved ?? false)) ...[
            ProfessorAccountBanner(account: account.valueOrNull),
            const SizedBox(height: 14),
          ],
          if (summary == null && chargesAsync.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar suas cobranças.',
              onRetry: () => ref.invalidate(professorWalletChargesProvider),
            )
          else if (summary == null)
            const ProfessorWalletLoading()
          else ...[
            _Hero(summary: summary, month: month, courtCost: courtCost),
            if (summary.overdue.isNotEmpty) ...[
              const SizedBox(height: 22),
              ProfessorLinksKicker(
                'Atrasados · ${summary.overdue.length}',
                color: AppColors.live,
              ),
              const SizedBox(height: 4),
              for (final c in summary.overdue)
                _OverdueRow(charge: c, todayKey: todayKey),
            ],
          ],
          const SizedBox(height: 22),
          const ProfessorLinksKicker('Custo de quadra'),
          const SizedBox(height: 8),
          ProfessorRowsBlock(
            key: const Key('professor-wallet-court-cost'),
            children: [
              ProfessorInfoRow(
                key: const Key('professor-wallet-court-past'),
                label: 'Reservas do mês',
                value: formatBRL(courtCost.pastReais),
                sub: _reservas(courtCost.pastCount),
              ),
              ProfessorInfoRow(
                key: const Key('professor-wallet-court-upcoming'),
                label: 'Próximas reservadas',
                value: formatBRL(courtCost.upcomingReais),
                sub: '${_reservas(courtCost.upcomingCount)} até o fim do mês',
                last: true,
              ),
            ],
          ),
          const SizedBox(height: 22),
          Row(
            children: [
              Expanded(
                child: ProfessorLinksKicker(
                  students == null
                      ? 'Alunos da carteira'
                      : 'Alunos da carteira · ${students.length}',
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          if (students == null && studentsAsync.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar seus alunos.',
              onRetry: () => ref.invalidate(professorWalletAllStudentsProvider),
            )
          else if (students == null)
            const ProfessorWalletLoading()
          else if (students.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: ProfessorMutedText(
                'Nenhum aluno na sua carteira ainda. Adicione um atleta '
                'nexaGO: ele recebe um convite e, ao aceitar, você já pode '
                'cobrar.',
              ),
            )
          else
            for (final s in students)
              ProfessorWalletStudentRow(
                key: Key('professor-wallet-student-${s.athleteId}'),
                student: s,
                planName: professorPlanById(plans, s.planId)?.name,
                standing: charges == null
                    ? null
                    : professorWalletStudentStanding(
                        charges, s.athleteId, todayKey),
                onTap: () => openProfessorWalletStudent(context, s.athleteId),
              ),
          const SizedBox(height: 12),
          ProfessorLinksGhostButton(
            key: const Key('professor-wallet-add-student'),
            label: 'Adicionar aluno',
            height: 44,
            onPressed: () =>
                context.pushNamed(AppRouteNames.professorWalletAddStudent),
          ),
          if (charges != null && charges.isNotEmpty) ...[
            const SizedBox(height: 22),
            const ProfessorLinksKicker('Cobranças recentes'),
            const SizedBox(height: 4),
            for (final c in charges.take(_recentLimit))
              ProfessorChargeRow(
                key: Key('professor-wallet-charge-${c.id}'),
                charge: c,
                todayKey: todayKey,
                withStudent: true,
                onTap: () => openProfessorWalletStudent(context, c.athleteId),
              ),
          ],
        ],
      ),
    );
  }
}

String _reservas(int n) => '$n reserva${n == 1 ? '' : 's'} como professor';

/// Líquido do mês = recebido dos alunos − custo de quadra (como no B16).
class _Hero extends StatelessWidget {
  const _Hero({
    required this.summary,
    required this.month,
    required this.courtCost,
  });

  final ProfessorWalletSummary summary;
  final String month;
  final ProfessorCourtCost courtCost;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const blue = ProfessorLinksStyle.blue;
    return Container(
      key: const Key('professor-wallet-hero'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: blue.withValues(alpha: 0.35)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.62],
          colors: [blue.withValues(alpha: 0.18), colors.surfaceCard],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProfessorLinksKicker('Líquido em $month', color: blue),
          const SizedBox(height: 8),
          Text(
            formatBRL(summary.receivedNet - courtCost.totalReais),
            key: const Key('professor-wallet-net'),
            style: ProfessorLinksStyle.display(36, color: colors.onSurface),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _HeroFigure(
                  value: formatBRL(summary.receivedNet),
                  valueKey: const Key('professor-wallet-received'),
                  label: 'recebido de alunos · ${summary.receivedCount} '
                      'pagamento${summary.receivedCount == 1 ? '' : 's'}',
                  color: AppColors.win,
                ),
              ),
              _HeroFigure(
                value: '− ${formatBRL(courtCost.totalReais)}',
                valueKey: const Key('professor-wallet-court-total'),
                label: '${courtCost.count} reserva'
                    '${courtCost.count == 1 ? '' : 's'} de quadra',
                color: ProfessorLinksStyle.mute(colors),
                end: true,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _HeroFigure(
                  value: formatBRL(summary.toReceive),
                  valueKey: const Key('professor-wallet-to-receive'),
                  label: 'a receber · ${summary.open.length} em aberto',
                  color: AppColors.pending,
                ),
              ),
              _HeroFigure(
                value: '${summary.overdue.length}',
                valueKey: const Key('professor-wallet-overdue-count'),
                label: 'atrasado${summary.overdue.length == 1 ? '' : 's'}',
                color: summary.overdue.isEmpty
                    ? ProfessorLinksStyle.mute(colors)
                    : AppColors.live,
                end: true,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroFigure extends StatelessWidget {
  const _HeroFigure({
    required this.value,
    required this.label,
    required this.color,
    required this.valueKey,
    this.end = false,
  });

  final String value;
  final String label;
  final Color color;
  final Key valueKey;
  final bool end;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment:
            end ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Text(
            value,
            key: valueKey,
            style: ProfessorLinksStyle.display(
              15,
              weight: FontWeight.w700,
              color: color,
            ),
          ),
          Text(
            label,
            style: AppTypography.bodyS.copyWith(
              fontSize: 10.5,
              color: ProfessorLinksStyle.dim(context.themeColors),
            ),
          ),
        ],
      );
}

class _OverdueRow extends ConsumerWidget {
  const _OverdueRow({required this.charge, required this.todayKey});

  final ProfessorCharge charge;
  final String todayKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Row(
      children: [
        Expanded(
          child: ProfessorChargeRow(
            charge: charge,
            todayKey: todayKey,
            withStudent: true,
            onTap: () => openProfessorWalletStudent(context, charge.athleteId),
          ),
        ),
        const SizedBox(width: 10),
        TextButton(
          key: Key('professor-wallet-remind-${charge.id}'),
          onPressed: () => ref.read(professorReminderSharerProvider)(
            context,
            professorChargeReminderMessage(charge, todayKey),
          ),
          child: const Text('Lembrar'),
        ),
      ],
    );
  }
}

/// Linha do aluno da carteira (B16 e a aba Alunos).
class ProfessorWalletStudentRow extends StatelessWidget {
  const ProfessorWalletStudentRow({
    super.key,
    required this.student,
    required this.onTap,
    this.planName,
    this.standing,
    this.showWalletTag = false,
  });

  final ProfessorWalletStudent student;
  final String? planName;
  final ProfessorChargeStanding? standing;
  final VoidCallback onTap;

  /// Selo azul "CARTEIRA" (na lista unificada da aba Alunos).
  final bool showWalletTag;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = student;
    final sub = s.invited
        ? 'Aguardando o aluno aceitar o convite'
        : [
            'Carteira própria',
            if (planName != null) planName!,
            if (s.recurring != null) 'recorrente dia ${s.recurring!.dueDay}',
          ].join(' · ');
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: ProfessorLinksStyle.line(colors)),
          ),
        ),
        child: Row(
          children: [
            ArenaClassAvatar(
              initials: arenaClassInitials(s.name),
              photoUrl: s.photoUrl,
              size: 40,
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          s.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ProfessorLinksStyle.display(
                            13.5,
                            weight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      if (showWalletTag) ...[
                        const SizedBox(width: 6),
                        const ProfessorWalletTag.wallet(),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            if (s.invited)
              const ProfessorWalletTag.invited()
            else if (standing != null)
              ProfessorChargePill(standing!),
          ],
        ),
      ),
    );
  }
}
