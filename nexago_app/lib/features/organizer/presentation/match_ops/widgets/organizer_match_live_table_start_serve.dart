import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../../athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';
import 'organizer_match_live_table_widgets.dart' show LiveTableTeamData;

/// Configuração escolhida antes do 1º ponto do set.
class LiveTableStartConfig {
  const LiveTableStartConfig({
    required this.servingSide,
    required this.slotA,
    required this.slotB,
    required this.leftSide,
    this.toss = false,
  });

  /// `'A'`/`'B'` — dupla que saca primeiro.
  final String servingSide;

  /// 1º sacador de cada dupla (posição 1..N no elenco).
  final int slotA;
  final int slotB;

  /// Dupla que começa à ESQUERDA, vista da mesa.
  final String leftSide;
  final bool toss;
}

/// Tela "Quem começa sacando?": dupla que saca, 1º sacador de cada dupla e lado inicial.
/// Obrigatória — sem "pular". O ‹ só sai da partida; nada é gravado até confirmar.
class LiveTableStartServeScreen extends StatefulWidget {
  const LiveTableStartServeScreen({
    super.key,
    required this.teamA,
    required this.teamB,
    required this.courtLabel,
    required this.onBack,
    required this.onConfirm,
    this.initial,
    this.enabled = true,
  });

  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final String courtLabel;
  final VoidCallback onBack;
  final void Function(LiveTableStartConfig config) onConfirm;

  /// Sets seguintes chegam pré-preenchidos; set 1 e tie-break, `null`.
  final LiveTableStartConfig? initial;
  final bool enabled;

  @override
  State<LiveTableStartServeScreen> createState() =>
      _LiveTableStartServeScreenState();
}

class _LiveTableStartServeScreenState extends State<LiveTableStartServeScreen> {
  String? _serving;
  late int _slotA = widget.initial?.slotA ?? 1;
  late int _slotB = widget.initial?.slotB ?? 1;
  late String _left = widget.initial?.leftSide ?? 'A';
  bool _toss = false;
  int _pulse = 0;
  String? _pulsedSide;

  @override
  void initState() {
    super.initState();
    _serving = widget.initial?.servingSide;
  }

  LiveTableTeamData _team(String side) =>
      side == 'A' ? widget.teamA : widget.teamB;

  int _slot(String side) => side == 'A' ? _slotA : _slotB;

  String _playerName(String side, int slot) {
    final team = _team(side);
    final name = team.nameForSlot(slot).trim();
    return name.isEmpty ? 'Atleta $slot' : name;
  }

  String _firstName(String full) => full.trim().split(RegExp(r'\s+')).first;

  void _select(String side, {bool toss = false}) {
    HapticFeedback.selectionClick();
    setState(() {
      _serving = side;
      _toss = toss;
      _pulsedSide = side;
      _pulse++;
    });
  }

  void _setSlot(String side, int slot) => setState(() {
        if (side == 'A') {
          _slotA = slot;
        } else {
          _slotB = slot;
        }
      });

  void _swapLeft() => setState(() => _left = _left == 'A' ? 'B' : 'A');

  void _draw() => _select(math.Random().nextBool() ? 'A' : 'B', toss: true);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final landscape =
        MediaQuery.orientationOf(context) == Orientation.landscape;
    final serving = _serving;
    final ctaLabel = serving == null
        ? 'Escolha quem saca'
        : 'Começar set · ${_firstName(_playerName(serving, _slot(serving)))} saca';

    final step1 = _Step1(state: this, onDraw: widget.enabled ? _draw : null);
    final step2 = _Step2(state: this);
    final step3 = _Step3(state: this);

