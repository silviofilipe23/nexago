import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../../core/layout/nexa_bottom_nav_models.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/nexa_icon_square_button.dart';
import '../../data/tournament_announcements_repository.dart';
import '../../data/tournament_inscriptions_repository.dart';
import '../../domain/focus/focus_boot_logic.dart';
import '../../domain/focus/focus_providers.dart';
import '../../domain/tournament_detail_logic.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_discovery_models.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_matches_logic.dart';
import '../tournament_predictions_page.dart';
import 'focus_bottom_clearance.dart';
import 'focus_section.dart';
import 'sections/focus_agora_section.dart';
import 'sections/focus_arena_section.dart';
import 'sections/focus_chave_section.dart';
import 'sections/focus_grupo_section.dart';
import 'sections/focus_trajetoria_section.dart';
import 'widgets/focus_boot_loader.dart';

/// Casca do Modo Focus: cabeçalho, corpo e a navegação inferior das seções.
///
/// A nav é INFERIOR, como nos protótipos — não chips no topo. É a mesma
/// `NexaBottomNavBar` do resto do app, então o gesto de trocar de seção dentro
/// do Focus é o mesmo que o atleta já usa fora dele.
///
/// UMA rota com [IndexedStack], não as quatro aninhadas do portal: lá uma seção
/// sem rota irmã ejeta o atleta para o painel sem erro no console. O
/// `IndexedStack` ainda preserva scroll e estado de cada seção na troca.
///
/// A imersão é a própria rota: o app não envolve telas de atleta em
/// `StatefulShellRoute`, então aqui não há bottom-nav do app para esconder. O
/// que a casca faz é tirar o caminho de volta ao hub — a única saída é o ×.
class FocusShellPage extends ConsumerStatefulWidget {
  const FocusShellPage({
    super.key,
    required this.tournamentId,
    this.initialSection = FocusSection.agora,
  });

  final String tournamentId;
  final FocusSection initialSection;

  @override
  ConsumerState<FocusShellPage> createState() => _FocusShellPageState();
}

class _FocusShellPageState extends ConsumerState<FocusShellPage> {
  /// Piso de exibição da soleira. `tournamentDetailProvider` guarda cache, então
  /// reabrir o Focus resolve em milissegundos e o loader piscaria por um quadro
  /// — pior do que não ter loader nenhum.
  static const Duration _bootMinimumHold = Duration(milliseconds: 600);

  /// Teto. Um stream que nunca emite (offline, sem cache) não pode prender o
  /// atleta: passado o prazo a casca entra e cada seção mostra o próprio
  /// estado.
  static const Duration _bootDeadline = Duration(seconds: 6);

  late FocusSection _section = widget.initialSection;

  bool _minimumHoldElapsed = false;
  bool _deadlineElapsed = false;
  Timer? _holdTimer;
  Timer? _deadlineTimer;

  @override
  void initState() {
    super.initState();
    _holdTimer = Timer(_bootMinimumHold, () {
      if (mounted) setState(() => _minimumHoldElapsed = true);
    });
    _deadlineTimer = Timer(_bootDeadline, () {
      if (mounted) setState(() => _deadlineElapsed = true);
    });
  }

  @override
  void dispose() {
    _holdTimer?.cancel();
    _deadlineTimer?.cancel();
    super.dispose();
  }

  /// Sair devolve o atleta à HOME, não ao detalhe do torneio: no dia de jogo a
  /// home é a base da navegação dele.
  void _exit() => context.go(AppRoutes.home);

  /// "Assentou" é chegou OU falhou. Um stream que a regra do Firestore negou
  /// nunca traria dado, e esperar por ele deixaria o passo girando para sempre.
  static bool _settled(AsyncValue<Object?> value) =>
      value.hasValue || value.hasError;

