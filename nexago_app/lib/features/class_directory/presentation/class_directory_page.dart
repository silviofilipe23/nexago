import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_segmented_control.dart';
import '../../arena/domain/aulas/arena_class.dart';
import '../../athlete_training/application/athlete_training_providers.dart';
import '../../athlete_training/presentation/athlete_training_find_professor_page.dart'
    show openProfessorProfile;
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart'
    show ProfessorRetryCard;
import '../application/class_directory_providers.dart';
import '../domain/class_directory.dart';
import '../domain/class_directory_logic.dart';
import 'widgets/class_directory_widgets.dart';

/// Abre o item do diretório: arena (H4), CT (H5) ou o perfil do professor
/// que já existe (T11).
void openClassProvider(BuildContext context, ClassProvider item) {
  switch (item.kind) {
    case ClassProviderKind.arena:
      context.pushNamed(
        AppRouteNames.classDirectoryArena,
        pathParameters: {'arenaId': item.id},
      );
    case ClassProviderKind.center:
      context.pushNamed(
        AppRouteNames.classDirectoryCenter,
        pathParameters: {'centerId': item.id},
      );
    case ClassProviderKind.professor:
      openProfessorProfile(context, item.id);
  }
}

/// H2 · Aulas e treinos — arenas com turma, centros de treinamento e
/// professores independentes numa lista só, do mais perto ao mais longe.
class ClassDirectoryPage extends ConsumerWidget {
  const ClassDirectoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final origin = ref.watch(athleteSearchOriginProvider);
    // Sem a localização ainda, espera: a ordem muda quando ela chega.
    final async = origin == null
        ? const AsyncValue<List<ClassProvider>>.loading()
        : ref.watch(classDirectoryProvider);
    final filters = ref.watch(classDirectoryFiltersProvider);
    final setFilters = ref.read(classDirectoryFiltersProvider.notifier);
    final level = ref.watch(athleteClassLevelProvider);
    final all = async.valueOrNull;
    final list = all == null ? null : filterDirectory(all, filters);
    final sports = all == null ? const <String>[] : _sportsOf(all);
    final city = origin?.city ?? '';

