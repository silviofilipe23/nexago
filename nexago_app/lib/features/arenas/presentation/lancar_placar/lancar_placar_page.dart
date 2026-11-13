import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/deep_link/app_domains.dart';
import '../../../../core/profiles/app_user_profile.dart';
import '../../../../core/profiles/users_repository.dart';
import '../../../../core/ui/nexa_share.dart';
import '../../../athlete/domain/booking_invite_links.dart';
import '../../../athlete/domain/booking_invite_providers.dart';
import '../../../../core/layout/nexa_app_bar.dart';
import '../../../../core/search/search_keywords.dart';
import '../../../../core/sports/sport_catalog.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../athlete/domain/athlete_display_name.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../../tournaments/data/partner_search_service.dart';
import '../../data/pelada_live_draft_store.dart';
import '../../domain/booking_result.dart';
import '../../domain/booking_result_record.dart';
import '../../domain/booking_result_record_providers.dart';
import '../../domain/booking_social_unlock.dart';
import '../../domain/booking_story.dart';
import '../../domain/booking_story_providers.dart';
import '../../domain/my_booking_confirmed_athlete.dart';
import '../../domain/lancar_placar.dart';
import '../../domain/pelada_live/pelada_live_rules.dart';
import '../../domain/pelada_live/pelada_live_session.dart';
import '../pelada_live/pelada_live_page.dart';
import '../pelada_live/pelada_live_widgets.dart';
import '../widgets/booking_story/booking_result_card.dart';
import '../widgets/booking_story/booking_social_locked_view.dart';
import 'lancar_placar_widgets.dart';
import 'placar_digitado_page.dart';
import 'placar_enviado_page.dart';

/// Como o placar entra no passo 2.
enum LancarPlacarMode { typed, live }

/// Como o "Lançar placar" terminou (o que [openLancarPlacar] devolve).
sealed class LancarPlacarOutcome {
  const LancarPlacarOutcome(this.result);

  final BookingResult result;
}

/// Gravado e enviado para os outros confirmarem.
final class LancarPlacarSent extends LancarPlacarOutcome {
  const LancarPlacarSent(super.result);
}

/// Quem não envia (convidado): o placar só vai para a arte do story.
final class LancarPlacarArt extends LancarPlacarOutcome {
  const LancarPlacarArt(super.result);
}

/// Abre o "Lançar placar" por cima de tudo. [fromStoryEditor]: veio do
/// Pós-jogo (o story já está embaixo; "Postar no story" só volta).
Future<LancarPlacarOutcome?> openLancarPlacar(
  BuildContext context,
  BookingStoryArgs args, {
  LancarPlacarMode mode = LancarPlacarMode.typed,
  String? presetSport,
  bool fromStoryEditor = false,
}) {
  return Navigator.of(context, rootNavigator: true).push<LancarPlacarOutcome>(
    MaterialPageRoute(
      builder: (_) => LancarPlacarPage(
        args: args,
        mode: mode,
        presetSport: presetSport,
        fromStoryEditor: fromStoryEditor,
      ),
    ),
  );
}

/// Lançar placar (canvas "Proposta · lançar placar em 2 passos" e "marcar ao
/// vivo dentro do mesmo fluxo"). Passo 1 é esta tela, "Quem jogou?": a galera
/// da reserva já dividida nos times, cada jogador com os botões A/B ao lado —
/// trocar de time é um toque. O passo 2 é o placar digitado
/// ([PlacarDigitadoPage]) ou o ao vivo ([PeladaLivePage]); no fim, "Enviado".
class LancarPlacarPage extends ConsumerStatefulWidget {
  const LancarPlacarPage({
    super.key,
    required this.args,
    this.mode = LancarPlacarMode.typed,
    this.presetSport,
    this.fromStoryEditor = false,
    this.clock = DateTime.now,
  });

  final BookingStoryArgs args;
  final LancarPlacarMode mode;
  final String? presetSport;
  final bool fromStoryEditor;

  /// "Agora" para decidir entre "Quem vai jogar?" e "Quem jogou?" (testes).
  final DateTime Function() clock;

