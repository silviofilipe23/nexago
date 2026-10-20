import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../arena/domain/aulas/arena_class.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/professor_actions_logic.dart';
import '../../domain/professor_students.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_action_widgets.dart';

/// B8 Nova aula (equipe): particular/dupla usam 1 aula do pacote de cada
/// aluno; experimental não. A quadra quem escolhe é a arena (o servidor
/// pega a primeira livre e recusa se não houver).
class ProfessorNewLessonPage extends ConsumerStatefulWidget {
  const ProfessorNewLessonPage({
    super.key,
    required this.arenaId,
    this.studentId,
  });

  final String arenaId;
  final String? studentId;

  @override
  ConsumerState<ProfessorNewLessonPage> createState() =>
      _ProfessorNewLessonPageState();
}

class _ProfessorNewLessonPageState
    extends ConsumerState<ProfessorNewLessonPage> {
  ArenaClassType _type = ArenaClassType.particular;
  final List<String> _studentIds = [];
  String? _trialUid;
  String _trialName = '';
  String? _date;
  String? _start;
  int _minutes = 60;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.studentId != null) _studentIds.add(widget.studentId!);
  }

  int get _needed => _type == ArenaClassType.dupla ? 2 : 1;

  List<ProfessorStudent> _picked(List<ProfessorStudent> mine) => [
        for (final id in _studentIds)
          for (final s in mine)
            if (s.studentId == id) s
      ];

  String? _blocker(List<ProfessorStudent> picked) {
    if (_type == ArenaClassType.experimental) {
      if (_trialUid == null) return 'Escolha quem vem experimentar.';
    } else {
      if (picked.length != _needed) {
        return _needed == 2 ? 'Escolha os 2 alunos.' : 'Escolha o aluno.';
      }
      final noPackage = picked.where((s) => professorUsablePackage(s) == null);
      if (noPackage.isNotEmpty) {
        return '${noPackage.first.name} não tem pacote com aula sobrando — '
            'a arena precisa vender o pacote antes.';
      }
    }
    if (_date == null || _start == null) return 'Escolha o dia e o horário.';
    return null;
  }

  Future<void> _submit(List<ProfessorStudent> picked) async {
    setState(() => _saving = true);
    final students = _type == ArenaClassType.experimental
        ? [ProfessorActionStudent(athleteId: _trialUid, name: _trialName)]
        : [
            for (final s in picked)
              ProfessorActionStudent(
                athleteId: s.athleteId,
                studentId: s.studentId,
                name: s.name,
              )
          ];
    final ok = await runProfessorAction(
      context,
      ref,
      arenaId: widget.arenaId,
      action: () async {
        final court =
            await ref.read(professorActionsRepositoryProvider).createLesson(
                  arenaId: widget.arenaId,
                  type: _type.id,
                  date: _date!,
                  startTime: _start!,
                  endTime: professorAddMinutes(_start!, _minutes),
                  students: students,
                );
        return 'Aula agendada na $court.';
      },
    );
    if (!ok && mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = ref.watch(professorStudentsProvider).valueOrNull;
    final mine = [
      for (final s in snapshot?.students ?? const <ProfessorStudent>[])
        if (s.arenaId == widget.arenaId) s
    ];
    final picked = _picked(mine);
    return ProfessorActionPage(
      title: 'Nova aula',
      subtitle: 'QUADRA PELA ARENA',
      arenaId: widget.arenaId,
      builder: (context, ctx) => [
        Wrap(
          spacing: 6,
          children: [
            for (final t in const [
              ArenaClassType.particular,
              ArenaClassType.dupla,
              ArenaClassType.experimental,
            ])
              ArenaClassChip(
                key: Key('professor-lesson-type-${t.id}'),
                label: t.label,
                selected: _type == t,
                onTap: () => setState(() {
                  _type = t;
                  if (_studentIds.length > _needed) {
                    _studentIds.removeRange(_needed, _studentIds.length);
                  }
                }),
              ),
          ],
        ),
        ProfessorLinksKicker(
          _type == ArenaClassType.experimental
              ? 'Quem vem experimentar'
              : _needed == 2
                  ? 'Alunos · ${picked.length} de 2'
                  : 'Aluno',
        ),
        if (_type == ArenaClassType.experimental)
          ArenaClassAthleteSearch(
            selectedUid: _trialUid,
            onSelect: (u) => setState(() {
              _trialUid = u.uid;
              _trialName = arenaClassAthleteName(u);
            }),
          )
        else ...[
          if (mine.isEmpty)
            const ProfessorMutedText('Você ainda não tem alunos nesta arena.'),
          for (final s in mine)
            ArenaClassChoiceCard(
              key: Key('professor-lesson-student-${s.studentId}'),
              title: s.name,
              subtitle: _packageLabel(s),
              multi: _needed > 1,
              selected: _studentIds.contains(s.studentId),
              dimmed: professorUsablePackage(s) == null,
              trailing: ArenaClassAvatar(
                initials: arenaClassInitials(s.name),
                photoUrl: s.photoUrl,
                size: 32,
              ),
              onTap: () => setState(() {
                if (_studentIds.contains(s.studentId)) {
                  _studentIds.remove(s.studentId);
                } else {
                  if (_studentIds.length >= _needed) _studentIds.removeAt(0);
                  _studentIds.add(s.studentId);
                }
              }),
            ),
        ],
        const ProfessorLinksKicker('Dia'),
        SizedBox(
          height: 34,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final d in professorNextDays(ctx.todayKey, 14)) ...[
                ArenaClassChip(
                  key: Key('professor-lesson-day-$d'),
                  label: professorDayLabel(d, ctx.todayKey),
                  selected: _date == d,
                  onTap: () => setState(() => _date = d),
                ),
                const SizedBox(width: 6),
              ],
            ],
          ),
        ),
        const ProfessorLinksKicker('Horário'),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final t in kProfessorLessonStartTimes)
              ArenaClassChip(
                key: Key('professor-lesson-start-$t'),
                label: t,
                selected: _start == t,
                onTap: () => setState(() => _start = t),
              ),
          ],
        ),
        Wrap(
          spacing: 6,
          children: [
            for (final m in const [60, 90])
              ArenaClassChip(
                key: Key('professor-lesson-minutes-$m'),
                label: m == 60 ? '1h' : '1h30',
                selected: _minutes == m,
                onTap: () => setState(() => _minutes = m),
              ),
          ],
        ),
        ProfessorRowsBlock(children: [
          const ProfessorInfoRow(
            label: 'Quadra',
            value: 'Pela arena',
            sub: 'A primeira livre no horário · sem custo para você',
          ),
          ProfessorInfoRow(
            key: const Key('professor-lesson-billing'),
            label: 'Cobrança',
            value: _type == ArenaClassType.experimental
                ? 'Regra da arena'
                : 'Usa 1 aula do pacote',
            sub: _type == ArenaClassType.experimental
                ? 'A recepção cobra a experimental, se houver preço'
                : picked.map(_packageLabel).join(' · '),
            last: true,
          ),
        ]),
        if (_blocker(picked) case final String reason
            when picked.isNotEmpty || _trialUid != null)
          ProfessorLinksNote(reason, tone: ProfessorLinksNoteTone.yellow),
      ],
      footer: (context, ctx) => ProfessorLinksPrimaryButton(
        key: const Key('professor-lesson-submit'),
        label: 'Agendar aula',
        loading: _saving,
        onPressed: _blocker(picked) == null ? () => _submit(picked) : null,
      ),
    );
  }

  String _packageLabel(ProfessorStudent s) {
    final p = professorUsablePackage(s);
    if (p == null) return 'Sem pacote com aula sobrando';
    final n = p.creditsLeft ?? 0;
    return '${p.name} · $n aula${n == 1 ? '' : 's'} restante${n == 1 ? '' : 's'}';
  }
}
