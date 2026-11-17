import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/profiles/app_user_profile.dart';
import '../../../core/profiles/users_repository.dart';
import '../../../core/search/search_keywords.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arenas/domain/arena_slot.dart';
import '../domain/arena_manual_booking.dart';
import '../domain/arena_schedule_providers.dart';
import '../domain/manual_booking_slot_chain.dart';

/// Tela "Criar reserva" (aberta do detalhe do horário e da reserva cancelada):
/// reserva de balcão para um atleta cadastrado (com banco de horas, se for
/// mensalista) ou para um cliente sem conta, só pelo nome. Grava pela callable
/// `createArenaManualBooking` — a mesma do portal da arena.
///
/// Era uma bottom sheet; com o select de horário e o teclado, ela subia até a
/// área do relógio/notch. Tela cheia no navegador raiz respeita a área segura
/// e cobre o shell (sem barra de abas por baixo).
///
/// Quando os horários seguintes da mesma quadra estão livres, o gestor junta
/// vários numa reserva só (ex.: 18h–21h): vira um único intervalo
/// `startTime → endTime`, que o servidor trava hora a hora.
class ArenaManualBookingPage extends ConsumerStatefulWidget {
  const ArenaManualBookingPage({
    super.key,
    required this.slot,
    required this.courtName,
  });

  final ArenaSlot slot;
  final String courtName;

  /// Abre a tela; `true` quando a reserva foi criada.
  static Future<bool> open(
    BuildContext context, {
    required ArenaSlot slot,
    required String courtName,
  }) async {
    final result = await Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<bool>(
        fullscreenDialog: true,
        // Messenger próprio, acima da tela: os avisos dela (valor inválido,
        // recusa do servidor) aparecem nela, não na página de baixo.
        builder: (_) => ScaffoldMessenger(
          child: ArenaManualBookingPage(slot: slot, courtName: courtName),
        ),
      ),
    );
    return result == true;
  }

  @override
  ConsumerState<ArenaManualBookingPage> createState() =>
      _ArenaManualBookingPageState();
}

/// Nome de exibição do atleta: apelido, senão nome completo.
String manualBookingAthleteName(AppUserProfile user) {
  final nickname = user.nickname?.trim() ?? '';
  final clean =
      nickname.startsWith('@') ? nickname.substring(1).trim() : nickname;
  if (clean.isNotEmpty) return clean;
  final full = user.fullName?.trim() ?? '';
  return full.isNotEmpty ? full : 'Atleta';
}

