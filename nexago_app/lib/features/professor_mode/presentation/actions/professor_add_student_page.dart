import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/professor_actions.dart';
import '../../domain/professor_actions_logic.dart';
import '../../domain/professor_students_logic.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_action_widgets.dart';

/// Como o aluno novo começa (B5).
enum ProfessorStartOption { trial, plan, waitlist }

extension ProfessorStartOptionX on ProfessorStartOption {
  String get label => switch (this) {
        ProfessorStartOption.trial => 'Aula experimental',
        ProfessorStartOption.plan => 'Plano da arena',
        ProfessorStartOption.waitlist => 'Lista de espera',
      };

  bool allowedBy(ProfessorArenaActions a) => switch (this) {
        ProfessorStartOption.trial => a.canScheduleLessons,
        ProfessorStartOption.plan => a.canEnrollStudents,
        ProfessorStartOption.waitlist => a.canEnrollStudents,
      };
}

/// B5 Adicionar aluno (lado equipe): atleta com conta NexaGO entra numa
/// aula experimental, num plano da tabela (B6) ou na lista de espera. As
/// experimentais recentes aparecem para converter (B7). Link de convite e
/// carteira privada são da fase 3.
class ProfessorAddStudentPage extends ConsumerStatefulWidget {
  const ProfessorAddStudentPage({super.key, this.arenaId});

  final String? arenaId;

  @override
  ConsumerState<ProfessorAddStudentPage> createState() =>
      _ProfessorAddStudentPageState();
}

