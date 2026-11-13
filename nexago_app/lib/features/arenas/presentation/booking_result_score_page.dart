import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/sports/sport_catalog.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/booking_result.dart';
import '../data/pelada_live_draft_store.dart';
import '../domain/booking_result_record.dart';
import '../domain/pelada_live/pelada_live_rules.dart';
import '../domain/pelada_live/pelada_live_session.dart';
import 'booking_result_team_page.dart';
import 'pelada_live/pelada_live_page.dart';
import 'pelada_live/pelada_live_setup_page.dart';
import 'widgets/booking_story/booking_result_card.dart';
import 'widgets/booking_story/booking_story_editor.dart';

/// Reservar · 16b — editar placar: sets entre dois times ou, com três ou mais,
/// os jogos da rotação e a classificação. O "Salvar" grava ([onSave]) e
/// devolve o placar; os adversários com conta recebem para confirmar.
class BookingResultScorePage extends StatefulWidget {
  const BookingResultScorePage({
    super.key,
    required this.initial,
    required this.candidates,
    this.ownerPlayerId,
    this.onSave,
    this.confirmBeforeSave,
    this.localOnlyNotice = 'O placar vai só para a arte do story: não fica '
        'salvo nem conta no seu histórico ou no ranking.',
    this.sport,
    this.bookingId = '',
    this.liveStore,
    this.autoStartLive = false,
  });

  /// Abre o "Marcar ao vivo" assim que a tela aparece (vindo da Agenda).
  final bool autoStartLive;

  final BookingResult initial;

  /// Esporte da reserva: escolhe as regras do "Marcar ao vivo".
  final String? sport;

  /// A reserva, chave do rascunho do "Marcar ao vivo" no aparelho.
  final String bookingId;

  /// Onde a marcação ao vivo fica salva; `null` = `SharedPreferences`.
  final PeladaLiveDraftStore? liveStore;

  /// Quem estava na reserva — os primeiros nomes do "Adicionar dupla".
  final List<ResultPlayer> candidates;

  /// Quem posta: o time dele não sai da lista.
  final String? ownerPlayerId;

  /// Grava o placar; erro ([BookingResultException]) mantém a tela aberta com
  /// a mensagem. `null` só devolve o placar.
  final Future<void> Function(BookingResult result)? onSave;

  /// O aviso quando não grava ([onSave] nulo).
  final String localOnlyNotice;

  /// Pergunta antes de gravar (edição de pelada já salva: as confirmações
  /// voltam a zero). `null` grava direto.
  final String? confirmBeforeSave;

  @override
  State<BookingResultScorePage> createState() => _BookingResultScorePageState();
}

class _BookingResultScorePageState extends State<BookingResultScorePage> {
  late BookingResult _r = widget.initial;
  bool _saving = false;

  late final PeladaLiveDraftStore _liveStore =
      widget.liveStore ?? SharedPrefsPeladaLiveDraftStore();
  late final String _draftKey = peladaLiveDraftKey(widget.bookingId);

  /// Marcação ao vivo guardada no aparelho (o card vira "Continuar").
  PeladaLiveSession? _draft;

  static const int _maxScore = 99;

  @override
  void initState() {
    super.initState();
    _loadDraft(open: widget.autoStartLive);
  }

  Future<void> _loadDraft({bool open = false}) async {
    final draft = await _liveStore.load(_draftKey);
    if (!mounted) return;
    setState(() => _draft = draft);
    if (open) await _openLive();
  }

  String? get _sportLabel => SportCatalog.labelOf(widget.sport);

