import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/professor_actions.dart';
import '../../domain/professor_actions_logic.dart';
import '../../domain/professor_students_logic.dart';
import '../../infrastructure/professor_actions_repository.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_action_widgets.dart';

/// B6 Matricular em turma: turma do professor com vaga, plano da tabela da
/// arena e a prévia da 1ª cobrança calculada pelo servidor. Também serve à
/// conversão da experimental (B7) e à matrícula da lista de espera (B12).
class ProfessorEnrollPage extends ConsumerStatefulWidget {
  const ProfessorEnrollPage({
    super.key,
    required this.arenaId,
    required this.studentName,
    this.athleteId,
    this.studentId,
    this.classId,
    this.waitlistEntryId,
  });

  final String arenaId;
  final String studentName;
  final String? athleteId;
  final String? studentId;
  final String? classId;
  final String? waitlistEntryId;

  @override
  ConsumerState<ProfessorEnrollPage> createState() =>
      _ProfessorEnrollPageState();
}

class _ProfessorEnrollPageState extends ConsumerState<ProfessorEnrollPage> {
  String? _classId;
  String? _planId;
  List<int>? _weekdays;
  bool _online = false;
  bool _saving = false;
  ProfessorEnrollmentPreview? _preview;
  String? _previewKey;
  String? _previewError;

  @override
  void initState() {
    super.initState();
    _classId = widget.classId;
  }

  ProfessorActionStudent get _student => ProfessorActionStudent(
        athleteId: widget.athleteId,
        studentId: widget.athleteId == null ? widget.studentId : null,
        name: widget.studentName,
      );

  ProfessorEnrollmentRequest? _request(
    ProfessorActionClass? cls,
    ProfessorPlanOption? plan,
    List<int> weekdays,
  ) {
    if (professorEnrollmentBlocker(cls, plan, weekdays) != null) return null;
    return ProfessorEnrollmentRequest(
      arenaId: widget.arenaId,
      planId: plan!.planId,
      classId: cls!.classId,
      weekdays: weekdays,
      student: _student,
      online: _online,
      waitlistEntryId: widget.waitlistEntryId,
    );
  }

  void _loadPreview(ProfessorEnrollmentRequest request) {
    final key = '${request.planId}|${request.classId}|${request.weekdays}';
    if (key == _previewKey) return;
    _previewKey = key;
    _preview = null;
    _previewError = null;
    ref
        .read(professorActionsRepositoryProvider)
        .previewEnrollment(request)
        .then((p) {
      if (mounted && _previewKey == key) setState(() => _preview = p);
    }, onError: (Object e) {
      if (mounted && _previewKey == key) {
        setState(() => _previewError = e.toString());
      }
    });
  }

