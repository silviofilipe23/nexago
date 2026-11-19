import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/profiles/app_user_profile.dart';
import '../../../../../core/profiles/users_repository.dart';
import '../../../../../core/search/search_keywords.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/validation/cpf_cnpj.dart';
import '../../../domain/booking_split.dart';
import '../booking_pix/booking_pix_cpf_field.dart';

/// Abre a folha "Dividir com os jogadores". Devolve a divisão escolhida, um
/// rascunho vazio quando o atleta desiste de dividir, ou `null` se fechou.
Future<BookingSplitDraft?> showBookingSplitSheet(
  BuildContext context, {
  required double totalReais,
  required String selfUid,
  required String selfName,
  String? selfPhotoUrl,
  bool needsOwnCpf = false,
  BookingSplitDraft? initial,
}) {
  return showModalBottomSheet<BookingSplitDraft>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceRaised,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.92,
    ),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => BookingSplitSheet(
      totalReais: totalReais,
      selfUid: selfUid,
      selfName: selfName,
      selfPhotoUrl: selfPhotoUrl,
      needsOwnCpf: needsOwnCpf,
      initial: initial,
    ),
  );
}

/// Escolher os atletas, dividir igual ou ajustar valores e conferir a soma.
/// Mesmo comportamento do "Dividir com amigos" do portal do atleta: "Você"
/// entra por padrão, incluir ou tirar alguém refaz a divisão igual, e o
/// botão só libera com alguém além de você e a soma batendo.
class BookingSplitSheet extends ConsumerStatefulWidget {
  const BookingSplitSheet({
    super.key,
    required this.totalReais,
    required this.selfUid,
    required this.selfName,
    this.selfPhotoUrl,
    this.needsOwnCpf = false,
    this.initial,
  });

  final double totalReais;
  final String selfUid;
  final String selfName;
  final String? selfPhotoUrl;

  /// "Você" ainda não tem CPF salvo: a sua fatia também vira um Pix, que
  /// exige CPF — a folha pede o número.
  final bool needsOwnCpf;
  final BookingSplitDraft? initial;

  @override
  ConsumerState<BookingSplitSheet> createState() => _BookingSplitSheetState();
}

class _BookingSplitSheetState extends ConsumerState<BookingSplitSheet> {
  final _searchController = TextEditingController();
  final _cpfController = TextEditingController();
  final Map<String, TextEditingController> _amountControllers = {};
  Timer? _debounce;
  List<AppUserProfile> _results = const [];
  bool _searching = false;
  String? _searchError;
  String? _limitMessage;
  late List<BookingSplitParticipant> _participants;
  bool _evenly = true;

  static const _searchDebounce = Duration(milliseconds: 350);

  @override
  void initState() {
    super.initState();
    final initial = widget.initial;
    if (initial != null && !initial.isEmpty) {
      _participants = List.of(initial.participants);
      _evenly = initial.evenly;
      _cpfController.text = initial.ownCpf ?? '';
      if (_evenly) _redistribute();
    } else {
      _participants = [
        BookingSplitParticipant(
          athleteId: widget.selfUid,
          name: widget.selfName,
          photoUrl: widget.selfPhotoUrl,
          isSelf: true,
          amountReais: widget.totalReais,
        ),
      ];
    }
    _syncControllers();
    _cpfController.addListener(_refresh);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _cpfController.dispose();
    for (final c in _amountControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  BookingSplitDraft get _draft => BookingSplitDraft(
        participants: _participants,
        evenly: _evenly,
        ownCpf:
            _askCpf ? CpfCnpjValidator.digitsOnly(_cpfController.text) : null,
      );

  bool get _askCpf => widget.needsOwnCpf && _participants.any((p) => p.isSelf);

  bool get _cpfOk => !_askCpf || CpfCnpjValidator.isValid(_cpfController.text);

  /// Divide igual entre quem está na lista e escreve os valores nos campos.
  void _redistribute() {
    final amounts = splitEvenlyReais(widget.totalReais, _participants.length);
    _participants = [
      for (var i = 0; i < _participants.length; i++)
        _participants[i].copyWith(amountReais: amounts[i]),
    ];
  }

  /// Um campo por pessoa, com o valor atual (some quem saiu da lista).
  void _syncControllers() {
    final ids = _participants.map((p) => p.athleteId).toSet();
    for (final id in _amountControllers.keys.toList()) {
      if (!ids.contains(id)) _amountControllers.remove(id)?.dispose();
    }
    for (final p in _participants) {
      final text = formatReaisInput(p.amountReais);
      final controller = _amountControllers.putIfAbsent(
        p.athleteId,
        () => TextEditingController(text: text),
      );
      if (parseReaisInput(controller.text) != p.amountReais) {
        controller.text = text;
      }
    }
  }

  void _divideEqually() {
    HapticFeedback.selectionClick();
    setState(() {
      _evenly = true;
      _redistribute();
      _syncControllers();
    });
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    setState(() => _searchError = null);
    _debounce = Timer(_searchDebounce, () => _search(value));
  }

  Future<void> _search(String term) async {
    if (!isSearchTermLongEnough(term)) {
      if (mounted) setState(() => _results = const []);
      return;
    }
    setState(() => _searching = true);
    try {
      final users = await ref
          .read(usersRepositoryProvider)
          .searchAthletesByKeywords(term, max: 10);
      if (!mounted || _searchController.text != term) return;
      setState(() {
        _results = users;
        _searching = false;
      });
    } on Exception {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _searchError = 'Não foi possível buscar agora. Tente novamente.';
      });
    }
  }

