import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../domain/category_ops/category_ops_models.dart';
import '../../../tournaments/domain/koc/koc_round_state.dart';

const _durationOptionsMin = [10, 12, 15, 20];

/// Painel de preparação da mesa KOTC — espelho do protótipo "Mesa ao vivo"
/// antes do apito: confronto de abertura, ordem da fila e config da rodada.
class KocTableStartPanel extends StatefulWidget {
  const KocTableStartPanel({
    super.key,
    required this.round,
    required this.teamsById,
    required this.courtLabel,
    required this.telãoUrl,
    required this.onOpenTelão,
    required this.onStart,
    required this.busy,
  });

  final KocRoundState round;
  final Map<String, OrganizerCategoryTeamRow> teamsById;
  final String courtLabel;
  final String telãoUrl;
  final VoidCallback onOpenTelão;
  final Future<void> Function({
    required List<String> teamIds,
    required int durationSec,
    required int qualifiersPerRound,
  }) onStart;
  final bool busy;

  @override
  State<KocTableStartPanel> createState() => _KocTableStartPanelState();
}

class _KocTableStartPanelState extends State<KocTableStartPanel> {
  late List<String> _order;
  late int _durationMin;
  late int _qualifiers;

  @override
  void initState() {
    super.initState();
    _syncFromRound(widget.round);
  }

  @override
  void didUpdateWidget(covariant KocTableStartPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Só ressincroniza se o elenco gravado mudou (fase anterior encheu a vaga).
    // Mexidas locais de ordem/duração não podem ser apagadas por um snapshot.
    final prev = oldWidget.round.teamIds.join('|');
    final next = widget.round.teamIds.join('|');
    if (prev != next) _syncFromRound(widget.round);
  }

  void _syncFromRound(KocRoundState round) {
    _order = [...round.teamIds];
    _durationMin = _nearestDurationMin(round.configuredDurationSec);
    final maxQ = math.max(1, _order.length - 1);
    _qualifiers = round.qualifiersPerRound.clamp(1, maxQ);
  }

  static int _nearestDurationMin(int sec) {
    final min = (sec / 60).round();
    return _durationOptionsMin.reduce(
      (a, b) => (a - min).abs() <= (b - min).abs() ? a : b,
    );
  }

  void _move(int index, int delta) {
    final target = index + delta;
    if (target < 0 || target >= _order.length) return;
    setState(() {
      final item = _order.removeAt(index);
      _order.insert(target, item);
    });
  }

  void _shuffle() {
    if (_order.length < 2) return;
    setState(() {
      _order = [..._order]..shuffle(math.Random());
    });
  }

  Future<void> _start() async {
    await widget.onStart(
      teamIds: List<String>.from(_order),
      durationSec: _durationMin * 60,
      qualifiersPerRound: _qualifiers,
    );
  }

  OrganizerCategoryTeamRow? _team(String id) => widget.teamsById[id];

  String _shortName(String id) {
    final team = _team(id);
    if (team == null) return 'Dupla';
    final a = _first(team.player1.name);
    final b = _first(team.player2.name);
    final parts = [a, b].where((n) => n.isNotEmpty).toList();
    return parts.isEmpty ? 'Dupla' : parts.join(' / ');
  }

  String _fullNames(String id) {
    final team = _team(id);
    if (team == null) return '';
    final parts = [team.player1.name.trim(), team.player2.name.trim()]
        .where((n) => n.isNotEmpty)
        .toList();
    return parts.join(' · ');
  }

