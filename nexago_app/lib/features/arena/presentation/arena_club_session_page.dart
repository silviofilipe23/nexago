import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import '../../../core/search/search_keywords.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arenas/domain/arena_club_session.dart';
import '../data/arena_club_service.dart';
import '../domain/arena_club_admin_providers.dart';
import 'widgets/arena_async_state.dart';

/// Sessão do clubinho (gestor): participantes ao vivo com status,
/// adicionar/remover atleta pela mão do gestor e cancelamento da sessão
/// com estorno em massa automático.
class ArenaClubSessionPage extends ConsumerStatefulWidget {
  const ArenaClubSessionPage({super.key, required this.sessionId});

  final String sessionId;

  @override
  ConsumerState<ArenaClubSessionPage> createState() =>
      _ArenaClubSessionPageState();
}

class _ArenaClubSessionPageState extends ConsumerState<ArenaClubSessionPage> {
  bool _cancelling = false;

  /// Ids de participantes com remoção em andamento (desabilita o botão).
  final Set<String> _removing = <String>{};

  @override
  Widget build(BuildContext context) {
    final sessionAsync =
        ref.watch(arenaClubSessionDocProvider(widget.sessionId));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SessionHeader(
              eyebrow: sessionAsync.valueOrNull?.clubName.toUpperCase() ??
                  'GESTOR · CLUBINHO',
              title: 'Sessão',
              onBack: () => context.pop(),
            ),
            Expanded(
              child: sessionAsync.when(
                data: (session) {
                  if (session == null) {
                    return const ArenaEmptyState(
                      title: 'Sessão não encontrada',
                      message: 'Esta sessão não existe mais.',
                      icon: Icons.event_busy_outlined,
                    );
                  }
                  return _buildBody(context, session);
                },
                loading: () =>
                    const ArenaLoadingState(label: 'Carregando sessão...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context, ArenaClubSession session) {
    final theme = Theme.of(context);
    final participantsAsync =
        ref.watch(arenaClubSessionParticipantsProvider(widget.sessionId));
    final participants =
        participantsAsync.valueOrNull ?? const <ClubParticipant>[];
    final confirmed = participants.where((p) => p.isConfirmed).length;
    final pending = participants.where((p) => p.isPendingPayment).length;
    // Só quem confirmou via PIX conta como recebido online; onsite paga na
    // arena no dia (e é o único que não entra em estorno ao cancelar).
    final confirmedOnsite =
        participants.where((p) => p.isConfirmed && p.isOnsite).length;
    final confirmedPix = confirmed - confirmedOnsite;

    final date = session.dateOnly;
    final dateLabel = date != null
        ? DateFormat('EEEE, dd/MM', 'pt_BR').format(date)
        : session.dateShortLabel;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color:
                  context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${_capitalize(dateLabel)} · '
                        '${session.timeRangeLabel}',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                    if (session.isCanceled)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.live.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          'CANCELADA',
                          style: TextStyle(
                            color: AppColors.live,
                            fontWeight: FontWeight.w800,
                            fontSize: 10,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  '${session.courtNames.isNotEmpty ? session.courtNames.join(', ') : 'Sem quadras'} · '
                  '${formatBRL(session.priceReais)} por atleta',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    _CounterPill(
                      label: 'Confirmados',
                      value: '$confirmed/${session.capacity}',
                      color: AppColors.win,
                    ),
                    const SizedBox(width: 8),
                    _CounterPill(
                      label: 'Aguardando PIX',
                      value: '$pending',
                      color: AppColors.pending,
                    ),
                    const SizedBox(width: 8),
                    _CounterPill(
                      label: 'Vagas',
                      value: '${session.spotsLeft}',
                      color: AppColors.brand,
                    ),
                  ],
                ),
                if (confirmedOnsite > 0) ...[
                  const SizedBox(height: 10),
                  Text(
                    '$confirmedOnsite confirmado(s) pagam na arena no dia — '
                    'recebido online: $confirmedPix PIX confirmado(s).',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      height: 1.35,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: Text(
                'PARTICIPANTES (${participants.length})',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.6,
                ),
              ),
            ),
            if (session.isScheduled)
              TextButton.icon(
                onPressed: () => _openAddSheet(participants),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  visualDensity: VisualDensity.compact,
                ),
                icon: const Icon(Icons.person_add_alt_1_rounded, size: 16),
                label: const Text(
                  'Adicionar',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        participantsAsync.when(
          data: (all) {
            if (all.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Ninguém entrou na lista ainda.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              );
            }
            return Column(
              children: [
                for (final p in all)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _ParticipantRow(
                      participant: p,
                      onRemove: session.isScheduled &&
                              p.isActive &&
                              !_removing.contains(p.athleteId)
                          ? () => _confirmRemove(p)
                          : null,
                    ),
                  ),
              ],
            );
          },
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (e, _) => ArenaErrorState(message: '$e'),
        ),
        if (!session.isCanceled) ...[
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: _cancelling
                ? null
                : () => _confirmCancel(session, confirmedPix),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.live,
              side: BorderSide(color: AppColors.live.withValues(alpha: 0.5)),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            icon: _cancelling
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.event_busy_rounded),
            label: const Text(
              'Cancelar sessão',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Ao cancelar, todos os pagamentos confirmados são estornados '
            'automaticamente e os PIX pendentes são cancelados.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              height: 1.4,
            ),
          ),
        ],
      ],
    );
  }

  /// Sheet de adicionar: busca atleta da plataforma ou convidado sem conta.
  /// A lista é onSnapshot — atualiza sozinha após a callable.
  Future<void> _openAddSheet(List<ClubParticipant> participants) async {
    final activeIds = <String>{
      for (final p in participants)
        if (p.isActive) p.athleteId,
    };
    final message = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _AddParticipantSheet(
        sessionId: widget.sessionId,
        activeParticipantIds: activeIds,
      ),
    );
    if (message != null && mounted) {
      showAppSnackBar(context, message);
    }
  }

  Future<void> _confirmRemove(ClubParticipant participant) async {
    // Só PIX confirmado tem dinheiro online envolvido (estorno + carteira).
    final isPixPaid = participant.isConfirmed && !participant.isOnsite;
    final confirmedRemove = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: Text('Remover ${participant.athleteName} da lista?'),
        content: Text(
          isPixPaid
              ? 'O PIX pago será estornado automaticamente e o valor '
                  'debitado da carteira. A vaga reabre.'
              : 'A vaga reabre na hora — não há pagamento online envolvido.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            child: const Text('Remover'),
          ),
        ],
      ),
    );
    if (confirmedRemove != true || !mounted) return;

    setState(() => _removing.add(participant.athleteId));
    try {
      final result =
          await ref.read(arenaClubServiceProvider).removeParticipant(
                sessionId: widget.sessionId,
                participantId: participant.athleteId,
              );
      if (!mounted) return;
      showAppSnackBar(
        context,
        result.refunded
            ? 'Participante removido. O estorno do PIX foi solicitado.'
            : 'Participante removido. A vaga foi liberada.',
      );
    } on ArenaClubAdminException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível remover. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _removing.remove(participant.athleteId));
    }
  }

  /// [pixConfirmedCount] conta só os confirmados via PIX — vagas "paga na
  /// arena" não têm dinheiro online e não entram no estorno.
  Future<void> _confirmCancel(
    ArenaClubSession session,
    int pixConfirmedCount,
  ) async {
    final confirmedCancel = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: const Text('Cancelar esta sessão?'),
        content: Text(
          '${session.dateShortLabel} · ${session.timeRangeLabel}.\n\n'
          '${pixConfirmedCount > 0 ? 'Os $pixConfirmedCount pagamento(s) PIX confirmado(s) serão estornados automaticamente e os' : 'Os'} '
          'PIX pendentes serão cancelados. Os atletas são avisados.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            child: const Text('Cancelar sessão'),
          ),
        ],
      ),
    );
    if (confirmedCancel != true || !mounted) return;

    setState(() => _cancelling = true);
    try {
      final result = await ref.read(arenaClubServiceProvider).cancelSession(
            sessionId: widget.sessionId,
          );
      if (!mounted) return;
      final parts = <String>[
        if (result.refunded > 0) '${result.refunded} estorno(s) solicitados',
        if (result.canceledPending > 0)
          '${result.canceledPending} PIX pendente(s) cancelados',
        if (result.refundFailed > 0)
          '${result.refundFailed} estorno(s) falharam — verifique a carteira',
      ];
      showAppSnackBar(
        context,
        parts.isEmpty
            ? 'Sessão cancelada.'
            : 'Sessão cancelada. ${parts.join(' · ')}.',
        isError: result.refundFailed > 0,
      );
    } on ArenaClubAdminException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  static String _capitalize(String s) =>
      s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}

