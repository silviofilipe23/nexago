import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassInitials;
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart'
    show professorAgendaNowProvider, professorOwnClassNextBookingProvider;
import '../../application/professor_own_classes_providers.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_actions_logic.dart' show professorDayLabel;
import '../../domain/professor_lesson_plans.dart' show LessonPlanKind;
import '../../domain/professor_own_classes.dart';
import '../../domain/professor_students_logic.dart' show professorShortDate;
import '../../domain/professor_wallet.dart';
import '../lesson_plans/lesson_plan_agenda_card.dart';
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_own_class_widgets.dart';

/// Detalhe da turma própria: dias, horário, a situação de cada série na
/// arena, quadra, mensalidade, o plano da próxima aula, os alunos da
/// carteira, "Editar alunos" e "Encerrar turma".
class ProfessorOwnClassPage extends ConsumerStatefulWidget {
  const ProfessorOwnClassPage({super.key, required this.classId});

  final String classId;

  @override
  ConsumerState<ProfessorOwnClassPage> createState() =>
      _ProfessorOwnClassPageState();
}

class _ProfessorOwnClassPageState extends ConsumerState<ProfessorOwnClassPage> {
  bool _ending = false;

  void _back() => popOrGo(context, AppRoutes.professorClasses);

  Future<void> _editStudents(
    ProfessorOwnClass cls,
    Map<String, ProfessorWalletStudent> wallet,
  ) async {
    final added = await showProfessorOwnClassStudentsSheet(context, cls);
    if (added == null || added.isEmpty || !mounted) return;
    // Quem entrou agora: oferece a cobrança mensal pela carteira (B15).
    await offerProfessorOwnClassCharge(
      context,
      cls: cls,
      students: [
        for (final id in added)
          if (wallet[id] case final s?) s,
      ],
      title: 'Cobrar mensalidade?',
      subtitle: 'Abra a cobrança mensal de '
          '${professorOwnClassPriceLabel(cls)} para quem entrou agora — ou '
          'feche e cobre depois.',
    );
  }

  Future<void> _end(ProfessorOwnClass cls) async {
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Encerrar turma?',
      body: 'O horário fixo na ${cls.arenaName} é cancelado e as próximas '
          'datas voltam para a grade da arena. As cobranças já enviadas '
          'continuam valendo.',
      confirmLabel: 'Encerrar turma',
    );
    if (!ok || !mounted) return;
    setState(() => _ending = true);
    final done = await runProfessorWalletAction(
      context,
      () => ref.read(professorOwnClassesRepositoryProvider).end(cls.id),
      message: 'Turma encerrada. A quadra foi liberada.',
    );
    if (mounted) setState(() => _ending = false);
    if (done && mounted) _back();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(professorOwnClassProvider(widget.classId));
    final cls = async.valueOrNull;
    final todayKey = ref.watch(professorAgendaNowProvider).todayKey;
    final next = cls != null && cls.isActive
        ? ref.watch(professorOwnClassNextBookingProvider(cls.id))
        : null;
    final wallet = {
      for (final s
          in ref.watch(professorWalletAllStudentsProvider).valueOrNull ??
              const <ProfessorWalletStudent>[])
        s.athleteId: s,
    };

