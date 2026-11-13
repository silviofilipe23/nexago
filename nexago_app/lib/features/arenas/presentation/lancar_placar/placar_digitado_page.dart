import 'package:flutter/material.dart';

import '../../../../core/layout/nexa_app_bar.dart';
import '../../../../core/sports/sport_catalog.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../domain/booking_result.dart';
import '../../domain/lancar_placar.dart';
import '../pelada_live/pelada_live_widgets.dart';
import '../widgets/booking_story/booking_result_card.dart';
import 'lancar_placar_widgets.dart';
import 'placar_keypad_sheet.dart';

/// Lançar placar · 2 de 2, digitado (canvas "Proposta · 3"): números grandes
/// que abrem o teclado com os atalhos do esporte; o vencedor de cada set
/// acende sozinho e o botão diz o que falta em vez de dar erro.
class PlacarDigitadoPage extends StatefulWidget {
  const PlacarDigitadoPage({
    super.key,
    required this.initial,
    required this.submitLabel,
    required this.onSubmit,
    this.sport,
    this.canSend = true,
    this.guestNote,
    this.onChanged,
  });

  final BookingResult initial;

  /// "Enviar para Enzo, Rafael e Lia" · "Gerar arte do story".
  final String submitLabel;

  /// Envia (ou gera a arte). Erro mantém a tela com a mensagem.
  final Future<void> Function(BookingResult result) onSubmit;
  final String? sport;

  /// Quem reservou envia para confirmação; o convidado só gera a arte.
  final bool canSend;

  /// Rodapé do convidado ("Maria confere e envia…"); `null` = genérico.
  final String? guestNote;

  /// A cada mudança — o passo 1 guarda o placar se o atleta voltar.
  final ValueChanged<BookingResult>? onChanged;

  @override
  State<PlacarDigitadoPage> createState() => _PlacarDigitadoPageState();
}

class _PlacarDigitadoPageState extends State<PlacarDigitadoPage> {
  late BookingResult _r =
      widget.initial.games.isEmpty ? widget.initial.addGame() : widget.initial;
  bool _busy = false;

  void _set(BookingResult next) {
    setState(() => _r = next);
    widget.onChanged?.call(next);
  }

  String get _unit => lancarGameUnit(_r, widget.sport);

  String _teamName(int? id) =>
      (id == null ? null : _r.teamById(id))?.name ?? '—';

  Future<void> _edit(int index, {required bool sideA}) async {
    final g = _r.games[index];
    final teamId = sideA ? g.teamA : g.teamB;
    final value = await showPlacarKeypad(
      context,
      title: '$_unit ${index + 1} · ${_teamName(teamId)}',
      initial: sideA ? g.scoreA : g.scoreB,
      quick: lancarQuickScores(widget.sport, gameIndex: index),
    );
    if (value == null || !mounted) return;
    final updated =
        sideA ? g.copyWith(scoreA: value) : g.copyWith(scoreB: value);
    _set(_r.updateGame(index, updated));
    // Digitou um lado e o outro está vazio: já abre o outro.
    final other = sideA ? updated.scoreB : updated.scoreA;
    if (other == 0) await _edit(index, sideA: !sideA);
  }