    return ProfessorLinksScaffold(
      title: 'Aulas e treinos',
      subtitle: _subtitle(city, all),
      onBack: () => popOrGo(context, AppRoutes.discover),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () => ref.refresh(classDirectoryProvider.future),
        child: ListView(
          key: const Key('class-directory-list'),
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            NexaSegmentedControl<ClassProviderKind?>(
              segments: const [
                NexaSegment(value: null, label: 'Todos'),
                NexaSegment(value: ClassProviderKind.arena, label: 'Arenas'),
                NexaSegment(value: ClassProviderKind.center, label: 'CTs'),
                NexaSegment(
                  value: ClassProviderKind.professor,
                  label: 'Professores',
                ),
              ],
              selected: filters.kind,
              onChanged: (k) =>
                  setFilters.state = filters.copyWith(kind: () => k),
            ),
            if (sports.length > 1) ...[
              const SizedBox(height: 12),
              _HScroll(
                children: [
                  for (final s in sports)
                    AvailabilityChoiceChip(
                      key: Key('class-directory-sport-$s'),
                      label: s,
                      selected: filters.sport == s,
                      onTap: () => setFilters.state = filters.copyWith(
                        sport: () => filters.sport == s ? null : s,
                      ),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 10),
            _HScroll(
              children: [
                DirectoryQuickChip(
                  key: const Key('class-directory-filters'),
                  label: 'Filtros',
                  icon: Icons.tune_rounded,
                  count: filters.sheetCount,
                  selected: filters.sheetCount > 0,
                  onTap: () => _openFilters(context, ref, all ?? const []),
                ),
                DirectoryQuickChip(
                  key: const Key('class-directory-opening'),
                  label: 'Com vaga / horário',
                  selected: filters.withOpening,
                  onTap: () => setFilters.state =
                      filters.copyWith(withOpening: !filters.withOpening),
                ),
                DirectoryQuickChip(
                  key: const Key('class-directory-free-trial'),
                  label: 'Experimental grátis',
                  selected: filters.freeTrial,
                  onTap: () => setFilters.state =
                      filters.copyWith(freeTrial: !filters.freeTrial),
                ),
                if (level != null)
                  DirectoryQuickChip(
                    key: const Key('class-directory-my-level'),
                    label: 'Meu nível',
                    selected: filters.levels.length == 1 &&
                        filters.levels.contains(level.code),
                    onTap: () {
                      final on = filters.levels.length == 1 &&
                          filters.levels.contains(level.code);
                      setFilters.state = filters.copyWith(
                        levels: on ? const {} : {level.code},
                      );
                    },
                  ),
              ],
            ),
            const SizedBox(height: 12),
            ProfessorLinksNote(
              level != null
                  ? 'Turmas para o seu nível (${level.label}) aparecem em '
                      'destaque nos cards${origin?.lat != null ? ', do mais perto ao mais longe' : ''}.'
                  : origin?.lat != null
                      ? 'Do mais perto ao mais longe de você.'
                      : 'Libere a localização na aba Reservar para ver os mais '
                          'perto de você primeiro.',
              key: const Key('class-directory-note'),
              tone: ProfessorLinksNoteTone.blue,
            ),
            const SizedBox(height: 14),
            if (list == null && async.hasError)
              ProfessorRetryCard(
                message: 'Não foi possível carregar as aulas.',
                onRetry: () => ref.invalidate(classDirectoryProvider),
              )
            else if (list == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else ...[
              Row(
                children: [
                  Expanded(
                    child: ProfessorLinksKicker(
                      '${list.length} '
                      '${list.length == 1 ? 'resultado' : 'resultados'}',
                    ),
                  ),
                  Text(
                    origin?.lat != null ? 'Mais perto' : 'Por nome',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (list.isEmpty)
                ProfessorLinksCard(
                  key: const Key('class-directory-empty'),
                  child: Text(
                    all!.isEmpty
                        ? 'Ainda não há arenas, CTs ou professores com aulas '
                            'abertas por aqui.'
                        : 'Nada encontrado com esses filtros.',
                    textAlign: TextAlign.center,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 13,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                )
              else
                for (final item in list) ...[
                  if (item.kind == ClassProviderKind.professor)
                    ClassProfessorCard(
                      item: item,
                      onTap: () => openClassProvider(context, item),
                    )
                  else
                    ClassPlaceCard(
                      item: item,
                      slot: directoryCardSlot(item, filters),
                      onTap: () => openClassProvider(context, item),
                    ),
                  const SizedBox(height: 12),
                ],
            ],
          ],
        ),
      ),
    );
  }

  static String _subtitle(String city, List<ClassProvider>? all) {
    final parts = <String>[
      if (city.isNotEmpty) city.toUpperCase(),
      if (all != null) ...[
        () {
          final places =
              all.where((i) => i.kind != ClassProviderKind.professor).length;
          return '$places ${places == 1 ? 'LOCAL' : 'LOCAIS'}';
        }(),
        () {
          final profs =
              all.where((i) => i.kind == ClassProviderKind.professor).length;
          return '$profs ${profs == 1 ? 'PROFESSOR' : 'PROFESSORES'}';
        }(),
      ],
    ];
    return parts.isEmpty ? 'PERTO DE VOCÊ' : parts.join(' · ');
  }

  /// Esportes de todos os itens, na ordem em que aparecem mais.
  static List<String> _sportsOf(List<ClassProvider> all) {
    final count = <String, int>{};
    for (final i in all) {
      for (final s in i.sports) {
        count[s] = (count[s] ?? 0) + 1;
      }
    }
    return count.keys.toList()..sort((a, b) => count[b]!.compareTo(count[a]!));
  }

  Future<void> _openFilters(
    BuildContext context,
    WidgetRef ref,
    List<ClassProvider> all,
  ) async {
    final current = ref.read(classDirectoryFiltersProvider);
    final result = await showProfessorLinksSheet<DirectoryFilters>(
      context,
      builder: (_) => ClassDirectoryFiltersSheet(initial: current, all: all),
    );
    if (result != null) {
      ref.read(classDirectoryFiltersProvider.notifier).state = result;
    }
  }
}

/// Linha horizontal rolável que sangra até a borda da tela.
class _HScroll extends StatelessWidget {
  const _HScroll({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      child: Row(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const SizedBox(width: 6),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// H3 · Filtros: tipo, nível da turma, distância e período. O botão diz
/// quantos locais e professores sobram antes de aplicar.
class ClassDirectoryFiltersSheet extends StatefulWidget {
  const ClassDirectoryFiltersSheet({
    super.key,
    required this.initial,
    required this.all,
  });

  final DirectoryFilters initial;
  final List<ClassProvider> all;

  @override
  State<ClassDirectoryFiltersSheet> createState() =>
      _ClassDirectoryFiltersSheetState();
}

class _ClassDirectoryFiltersSheetState
    extends State<ClassDirectoryFiltersSheet> {
  late DirectoryFilters _f = widget.initial;

  void _set(DirectoryFilters f) => setState(() => _f = f);

  @override
  Widget build(BuildContext context) {
    final result = filterDirectory(widget.all, _f);
    final places =
        result.where((i) => i.kind != ClassProviderKind.professor).length;
    final profs = result.length - places;
    final cta = result.isEmpty
        ? 'Nenhum resultado'
        : 'Ver $places ${places == 1 ? 'local' : 'locais'} e '
            '$profs ${profs == 1 ? 'professor' : 'professores'}';

    return ProfessorLinksSheetBody(
      title: 'Filtros',
      children: [
        _Group(
          title: 'Mostrar',
          children: [
            for (final (k, l) in const [
              (null, 'Todos'),
              (ClassProviderKind.arena, 'Arenas'),
              (ClassProviderKind.center, 'CTs'),
              (ClassProviderKind.professor, 'Professores independentes'),
            ])
              AvailabilityChoiceChip(
                label: l,
                selected: _f.kind == k,
                onTap: () => _set(_f.copyWith(kind: () => k)),
              ),
          ],
        ),
        _Group(
          title: 'Nível da turma',
          children: [
            for (final l in kDirectoryLevels)
              AvailabilityChoiceChip(
                key: Key('class-directory-level-${l.id}'),
                label: l.label,
                selected: _f.levels.contains(l.id),
                onTap: () => _set(
                  _f.copyWith(levels: _toggle(_f.levels, l.id)),
                ),
              ),
          ],
        ),
        _Group(
          title: 'Distância',
          children: [
            for (final km in kDirectoryDistances)
              AvailabilityChoiceChip(
                label: km == null ? 'Qualquer' : '${km.toInt()} km',
                selected: _f.maxKm == km,
                onTap: () => _set(_f.copyWith(maxKm: () => km)),
              ),
          ],
        ),
        _Group(
          title: 'Período',
          children: [
            for (final p in DirectoryPeriod.values)
              AvailabilityChoiceChip(
                label: p.label,
                selected: _f.periods.contains(p),
                onTap: () => _set(
                  _f.copyWith(periods: _toggle(_f.periods, p)),
                ),
              ),
          ],
        ),
        if (_f.maxKm != null)
          const ProfessorLinksNote(
            'Centros de treinamento ainda não têm localização no mapa: com '
            'distância ligada, eles saem da lista.',
          ),
        const SizedBox(height: 8),
        Row(
          children: [
            SizedBox(
              width: 104,
              child: ProfessorLinksGhostButton(
                key: const Key('class-directory-filters-clear'),
                label: 'Limpar',
                height: 52,
                onPressed: () => _set(
                  DirectoryFilters(
                    sport: _f.sport,
                    withOpening: _f.withOpening,
                    freeTrial: _f.freeTrial,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ProfessorLinksPrimaryButton(
                key: const Key('class-directory-filters-apply'),
                label: cta,
                onPressed: () => Navigator.of(context).pop(_f),
              ),
            ),
          ],
        ),
      ],
    );
  }

  static Set<T> _toggle<T>(Set<T> s, T v) =>
      s.contains(v) ? ({...s}..remove(v)) : {...s, v};
}

class _Group extends StatelessWidget {
  const _Group({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ProfessorLinksKicker(title),
        const SizedBox(height: 9),
        Wrap(spacing: 6, runSpacing: 6, children: children),
      ],
    );
  }
}
