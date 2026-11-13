import 'dart:math';

import 'package:flutter/material.dart';

import '../../../../core/layout/nexa_app_bar.dart';
import '../../../../core/sports/sport_catalog.dart';
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

/// Esportes oferecidos na marcação ao vivo, na ordem dos chips (o da reserva
/// vem primeiro). Corrida não tem placar de pelada.
const List<String> kPeladaLiveSports = [
  'beachVolleyball',
  'footvolley',
  'indoorVolleyball',
  'beachTennis',
  'padel',
  'tennis',
  'football',
  'basketball',
  'other',
];

/// Primeiro saque: um dos lados, ninguém ou sorteado na hora de começar.
enum _FirstServe { a, b, draw }

/// Marcar ao vivo · regras da partida (canvas "Pelada · marcar ao vivo",
/// 02–05). O padrão vem do esporte da reserva (ou das últimas regras usadas
/// nele); devolve a sessão pronta para o placar ao vivo.
class PeladaLiveSetupPage extends StatefulWidget {
  const PeladaLiveSetupPage({
    super.key,
    required this.initial,
    this.sport,
    required this.store,
    this.clock = DateTime.now,
    this.random,
    this.ctaLabel = 'Começar a marcar',
  });

  /// "Começar a marcar" · "Aplicar regras" (o "Mudar" do placar ao vivo).
  final String ctaLabel;

  final BookingResult initial;
  final String? sport;
  final PeladaLiveDraftStore store;
  final DateTime Function() clock;
  final Random? random;

  @override
  State<PeladaLiveSetupPage> createState() => _PeladaLiveSetupPageState();
}

class _PeladaLiveSetupPageState extends State<PeladaLiveSetupPage> {
  late String _sport;
  late PeladaLiveRules _rules;
  bool _swap = false;
  _FirstServe _serve = _FirstServe.draw;

  bool get _rotation => widget.initial.isRotation;

  @override
  void initState() {
    super.initState();
    final code = SportCatalog.resolve(widget.sport)?.code;
    _sport = kPeladaLiveSports.contains(code) ? code! : 'other';
    _rules = PeladaLiveRules.forSport(_sport);
    _loadLast(_sport);
  }

  Future<void> _loadLast(String sport) async {
    final last = await widget.store.lastRules(sport);
    if (!mounted || last == null || sport != _sport) return;
    setState(() => _rules = last);
  }

  void _pickSport(String code) {
    if (code == _sport) return;
    setState(() {
      _sport = code;
      _rules = PeladaLiveRules.forSport(code);
    });
    _loadLast(code);
  }

  void _set(PeladaLiveRules rules) => setState(() => _rules = rules);

  List<String> get _sportsOrder {
    final rest = [
      for (final s in kPeladaLiveSports)
        if (s != _sport) s,
    ];
    return [_sport, ...rest];
  }

