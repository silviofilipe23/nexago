import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/predictions/tournament_predictions_logic.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../../domain/tournament_match_display.dart';

/// Card de palpite de uma partida: dois botões (nome/foto de cada
/// atleta/dupla) pra escolher o vencedor previsto. Desabilita a seleção
/// (mas mantém visível) assim que a partida deixa de estar `Scheduled`.
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
    final metaLabel = matchMetaLabelForCard(match);
    final isChampionMatch = isChampionDecidingMatch(match);

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.14),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  metaLabel.isEmpty ? matchRoundLabel(match) : metaLabel,
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                    letterSpacing: 0.3,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (isChampionMatch) ...[
                SizedBox(width: 6),
                _Badge(
                  label: 'VALE CAMPEÃO',
                  color: AppColors.brand,
                ),
                SizedBox(width: 6),
              ],
              _LockOrStatusBadge(locked: locked, wasCorrect: wasCorrect),
            ],
          ),
          SizedBox(height: 10),
          _PickOption(
            team: viewModel.teamA,
            selected: selectedTeamId != null &&
                selectedTeamId == match.teamAId.trim(),
            locked: locked,
            onTap: onSelect == null || locked
                ? null
                : () => onSelect!(match.teamAId.trim()),
          ),
          SizedBox(height: 8),
          _PickOption(
            team: viewModel.teamB,
            selected: selectedTeamId != null &&
                selectedTeamId == match.teamBId.trim(),
            locked: locked,
            onTap: onSelect == null || locked
                ? null
                : () => onSelect!(match.teamBId.trim()),
          ),
        ],
      ),
    );
  }
}

class _LockOrStatusBadge extends StatelessWidget {
  const _LockOrStatusBadge({required this.locked, required this.wasCorrect});

  final bool locked;
  final bool? wasCorrect;

  @override
  Widget build(BuildContext context) {
    if (wasCorrect == true) {
      return _Badge(label: 'VOCÊ ACERTOU', color: AppColors.win);
    }
    if (wasCorrect == false) {
      return _Badge(
        label: 'VOCÊ ERROU',
        color: context.themeColors.onSurfaceMuted,
      );
    }
    if (!locked) return const SizedBox.shrink();
    return Icon(
      Icons.lock_outline_rounded,
      size: 15,
      color: context.themeColors.onSurfaceMuted,
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

class _PickOption extends StatelessWidget {
  const _PickOption({
    required this.team,
    required this.selected,
    required this.locked,
    this.onTap,
  });

  final TournamentMatchCardTeamViewModel team;
  final bool selected;
  final bool locked;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final borderColor = selected
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.16);
    final backgroundColor = selected
        ? AppColors.brand.withValues(alpha: 0.10)
        : context.themeColors.surfaceCard;

    return Opacity(
      opacity: locked && !selected ? 0.55 : 1,
      child: Material(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: borderColor, width: selected ? 1.5 : 1),
            ),
            child: Row(
              children: [
                _TeamAvatarStack(players: team.players),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    team.displayName,
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: context.themeColors.onSurface,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (selected) ...[
                  SizedBox(width: 6),
                  Icon(
                    Icons.check_circle_rounded,
                    size: 18,
                    color: AppColors.brand,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TeamAvatarStack extends StatelessWidget {
  const _TeamAvatarStack({required this.players});

  final List<TournamentMatchCardPlayerViewModel> players;

  static const _size = 30.0;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _size,
      width: players.length > 1 ? 46 : _size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          if (players.isNotEmpty)
            Positioned(left: 0, child: _AvatarCircle(player: players.first)),
          if (players.length > 1)
            Positioned(left: 16, child: _AvatarCircle(player: players[1])),
          if (players.isEmpty)
            Positioned(
              left: 0,
              child: _AvatarCircle(
                player: TournamentMatchCardPlayerViewModel(
                  initials: '?',
                  avatarColor: Color(0xFF5B8DEF),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AvatarCircle extends StatelessWidget {
  const _AvatarCircle({required this.player});

  final TournamentMatchCardPlayerViewModel player;

  static const _size = 30.0;

  @override
  Widget build(BuildContext context) {
    final url = player.avatarUrl?.trim();
    final hasPhoto = url != null && url.isNotEmpty;

    return Container(
      width: _size,
      height: _size,
      decoration: BoxDecoration(
        color: hasPhoto ? null : player.avatarColor,
        shape: BoxShape.circle,
        border: Border.all(color: context.themeColors.canvas, width: 1.5),
      ),
      child: ClipOval(
        child: hasPhoto
            ? CachedNetworkImage(
                imageUrl: url,
                width: _size,
                height: _size,
                fit: BoxFit.cover,
                placeholder: (_, __) => _initialsFallback(),
                errorWidget: (_, __, ___) => _initialsFallback(),
              )
            : _initialsFallback(),
      ),
    );
  }

  Widget _initialsFallback() {
    return Container(
      width: _size,
      height: _size,
      alignment: Alignment.center,
      color: player.avatarColor,
      child: Text(
        player.initials,
        style: AppTypography.soraRegular(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.white,
        ),
      ),
    );
  }
}
