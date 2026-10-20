import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/professor_actions.dart';
import '../../domain/professor_students_logic.dart';
import '../../infrastructure/professor_actions_repository.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_action_widgets.dart';

/// B12 Lista de espera da turma: fila em ordem de chegada; "Matricular"
/// leva ao B6 com a entrada (a vaga sai da espera na mesma transação) e
/// "Tirar da espera". A oferta da vaga segue pelo WhatsApp/balcão.
class ProfessorWaitlistPage extends ConsumerWidget {
  const ProfessorWaitlistPage({
    super.key,
    required this.arenaId,
    required this.classId,
  });

  final String arenaId;
  final String classId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ProfessorActionPage(
      title: 'Lista de espera',
      arenaId: arenaId,
      builder: (context, ctx) {
        final cls = ctx.classById(classId);
        if (cls == null) {
          return const [
            ProfessorMutedText('Esta turma não está mais com você.'),
          ];
        }
        final queue = ctx.waitlistOf(classId);
        return [
          _ClassHeader(cls: cls),
          if (queue.isEmpty)
            const ProfessorLinksCard(
              key: Key('professor-waitlist-empty'),
              child: ProfessorMutedText('Ninguém esperando por esta turma.'),
            ),
          for (var i = 0; i < queue.length; i++)
            _EntryCard(
              position: i + 1,
              entry: queue[i],
              arenaId: arenaId,
              classId: classId,
              canEnroll: ctx.permissions.canEnrollStudents,
            ),
          const ProfessorArenaRule(
            'A vaga é oferecida em ordem de chegada. Pular alguém fica no '
            'histórico da turma.',
          ),
        ];
      },
      footer: (context, ctx) => ProfessorLinksGhostButton(
        key: const Key('professor-waitlist-add'),
        label: 'Pôr alguém na espera',
        onPressed: ctx.permissions.canEnrollStudents
            ? () => showProfessorLinksSheet<void>(
                  context,
                  builder: (_) =>
                      _AddWaitlistSheet(arenaId: arenaId, classId: classId),
                )
            : null,
      ),
    );
  }
}

class _ClassHeader extends StatelessWidget {
  const _ClassHeader({required this.cls});

  final ProfessorActionClass cls;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final free = cls.freeSpots;
    return ProfessorLinksCard(
      borderColor: free > 0 ? colors.win.withValues(alpha: 0.4) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProfessorLinksKicker(
            free > 0
                ? '$free vaga${free == 1 ? '' : 's'} aberta${free == 1 ? '' : 's'}'
                : 'Turma lotada',
            color: free > 0 ? colors.win : null,
          ),
          const SizedBox(height: 6),
          Text(
            cls.name,
            style: ProfessorLinksStyle.display(15, color: colors.onSurface),
          ),
          const SizedBox(height: 3),
          Text(
            professorScheduleLabel(cls.weekdays, cls.startTime),
            style: AppTypography.bodyS.copyWith(
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
      ),
    );
  }
}

class _EntryCard extends ConsumerWidget {
  const _EntryCard({
    required this.position,
    required this.entry,
    required this.arenaId,
    required this.classId,
    required this.canEnroll,
  });

  final int position;
  final ProfessorWaitlistEntry entry;
  final String arenaId;
  final String classId;
  final bool canEnroll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final first = position == 1;
    return ProfessorLinksCard(
      key: Key('professor-waitlist-entry-${entry.entryId}'),
      borderColor: first ? AppColors.brand.withValues(alpha: 0.4) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              SizedBox(
                width: 22,
                child: Text(
                  '$position',
                  style: ProfessorLinksStyle.display(
                    15,
                    color: first
                        ? AppColors.brand
                        : ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ),
              ArenaClassAvatar(
                initials: arenaClassInitials(entry.name),
                size: 36,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.name,
                      style: ProfessorLinksStyle.display(
                        13.5,
                        weight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    if (entry.note != null)
                      Text(
                        entry.note!,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                  ],
                ),
              ),
              if (entry.since != null)
                Text(
                  'DESDE ${professorShortDate(entry.since!).toUpperCase()}',
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
            ],
          ),
          if (canEnroll) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: ProfessorLinksGhostButton(
                    key: Key('professor-waitlist-remove-${entry.entryId}'),
                    label: 'Tirar da espera',
                    height: 40,
                    onPressed: () => _remove(context, ref),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ProfessorLinksPrimaryButton(
                    key: Key('professor-waitlist-enroll-${entry.entryId}'),
                    label: 'Matricular',
                    height: 40,
                    onPressed: () => context.pushNamed(
                      AppRouteNames.professorEnroll,
                      pathParameters: {'arenaId': arenaId},
                      queryParameters: {
                        'name': entry.name,
                        if (entry.athleteId != null)
                          'athleteId': entry.athleteId!,
                        'classId': classId,
                        'entryId': entry.entryId,
                      },
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _remove(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Tirar da espera?'),
        content: Text('${entry.name} sai da fila desta turma.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Voltar'),
          ),
          TextButton(
            key: const Key('professor-waitlist-remove-confirm'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Tirar'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    await runProfessorAction(
      context,
      ref,
      arenaId: arenaId,
      pop: false,
      action: () async {
        await ref
            .read(professorActionsRepositoryProvider)
            .removeFromWaitlist(classId: classId, entryId: entry.entryId);
        return '${entry.name} saiu da espera.';
      },
    );
  }
}

class _AddWaitlistSheet extends ConsumerStatefulWidget {
  const _AddWaitlistSheet({required this.arenaId, required this.classId});

  final String arenaId;
  final String classId;

  @override
  ConsumerState<_AddWaitlistSheet> createState() => _AddWaitlistSheetState();
}

class _AddWaitlistSheetState extends ConsumerState<_AddWaitlistSheet> {
  String? _uid;
  String _name = '';
  bool _saving = false;

  Future<void> _save() async {
    setState(() => _saving = true);
    final ok = await runProfessorAction(
      context,
      ref,
      arenaId: widget.arenaId,
      pop: false,
      action: () async {
        await ref.read(professorActionsRepositoryProvider).addToWaitlist(
              classId: widget.classId,
              student: ProfessorActionStudent(athleteId: _uid, name: _name),
            );
        return '$_name entrou na lista de espera.';
      },
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ProfessorLinksSheetBody(
      title: 'Pôr na lista de espera',
      subtitle: 'Atleta com conta NexaGO recebe a vaga pelo app.',
      children: [
        ArenaClassAthleteSearch(
          selectedUid: _uid,
          autofocus: true,
          onSelect: (u) => setState(() {
            _uid = u.uid;
            _name = arenaClassAthleteName(u);
          }),
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('professor-waitlist-save'),
          label: _uid == null ? 'Escolha o atleta' : 'Pôr $_name na espera',
          loading: _saving,
          onPressed: _uid == null ? null : _save,
        ),
      ],
    );
  }
}
