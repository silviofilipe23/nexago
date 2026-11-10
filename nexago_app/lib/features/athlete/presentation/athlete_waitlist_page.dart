import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../arenas/domain/arena_booking_waitlist_entry.dart';
import '../../arenas/domain/waitlist_providers.dart';
import '../../arenas/domain/waitlist_view_logic.dart';
import '../../arenas/presentation/arena_booking_navigation.dart';

/// "Listas de espera" (`/athlete/lista-de-espera`) — canvas "Listas de espera · tela
/// própria no app do atleta" 02–04. Abre pela ampulheta do header da Agenda.
class AthleteWaitlistPage extends ConsumerStatefulWidget {
  const AthleteWaitlistPage({super.key});

  @override
  ConsumerState<AthleteWaitlistPage> createState() =>
      _AthleteWaitlistPageState();
}

class _AthleteWaitlistPageState extends ConsumerState<AthleteWaitlistPage> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Contagem dos 15 min e horários que começam com a tela aberta.
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myWaitlistStreamProvider);
    final colors = context.themeColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: const _WaitlistAppBar(),
      body: SafeArea(
        top: false,
        child: async.when(
          loading: () =>
              const AppLoadingView(message: 'Carregando suas filas…'),
          error: (e, _) => AppErrorView(
            title: 'Não foi possível carregar',
            message: friendlyErrorMessage(
              e,
              action: 'Não foi possível carregar as listas de espera',
              logReason: 'lista_espera:carregar',
            ),
            onRetry: () => ref.invalidate(myWaitlistStreamProvider),
          ),
          data: (entries) {
            final view = buildWaitlistView(entries, DateTime.now());
            if (view.isEmpty) return const _EmptyWaitlist();
            return _WaitlistBody(view: view);
          },
        ),
      ),
    );
  }
}

class _WaitlistAppBar extends StatelessWidget implements PreferredSizeWidget {
  const _WaitlistAppBar();

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight + 8);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return NexaAppBar(
      backgroundColor: colors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      toolbarHeight: kToolbarHeight + 8,
      leadingWidth: 64,
      leading: Padding(
        padding: const EdgeInsets.only(left: 16),
        child: Center(
          child: Material(
            color: colors.surfaceCard,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: colors.outline.withValues(alpha: 0.35)),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => context.canPop()
                  ? context.pop()
                  : openDiscoverAgendaTab(context),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: colors.onSurface,
                  semanticLabel: 'Voltar',
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Listas de espera',
        style: AppTypography.soraRegular(fontSize: 16, color: colors.onSurface),
      ),
    );
  }
}

TextStyle _sectionStyle(BuildContext context) => AppTypography.mono(
      fontSize: 9.5,
      fontWeight: FontWeight.w500,
      letterSpacing: 1.5,
      color: context.themeColors.onSurfaceMuted,
    );

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label, this.count);

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    final style = _sectionStyle(context);
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: Row(
        children: [
          Expanded(child: Text(label.toUpperCase(), style: style)),
          Text('$count', style: style),
        ],
      ),
    );
  }
}

class _WaitlistBody extends StatelessWidget {
  const _WaitlistBody({required this.view});

  final WaitlistView view;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
      children: [
        const _HowItWorksNote(),
        const SizedBox(height: 8),
        if (view.offers.isNotEmpty) ...[
          _SectionLabel('Vaga liberada', view.offers.length),
          for (final e in view.offers) ...[
            WaitlistEntryCard(entry: e),
            const SizedBox(height: 10),
          ],
        ],
        if (view.waiting.isNotEmpty) ...[
          _SectionLabel('Aguardando', view.waiting.length),
          for (final e in view.waiting) ...[
            WaitlistEntryCard(entry: e),
            const SizedBox(height: 10),
          ],
        ],
        if (view.activeCount == 0) const _NoActiveNote(),
        if (view.closed.isNotEmpty) ...[
          _SectionLabel('Encerradas · 30 dias', view.closed.length),
          _ClosedList(items: view.closed),
        ],
      ],
    );
  }
}

class _HowItWorksNote extends StatelessWidget {
  const _HowItWorksNote();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.30)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, size: 16, color: colors.brandText),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Quando um horário lotado libera, o primeiro da fila recebe um aviso '
              'e tem 15 min para reservar. Depois a vez passa.',
              style: TextStyle(
                fontSize: 12.5,
                height: 1.45,
                color: colors.onSurface.withValues(alpha: 0.8),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NoActiveNote extends StatelessWidget {
  const _NoActiveNote();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Text(
        'Você não está em nenhuma fila agora.',
        style:
            TextStyle(fontSize: 13, color: context.themeColors.onSurfaceMuted),
      ),
    );
  }
}

