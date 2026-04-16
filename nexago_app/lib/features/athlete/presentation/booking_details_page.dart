import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/booking_providers.dart';
import '../domain/booking_attendance_providers.dart';

class BookingDetailsPage extends ConsumerStatefulWidget {
  const BookingDetailsPage({
    super.key,
    required this.bookingId,
    required this.arenaId,
    required this.arenaName,
    required this.courtName,
    required this.startAt,
    required this.endAt,
    required this.status,
    required this.confirmedParticipants,
    this.amountReais,
    this.paymentType,
  });

  final String bookingId;
  final String? arenaId;
  final String arenaName;
  final String courtName;
  final DateTime startAt;
  final DateTime endAt;
  final String status;
  final int confirmedParticipants;
  final double? amountReais;
  final String? paymentType;

  @override
  ConsumerState<BookingDetailsPage> createState() => _BookingDetailsPageState();
}

class _BookingDetailsPageState extends ConsumerState<BookingDetailsPage> {
  Timer? _ticker;
  DateTime _now = DateTime.now();
  bool _confirmingAttendance = false;
  bool _checkingIn = false;
  bool _attendancePulse = false;
  bool _locationVerified = false;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arenaAsync = widget.arenaId == null ? null : ref.watch(arenaByIdProvider(widget.arenaId!));
    final arena = arenaAsync?.valueOrNull;