  @override
  ConsumerState<LancarPlacarPage> createState() => _LancarPlacarPageState();
}

class _LancarPlacarPageState extends ConsumerState<LancarPlacarPage> {
  late LancarPlacarMode _mode = widget.mode;
  BookingResult? _r;
  final List<ResultPlayer> _extra = [];
  final _query = TextEditingController();
  Timer? _debounce;
  String _search = '';
  bool _resumeChecked = false;

  /// Primeiro nome de quem mandou o placar que abriu preenchido.
  String? _suggestedBy;

  String get _bookingId => widget.args.bookingId.trim();

  /// O horário ainda não acabou: o passo 1 fala no futuro ("Quem vai jogar?").
  bool get _upcoming => lancarIsUpcoming(
        dateKey: widget.args.dateKey,
        startTime: widget.args.startTime,
        endTime: widget.args.endTime,
        now: widget.clock(),
      );
  String get _draftKey => peladaLiveDraftKey(widget.args.bookingId);

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _onQuery(String _) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _search = _query.text.trim());
    });
  }

  // Dados da reserva --------------------------------------------------------

  String? get _sport =>
      widget.presetSport ??
      ref.read(bookingStorySourceProvider(widget.args.bookingId))?.sport;

  String get _sportKey {
    final code = SportCatalog.resolve(_sport)?.code;
    return code ?? 'other';
  }

  bool get _canSave {
    final uid = ref.read(bookingResultUidProvider);
    final owner =
        ref.read(bookingStorySourceProvider(widget.args.bookingId))?.ownerUid;
    return _bookingId.isNotEmpty && (owner == null || owner == uid);
  }

  String get _ownerId {
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    return profile?.id ?? ref.read(bookingResultUidProvider);
  }

  String _sendLabel(BookingResult r) {
    final names = lancarNamesLine(lancarConfirmers(r, _ownerId));
    return names.isEmpty ? 'Enviar placar' : 'Enviar para $names';
  }

  // Ações -------------------------------------------------------------------

  void _assign(ResultPlayer player, int teamId) {
    final r = _r;
    if (r == null) return;
    final (next, outcome) = r.assignPlayer(player, teamId);
    if (outcome == LancarAssignOutcome.teamFull) {
      final index = r.teams.indexWhere((t) => t.id == teamId);
      showAppSnackBar(
        context,
        'O Time ${lancarTeamLetter(index)} já tem $kLancarMaxTeamPlayers '
        'jogadores.',
      );
      return;
    }
    if (!_extra.contains(player) && !_candidates().contains(player)) {
      _extra.add(player);
    }
    // Escolheu o time de alguém da busca: limpa o campo e fecha o teclado,
    // e a lista volta inteira (com quem acabou de entrar).
    final clearSearch = outcome == LancarAssignOutcome.assigned &&
        _query.text.trim().isNotEmpty;
    if (clearSearch) {
      _debounce?.cancel();
      _query.clear();
      FocusManager.instance.primaryFocus?.unfocus();
    }
    setState(() {
      _r = next;
      if (clearSearch) _search = '';
    });
  }

  Future<void> _rename(ResultTeam team, int index) async {
    final name = await showDialog<String>(
      context: context,
      builder: (_) => _RenameDialog(
        initial: team.name,
        title: 'Nome do Time ${lancarTeamLetter(index)}',
      ),
    );
    if (name == null || !mounted || _r == null) return;
    setState(
        () => _r = _r!.replaceTeam(team.copyWith(customName: name.trim())));
  }

  /// Pergunta antes de regravar um placar já salvo (todos confirmam de novo).
  Future<bool> _confirmResave() async {
    final saved = ref.read(savedBookingResultProvider(widget.args.bookingId));
    if (saved == null) return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Enviar o placar novo?'),
        content: const Text(
          'Os jogadores vão receber o placar para confirmar novamente.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            key: const Key('lancar-placar-resave-confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Enviar'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  /// Convidado: manda para quem reservou conferir e enviar (fase 2).
  Future<void> _suggest(BookingResult r) async {
    await ref.read(bookingResultRepositoryProvider).suggest(_bookingId, r);
    await ref.read(peladaLiveDraftStoreProvider).clear(_draftKey);
    ref.invalidate(peladaLiveDraftProvider(widget.args.bookingId));
  }

  /// "Convidar quem não tem conta": o link de convite da reserva (cadastro e
  /// entrada no jogo pelo nexaGO). Jogo encerrado ou lotado: um convite para
  /// baixar o app e mandar o @.
  Future<void> _inviteByLink() async {
    final args = widget.args;
    String message;
    try {
      final inviteId =
          await ref.read(bookingInviteServiceProvider).inviteLinkId(_bookingId);
      final startAt =
          DateTime.tryParse('${args.dateKey}T${args.startTime}:00') ??
              DateTime.now();
      message = lancarInviteMessage(
        arenaName: args.arenaName,
        when: bookingInviteWhenLabel(startAt),
        url: bookingInviteUrl(inviteId),
      );
    } catch (_) {
      message = lancarInviteFallbackMessage(
        arenaName: args.arenaName,
        downloadUrl: AppShareLinks.appDownload,
      );
    }
    if (!mounted) return;
    await nexaShareText(context, message);
  }

  /// Grava (a callable confere tudo de novo) e apaga a marcação ao vivo.
  Future<void> _save(BookingResult r) async {
    if (!await _confirmResave()) throw const PeladaLiveSendCancelled();
    await ref.read(bookingResultRepositoryProvider).save(_bookingId, r);
    await ref.read(peladaLiveDraftStoreProvider).clear(_draftKey);
    ref.invalidate(peladaLiveDraftProvider(widget.args.bookingId));
  }

  // Os builders das rotas abaixo rodam de novo a cada reconstrução (tema,
  // girar a tela) — depois que esta tela já saiu. Nada de `ref` neles: tudo
  // é lido antes de abrir a rota.

  void _done(BookingResult r, {bool toOwner = false}) {
    final confirmers = lancarConfirmers(r, _ownerId);
    final sport = _sport;
    final args = widget.args;
    final fromStoryEditor = widget.fromStoryEditor;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => PlacarEnviadoPage(
          args: args,
          result: r,
          confirmers: confirmers,
          sport: sport,
          fromStoryEditor: fromStoryEditor,
          toOwner: toOwner,
        ),
      ),
      result: toOwner ? LancarPlacarArt(r) : LancarPlacarSent(r),
    );
  }

  Future<void> _next() async {
    final r = _r;
    if (r == null || lancarTeamsMissing(r, upcoming: _upcoming) != null) {
      return;
    }
    if (_mode == LancarPlacarMode.live) {
      final store = ref.read(peladaLiveDraftStoreProvider);
      final rules =
          await store.lastRules(_sportKey) ?? PeladaLiveRules.forSport(_sport);
      if (!mounted) return;
      await _runLive(
        PeladaLiveSession.start(r, rules, now: DateTime.now()),
      );
    } else {
      await _runTyped(r);
    }
  }

  Future<void> _runLive(PeladaLiveSession session) async {
    final canSave = _canSave;
    final store = ref.read(peladaLiveDraftStoreProvider);
    final draftKey = _draftKey;
    final sportLabel = SportCatalog.labelOf(_sport);
    final sportKey = _sportKey;
    // Convidado também manda: vai para quem reservou conferir e enviar.
    final hostName = _hostName();
    final sendLabel = canSave
        ? _sendLabel(session.toResult())
        : lancarGuestSendLabel(hostName);
    final exit = await Navigator.of(context).push<PeladaLiveExit>(
      MaterialPageRoute(
        builder: (_) => PeladaLivePage(
          session: session,
          store: store,
          draftKey: draftKey,
          sportLabel: sportLabel,
          sport: sportKey,
          onSend: canSave ? _save : _suggest,
          sendLabel: sendLabel,
          sendNote: canSave ? null : lancarGuestSendNote(hostName),
        ),
      ),
    );
    ref.invalidate(peladaLiveDraftProvider(widget.args.bookingId));
    if (!mounted || exit == null) return;
    switch (exit) {
      case PeladaLiveSent(:final result):
        _done(result, toOwner: !canSave);
      case PeladaLiveReview(:final result):
        setState(() => _r = result);
        await _runTyped(result);
    }
  }

  Future<void> _runTyped(BookingResult r) async {
    final canSave = _canSave;
    final sport = _sport;
    final hostName = _hostName();
    final submitLabel =
        canSave ? _sendLabel(r) : lancarGuestSendLabel(hostName);
    BookingResult? finished;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (pageContext) => PlacarDigitadoPage(
          initial: r,
          sport: sport,
          canSend: canSave,
          guestNote: canSave ? null : lancarGuestSendNote(hostName),
          submitLabel: submitLabel,
          onChanged: (next) => _r = next,
          onSubmit: (result) async {
            try {
              await (canSave ? _save(result) : _suggest(result));
            } on PeladaLiveSendCancelled {
              return;
            }
            finished = result;
            if (pageContext.mounted) Navigator.of(pageContext).pop();
          },
        ),
      ),
    );
    if (!mounted) return;
    setState(() {});
    final result = finished;
    if (result == null) return;
    _done(result, toOwner: !canSave);
  }

  // Tela --------------------------------------------------------------------

  /// Quem reservou, quando quem lança é um convidado (`null` para o dono).
  AppUserProfile? _host() {
    final hostUid = _hostUid();
    if (hostUid == null) return null;
    return ref.read(appUserPublicProfileProvider(hostUid)).valueOrNull;
  }

  String? _hostName() {
    final host = _host();
    return host == null ? null : appUserDisplayName(host);
  }

  String? _hostUid() {
    final ownerUid =
        ref.read(bookingStorySourceProvider(widget.args.bookingId))?.ownerUid;
    final uid = ref.read(bookingResultUidProvider);
    if (ownerUid == null || ownerUid.isEmpty || ownerUid == uid) return null;
    return ownerUid;
  }

  List<ResultPlayer> _candidates() {
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    final source = ref.read(bookingStorySourceProvider(widget.args.bookingId));
    // Convidado lançando: quem reservou também jogou e entra logo depois dele.
    final host = _host();
    final crew = bookingResultCrew(
      ownerUid: profile?.id ?? source?.ownerUid,
      ownerName:
          profile == null ? null : athleteDisplayName(profile, fallback: ''),
      ownerAvatarUrl: profile?.avatarUrl,
      confirmed: [
        if (host != null)
          MyBookingConfirmedAthlete(
            userId: host.uid,
            displayName: appUserDisplayName(host),
            avatarUrl: host.profilePhotoUrl,
          ),
        ...?source?.confirmed,
      ],
    );
    final out = [...crew];
    void add(ResultPlayer p) {
      if (!p.isGuest && !out.contains(p)) out.add(p);
    }

    for (final t in _r?.teams ?? const <ResultTeam>[]) {
      t.players.forEach(add);
    }
    _extra.forEach(add);
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final args = widget.args;
    final profileAsync = ref.watch(athleteProfileProvider);
    final source = ref.watch(bookingStorySourceProvider(args.bookingId));
    final uid = ref.watch(bookingResultUidProvider);
    final unlock = ref.watch(bookingSocialUnlockProvider(args.bookingId));
    final loaded = ref.watch(myBookingResultsLoadedProvider);
    final saved = ref.watch(savedBookingResultProvider(args.bookingId));
    final canSaveNow = args.bookingId.trim().isNotEmpty &&
        (source?.ownerUid == null || source!.ownerUid == uid);
    // Quem reservou: o placar que o convidado mandou abre já preenchido.
    final suggestionAsync = canSaveNow
        ? ref.watch(bookingResultSuggestionProvider(args.bookingId))
        : const AsyncValue<BookingResultSuggestion?>.data(null);
    // Convidado: o perfil de quem reservou entra nos times iniciais.
    final hostUid = canSaveNow ? null : source?.ownerUid;
    final hostAsync = hostUid == null
        ? const AsyncValue<AppUserProfile?>.data(null)
        : ref.watch(appUserPublicProfileProvider(hostUid));
    final draft = _mode == LancarPlacarMode.live
        ? ref.watch(peladaLiveDraftProvider(args.bookingId))
        : const AsyncValue<PeladaLiveSession?>.data(null);

    if (unlock != null && !unlock.unlocked) {
      return BookingSocialLockedView(
        unlock: unlock,
        isOwner: source?.ownerUid == null || source!.ownerUid == uid,
      );
    }
    // A marcação guardada só importa na abertura (para continuar de onde
    // parou); trocar para "ao vivo" no passo 1 não volta a esperar por ela.
    final ready = unlock != null &&
        loaded &&
        profileAsync.hasValue &&
        (_r != null ||
            (!draft.isLoading &&
                !suggestionAsync.isLoading &&
                !hostAsync.isLoading));
    if (!ready) {
      return Scaffold(
        backgroundColor: colors.canvas,
        body: const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      );
    }

    // Uma vez: o placar salvo ou a galera da reserva dividida em dois times.
    if (_r == null) {
      final suggestion = suggestionAsync.valueOrNull;
      _suggestedBy = suggestion?.suggestedByFirstName;
      _r = suggestion?.result ??
          saved?.result ??
          initialBookingResult(_candidates());
    }
    final r = _r!;

    // Marcação ao vivo guardada: continua de onde parou, sem o passo 1.
    if (!_resumeChecked) {
      _resumeChecked = true;
      final resume = draft.valueOrNull;
      if (resume != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _runLive(resume);
        });
      }
    }

    final candidates = _candidates();
    final searching = isPartnerQueryLongEnough(_search);
    final remote = searching
        ? ref.watch(bookingResultPlayerSearchProvider(_search))
        : const AsyncValue<List<ResultPlayer>>.data([]);
    final typed = _query.text.trim();
    final listed = [
      for (final p in candidates)
        if (typed.isEmpty ||
            normalizeSearchTerm(p.name).contains(normalizeSearchTerm(typed)))
          p,
    ];
    final found = [
      for (final p in remote.valueOrNull ?? const <ResultPlayer>[])
        if (!candidates.contains(p)) p,
    ];
    final upcoming = _upcoming;
    final missing = lancarTeamsMissing(r, upcoming: upcoming);
    final live = _mode == LancarPlacarMode.live;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: LancarPlacarTitle(
          title: lancarStepTitle(upcoming: upcoming),
          subtitle: live ? '1 de 2 · antes de marcar' : '1 de 2 · times',
        ),
      ),
      bottomNavigationBar: LancarPlacarFooter(
        buttonKey: const Key('lancar-placar-next'),
        label: missing ?? (live ? 'Começar a marcar' : 'Próximo: placar'),
        enabled: missing == null,
        onPressed: _next,
        secondary: TextButton(
          key: const Key('lancar-placar-switch-mode'),
          onPressed: () => setState(
            () => _mode = live ? LancarPlacarMode.typed : LancarPlacarMode.live,
          ),
          style: TextButton.styleFrom(foregroundColor: colors.brandText),
          child: Text(live ? 'ou digitar o placar' : 'ou marcar ao vivo'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        children: [
          const LancarPlacarSteps(step: 1),
          const SizedBox(height: 6),
          if (_suggestedBy != null)
            Container(
              key: const Key('lancar-placar-suggested'),
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: colors.win.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: colors.win.withValues(alpha: 0.45)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.scoreboard_outlined, size: 18, color: colors.win),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '$_suggestedBy marcou o placar e mandou para você. '
                      'Confira os times e o placar e envie para todos '
                      'confirmarem.',
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        color: colors.onSurface.withValues(alpha: 0.85),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          _TeamsList(
            result: r,
            upcoming: upcoming,
            onRename: _rename,
            onDrop: (id) => setState(() => _r = r.dropTeam(id)),
            onMove: (from, to) => setState(() => _r = r.moveTeam(from, to)),
          ),
          if (r.teams.length < kLancarMaxTeams)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                key: const Key('lancar-placar-add-team'),
                onPressed: () => setState(() => _r = r.addEmptyTeam()),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: Text(
                  r.isRotation
                      ? 'Mais um time'
                      : 'Mais um time (rei da quadra)',
                ),
                style: TextButton.styleFrom(foregroundColor: colors.brandText),
              ),
            ),
          PeladaLiveLabel(
            typed.isEmpty ? 'Da reserva' : 'Jogadores',
            trailing: 'toque no time',
          ),
          for (final (i, p) in listed.indexed)
            _PlayerAssignRow(
              key: Key('lancar-player-${p.id}'),
              player: p,
              first: i == 0,
              subtitle: p.id == uid
                  ? 'você'
                  : p.id == hostUid
                      ? 'reservou a quadra'
                      : _extra.contains(p)
                          ? 'adicionado pela busca'
                          : 'na reserva',
              result: r,
              onAssign: (teamId) => _assign(p, teamId),
            ),
          const SizedBox(height: 14),
          TextField(
            key: const Key('lancar-placar-search'),
            controller: _query,
            onChanged: _onQuery,
            textCapitalization: TextCapitalization.words,
            style: TextStyle(fontSize: 14, color: colors.onSurface),
            decoration: InputDecoration(
              labelText: 'Buscar mais atletas',
              hintText: 'Nome ou @ (pelo menos 3 letras)',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              isDense: true,
              filled: true,
              fillColor: colors.onSurface.withValues(alpha: 0.03),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          if (remote.isLoading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          for (final (i, p) in found.indexed)
            _PlayerAssignRow(
              key: Key('lancar-player-${p.id}'),
              player: p,
              first: i == 0,
              subtitle: 'no nexaGO',
              result: r,
              onAssign: (teamId) => _assign(p, teamId),
            ),
          if (searching && !remote.isLoading && found.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                'Ninguém com esse nome no nexaGO.',
                style: TextStyle(
                  fontSize: 12.5,
                  color: colors.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ),
          if (canSaveNow)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: SizedBox(
                height: 48,
                child: OutlinedButton.icon(
                  key: const Key('lancar-placar-invite'),
                  onPressed: _inviteByLink,
                  icon: const Icon(Icons.ios_share_rounded, size: 18),
                  label: const Text('Convidar quem não tem conta'),
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
            ),
          const PeladaLiveNote(
            'Todo mundo do placar precisa ter conta no nexaGO: cada um '
            'confirma o resultado. Quem não tem entra pelo link do convite '
            '(pelo WhatsApp) e aparece aqui.',
          ),
        ],
      ),
    );
  }
}

/// Os times, um por linha (canvas "Passo 1 v2"). No rei da quadra a lista é a
/// ordem de entrada — A × B abrem e a fila segue a lista — e cada linha tem
/// a alça para arrastar; a letra é a posição.
class _TeamsList extends StatelessWidget {
  const _TeamsList({
    required this.result,
    required this.upcoming,
    required this.onRename,
    required this.onDrop,
    required this.onMove,
  });

  final BookingResult result;
  final bool upcoming;
  final void Function(ResultTeam team, int index) onRename;
  final ValueChanged<int> onDrop;
  final void Function(int from, int to) onMove;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final rotation = result.isRotation;
    Widget row(int i) {
      final t = result.teams[i];
      return _TeamRow(
        key: Key('lancar-team-$i'),
        team: t,
        index: i,
        upcoming: upcoming,
        draggable: rotation,
        canDrop: result.teams.length > 2,
        onRename: () => onRename(t, i),
        onDrop: () => onDrop(t.id),
      );
    }

    final order = lancarRotationOrder(result);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PeladaLiveLabel(
          rotation ? 'Ordem de entrada' : 'Times',
          trailing: rotation ? 'arraste para mudar' : null,
        ),
        if (order != null)
          Container(
            key: const Key('lancar-team-order'),
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.07),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.brand.withValues(alpha: 0.4)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.opening,
                  style: TextStyle(
                    fontSize: 12.5,
                    height: 1.4,
                    fontWeight: FontWeight.w700,
                    color: colors.brandText,
                  ),
                ),
                Text(
                  order.queue,
                  style: TextStyle(
                    fontSize: 12.5,
                    height: 1.4,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface.withValues(alpha: 0.8),
                  ),
                ),
              ],
            ),
          ),
        if (rotation)
          ReorderableListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            buildDefaultDragHandles: false,
            itemCount: result.teams.length,
            onReorderItem: onMove,
            proxyDecorator: (child, _, __) =>
                Material(color: Colors.transparent, child: child),
            itemBuilder: (context, i) => Padding(
              key: ValueKey('lancar-team-slot-${result.teams[i].id}'),
              padding: const EdgeInsets.only(bottom: 6),
              child: row(i),
            ),
          )
        else
          for (var i = 0; i < result.teams.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: row(i),
            ),
      ],
    );
  }
}

