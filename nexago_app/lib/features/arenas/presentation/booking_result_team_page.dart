import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/search/search_keywords.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../domain/booking_result.dart';
import '../../tournaments/data/partner_search_service.dart';
import '../domain/booking_story_providers.dart';
import 'widgets/booking_story/booking_result_card.dart';
import 'widgets/booking_story/booking_story_card.dart';
import 'widgets/booking_story/booking_story_editor.dart';

/// O que a tela devolve: os jogadores escolhidos e o nome, se renomeado.
@immutable
class ResultTeamDraft {
  const ResultTeamDraft({required this.players, this.customName});

  final List<ResultPlayer> players;
  final String? customName;
}

/// Reservar · 16c — montar um time do placar: formação (dupla a sexteto),
/// quem estava na reserva, busca de atletas do app ou um nome avulso.
class BookingResultTeamPage extends ConsumerStatefulWidget {
  const BookingResultTeamPage({
    super.key,
    required this.result,
    required this.candidates,
    required this.formation,
    this.editing,
  });

  /// O placar atual: quem já está em outro time aparece como "Já em …".
  final BookingResult result;
  final List<ResultPlayer> candidates;
  final BookingResultFormation formation;

  /// `null` = time novo.
  final ResultTeam? editing;

  @override
  ConsumerState<BookingResultTeamPage> createState() =>
      _BookingResultTeamPageState();
}

