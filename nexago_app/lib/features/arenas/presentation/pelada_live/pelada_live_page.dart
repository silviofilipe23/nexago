import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../data/pelada_live_draft_store.dart';
import '../../domain/booking_result.dart';
import '../../domain/pelada_live/pelada_live_match.dart';
import '../../domain/pelada_live/pelada_live_rules.dart';
import '../../domain/pelada_live/pelada_live_session.dart';
import '../widgets/booking_story/booking_result_card.dart';
import 'pelada_live_widgets.dart';

/// O que a folha de fim de jogo escolheu.
enum _FinishAction { useScore, next, undo }

/// Placar ao vivo da pelada (canvas "Pelada · marcar ao vivo", 06–11): cada
/// metade é um time, tocar nela marca o ponto. Fecha game, set e partida pela
/// regra do esporte, avisa set point, troca de lado e fim do tempo. Cada lance
/// vai para o rascunho do aparelho; "Usar no placar" devolve o
/// [BookingResult] para o Editar placar.
class PeladaLivePage extends StatefulWidget {
  const PeladaLivePage({
    super.key,
    required this.session,
    required this.store,
    required this.draftKey,
    this.sportLabel,
    this.clock = DateTime.now,
    this.keepAwake = true,
  });

  final PeladaLiveSession session;
  final PeladaLiveDraftStore store;
  final String draftKey;
  final String? sportLabel;
  final DateTime Function() clock;

  /// Mantém a tela acesa enquanto marca (desligado nos testes).
  final bool keepAwake;

  @override
  State<PeladaLivePage> createState() => _PeladaLivePageState();
}

class _PeladaLivePageState extends State<PeladaLivePage> {
  late PeladaLiveSession _s = widget.session;
  Timer? _ticker;
  Timer? _toastTimer;
  String? _toast;
  bool _sheetOpen = false;