const _weekdays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

DateTime? _day(String dateKey) =>
    dateKey.length >= 10 ? DateTime.tryParse(dateKey.substring(0, 10)) : null;

String _dayMonth(DateTime d) =>
    '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';

/// Card de uma fila ativa: vaga liberada (contagem + Reservar agora) ou aguardando.
class WaitlistEntryCard extends ConsumerStatefulWidget {
  const WaitlistEntryCard({super.key, required this.entry});

  final ArenaBookingWaitlistEntry entry;

  @override
  ConsumerState<WaitlistEntryCard> createState() => _WaitlistEntryCardState();
}

class _WaitlistEntryCardState extends ConsumerState<WaitlistEntryCard> {
  bool _leaving = false;

  Future<void> _confirmLeave() async {
    final entry = widget.entry;
    final day = _day(entry.dateKey);
    final when = day == null
        ? 'às ${entry.startTime}'
        : '${_weekdays[day.weekday - 1].toLowerCase()} ${_dayMonth(day)} às ${entry.startTime}';
    final colors = context.themeColors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sair da lista de espera?'),
        content: Text(
          'Você deixa de ser avisado se uma vaga abrir na '
          '${entry.arenaName ?? 'arena'}, $when. Para voltar, entre na fila de novo '
          'pelo horário — e vai para o fim dela.',
        ),
        actionsAlignment: MainAxisAlignment.end,
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
            ),
            child: const Text('Continuar na lista'),
          ),
          TextButton(
            key: const ValueKey('waitlist-leave-confirm'),
            style: TextButton.styleFrom(foregroundColor: colors.live),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Sair da lista'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _leaving = true);
    try {
      await ref.read(waitlistRepositoryProvider).leave(entry.id);
      if (mounted) showAppSnackBar(context, 'Você saiu da lista de espera.');
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível sair da lista',
          logReason: 'reserva:sair_lista_espera',
        ),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _leaving = false);
    }
  }

  void _openSlot() {
    final entry = widget.entry;
    context.pushNamed(
      AppRouteNames.arenaSlots,
      pathParameters: {'arenaId': entry.arenaId},
      queryParameters: {
        'date': entry.dateKey,
        'courtId': entry.courtId,
        'startTime': entry.startTime,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final entry = widget.entry;
    final offer = entry.isNotified;
    final day = _day(entry.dateKey);
    final remaining = entry.remainingNotifyWindow;
    final minutes = remaining == null ? null : remaining.inMinutes.clamp(0, 15);
    final accent = offer ? colors.win : colors.brandText;

    final leaveButton = TextButton(
      key: ValueKey('waitlist-leave-${entry.id}'),
      onPressed: _leaving ? null : _confirmLeave,
      style: TextButton.styleFrom(
        foregroundColor: colors.onSurfaceMuted,
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
      child: Text(
        _leaving ? 'Saindo…' : 'Sair da lista',
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
      ),
    );

    return Container(
      key: ValueKey('waitlist-card-${entry.id}'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: offer
              ? AppColors.win.withValues(alpha: 0.55)
              : colors.outline.withValues(alpha: 0.35),
        ),
        gradient: offer
            ? LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                stops: const [0, 0.6],
                colors: [
                  AppColors.win.withValues(alpha: 0.10),
                  colors.surfaceCard
                ],
              )
            : null,
        color: offer ? null : colors.surfaceCard,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 52,
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      day == null ? '—' : _weekdays[day.weekday - 1],
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.2,
                        color: colors.brandText,
                      ),
                    ),
                    Text(
                      day == null ? '' : '${day.day}',
                      style: AppTypography.soraRegular(
                          fontSize: 19, color: colors.onSurface),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${entry.arenaName ?? 'Arena'} · ${entry.startTime} – ${entry.endTime}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14.5,
                        color: colors.onSurface,
                      ),
                    ),
                    if (entry.courtName != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        entry.courtName!,
                        style: TextStyle(
                            fontSize: 12, color: colors.onSurfaceMuted),
                      ),
                    ],
                  ],
                ),
              ),
              if (offer && minutes != null) ...[
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      minutes < 1 ? '<1 min' : '$minutes min',
                      key: const ValueKey('waitlist-offer-timer'),
                      style: AppTypography.mono(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: colors.win,
                      ),
                    ),
                    Text(
                      'PARA RESERVAR',
                      style: AppTypography.mono(
                        fontSize: 8.5,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 1.1,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Text(
            offer
                ? '● Vaga liberada para você'
                : 'Aguardando vaga · avisamos por notificação',
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w700, color: accent),
          ),
          const SizedBox(height: 6),
          if (offer)
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 44,
                    child: FilledButton(
                      key: ValueKey('waitlist-book-${entry.id}'),
                      onPressed: _openSlot,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.win,
                        foregroundColor: AppColors.black,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        'Reservar agora',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                leaveButton,
              ],
            )
          else
            Row(
              children: [
                Expanded(
                  child: Text(
                    entry.createdAt == null
                        ? 'Na fila'
                        : 'Na fila desde ${_dayMonth(entry.createdAt!)}',
                    style:
                        TextStyle(fontSize: 11.5, color: colors.onSurfaceMuted),
                  ),
                ),
                leaveButton,
              ],
            ),
        ],
      ),
    );
  }
}