  /// "Marcar ao vivo": regras da partida e o placar ponto a ponto. O que
  /// volta entra no placar desta tela (ainda não salvo).
  Future<void> _openLive({bool restart = false}) async {
    var session = restart ? null : _draft;
    if (session == null) {
      // Dois times: os sets marcados substituem os lançados.
      if (!_r.isRotation && _r.hasScore) {
        final ok = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Marcar ao vivo?'),
            content: const Text(
              'Os sets marcados ao vivo entram no lugar do placar lançado '
              'aqui.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Voltar'),
              ),
              FilledButton(
                key: const Key('pelada-live-replace-confirm'),
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Marcar ao vivo'),
              ),
            ],
          ),
        );
        if (ok != true || !mounted) return;
      }
      session = await Navigator.of(context).push<PeladaLiveSession>(
        MaterialPageRoute(
          builder: (_) => PeladaLiveSetupPage(
            initial: _r,
            sport: widget.sport,
            store: _liveStore,
          ),
        ),
      );
      if (session == null || !mounted) return;
    }
    final result = await Navigator.of(context).push<BookingResult>(
      MaterialPageRoute(
        builder: (_) => PeladaLivePage(
          session: session!,
          store: _liveStore,
          draftKey: _draftKey,
          sportLabel: _sportLabel,
        ),
      ),
    );
    if (!mounted) return;
    if (result != null) setState(() => _r = result);
    // O rascunho pode ter andado, sido descartado ou encerrado.
    await _loadDraft();
  }

  Future<void> _restartLive() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Recomeçar a marcação?'),
        content: const Text('Os pontos marcados ao vivo até aqui somem.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            key: const Key('pelada-live-restart-confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Recomeçar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _liveStore.clear(_draftKey);
    if (!mounted) return;
    setState(() => _draft = null);
    await _openLive(restart: true);
  }

  Future<void> _save() async {
    if (_saving) return;
    final save = widget.onSave;
    if (save != null) {
      // Mesmas recusas do servidor, antes de ir até ele: pelada não tem
      // empate, e todo time precisa de jogador com conta.
      final tie = _r.firstTiedGame;
      if (tie != null) {
        showAppSnackBar(
          context,
          'O ${_r.isRotation ? 'jogo' : 'set'} ${tie + 1} está empatado: '
          'ajuste o placar.',
        );
        return;
      }
      if (_r.hasEmptyTeam) {
        showAppSnackBar(context, 'Monte todos os times antes de salvar.');
        return;
      }
      final ask = widget.confirmBeforeSave;
      if (ask != null) {
        final ok = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Salvar o placar novo?'),
            content: Text(ask),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Voltar'),
              ),
              FilledButton(
                key: const Key('booking-result-save-confirm'),
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Salvar'),
              ),
            ],
          ),
        );
        if (ok != true || !mounted) return;
      }
      setState(() => _saving = true);
      try {
        await save(_r);
        // Placar gravado: a marcação ao vivo cumpriu o papel.
        unawaited(_liveStore.clear(_draftKey));
      } catch (e) {
        if (!mounted) return;
        setState(() => _saving = false);
        showAppErrorSnackBar(context, e);
        return;
      }
    }
    if (mounted) Navigator.of(context).pop(_r);
  }

  Future<void> _openTeam({ResultTeam? editing}) async {
    final owner = _r.teamById(resultOwnerTeamId(_r, widget.ownerPlayerId));
    final draft = await Navigator.of(context).push<ResultTeamDraft>(
      MaterialPageRoute(
        builder: (_) => BookingResultTeamPage(
          result: _r,
          candidates: widget.candidates,
          editing: editing,
          formation: BookingResultFormation.forPlayers(
            (editing ?? owner)?.players.length ?? 2,
          ),
        ),
      ),
    );
    if (draft == null || !mounted) return;
    setState(() {
      _r = editing == null
          ? _r.addTeam(draft.players, customName: draft.customName)
          : _r.replaceTeam(
              editing.copyWith(
                players: draft.players,
                customName: draft.customName ?? '',
              ),
            );
    });
  }

  /// Soma ao placar ATUAL (não ao do último build): toques rápidos não se
  /// perdem.
  void _bumpScore(int index, {required bool sideA, required int delta}) {
    final g = _r.games[index];
    final v = ((sideA ? g.scoreA : g.scoreB) + delta).clamp(0, _maxScore);
    setState(() {
      _r = _r.updateGame(
        index,
        sideA ? g.copyWith(scoreA: v) : g.copyWith(scoreB: v),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final rotation = _r.isRotation;
    final ownerTeamId = resultOwnerTeamId(_r, widget.ownerPlayerId);
    final leader = _r.leaderId;
    final unit = rotation ? 'jogo' : 'set';
    final count = _r.games.length;
    final addLabel = BookingResultFormation.forPlayers(
      _r.teamById(ownerTeamId)?.players.length ?? 2,
    ).label.toLowerCase();
    final notice = widget.onSave == null
        ? (names: '', rest: widget.localOnlyNotice)
        : bookingResultSaveNotice([
            for (final p in bookingResultConfirmers(_r, widget.ownerPlayerId))
              p.firstName,
          ]);

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          'Editar placar',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: SizedBox(
            height: 54,
            child: FilledButton(
              key: const Key('booking-result-save'),
              // Desabilitado o botão ficaria cinza e o spinner sumiria; o
              // `_save` já ignora o toque repetido.
              onPressed: _save,
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
              child: _saving
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: Color(0xFF0A0A0A),
                      ),
                    )
                  : Text(
                      'Salvar placar · $count ${count == 1 ? unit : '${unit}s'}',
                    ),
            ),
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.only(top: 4, bottom: 16),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
            child: _LiveCard(
              draft: _draft,
              sportLabel: _sportLabel,
              rules: PeladaLiveRules.forSport(widget.sport),
              rotation: rotation,
              onOpen: _openLive,
              onRestart: _restartLive,
            ),
          ),
          BookingStorySectionLabel(rotation ? 'Classificação' : 'Resultado'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: _Card(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              child: Column(
                children: [
                  for (final (i, s) in _r.standings.indexed) ...[
                    if (i > 0) _Divider(colors: colors),
                    _StandingRow(
                      key: Key('booking-result-team-${s.team.id}'),
                      rank: rotation ? i + 1 : null,
                      standing: s,
                      leading: s.team.id == leader,
                      showDiff: rotation,
                      onTap: () => _openTeam(editing: s.team),
                      onRemove: rotation && s.team.id != ownerTeamId
                          ? () => setState(() => _r = _r.removeTeam(s.team.id))
                          : null,
                    ),
                  ],
                  _Divider(colors: colors),
                  InkWell(
                    key: const Key('booking-result-add-team'),
                    onTap: () => _openTeam(),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Row(
                        children: [
                          const _DashedCircle(),
                          const SizedBox(width: 10),
                          Text(
                            'Adicionar $addLabel',
                            style: AppTypography.soraRegular(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.brand,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
            child: Text(
              rotation
                  ? 'Vitórias, depois saldo de pontos. Toque no nome do time '
                      'em um jogo para trocar.'
                  : 'Toque no time para trocar quem jogou.',
              style: AppTypography.soraRegular(
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
                color: colors.onSurface.withValues(alpha: 0.55),
              ),
            ),
          ),
          BookingStorySectionLabel(rotation ? 'Jogos' : 'Sets'),
          for (final (i, g) in _r.games.indexed)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: _GameCard(
                key: Key('booking-result-game-$i'),
                title: '${unit.toUpperCase()} ${i + 1}',
                game: g,
                result: _r,
                rotation: rotation,
                onRemove: count > 1
                    ? () => setState(() => _r = _r.removeGame(i))
                    : null,
                onCycle: (sideA) =>
                    setState(() => _r = _r.cycleTeam(i, sideA: sideA)),
                onScore: (sideA, delta) =>
                    _bumpScore(i, sideA: sideA, delta: delta),
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: OutlinedButton.icon(
              key: const Key('booking-result-add-game'),
              onPressed: () => setState(() => _r = _r.addGame()),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: Text('Adicionar $unit'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.brand,
                minimumSize: const Size.fromHeight(48),
                side: BorderSide(
                  color: AppColors.brand.withValues(alpha: 0.45),
                  width: 1.5,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                textStyle: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: _Card(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.schedule_rounded,
                    size: 16,
                    color: context.themeColors.pending,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text.rich(
                      key: const Key('booking-result-save-notice'),
                      TextSpan(
                        children: [
                          if (notice.names.isNotEmpty)
                            TextSpan(
                              text: notice.names,
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: colors.onSurface,
                              ),
                            ),
                          TextSpan(text: notice.rest),
                        ],
                      ),
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        height: 1.45,
                        color: colors.onSurface.withValues(alpha: 0.70),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Marcar ao vivo" no topo do Editar placar (canvas "Pelada · marcar ao
/// vivo", 01); com marcação guardada no aparelho, vira "Continuar marcação".
class _LiveCard extends StatelessWidget {
  const _LiveCard({
    required this.draft,
    required this.sportLabel,
    required this.rules,
    required this.rotation,
    required this.onOpen,
    required this.onRestart,
  });

  final PeladaLiveSession? draft;
  final String? sportLabel;
  final PeladaLiveRules rules;
  final bool rotation;
  final VoidCallback onOpen;
  final VoidCallback onRestart;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final draft = this.draft;
    final sport = sportLabel?.toLowerCase();
    final rulesText = rules.mode == PeladaLiveMode.points
        ? 'cada toque vale um ponto'
        : rules.summary;
    final subtitle = draft != null
        ? '${draft.progressLabel} · ${draft.rules.summary}'
        : [
            sport == null || rules.mode == PeladaLiveMode.points
                ? 'Ponto a ponto durante o jogo: $rulesText.'
                : 'Ponto a ponto durante o jogo, com as regras do $sport: '
                    '$rulesText.',
            if (rotation) 'Rei da quadra: quem vence fica.',
          ].join(' ');

    return Material(
      color: AppColors.brand.withValues(alpha: colors.isDark ? 0.08 : 0.07),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: AppColors.brand.withValues(alpha: 0.6),
          width: 1.5,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: const Key('pelada-live-open'),
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: AppColors.brand,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  draft != null
                      ? Icons.play_arrow_rounded
                      : Icons.scoreboard_outlined,
                  color: const Color(0xFF0A0A0A),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      draft != null ? 'Continuar marcação' : 'Marcar ao vivo',
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      key: const Key('pelada-live-card-subtitle'),
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        color: colors.onSurface.withValues(alpha: 0.72),
                      ),
                    ),
                  ],
                ),
              ),
              if (draft != null)
                TextButton(
                  key: const Key('pelada-live-restart'),
                  onPressed: onRestart,
                  style: TextButton.styleFrom(
                    foregroundColor: colors.brandText,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: const Text('Recomeçar'),
                )
              else
                Icon(Icons.chevron_right_rounded, color: colors.brandText),
            ],
          ),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child, required this.padding});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: child,
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider({required this.colors});

  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) =>
      Divider(height: 1, color: colors.onSurface.withValues(alpha: 0.06));
}

class _DashedCircle extends StatelessWidget {
  const _DashedCircle();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.6),
          width: 1.5,
        ),
      ),
      child: const Icon(Icons.add_rounded, size: 16, color: AppColors.brand),
    );
  }
}

class _StandingRow extends StatelessWidget {
  const _StandingRow({
    super.key,
    required this.rank,
    required this.standing,
    required this.leading,
    required this.showDiff,
    required this.onTap,
    required this.onRemove,
  });

  final int? rank;
  final ResultStanding standing;
  final bool leading;
  final bool showDiff;
  final VoidCallback onTap;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final diff = standing.pointDiff;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            if (rank != null)
              SizedBox(
                width: 18,
                child: Text(
                  '$rank',
                  style: AppTypography.mono(
                    fontSize: 12,
                    color: colors.onSurface.withValues(alpha: 0.45),
                  ),
                ),
              ),
            ResultTeamAvatars(
              players: standing.team.players,
              size: 28,
              borderColor: colors.surfaceCard,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                standing.team.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: leading ? FontWeight.w700 : FontWeight.w500,
                  color: leading
                      ? colors.onSurface
                      : colors.onSurface.withValues(alpha: 0.70),
                ),
              ),
            ),
            if (showDiff)
              Padding(
                padding: const EdgeInsets.only(left: 6),
                child: Text(
                  diff > 0 ? '+$diff' : '$diff',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: colors.onSurface.withValues(alpha: 0.45),
                  ),
                ),
              ),
            SizedBox(
              width: 32,
              child: Text(
                '${standing.wins}',
                textAlign: TextAlign.right,
                style: AppTypography.mono(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: leading
                      ? AppColors.brand
                      : colors.onSurface.withValues(alpha: 0.55),
                ),
              ),
            ),
            if (onRemove != null)
              IconButton(
                tooltip: 'Remover time',
                onPressed: onRemove,
                visualDensity: VisualDensity.compact,
                icon: Icon(
                  Icons.close_rounded,
                  size: 16,
                  color: colors.onSurface.withValues(alpha: 0.45),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _GameCard extends StatelessWidget {
  const _GameCard({
    super.key,
    required this.title,
    required this.game,
    required this.result,
    required this.rotation,
    required this.onRemove,
    required this.onCycle,
    required this.onScore,
  });

  final String title;
  final ResultGame game;
  final BookingResult result;
  final bool rotation;
  final VoidCallback? onRemove;
  final ValueChanged<bool> onCycle;

  /// `delta` +1 / −1.
  final void Function(bool sideA, int delta) onScore;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget side(bool sideA) {
      final teamId = sideA ? game.teamA : game.teamB;
      final team = result.teamById(teamId);
      final score = sideA ? game.scoreA : game.scoreB;
      final winning = game.winner == teamId;
      return Row(
        children: [
          Expanded(
            child: InkWell(
              key: Key('$title-${sideA ? 'a' : 'b'}-team'),
              onTap: rotation ? () => onCycle(sideA) : null,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
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
                          color: winning
                              ? colors.onSurface
                              : colors.onSurface.withValues(alpha: 0.62),
                        ),
                      ),
                    ),
                    if (rotation) ...[
                      const SizedBox(width: 4),
                      Icon(
                        Icons.unfold_more_rounded,
                        size: 16,
                        color: colors.onSurface.withValues(alpha: 0.45),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          _Stepper(
            keyPrefix: '$title-${sideA ? 'a' : 'b'}',
            value: score,
            highlight: winning,
            onStep: (delta) => onScore(sideA, delta),
          ),
        ],
      );
    }

    return _Card(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: AppTypography.mono(
                    fontSize: 10,
                    letterSpacing: 1.4,
                    color: colors.onSurface.withValues(alpha: 0.55),
                  ),
                ),
              ),
              if (onRemove != null)
                TextButton(
                  onPressed: onRemove,
                  style: TextButton.styleFrom(
                    foregroundColor: colors.onSurface.withValues(alpha: 0.55),
                    minimumSize: const Size(0, 28),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Remover'),
                ),
            ],
          ),
          const SizedBox(height: 6),
          side(true),
          const SizedBox(height: 8),
          side(false),
        ],
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.keyPrefix,
    required this.value,
    required this.highlight,
    required this.onStep,
  });

  final String keyPrefix;
  final int value;
  final bool highlight;
  final ValueChanged<int> onStep;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget button(IconData icon, String tip, int delta, String suffix) {
      return SizedBox(
        width: 36,
        height: 36,
        child: IconButton.outlined(
          key: Key('$keyPrefix-$suffix'),
          tooltip: tip,
          padding: EdgeInsets.zero,
          onPressed: value + delta < 0 ? null : () => onStep(delta),
          style: IconButton.styleFrom(
            backgroundColor: colors.onSurface.withValues(alpha: 0.05),
            side: BorderSide(color: colors.onSurface.withValues(alpha: 0.10)),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
          icon: Icon(icon, size: 16, color: colors.onSurface),
        ),
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        button(Icons.remove_rounded, 'Menos', -1, 'minus'),
        SizedBox(
          width: 44,
          child: Text(
            '$value',
            textAlign: TextAlign.center,
            style: AppTypography.mono(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.48,
              color: highlight ? AppColors.brand : colors.onSurface,
            ),
          ),
        ),
        button(Icons.add_rounded, 'Mais', 1, 'plus'),
      ],
    );
  }
}
