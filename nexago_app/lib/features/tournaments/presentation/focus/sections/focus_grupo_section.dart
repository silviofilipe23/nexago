import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_journey_view.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_match_status.dart';
import '../../widgets/tournament_detail/tournament_detail_groups_tab.dart';
import '../../widgets/tournament_detail/tournament_matches_filter_toggle.dart';
import '../focus_section_header.dart';

/// Seção "Grupo" do Focus: a classificação do atleta, o cruzamento que a chave
/// já declara, o que está em quadra na categoria e onde jogar.
///
/// A classificação em si é o `TournamentDetailGroupsTab` que o detalhe já
/// desenha — o app tem UM motor de classificação, e uma segunda tabela aqui
/// poderia discordar dele na frente do atleta.
///
/// A categoria vem travada de fora: `poolId` só é único DENTRO da categoria —
/// os grupos são 'A', 'B', 'C'… em todas elas —, então sem esse recorte o Grupo
/// A do atleta apareceria fundido com o Grupo A das outras.
///
/// FALTA em relação ao portal: "Cenários da rodada" ("vencendo, você
/// classifica"). Ele simula os placares extremos e só afirma posição quando os
/// dois concordam — porte que depende do motor de desempate e que só entra
/// depois de conferido contra `computePoolStandings`. Afirmar classificação
/// errada é pior que não afirmar.
class FocusGrupoSection extends ConsumerStatefulWidget {
  const FocusGrupoSection({
    super.key,
    required this.tournament,
    required this.categoryId,
    required this.athleteTeamIds,
  });

  final TournamentDetail tournament;
  final String categoryId;
  final Set<String> athleteTeamIds;

  @override
  ConsumerState<FocusGrupoSection> createState() => _FocusGrupoSectionState();
}

class _FocusGrupoSectionState extends ConsumerState<FocusGrupoSection> {
  TournamentMatchesFilter _filter = TournamentMatchesFilter.mine;

  String? get _address {
    final t = widget.tournament;
    final raw = t.locationAddress?.trim();
    if (raw != null && raw.isNotEmpty) return raw;
    final fallback = [t.location.trim(), t.city.trim()]
        .where((p) => p.isNotEmpty)
        .join(', ');
    return fallback.isEmpty ? null : fallback;
  }

  Future<void> _openMaps() async {
    final address = _address;
    if (address == null) return;
    await launchUrl(
      Uri.parse(
        'https://www.google.com/maps/search/?api=1'
        '&query=${Uri.encodeComponent(address)}',
      ),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final cards =
        ref.watch(tournamentMatchCardsProvider(widget.tournament.id)).valueOrNull ??
            const [];
    final all = [for (final c in cards) c.match];
    final crossing = crossingRowsOf(all, widget.categoryId);
    final live = all
        .where((m) =>
            m.categoryId == widget.categoryId &&
            TournamentMatchStatus.isInProgress(m.status))
        .toList();
    final address = _address;

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: SizedBox(
            // A tabela vem do detalhe e traz o próprio scroll; aqui ela entra
            // com altura própria para conviver com os blocos abaixo.
            height: 420,
            child: TournamentDetailGroupsTab(
              tournament: widget.tournament,
              categoryId: widget.categoryId,
              filter: _filter,
              showCategoryChips: false,
              onFilterChanged: (value) => setState(() => _filter = value),
              onCategorySelected: (_) {},
            ),
          ),
        ),
        if (crossing.isNotEmpty)
          SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const FocusSectionHeader(label: 'CRUZAMENTO NO MATA-MATA'),
                for (final row in crossing) _CrossingTile(row: row),
              ],
            ),
          ),
        if (live.isNotEmpty)
          SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const FocusSectionHeader(
                  label: 'AO VIVO NA CATEGORIA',
                  live: true,
                ),
                for (final m in live)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screenH,
                      0,
                      AppSpacing.screenH,
                      AppSpacing.sm,
                    ),
                    child: Text(
                      [
                        cards
                            .firstWhere((c) => c.match.id == m.id)
                            .teamA
                            .displayName,
                        'x',
                        cards
                            .firstWhere((c) => c.match.id == m.id)
                            .teamB
                            .displayName,
                      ].join(' '),
                      style:
                          AppTypography.bodyM.copyWith(color: colors.onSurface),
                    ),
                  ),
              ],
            ),
          ),
        if (address != null)
          SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const FocusSectionHeader(label: 'ONDE JOGAR'),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenH,
                    0,
                    AppSpacing.screenH,
                    AppSpacing.xxxl,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (widget.tournament.location.trim().isNotEmpty)
                        Text(
                          widget.tournament.location.trim(),
                          style: AppTypography.bodyM
                              .copyWith(color: colors.onSurface),
                        ),
                      Text(
                        address,
                        style: AppTypography.bodyS
                            .copyWith(color: colors.onSurfaceMuted),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      OutlinedButton.icon(
                        onPressed: _openMaps,
                        icon: const Icon(Icons.place_outlined, size: 16),
                        // Rota até a ARENA, não até a quadra: as quadras do
                        // torneio não têm posição gravada.
                        label: const Text('Como chegar'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _CrossingTile extends StatelessWidget {
  const _CrossingTile({required this.row});

  final CrossingRow row;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.sm,
      ),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: colors.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              row.label,
              style:
                  AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '${row.a}  ×  ${row.b}',
              style: AppTypography.bodyM.copyWith(color: colors.onSurface),
            ),
          ],
        ),
      ),
    );
  }
}