  static String _first(String full) {
    final parts = full.trim().split(RegExp(r'\s+'));
    return parts.isEmpty ? '' : parts.first;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 960;
        final main = _MainColumn(
          order: _order,
          shortName: _shortName,
          fullNames: _fullNames,
          teamOf: _team,
          onMove: _move,
          onShuffle: _shuffle,
        );
        final side = _SideColumn(
          durationMin: _durationMin,
          qualifiers: _qualifiers,
          maxQualifiers: math.max(1, _order.length - 1),
          teamCount: _order.length,
          courtLabel: widget.courtLabel,
          telãoUrl: widget.telãoUrl,
          onOpenTelão: widget.onOpenTelão,
          busy: widget.busy,
          onDuration: (m) => setState(() => _durationMin = m),
          onQualifiers: (q) => setState(() => _qualifiers = q),
          onStart: _start,
          onCancel: () => Navigator.of(context).maybePop(),
        );
        if (wide) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 3,
                child: SingleChildScrollView(child: main),
              ),
              const SizedBox(width: 16),
              SizedBox(
                width: 340,
                child: SingleChildScrollView(child: side),
              ),
            ],
          );
        }
        return ListView(
          padding: EdgeInsets.zero,
          children: [
            main,
            const SizedBox(height: 16),
            side,
          ],
        );
      },
    );
  }
}

class _MainColumn extends StatelessWidget {
  const _MainColumn({
    required this.order,
    required this.shortName,
    required this.fullNames,
    required this.teamOf,
    required this.onMove,
    required this.onShuffle,
  });

  final List<String> order;
  final String Function(String id) shortName;
  final String Function(String id) fullNames;
  final OrganizerCategoryTeamRow? Function(String id) teamOf;
  final void Function(int index, int delta) onMove;
  final VoidCallback onShuffle;