  void _add(AppUserProfile user) {
    if (_participants.any((p) => p.athleteId == user.uid)) return;
    if (_participants.length >= kBookingSplitMaxShares) {
      setState(() {
        _limitMessage = 'A divisão aceita no máximo $kBookingSplitMaxShares '
            'pessoas. Tire alguém para incluir outra.';
      });
      return;
    }
    HapticFeedback.selectionClick();
    setState(() {
      _participants = [
        ..._participants,
        BookingSplitParticipant(
          athleteId: user.uid,
          name: bookingSplitNameOf(user),
          photoUrl: user.profilePhotoUrl,
          amountReais: 0,
        ),
      ];
      _evenly = true;
      _redistribute();
      _syncControllers();
      _limitMessage = null;
      _results = const [];
      _searchController.clear();
    });
  }

  void _remove(String athleteId) {
    setState(() {
      _participants =
          _participants.where((p) => p.athleteId != athleteId).toList();
      _evenly = true;
      _redistribute();
      _syncControllers();
      _limitMessage = null;
    });
  }

  void _onAmountChanged(String athleteId, String raw) {
    final value = parseReaisInput(raw);
    setState(() {
      _evenly = false;
      _participants = [
        for (final p in _participants)
          p.athleteId == athleteId ? p.copyWith(amountReais: value) : p,
      ];
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final draft = _draft;
    final sumOk = draft.sumMatches(widget.totalReais);
    final canSubmit = draft.canSubmit(widget.totalReais) && _cpfOk;
    final taken = {widget.selfUid, ..._participants.map((p) => p.athleteId)};
    final results = _results.where((u) => !taken.contains(u.uid)).toList();
    final term = _searchController.text;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: colors.onSurfaceMuted.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
              children: [
                Text(
                  'Dividir com os jogadores',
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Cada um recebe um Pix com a sua parte. Quem não pagar até '
                  '2h antes do jogo tem a parte somada ao que você paga na arena.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colors.onSurfaceMuted,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  key: const Key('booking-split-search'),
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Buscar atleta por nome ou apelido',
                    prefixIcon: const Icon(Icons.search_rounded),
                    filled: true,
                    fillColor: colors.surfaceCard,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
                if (_searching) ...[
                  const SizedBox(height: 6),
                  const LinearProgressIndicator(minHeight: 2),
                ],
                if (_searchError != null)
                  _Hint(text: _searchError!, isError: true)
                else if (isSearchTermLongEnough(term) &&
                    !_searching &&
                    _results.isNotEmpty &&
                    results.isEmpty)
                  const _Hint(text: 'Quem apareceu já está na divisão.')
                else if (isSearchTermLongEnough(term) &&
                    !_searching &&
                    _results.isEmpty &&
                    _debounce?.isActive != true)
                  _Hint(text: 'Nenhum atleta encontrado com "$term".'),
                for (final user in results)
                  _SearchResultRow(
                    user: user,
                    onAdd: () => _add(user),
                  ),
                if (_limitMessage != null)
                  _Hint(text: _limitMessage!, isError: true),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'QUEM PAGA',
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.8,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _participants.isEmpty ? null : _divideEqually,
                      icon: const Icon(Icons.balance_rounded, size: 18),
                      label: const Text('Dividir igual'),
                    ),
                  ],
                ),
                if (_participants.isEmpty)
                  const _Hint(text: 'Busque um atleta acima para começar.'),
                for (final p in _participants)
                  _ParticipantRow(
                    participant: p,
                    controller: _amountControllers[p.athleteId]!,
                    onChanged: (raw) => _onAmountChanged(p.athleteId, raw),
                    onRemove: () => _remove(p.athleteId),
                  ),
                if (_participants.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _SumRow(
                    sumReais: draft.sumReais,
                    totalReais: widget.totalReais,
                    ok: sumOk,
                  ),
                ],
                if (_participants.isNotEmpty && draft.guestCount == 0)
                  const _Hint(
                    text: 'Inclua pelo menos um jogador além de você.',
                  ),
                if (_askCpf) ...[
                  const SizedBox(height: 18),
                  BookingPixCpfField(
                    controller: _cpfController,
                    errorText: CpfCnpjValidator.validationMessage(
                      _cpfController.text,
                    ),
                    helperText: 'A sua parte também vira um Pix, que exige '
                        'CPF. Fica salvo no seu perfil.',
                  ),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FilledButton(
                    key: const Key('booking-split-submit'),
                    onPressed: canSubmit
                        ? () => Navigator.of(context).pop(draft)
                        : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      minimumSize: const Size.fromHeight(52),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      'Usar esta divisão',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  if (widget.initial != null && !widget.initial!.isEmpty)
                    TextButton(
                      onPressed: () => Navigator.of(context)
                          .pop(BookingSplitDraft(participants: const [])),
                      child: const Text('Não dividir'),
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

/// Apelido, senão o nome completo — o mesmo da folha de convite.
String bookingSplitNameOf(AppUserProfile user) {
  final nick = user.nickname?.trim() ?? '';
  if (nick.isNotEmpty) return nick;
  final full = user.fullName?.trim() ?? '';
  return full.isNotEmpty ? full : 'Atleta';
}

class _Hint extends StatelessWidget {
  const _Hint({required this.text, this.isError = false});

  final String text;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text(
        text,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: isError ? colors.live : colors.onSurfaceMuted,
              height: 1.35,
            ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, this.photoUrl});

  final String name;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final url = photoUrl?.trim() ?? '';
    final initials = CircleAvatar(
      radius: 18,
      backgroundColor: colors.surfaceCard,
      child: Text(
        initialsFromDisplayName(name),
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
      ),
    );
    if (url.isEmpty) return initials;
    // Foto que não carrega (link velho, sem rede) cai nas iniciais.
    return ClipOval(
      child: Image.network(
        url,
        width: 36,
        height: 36,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => initials,
      ),
    );
  }
}

class _SearchResultRow extends StatelessWidget {
  const _SearchResultRow({required this.user, required this.onAdd});

  final AppUserProfile user;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final name = bookingSplitNameOf(user);
    final city = [user.city, user.state]
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .join('/');
    return InkWell(
      onTap: onAdd,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            _Avatar(name: name, photoUrl: user.profilePhotoUrl),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                  ),
                  if (city.isNotEmpty)
                    Text(
                      city,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: colors.onSurfaceMuted,
                          ),
                    ),
                ],
              ),
            ),
            Icon(Icons.add_circle_outline_rounded, color: colors.brandText),
          ],
        ),
      ),
    );
  }
}