class _ClosedList extends StatelessWidget {
  const _ClosedList({required this.items});

  final List<(ArenaBookingWaitlistEntry, WaitlistClosedReason)> items;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.outline.withValues(alpha: 0.35)),
      ),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0)
              Divider(height: 1, color: colors.outline.withValues(alpha: 0.25)),
            _ClosedRow(entry: items[i].$1, reason: items[i].$2),
          ],
        ],
      ),
    );
  }
}

class _ClosedRow extends StatelessWidget {
  const _ClosedRow({required this.entry, required this.reason});

  final ArenaBookingWaitlistEntry entry;
  final WaitlistClosedReason reason;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final day = _day(entry.dateKey);
    final tone = switch (reason) {
      WaitlistClosedReason.converted => colors.win,
      WaitlistClosedReason.offerExpired => colors.pending,
      _ => colors.onSurfaceMuted,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  [
                    entry.arenaName ?? 'Arena',
                    if (day != null) _dayMonth(day),
                    entry.startTime,
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: colors.onSurface,
                  ),
                ),
                if (entry.courtName != null)
                  Text(
                    entry.courtName!,
                    style:
                        TextStyle(fontSize: 11.5, color: colors.onSurfaceMuted),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: tone.withValues(alpha: 0.45)),
            ),
            child: Text(
              reason.label.toUpperCase(),
              style: AppTypography.mono(
                fontSize: 9.5,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.0,
                color: tone,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyWaitlist extends StatelessWidget {
  const _EmptyWaitlist();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget step(String n, String title, String text) => Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.outline.withValues(alpha: 0.35)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 24,
                height: 24,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                    color: colors.surfaceRaised, shape: BoxShape.circle),
                child: Text(
                  n,
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: colors.brandText,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13.5,
                        color: colors.onSurface,
                      ),
                    ),
                    Text(text,
                        style: TextStyle(
                            fontSize: 12, color: colors.onSurfaceMuted)),
                  ],
                ),
              ),
            ],
          ),
        );

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
            children: [
              Center(
                child: Container(
                  width: 84,
                  height: 84,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.brand.withValues(alpha: 0.10),
                    border: Border.all(
                        color: AppColors.brand.withValues(alpha: 0.35)),
                  ),
                  child: Icon(Icons.hourglass_empty_rounded,
                      size: 34, color: colors.brandText),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Nenhuma fila por enquanto',
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                    fontSize: 22, color: colors.onSurface),
              ),
              const SizedBox(height: 6),
              Text(
                'Horário lotado? Entre na lista de espera e a gente avisa quando a vaga abrir.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 13, height: 1.45, color: colors.onSurfaceMuted),
              ),
              const SizedBox(height: 20),
              step('1', 'Escolha um horário lotado',
                  'Em Reservar, toque em “Entrar na lista de espera”.'),
              step('2', 'Espere o aviso',
                  'Se alguém cancelar, o primeiro da fila recebe uma notificação.'),
              step('3', 'Reserve em até 15 min',
                  'Depois disso, a vez passa para o próximo.'),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
          decoration: BoxDecoration(
            color: colors.canvas,
            border: Border(
                top: BorderSide(color: colors.outline.withValues(alpha: 0.35))),
          ),
          child: SizedBox(
            height: 52,
            width: double.infinity,
            child: FilledButton(
              key: const ValueKey('waitlist-empty-book'),
              onPressed: () => openDiscoverReservarTab(context),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
              child: const Text(
                'Reservar horário',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