    final status = _bookingStatus(_now, widget.startAt, widget.endAt, widget.status);
    final countdown = _countdownLabel(_now, widget.startAt, widget.endAt, status);
    final dateLabel = DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(widget.startAt);
    final hourLabel = '${DateFormat('HH:mm', 'pt_BR').format(widget.startAt)} - ${DateFormat('HH:mm', 'pt_BR').format(widget.endAt)}';
    final address = arena?.addressLine?.trim().isNotEmpty == true
        ? arena!.addressLine!.trim()
        : (arena?.locationLabel ?? 'Local a confirmar');
    final paymentLabel = widget.amountReais != null
        ? NumberFormat.currency(locale: 'pt_BR', symbol: r'R$', decimalDigits: 2).format(widget.amountReais)
        : 'A confirmar';
    final paymentType = _paymentTypeLabel(widget.paymentType);
    final assistantState = getAssistantState(
      now: _now,
      startAt: widget.startAt,
      endAt: widget.endAt,
      rawStatus: widget.status,
    );
    final assistantCard = _buildAssistantCard(assistantState, address);
    final attendanceAsync = ref.watch(bookingAttendanceProvider(widget.bookingId));
    final attendance = attendanceAsync.valueOrNull;

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(title: const Text('Detalhes da reserva')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          assistantCard,
          const SizedBox(height: 14),
          _SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.arenaName, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(widget.courtName, style: theme.textTheme.titleMedium?.copyWith(color: AppColors.onSurfaceMuted)),
                const SizedBox(height: 16),
                Text(_capitalize(dateLabel), style: theme.textTheme.bodyLarge),
                const SizedBox(height: 4),
                Text(
                  hourLabel,
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  countdown,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: _statusColor(theme, status),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Localização',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(address, style: theme.textTheme.bodyLarge),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () => _openMaps(address),
                  icon: const Icon(Icons.map_outlined),
                  label: const Text('Ver no mapa'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Participantes',
            child: Column(
              children: _buildParticipants(theme),
            ),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Pagamento',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Valor: $paymentLabel', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text('Tipo: $paymentType', style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.onSurfaceMuted)),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Confirmação de presença',
            child: _buildAttendanceSection(theme, attendance),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Ações',
            child: Column(
              children: [
                _ActionBtn(label: 'Como chegar', icon: Icons.directions_outlined, onTap: () => _openMaps(address)),
                const SizedBox(height: 8),
                _ActionBtn(label: 'Convidar jogador', icon: Icons.person_add_alt_1_outlined, onTap: _invitePlayer),
                const SizedBox(height: 8),
                _ActionBtn(
                  label: 'Cancelar reserva',
                  icon: Icons.cancel_outlined,
                  danger: true,
                  onTap: status == _DetailsStatus.future ? _cancelBooking : null,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttendanceSection(
    ThemeData theme,
    BookingAttendanceState? attendance,
  ) {
    final startAt = widget.startAt;
    final deadline = attendance?.confirmationDeadline ??
        startAt.subtract(const Duration(hours: 2));
    final now = DateTime.now();
    final isBeforeWindow = now.isBefore(deadline);
    final status = attendance?.attendanceStatus ?? 'pending';
    final confirmed = attendance?.attendanceConfirmed == true ||
        status == 'confirmed' ||
        status == 'checked_in';
    final isCheckedIn = status == 'checked_in';
    final confirmedPlayers = attendance?.confirmedPlayers ?? widget.confirmedParticipants;
    final canCheckIn = attendance?.checkInAllowed == true && !isCheckedIn;

    if (isCheckedIn) {
      return Row(
        children: [
          const Icon(Icons.qr_code_scanner_rounded, color: Color(0xFF2E7D32)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Check-in realizado com sucesso${attendance?.locationVerified == true ? ' (local validado)' : ''}.',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: const Color(0xFF2E7D32),
              ),
            ),
          ),
        ],
      );
    }

    if (confirmed) {
      return Row(
        children: [
          const Icon(Icons.verified_rounded, color: Color(0xFF2E7D32)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Presença confirmada. 🔥 Boa! Jogadores comprometidos fazem o jogo acontecer.',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: const Color(0xFF2E7D32),
              ),
            ),
          ),
        ],
      );
    }

    if (isBeforeWindow) {
      return Text(
        'Você poderá confirmar sua presença mais tarde.',
        style: theme.textTheme.bodyMedium?.copyWith(
          color: AppColors.onSurfaceMuted,
          fontWeight: FontWeight.w600,
        ),
      );
    }

    final canConfirm = !_confirmingAttendance;
    final scale = _attendancePulse ? 1.02 : 1.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '⚠️ Confirme sua presença',
          style: theme.textTheme.titleSmall?.copyWith(
            color: theme.colorScheme.error,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '$confirmedPlayers jogadores já confirmaram.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 10),
        AnimatedScale(
          scale: scale,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutBack,
          child: FilledButton.icon(
            onPressed: canConfirm ? _confirmAttendance : null,
            icon: _confirmingAttendance
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.how_to_reg_rounded),
            label: Text(_confirmingAttendance
                ? 'Confirmando...'
                : 'Confirmar presença'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: Colors.white,
            ),
          ),
        ),
        if (canCheckIn) ...[
          const SizedBox(height: 12),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('Estou próximo da arena'),
            subtitle: const Text('Opcional: use para validar localização'),
            value: _locationVerified,
            onChanged: _checkingIn ? null : (v) => setState(() => _locationVerified = v),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _checkingIn ? null : _checkInNow,
            icon: _checkingIn
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.login_rounded),
            label: Text(_checkingIn ? 'Validando check-in...' : 'Fazer check-in'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2E7D32),
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _confirmAttendance() async {
    if (_confirmingAttendance) return;
    setState(() {
      _confirmingAttendance = true;
      _attendancePulse = true;
    });
    try {
      await ref.read(confirmAttendanceProvider).confirm(widget.bookingId);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Presença confirmada com sucesso! +5 XP'),
          ),
        );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text('Não foi possível confirmar presença: $e')),
        );
    } finally {
      if (mounted) {
        setState(() {
          _confirmingAttendance = false;
        });
        Future<void>.delayed(const Duration(milliseconds: 250), () {
          if (!mounted) return;
          setState(() => _attendancePulse = false);
        });
      }
    }
  }

  Future<void> _checkInNow() async {
    if (_checkingIn) return;
    setState(() => _checkingIn = true);
    try {
      await ref.read(checkInProvider).checkIn(
            bookingId: widget.bookingId,
            locationVerified: _locationVerified,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('Check-in realizado com sucesso!')),
        );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text('Não foi possível fazer check-in: $e')),
        );
    } finally {
      if (mounted) {
        setState(() => _checkingIn = false);
      }
    }
  }

  Widget _buildAssistantCard(AssistantStateType state, String address) {
    switch (state) {
      case AssistantStateType.before:
        return AssistantCard(
          title: 'Monte sua equipe',
          message: 'Ainda dá tempo de convidar jogadores e confirmar presença.',
          buttonLabel: 'Convidar jogadores',
          color: const Color(0xFF1565C0),
          onPressed: _invitePlayer,
        );
      case AssistantStateType.near:
        return AssistantCard(
          title: 'Hora de se preparar',
          message: 'Seu jogo está próximo. Confira seus itens e planeje a saída.',
          buttonLabel: 'Como chegar',
          color: const Color(0xFFEF6C00),
          onPressed: () => _openMaps(address),
        );
      case AssistantStateType.now:
        return AssistantCard(
          title: 'Saia agora',
          message: 'Seu horário está chegando. Abra o mapa e vá para a arena.',
          buttonLabel: 'Abrir mapa',
          color: AppColors.brand,
          onPressed: () => _openMaps(address),
        );
      case AssistantStateType.inProgress:
        return AssistantCard(
          title: 'Jogo em andamento',
          message: 'Boa partida! Use o chat para coordenar com os participantes.',
          buttonLabel: 'Abrir chat',
          color: const Color(0xFF2E7D32),
          onPressed: _openChat,
        );
      case AssistantStateType.finished:
        return AssistantCard(
          title: 'Partida finalizada',
          message: 'Que tal compartilhar o resultado e postar no feed?',
          buttonLabel: 'Postar no feed',
          color: const Color(0xFF6A1B9A),
          onPressed: _postResult,
        );
    }
  }

  List<Widget> _buildParticipants(ThemeData theme) {
    final qty = widget.confirmedParticipants < 1 ? 1 : widget.confirmedParticipants;
    return List.generate(qty, (index) {
      final name = index == 0 ? 'Você' : 'Jogador confirmado ${index + 1}';
      return Padding(
        padding: EdgeInsets.only(bottom: index == qty - 1 ? 0 : 10),
        child: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: AppColors.brand.withValues(alpha: 0.12),
              child: Text(name.substring(0, 1), style: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(name, style: theme.textTheme.bodyLarge)),
          ],
        ),
      );
    });
  }

  Future<void> _openMaps(String address) async {
    final q = Uri.encodeComponent(address);
    final uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$q');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _invitePlayer() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Convite em breve.')),
    );
  }

  void _openChat() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Chat em breve.')),
    );
  }

  void _postResult() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Publicação no feed em breve.')),
    );
  }

  Future<void> _cancelBooking() async {
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || uid.isEmpty) return;
    try {
      await ref.read(bookingServiceProvider).cancelBooking(
            bookingId: widget.bookingId,
            athleteId: uid,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reserva cancelada.')),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Não foi possível cancelar: $e')),
      );
    }
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    this.title,
    required this.child,
  });

  final String? title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(title!, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
          ],
          child,
        ],
      ),
    );
  }
}

