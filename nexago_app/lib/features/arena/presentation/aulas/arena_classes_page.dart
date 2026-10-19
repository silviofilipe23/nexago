import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/router/routes.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_plan.dart';
import '../../domain/arena_plan_providers.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/arena_staff_role.dart';
import '../../domain/aulas/arena_class.dart';
import '../../domain/aulas/arena_class_billing_logic.dart';
import '../../domain/aulas/arena_class_enrollment.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../../domain/aulas/arena_class_payout_providers.dart';
import '../../domain/aulas/arena_class_providers.dart';
import '../plan/widgets/arena_plan_gate.dart';
import '../widgets/arena_async_state.dart';
import '../widgets/arena_dashboard_tokens.dart';
import 'arena_class_teachers_section.dart';
import 'widgets/arena_class_atoms.dart';
import 'widgets/arena_class_card.dart';
import 'widgets/arena_class_form_atoms.dart';
import 'widgets/arena_class_session_card.dart';
import 'widgets/arena_class_week_strip.dart';

/// Aulas da arena (A1 "Aulas de hoje", A5 "Turmas" e os alunos matriculados).
///
/// No app: operar o dia (chamada, encaixe, cancelar), matricular, cobrar
/// mensalidades e, para quem lê o financeiro, o repasse dos professores.
/// Turmas, professores e planos são criados no portal da arena.
class ArenaClassesPage extends ConsumerWidget {
  const ArenaClassesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(arenaClassesTabProvider);
    final classesAsync = ref.watch(managedArenaClassesProvider);
    final entitled = ref
        .watch(managedArenaCapabilitiesProvider)
        .contains(ArenaCapability.aulas);
    final arenaName = ref.watch(managedArenaDetailProvider).valueOrNull?.name;
    // Sem plano e sem nada criado: é venda, não operação.
    final showUpsell =
        !entitled && (classesAsync.valueOrNull?.isEmpty ?? false);
    final eyebrow = arenaName?.trim().isNotEmpty == true
        ? 'GESTOR · ${arenaName!.trim().toUpperCase()}'
        : 'GESTOR · ARENA';
    final canEnroll =
        entitled && ref.watch(arenaCanWriteProvider(ArenaArea.agenda));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ArenaClassHeader(
              eyebrow: eyebrow,
              title: 'Aulas',
              subtitle: showUpsell
                  ? null
                  : _subtitle(ref, tab, classesAsync.valueOrNull),
              large: true,
              onBack: () => context.pop(),
              trailing: showUpsell
                  ? null
                  : _HeaderActions(
                      onCharges: () =>
                          context.pushNamed(AppRouteNames.arenaClassCharges),
                      onEnroll: canEnroll
                          ? () =>
                              context.pushNamed(AppRouteNames.arenaClassEnroll)
                          : null,
                    ),
            ),
            Expanded(
              child: classesAsync.when(
                data: (classes) {
                  if (showUpsell) {
                    return const ArenaPlanUpsell(
                      capability: ArenaCapability.aulas,
                    );
                  }
                  return _Body(tab: tab, classes: classes, entitled: entitled);
                },
                loading: () =>
                    const ArenaLoadingState(label: 'Carregando aulas...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String? _subtitle(
    WidgetRef ref,
    ArenaClassesTab tab,
    List<ArenaClass>? classes,
  ) {
    switch (tab) {
      case ArenaClassesTab.today:
        final day = ref.watch(arenaClassSelectedDayProvider);
        final view =
            ref.watch(arenaClassDayViewProvider(arenaDateKey(day))).valueOrNull;
        final heading = arenaClassDayHeading(day);
        if (view == null) return heading;
        final n = view.classCount;
        return '$heading · $n AULA${n == 1 ? '' : 'S'}';
      case ArenaClassesTab.classes:
        if (classes == null) return null;
        final list = arenaClassesForList(
          classes,
          arenaDateKey(arenaTodayDateOnly()),
        );
        final turmas = list.where((c) => !c.isSingle).length;
        final students = list.fold<int>(0, (sum, c) => sum + c.studentCount);
        return '$turmas TURMA${turmas == 1 ? '' : 'S'} · '
            '$students ALUNO${students == 1 ? '' : 'S'}';
      case ArenaClassesTab.students:
        final list = ref.watch(arenaClassEnrollmentsProvider).valueOrNull;
        if (list == null) return null;
        final n = list.where((e) => e.isCurrent).length;
        return '$n MATRÍCULA${n == 1 ? '' : 'S'}';
      case ArenaClassesTab.teachers:
        final list = ref.watch(arenaClassTeachersProvider).valueOrNull;
        if (list == null) return null;
        final n = list.where((t) => t.isActive).length;
        return '$n PROFESSOR${n == 1 ? '' : 'ES'}';
    }
  }
}

/// Mensalidades + Nova matrícula no topo da tela de Aulas.
class _HeaderActions extends StatelessWidget {
  const _HeaderActions({required this.onCharges, required this.onEnroll});

  final VoidCallback onCharges;
  final VoidCallback? onEnroll;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget button({
      required IconData icon,
      required String label,
      required VoidCallback onTap,
      bool accent = false,
    }) =>
        Material(
          color: accent ? AppColors.brand : colors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(
                icon,
                size: 20,
                color: accent ? AppColors.black : colors.onSurface,
                semanticLabel: label,
              ),
            ),
          ),
        );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        button(
          icon: Icons.payments_outlined,
          label: 'Mensalidades',
          onTap: onCharges,
        ),
        if (onEnroll != null) ...[
          const SizedBox(width: 8),
          button(
            icon: Icons.add_rounded,
            label: 'Nova matrícula',
            onTap: onEnroll!,
            accent: true,
          ),
        ],
      ],
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({
    required this.tab,
    required this.classes,
    required this.entitled,
  });

  final ArenaClassesTab tab;
  final List<ArenaClass> classes;
  final bool entitled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bottom = MediaQuery.paddingOf(context).bottom + 32;
    final header = <Widget>[
      ArenaClassSegmented<ArenaClassesTab>(
        items: const [
          (ArenaClassesTab.today, 'Hoje'),
          (ArenaClassesTab.classes, 'Turmas'),
          (ArenaClassesTab.students, 'Alunos'),
          (ArenaClassesTab.teachers, 'Professores'),
        ],
        selected: tab,
        onChanged: (t) => ref.read(arenaClassesTabProvider.notifier).state = t,
      ),
      if (!entitled) ...[
        const SizedBox(height: 12),
        // O backend deixa chamada e cancelamento livres com plano vencido
        // (desmontar não pode travar); só criar turma exige o plano.
        const ArenaPlanReadOnlyBanner(
          message: 'Aulas são dos planos Pro e Elite. Chamada e cancelamento '
              'seguem liberados.',
        ),
      ],
      const SizedBox(height: 12),
    ];

    final slivers = switch (tab) {
      ArenaClassesTab.today => _todaySlivers(context, ref),
      ArenaClassesTab.classes => _classesSlivers(context),
      ArenaClassesTab.students => _studentsSlivers(context, ref),
      ArenaClassesTab.teachers => [
          SliverPadding(
            padding: const EdgeInsets.symmetric(
              horizontal: ArenaDashboardTokens.horizontalPadding,
            ),
            sliver: SliverToBoxAdapter(
              child: ArenaClassTeachersSection(classes: classes),
            ),
          ),
        ],
    };

    return CustomScrollView(
      physics: ArenaDashboardTokens.shellScrollPhysics,
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            ArenaDashboardTokens.horizontalPadding,
            14,
            ArenaDashboardTokens.horizontalPadding,
            0,
          ),
          sliver: SliverList.list(children: header),
        ),
        ...slivers,
        SliverToBoxAdapter(child: SizedBox(height: bottom)),
      ],
    );
  }

  List<Widget> _todaySlivers(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(arenaClassSelectedDayProvider);
    final today = arenaTodayDateOnly();
    final dateKey = arenaDateKey(selected);
    final viewAsync = ref.watch(arenaClassDayViewProvider(dateKey));
    final isToday = dateKey == arenaDateKey(today);

    final top = <Widget>[
      ArenaClassWeekStrip(
        selected: selected,
        today: today,
        onSelect: (d) =>
            ref.read(arenaClassSelectedDayProvider.notifier).state = d,
      ),
      const SizedBox(height: 12),
      ArenaClassKpiRow(
        view: viewAsync.valueOrNull ?? ArenaClassDayView.empty,
        isToday: isToday,
      ),
      const SizedBox(height: 14),
    ];

    final content = viewAsync.when<List<Widget>>(
      data: (view) {
        if (view.isEmpty) {
          return [
            ArenaEmptyState(
              title: isToday ? 'Nenhuma aula hoje' : 'Nenhuma aula neste dia',
              message: classes.isEmpty
                  ? 'Crie turmas e aulas avulsas no portal da arena. O horário '
                      'de cada aula sai do aluguel da quadra sozinho.'
                  : 'As turmas não têm aula marcada para este dia.',
              icon: Icons.school_outlined,
            ),
          ];
        }
        return [
          for (final item in view.active) _cardFor(context, item),
          if (view.done.isNotEmpty) ...[
            _SectionLabel('Concluídas · ${view.done.length}'),
            for (final item in view.done) _cardFor(context, item),
          ],
          if (view.canceled.isNotEmpty) ...[
            _SectionLabel('Canceladas · ${view.canceled.length}'),
            for (final item in view.canceled) _cardFor(context, item),
          ],
        ];
      },
      loading: () => const [
        Padding(
          padding: EdgeInsets.only(top: 40),
          child: ArenaLoadingState(label: 'Carregando aulas do dia...'),
        ),
      ],
      error: (e, _) => [ArenaErrorState(message: '$e')],
    );

    return [
      SliverPadding(
        padding: const EdgeInsets.symmetric(
          horizontal: ArenaDashboardTokens.horizontalPadding,
        ),
        sliver: SliverList.list(children: [...top, ...content]),
      ),
    ];
  }

  Widget _cardFor(BuildContext context, ArenaClassDayItem item) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ArenaClassSessionCard(
        item: item,
        onTap: () => context.pushNamed(
          AppRouteNames.arenaClassSession,
          pathParameters: {'sessionId': item.session.id},
        ),
      ),
    );
  }

  List<Widget> _classesSlivers(BuildContext context) {
    final todayKey = arenaDateKey(arenaTodayDateOnly());
    final list = arenaClassesForList(classes, todayKey);
    final weekly = list.where((c) => !c.isSingle).toList();
    final single = list.where((c) => c.isSingle).toList();

    final children = <Widget>[
      if (list.isEmpty)
        const ArenaEmptyState(
          title: 'Nenhuma turma',
          message: 'Crie turmas e aulas avulsas no portal da arena — aqui você '
              'acompanha a lotação e faz a chamada do dia.',
          icon: Icons.school_outlined,
        ),
      for (final c in weekly)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: ArenaClassCard(cls: c, todayKey: todayKey),
        ),
      if (single.isNotEmpty) ...[
        const _SectionLabel('Aulas avulsas'),
        for (final c in single)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: ArenaClassCard(cls: c, todayKey: todayKey),
          ),
      ],
    ];

    return [
      SliverPadding(
        padding: const EdgeInsets.symmetric(
          horizontal: ArenaDashboardTokens.horizontalPadding,
        ),
        sliver: SliverList.list(children: children),
      ),
    ];
  }

  List<Widget> _studentsSlivers(BuildContext context, WidgetRef ref) {
    final enrollmentsAsync = ref.watch(arenaClassEnrollmentsProvider);
    final open = ref.watch(arenaClassOpenChargesProvider).valueOrNull ??
        const <ArenaClassCharge>[];
    final todayKey = ref.watch(arenaClassTodayKeyProvider);
    final canEnroll =
        entitled && ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final classNames = {for (final c in classes) c.id: c.name};

    final content = enrollmentsAsync.when<List<Widget>>(
      data: (all) {
        final current = all.where((e) => e.isCurrent).toList()
          ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
        if (current.isEmpty) {
          return [
            const ArenaEmptyState(
              title: 'Nenhum aluno matriculado',
              message: 'A matrícula junta aluno, plano e horários fixos — e '
                  'gera as mensalidades sozinha.',
              icon: Icons.person_add_alt_outlined,
            ),
            if (canEnroll) ...[
              const SizedBox(height: 12),
              ArenaClassPrimaryButton(
                label: 'Nova matrícula',
                icon: Icons.add_rounded,
                onPressed: () =>
                    context.pushNamed(AppRouteNames.arenaClassEnroll),
              ),
            ],
          ];
        }
        final byStudent = <String, List<ArenaClassCharge>>{};
        for (final c in open) {
          byStudent.putIfAbsent(c.studentId, () => []).add(c);
        }
        return [
          for (final e in current)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _EnrollmentCard(
                enrollment: e,
                classNames: classNames,
                standing: arenaClassStudentStanding(
                  enrollment: e,
                  charges: byStudent[e.studentId] ?? const [],
                  todayKey: todayKey,
                ),
                onTap: () => context.pushNamed(
                  AppRouteNames.arenaClassStudent,
                  pathParameters: {'studentId': e.studentId},
                ),
              ),
            ),
        ];
      },
      loading: () => const [
        Padding(
          padding: EdgeInsets.only(top: 40),
          child: ArenaLoadingState(label: 'Carregando alunos...'),
        ),
      ],
      error: (e, _) => [ArenaErrorState(message: '$e')],
    );

    return [
      SliverPadding(
        padding: const EdgeInsets.symmetric(
          horizontal: ArenaDashboardTokens.horizontalPadding,
        ),
        sliver: SliverList.list(children: content),
      ),
    ];
  }
}

