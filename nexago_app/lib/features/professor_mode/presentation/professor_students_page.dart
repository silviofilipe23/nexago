import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/professor_students_providers.dart';
import '../domain/professor_students.dart';
import '../domain/professor_students_logic.dart';
import 'professor_shell_page.dart';
import 'widgets/professor_students_widgets.dart';

/// Aba Alunos do modo Professor (A5 + B2): os alunos das turmas em que ele
/// dá aula, por arena ("Ver alunos de…"), com busca e chips. Toque abre o
/// aluno (B3).
class ProfessorStudentsPage extends ConsumerStatefulWidget {
  const ProfessorStudentsPage({super.key});

  @override
  ConsumerState<ProfessorStudentsPage> createState() =>
      _ProfessorStudentsPageState();
}

class _ProfessorStudentsPageState extends ConsumerState<ProfessorStudentsPage> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(professorStudentsProvider);
    await ref
        .read(professorStudentsProvider.future)
        .then<void>((_) {}, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(professorStudentsProvider);
    final snapshot = async.valueOrNull;
    final rawArenaId = ref.watch(professorStudentsArenaProvider);
    // A arena escolhida pode ter sumido (vínculo encerrado): volta a "todas".
    final arenaId = snapshot != null &&
            rawArenaId != null &&
            snapshot.arena(rawArenaId) == null
        ? null
        : rawArenaId;
    final filter = ref.watch(professorStudentsFilterProvider);

    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        topGap: 10,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        header: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Alunos',
                    style: ProfessorLinksStyle.display(
                      24,
                      color: colors.onSurface,
                    ),
                  ),
                  if (snapshot != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      professorStudentsHeaderSubtitle(
                        snapshot: snapshot,
                        arenaId: arenaId,
                      ),
                      key: const Key('professor-students-subtitle'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.mono(
                        10.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ).copyWith(letterSpacing: 0.8),
                    ),
                  ],
                ],
              ),
            ),
            if ((snapshot?.arenas.length ?? 0) > 1) ...[
              const SizedBox(width: 12),
              ProfessorLinksRoundButton(
                key: const Key('professor-students-scope'),
                icon: Icons.swap_horiz_rounded,
                semanticLabel: 'Ver alunos de outra arena',
                onTap: () => _openScopeSheet(context, snapshot!, arenaId),
              ),
            ],
          ],
        ),
        child: RefreshIndicator(
          color: AppColors.brand,
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              professorShellBottomPadding(context),
            ),
            children: snapshot == null
                ? [
                    if (async.hasError)
                      ProfessorRetryCard(
                        message: 'Não foi possível carregar seus alunos.',
                        onRetry: () =>
                            ref.invalidate(professorStudentsProvider),
                      )
                    else
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child: Center(
                          child: CircularProgressIndicator(
                            color: AppColors.brand,
                          ),
                        ),
                      ),
                  ]
                : _content(context, snapshot, arenaId, filter),
          ),
        ),
      ),
    );
  }

  List<Widget> _content(
    BuildContext context,
    ProfessorStudentsSnapshot snapshot,
    String? arenaId,
    ProfessorStudentFilter filter,
  ) {
    if (snapshot.arenas.isEmpty) {
      return const [
        ProfessorLinksCard(
          key: Key('professor-students-no-classes'),
          child: ProfessorMutedText(
            'Você ainda não dá aula em nenhuma turma. Quando uma arena '
            'escalar você numa turma, os alunos aparecem aqui.',
          ),
        ),
      ];
    }
    final inScope = professorStudentsInScope(snapshot.students, arenaId);
    final showPending = professorShowsPendingFilter(inScope);
    final effectiveFilter =
        !showPending && filter == ProfessorStudentFilter.pending
            ? ProfessorStudentFilter.all
            : filter;
    final visible = professorVisibleStudents(
      snapshot.students,
      arenaId: arenaId,
      filter: effectiveFilter,
      query: _search.text,
    );
    final blocked = [
      for (final a in snapshot.arenas)
        if (!a.canSeeStudents && (arenaId == null || a.arenaId == arenaId)) a,
    ];
    final withArena = arenaId == null && snapshot.arenas.length > 1;

    return [
      if (inScope.isNotEmpty) ...[
        _SearchField(
          controller: _search,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final f in ProfessorStudentFilter.values)
                if (f != ProfessorStudentFilter.pending || showPending) ...[
                  ArenaClassChip(
                    key: Key('professor-students-filter-${f.name}'),
                    label: f.label,
                    selected: f == effectiveFilter,
                    onTap: () => ref
                        .read(professorStudentsFilterProvider.notifier)
                        .state = f,
                  ),
                  const SizedBox(width: 6),
                ],
            ],
          ),
        ),
        const SizedBox(height: 8),
      ],
      for (final a in blocked) ...[
        const SizedBox(height: 8),
        GestureDetector(
          onTap: () => context.pushNamed(AppRouteNames.professorArenas),
          child: ProfessorLinksNote(
            'Seus alunos da ${a.arenaName} não aparecem: o vínculo com a '
            'arena não libera "Gerenciar as próprias aulas" agora.',
            tone: ProfessorLinksNoteTone.yellow,
          ),
        ),
      ],
      if (inScope.isEmpty && blocked.isEmpty)
        const ProfessorLinksCard(
          child: ProfessorMutedText('Nenhum aluno nas suas turmas ainda.'),
        )
      else if (visible.isEmpty && inScope.isNotEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Center(child: ProfessorMutedText('Nenhum aluno encontrado.')),
        )
      else
        for (final s in visible)
          _StudentRow(
            key: Key('professor-student-${s.key}'),
            student: s,
            withArena: withArena,
            onTap: () => context.pushNamed(
              AppRouteNames.professorStudent,
              pathParameters: {'arenaId': s.arenaId, 'studentId': s.studentId},
            ),
          ),
    ];
  }

  Future<void> _openScopeSheet(
    BuildContext context,
    ProfessorStudentsSnapshot snapshot,
    String? current,
  ) async {
    final picked = await showProfessorLinksSheet<_ScopeChoice>(
      context,
      builder: (_) => _ScopeSheet(snapshot: snapshot, current: current),
    );
    if (picked == null || !mounted) return;
    ref.read(professorStudentsArenaProvider.notifier).state = picked.arenaId;
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return TextField(
      key: const Key('professor-students-search'),
      controller: controller,
      onChanged: onChanged,
      textInputAction: TextInputAction.search,
      style: AppTypography.bodyM.copyWith(color: colors.onSurface),
      decoration: InputDecoration(
        isDense: true,
        hintText: 'Buscar aluno',
        hintStyle: AppTypography.bodyM.copyWith(
          color: ProfessorLinksStyle.dim(colors),
        ),
        prefixIcon: Icon(
          Icons.search_rounded,
          size: 19,
          color: ProfessorLinksStyle.dim(colors),
        ),
        filled: true,
        fillColor: ProfessorLinksStyle.soft(colors),
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: BorderSide(color: ProfessorLinksStyle.line(colors)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: BorderSide(color: ProfessorLinksStyle.line(colors)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: const BorderSide(color: AppColors.brand),
        ),
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    super.key,
    required this.student,
    required this.withArena,
    required this.onTap,
  });

  final ProfessorStudent student;
  final bool withArena;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = student;
    final billing = s.billing;
    final Widget trailing;
    if (billing != null && billing.isPending) {
      trailing = ProfessorBillingPill(billing.standing);
    } else if (s.paused) {
      trailing = const ProfessorBillingPill(ProfessorBillingStanding.paused);
    } else {
      trailing = Text(
        '${s.credits} créd.',
        style: ProfessorLinksStyle.mono(
          10.5,
          color: s.credits > 0
              ? colors.onSurface
              : ProfessorLinksStyle.dim(colors),
        ),
      );
    }
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
                  Text(
                    s.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    professorStudentSubtitle(s, withArena: withArena),
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
            trailing,
          ],
        ),
      ),
    );
  }
}