  Future<void> _submit(ProfessorEnrollmentRequest request) async {
    setState(() => _saving = true);
    final ok = await runProfessorAction(
      context,
      ref,
      arenaId: widget.arenaId,
      action: () async {
        await ref.read(professorActionsRepositoryProvider).enroll(request);
        return '${widget.studentName} matriculado. A arena cuida da cobrança.';
      },
    );
    if (!ok && mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    return ProfessorActionPage(
      title: 'Matricular em turma',
      subtitle: widget.studentName.toUpperCase(),
      arenaId: widget.arenaId,
      builder: (context, ctx) {
        final cls = _classId == null ? null : ctx.classById(_classId!);
        // Mensal que cabe nos dias da turma + pacotes.
        final plans = [
          for (final p in ctx.plans)
            if (cls == null ||
                p.isPackage ||
                (p.classesPerWeek ?? 0) <= cls.weekdays.length)
              p
        ];
        ProfessorPlanOption? plan;
        for (final p in ctx.plans) {
          if (p.planId == _planId) plan = p;
        }
        final weekdays = _weekdays ??
            (cls == null ? const <int>[] : professorDefaultWeekdays(cls, plan));
        final request = _request(cls, plan, weekdays);
        if (request != null) {
          WidgetsBinding.instance
              .addPostFrameCallback((_) => _loadPreview(request));
        }
        return [
          const ProfessorLinksKicker('Turma'),
          if (ctx.classes.isEmpty)
            const ProfessorMutedText('Você não tem turma ativa nesta arena.'),
          for (final c in ctx.classes)
            ArenaClassChoiceCard(
              key: Key('professor-enroll-class-${c.classId}'),
              title: c.name,
              subtitle: professorScheduleLabel(c.weekdays, c.startTime),
              selected: c.classId == _classId,
              dimmed: c.isFull && widget.waitlistEntryId == null,
              trailing: ProfessorSpotsBadge(free: c.freeSpots),
              onTap: () => setState(() {
                _classId = c.classId;
                _weekdays = null;
                _planId = null;
              }),
            ),
          if (cls != null) ...[
            const SizedBox(height: 8),
            const ProfessorLinksKicker('Plano · tabela da arena'),
            if (plans.isEmpty)
              const ProfessorMutedText(
                'A arena não tem plano de matrícula cadastrado.',
              ),
            for (final p in plans)
              ArenaClassChoiceCard(
                key: Key('professor-enroll-plan-${p.planId}'),
                title: p.name,
                subtitle: professorPlanPriceLabel(p, formatBRL),
                selected: p.planId == _planId,
                onTap: () => setState(() {
                  _planId = p.planId;
                  _weekdays = professorDefaultWeekdays(cls, p);
                }),
              ),
          ],
          if (cls != null && plan != null) ...[
            const SizedBox(height: 8),
            const ProfessorLinksKicker('Dias'),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final d in cls.weekdays)
                  ArenaClassChip(
                    key: Key('professor-enroll-day-$d'),
                    label: '${arenaClassWeekdayShort(d)} · '
                        '${professorSpotsLabel(cls.freeOn(d)).toLowerCase()}',
                    selected: weekdays.contains(d),
                    onTap: () => setState(() {
                      final next = [...weekdays];
                      next.contains(d) ? next.remove(d) : next.add(d);
                      next.sort();
                      _weekdays = next;
                    }),
                  ),
              ],
            ),
          ],
          if (ctx.onlineBillingEnabled && plan != null)
            ArenaClassChoiceCard(
              key: const Key('professor-enroll-online'),
              title: 'Cobrar online (link de pagamento)',
              subtitle: 'O aluno paga por PIX ou cartão. Precisa do CPF '
                  'já cadastrado; senão, a recepção cobra.',
              multi: true,
              selected: _online,
              onTap: () => setState(() => _online = !_online),
            ),
          if (request != null)
            _PreviewBlock(preview: _preview, error: _previewError),
          if (cls != null && plan != null && request == null)
            ProfessorLinksNote(
              professorEnrollmentBlocker(cls, plan, weekdays)!,
              tone: ProfessorLinksNoteTone.yellow,
            ),
          const ProfessorArenaRule(
            'A arena cobra o aluno pela tabela e repassa a sua parte. '
            'Desconto e taxa ficam com a gestão.',
          ),
        ];
      },
      footer: (context, ctx) {
        final cls = _classId == null ? null : ctx.classById(_classId!);
        ProfessorPlanOption? plan;
        for (final p in ctx.plans) {
          if (p.planId == _planId) plan = p;
        }
        final weekdays = _weekdays ??
            (cls == null ? const <int>[] : professorDefaultWeekdays(cls, plan));
        final request = _request(cls, plan, weekdays);
        return ProfessorLinksPrimaryButton(
          key: const Key('professor-enroll-submit'),
          label: plan == null
              ? 'Matricular'
              : 'Matricular · ${professorPlanPriceLabel(plan, formatBRL)}',
          loading: _saving,
          onPressed: request == null ? null : () => _submit(request),
        );
      },
    );
  }
}

class _PreviewBlock extends StatelessWidget {
  const _PreviewBlock({required this.preview, required this.error});

  final ProfessorEnrollmentPreview? preview;
  final String? error;

  @override
  Widget build(BuildContext context) {
    if (error != null) {
      return ProfessorLinksNote(error!, tone: ProfessorLinksNoteTone.red);
    }
    final p = preview;
    if (p == null) {
      return const ProfessorActionHint('Calculando a primeira cobrança…');
    }
    return ProfessorRowsBlock(
      children: [
        for (final c in p.charges)
          ProfessorInfoRow(
            label: c.description,
            value: formatBRL(c.amount),
            sub: 'Vence ${professorShortDate(c.dueDate)}',
          ),
        ProfessorInfoRow(
          key: const Key('professor-enroll-total'),
          label: 'Primeira cobrança',
          value: formatBRL(p.total),
          last: true,
        ),
      ],
    );
  }
}