class _ArenaManualBookingPageState
    extends ConsumerState<ArenaManualBookingPage> {
  static const _maxResults = 5;

  final _searchController = TextEditingController();
  final _nameController = TextEditingController();
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  Timer? _debounce;
  List<AppUserProfile> _results = const [];
  bool _searching = false;
  bool _searchFailed = false;

  AppUserProfile? _athlete;
  ArenaMemberHours? _memberHours;
  bool _useMemberHours = true;

  /// Só a cotação mais recente vale (troca de atleta no meio do caminho).
  int _quoteSeq = 0;
  bool _amountEdited = false;
  bool _busy = false;

  /// Quantos horários seguidos (a partir do tocado) entram na reserva.
  int _slotCount = 1;

  @override
  void initState() {
    super.initState();
    final price = widget.slot.priceReais;
    if (price != null && price > 0) {
      _amountController.text = price.toStringAsFixed(2);
    }
    _loadQuote();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _nameController.dispose();
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  /// Horários livres seguidos a partir do tocado (ele incluso), ao vivo.
  List<ArenaSlot> _readChain() => consecutiveAvailableSlots(
        widget.slot,
        ref.read(arenaManualBookingDaySlotsProvider(widget.slot.dateKey)),
      );

  /// Fim da reserva: o do último horário escolhido que segue livre.
  String _endTimeOf(List<ArenaSlot> chain) =>
      chain[_slotCount.clamp(1, chain.length) - 1].endTime;

  /// Trocar a duração refaz a sugestão de valor: o de 1h não vale para 3h.
  void _selectSlotCount(int count, List<ArenaSlot> chain) {
    if (count == _slotCount) return;
    final suggested = sumSlotPrices(chain.take(count));
    setState(() {
      _slotCount = count;
      _amountEdited = false;
      _amountController.text = suggested?.toStringAsFixed(2) ?? '';
    });
    _loadQuote(athleteId: _athlete?.uid);
  }

  /// Preço do servidor (quadra + promoções) substitui o do slot enquanto o
  /// gestor não mexeu no campo; com atleta, traz o banco de horas dele.
  /// Falha aqui não bloqueia: o gestor digita e a reserva sai avulsa.
  Future<void> _loadQuote({String? athleteId}) async {
    final seq = ++_quoteSeq;
    final slot = widget.slot;
    try {
      final quote = await ref.read(arenaManualBookingServiceProvider).quote(
            arenaId: slot.arenaId,
            courtId: slot.courtId,
            dateKey: slot.dateKey,
            startTime: slot.startTime,
            endTime: _endTimeOf(_readChain()),
            athleteId: athleteId,
          );
      if (!mounted || seq != _quoteSeq) return;
      setState(() {
        final amount = quote.amountReais;
        if (!_amountEdited && amount != null && amount > 0) {
          _amountController.text = amount.toStringAsFixed(2);
        }
        _memberHours = athleteId != null ? quote.memberHours : null;
        _useMemberHours = true;
      });
    } catch (_) {
      // Cotação é sugestão; o valor do slot (ou o digitado) segue valendo.
    }
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(value));
  }

  Future<void> _search(String term) async {
    if (!isSearchTermLongEnough(term)) {
      if (mounted) setState(() => _results = const []);
      return;
    }
    setState(() {
      _searching = true;
      _searchFailed = false;
    });
    try {
      final users = await ref
          .read(usersRepositoryProvider)
          .searchAthletesByKeywords(term, max: _maxResults);
      if (!mounted || _searchController.text != term) return;
      setState(() {
        _results = users.take(_maxResults).toList(growable: false);
        _searching = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _searchFailed = true;
      });
    }
  }

  void _selectAthlete(AppUserProfile user) {
    _debounce?.cancel();
    FocusScope.of(context).unfocus();
    setState(() {
      _athlete = user;
      _results = const [];
      _memberHours = null;
    });
    _loadQuote(athleteId: user.uid);
  }

  void _clearAthlete() {
    _quoteSeq++; // descarta a cotação do atleta anterior se ainda estiver vindo
    _searchController.clear();
    setState(() {
      _athlete = null;
      _memberHours = null;
      _results = const [];
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final dateLabel = DateFormat(
      'EEE, d \'de\' MMMM',
      'pt_BR',
    ).format(widget.slot.date).toUpperCase().replaceAll('.', '');
    final chain = consecutiveAvailableSlots(
      widget.slot,
      ref.watch(arenaManualBookingDaySlotsProvider(widget.slot.dateKey)),
    );
    final endTime = _endTimeOf(chain);
    final timeRange = '${widget.slot.startTime} — $endTime';

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        // Toque fora dos campos fecha o teclado (os campos ganham o toque).
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => FocusScope.of(context).unfocus(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _ManualBookingHeader(
                eyebrow: '$dateLabel · ${widget.courtName.toUpperCase()}',
                onClose: _busy ? null : _cancel,
              ),
              Expanded(
                // Formulário curto: tudo construído de uma vez (ListView
                // descartaria campos fora da tela e o foco junto).
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        timeRange,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Reserva de balcão: o horário sai da agenda pública e o '
                        'pagamento é acertado direto com a arena.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: colors.onSurfaceMuted,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 20),
                      _buildEndTimeSelect(context, chain),
                      const SizedBox(height: 20),
                      ..._buildCustomer(context),
                      const SizedBox(height: 20),
                      _label(context, 'VALOR (R\$)'),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _amountController,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        onChanged: (_) => setState(() => _amountEdited = true),
                        style: TextStyle(color: colors.onSurface),
                        decoration: _decoration(context, hint: 'Ex: 120,00'),
                      ),
                      if (_memberHours != null) ...[
                        const SizedBox(height: 12),
                        _buildMemberHours(context, _memberHours!, endTime),
                      ],
                      const SizedBox(height: 20),
                      _label(context, 'NOTA (OPCIONAL)'),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _noteController,
                        maxLines: 2,
                        style: TextStyle(color: colors.onSurface),
                        decoration: _decoration(
                          context,
                          hint: 'Ex: paga no balcão',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              _buildActions(context),
            ],
          ),
        ),
      ),
    );
  }

  /// Cancelar + Criar reserva fixos no rodapé (sobem junto com o teclado).
  Widget _buildActions(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(
          top: BorderSide(
            color: colors.onSurfaceMuted.withValues(alpha: 0.15),
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: _busy ? null : _cancel,
              style: OutlinedButton.styleFrom(
                foregroundColor: colors.onSurface,
                side: BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.35),
                ),
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('Cancelar'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: FilledButton(
              onPressed: _busy ? null : _confirm,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _busy
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text(
                      'Criar reserva',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  void _cancel() => Navigator.pop(context, false);

  List<Widget> _buildCustomer(BuildContext context) {
    final colors = context.themeColors;
    final athlete = _athlete;
    if (athlete != null) {
      return [
        _label(context, 'ATLETA'),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              _AthleteAvatar(user: athlete),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  manualBookingAthleteName(athlete),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              TextButton(
                onPressed: _busy ? null : _clearAthlete,
                child: const Text('Trocar'),
              ),
            ],
          ),
        ),
      ];
    }

    final term = _searchController.text;
    final String? hint;
    if (_searchFailed) {
      hint = 'Não foi possível buscar agora. Tente de novo.';
    } else if (isSearchTermLongEnough(term) &&
        !_searching &&
        _results.isEmpty) {
      hint = 'Nenhum atleta encontrado. Use o nome do cliente abaixo.';
    } else {
      hint = null;
    }

    return [
      _label(context, 'ATLETA CADASTRADO'),
      const SizedBox(height: 8),
      TextField(
        controller: _searchController,
        onChanged: _onSearchChanged,
        style: TextStyle(color: colors.onSurface),
        decoration: _decoration(
          context,
          hint: 'Buscar por nome ou apelido',
        ).copyWith(prefixIcon: const Icon(Icons.search_rounded)),
      ),
      if (_searching) const LinearProgressIndicator(minHeight: 2),
      for (final user in _results)
        ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 4),
          leading: _AthleteAvatar(user: user),
          title: Text(manualBookingAthleteName(user)),
          subtitle: (user.fullName?.trim().isNotEmpty ?? false) &&
                  user.fullName!.trim() != manualBookingAthleteName(user)
              ? Text(user.fullName!.trim())
              : null,
          onTap: () => _selectAthlete(user),
        ),
      if (hint != null) ...[
        const SizedBox(height: 8),
        Text(
          hint,
          style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
        ),
      ],
      const SizedBox(height: 16),
      _label(context, 'OU NOME DO CLIENTE (SEM CONTA)'),
      const SizedBox(height: 8),
      TextField(
        controller: _nameController,
        textCapitalization: TextCapitalization.words,
        style: TextStyle(color: colors.onSurface),
        decoration: _decoration(context, hint: 'Nome de quem vai jogar'),
      ),
    ];
  }

  /// Até que horas vai a reserva: um item por horário livre seguido, sem
  /// teto (a sequência acaba no primeiro horário ocupado ou na meia-noite).
  Widget _buildEndTimeSelect(BuildContext context, List<ArenaSlot> chain) {
    final colors = context.themeColors;
    final selected = _slotCount.clamp(1, chain.length);
    final canExtend = chain.length > 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _label(context, 'ATÉ QUE HORAS'),
        const SizedBox(height: 8),
        DropdownButtonFormField<int>(
          // A seleção pode encolher sozinha (horário ocupado ao vivo): a chave
          // recria o campo com o valor certo.
          key: ValueKey('manual-booking-end-$selected-${chain.length}'),
          initialValue: selected,
          isExpanded: true,
          dropdownColor: colors.surfaceRaised,
          style: TextStyle(color: colors.onSurface, fontSize: 16),
          decoration: _decoration(context, hint: 'Fim da reserva'),
          items: [
            for (var i = 1; i <= chain.length; i++)
              DropdownMenuItem(
                value: i,
                child: Text(_endTimeLabel(chain[i - 1].endTime)),
              ),
          ],
          onChanged: _busy || !canExtend
              ? null
              : (count) {
                  if (count != null) _selectSlotCount(count, chain);
                },
        ),
        const SizedBox(height: 6),
        Text(
          canExtend
              ? 'Junte os próximos horários livres desta quadra numa reserva só.'
              : 'Sem horário livre logo em seguida nesta quadra.',
          style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
        ),
      ],
    );
  }

  /// "22:00 · 3h".
  String _endTimeLabel(String endTime) {
    final minutes = slotSpanMinutes(widget.slot.startTime, endTime);
    return '$endTime · ${formatMemberMinutes(minutes)}';
  }

  Widget _buildMemberHours(
    BuildContext context,
    ArenaMemberHours mh,
    String endTime,
  ) {
    final colors = context.themeColors;
    final textStyle = TextStyle(
      fontSize: 13,
      height: 1.4,
      color: colors.onSurface,
    );
    final Widget body;
    if (mh.blocked) {
      body = Text(
        'Mensalista · ${mh.planName} com mensalidade atrasada: paga a reserva '
        'até quitar.',
        style: textStyle,
      );
    } else if (mh.coverMinutes > 0) {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CheckboxListTile(
            value: _useMemberHours,
            onChanged: (v) => setState(() => _useMemberHours = v ?? false),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            dense: true,
            title: Text(
              'Descontar do banco de horas · ${mh.planName}',
              style: textStyle.copyWith(fontWeight: FontWeight.w700),
            ),
            subtitle: Text(
              'Cobre ${formatMemberMinutes(mh.coverMinutes)} · restam '
              '${formatMemberMinutes(mh.availableMinutes)} de '
              '${formatMemberMinutes(mh.weeklyMinutes)} nesta semana',
              style: TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
            ),
          ),
          if (_useMemberHours)
            Text(
              'A cobrar: ${_memberChargeLabel(mh, endTime)}',
              style: textStyle,
            ),
        ],
      );
    } else {
      body = Text(
        'Mensalista · ${mh.planName}: as '
        '${formatMemberMinutes(mh.weeklyMinutes)} desta semana já foram '
        'usadas.',
        style: textStyle,
      );
    }
    // Material (não Container colorido): o CheckboxListTile pinta o toque no
    // Material mais próximo.
    return Material(
      color: AppColors.brand.withValues(alpha: 0.08),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Padding(padding: const EdgeInsets.all(12), child: body),
    );
  }

  String _memberChargeLabel(ArenaMemberHours mh, String endTime) {
    final amount = parseManualBookingAmount(_amountController.text);
    if (amount == null) return '—';
    final left = amountAfterMemberHours(
      amount,
      widget.slot.startTime,
      endTime,
      mh.coverMinutes,
    );
    if (left <= 0) return 'nada (coberta pelo plano)';
    return NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$').format(left);
  }

  Widget _label(BuildContext context, String text) {
    return Text(
      text,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
          ),
    );
  }

  InputDecoration _decoration(BuildContext context, {required String hint}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(
        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.7),
      ),
      filled: true,
      fillColor: context.themeColors.surfaceRaised,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
    );
  }

  Future<void> _confirm() async {
    final athlete = _athlete;
    final walkInName = _nameController.text.trim();
    if (athlete == null && walkInName.isEmpty) {
      showAppSnackBar(
        context,
        'Informe o atleta ou o nome do cliente.',
        isError: true,
      );
      return;
    }
    final amount = parseManualBookingAmount(_amountController.text);
    if (amount == null) {
      showAppSnackBar(
        context,
        'Informe um valor válido (0 se for cortesia).',
        isError: true,
      );
      return;
    }

    // Um dos horários escolhidos foi reservado com a folha aberta: não manda
    // um intervalo menor com o valor do maior.
    final chain = _readChain();
    if (_slotCount > chain.length) {
      setState(() => _slotCount = chain.length);
      showAppSnackBar(
        context,
        'Um dos horários escolhidos acabou de ser ocupado. Confira a duração '
        'e o valor.',
        isError: true,
      );
      return;
    }

    setState(() => _busy = true);
    try {
      final slot = widget.slot;
      await ref.read(arenaManualBookingServiceProvider).create(
            arenaId: slot.arenaId,
            courtId: slot.courtId,
            dateKey: slot.dateKey,
            startTime: slot.startTime,
            endTime: _endTimeOf(chain),
            amountReais: amount,
            athleteId: athlete?.uid,
            customerName: athlete != null
                ? manualBookingAthleteName(athlete)
                : walkInName,
            useMemberHours: athlete != null &&
                _useMemberHours &&
                (_memberHours?.canCover ?? false),
            note: _noteController.text,
          );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível criar a reserva',
          logReason: 'arena_manual_booking_create',
        ),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _AthleteAvatar extends StatelessWidget {
  const _AthleteAvatar({required this.user});

  final AppUserProfile user;

  @override
  Widget build(BuildContext context) {
    final photo = user.profilePhotoUrl?.trim() ?? '';
    final name = manualBookingAthleteName(user);
    return CircleAvatar(
      radius: 18,
      backgroundColor: AppColors.brand.withValues(alpha: 0.15),
      backgroundImage: photo.isNotEmpty ? NetworkImage(photo) : null,
      child: photo.isEmpty
          ? Text(
              name.substring(0, 1).toUpperCase(),
              style: const TextStyle(
                color: AppColors.brand,
                fontWeight: FontWeight.w800,
              ),
            )
          : null,
    );
  }
}

/// Topo da tela: fechar + data/quadra + título.
class _ManualBookingHeader extends StatelessWidget {
  const _ManualBookingHeader({required this.eyebrow, required this.onClose});

  final String eyebrow;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 20, 8),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Fechar',
            onPressed: onClose,
            icon: Icon(Icons.close_rounded, color: colors.onSurface),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  eyebrow,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: colors.onSurfaceMuted,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Criar reserva',
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