  TournamentCategoryOffer? _offer(TournamentDetail? tournament, String? id) {
    if (tournament == null || id == null) return null;
    for (final offer in tournament.categoryOffers) {
      if (offer.id == id) return offer;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final topInset = MediaQuery.paddingOf(context).top;

    // As mesmas famílias que as seções observam — o Riverpod compartilha a
    // assinatura, então observar aqui não abre um segundo listener no Firestore.
    final detailAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );
    final teamIdsAsync = ref.watch(
      tournamentUserTeamIdsByCategoryProvider(widget.tournamentId),
    );

    // `select` porque a casca só precisa saber SE o passo assentou. Observar o
    // valor faria a casca inteira — cabeçalho, nav e as três seções do
    // `IndexedStack` — reconstruir a cada ponto marcado no torneio.
    final nextMatchSettled = ref.watch(
      tournamentMatchCardsProvider(widget.tournamentId).select(_settled),
    );
    final announcementsSettled = ref.watch(
      tournamentAnnouncementsProvider(widget.tournamentId).select(_settled),
    );

    final tournament = detailAsync.valueOrNull;
    final categoryId = ref.watch(focusCategoryIdProvider(widget.tournamentId));
    final teamIdsByCategory =
        teamIdsAsync.valueOrNull ?? const <String, String>{};
    final athleteTeamIds = athleteTeamIdsForHighlight(teamIdsByCategory);

    final progress = FocusBootProgress({
      if (nextMatchSettled) FocusBootStep.nextMatch,
      if (tournament != null && _settled(teamIdsAsync)) FocusBootStep.journey,
      if (announcementsSettled) FocusBootStep.announcements,
    });
    final showBoot = shouldShowFocusBoot(
      hasTournament: tournament != null,
      progress: progress,
      minimumHoldElapsed: _minimumHoldElapsed,
      deadlineElapsed: _deadlineElapsed,
    );

    // O detalhe assentou sem torneio: id errado, torneio removido ou regra
    // negada. Sem isto a soleira ficaria girando para sempre.
    final unavailable = tournament == null && _settled(detailAsync);

    final offer = _offer(tournament, categoryId);
    final isDouble =
        offer != null && isDoubleEliminationBracketFormat(offer.bracketFormat);
    final sections = visibleFocusSections(isDoubleElimination: isDouble);

    // A seção corrente pode sair da lista quando o formato resolve (ex.: entrou
    // por deep link em `grupo` e a categoria é dupla eliminação). Cai na
    // primeira, em vez de mostrar uma aba que a nav não tem.
    final current = sections.contains(_section) ? _section : sections.first;

    return Scaffold(
      backgroundColor: colors.canvas,
      extendBody: true,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: topInset + AppSpacing.xs),
          _Header(
            tournament: tournament,
            isDoubleElimination: isDouble,
            onExit: _exit,
          ),
          Expanded(
            child: switch ((unavailable, showBoot, tournament)) {
              (true, _, _) => const _TournamentUnavailable(),
              (_, _, null) || (_, true, _) => FocusBootLoader(
                progress: progress,
                tournamentName: tournament?.name,
              ),
              (_, _, final TournamentDetail loaded) => IndexedStack(
                index: sections.indexOf(current),
                sizing: StackFit.expand,
                children: [
                  for (final section in sections)
                    _sectionBody(section, loaded, categoryId, athleteTeamIds),
                ],
              ),
            },
          ),
        ],
      ),
      bottomNavigationBar: NexaBottomNavBar(
        currentIndex: sections.indexOf(current),
        onTap: (index) => setState(() => _section = sections[index]),
        items: [
          for (final section in sections)
            NexaBottomNavItem(
              label: section.label,
              icon: _iconOf(section),
              selectedIcon: _selectedIconOf(section),
              // O SF Symbol é OBRIGATÓRIO na prática: sem ele a barra nativa
              // cai no `iconData` e desenha o ícone fora de escala (era o que
              // acontecia — só o troféu saía certo, porque é o único destes
              // que o `materialIconToSfSymbol` conhece).
              sfSymbol: _sfSymbolOf(section),
              selectedSfSymbol: _selectedSfSymbolOf(section),
            ),
        ],
        uppercaseLabels: true,
      ),
    );
  }

  IconData _iconOf(FocusSection section) => switch (section) {
    FocusSection.agora => Icons.local_fire_department_outlined,
    FocusSection.trajetoria => Icons.emoji_events_outlined,
    FocusSection.grupo => Icons.table_rows_outlined,
    FocusSection.chave => Icons.account_tree_outlined,
    FocusSection.arena => Icons.place_outlined,
    FocusSection.palpites => Icons.casino_outlined,
  };

  IconData _selectedIconOf(FocusSection section) => switch (section) {
    FocusSection.agora => Icons.local_fire_department_rounded,
    FocusSection.trajetoria => Icons.emoji_events_rounded,
    FocusSection.grupo => Icons.table_rows_rounded,
    FocusSection.chave => Icons.account_tree_rounded,
    FocusSection.arena => Icons.place_rounded,
    FocusSection.palpites => Icons.casino_rounded,
  };

  String _sfSymbolOf(FocusSection section) => switch (section) {
    FocusSection.agora => 'flame',
    FocusSection.trajetoria => 'trophy',
    FocusSection.grupo => 'tablecells',
    FocusSection.chave => 'arrow.triangle.branch',
    FocusSection.arena => 'mappin.and.ellipse',
    FocusSection.palpites => 'die.face.5',
  };

  String _selectedSfSymbolOf(FocusSection section) => switch (section) {
    FocusSection.agora => 'flame.fill',
    FocusSection.trajetoria => 'trophy.fill',
    FocusSection.grupo => 'tablecells.fill',
    // Sem variante preenchida no SF; repete a de contorno em vez de cair
    // no `iconData`, que é o caminho que quebra a escala.
    FocusSection.chave => 'arrow.triangle.branch',
    FocusSection.arena => 'mappin.and.ellipse',
    FocusSection.palpites => 'die.face.5.fill',
  };

  Widget _sectionBody(
    FocusSection section,
    TournamentDetail tournament,
    String? categoryId,
    Set<String> athleteTeamIds,
  ) {
    return switch (section) {
      FocusSection.agora => FocusAgoraSection(
        tournament: tournament,
        categoryId: categoryId,
        athleteTeamIds: athleteTeamIds,
      ),
      FocusSection.trajetoria => FocusTrajetoriaSection(
        tournament: tournament,
        categoryId: categoryId,
        athleteTeamIds: athleteTeamIds,
      ),
      FocusSection.grupo =>
        categoryId == null
            ? const _NoCategory()
            : FocusGrupoSection(
                tournament: tournament,
                categoryId: categoryId,
                athleteTeamIds: athleteTeamIds,
              ),
      FocusSection.chave =>
        categoryId == null
            ? const _NoCategory()
            : FocusChaveSection(tournament: tournament, categoryId: categoryId),
      // Sem guarda de categoria: a Arena olha o torneio inteiro, e é o que
      // sobra para quem foi eliminado ou ainda não entrou em quadra.
      FocusSection.arena => FocusArenaSection(
        tournament: tournament,
        athleteTeamIds: athleteTeamIds,
      ),
      // Também sem guarda de categoria: os palpites são do torneio INTEIRO, a
      // mesma lista da rota `/torneios/:id/palpites`. `embedded` tira o
      // scaffold próprio da tela — a casca já tem cabeçalho e nav.
      FocusSection.palpites => TournamentPredictionsPage(
        tournamentId: tournament.id,
        embedded: true,
        bottomPadding: focusBottomClearance(context),
      ),
    };
  }
}