class _BookingResultTeamPageState extends ConsumerState<BookingResultTeamPage> {
  late BookingResultFormation _formation = widget.formation;
  late final List<ResultPlayer> _selected = [...?widget.editing?.players];
  late String? _customName = widget.editing?.customName;
  final List<ResultPlayer> _guests = [];
  final _queryController = TextEditingController();
  Timer? _debounce;
  String _search = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _queryController.dispose();
    super.dispose();
  }

  String get _query => _queryController.text.trim();

  void _onQueryChanged(String _) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _search = _query);
    });
  }

  bool get _full => _selected.length >= _formation.size;

  void _toggle(ResultPlayer player) {
    setState(() {
      if (!_selected.remove(player) && !_full) _selected.add(player);
    });
  }

  void _setFormation(BookingResultFormation f) {
    setState(() {
      _formation = f;
      if (_selected.length > f.size)
        _selected.removeRange(f.size, _selected.length);
    });
  }

  void _addGuest() {
    final name = _query;
    if (name.isEmpty) return;
    final guest = ResultPlayer(
      id: 'guest:${DateTime.now().microsecondsSinceEpoch}',
      name: name,
    );
    setState(() {
      _guests.add(guest);
      if (!_full) _selected.add(guest);
      _queryController.clear();
      _search = '';
    });
  }

  Future<void> _rename() async {
    final current = _customName?.trim() ?? '';
    final name = await showDialog<String>(
      context: context,
      builder: (_) => _RenameDialog(
        initial: current.isNotEmpty ? current : resultTeamAutoName(_selected),
      ),
    );
    if (name != null && mounted) setState(() => _customName = name.trim());
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final label = _formation.label.toLowerCase();
    final title = widget.editing == null ? 'Adicionar $label' : 'Editar time';
    final query = _query;
    final local = [
      for (final p in [...widget.candidates, ..._guests])
        if (query.isEmpty ||
            normalizeSearchTerm(p.name).contains(normalizeSearchTerm(query)))
          p,
    ];
    final remote = isPartnerQueryLongEnough(_search)
        ? ref.watch(bookingResultPlayerSearchProvider(_search))
        : const AsyncValue<List<ResultPlayer>>.data([]);
    final list = [
      ...local,
      for (final p in remote.valueOrNull ?? const <ResultPlayer>[])
        if (!local.contains(p)) p,
    ];
    final customName = _customName?.trim() ?? '';
    final teamName =
        customName.isNotEmpty ? customName : resultTeamAutoName(_selected);
    final missing = _formation.size - _selected.length;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          title,
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
              key: const Key('booking-result-team-done'),
              onPressed: _full
                  ? () => Navigator.of(context).pop(
                        ResultTeamDraft(
                          players: List.of(_selected),
                          customName: customName.isEmpty ? null : customName,
                        ),
                      )
                  : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: const Color(0xFF0A0A0A),
                disabledBackgroundColor: colors.onSurface.withValues(
                  alpha: 0.08,
                ),
                disabledForegroundColor: colors.onSurface.withValues(
                  alpha: 0.45,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                textStyle: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              child: Text(
                !_full
                    ? 'Escolha mais $missing'
                    : widget.editing == null
                        ? 'Adicionar $label'
                        : 'Salvar time',
              ),
            ),
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.only(top: 4, bottom: 16),
        children: [
          const BookingStorySectionLabel('Formação'),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
            child:
                _FormationPicker(value: _formation, onChanged: _setFormation),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: colors.surfaceCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: _full
                      ? AppColors.brand.withValues(alpha: 0.35)
                      : colors.onSurface.withValues(alpha: 0.08),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (var k = 0; k < _formation.size; k++)
                        k < _selected.length
                            ? _Slot.player(
                                player: _selected[k],
                                onTap: () => _toggle(_selected[k]),
                              )
                            : _Slot.empty(number: k + 1),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Divider(
                    height: 1,
                    color: colors.onSurface.withValues(alpha: 0.06),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        'NOME',
                        style: AppTypography.mono(
                          fontSize: 10,
                          letterSpacing: 1.2,
                          color: colors.onSurface.withValues(alpha: 0.55),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          teamName.isEmpty ? 'Escolha os jogadores' : teamName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                            color: teamName.isEmpty
                                ? colors.onSurface.withValues(alpha: 0.40)
                                : colors.onSurface,
                          ),
                        ),
                      ),
                      TextButton(
                        key: const Key('booking-result-team-rename'),
                        onPressed: _selected.isEmpty ? null : _rename,
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.brand,
                          minimumSize: const Size(0, 32),
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                        ),
                        child: const Text('Renomear'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: TextField(
              key: const Key('booking-result-team-search'),
              controller: _queryController,
              onChanged: _onQueryChanged,
              onSubmitted: (_) => _addGuest(),
              textCapitalization: TextCapitalization.words,
              style: AppTypography.soraRegular(
                fontSize: 13.5,
                fontWeight: FontWeight.w500,
                color: colors.onSurface,
              ),
              decoration: InputDecoration(
                hintText: 'Buscar atleta ou digitar um nome',
                hintStyle: AppTypography.soraRegular(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurface.withValues(alpha: 0.45),
                ),
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
                isDense: true,
                filled: true,
                fillColor: colors.onSurface.withValues(alpha: 0.03),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                    color: colors.onSurface.withValues(alpha: 0.08),
                  ),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                    color: colors.onSurface.withValues(alpha: 0.08),
                  ),
                ),
              ),
            ),
          ),
          if (query.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
              child: _GuestTile(name: query, onTap: _addGuest),
            ),
          BookingStorySectionLabel(query.isEmpty ? 'Da reserva' : 'Resultados'),
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
          if (list.isEmpty && !remote.isLoading)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                query.isEmpty
                    ? 'Busque um atleta pelo nome ou digite o nome de quem '
                        'não tem conta.'
                    : isPartnerQueryLongEnough(query)
                        ? 'Ninguém com esse nome. Adicione como avulso.'
                        : 'Digite pelo menos 3 letras para buscar no app.',
                style: AppTypography.soraRegular(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurface.withValues(alpha: 0.55),
                ),
              ),
            ),
          for (final (k, p) in list.indexed)
            _PlayerRow(
              key: Key('booking-result-player-${p.id}'),
              player: p,
              first: k == 0,
              selected: _selected.contains(p),
              takenBy: _takenBy(p),
              blocked: !_selected.contains(p) && _full,
              inBooking: widget.candidates.contains(p),
              onTap: () => _toggle(p),
            ),
        ],
      ),
    );
  }

  /// Nome do OUTRO time em que o jogador já está (o próprio time em edição não
  /// conta).
  String? _takenBy(ResultPlayer player) {
    final team = widget.result.teamOfPlayer(player.id);
    if (team == null || team.id == widget.editing?.id) return null;
    return team.name;
  }
}

/// O diálogo é dono do controller: descartar no fim do `showDialog` quebrava
/// a animação de saída, que ainda pinta o campo.
class _RenameDialog extends StatefulWidget {
  const _RenameDialog({required this.initial});

  final String initial;

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
      title: const Text('Nome do time'),
      content: TextField(
        key: const Key('booking-result-team-name-field'),
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
          onPressed: () => Navigator.of(context).pop(_controller.text),
          child: const Text('Salvar'),
        ),
      ],
    );
  }
}

class _FormationPicker extends StatelessWidget {
  const _FormationPicker({required this.value, required this.onChanged});

