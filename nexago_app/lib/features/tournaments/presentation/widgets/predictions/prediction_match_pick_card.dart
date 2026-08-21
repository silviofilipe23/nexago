import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_match_card_view.dart';
import '../../../domain/predictions/tournament_predictions_logic.dart';
import '../../../domain/tournament_match_card_row.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../match_card_symmetric_parts.dart';
import '../tournament_match_card_premium_skin.dart';

/// Card de palpite de uma partida: o MESMO card simétrico das telas do Modo
/// Focus — dupla à esquerda, centro, dupla à direita —, em que cada lado é o
/// alvo de toque para escolher o vencedor previsto.
///
/// Antes era outro desenho (duas linhas de botão com avatares menores e uma
/// pilha de fotos própria), e no meio das abas do Focus lia-se como uma tela de
/// outro app. A casca, o cabeçalho e os lados vêm dos mesmos widgets do card de
/// partida — [TournamentMatchCardSkin], [MatchCardHead], [MatchCardSide] —,
/// então um ajuste no card de partida chega aqui sozinho.
///
/// O que este card tem de próprio é só o centro: onde o card de partida mostra
/// o placar, aqui mostra "vs" enquanto dá para palpitar. Depois que a partida
/// trava, [focusMatchCardScoreOf] devolve o placar de verdade e o card passa a
/// ser idêntico ao do Focus — que é o que o torcedor quer ver nessa hora.
class PredictionMatchPickCard extends StatelessWidget {
  const PredictionMatchPickCard({
    super.key,
    required this.viewModel,
    required this.selectedTeamId,
    required this.locked,
    this.wasCorrect,
    this.onSelect,
  });

  final TournamentMatchCardViewModel viewModel;

  /// Id do time selecionado no rascunho local (ou já salvo), se houver.
  final String? selectedTeamId;

  /// `true` quando a partida não está mais `Scheduled` — seleção travada.
  final bool locked;

  /// `null` enquanto a partida não termina; `true`/`false` se o palpite
  /// salvo bateu ou não com o resultado final.
  final bool? wasCorrect;

  final ValueChanged<String>? onSelect;

  @override
  Widget build(BuildContext context) {
    final match = viewModel.match;
    final row = buildTournamentMatchRow(viewModel: viewModel);
    final score = focusMatchCardScoreOf(match, row.state);
    final pick = selectedTeamId?.trim();

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.sm,
      ),
      child: TournamentMatchCardSkin(
        stage: row.stage,
        isLive: row.state == TournamentMatchRowState.live,
        // A borda de destaque é do palpite, não da dupla do atleta: nesta tela
        // ele é torcedor, e "minha partida" não quer dizer nada.
        isMine: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            MatchCardHead(
              row: row,
              contextLabel: focusMatchCardContext(match: match),
              trailing: _HeadBadges(
                isChampionMatch: isChampionDecidingMatch(match),
                locked: locked,
                wasCorrect: wasCorrect,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _PickSide(
                    side: row.sideA,
                    selected: pick != null && pick == match.teamAId.trim(),
                    locked: locked,
                    onTap: onSelect == null || locked
                        ? null
                        : () => onSelect!(match.teamAId.trim()),
                  ),
                ),
                _Center(center: score.center, detail: score.detail, row: row),
                Expanded(
                  child: _PickSide(
                    side: row.sideB,
                    selected: pick != null && pick == match.teamBId.trim(),
                    locked: locked,
                    onTap: onSelect == null || locked
                        ? null
                        : () => onSelect!(match.teamBId.trim()),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Um lado do card virado em alvo de toque.
///
/// O anel envolve o lado inteiro em vez de sublinhar o nome: é ele que diz onde
/// se toca, e o card não tem outro affordance de escolha.
class _PickSide extends StatelessWidget {
  const _PickSide({
    required this.side,
    required this.selected,
    required this.locked,
    this.onTap,
  });

  final TournamentMatchRowSide side;
  final bool selected;
  final bool locked;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      // Depois da trava, o lado que NÃO foi palpitado recua — o que sobra na
      // tela é a escolha que o atleta fez.
      opacity: locked && !selected ? 0.55 : 1,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.10)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: 6,
              vertical: AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected ? AppColors.brand : Colors.transparent,
                width: 1.5,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                MatchCardSide(side: side, emphasized: selected),
                // Altura reservada nos dois lados: sem isso o card sobe e desce
                // um pouco a cada troca de palpite.
                SizedBox(
                  height: 20,
                  child: selected
                      ? const Padding(
                          padding: EdgeInsets.only(top: 4),
                          child: Icon(
                            Icons.check_circle_rounded,
                            size: 16,
                            color: AppColors.brand,
                          ),
                        )
                      : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// O meio do card: "vs" enquanto dá para palpitar, o placar depois da trava.
///
/// Largura FIXA pelo mesmo motivo do card de partida: a coluna do meio não é
/// `Expanded`, e uma linha de parciais medindo ~230px espremeria os avatares
/// das duplas sem lançar exceção nenhuma.
class _Center extends StatelessWidget {
  const _Center({required this.center, required this.detail, required this.row});

  final String center;
  final String? detail;
  final TournamentMatchRow row;

  static const double _width = 96;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final open = row.state == TournamentMatchRowState.scheduled ||
        row.state == TournamentMatchRowState.tbd;

    final color = switch (row.state) {
      TournamentMatchRowState.live => AppColors.brand,
      TournamentMatchRowState.done => switch (row.stage) {
          TournamentMatchRowStage.grandFinal => kMatchCardGold,
          TournamentMatchRowStage.thirdPlace => kMatchCardBronze,
          null => colors.onSurface,
        },
      _ => colors.onSurfaceMuted.withValues(alpha: 0.5),
    };

    return SizedBox(
      width: _width,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Alinha com os rostos das duplas, não com o topo do bloco.
          SizedBox(height: open ? 12 : 4),
          Text(
            center,
            style: AppTypography.mono(
              // O "vs" não compete com as duplas: aqui a informação é a
              // escolha, não o placar que ainda não existe.
              fontSize: open ? 15 : 26,
              fontWeight: open ? FontWeight.w600 : FontWeight.w800,
              color: color,
              letterSpacing: 0.5,
            ),
          ),
          if (detail != null) ...[
            const SizedBox(height: 5),
            Text(
              detail!,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: colors.onSurfaceMuted,
                letterSpacing: 1.1,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// "VALE CAMPEÃO", o veredito do palpite e o cadeado — o que este card tem a
/// mais que o card de partida, pendurado no fim do cabeçalho.
class _HeadBadges extends StatelessWidget {
  const _HeadBadges({
    required this.isChampionMatch,
    required this.locked,
    required this.wasCorrect,
  });

  final bool isChampionMatch;
  final bool locked;
  final bool? wasCorrect;

  @override
  Widget build(BuildContext context) {
    final verdict = switch (wasCorrect) {
      true => const _Badge(label: 'VOCÊ ACERTOU', color: AppColors.win),
      false => _Badge(
          label: 'VOCÊ ERROU',
          color: context.themeColors.onSurfaceMuted,
        ),
      null => locked
          ? Icon(
              Icons.lock_outline_rounded,
              size: 15,
              color: context.themeColors.onSurfaceMuted,
            )
          : null,
    };

    if (!isChampionMatch && verdict == null) return const SizedBox.shrink();

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isChampionMatch)
          const _Badge(label: 'VALE CAMPEÃO', color: AppColors.brand),
        if (isChampionMatch && verdict != null) const SizedBox(width: 6),
        if (verdict != null) verdict,
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.65)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 8,
          fontWeight: FontWeight.w700,
          color: color,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