class _ParticipantRow extends StatelessWidget {
  const _ParticipantRow({
    required this.participant,
    required this.controller,
    required this.onChanged,
    required this.onRemove,
  });

  final BookingSplitParticipant participant;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final name = participant.isSelf ? 'Você' : participant.name;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          _Avatar(name: participant.name, photoUrl: participant.photoUrl),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
          ),
          SizedBox(
            width: 112,
            child: TextField(
              key: Key('booking-split-amount-${participant.athleteId}'),
              controller: controller,
              onChanged: onChanged,
              textAlign: TextAlign.right,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9,.]')),
              ],
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
              decoration: InputDecoration(
                isDense: true,
                prefixText: 'R\$ ',
                filled: true,
                fillColor: colors.surfaceCard,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Tirar da divisão',
            onPressed: onRemove,
            icon: Icon(Icons.close_rounded, color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

class _SumRow extends StatelessWidget {
  const _SumRow({
    required this.sumReais,
    required this.totalReais,
    required this.ok,
  });

  final double sumReais;
  final double totalReais;
  final bool ok;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final tone = colors.readableTone(ok ? AppColors.win : AppColors.live);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  ok ? Icons.check_circle_rounded : Icons.error_outline_rounded,
                  size: 18,
                  color: tone,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Soma',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Text(
                  '${formatBRL(sumReais)} de ${formatBRL(totalReais)}',
                  key: const Key('booking-split-sum'),
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: tone,
                  ),
                ),
              ],
            ),
            if (!ok) ...[
              const SizedBox(height: 4),
              Text(
                'A soma das partes precisa ser igual ao valor da reserva.',
                style: theme.textTheme.bodySmall?.copyWith(color: tone),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