  void _start() {
    LiveSide? serve;
    if (_rules.usesSets) {
      serve = switch (_serve) {
        _FirstServe.a => LiveSide.a,
        _FirstServe.b => LiveSide.b,
        _FirstServe.draw =>
          (widget.random ?? Random()).nextBool() ? LiveSide.a : LiveSide.b,
      };
    }
    widget.store.saveRules(_sport, _rules);
    final session = PeladaLiveSession.start(
      widget.initial,
      _rules,
      firstServe: serve,
      swapSides: _swap,
      now: widget.clock(),
    );
    Navigator.of(context).pop(session);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final preview = PeladaLiveSession.start(
      widget.initial,
      _rules,
      swapSides: _swap,
      now: widget.clock(),
    );
    final a = preview.teamOnA;
    final b = preview.teamOnB;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Column(
          children: [
            Text(
              'Marcar ao vivo',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
            ),
            Text(
              'REGRAS DA PARTIDA',
              style: AppTypography.mono(
                fontSize: 9.5,
                fontWeight: FontWeight.w500,
                letterSpacing: 1.2,
                color: colors.onSurface.withValues(alpha: 0.55),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
          child: SizedBox(
            height: 54,
            child: FilledButton.icon(
              key: const Key('pelada-live-start'),
              onPressed: _start,
              icon: const Icon(Icons.play_arrow_rounded),
              label: Text(widget.ctaLabel),
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
            ),
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        children: [
          PeladaLiveLabel(
            'Esporte',
            trailing: _sport == SportCatalog.resolve(widget.sport)?.code
                ? 'da reserva'
                : null,
          ),
          SizedBox(
            height: 38,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _sportsOrder.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final code = _sportsOrder[i];
                final on = code == _sport;
                return ChoiceChip(
                  key: Key('pelada-live-sport-$code'),
                  selected: on,
                  showCheckmark: on,
                  checkmarkColor: const Color(0xFF0A0A0A),
                  onSelected: (_) => _pickSport(code),
                  label: Text(
                    code == 'other'
                        ? 'Outro'
                        : SportCatalog.labelOf(code) ?? code,
                  ),
                  labelStyle: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: on
                        ? const Color(0xFF0A0A0A)
                        : colors.onSurface.withValues(alpha: 0.8),
                  ),
                  selectedColor: AppColors.brand,
                  backgroundColor: colors.surfaceCard,
                  side: BorderSide(
                    color: on
                        ? AppColors.brand
                        : colors.onSurface.withValues(alpha: 0.12),
                  ),
                  shape: const StadiumBorder(),
                );
              },
            ),
          ),
          PeladaLiveLabel(_rotation ? 'Times · rei da quadra' : 'Times'),
          _TeamsCard(
            session: preview,
            onSwap: _rotation ? null : () => setState(() => _swap = !_swap),
          ),
          ..._modeOptions(),
          if (_rules.usesSets && a != null && b != null) ...[
            const PeladaLiveLabel('Primeiro saque'),
            PeladaLiveSegmented<_FirstServe>(
              keyPrefix: 'pelada-live-serve',
              value: _serve,
              onChanged: (v) => setState(() => _serve = v),
              options: [
                (_FirstServe.a, a.name),
                (_FirstServe.b, b.name),
                (_FirstServe.draw, 'Sortear'),
              ],
            ),
          ],
          PeladaLiveNote(_footnote),
        ],
      ),
    );
  }

  String get _footnote {
    switch (_rules.mode) {
      case PeladaLiveMode.setsPoints:
        return 'Toque na metade de quem fez o ponto. O set fecha sozinho pela '
            'regra; o Desfazer volta o último ponto.';
      case PeladaLiveMode.setsGames:
        return 'Marque ponto a ponto: o app conta 15, 30, 40, os games, o '
            'tie-break e os sets.';
      case PeladaLiveMode.goals:
        return 'Pelada não tem empate: acabou o tempo empatado, o próximo gol '
            'decide (gol de ouro).';
      case PeladaLiveMode.baskets:
        return 'Acabou o tempo empatado, a próxima cesta decide.';
      case PeladaLiveMode.points:
        return 'Cada toque vale 1 ponto. Sem alvo nem tempo, você encerra '
            'quando quiser.';
    }
  }

