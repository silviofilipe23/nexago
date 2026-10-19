import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/router/routes.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_plan.dart';
import '../../domain/arena_plan_providers.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/aulas/arena_class.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../../domain/aulas/arena_class_providers.dart';
import '../plan/widgets/arena_plan_gate.dart';
import '../widgets/arena_async_state.dart';
import '../widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_class_atoms.dart';
import 'widgets/arena_class_card.dart';
import 'widgets/arena_class_session_card.dart';
import 'widgets/arena_class_week_strip.dart';

/// Aulas da arena (A1 "Aulas de hoje" + A5 "Turmas").
///
/// Fase 1 no app: operar o dia (ver as aulas, chamada, cancelar). Turmas,
/// professores e matrícula são criados no portal da arena.
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
    }
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
