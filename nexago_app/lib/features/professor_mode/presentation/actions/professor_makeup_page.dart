import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/professor_actions.dart';
import '../../domain/professor_actions_logic.dart';
import '../../domain/professor_students_logic.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_action_widgets.dart';

/// B11 Reposição: o crédito do aluno (regra da arena) e as aulas do
/// professor com vaga nos próximos dias — as da turma dele primeiro.
class ProfessorMakeupPage extends ConsumerStatefulWidget {
  const ProfessorMakeupPage({
    super.key,
    required this.arenaId,
    required this.studentId,
  });

  final String arenaId;
  final String studentId;

  @override
  ConsumerState<ProfessorMakeupPage> createState() =>
      _ProfessorMakeupPageState();
}

class _ProfessorMakeupPageState extends ConsumerState<ProfessorMakeupPage> {
  String? _creditId;
  String? _sessionId;
  bool _saving = false;

  /// O escolhido ou, sem escolha, o que vence primeiro.
  String? _creditOf(ProfessorActionsContext ctx) {
    final credits = ctx.creditsOf(widget.studentId);
    return _creditId ?? (credits.isEmpty ? null : credits.first.creditId);
  }

  Future<void> _submit(String name, String creditId) async {
    setState(() => _saving = true);
    final ok = await runProfessorAction(
      context,
      ref,
      arenaId: widget.arenaId,
      action: () async {
        await ref
            .read(professorActionsRepositoryProvider)
            .addMakeup(sessionId: _sessionId!, creditId: creditId);
        return 'Reposição de $name encaixada.';
      },
    );
    if (!ok && mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final student = ref
        .watch(professorStudentsProvider)
        .valueOrNull
        ?.student(widget.arenaId, widget.studentId);
    final name = student?.name ?? 'Aluno';
    return ProfessorActionPage(
      title: 'Reposição',
      subtitle: name.toUpperCase(),
      arenaId: widget.arenaId,
      builder: (context, ctx) {
        final credits = ctx.creditsOf(widget.studentId);
        final creditId = _creditOf(ctx);
        String? expires;
        for (final c in credits) {
          if (c.creditId == creditId) expires = c.expiresOn;
        }
        final sessions = professorMakeupSessions(
          ctx,
          studentId: widget.studentId,
          preferClassIds: {
            for (final c in student?.classes ?? const []) c.classId
          },
          until: expires,
        );
        return [
          const ProfessorLinksKicker('Crédito de reposição'),
          if (credits.isEmpty)
            const ProfessorMutedText(
              'Sem crédito disponível. O crédito nasce da falta justificada '
              'ou da aula cancelada, pela regra da arena.',
            ),
          for (final c in credits)
            ArenaClassChoiceCard(
              key: Key('professor-makeup-credit-${c.creditId}'),
              title: c.sourceDate == null
                  ? 'Crédito'
                  : 'Aula perdida em ${professorShortDate(c.sourceDate!)}',
              subtitle: c.expiresOn == null
                  ? null
                  : 'Vale até ${professorShortDate(c.expiresOn!)}',
              selected: c.creditId == creditId,
              onTap: () => setState(() {
                _creditId = c.creditId;
                _sessionId = null;
              }),
            ),
          if (credits.isNotEmpty) ...[
            const SizedBox(height: 8),
            const ProfessorLinksKicker('Suas aulas com vaga'),
            if (sessions.isEmpty)
              const ProfessorMutedText(
                'Nenhuma aula sua com vaga antes do crédito vencer.',
              ),
            for (final s in sessions)
              ArenaClassChoiceCard(
                key: Key('professor-makeup-session-${s.sessionId}'),
                title:
                    '${s.className} · ${professorDayLabel(s.date, ctx.todayKey)} · ${s.startTime}',
                subtitle: s.courtName,
                selected: s.sessionId == _sessionId,
                trailing: ProfessorSpotsBadge(free: s.free),
                onTap: () => setState(() => _sessionId = s.sessionId),
              ),
          ],
          ProfessorRowsBlock(children: [
            ProfessorInfoRow(
              label: 'Validade do crédito',
              value: '${ctx.makeupValidityDays} dias',
              sub: 'Regra da arena',
              last: true,
            ),
          ]),
        ];
      },
      footer: (context, ctx) => ProfessorLinksPrimaryButton(
        key: const Key('professor-makeup-submit'),
        label: 'Encaixar $name',
        loading: _saving,
        onPressed: _creditOf(ctx) == null || _sessionId == null
            ? null
            : () => _submit(name, _creditOf(ctx)!),
      ),
    );
  }
}
