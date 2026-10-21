import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/public_professor.dart';

/// Abre o perfil do professor (T11).
void openProfessorProfile(BuildContext context, String professorUid) {
  context.pushNamed(
    AppRouteNames.athleteTrainingProfessorProfile,
    pathParameters: {'professorUid': professorUid},
  );
}

/// T13 · Encontrar professor — a vitrine (professores que aparecem no perfil
/// das arenas), com busca por nome/arena/cidade e filtro de modalidade, do
/// mais perto ao mais longe quando há GPS.
class AthleteTrainingFindProfessorPage extends ConsumerStatefulWidget {
  const AthleteTrainingFindProfessorPage({super.key});

  @override
  ConsumerState<AthleteTrainingFindProfessorPage> createState() =>
      _AthleteTrainingFindProfessorPageState();
}

class _AthleteTrainingFindProfessorPageState
    extends ConsumerState<AthleteTrainingFindProfessorPage> {
  final _text = TextEditingController();
  Timer? _debounce;
  String _query = '';
  String _sport = '';

  /// Modalidades da primeira resposta: os chips não somem ao filtrar.
  List<String> _modalities = const [];

  @override
  void dispose() {
    _debounce?.cancel();
    _text.dispose();
    super.dispose();
  }

  void _onText(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (mounted) setState(() => _query = v.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final origin = ref.watch(athleteSearchOriginProvider);
    final hasGps = origin?.lat != null;
    final query = (
      sport: _sport,
      text: _query,
      lat: origin?.lat,
      lng: origin?.lng,
    );
    // Sem a localização ainda, espera (a ordem muda quando ela chega).
    final async = origin == null
        ? const AsyncValue<ProfessorSearchResult>.loading()
        : ref.watch(professorSearchProvider(query));
    final result = async.valueOrNull;
    if (result != null && _modalities.isEmpty && result.modalities.isNotEmpty) {
      _modalities = result.modalities;
    }
    final city = origin?.city ?? '';

    return ProfessorLinksScaffold(
      title: 'Encontrar professor',
      subtitle: city.isEmpty
          ? 'PROFESSORES NAS ARENAS'
          : 'PERTO DE VOCÊ · ${city.toUpperCase()}',
      onBack: () => popOrGo(context, AppRoutes.athleteTrainingProfessors),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          TextField(
            key: const Key('find-professor-search'),
            controller: _text,
            onChanged: _onText,
            textInputAction: TextInputAction.search,
            style: AppTypography.bodyS.copyWith(
              fontSize: 13.5,
              color: colors.onSurface,
            ),
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Nome, arena ou cidade…',
              hintStyle: AppTypography.bodyS.copyWith(
                fontSize: 13.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
              prefixIcon: Icon(
                Icons.search_rounded,
                size: 18,
                color: ProfessorLinksStyle.dim(colors),
              ),
              filled: true,
              fillColor: colors.surfaceRaised,
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(13),
                borderSide: BorderSide(color: ProfessorLinksStyle.line(colors)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(13),
                borderSide: BorderSide(color: ProfessorLinksStyle.line(colors)),
              ),
            ),
          ),
          if (_modalities.length > 1) ...[
            const SizedBox(height: 12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  AvailabilityChoiceChip(
                    key: const Key('find-professor-sport-all'),
                    label: 'Todas',
                    selected: _sport.isEmpty,
                    onTap: () => setState(() => _sport = ''),
                  ),
                  for (final m in _modalities) ...[
                    const SizedBox(width: 6),
                    AvailabilityChoiceChip(
                      key: Key('find-professor-sport-$m'),
                      label: m,
                      selected: _sport == m,
                      onTap: () => setState(() => _sport = m),
                    ),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          ProfessorLinksNote(
            hasGps
                ? 'Do mais perto ao mais longe, pelas arenas onde cada '
                    'professor dá aula.'
                : 'Libere a localização na aba Reservar para ver os mais '
                    'perto de você primeiro.',
            key: const Key('find-professor-note'),
            tone: ProfessorLinksNoteTone.blue,
          ),
          const SizedBox(height: 12),
          if (result == null && async.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível buscar professores.',
              onRetry: () => ref.invalidate(professorSearchProvider(query)),
            )
          else if (result == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (result.items.isEmpty)
            const ProfessorLinksCard(
              key: Key('find-professor-empty'),
              child: ProfessorMutedText(
                'Nenhum professor encontrado. Tente outro nome ou outra '
                'modalidade.',
              ),
            )
          else
            for (final p in result.items) ...[
              PublicProfessorCard(
                professor: p,
                onTap: () => openProfessorProfile(context, p.professorUid),
              ),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

/// Cartão do professor na vitrine (T13).
class PublicProfessorCard extends StatelessWidget {
  const PublicProfessorCard({
    super.key,
    required this.professor,
    required this.onTap,
  });

  final PublicProfessor professor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = professor;
    final arena = p.arenas.isEmpty ? null : p.arenas.first;
    final where = [
      if (arena != null) arena.arenaName,
      if (arena?.distanceKm != null)
        professorDistanceLabel(arena!.distanceKm!)
      else if (arena != null && arena.city.isNotEmpty)
        arena.city,
      if (p.arenas.length > 1) '+${p.arenas.length - 1}',
    ].join(' · ');
    return ProfessorLinksCard(
      key: Key('find-professor-${p.professorUid}'),
      onTap: onTap,
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ArenaClassAvatar(
                initials: arenaClassInitials(p.name),
                photoUrl: p.photoUrl,
                size: 46,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            p.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: ProfessorLinksStyle.display(
                              14.5,
                              weight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                        if (p.rating != null) ...[
                          Icon(Icons.star_rounded,
                              size: 14, color: colors.brandText),
                          const SizedBox(width: 3),
                          Text(
                            professorRatingLabel(p.rating!),
                            style: ProfessorLinksStyle.mono(
                              11.5,
                              color: colors.onSurface,
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (where.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        where,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                    if (p.modalities.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        p.modalities.join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11.5,
                          color: ProfessorLinksStyle.mute(colors),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 11),
          Row(
            children: [
              if (arena != null)
                ProfessorLinkTypeTag(
                  arena.independent
                      ? ArenaProfessorLinkType.independent
                      : ArenaProfessorLinkType.arenaStaff,
                  small: true,
                ),
              const SizedBox(width: 8),
              if (p.priceFromReais != null)
                Expanded(
                  child: Text.rich(
                    textAlign: TextAlign.right,
                    TextSpan(
                      children: [
                        TextSpan(
                          text: 'a partir de ',
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 10.5,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                        TextSpan(
                          text: formatBRL(p.priceFromReais!),
                          style: ProfessorLinksStyle.mono(
                            12,
                            color: colors.onSurface,
                          ),
                        ),
                      ],
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                )
              else if (p.acceptsPrivate)
                Expanded(
                  child: Text(
                    textAlign: TextAlign.right,
                    'Particular disponível',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: colors.readableTone(AppColors.win),
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