class AssistantCard extends StatelessWidget {
  const AssistantCard({
    super.key,
    required this.title,
    required this.message,
    required this.buttonLabel,
    required this.color,
    required this.onPressed,
  });

  final String title;
  final String message;
  final String buttonLabel;
  final Color color;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return TweenAnimationBuilder<double>(
      duration: const Duration(milliseconds: 320),
      tween: Tween<double>(begin: 0.96, end: 1),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return Opacity(
          opacity: value.clamp(0, 1),
          child: Transform.scale(scale: value, child: child),
        );
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.8),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: onPressed,
              style: FilledButton.styleFrom(
                backgroundColor: color,
                foregroundColor: Colors.white,
              ),
              child: Text(buttonLabel),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  const _ActionBtn({
    required this.label,
    required this.icon,
    required this.onTap,
    this.danger = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = danger ? theme.colorScheme.error : AppColors.brand;
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        side: BorderSide(color: color.withValues(alpha: 0.3)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}

enum _DetailsStatus { future, current, past, canceled }
enum AssistantStateType { before, near, now, inProgress, finished }

_DetailsStatus _bookingStatus(DateTime now, DateTime start, DateTime end, String rawStatus) {
  final status = rawStatus.trim().toLowerCase();
  if (status == 'canceled' || status == 'cancelled') return _DetailsStatus.canceled;
  if (now.isAfter(start) && now.isBefore(end)) return _DetailsStatus.current;
  if (now.isBefore(start)) return _DetailsStatus.future;
  return _DetailsStatus.past;
}

AssistantStateType getAssistantState({
  required DateTime now,
  required DateTime startAt,
  required DateTime endAt,
  required String rawStatus,
}) {
  final status = _bookingStatus(now, startAt, endAt, rawStatus);
  if (status == _DetailsStatus.current) return AssistantStateType.inProgress;
  if (status == _DetailsStatus.past || status == _DetailsStatus.canceled) {
    return AssistantStateType.finished;
  }

  final minutesToStart = startAt.difference(now).inMinutes;
  if (minutesToStart <= 10) return AssistantStateType.now;
  if (minutesToStart <= 45) return AssistantStateType.near;
  return AssistantStateType.before;
}

String _countdownLabel(DateTime now, DateTime start, DateTime end, _DetailsStatus status) {
  switch (status) {
    case _DetailsStatus.future:
      final diff = start.difference(now);
      final min = diff.inMinutes;
      if (min <= 59) return 'Começa em $min min';
      final h = min ~/ 60;
      final m = min % 60;
      return m == 0 ? 'Começa em ${h}h' : 'Começa em ${h}h ${m}min';
    case _DetailsStatus.current:
      return 'Em andamento';
    case _DetailsStatus.past:
      return 'Finalizado';
    case _DetailsStatus.canceled:
      return 'Cancelado';
  }
}

String _paymentTypeLabel(String? raw) {
  final v = raw?.trim().toLowerCase() ?? '';
  if (v.isEmpty) return 'Pagamento na arena';
  if (v.contains('pix')) return 'PIX';
  if (v.contains('card') || v.contains('cart')) return 'Cartão';
  if (v.contains('online')) return 'Online';
  if (v.contains('local') || v.contains('venue')) return 'No local';
  return raw!.trim();
}

Color _statusColor(ThemeData theme, _DetailsStatus status) {
  switch (status) {
    case _DetailsStatus.future:
      return theme.colorScheme.primary;
    case _DetailsStatus.current:
      return AppColors.brand;
    case _DetailsStatus.past:
      return AppColors.onSurfaceMuted;
    case _DetailsStatus.canceled:
      return theme.colorScheme.error;
  }
}

String _capitalize(String value) {
  if (value.isEmpty) return value;
  return value[0].toUpperCase() + value.substring(1);
}