/// "× | ● FOCUS / Nome do torneio".
///
/// Sem relógio nem clima à direita: o relógio do sistema já fica na barra de
/// status logo acima, e o clima dos protótipos nunca teve fonte de dado.
class _Header extends StatelessWidget {
  const _Header({
    required this.tournament,
    required this.isDoubleElimination,
    required this.onExit,
  });

  final TournamentDetail? tournament;
  final bool isDoubleElimination;
  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xs,
        0,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          NexaIconSquareButton(
            icon: Icons.close_rounded,
            tooltip: 'Sair do Modo Focus',
            onTap: onExit,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: const BoxDecoration(
                        color: AppColors.brand,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      isDoubleElimination
                          ? 'FOCUS · DUPLA ELIMINATÓRIA'
                          : 'FOCUS',
                      style: AppTypography.eyebrow.copyWith(
                        color: AppColors.brand,
                      ),
                    ),
                  ],
                ),
                Text(
                  tournament?.name ?? 'Modo Focus',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.titleM.copyWith(color: colors.onSurface),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// O torneio assentou sem dado: id errado, removido ou regra negada.
///
/// A saída é o × do cabeçalho, que continua na tela durante todo o Focus — por
/// isso a cópia aponta para ele em vez de prometer um botão de tentar de novo
/// que a casca não tem.
class _TournamentUnavailable extends StatelessWidget {
  const _TournamentUnavailable();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xxl),
      child: Center(
        child: Text(
          'Não foi possível carregar este torneio. Toque no × para voltar e '
          'tentar de novo.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
        ),
      ),
    );
  }
}

/// Sem categoria resolvida não dá para desenhar grupo nem chave: as duas
/// derivam de `poolId`/`round` DENTRO de uma categoria.
class _NoCategory extends StatelessWidget {
  const _NoCategory();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xxl),
      child: Text(
        'Assim que você tiver partida numa categoria, o grupo e a chave dela '
        'aparecem aqui.',
        textAlign: TextAlign.center,
        style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
      ),
    );
  }
}