class _ProfessorAddStudentPageState
    extends ConsumerState<ProfessorAddStudentPage> {
  String? _arenaId;
  String? _uid;
  String _name = '';
  ProfessorStartOption? _option;
  String? _targetId;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _arenaId = widget.arenaId;
  }

  Future<void> _submit(String arenaId) async {
    final option = _option!;
    if (option == ProfessorStartOption.plan) {
      context.pushReplacementNamed(
        AppRouteNames.professorEnroll,
        pathParameters: {'arenaId': arenaId},
        queryParameters: {'name': _name, 'athleteId': _uid!},
      );
      return;
    }
    setState(() => _saving = true);
    final repo = ref.read(professorActionsRepositoryProvider);
    final student = ProfessorActionStudent(athleteId: _uid, name: _name);
    final ok = await runProfessorAction(
      context,
      ref,
      arenaId: arenaId,
      action: () async {
        if (option == ProfessorStartOption.trial) {
          await repo.addTrial(sessionId: _targetId!, student: student);
          return '$_name vem na aula experimental.';
        }
        await repo.addToWaitlist(classId: _targetId!, student: student);
        return '$_name entrou na lista de espera.';
      },
    );
    if (!ok && mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = ref.watch(professorStudentsProvider).valueOrNull;
    final arenas = snapshot?.actionArenas ?? const [];
    final arenaId =
        _arenaId ?? (arenas.length == 1 ? arenas.first.arenaId : null);
    if (arenaId == null) {
      return ProfessorLinksScaffold(
        title: 'Adicionar aluno',
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            const ProfessorLinksKicker('Para qual arena'),
            const SizedBox(height: 10),
            if (arenas.isEmpty)
              const ProfessorMutedText(
                'Nenhuma arena liberou matricular ou agendar para você. '
                'Peça à gestão em Profissionais.',
              ),
            for (final a in arenas) ...[
              ArenaClassChoiceCard(
                key: Key('professor-add-arena-${a.arenaId}'),
                title: a.arenaName,
                subtitle: 'Entra na base da arena · planos da tabela',
                selected: false,
                trailing: a.type == null
                    ? null
                    : ProfessorLinkTypeTag(a.type!, small: true),
                onTap: () => setState(() => _arenaId = a.arenaId),
              ),
              const SizedBox(height: 8),
            ],
          ],
        ),
      );
    }
    final actions =
        snapshot?.arena(arenaId)?.actions ?? ProfessorArenaActions.none;
    return ProfessorActionPage(
      title: 'Adicionar aluno',
      subtitle: snapshot?.arena(arenaId)?.arenaName.toUpperCase(),
      arenaId: arenaId,
      builder: (context, ctx) => [
        if (ctx.trials.isNotEmpty && actions.canEnrollStudents) ...[
          const ProfessorLinksKicker('Experimentais recentes'),
          for (final t in ctx.trials)
            ArenaClassChoiceCard(
              key: Key('professor-add-trial-${t.athleteId}'),
              title: t.name,
              subtitle:
                  '${t.className} · ${professorShortDate(t.date)} · converter em matrícula',
              selected: false,
              onTap: () => context.pushNamed(
                AppRouteNames.professorConvertTrial,
                pathParameters: {'arenaId': arenaId},
                queryParameters: {
                  'athleteId': t.athleteId,
                  'name': t.name,
                  'classId': t.classId,
                  'date': t.date,
                },
              ),
            ),
        ],
        const ProfessorLinksKicker('Atleta NexaGO'),
        ArenaClassAthleteSearch(
          selectedUid: _uid,
          collapseOnSelect: true,
          hint: 'Nome ou apelido do atleta',
          onSelect: (u) => setState(() {
            _uid = u.uid;
            _name = arenaClassAthleteName(u);
          }),
        ),
        if (_uid != null) ...[
          const ProfessorLinksKicker('Começa com'),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final o in ProfessorStartOption.values)
                if (o.allowedBy(actions))
                  ArenaClassChip(
                    key: Key('professor-add-option-${o.name}'),
                    label: o.label,
                    selected: _option == o,
                    onTap: () => setState(() {
                      _option = o;
                      _targetId = null;
                    }),
                  ),
            ],
          ),
          if (_option == ProfessorStartOption.trial) ...[
            const ProfessorLinksKicker('Aula com vaga'),
            ..._trialSessions(ctx),
          ],
          if (_option == ProfessorStartOption.waitlist) ...[
            const ProfessorLinksKicker('Turma'),
            for (final c in ctx.classes)
              ArenaClassChoiceCard(
                key: Key('professor-add-waitlist-${c.classId}'),
                title: c.name,
                subtitle: professorScheduleLabel(c.weekdays, c.startTime),
                trailing: ProfessorSpotsBadge(free: c.freeSpots),
                selected: _targetId == c.classId,
                onTap: () => setState(() => _targetId = c.classId),
              ),
          ],
        ],
      ],
      footer: (context, ctx) {
        final ready = _uid != null &&
            _option != null &&
            (_option == ProfessorStartOption.plan || _targetId != null);
        return ProfessorLinksPrimaryButton(
          key: const Key('professor-add-submit'),
          label: _option == ProfessorStartOption.plan
              ? 'Escolher turma e plano'
              : _uid == null
                  ? 'Adicionar aluno'
                  : 'Adicionar $_name',
          loading: _saving,
          onPressed: ready ? () => _submit(arenaId) : null,
        );
      },
    );
  }

  List<Widget> _trialSessions(ProfessorActionsContext ctx) {
    final sessions = professorMakeupSessions(ctx, studentId: _uid ?? '');
    if (sessions.isEmpty) {
      return const [
        ProfessorMutedText('Nenhuma aula sua com vaga nos próximos dias.')
      ];
    }
    return [
      for (final s in sessions)
        ArenaClassChoiceCard(
          key: Key('professor-add-session-${s.sessionId}'),
          title:
              '${s.className} · ${professorDayLabel(s.date, ctx.todayKey)} · ${s.startTime}',
          subtitle: s.courtName,
          trailing: ProfessorSpotsBadge(free: s.free),
          selected: _targetId == s.sessionId,
          onTap: () => setState(() => _targetId = s.sessionId),
        ),
    ];
  }
}