/// Um time numa linha só: letra na cor, quem está nele, quantos, a alça (rei
/// da quadra) e o menu (renomear, tirar). Tirar jogador é na lista de baixo.
class _TeamRow extends StatelessWidget {
  const _TeamRow({
    super.key,
    required this.team,
    required this.index,
    required this.upcoming,
    required this.draggable,
    required this.canDrop,
    required this.onRename,
    required this.onDrop,
  });

  final ResultTeam team;
  final int index;
  final bool upcoming;
  final bool draggable;
  final bool canDrop;
  final VoidCallback onRename;
  final VoidCallback onDrop;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fill = lancarTeamFill(index);
    final letter = lancarTeamLetter(index);
    final custom = team.customName?.trim() ?? '';
    final names = [for (final p in team.players) p.firstName].join(', ');
    final empty = team.players.isEmpty;
    final canRename = !empty;
    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: fill.withValues(alpha: colors.isDark ? 0.08 : 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: fill.withValues(alpha: 0.45)),
      ),
      padding: const EdgeInsets.only(left: 10),
      child: Row(
        children: [
          LancarTeamBadge(index: index, size: 24),
          const SizedBox(width: 10),
          Expanded(
            child: Row(
              children: [
                // Nome do time (renomeado) em destaque; os jogadores ao lado.
                if (custom.isNotEmpty && !empty) ...[
                  Flexible(
                    child: Text(
                      custom,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  Text(
                    ' · ',
                    style: TextStyle(
                      fontSize: 13,
                      color: colors.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                ],
                Flexible(
                  child: Text(
                    empty
                        ? 'Toque $letter ao lado de quem '
                            '${upcoming ? 'joga' : 'jogou'}'
                        : names,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: empty ? FontWeight.w500 : FontWeight.w600,
                      color: colors.onSurface.withValues(
                        alpha: empty || custom.isNotEmpty ? 0.6 : 1,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Text(
            '${team.players.length}',
            key: Key('lancar-team-$index-count'),
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: colors.onSurface.withValues(alpha: 0.55),
            ),
          ),
          if (draggable)
            ReorderableDragStartListener(
              index: index,
              child: Semantics(
                label: 'Arrastar o Time $letter para mudar a ordem',
                child: SizedBox(
                  key: Key('lancar-team-$index-drag'),
                  width: 40,
                  height: 48,
                  child: Icon(
                    Icons.drag_indicator_rounded,
                    size: 20,
                    color: colors.onSurface.withValues(alpha: 0.5),
                  ),
                ),
              ),
            )
          else
            const SizedBox(width: 6),
          if (canRename || canDrop)
            SizedBox(
              width: 40,
              height: 48,
              child: PopupMenuButton<String>(
                key: Key('lancar-team-$index-menu'),
                tooltip: 'Opções do Time $letter',
                padding: EdgeInsets.zero,
                icon: Icon(
                  Icons.more_horiz_rounded,
                  size: 20,
                  color: colors.onSurface.withValues(alpha: 0.6),
                ),
                onSelected: (v) => v == 'rename' ? onRename() : onDrop(),
                itemBuilder: (_) => [
                  if (canRename)
                    PopupMenuItem(
                      key: Key('lancar-team-$index-rename'),
                      value: 'rename',
                      child: const Text('Renomear'),
                    ),
                  if (canDrop)
                    PopupMenuItem(
                      key: Key('lancar-team-$index-drop'),
                      value: 'drop',
                      child: Text('Tirar o Time $letter'),
                    ),
                ],
              ),
            )
          else
            const SizedBox(width: 4),
        ],
      ),
    );
  }
}

/// Um jogador e os botões dos times: o selecionado fica pintado; tocar nele
/// de novo tira o jogador do placar.
class _PlayerAssignRow extends StatelessWidget {
  const _PlayerAssignRow({
    super.key,
    required this.player,
    required this.first,
    required this.subtitle,
    required this.result,
    required this.onAssign,
  });

  final ResultPlayer player;
  final bool first;
  final String subtitle;
  final BookingResult result;
  final ValueChanged<int> onAssign;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final current = result.teamIdOf(player.id);
    // Até 3 times os botões cabem ao lado do nome; com mais, vão para uma
    // linha embaixo (o nome nunca é espremido).
    final below = result.teams.length > _kInlineTeamButtons;
    final buttons = Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final (i, t) in result.teams.indexed)
          _TeamButton(
            key: Key('lancar-assign-${player.id}-$i'),
            index: i,
            selected: current == t.id,
            playerName: player.firstName,
            size: below ? 40 : 44,
            onTap: () => onAssign(t.id),
          ),
      ],
    );
    final who = Row(
      children: [
        ResultTeamAvatars(
          players: [player],
          size: 36,
          borderColor: colors.canvas,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                player.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11.5,
                  color: colors.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),
        ),
        if (!below) ...[const SizedBox(width: 8), buttons],
      ],
    );
    return Column(
      children: [
        if (!first)
          Divider(height: 1, color: colors.onSurface.withValues(alpha: 0.06)),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: below
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    who,
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.only(left: 46),
                      child: buttons,
                    ),
                  ],
                )
              : who,
        ),
      ],
    );
  }
}