class _SessionHeader extends StatelessWidget {
  const _SessionHeader({
    required this.eyebrow,
    required this.title,
    required this.onBack,
  });

  final String eyebrow;
  final String title;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      child: Row(
        children: [
          Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onBack,
              child: SizedBox(
                width: 44,
                height: 44,
                child: Icon(
                  Icons.arrow_back_rounded,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  eyebrow,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    color: AppColors.brand,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
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

class _CounterPill extends StatelessWidget {
  const _CounterPill({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Column(
            children: [
              Text(
                value,
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w900,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontSize: 10,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ParticipantRow extends StatelessWidget {
  const _ParticipantRow({required this.participant, this.onRemove});

  final ClubParticipant participant;

  /// Habilitado pelo gestor em sessão aberta para confirmados/pendentes.
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = switch (participant.status) {
      'confirmed' => AppColors.win,
      'pending_payment' => AppColors.pending,
      'canceled_refunded' ||
      'canceled_by_arena_refunded' =>
        AppColors.live,
      _ => context.themeColors.onSurfaceMuted,
    };
    final photo = participant.athletePhotoUrl;
    final initial = participant.athleteName.trim().isNotEmpty
        ? participant.athleteName.trim()[0].toUpperCase()
        : '?';

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            CircleAvatar(
              radius: 16,
              backgroundColor: AppColors.brand.withValues(alpha: 0.18),
              foregroundImage: photo != null ? NetworkImage(photo) : null,
              child: Text(
                initial,
                style: const TextStyle(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    participant.athleteName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurface,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    participant.isGuest
                        ? '${formatBRL(participant.amountReais)} · convidado'
                        : formatBRL(participant.amountReais),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (participant.isConfirmed && participant.isOnsite) ...[
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.pending.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  'Paga na arena',
                  style: TextStyle(
                    color: AppColors.pending,
                    fontWeight: FontWeight.w800,
                    fontSize: 10,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
              const SizedBox(width: 6),
            ],
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                participant.statusLabel,
                style: TextStyle(
                  color: statusColor,
                  fontWeight: FontWeight.w800,
                  fontSize: 10,
                  letterSpacing: 0.2,
                ),
              ),
            ),
            if (onRemove != null) ...[
              const SizedBox(width: 2),
              IconButton(
                onPressed: onRemove,
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(
                  minWidth: 32,
                  minHeight: 32,
                ),
                tooltip: 'Remover da lista',
                icon: Icon(
                  Icons.person_remove_rounded,
                  size: 18,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Sheet de adicionar participante pela mão do gestor: busca um atleta da
/// plataforma OU cadastra um convidado sem conta.
///
/// Devolve via `pop` a mensagem de sucesso a ser exibida pela página, ou
/// `null` quando o gestor fecha sem adicionar ninguém. Erros são mostrados
/// aqui dentro para o gestor poder corrigir sem reabrir o sheet.
class _AddParticipantSheet extends ConsumerStatefulWidget {
  const _AddParticipantSheet({
    required this.sessionId,
    required this.activeParticipantIds,
  });

  final String sessionId;

  /// Quem já está na lista — sai dos resultados para não tentar duplicar.
  final Set<String> activeParticipantIds;

  @override
  ConsumerState<_AddParticipantSheet> createState() =>
      _AddParticipantSheetState();
}

class _AddParticipantSheetState extends ConsumerState<_AddParticipantSheet> {
  final _searchController = TextEditingController();
  final _guestController = TextEditingController();
  Timer? _debounce;
  List<AppUserProfile> _results = const [];
  bool _searching = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _guestController.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(value));
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
          .searchAthletesByKeywords(term, max: 20);
      if (!mounted) return;
      setState(() {
        _results = users
            .where((u) => !widget.activeParticipantIds.contains(u.uid))
            .toList(growable: false);
        _searching = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _error = 'Não foi possível buscar agora. Tente novamente.';
      });
    }
  }

  /// Exatamente um dos dois: [athleteId] (atleta) ou [customerName] (convidado).
  Future<void> _add({
    String? athleteId,
    String? customerName,
    required String successLabel,
  }) async {
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref.read(arenaClubServiceProvider).addParticipant(
            sessionId: widget.sessionId,
            athleteId: athleteId,
            customerName: customerName,
          );
      if (!mounted) return;
      Navigator.of(context).pop(
        result.converted
            ? '$successLabel entrou na lista. O PIX pendente virou '
                'pagamento na arena.'
            : '$successLabel entrou na lista pagando na arena.',
      );
    } on ArenaClubAdminException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = 'Não foi possível adicionar. Tente novamente.';
      });
    }
  }

  Future<void> _addGuest() async {
    final name = _guestController.text.trim();
    if (name.length < 2) {
      setState(() => _error = 'Informe o nome do convidado.');
      return;
    }
    await _add(customerName: name, successLabel: name);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (sheetContext, scrollController) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Adicionar à lista',
                    style: AppTypography.soraRegular(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Entra confirmado pagando na arena.',
                    style: TextStyle(
                      fontSize: 13,
                      color: colors.onSurfaceMuted,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _searchController,
                    autofocus: true,
                    enabled: !_submitting,
                    onChanged: _onQueryChanged,
                    decoration: InputDecoration(
                      hintText: 'Buscar atleta por nome ou apelido',
                      prefixIcon: const Icon(Icons.search_rounded),
                      filled: true,
                      fillColor: colors.surfaceRaised,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      style: const TextStyle(
                        color: AppColors.live,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (_searching || _submitting)
              const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: ListView(
                controller: scrollController,
                padding: const EdgeInsets.only(bottom: 24),
                children: [
                  if (_results.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 24,
                      ),
                      child: Text(
                        !isSearchTermLongEnough(_searchController.text)
                            ? 'Digite ao menos 2 letras para buscar um atleta '
                                'cadastrado — ou adicione um convidado abaixo.'
                            : (_searching
                                ? ''
                                : 'Nenhum atleta encontrado. Você ainda pode '
                                    'adicionar como convidado abaixo.'),
                        style: TextStyle(
                          color: colors.onSurfaceMuted,
                          height: 1.4,
                        ),
                      ),
                    )
                  else
                    ..._results.map((user) {
                      final photo = user.profilePhotoUrl;
                      final name = (user.nickname?.trim().isNotEmpty ?? false)
                          ? user.nickname!.trim()
                          : (user.fullName?.trim().isNotEmpty ?? false)
                              ? user.fullName!.trim()
                              : 'Atleta';
                      return ListTile(
                        enabled: !_submitting,
                        leading: CircleAvatar(
                          backgroundColor:
                              AppColors.brand.withValues(alpha: 0.15),
                          backgroundImage: photo != null && photo.isNotEmpty
                              ? NetworkImage(photo)
                              : null,
                          child: photo == null || photo.isEmpty
                              ? Text(
                                  name.substring(0, 1).toUpperCase(),
                                  style: const TextStyle(
                                    color: AppColors.brand,
                                    fontWeight: FontWeight.w800,
                                  ),
                                )
                              : null,
                        ),
                        title: Text(name),
                        subtitle: (user.fullName?.trim().isNotEmpty ?? false) &&
                                user.fullName!.trim() != name
                            ? Text(user.fullName!.trim())
                            : null,
                        onTap: _submitting
                            ? null
                            : () => _add(
                                  athleteId: user.uid,
                                  successLabel: name,
                                ),
                      );
                    }),
                  const Divider(height: 32),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Convidado sem conta',
                          style: AppTypography.soraRegular(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _guestController,
                          enabled: !_submitting,
                          textCapitalization: TextCapitalization.words,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _addGuest(),
                          decoration: InputDecoration(
                            hintText: 'Nome do convidado',
                            prefixIcon: const Icon(Icons.person_add_alt_rounded),
                            filled: true,
                            fillColor: colors.surfaceRaised,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          height: 48,
                          child: FilledButton(
                            onPressed: _submitting ? null : _addGuest,
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.brand,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            child: const Text(
                              'Adicionar convidado',
                              style: TextStyle(fontWeight: FontWeight.w800),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