    final cta = Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Semantics(
        button: true,
        child: FilledButton(
          onPressed: serving != null && widget.enabled
              ? () => widget.onConfirm(
                    LiveTableStartConfig(
                      servingSide: serving,
                      slotA: _slotA,
                      slotB: _slotB,
                      leftSide: _left,
                      toss: _toss,
                    ),
                  )
              : null,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
            disabledBackgroundColor: colors.surfaceRaised,
            disabledForegroundColor: colors.onSurfaceMuted,
            minimumSize: const Size.fromHeight(60),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            textStyle: AppTypography.soraRegular(
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
          child: Text(ctaLabel, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ),
    );

    return ColoredBox(
      color: colors.canvas,
      child: SafeArea(
        child: Column(
          children: [
            _Header(courtLabel: widget.courtLabel, onBack: widget.onBack),
            Expanded(
              child: landscape
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          flex: 11,
                          child: SingleChildScrollView(
                            padding: const EdgeInsets.fromLTRB(16, 4, 8, 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                step1,
                                const SizedBox(height: 12),
                                step2,
                              ],
                            ),
                          ),
                        ),
                        Expanded(
                          flex: 9,
                          child: Column(
                            children: [
                              Expanded(
                                child: SingleChildScrollView(
                                  padding: const EdgeInsets.fromLTRB(
                                    8,
                                    4,
                                    16,
                                    12,
                                  ),
                                  child: step3,
                                ),
                              ),
                              cta,
                            ],
                          ),
                        ),
                      ],
                    )
                  : Column(
                      children: [
                        Expanded(
                          child: SingleChildScrollView(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                step1,
                                const SizedBox(height: 12),
                                step2,
                                const SizedBox(height: 12),
                                step3,
                              ],
                            ),
                          ),
                        ),
                        cta,
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.courtLabel, required this.onBack});

  final String courtLabel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final court = courtLabel.trim();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
      child: Row(
        children: [
          Tooltip(
            message: 'Voltar',
            child: Material(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                onTap: onBack,
                borderRadius: BorderRadius.circular(14),
                child: SizedBox(
                  width: 44,
                  height: 44,
                  child: Icon(
                    Icons.chevron_left_rounded,
                    color: colors.onSurface,
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  '● ANTES DO SET${court.isEmpty ? '' : ' · $court'}',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: AppColors.live,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Quem começa sacando?',
                  style: AppTypography.soraRegular(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 44),
        ],
      ),
    );
  }
}

class _StepLabel extends StatelessWidget {
  const _StepLabel(this.text, {this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 32,
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: AppTypography.mono(
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 1.4,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class _Step1 extends StatelessWidget {
  const _Step1({required this.state, required this.onDraw});

  final _LiveTableStartServeScreenState state;
  final VoidCallback? onDraw;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StepLabel(
          '1 · DUPLA QUE SACA',
          trailing: Material(
            color: AppColors.brand.withValues(alpha: 0.14),
            shape: StadiumBorder(
              side: BorderSide(color: AppColors.brand.withValues(alpha: 0.4)),
            ),
            child: InkWell(
              onTap: onDraw,
              customBorder: const StadiumBorder(),
              child: Container(
                height: 32,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                alignment: Alignment.center,
                child: Text(
                  'Sortear',
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brandHover,
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Semantics(
          container: true,
          label: 'Dupla que saca primeiro',
          child: Row(
            children: [
              Expanded(
                child: _TeamCard(state: state, side: 'A'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _TeamCard(state: state, side: 'B'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TeamCard extends StatelessWidget {
  const _TeamCard({required this.state, required this.side});

  final _LiveTableStartServeScreenState state;
  final String side;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final team = state._team(side);
    final chosen = state._serving;
    final selected = chosen == side;
    final fg = selected ? Colors.black : colors.onSurface;
    final legend = chosen == null
        ? 'toque para escolher'
        : (selected ? '● saca primeiro' : 'recebe');
    final pulse = state._pulsedSide == side;

    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      label: '${team.label}, ${selected ? 'saca primeiro' : 'recebe'}',
      excludeSemantics: true,
      child: TweenAnimationBuilder<double>(
        key: ValueKey('${side}_${pulse ? state._pulse : 0}'),
        tween: Tween(begin: pulse ? 0.94 : 1, end: 1),
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutBack,
        builder: (context, scale, child) =>
            Transform.scale(scale: scale, child: child),
        child: Material(
          color: selected ? AppColors.brand : colors.surfaceCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(22),
            side: BorderSide(
              color: selected
                  ? AppColors.brand
                  : colors.onSurfaceMuted.withValues(alpha: 0.2),
              width: 1.5,
            ),
          ),
          child: InkWell(
            onTap: state.widget.enabled ? () => state._select(side) : null,
            borderRadius: BorderRadius.circular(22),
            child: SizedBox(
              height: 140,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Avatars(state: state, side: side, selected: selected),
                    const Spacer(),
                    Text(
                      team.label,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: fg,
                        height: 1.15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      legend,
                      style: AppTypography.soraRegular(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w500,
                        color: selected
                            ? Colors.black.withValues(alpha: 0.7)
                            : colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Avatars extends StatelessWidget {
  const _Avatars({
    required this.state,
    required this.side,
    required this.selected,
  });

  final _LiveTableStartServeScreenState state;
  final String side;
  final bool selected;

  static const double _size = 48;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final team = state._team(side);
    final slots = team.slots.take(3).toList();
    // O anel separa os avatares sobrepostos usando a cor do card por trás.
    final ring = selected ? AppColors.brand : colors.surfaceCard;
    return SizedBox(
      height: _size,
      width: _size + (slots.length - 1) * _size * 0.62,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < slots.length; i++)
            Positioned(
              left: i * _size * 0.62,
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: ring, width: 2.5),
                ),
                child: _tappable(
                  context,
                  team: team,
                  slots: slots,
                  index: i,
                  child: AthleteProfileAvatar(
                    size: _size - 5,
                    initials: _initials(team, side, slots[i]),
                    imageUrl: _photo(team, slots[i]),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Toque na foto amplia (swipe entre os atletas da dupla). Sem foto, não vira botão: o
  /// toque cai no card e escolhe a dupla, como antes.
  Widget _tappable(
    BuildContext context, {
    required LiveTableTeamData team,
    required List<int> slots,
    required int index,
    required Widget child,
  }) {
    final urls = <String>[];
    var initialIndex = 0;
    for (var i = 0; i < slots.length; i++) {
      final url = _photo(team, slots[i]);
      if (url == null) continue;
      if (i == index) initialIndex = urls.length;
      urls.add(url);
    }
    if (_photo(team, slots[index]) == null) return child;
    return Semantics(
      button: true,
      label: 'Ampliar foto de ${state._playerName(side, slots[index])}',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => openProfilePhotoViewer(
          context,
          photoUrls: urls,
          initialIndex: initialIndex,
        ),
        child: child,
      ),
    );
  }

  String _initials(LiveTableTeamData team, String side, int slot) {
    final info = team.playerForSlot(slot);
    final fromInfo = info?.initials.trim() ?? '';
    if (fromInfo.isNotEmpty) return fromInfo;
    return state._playerName(side, slot).characters.first.toUpperCase();
  }

  String? _photo(LiveTableTeamData team, int slot) {
    final url = team.playerForSlot(slot)?.profilePhotoUrl.trim() ?? '';
    return url.isEmpty ? null : url;
  }
}

class _Step2 extends StatelessWidget {
  const _Step2({required this.state});

  final _LiveTableStartServeScreenState state;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _StepLabel('2 · PRIMEIRO SACADOR DE CADA DUPLA'),
        const SizedBox(height: 8),
        _ServerRow(state: state, side: 'A'),
        const SizedBox(height: 10),
        _ServerRow(state: state, side: 'B'),
      ],
    );
  }
}

class _ServerRow extends StatelessWidget {
  const _ServerRow({required this.state, required this.side});

  final _LiveTableStartServeScreenState state;
  final String side;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final team = state._team(side);
    final chosen = state._serving;
    final isServing = chosen == side;
    final legend = chosen == null
        ? '1º sacador da dupla'
        : (isServing ? 'saca o 1º ponto' : 'saca ao recuperar o saque');
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: colors.onSurfaceMuted.withValues(alpha: 0.18),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  team.label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  legend,
                  style: AppTypography.soraRegular(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                    color: isServing
                        ? AppColors.brandHover
                        : colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: colors.canvas,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final slot in team.slots)
                  _ServerOption(
                    label: state._firstName(state._playerName(side, slot)),
                    selected: state._slot(side) == slot,
                    highlight: isServing,
                    onTap: state.widget.enabled
                        ? () => state._setSlot(side, slot)
                        : null,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ServerOption extends StatelessWidget {
  const _ServerOption({
    required this.label,
    required this.selected,
    required this.highlight,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool highlight;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final orange = selected && highlight;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: orange
            ? AppColors.brand
            : (selected ? colors.surfaceSheet : Colors.transparent),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: selected && !orange
              ? BorderSide(color: colors.onSurfaceMuted.withValues(alpha: 0.4))
              : BorderSide.none,
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            constraints: const BoxConstraints(minWidth: 76, minHeight: 44),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: orange
                    ? Colors.black
                    : (selected ? colors.onSurface : colors.onSurfaceMuted),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Step3 extends StatelessWidget {
  const _Step3({required this.state});

  final _LiveTableStartServeScreenState state;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final leftSide = state._left;
    final rightSide = leftSide == 'A' ? 'B' : 'A';
    final leftTeam = state._team(leftSide);
    final rightTeam = state._team(rightSide);

    Widget half(String side, LiveTableTeamData team, String caption) {
      final ball = state._serving == side;
      return Expanded(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              height: 12,
              child: ball
                  ? Container(
                      width: 10,
                      height: 10,
                      decoration: const BoxDecoration(
                        color: AppColors.brand,
                        shape: BoxShape.circle,
                      ),
                    )
                  : null,
            ),
            Text(
              team.label,
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              caption,
              style: AppTypography.mono(
                fontSize: 9.5,
                fontWeight: FontWeight.w700,
                color: colors.onSurfaceMuted,
                letterSpacing: 1,
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _StepLabel('3 · LADO INICIAL (VISTA DA MESA)'),
        const SizedBox(height: 8),
        Container(
          constraints: const BoxConstraints(minHeight: 76),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xFF1A1410),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFF3A3A42)),
          ),
          child: Row(
            children: [
              half(leftSide, leftTeam, 'ESQUERDA'),
              Semantics(
                button: true,
                label: 'Inverter lados. Esquerda: ${leftTeam.label}. '
                    'Direita: ${rightTeam.label}',
                excludeSemantics: true,
                child: Material(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(14),
                  child: InkWell(
                    onTap: state.widget.enabled ? state._swapLeft : null,
                    borderRadius: BorderRadius.circular(14),
                    child: SizedBox(
                      width: 44,
                      height: 44,
                      child: Icon(
                        Icons.swap_horiz_rounded,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ),
              ),
              half(rightSide, rightTeam, 'DIREITA'),
            ],
          ),
        ),
      ],
    );
  }
}
