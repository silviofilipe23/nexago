import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_own_classes_providers.dart';
import '../../domain/professor_own_classes.dart';
import '../actions/professor_action_widgets.dart' show ProfessorActionHint;
import 'professor_own_class_widgets.dart';

/// Turmas próprias no Minhas turmas (A4): as ativas, as encerradas
/// recolhidas e "+ Turma própria" — só com vínculo independente ativo e
/// "Horário fixo" liberado; sem a chave, a dica de pedir à arena. Some para
/// quem não é independente nem tem turma própria.
class ProfessorOwnClassesSection extends ConsumerStatefulWidget {
  const ProfessorOwnClassesSection({super.key});

  @override
  ConsumerState<ProfessorOwnClassesSection> createState() =>
      _ProfessorOwnClassesSectionState();
}

class _ProfessorOwnClassesSectionState
    extends ConsumerState<ProfessorOwnClassesSection> {
  bool _showEnded = false;

  Future<void> _new() async {
    final arenas = ref.read(professorOwnClassArenasProvider) ?? const [];
    final arenaId = await pickProfessorOwnClassArena(context, arenas);
    if (arenaId == null || !mounted) return;
    context.pushNamed(
      AppRouteNames.professorOwnClassNew,
      queryParameters: {'arenaId': arenaId},
    );
  }

  void _open(ProfessorOwnClass c) => context.pushNamed(
        AppRouteNames.professorOwnClass,
        pathParameters: {'classId': c.id},
      );

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final all = ref.watch(professorOwnClassesProvider).valueOrNull ?? const [];
    final eligible = ref.watch(professorOwnClassArenasProvider) ?? const [];
    final locked = ref.watch(professorOwnClassLockedArenasProvider);
    if (all.isEmpty && eligible.isEmpty && locked.isEmpty) {
      return const SizedBox.shrink();
    }
    final split = professorSplitOwnClasses(all);

    Widget card(ProfessorOwnClass c) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: ProfessorOwnClassCard(
            key: Key('professor-own-class-${c.id}'),
            cls: c,
            onTap: () => _open(c),
          ),
        );

    return Column(
      key: const Key('professor-own-classes'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ProfessorLinksKicker('Turmas próprias'),
        const SizedBox(height: 8),
        for (final c in split.active) card(c),
        if (split.active.isEmpty && eligible.isNotEmpty)
          const Padding(
            padding: EdgeInsets.only(bottom: 10),
            child: ProfessorActionHint(
              'Monte uma turma sua com horário fixo de quadra e alunos da '
              'sua carteira.',
            ),
          ),
        if (eligible.isNotEmpty)
          ProfessorLinksGhostButton(
            key: const Key('professor-own-class-new'),
            label: '+ Turma própria',
            height: 44,
            onPressed: _new,
          )
        else if (locked.isNotEmpty)
          ProfessorLinksNote(
            professorOwnClassLockedHint(locked),
            key: const Key('professor-own-class-locked'),
            tone: ProfessorLinksNoteTone.blue,
          ),
        if (split.ended.isNotEmpty) ...[
          const SizedBox(height: 8),
          InkWell(
            key: const Key('professor-own-classes-ended-toggle'),
            onTap: () => setState(() => _showEnded = !_showEnded),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: ProfessorLinksKicker(
                      'Encerradas · ${split.ended.length}',
                    ),
                  ),
                  Icon(
                    _showEnded
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    size: 18,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ],
              ),
            ),
          ),
          if (_showEnded)
            for (final c in split.ended) card(c),
        ],
        const SizedBox(height: 18),
      ],
    );
  }
}