  @override
  void initState() {
    super.initState();
    if (widget.keepAwake) {
      unawaited(WakelockPlus.enable().catchError((Object _) {}));
    }
    _syncTicker();
    _persist();
    // Rascunho reaberto com a partida já encerrada: mostra o fim de novo.
    if (_s.match.finished) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _finish());
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _toastTimer?.cancel();
    if (widget.keepAwake) {
      unawaited(WakelockPlus.disable().catchError((Object _) {}));
    }
    super.dispose();
  }

  void _persist() => unawaited(widget.store.save(widget.draftKey, _s));

  void _syncTicker() {
    final needs = _s.rules.timed && _s.match.running && !_s.match.finished;
    if (!needs) {
      _ticker?.cancel();
      _ticker = null;
      return;
    }
    _ticker ??=
        Timer.periodic(const Duration(milliseconds: 500), (_) => _tick());
  }

  void _tick() {
    if (!mounted) return;
    final now = widget.clock();
    final left = _s.match.remainingAt(now);
    if (left != null && left <= 0) {
      _update(_s.withMatch(_s.match.expire(now)));
      return;
    }
    setState(() {});
  }

  /// Aplica um novo estado: grava, ajusta o cronômetro e reage ao evento.
  void _update(PeladaLiveSession next) {
    setState(() => _s = next);
    _persist();
    _syncTicker();
    switch (next.match.lastEvent) {
      case LiveEvent.courtSwitch:
        HapticFeedback.heavyImpact();
        // Fica na tela até o próximo ponto: a troca leva o tempo que levar.
        _showToast('Troquem de lado', untilNextPoint: true);
      case LiveEvent.set:
        HapticFeedback.heavyImpact();
        _showToast('Fim do set ${next.gameNumber - 1}');
      case LiveEvent.golden:
        HapticFeedback.heavyImpact();
        _showToast(
          next.rules.mode == PeladaLiveMode.goals
              ? 'Acabou o tempo empatado: gol de ouro'
              : 'Acabou o tempo empatado: o próximo ponto decide',
        );
      case LiveEvent.match:
      case LiveEvent.timeUp:
        HapticFeedback.heavyImpact();
        _finish();
      case LiveEvent.game:
        HapticFeedback.mediumImpact();
      case LiveEvent.none:
        HapticFeedback.selectionClick();
    }
  }

  /// [untilNextPoint]: sem prazo, some no próximo ponto (ou no toque nele).
  void _showToast(String text, {bool untilNextPoint = false}) {
    _toastTimer?.cancel();
    setState(() => _toast = text);
    if (untilNextPoint) return;
    _toastTimer = Timer(const Duration(seconds: 4), () {
      if (mounted) setState(() => _toast = null);
    });
  }

  void _point(LiveSide side, [int value = 1]) {
    if (_s.match.finished) {
      _finish();
      return;
    }
    // O ponto seguinte tira o aviso anterior (troca de lado, fim do set).
    _toastTimer?.cancel();
    _toast = null;
    _update(_s.point(side, value: value, now: widget.clock()));
  }

  void _undo() {
    if (!_s.canUndo) return;
    HapticFeedback.selectionClick();
    setState(() {
      _s = _s.undo(now: widget.clock());
      _toast = null;
    });
    _persist();
    _syncTicker();
  }

  void _swap() {
    setState(() => _s = _s.swapSides());
    _persist();
  }

  void _toggleClock() {
    final now = widget.clock();
    final m = _s.match;
    _update(_s.withMatch(m.running ? m.pause(now) : m.resume(now)));
  }

  void _useScore() {
    Navigator.of(context).pop<BookingResult>(_s.toResult());
  }

  Future<void> _finish() async {
    if (_sheetOpen || !mounted) return;
    _sheetOpen = true;
    final action = await showModalBottomSheet<_FinishAction>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (_) => _FinishSheet(session: _s),
    );
    _sheetOpen = false;
    if (!mounted) return;
    switch (action) {
      case _FinishAction.useScore:
        _useScore();
      case _FinishAction.next:
        setState(() {
          _s = _s.nextGame(now: widget.clock());
          _toast = null;
        });
        _persist();
        _syncTicker();
      case _FinishAction.undo:
        _undo();
      case null:
        break;
    }
  }

  Future<void> _menu() async {
    final colors = context.themeColors;
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: colors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                key: const Key('pelada-live-menu-use'),
                leading: const Icon(Icons.check_rounded),
                title: Text(
                  'Encerrar e usar no placar · ${_s.gamesCount} '
                  '${_unit(_s.gamesCount)}',
                ),
                onTap: () => Navigator.pop(context, 'use'),
              ),
              ListTile(
                leading: const Icon(Icons.swap_vert_rounded),
                title: const Text('Trocar lados'),
                onTap: () => Navigator.pop(context, 'swap'),
              ),
              if (_s.rules.usesSets)
                ListTile(
                  leading: const Icon(Icons.sports_volleyball_outlined),
                  title: Text(
                    _s.match.serving == null
                        ? 'Marcar quem saca'
                        : 'Trocar o saque',
                  ),
                  onTap: () => Navigator.pop(context, 'serve'),
                ),
              ListTile(
                key: const Key('pelada-live-menu-discard'),
                leading: Icon(Icons.delete_outline_rounded, color: colors.live),
                title: Text(
                  'Descartar marcação',
                  style: TextStyle(color: colors.live),
                ),
                onTap: () => Navigator.pop(context, 'discard'),
              ),
            ],
          ),
        ),
      ),
    );
    if (!mounted) return;
    switch (choice) {
      case 'use':
        _useScore();
      case 'swap':
        _swap();
      case 'serve':
        final m = _s.match;
        setState(
          () => _s = _s.withMatch(
            m.withServing(m.serving == null ? LiveSide.a : m.serving!.other),
          ),
        );
        _persist();
      case 'discard':
        final ok = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Descartar a marcação?'),
            content: const Text(
              'Os pontos marcados ao vivo somem. O placar da pelada não muda.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Voltar'),
              ),
              FilledButton(
                key: const Key('pelada-live-discard-confirm'),
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Descartar'),
              ),
            ],
          ),
        );
        if (ok != true || !mounted) return;
        await widget.store.clear(widget.draftKey);
        if (mounted) Navigator.of(context).pop();
    }
  }

  String _unit(int n) {
    final base = _s.isRotation || !_s.rules.usesSets ? 'jogo' : 'set';
    return n == 1 ? base : '${base}s';
  }

  String get _title {
    final s = _s;
    if (s.isRotation) return 'Jogo ${s.gameNumber} · rei da quadra';
    final target = s.match.targetLabel;
    final unit = s.rules.usesSets ? 'Set' : 'Jogo';
    return target.isEmpty
        ? '$unit ${s.gameNumber}'
        : '$unit ${s.gameNumber} · $target';
  }

  String get _subtitle => [
        if ((widget.sportLabel ?? '').isNotEmpty) widget.sportLabel!,
        _s.rules.summary,
      ].join(' · ');

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final m = _s.match;
    final now = widget.clock();
    final remaining = m.remainingAt(now);

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
              child: Row(
                children: [
                  _SquareButton(
                    key: const Key('pelada-live-close'),
                    icon: Icons.close_rounded,
                    tooltip: 'Fechar (a marcação fica salva)',
                    onTap: () => Navigator.of(context).pop(),
                  ),
                  Expanded(
                    child: Column(
                      children: [
                        Text(
                          _title,
                          key: const Key('pelada-live-title'),
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _subtitle.toUpperCase(),
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.mono(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w500,
                            letterSpacing: 1,
                            color: colors.onSurface.withValues(alpha: 0.6),
                          ),
                        ),
                      ],
                    ),
                  ),
                  _SquareButton(
                    key: const Key('pelada-live-menu'),
                    icon: Icons.more_horiz_rounded,
                    tooltip: 'Mais opções',
                    onTap: _menu,
                  ),
                ],
              ),
            ),
            Expanded(
              child: Stack(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                    child: Column(
                      children: [
                        Expanded(child: _half(LiveSide.a)),
                        _strip(remaining),
                        Expanded(child: _half(LiveSide.b)),
                      ],
                    ),
                  ),
                  if (_toast != null)
                    Center(
                      child: _Toast(
                        text: _toast!,
                        onTap: () => setState(() => _toast = null),
                      ),
                    ),
                ],
              ),
            ),
            _footer(),
          ],
        ),
      ),
    );
  }

  Widget _footer() {
    final colors = context.themeColors;
    final style = TextStyle(
      fontSize: 11.5,
      color: colors.onSurface.withValues(alpha: 0.6),
    );
    final queue = _s.queue;
    if (queue.isNotEmpty) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        child: Row(
          children: [
            Icon(Icons.emoji_events_outlined, size: 16, color: colors.pending),
            const SizedBox(width: 8),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    const TextSpan(text: 'Na fila: '),
                    TextSpan(
                      text: queue.map((t) => t.name).join(' → '),
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: style,
              ),
            ),
          ],
        ),
      );
    }
    final hint = switch (_s.rules.mode) {
      PeladaLiveMode.baskets => _s.rules.threePointers
          ? 'Lance livre 1 · cesta de dentro 2 · de fora do arco 3'
          : 'Lance livre e cesta de dentro valem 1 · de fora do arco, 2',
      PeladaLiveMode.goals => 'Toque na metade de quem fez o gol',
      _ => 'Toque na metade de quem fez o ponto',
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Text(hint, textAlign: TextAlign.center, style: style),
    );
  }

  Widget _half(LiveSide side) {
    final colors = context.themeColors;
    final m = _s.match;
    final team = side == LiveSide.a ? _s.teamOnA : _s.teamOnB;
    final tone = PeladaLiveColors.of(side);
    final text = PeladaLiveColors.text(context, side);
    final display = side == LiveSide.a ? m.display.a : m.display.b;
    final flag = m.flagFor(side);
    final values = _s.rules.pointValues;
    final buttons = values.length > 1;
    final won = m.winner == side;

    String sub;
    switch (_s.rules.mode) {
      case PeladaLiveMode.setsPoints:
        final sets = side == LiveSide.a ? m.setsWon.a : m.setsWon.b;
        final wins = _s.winsOf(team?.id ?? -1);
        if (_s.isRotation) {
          sub = '$wins ${wins == 1 ? 'vitória' : 'vitórias'}';
        } else if (_s.rules.bestOf > 1) {
          sub = '$sets ${sets == 1 ? 'set' : 'sets'}';
        } else {
          sub = _s.base.games.isEmpty
              ? ''
              : '$wins ${wins == 1 ? 'set' : 'sets'}';
        }
      case PeladaLiveMode.setsGames:
        sub = 'games ${side == LiveSide.a ? m.current.a : m.current.b}';
      default:
        final wins = _s.winsOf(team?.id ?? -1);
        sub = _s.isRotation || _s.base.games.isNotEmpty
            ? '$wins ${wins == 1 ? 'vitória' : 'vitórias'}'
            : '';
    }

    final content = Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      child: Column(
        children: [
          Row(
            children: [
              ResultTeamAvatars(
                players: team?.players ?? const [],
                size: 26,
                borderColor: colors.canvas,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  team?.name ?? '—',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              if (won)
                PeladaLivePill('venceu', color: colors.win)
              else if (flag != null)
                PeladaLivePill(flag, color: text),
              if (_s.rules.usesSets &&
                  _s.rules.bestOf > 1 &&
                  !_s.isRotation) ...[
                const SizedBox(width: 8),
                _SetDots(
                  won: side == LiveSide.a ? m.setsWon.a : m.setsWon.b,
                  needed: (_s.rules.bestOf / 2).ceil(),
                  color: tone,
                ),
              ],
            ],
          ),
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                display,
                key: Key('pelada-live-score-${side.name}'),
                style: AppTypography.mono(
                  fontSize: 132,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -6,
                  height: 1,
                  color: text,
                ),
              ),
            ),
          ),
          if (buttons)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  for (final (i, v) in values.indexed) ...[
                    if (i > 0) const SizedBox(width: 8),
                    Expanded(
                      child: SizedBox(
                        height: 52,
                        child: OutlinedButton(
                          key: Key('pelada-live-${side.name}-plus$v'),
                          onPressed: () => _point(side, v),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: text,
                            side: BorderSide(
                              color: tone.withValues(alpha: 0.6),
                              width: 1.5,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                            textStyle: AppTypography.mono(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          child: Text('+$v'),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          Row(
            children: [
              Expanded(
                child: Text(
                  sub,
                  style: TextStyle(
                    fontSize: 12,
                    color: colors.onSurface.withValues(alpha: 0.65),
                  ),
                ),
              ),
              if (m.serving == side && _s.rules.usesSets)
                Row(
                  children: [
                    Icon(
                      Icons.sports_volleyball_outlined,
                      size: 14,
                      color: colors.onSurface.withValues(alpha: 0.75),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      'SAQUE',
                      style: AppTypography.mono(
                        fontSize: 9.5,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.1,
                        color: colors.onSurface.withValues(alpha: 0.75),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );

    return Material(
      color: tone.withValues(alpha: colors.isDark ? 0.12 : 0.10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(26),
        side: BorderSide(color: tone.withValues(alpha: 0.55), width: 1.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: buttons
          ? content
          : Semantics(
              button: true,
              label: 'Ponto para ${team?.name ?? 'o time'}',
              child: InkWell(
                key: Key('pelada-live-half-${side.name}'),
                onTap: () => _point(side),
                splashColor: tone.withValues(alpha: 0.25),
                child: content,
              ),
            ),
    );
  }

  Widget _strip(int? remaining) {
    final colors = context.themeColors;
    final m = _s.match;
    final done = <({int a, int b})>[];
    if (_s.rules.usesSets && !_s.isRotation) {
      // Sets já fechados nesta marcação, do ponto de vista de quem está em
      // cima agora.
      for (final g in _s.base.games) {
        done.add(
          g.teamA == _s.teamA
              ? (a: g.scoreA, b: g.scoreB)
              : (a: g.scoreB, b: g.scoreA),
        );
      }
      final scores = m.toScores();
      final closed = m.finished ? scores.length : m.currentSet;
      done.addAll(scores.take(closed));
    }
    final label = m.stateLabel;

    Widget chip(String k, String v) => Container(
          height: 30,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          margin: const EdgeInsets.only(right: 6),
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            borderRadius: BorderRadius.circular(9),
            border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
          ),
          alignment: Alignment.center,
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '$k ',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1,
                    color: colors.onSurface.withValues(alpha: 0.55),
                  ),
                ),
                TextSpan(text: v),
              ],
            ),
            style: AppTypography.mono(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: colors.onSurface,
            ),
          ),
        );

    final undo = _StripButton(
      key: const Key('pelada-live-undo'),
      icon: Icons.undo_rounded,
      label: 'Desfazer',
      onTap: _s.canUndo ? _undo : null,
    );

    if (remaining != null || (_s.rules.timed && m.golden)) {
      return SizedBox(
        height: 60,
        child: Row(
          children: [
            undo,
            Expanded(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      m.golden
                          ? (label ?? '').toUpperCase()
                          : peladaLiveClock(remaining ?? 0),
                      key: const Key('pelada-live-clock'),
                      style: AppTypography.mono(
                        fontSize: m.golden ? 14 : 26,
                        fontWeight: FontWeight.w700,
                        color: m.golden ? colors.pending : colors.onSurface,
                      ),
                    ),
                    if (!m.golden)
                      Text(
                        m.running ? 'RESTAM' : 'PAUSADO',
                        style: AppTypography.mono(
                          fontSize: 9,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 1.2,
                          color: colors.onSurface.withValues(alpha: 0.6),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            _StripButton(
              key: const Key('pelada-live-clock-toggle'),
              icon: m.running ? Icons.pause_rounded : Icons.play_arrow_rounded,
              label: m.running ? 'Pausar' : 'Seguir',
              onTap: m.finished || m.golden ? null : _toggleClock,
            ),
          ],
        ),
      );
    }

    return SizedBox(
      height: 60,
      child: Row(
        children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              reverse: true,
              child: Row(
                children: [
                  for (final (i, s) in done.indexed)
                    chip('S${i + 1}', '${s.a}–${s.b}'),
                  if (_s.rules.mode == PeladaLiveMode.setsGames)
                    chip('GAMES', '${m.current.a}–${m.current.b}'),
                  if (label != null)
                    PeladaLivePill(label, color: colors.pending),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          undo,
          const SizedBox(width: 8),
          _StripButton(
            key: const Key('pelada-live-swap'),
            icon: Icons.swap_vert_rounded,
            tooltip: 'Trocar lados',
            onTap: _swap,
          ),
        ],
      ),
    );
  }
}

class _SetDots extends StatelessWidget {
  const _SetDots(
      {required this.won, required this.needed, required this.color});

  final int won;
  final int needed;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurface.withValues(alpha: 0.35);
    return Semantics(
      label: '$won de $needed sets',
      child: Row(
        children: [
          for (var i = 0; i < needed; i++)
            Container(
              width: 9,
              height: 9,
              margin: const EdgeInsets.only(left: 4),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: i < won ? color : Colors.transparent,
                border: Border.all(color: i < won ? color : muted, width: 1.5),
              ),
            ),
        ],
      ),
    );
  }
}

class _SquareButton extends StatelessWidget {
  const _SquareButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SizedBox(
      width: 44,
      height: 44,
      child: IconButton.outlined(
        tooltip: tooltip,
        onPressed: onTap,
        style: IconButton.styleFrom(
          backgroundColor: colors.surfaceCard,
          side: BorderSide(color: colors.onSurface.withValues(alpha: 0.10)),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        icon: Icon(icon, size: 20, color: colors.onSurface),
      ),
    );
  }
}

class _StripButton extends StatelessWidget {
  const _StripButton({
    super.key,
    required this.icon,
    this.label,
    this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String? label;
  final String? tooltip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = OutlinedButton.styleFrom(
      foregroundColor: colors.onSurface,
      backgroundColor: colors.surfaceRaised,
      minimumSize: const Size(44, 44),
      padding: EdgeInsets.symmetric(horizontal: label == null ? 0 : 12),
      side: BorderSide(color: colors.onSurface.withValues(alpha: 0.12)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      textStyle: AppTypography.soraRegular(
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
      ),
    );
    final button = label == null
        ? OutlinedButton(
            onPressed: onTap,
            style: style,
            child: Icon(icon, size: 18),
          )
        : OutlinedButton.icon(
            onPressed: onTap,
            style: style,
            icon: Icon(icon, size: 18),
            label: Text(label!),
          );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}

class _Toast extends StatelessWidget {
  const _Toast({required this.text, required this.onTap});

  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Material(
        color: AppColors.pending,
        elevation: 12,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          key: const Key('pelada-live-toast'),
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.swap_vert_rounded, color: Color(0xFF0A0A0A)),
                const SizedBox(width: 10),
                Flexible(
                  child: Text(
                    text,
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: const Color(0xFF0A0A0A),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Folha de fim de jogo: quem venceu, os sets e o que fazer agora.
class _FinishSheet extends StatelessWidget {
  const _FinishSheet({required this.session});

  final PeladaLiveSession session;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final m = session.match;
    final winnerSide = m.winner ?? LiveSide.a;
    final winner = winnerSide == LiveSide.a ? session.teamOnA : session.teamOnB;
    final scores = m.toScores();
    final rotation = session.isRotation;
    final setsMode = session.rules.usesSets && scores.length > 1;
    final ws = m.setsWon;
    final line = setsMode
        ? (winnerSide == LiveSide.a ? '${ws.a}–${ws.b}' : '${ws.b}–${ws.a}')
        : (winnerSide == LiveSide.a
            ? '${m.current.a}–${m.current.b}'
            : '${m.current.b}–${m.current.a}');
    final players = winner?.players.length ?? 2;
    final verb = rotation
        ? (players == 1 ? 'ganhou' : 'ganharam')
        : (players == 1 ? 'venceu' : 'venceram');
    // Rascunho reaberto do zero (sem placar) ainda mostra a folha: evita
    // "venceram 0–0".
    final title = scores.isEmpty
        ? 'Fim de jogo'
        : '${winner?.name ?? 'Time'} $verb $line';

    // Próximo jogo (rei da quadra) ou mais um set/partida (dois times).
    final after = session.nextGame(now: DateTime.now());
    final nextLabel = rotation
        ? 'Próximo jogo · ${after.teamOnA?.name} × ${after.teamOnB?.name}'
        : (session.rules.usesSets
            ? (session.rules.bestOf > 1
                ? 'Jogar outra partida'
                : 'Jogar mais um set')
            : 'Jogar mais um jogo');

    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 5,
                decoration: BoxDecoration(
                  color: colors.onSurface.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(9),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: (rotation ? colors.pending : colors.win)
                        .withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: (rotation ? colors.pending : colors.win)
                          .withValues(alpha: 0.45),
                    ),
                  ),
                  child: Icon(
                    Icons.emoji_events_outlined,
                    color: rotation ? colors.pending : colors.win,
                    size: 26,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      PeladaLivePill(
                        rotation ? 'fica na quadra' : 'fim de jogo',
                        color: rotation ? colors.pending : colors.win,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        title,
                        key: const Key('pelada-live-finish-title'),
                        style: AppTypography.soraRegular(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                          height: 1.2,
                          color: colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (setsMode) ...[
              const SizedBox(height: 14),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                decoration: BoxDecoration(
                  color: colors.surfaceCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                      color: colors.onSurface.withValues(alpha: 0.08)),
                ),
                child: Column(
                  children: [
                    for (final (i, s) in scores.indexed) ...[
                      if (i > 0)
                        Divider(
                            height: 1,
                            color: colors.onSurface.withValues(alpha: 0.06)),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 9),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 52,
                              child: Text(
                                'SET ${i + 1}',
                                style: AppTypography.mono(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w500,
                                  letterSpacing: 1,
                                  color:
                                      colors.onSurface.withValues(alpha: 0.6),
                                ),
                              ),
                            ),
                            Text(
                              '${s.a}–${s.b}',
                              style: AppTypography.mono(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: colors.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            Text(
              rotation
                  ? 'Vai para o placar da pelada junto com os outros jogos.'
                  : 'Vai para o placar da pelada. Quando você salvar, os '
                      'jogadores recebem para confirmar.',
              style: TextStyle(
                fontSize: 13,
                height: 1.5,
                color: colors.onSurface.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 54,
              child: FilledButton(
                key: Key(rotation ? 'pelada-live-next' : 'pelada-live-use'),
                onPressed: () => Navigator.pop(
                  context,
                  rotation ? _FinishAction.next : _FinishAction.useScore,
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: const Color(0xFF0A0A0A),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  textStyle: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                child: Text(
                  rotation ? nextLabel : 'Usar no placar',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 48,
              child: OutlinedButton(
                key: Key(rotation ? 'pelada-live-use' : 'pelada-live-next'),
                onPressed: () => Navigator.pop(
                  context,
                  rotation ? _FinishAction.useScore : _FinishAction.next,
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: colors.onSurface,
                  side: BorderSide(
                      color: colors.onSurface.withValues(alpha: 0.16)),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: Text(
                  rotation
                      ? 'Encerrar e usar no placar · ${session.gamesCount} jogos'
                      : nextLabel,
                ),
              ),
            ),
            TextButton.icon(
              key: const Key('pelada-live-finish-undo'),
              onPressed: session.canUndo
                  ? () => Navigator.pop(context, _FinishAction.undo)
                  : null,
              icon: const Icon(Icons.undo_rounded, size: 18),
              label: const Text('Desfazer último ponto'),
              style: TextButton.styleFrom(
                foregroundColor: colors.onSurface.withValues(alpha: 0.75),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