/// Quantos times cabem com os botões ao lado do nome.
const int _kInlineTeamButtons = 3;

class _TeamButton extends StatelessWidget {
  const _TeamButton({
    super.key,
    required this.index,
    required this.selected,
    required this.playerName,
    required this.onTap,
    this.size = 44,
  });

  final int index;
  final bool selected;
  final String playerName;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fill = lancarTeamFill(index);
    final letter = lancarTeamLetter(index);
    return Semantics(
      button: true,
      selected: selected,
      label: selected
          ? '$playerName no Time $letter. Tocar tira do time'
          : 'Pôr $playerName no Time $letter',
      child: Material(
        color: selected ? fill : colors.surfaceRaised,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: selected ? fill : colors.onSurface.withValues(alpha: 0.14),
            width: 1.5,
          ),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: SizedBox(
            width: size,
            height: size,
            child: Center(
              child: Text(
                letter,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: selected
                      ? const Color(0xFF0A0A0A)
                      : colors.onSurface.withValues(alpha: 0.75),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// O diálogo é dono do controller (descartar no fim do `showDialog` quebra a
/// animação de saída).
class _RenameDialog extends StatefulWidget {
  const _RenameDialog({required this.initial, required this.title});

  final String initial;
  final String title;

  @override
  State<_RenameDialog> createState() => _RenameDialogState();
}

class _RenameDialogState extends State<_RenameDialog> {
  late final _controller = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        key: const Key('lancar-team-name-field'),
        controller: _controller,
        autofocus: true,
        maxLength: 32,
        textCapitalization: TextCapitalization.words,
        decoration: const InputDecoration(hintText: 'Ex.: As brabas'),
        onSubmitted: (v) => Navigator.of(context).pop(v),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        TextButton(
          key: const Key('lancar-team-name-save'),
          onPressed: () => Navigator.of(context).pop(_controller.text),
          child: const Text('Salvar'),
        ),
      ],
    );
  }
}