  @override
  Widget build(BuildContext context) {
    final throne = order.isNotEmpty ? order.first : null;
    final challenger = order.length > 1 ? order[1] : null;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'CONFRONTO DE ABERTURA',
                style: AppTypography.soraRegular(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              const Spacer(),
              Flexible(
                child: Text(
                  'SÓ O TRONO PONTUA · COROAÇÃO NÃO VALE PONTO',
                  textAlign: TextAlign.right,
                  style: AppTypography.soraRegular(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (throne != null && challenger != null)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: _OpeningCard(
                      badge: 'ENTRA NO TRONO',
                      badgeColor: AppColors.brand,
                      highlighted: true,
                      team: teamOf(throne),
                      shortName: shortName(throne),
                      fullNames: fullNames(throne),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Center(
                      child: Text(
                        'VS',
                        style: AppTypography.soraRegular(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: _OpeningCard(
                      badge: 'DESAFIA PRIMEIRO · SACA',
                      badgeColor: context.themeColors.onSurfaceMuted,
                      highlighted: false,
                      team: teamOf(challenger),
                      shortName: shortName(challenger),
                      fullNames: fullNames(challenger),
                    ),
                  ),
                ],
              ),
            )
          else
            Text(
              order.isEmpty
                  ? 'Elenco definido quando a fase anterior terminar.'
                  : 'É preciso ao menos 2 duplas para abrir a rodada.',
              style: AppTypography.soraRegular(
                fontSize: 14,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          const SizedBox(height: 28),
          Row(
            children: [
              Text(
                'ORDEM DA FILA',
                style: AppTypography.soraRegular(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'REORDENE ↑↓ ANTES DO APITO',
                  style: AppTypography.soraRegular(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: order.length < 2 ? null : onShuffle,
                icon: const Icon(Icons.casino_outlined, size: 16),
                label: const Text('Sortear ordem'),
                style: TextButton.styleFrom(
                  foregroundColor: context.themeColors.onSurface,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < order.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _QueueRow(
                index: i,
                team: teamOf(order[i]),
                shortName: shortName(order[i]),
                fullNames: fullNames(order[i]),
                role: i == 0
                    ? 'TRONO'
                    : i == 1
                        ? 'DESAFIA'
                        : 'NA FILA',
                roleColor: i == 0
                    ? AppColors.brand
                    : i == 1
                        ? AppColors.win
                        : context.themeColors.onSurfaceMuted,
                highlighted: i == 0,
                onUp: i == 0 ? null : () => onMove(i, -1),
                onDown: i == order.length - 1 ? null : () => onMove(i, 1),
              ),
            ),
        ],
      ),
    );
  }
}

class _OpeningCard extends StatelessWidget {
  const _OpeningCard({
    required this.badge,
    required this.badgeColor,
    required this.highlighted,
    required this.team,
    required this.shortName,
    required this.fullNames,
  });

  final String badge;
  final Color badgeColor;
  final bool highlighted;
  final OrganizerCategoryTeamRow? team;
  final String shortName;
  final String fullNames;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
      decoration: BoxDecoration(
        color: highlighted
            ? AppColors.brand.withValues(alpha: 0.1)
            : context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: highlighted
              ? AppColors.brand.withValues(alpha: 0.55)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
          width: highlighted ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: badgeColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              badge,
              style: AppTypography.soraRegular(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
                color: badgeColor,
              ),
            ),
          ),
          const SizedBox(height: 14),
          _AvatarPair(team: team),
          const SizedBox(height: 12),
          Text(
            shortName,
            style: AppTypography.soraRegular(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          if (fullNames.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              fullNames,
              style: AppTypography.soraRegular(
                fontSize: 12,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _QueueRow extends StatelessWidget {
  const _QueueRow({
    required this.index,
    required this.team,
    required this.shortName,
    required this.fullNames,
    required this.role,
    required this.roleColor,
    required this.highlighted,
    required this.onUp,
    required this.onDown,
  });

  final int index;
  final OrganizerCategoryTeamRow? team;
  final String shortName;
  final String fullNames;
  final String role;
  final Color roleColor;
  final bool highlighted;
  final VoidCallback? onUp;
  final VoidCallback? onDown;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: highlighted
            ? AppColors.brand.withValues(alpha: 0.08)
            : context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: highlighted
              ? AppColors.brand.withValues(alpha: 0.35)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text(
              '${index + 1}',
              style: AppTypography.soraRegular(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
              ),
            ),
          ),
          _AvatarPair(team: team, size: 28),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  shortName,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
                if (fullNames.isNotEmpty)
                  Text(
                    fullNames,
                    style: AppTypography.soraRegular(
                      fontSize: 11,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
              ],
            ),
          ),
          Text(
            role,
            style: AppTypography.soraRegular(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
              color: roleColor,
            ),
          ),
          const SizedBox(width: 4),
          Column(
            children: [
              _IconTiny(
                icon: Icons.keyboard_arrow_up_rounded,
                onTap: onUp,
              ),
              _IconTiny(
                icon: Icons.keyboard_arrow_down_rounded,
                onTap: onDown,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _IconTiny extends StatelessWidget {
  const _IconTiny({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 28,
      height: 22,
      child: IconButton(
        padding: EdgeInsets.zero,
        visualDensity: VisualDensity.compact,
        onPressed: onTap,
        icon: Icon(
          icon,
          size: 18,
          color: onTap == null
              ? context.themeColors.onSurfaceMuted.withValues(alpha: 0.3)
              : context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

class _AvatarPair extends StatelessWidget {
  const _AvatarPair({required this.team, this.size = 36});

  final OrganizerCategoryTeamRow? team;
  final double size;

  @override
  Widget build(BuildContext context) {
    final p1 = team?.player1;
    final p2 = team?.player2;
    return SizedBox(
      width: size * 1.7,
      height: size,
      child: Stack(
        children: [
          Positioned(
            left: 0,
            child: _Avatar(
              initials: p1?.initials ?? '?',
              photoUrl: p1?.profilePhotoUrl ?? '',
              size: size,
            ),
          ),
          Positioned(
            left: size * 0.7,
            child: _Avatar(
              initials: p2?.initials ?? '?',
              photoUrl: p2?.profilePhotoUrl ?? '',
              size: size,
            ),
          ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.initials,
    required this.photoUrl,
    required this.size,
  });

  final String initials;
  final String photoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final url = photoUrl.trim();
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: context.themeColors.surfaceSheet,
        border: Border.all(color: context.themeColors.canvas, width: 2),
        image: url.isNotEmpty
            ? DecorationImage(image: NetworkImage(url), fit: BoxFit.cover)
            : null,
      ),
      alignment: Alignment.center,
      child: url.isEmpty
          ? Text(
              initials,
              style: AppTypography.soraRegular(
                fontSize: size * 0.32,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
              ),
            )
          : null,
    );
  }
}

class _SideColumn extends StatelessWidget {
  const _SideColumn({
    required this.durationMin,
    required this.qualifiers,
    required this.maxQualifiers,
    required this.teamCount,
    required this.courtLabel,
    required this.telãoUrl,
    required this.onOpenTelão,
    required this.busy,
    required this.onDuration,
    required this.onQualifiers,
    required this.onStart,
    required this.onCancel,
  });

  final int durationMin;
  final int qualifiers;
  final int maxQualifiers;
  final int teamCount;
  final String courtLabel;
  final String telãoUrl;
  final VoidCallback onOpenTelão;
  final bool busy;
  final ValueChanged<int> onDuration;
  final ValueChanged<int> onQualifiers;
  final VoidCallback onStart;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final qualifierOptions = [
      for (var i = 1; i <= math.min(3, maxQualifiers); i++) i,
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _sectionLabel(context, 'DURAÇÃO DA RODADA'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final m in _durationOptionsMin)
                _ChipButton(
                  label: '$m min',
                  selected: durationMin == m,
                  onTap: () => onDuration(m),
                ),
            ],
          ),
          const SizedBox(height: 20),
          _sectionLabel(context, 'DUPLAS QUE AVANÇAM'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final q in qualifierOptions)
                _ChipButton(
                  label: '$q',
                  selected: qualifiers == q,
                  onTap: () => onQualifiers(q),
                ),
            ],
          ),
          const SizedBox(height: 20),
          _sectionLabel(context, 'REGRAS DA RODADA'),
          const SizedBox(height: 8),
          _Rule('Trono vence o rally: +1 ponto e segue no trono'),
          _Rule('Desafiante vence: assume o trono, sem ponto'),
          _Rule('Quem sai: vai para o fim da fila'),
          _Rule('Fim da rodada: $durationMin min · $qualifiers duplas avançam'),
          const SizedBox(height: 20),
          _sectionLabel(context, 'TELÃO DA QUADRA'),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
              ),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: QrImageView(
                        data: telãoUrl,
                        size: 64,
                        backgroundColor: Colors.white,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        telãoUrl.replaceFirst(RegExp(r'^https?://'), ''),
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: onOpenTelão,
                        child: const Text('Abrir'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextButton(
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(text: telãoUrl));
                          if (context.mounted) {
                            showAppSnackBar(context, 'Link do telão copiado.');
                          }
                        },
                        child: const Text('Copiar'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: busy || teamCount < 2 ? null : onStart,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(56),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: Column(
              children: [
                Text(
                  'Iniciar rodada',
                  style: AppTypography.soraRegular(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$teamCount DUPLAS · $durationMin MIN'
                  '${courtLabel.isNotEmpty ? ' · ${courtLabel.toUpperCase()}' : ''}',
                  style: AppTypography.soraRegular(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.4,
                    color: Colors.white.withValues(alpha: 0.85),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: busy ? null : onCancel,
            child: const Text('Cancelar e voltar ao evento'),
          ),
        ],
      ),
    );
  }

  static Widget _sectionLabel(BuildContext context, String text) {
    return Text(
      text,
      style: AppTypography.soraRegular(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.8,
        color: context.themeColors.onSurfaceMuted,
      ),
    );
  }
}

class _ChipButton extends StatelessWidget {
  const _ChipButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.12)
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          constraints: const BoxConstraints(minWidth: 56, minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
            ),
          ),
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: selected ? AppColors.brand : context.themeColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Container(
              width: 5,
              height: 5,
              decoration: const BoxDecoration(
                color: AppColors.brand,
                shape: BoxShape.circle,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: AppTypography.soraRegular(
                fontSize: 13,
                height: 1.35,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