  List<Widget> _modeOptions() {
    final r = _rules;
    final formato = _rotation
        ? <Widget>[]
        : [
            const PeladaLiveLabel('Formato'),
            PeladaLiveSegmented<int>(
              keyPrefix: 'pelada-live-bestof',
              value: r.bestOf,
              onChanged: (v) => _set(r.copyWith(bestOf: v)),
              options: const [(1, '1 set'), (3, 'Melhor de 3')],
            ),
          ];
    switch (r.mode) {
      case PeladaLiveMode.setsPoints:
        return [
          ...formato,
          const PeladaLiveLabel('Set até', trailing: 'pontos'),
          PeladaLiveSegmented<int>(
            keyPrefix: 'pelada-live-target',
            value: r.setTarget,
            onChanged: (v) => _set(r.copyWith(setTarget: v)),
            options: [
              for (final n in _withValue(const [15, 18, 21, 25], r.setTarget))
                (n, '$n'),
            ],
          ),
          if (r.bestOf > 1) ...[
            const PeladaLiveLabel('Set decisivo até'),
            PeladaLiveSegmented<int>(
              keyPrefix: 'pelada-live-deciding',
              value: r.decidingSetTarget,
              onChanged: (v) => _set(r.copyWith(decidingSetTarget: v)),
              options: [
                for (final n
                    in _withValue(const [15, 21, 25], r.decidingSetTarget))
                  (n, '$n'),
              ],
            ),
          ],
          PeladaLiveToggles(
            items: [
              (
                key: const Key('pelada-live-winby2'),
                title: 'Vantagem de 2 pontos',
                subtitle:
                    '${r.setTarget}–${r.setTarget - 1} ainda não fecha o set',
                value: r.winByTwo,
                onChanged: (v) => _set(r.copyWith(winByTwo: v)),
              ),
              (
                key: const Key('pelada-live-court-switch'),
                title: 'Avisar troca de lado',
                subtitle: r.bestOf > 1
                    ? 'a cada ${r.setTarget <= 15 ? 5 : 7} pontos · '
                        '${r.decidingSetTarget <= 15 ? 5 : 7} no decisivo'
                    : 'a cada ${r.setTarget <= 15 ? 5 : 7} pontos',
                value: r.courtSwitch,
                onChanged: (v) => _set(r.copyWith(courtSwitch: v)),
              ),
            ],
          ),
        ];
      case PeladaLiveMode.setsGames:
        return [
          ...formato,
          const PeladaLiveLabel('Games por set'),
          PeladaLiveSegmented<int>(
            keyPrefix: 'pelada-live-games',
            value: r.gamesPerSet,
            onChanged: (v) => _set(r.copyWith(gamesPerSet: v)),
            options: [
              for (final n in _withValue(const [4, 6], r.gamesPerSet))
                (n, '$n games'),
            ],
          ),
          const PeladaLiveLabel('No 40–40'),
          PeladaLiveSegmented<bool>(
            keyPrefix: 'pelada-live-noad',
            value: r.noAd,
            onChanged: (v) => _set(r.copyWith(noAd: v)),
            options: const [(true, 'Ponto de ouro'), (false, 'Vantagem')],
          ),
          if (r.bestOf > 1) ...[
            const PeladaLiveLabel('Set decisivo'),
            PeladaLiveSegmented<bool>(
              keyPrefix: 'pelada-live-super-tb',
              value: r.superTiebreak,
              onChanged: (v) => _set(r.copyWith(superTiebreak: v)),
              options: const [
                (true, 'Super tie-break 10'),
                (false, 'Set completo'),
              ],
            ),
          ],
          PeladaLiveToggles(
            items: [
              (
                key: const Key('pelada-live-tiebreak'),
                title: 'Tie-break no ${r.gamesPerSet}–${r.gamesPerSet}',
                subtitle: r.tiebreak
                    ? 'até 7, com vantagem de 2'
                    : 'sem tie-break: o set segue até abrir 2 games',
                value: r.tiebreak,
                onChanged: (v) => _set(r.copyWith(tiebreak: v)),
              ),
            ],
          ),
        ];
      case PeladaLiveMode.goals:
        return [
          const PeladaLiveLabel('Duração do jogo'),
          _minutes(const [8, 10, 15, 20]),
          const PeladaLiveLabel('Termina com', trailing: 'o que vier antes'),
          PeladaLiveSegmented<int?>(
            keyPrefix: 'pelada-live-limit',
            value: r.limit,
            onChanged: (v) => _set(r.copyWith(limit: () => v)),
            options: [
              (null, 'Sem limite'),
              for (final n in _withValue(const [1, 2, 3], r.limit))
                (n, '$n ${n == 1 ? 'gol' : 'gols'}'),
            ],
          ),
        ];
      case PeladaLiveMode.baskets:
        return [
          const PeladaLiveLabel('Cestas valem'),
          PeladaLiveSegmented<bool>(
            keyPrefix: 'pelada-live-threes',
            value: r.threePointers,
            onChanged: (v) => _set(r.copyWith(threePointers: v)),
            options: const [(false, '1 e 2 · 3x3'), (true, '1, 2 e 3 · 5x5')],
          ),
          const PeladaLiveLabel('Jogo até', trailing: 'pontos'),
          _limit(const [11, 15, 21]),
          const PeladaLiveLabel('Duração'),
          _minutes(const [10, 12, 20]),
        ];
      case PeladaLiveMode.points:
        return [
          const PeladaLiveLabel('Jogo até', trailing: 'pontos'),
          _limit(const [10, 15, 21, 25]),
          const PeladaLiveLabel('Duração'),
          _minutes(const [10, 15, 20]),
        ];
    }
  }