class _EnrollmentCard extends StatelessWidget {
  const _EnrollmentCard({
    required this.enrollment,
    required this.classNames,
    required this.standing,
    required this.onTap,
  });

  final ArenaClassEnrollment enrollment;
  final Map<String, String> classNames;
  final ArenaClassStudentStanding standing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = enrollment;
    final slots = [
      for (final s in e.slots)
        ArenaClassEnrollmentSlot(
          classId: s.classId,
          weekday: s.weekday,
          className: classNames[s.classId] ?? s.className,
          startTime: s.startTime,
        ),
    ];
    final color = switch (standing) {
      ArenaClassStudentStanding.overdue => AppColors.live,
      ArenaClassStudentStanding.dueToday => AppColors.pending,
      ArenaClassStudentStanding.upToDate => AppColors.win,
      _ => colors.onSurfaceMuted,
    };
    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: colors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Row(
            children: [
              ArenaClassAvatar(
                initials: arenaClassInitials(e.name),
                photoUrl: e.photoUrl,
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      e.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${e.plan.name} · ${arenaClassSlotsLabel(slots, withClassName: true)}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        height: 1.3,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              ArenaClassTag(label: standing.label, color: color),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6, bottom: 10),
      child: Text(
        label.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 9.5,
          letterSpacing: 1.5,
          color: context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}
