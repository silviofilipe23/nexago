import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/domain/aulas/arena_class.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/professor_actions.dart';
import '../../domain/professor_students_logic.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_action_widgets.dart';

/// B7 Converter experimental: a turma sugerida (a da experimental primeiro)
/// leva à matrícula (B6); turma lotada põe na lista de espera.
class ProfessorConvertTrialPage extends ConsumerStatefulWidget {
  const ProfessorConvertTrialPage({
    super.key,
    required this.arenaId,
    required this.athleteId,
    required this.name,
    this.classId,
    this.date,
  });

  final String arenaId;
  final String athleteId;
  final String name;

  /// Turma da experimental (sugerida primeiro).
  final String? classId;
  final String? date;

  @override
  ConsumerState<ProfessorConvertTrialPage> createState() =>
      _ProfessorConvertTrialPageState();
}

class _ProfessorConvertTrialPageState
    extends ConsumerState<ProfessorConvertTrialPage> {
  String? _classId;
  bool _saving = false;

  List<ProfessorActionClass> _ordered(ProfessorActionsContext ctx) {
    final trialClass =
        widget.classId == null ? null : ctx.classById(widget.classId!);
    return [
      ...ctx.classes.where((c) => c.classId == widget.classId),
      ...ctx.classes.where((c) =>
          c.classId != widget.classId &&
          (trialClass == null || c.level == trialClass.level)),
      ...ctx.classes.where((c) =>
          c.classId != widget.classId &&
          trialClass != null &&
          c.level != trialClass.level),
    ];
  }

  Future<void> _next(ProfessorActionClass cls) async {
    if (!cls.isFull) {
      context.pushReplacementNamed(
        AppRouteNames.professorEnroll,
        pathParameters: {'arenaId': widget.arenaId},
        queryParameters: {
          'name': widget.name,
          'athleteId': widget.athleteId,
          'classId': cls.classId,
        },
      );
      return;
    }
    setState(() => _saving = true);
    final ok = await runProfessorAction(
      context,
      ref,
      arenaId: widget.arenaId,
      action: () async {
        await ref.read(professorActionsRepositoryProvider).addToWaitlist(
              classId: cls.classId,
              student: ProfessorActionStudent(
                athleteId: widget.athleteId,
                name: widget.name,
              ),
              note: 'Veio da experimental',
            );
        return '${widget.name} entrou na espera de ${cls.name}.';
      },
    );
    if (!ok && mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorActionPage(
      title: 'Converter experimental',
      subtitle: widget.name.toUpperCase(),
      arenaId: widget.arenaId,
      builder: (context, ctx) {
        final classes = _ordered(ctx);
        return [
          ProfessorLinksCard(
            borderColor: AppColors.pending.withValues(alpha: 0.35),
            child: Row(
              children: [
                ArenaClassAvatar(
                  initials: arenaClassInitials(widget.name),
                  size: 44,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.name,
                        style: ProfessorLinksStyle.display(15,
                            color: colors.onSurface),
                      ),
                      if (widget.date != null)
                        Text(
                          'Experimental em ${professorShortDate(widget.date!)}',
                          style: AppTypography.bodyS.copyWith(
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                    ],
                  ),
                ),
                const ArenaClassTypeTag(type: ArenaClassType.experimental),
              ],
            ),
          ),
          const ProfessorLinksKicker('Sugestão'),
          if (classes.isEmpty)
            const ProfessorMutedText('Você não tem turma ativa nesta arena.'),
          for (final c in classes)
            ArenaClassChoiceCard(
              key: Key('professor-convert-class-${c.classId}'),
              title:
                  '${c.name} · ${professorScheduleLabel(c.weekdays, c.startTime)}',
              subtitle: c.isFull
                  ? 'Turma lotada · entra na lista de espera '
                      '(${ctx.waitlistOf(c.classId).length + 1}º)'
                  : '${c.level.label} · ${c.freeSpots} vaga${c.freeSpots == 1 ? '' : 's'}',
              selected: _classId == c.classId,
              trailing: ProfessorSpotsBadge(free: c.freeSpots),
              onTap: () => setState(() => _classId = c.classId),
            ),
          const ProfessorArenaRule(
            'A matrícula usa o plano da tabela da arena. Com a cobrança '
            'online ligada, o aluno recebe o link de pagamento.',
          ),
        ];
      },
      footer: (context, ctx) {
        final cls = _classId == null ? null : ctx.classById(_classId!);
        return ProfessorLinksPrimaryButton(
          key: const Key('professor-convert-submit'),
          label: cls == null
              ? 'Escolha a turma'
              : cls.isFull
                  ? 'Pôr na lista de espera'
                  : 'Escolher plano e matricular',
          loading: _saving,
          onPressed: cls == null ? null : () => _next(cls),
        );
      },
    );
  }
}