  final BookingResultFormation value;
  final ValueChanged<BookingResultFormation> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.onSurface.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          for (final f in BookingResultFormation.values)
            Expanded(
              child: GestureDetector(
                key: Key('booking-result-formation-${f.name}'),
                behavior: HitTestBehavior.opaque,
                onTap: () => onChanged(f),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 140),
                  height: 42,
                  decoration: BoxDecoration(
                    color: f == value ? AppColors.brand : Colors.transparent,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // "Quarteto" em 320 pt: encolhe em vez de quebrar.
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          f.label,
                          maxLines: 1,
                          style: AppTypography.soraRegular(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: f == value
                                ? const Color(0xFF0A0A0A)
                                : colors.onSurface.withValues(alpha: 0.70),
                          ),
                        ),
                      ),
                      Text(
                        '${f.size}×${f.size}',
                        style: AppTypography.mono(
                          fontSize: 9,
                          color: f == value
                              ? const Color(0xB30A0A0A)
                              : colors.onSurface.withValues(alpha: 0.50),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Slot extends StatelessWidget {
  const _Slot.player({required ResultPlayer this.player, required this.onTap})
      : number = 0;

  const _Slot.empty({required this.number})
      : player = null,
        onTap = null;

  final ResultPlayer? player;
  final int number;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = player;
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 52,
        child: Column(
          children: [
            if (p != null)
              Container(
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(color: AppColors.brand, spreadRadius: 2)
                  ],
                ),
                child: BookingStoryAvatar(
                  person: p.toStoryPerson(),
                  hue: resultPlayerHue(p.id),
                  borderColor: colors.surfaceCard,
                  size: 44,
                ),
              )
            else
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: colors.onSurface.withValues(alpha: 0.22),
                    width: 1.5,
                  ),
                ),
                child: Text(
                  '$number',
                  style: AppTypography.mono(
                    fontSize: 12,
                    color: colors.onSurface.withValues(alpha: 0.40),
                  ),
                ),
              ),
            const SizedBox(height: 4),
            Text(
              p?.firstName ?? 'Vaga',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: p == null
                    ? colors.onSurface.withValues(alpha: 0.40)
                    : colors.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GuestTile extends StatelessWidget {
  const _GuestTile({required this.name, required this.onTap});

  final String name;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: AppColors.brand.withValues(alpha: 0.45),
          width: 1.5,
        ),
      ),
      child: InkWell(
        key: const Key('booking-result-add-guest'),
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.brand.withValues(alpha: 0.12),
                ),
                child: const Icon(
                  Icons.add_rounded,
                  size: 18,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Adicionar "$name" como avulso',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Sem conta nexaGO · só aparece na arte',
                      style: AppTypography.soraRegular(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w500,
                        color: colors.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlayerRow extends StatelessWidget {
  const _PlayerRow({
    super.key,
    required this.player,
    required this.first,
    required this.selected,
    required this.takenBy,
    required this.blocked,
    required this.inBooking,
    required this.onTap,
  });

  final ResultPlayer player;
  final bool first;
  final bool selected;
  final String? takenBy;
  final bool blocked;
  final bool inBooking;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final disabled = takenBy != null || blocked;
    final subtitle = takenBy != null
        ? 'Já em $takenBy'
        : player.isGuest
            ? 'Avulso'
            : inBooking
                ? 'Na reserva'
                : 'Atleta nexaGO';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          if (!first)
            Divider(height: 1, color: colors.onSurface.withValues(alpha: 0.06)),
          Opacity(
            opacity: disabled ? 0.45 : 1,
            child: InkWell(
              onTap: takenBy != null || blocked ? null : onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(
                  children: [
                    BookingStoryAvatar(
                      person: player.toStoryPerson(),
                      hue: resultPlayerHue(player.id),
                      borderColor: colors.canvas,
                      size: 38,
                    ),
                    const SizedBox(width: 12),
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
                          const SizedBox(height: 2),
                          Text(
                            subtitle,
                            style: AppTypography.soraRegular(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w500,
                              color: colors.onSurface.withValues(alpha: 0.55),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (takenBy == null)
                      Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: selected ? AppColors.brand : null,
                          border: selected
                              ? null
                              : Border.all(
                                  color: colors.onSurface.withValues(
                                    alpha: 0.22,
                                  ),
                                  width: 1.5,
                                ),
                        ),
                        child: selected
                            ? const Icon(
                                Icons.check_rounded,
                                size: 15,
                                color: Color(0xFF0A0A0A),
                              )
                            : null,
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