  Widget _minutes(List<int> options) => PeladaLiveSegmented<int?>(
        keyPrefix: 'pelada-live-minutes',
        value: _rules.minutes,
        onChanged: (v) => _set(_rules.copyWith(minutes: () => v)),
        options: [
          (null, 'Livre'),
          for (final n in _withValue(options, _rules.minutes)) (n, '$n min'),
        ],
      );

  Widget _limit(List<int> options) => PeladaLiveSegmented<int?>(
        keyPrefix: 'pelada-live-limit',
        value: _rules.limit,
        onChanged: (v) => _set(_rules.copyWith(limit: () => v)),
        options: [
          (null, 'Livre'),
          for (final n in _withValue(options, _rules.limit)) (n, '$n'),
        ],
      );

  /// As opções da tela mais o valor atual, se ele veio de outro lugar (as
  /// últimas regras, o catálogo).
  static List<int> _withValue(List<int> options, int? value) {
    if (value == null || options.contains(value)) return options;
    return [...options, value]..sort();
  }
}

class _TeamsCard extends StatelessWidget {
  const _TeamsCard({required this.session, required this.onSwap});

  final PeladaLiveSession session;
  final VoidCallback? onSwap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final rows = <(ResultTeam?, Color, String)>[
      (
        session.teamOnA,
        PeladaLiveColors.of(LiveSide.a),
        session.isRotation ? 'em quadra' : 'em cima'
      ),
      (
        session.teamOnB,
        PeladaLiveColors.of(LiveSide.b),
        session.isRotation ? 'em quadra' : 'embaixo'
      ),
      for (final t in session.queue)
        (t, colors.onSurface.withValues(alpha: 0.4), 'na fila'),
    ];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Column(
        children: [
          for (final (i, (team, dot, tag)) in rows.indexed) ...[
            if (i > 0)
              Divider(
                  height: 1, color: colors.onSurface.withValues(alpha: 0.06)),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 9),
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration:
                        BoxDecoration(color: dot, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 10),
                  ResultTeamAvatars(
                    players: team?.players ?? const [],
                    size: 26,
                    borderColor: colors.surfaceCard,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      team?.name ?? '—',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  Text(
                    tag.toUpperCase(),
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
          ],
          if (session.isRotation)
            Padding(
              padding: const EdgeInsets.only(bottom: 10, top: 2),
              child: Text(
                '${session.base.teams.length} times · rei da quadra: cada jogo '
                'vale um set, quem vence fica e o próximo da fila entra.',
                style: TextStyle(
                  fontSize: 11.5,
                  color: colors.onSurface.withValues(alpha: 0.62),
                ),
              ),
            ),
          if (onSwap != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                key: const Key('pelada-live-swap'),
                onPressed: onSwap,
                icon: const Icon(Icons.swap_vert_rounded, size: 18),
                label: const Text('Trocar lados'),
                style: TextButton.styleFrom(
                  foregroundColor: colors.brandText,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