  Future<void> _pickTeam(int index, {required bool sideA}) async {
    final g = _r.games[index];
    final other = sideA ? g.teamB : g.teamA;
    final colors = context.themeColors;
    final picked = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: colors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Text(
              'Quem jogou o ${_unit.toLowerCase()} ${index + 1}?',
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 8),
            for (final (i, t) in _r.teams.indexed)
              if (t.id != other)
                ListTile(
                  key: Key('placar-pick-team-${t.id}'),
                  leading: ResultTeamAvatars(
                    players: t.players,
                    size: 28,
                    borderColor: colors.surfaceSheet,
                  ),
                  title: Text(t.name),
                  subtitle: Text('Time ${lancarTeamLetter(i)}'),
                  onTap: () => Navigator.pop(context, t.id),
                ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    _set(
      _r.updateGame(
        index,
        sideA ? g.copyWith(teamA: picked) : g.copyWith(teamB: picked),
      ),
    );
  }

  Future<void> _submit() async {
    if (_busy || lancarScoreMissing(_r) != null) return;
    setState(() => _busy = true);
    try {
      await widget.onSubmit(_r);
    } catch (e) {
      if (mounted) showAppErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final missing = lancarScoreMissing(_r);
    final headline = lancarResultHeadline(_r);
    final sportLabel = SportCatalog.labelOf(widget.sport);
    final rotation = _r.isRotation;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: LancarPlacarTitle(
          title: 'Placar',
          subtitle: [
            '2 de 2',
            if (sportLabel != null) sportLabel.toLowerCase(),
            if (rotation) 'rei da quadra',
          ].join(' · '),
        ),
      ),
      bottomNavigationBar: LancarPlacarFooter(
        headline: headline,
        buttonKey: const Key('placar-submit'),
        label: missing ?? widget.submitLabel,
        enabled: missing == null,
        busy: _busy,
        onPressed: _submit,
        caption: widget.canSend
            ? 'Eles confirmam em até 48h · conta nas estatísticas, não no '
                'ranking'
            : widget.guestNote ?? lancarGuestSendNote(null),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        children: [
          const LancarPlacarSteps(step: 2),
          const SizedBox(height: 8),
          if (!rotation) _header(colors),
          for (final (i, g) in _r.games.indexed)
            rotation ? _gameCard(i, g) : _setRow(i, g),
          const SizedBox(height: 4),
          SizedBox(
            height: 48,
            child: OutlinedButton.icon(
              key: const Key('placar-add-game'),
              onPressed: () => _set(_r.addGame()),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: Text(
                rotation ? 'Próximo jogo' : 'Mais um ${_unit.toLowerCase()}',
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: colors.onSurface,
                side: BorderSide(
                  color: colors.onSurface.withValues(alpha: 0.16),
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
          PeladaLiveNote(
            rotation
                ? 'Toque no time para trocar quem jogou cada jogo e no '
                    'número para digitar. Quem vence fica em destaque.'
                : 'Toque no número para digitar. O vencedor de cada '
                    '${_unit.toLowerCase()} acende sozinho.',
          ),
        ],
      ),
    );
  }

  Widget _header(AppThemeColors colors) {
    Widget name(int index) {
      final team = _r.teams[index];
      return Expanded(
        child: Text(
          team.name,
          key: Key('placar-header-$index'),
          maxLines: 2,
          textAlign: TextAlign.center,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.soraRegular(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            color: lancarTeamColor(context, index),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          const SizedBox(width: 58),
          name(0),
          const SizedBox(width: 10),
          name(1),
          const SizedBox(width: 36),
        ],
      ),
    );
  }

  Widget _setRow(int i, ResultGame g) {
    final colors = context.themeColors;
    // Colunas na ordem dos times da lista, qualquer que seja o lado gravado.
    final first = _r.teams[0].id;
    final aIsFirst = g.teamA == first;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: 58,
            child: Text(
              '${_unit.toUpperCase()} ${i + 1}',
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                letterSpacing: 1.2,
                color: colors.onSurface.withValues(alpha: 0.6),
              ),
            ),
          ),
          Expanded(child: _box(i, g, sideA: aIsFirst)),
          const SizedBox(width: 10),
          Expanded(child: _box(i, g, sideA: !aIsFirst)),
          SizedBox(
            width: 36,
            child: _r.games.length > 1
                ? IconButton(
                    key: Key('placar-remove-$i'),
                    tooltip: 'Tirar o ${_unit.toLowerCase()} ${i + 1}',
                    onPressed: () => _set(_r.removeGame(i)),
                    icon: Icon(
                      Icons.close_rounded,
                      size: 18,
                      color: colors.onSurface.withValues(alpha: 0.5),
                    ),
                  )
                : null,
          ),
        ],
      ),
    );
  }

  Widget _gameCard(int i, ResultGame g) {
    final colors = context.themeColors;
    Widget line(bool sideA) {
      final teamId = sideA ? g.teamA : g.teamB;
      final index = _r.teams.indexWhere((t) => t.id == teamId);
      final team = _r.teamById(teamId);
      return Row(
        children: [
          Expanded(
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                key: Key('placar-game-$i-${sideA ? 'a' : 'b'}-team'),
                borderRadius: BorderRadius.circular(10),
                onTap: () => _pickTeam(i, sideA: sideA),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      LancarTeamBadge(index: index),
                      const SizedBox(width: 8),
                      ResultTeamAvatars(
                        players: team?.players ?? const [],
                        size: 24,
                        borderColor: colors.surfaceCard,
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          team?.name ?? '—',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      Icon(
                        Icons.unfold_more_rounded,
                        size: 16,
                        color: colors.onSurface.withValues(alpha: 0.45),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(width: 92, child: _box(i, g, sideA: sideA)),
        ],
      );
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(14, 8, 8, 12),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'JOGO ${i + 1}',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 1.2,
                    color: colors.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
              if (_r.games.length > 1)
                IconButton(
                  key: Key('placar-remove-$i'),
                  tooltip: 'Tirar o jogo ${i + 1}',
                  visualDensity: VisualDensity.compact,
                  onPressed: () => _set(_r.removeGame(i)),
                  icon: Icon(
                    Icons.close_rounded,
                    size: 18,
                    color: colors.onSurface.withValues(alpha: 0.5),
                  ),
                ),
            ],
          ),
          line(true),
          const SizedBox(height: 6),
          line(false),
        ],
      ),
    );
  }

  /// O número tocável de um lado do jogo.
  Widget _box(int i, ResultGame g, {required bool sideA}) {
    final colors = context.themeColors;
    final teamId = sideA ? g.teamA : g.teamB;
    final score = sideA ? g.scoreA : g.scoreB;
    final empty = g.scoreA == 0 && g.scoreB == 0;
    final won = !empty && g.winner == teamId;
    return Semantics(
      button: true,
      label: '${_teamName(teamId)}, ${empty ? 'sem placar' : '$score'}',
      child: Material(
        color:
            won ? AppColors.brand.withValues(alpha: 0.10) : colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: won
                ? AppColors.brand
                : colors.onSurface.withValues(alpha: 0.14),
            width: 1.5,
          ),
        ),
        child: InkWell(
          key: Key('placar-box-$i-${sideA ? 'a' : 'b'}'),
          borderRadius: BorderRadius.circular(16),
          onTap: () => _edit(i, sideA: sideA),
          child: SizedBox(
            height: 64,
            child: Center(
              child: Text(
                empty ? '–' : '$score',
                style: AppTypography.mono(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: won
                      ? colors.brandText
                      : empty
                          ? colors.onSurface.withValues(alpha: 0.3)
                          : colors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