/// Escolha da folha: `arenaId == null` é "Todas as arenas".
class _ScopeChoice {
  const _ScopeChoice(this.arenaId);

  final String? arenaId;
}

/// "Ver alunos de…" (B2): todas as arenas ou uma, com o tipo do vínculo.
class _ScopeSheet extends StatelessWidget {
  const _ScopeSheet({required this.snapshot, required this.current});

  final ProfessorStudentsSnapshot snapshot;
  final String? current;

  static String _count(int n) => '$n aluno${n == 1 ? '' : 's'}';

  @override
  Widget build(BuildContext context) {
    return ProfessorLinksSheetBody(
      title: 'Ver alunos de',
      subtitle: 'Cada arena tem regras próprias',
      children: [
        ArenaClassChoiceCard(
          key: const Key('professor-scope-all'),
          title: 'Todas as arenas',
          subtitle: '${_count(snapshot.students.length)} · visão unificada',
          selected: current == null,
          onTap: () => Navigator.of(context).pop(const _ScopeChoice(null)),
        ),
        for (final a in snapshot.arenas)
          ArenaClassChoiceCard(
            key: Key('professor-scope-${a.arenaId}'),
            title: a.arenaName,
            subtitle: a.canSeeStudents
                ? _count(a.studentCount)
                : 'Vínculo sem acesso aos alunos',
            selected: current == a.arenaId,
            trailing: a.type == null
                ? null
                : ProfessorLinkTypeTag(a.type!, small: true),
            onTap: () => Navigator.of(context).pop(_ScopeChoice(a.arenaId)),
          ),
      ],
    );
  }
}