    return ProfessorLinksScaffold(
      title: cls?.name ?? 'Turma própria',
      subtitle: cls == null
          ? 'TURMA PRÓPRIA'
          : '${cls.arenaName.toUpperCase()} · TURMA PRÓPRIA',
      onBack: _back,
      body: cls == null
          ? (async.isLoading
              ? const ProfessorWalletLoading()
              : ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                  children: const [
                    ProfessorMutedText('Turma não encontrada.'),
                  ],
                ))
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    children: [
                      Row(
                        children: [
                          if (cls.isActive)
                            const ProfessorOwnClassBadge()
                          else
                            ArenaClassTag(
                              key: const Key('professor-own-class-ended'),
                              label: 'Encerrada',
                              color: ProfessorLinksStyle.mute(colors),
                            ),
                        ],
                      ),
                      if (!cls.isActive) ...[
                        const SizedBox(height: 10),
                        ProfessorLinksNote(
                          professorOwnClassEndedLabel(cls.endedReason),
                          key: const Key('professor-own-class-ended-note'),
                          tone: cls.endedReason ==
                                  kProfessorOwnClassArenaCanceled
                              ? ProfessorLinksNoteTone.red
                              : ProfessorLinksNoteTone.neutral,
                        ),
                      ],
                      const SizedBox(height: 12),
                      ProfessorRowsBlock(
                        children: [
                          ProfessorInfoRow(
                            label: 'Dias e horário',
                            value: professorOwnClassScheduleLabel(cls),
                          ),
                          ProfessorInfoRow(
                            label: 'Quadra',
                            value: cls.courtName,
                            sub: cls.pricePerOccurrenceReais > 0
                                ? '${cls.arenaName} · '
                                    '${professorOwnClassMoney(cls.pricePerOccurrenceReais)}'
                                    ' por aula'
                                : cls.arenaName,
                          ),
                          ProfessorInfoRow(
                            key: const Key('professor-own-class-spots'),
                            label: 'Vagas',
                            value: '${cls.studentCount}/${cls.capacity}',
                          ),
                          ProfessorInfoRow(
                            key: const Key('professor-own-class-monthly'),
                            label: 'Mensalidade por aluno',
                            value: formatBRL(cls.monthlyPriceReais),
                            sub: 'SEU PREÇO · cobrado pela carteira',
                            last: cls.startDate.isEmpty,
                          ),
                          if (cls.startDate.isNotEmpty)
                            ProfessorInfoRow(
                              label: 'Início',
                              value: professorShortDate(cls.startDate),
                              last: true,
                            ),
                        ],
                      ),
                      if (cls.weekdays.isNotEmpty) ...[
                        const SizedBox(height: 18),
                        const ProfessorLinksKicker('Horário fixo na arena'),
                        const SizedBox(height: 8),
                        ProfessorOwnClassSeriesChips(
                          key: const Key('professor-own-class-series'),
                          cls: cls,
                        ),
                      ],
                      if (next != null) ...[
                        const SizedBox(height: 18),
                        ProfessorMutedText(
                          'Próxima aula · '
                          '${professorDayLabel(next.date, todayKey)}'
                          ' · ${next.startTime}',
                          key: const Key('professor-own-class-next'),
                        ),
                        const SizedBox(height: 8),
                        LessonPlanAgendaCard(
                          kind: LessonPlanKind.booking,
                          refId: next.id,
                        ),
                      ],
                      const SizedBox(height: 18),
                      ProfessorLinksKicker(
                        'Alunos · ${cls.studentCount} de ${cls.capacity}',
                      ),
                      const SizedBox(height: 8),
                      if (cls.studentIds.isEmpty)
                        ProfessorMutedText(
                          cls.isActive
                              ? 'Nenhum aluno ainda. Em "Editar alunos" você '
                                  'escolhe da sua carteira.'
                              : 'A turma terminou sem alunos.',
                        )
                      else
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final id in cls.studentIds)
                              _StudentChip(
                                key: Key('professor-own-class-student-$id'),
                                student: wallet[id],
                              ),
                          ],
                        ),
                      if (cls.isActive && cls.studentIds.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        ProfessorLinksGhostButton(
                          key: const Key('professor-own-class-charge'),
                          label: 'Cobrar mensalidade',
                          height: 42,
                          onPressed: () => offerProfessorOwnClassCharge(
                            context,
                            cls: cls,
                            students: [
                              for (final id in cls.studentIds)
                                if (wallet[id] case final s? when s.active) s,
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (cls.isActive)
                  SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ProfessorLinksPrimaryButton(
                            key: const Key('professor-own-class-edit-students'),
                            label: 'Editar alunos',
                            onPressed: _ending
                                ? null
                                : () => _editStudents(cls, wallet),
                          ),
                          const SizedBox(height: 8),
                          ProfessorLinksGhostButton(
                            key: const Key('professor-own-class-end'),
                            label: 'Encerrar turma',
                            color: AppColors.live,
                            loading: _ending,
                            onPressed: () => _end(cls),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _StudentChip extends StatelessWidget {
  const _StudentChip({super.key, required this.student});

  /// `null` = saiu da carteira (só o id na turma).
  final ProfessorWalletStudent? student;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final name = student?.name ?? 'Aluno';
    return Container(
      padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
      decoration: BoxDecoration(
        color: ProfessorLinksStyle.soft(colors),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(name),
            photoUrl: student?.photoUrl,
            size: 24,
          ),
          const SizedBox(width: 6),
          Text(
            name,
            style: AppTypography.bodyS.copyWith(
              fontSize: 12.5,
              color: colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}
