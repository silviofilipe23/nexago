import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../tournaments/domain/tournament_match_sanction.dart';
import 'organizer_match_live_table_widgets.dart';

const _yellowCard = Color(0xFFF5C518);
const _redCard = Color(0xFFD93025);

Color sanctionCardColor(MatchSanctionCard card) =>
    card == MatchSanctionCard.yellow ? _yellowCard : _redCard;

/// O que o mesário escolheu na folha de cartão.
typedef SanctionChoice = ({
  MatchSanctionCard card,
  String side,
  int slot,
  String playerName,
  String reason,
});

/// Folha "Cartão": tipo, atleta e motivo, mais a lista do que já foi lançado (com remoção).
/// Fecha devolvendo o [SanctionChoice] ou o id do cartão a remover, via os callbacks.
Future<void> showMatchSanctionSheet(
  BuildContext context, {
  required LiveTableTeamData teamA,
  required LiveTableTeamData teamB,
  required List<MatchSanction> sanctions,
  required ValueChanged<SanctionChoice> onConfirm,
  required ValueChanged<String> onRemove,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (sheetContext) => MatchSanctionSheet(
      teamA: teamA,
      teamB: teamB,
      sanctions: sanctions,
      onConfirm: (choice) {
        Navigator.pop(sheetContext);
        onConfirm(choice);
      },
      onRemove: (id) {
        Navigator.pop(sheetContext);
        onRemove(id);
      },
    ),
  );
}

class MatchSanctionSheet extends StatefulWidget {
  const MatchSanctionSheet({
    super.key,
    required this.teamA,
    required this.teamB,
    required this.sanctions,
    required this.onConfirm,
    required this.onRemove,
  });

  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final List<MatchSanction> sanctions;
  final ValueChanged<SanctionChoice> onConfirm;
  final ValueChanged<String> onRemove;

  @override
  State<MatchSanctionSheet> createState() => _MatchSanctionSheetState();
}

class _MatchSanctionSheetState extends State<MatchSanctionSheet> {
  MatchSanctionCard _card = MatchSanctionCard.yellow;
  ({String side, int slot})? _player;
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  String _nameOf(String side, int slot) {
    final team = side == 'A' ? widget.teamA : widget.teamB;
    final name = team.nameForSlot(slot);
    return name.isNotEmpty ? name : 'Atleta $slot';
  }

  void _confirm() {
    final player = _player;
    if (player == null) return;
    widget.onConfirm((
      card: _card,
      side: player.side,
      slot: player.slot,
      playerName: _nameOf(player.side, player.slot),
      reason: _reason.text.trim(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.9;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 18, 20, 16 + bottomInset),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'LANÇAR CARTÃO',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurfaceMuted,
                  letterSpacing: 0.6,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  for (final card in MatchSanctionCard.values) ...[
                    Expanded(
                      child: _CardChoice(
                        card: card,
                        selected: _card == card,
                        onTap: () => setState(() => _card = card),
                      ),
                    ),
                    if (card != MatchSanctionCard.values.last)
                      const SizedBox(width: 10),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _card == MatchSanctionCard.red
                    ? 'Vermelho é penalidade: o adversário ganha 1 ponto e o saque.'
                    : 'Amarelo é advertência: só fica registrado na súmula.',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 16),
              for (final entry in [
                ('A', widget.teamA),
                ('B', widget.teamB),
              ]) ...[
                Text(
                  entry.$2.label,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: colors.onSurfaceMuted,
                  ),
                ),
                const SizedBox(height: 6),
                for (final slot in entry.$2.slots)
                  _PlayerTile(
                    key: ValueKey('sanction-player-${entry.$1}$slot'),
                    name: _nameOf(entry.$1, slot),
                    selected:
                        _player?.side == entry.$1 && _player?.slot == slot,
                    onTap: () =>
                        setState(() => _player = (side: entry.$1, slot: slot)),
                  ),
                const SizedBox(height: 10),
              ],
              TextField(
                controller: _reason,
                maxLength: 120,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Motivo (opcional)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 6),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  key: const ValueKey('sanction-confirm'),
                  onPressed: _player == null ? null : _confirm,
                  child: Text('Lançar cartão ${_card.label.toLowerCase()}'),
                ),
              ),
              if (widget.sanctions.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text(
                  'CARTÕES NESTA PARTIDA',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: colors.onSurfaceMuted,
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 6),
                for (final s in widget.sanctions)
                  MatchSanctionTile(
                    sanction: s,
                    onRemove: () => widget.onRemove(s.id),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CardChoice extends StatelessWidget {
  const _CardChoice({
    required this.card,
    required this.selected,
    required this.onTap,
  });

  final MatchSanctionCard card;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = sanctionCardColor(card);
    return InkWell(
      key: ValueKey('sanction-card-${card.wire}'),
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        height: 56,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color.withValues(alpha: selected ? 0.22 : 0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color, width: selected ? 2 : 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 18,
              height: 24,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              card.label,
              style: AppTypography.soraRegular(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlayerTile extends StatelessWidget {
  const _PlayerTile({
    super.key,
    required this.name,
    required this.selected,
    required this.onTap,
  });

  final String name;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: selected ? colors.surfaceRaised : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected
                    ? colors.onSurface
                    : colors.onSurfaceMuted.withValues(alpha: 0.18),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                if (selected) const Icon(Icons.check_rounded, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Uma linha de cartão lançado: usada na folha (com remoção) e na súmula (sem).
class MatchSanctionTile extends StatelessWidget {
  const MatchSanctionTile({
    super.key,
    required this.sanction,
    this.onRemove,
    this.teamLabel = '',
  });

  final MatchSanction sanction;

  /// Na súmula o cartão mostra a equipe; na folha ela já está agrupada acima.
  final String teamLabel;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = sanction;
    final detail = [
      if (teamLabel.isNotEmpty) teamLabel,
      'Set ${s.setIndex + 1} · ${s.scoreA}x${s.scoreB}',
      if (s.reason.isNotEmpty) s.reason,
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 14,
            height: 20,
            decoration: BoxDecoration(
              color: sanctionCardColor(s.card),
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  s.playerName.isNotEmpty
                      ? s.playerName
                      : 'Atleta ${s.playerSlot}',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                Text(
                  detail,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          if (onRemove != null)
            IconButton(
              tooltip: 'Remover cartão',
              icon: const Icon(Icons.delete_outline_rounded),
              onPressed: onRemove,
            ),
        ],
      ),
    );
  }
}
