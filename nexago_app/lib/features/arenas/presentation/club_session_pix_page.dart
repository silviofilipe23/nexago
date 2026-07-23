import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/feedback/feedback_page.dart';
import '../../../core/validation/cpf_cnpj.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../data/arena_clubs_repository.dart';
import '../domain/arena_club_providers.dart';
import 'widgets/booking_pix/booking_pix_app_bar.dart';
import 'widgets/booking_pix/booking_pix_copy_button.dart';
import 'widgets/booking_pix/booking_pix_cpf_field.dart';
import 'widgets/booking_pix/booking_pix_expiry_card.dart';
import 'widgets/booking_pix/booking_pix_generate_bar.dart';
import 'widgets/booking_pix/booking_pix_method_card.dart';
import 'widgets/booking_pix/booking_pix_qr_card.dart';
import 'widgets/booking_pix/booking_pix_save_cpf_tile.dart';
import 'widgets/booking_pix/booking_pix_waiting_card.dart';

/// Pagamento da vaga no Clubinho. PIX antecipado: gera cobrança via
/// `joinArenaClubSession`, mostra QR + copia-e-cola e escuta o participante
/// até o webhook confirmar. Se a sessão aceitar pagar na arena
/// (`allowOnsitePayment`), um seletor de método aparece antes e o modo
/// onsite confirma a vaga na hora, sem CPF nem QR.
class ClubSessionPixPage extends ConsumerStatefulWidget {
  const ClubSessionPixPage({super.key, required this.sessionId});

  final String sessionId;

  @override
  ConsumerState<ClubSessionPixPage> createState() =>
      _ClubSessionPixPageState();
}

class _ClubSessionPixPageState extends ConsumerState<ClubSessionPixPage> {
  final _cpfController = TextEditingController();
  ClubJoinPixResult? _pix;
  bool _loadingPix = false;
  _ClubPayMethod _method = _ClubPayMethod.pix;
  ClubJoinOnsiteResult? _onsiteResult;
  bool _loadingOnsite = false;
  String? _pixError;
  bool _confirmed = false;
  bool _expired = false;
  bool _saveCpf = true;
  bool _cancelling = false;
  Timer? _expiryTimer;

  @override
  void initState() {
    super.initState();
    _cpfController.addListener(_onCpfTextChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) => _prefillCpf());
  }

  void _onCpfTextChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _expiryTimer?.cancel();
    _cpfController.removeListener(_onCpfTextChanged);
    _cpfController.dispose();
    super.dispose();
  }

  String get _cpfDigits => CpfCnpjValidator.digitsOnly(_cpfController.text);

  bool get _hasValidCpf => CpfCnpjValidator.isValid(_cpfController.text);

  String? get _cpfHint =>
      CpfCnpjValidator.validationMessage(_cpfController.text);

  void _prefillCpf() {
    final saved = ref.read(athleteProfileProvider).valueOrNull?.cpfCnpj;
    if (saved != null && CpfCnpjValidator.isValid(saved)) {
      _cpfController.text = CpfCnpjValidator.formatDisplay(saved);
      if (mounted) setState(() {});
    }
  }

  Future<void> _saveCpfToProfileIfNeeded() async {
    if (!_saveCpf || !_hasValidCpf) return;
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    if (profile == null) return;
    final digits = _cpfDigits;
    if (profile.cpfCnpj == digits) return;
    try {
      await ref
          .read(athleteProfileRepositoryProvider)
          .saveProfile(profile.copyWith(cpfCnpj: digits));
    } catch (_) {}
  }

  Future<void> _loadPix() async {
    final cpfMsg = _cpfHint;
    if (!_hasValidCpf) {
      setState(() {
        _pixError = cpfMsg ?? 'Informe um CPF válido para gerar o PIX.';
        _loadingPix = false;
      });
      return;
    }
    setState(() {
      _loadingPix = true;
      _pixError = null;
      _expired = false;
    });
    try {
      await _saveCpfToProfileIfNeeded();
      final pix = await ref.read(arenaClubsRepositoryProvider).joinSession(
            sessionId: widget.sessionId,
            cpfCnpj: _cpfDigits,
          );
      if (!mounted) return;
      setState(() {
        _pix = pix;
        _loadingPix = false;
      });
      _scheduleExpiry(pix.expiresAt);
    } on ArenaClubException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingPix = false;
        _pixError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingPix = false;
        _pixError = 'Não foi possível gerar o PIX. Tente novamente.';
      });
    }
  }

  /// Garante a vaga para pagar na arena: a callable confirma na hora.
  Future<void> _joinOnsite() async {
    if (_loadingOnsite) return;
    setState(() {
      _loadingOnsite = true;
      _pixError = null;
    });
    try {
      final result =
          await ref.read(arenaClubsRepositoryProvider).joinSessionOnsite(
                sessionId: widget.sessionId,
              );
      if (!mounted) return;
      _expiryTimer?.cancel();
      setState(() {
        _onsiteResult = result;
        _confirmed = true;
        _loadingOnsite = false;
      });
    } on ArenaClubException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingOnsite = false;
        _pixError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingOnsite = false;
        _pixError = 'Não foi possível garantir a vaga. Tente novamente.';
      });
    }
  }

  void _scheduleExpiry(DateTime expiresAt) {
    _expiryTimer?.cancel();
    final remaining = expiresAt.difference(DateTime.now());
    if (remaining.inSeconds <= 0) {
      _onPixExpired();
      return;
    }
    _expiryTimer = Timer(remaining, () {
      if (mounted) _onPixExpired();
    });
  }

  void _onPixExpired() {
    if (_confirmed || _expired) return;
    setState(() {
      _expired = true;
      _pix = null;
    });
  }

  Future<void> _giveUp() async {
    if (_cancelling) return;
    setState(() => _cancelling = true);
    try {
      await ref
          .read(arenaClubsRepositoryProvider)
          .leaveSession(sessionId: widget.sessionId);
    } catch (_) {
      // Sem PIX pago ainda; o hold expira sozinho se a callable falhar.
    } finally {
      if (mounted) {
        setState(() => _cancelling = false);
        context.pop();
      }
    }
  }

  void _onBack() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/clubinho/${widget.sessionId}');
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(myClubParticipantProvider(widget.sessionId), (prev, next) {
      final participant = next.valueOrNull;
      if (participant == null || _confirmed) return;
      if (participant.isConfirmed) {
        _expiryTimer?.cancel();
        setState(() => _confirmed = true);
      } else if (_pix != null &&
          (participant.status == 'expired' ||
              participant.status == 'canceled')) {
        _onPixExpired();
      }
    });

    final session = ref.watch(clubSessionProvider(widget.sessionId)).valueOrNull;
    final myParticipant =
        ref.watch(myClubParticipantProvider(widget.sessionId)).valueOrNull;
    final amountReais = _pix?.amountReais ?? session?.priceReais ?? 0;
    final showQr = _pix != null && !_loadingPix;
    final allowOnsite = session?.allowOnsitePayment ?? false;
    final onsiteSelected = allowOnsite && _method == _ClubPayMethod.onsite;

    if (_confirmed) {
      final isOnsite =
          _onsiteResult != null || myParticipant?.isOnsite == true;
      final onsiteAmount = _onsiteResult?.amountReais ??
          myParticipant?.amountReais ??
          session?.priceReais ??
          0;
      final sessionLabel = session != null
          ? '${session.clubName} · ${session.dateShortLabel} · '
              '${session.timeRangeLabel}'
          : null;
      return Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: FeedbackPage.success(
          title: isOnsite ? 'Vaga garantida!' : 'Você está na lista!',
          description: isOnsite
              ? '${sessionLabel != null ? '$sessionLabel\n' : ''}'
                  'Pague ${formatBRL(onsiteAmount)} na arena no dia. '
                  'Bom jogo!'
              : sessionLabel != null
                  ? '$sessionLabel\nBom jogo!'
                  : 'Pagamento confirmado. Bom jogo!',
          primaryAction: FeedbackAction(
            label: 'Ver a lista',
            onPressed: _onBack,
          ),
        ),
      );
    }

    if (_expired) {
      return Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: FeedbackPage.error(
          title: 'PIX expirado',
          description:
              'O tempo para pagar acabou e a vaga foi liberada. Se ainda '
              'houver vaga, gere um novo PIX.',
          primaryAction: FeedbackAction(
            label: 'Gerar novo PIX',
            onPressed: () {
              setState(() => _expired = false);
            },
          ),
          secondaryAction: FeedbackAction(
            label: 'Voltar',
            isPrimary: false,
            onPressed: _onBack,
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: BookingPixAppBar(onBack: _onBack),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!showQr) ...[
                    if (allowOnsite) ...[
                      _MethodSelector(
                        method: _method,
                        amountLabel: formatBRL(amountReais),
                        onChanged: (m) => setState(() {
                          _method = m;
                          _pixError = null;
                        }),
                      ),
                      const SizedBox(height: 20),
                    ] else ...[
                      BookingPixMethodCard(
                        amountLabel: formatBRL(amountReais),
                      ),
                      const SizedBox(height: 20),
                    ],
                    if (onsiteSelected) ...[
                      _OnsiteInfoCard(amountLabel: formatBRL(amountReais)),
                      if (_pixError != null) ...[
                        const SizedBox(height: 16),
                        _PixErrorCard(
                          message: _pixError!,
                          onRetry: _joinOnsite,
                        ),
                      ],
                    ] else ...[
                      BookingPixCpfField(
                        controller: _cpfController,
                        errorText: _cpfHint,
                        onSubmitted: _hasValidCpf ? _loadPix : null,
                      ),
                      const SizedBox(height: 12),
                      BookingPixSaveCpfTile(
                        value: _saveCpf,
                        onChanged: (v) => setState(() => _saveCpf = v),
                      ),
                      if (_pixError != null) ...[
                        const SizedBox(height: 16),
                        _PixErrorCard(message: _pixError!, onRetry: _loadPix),
                      ],
                    ],
                  ] else ...[
                    BookingPixExpiryCard(
                      expiresAt: _pix!.expiresAt,
                      amountReais: _pix!.amountReais,
                    ),
                    const SizedBox(height: 20),
                    BookingPixQrCard(
                      base64: _pix!.qrCodeBase64,
                      payload: _pix!.qrCode,
                    ),
                    const SizedBox(height: 16),
                    BookingPixCopyButton(
                      onPressed: () async {
                        await Clipboard.setData(
                          ClipboardData(text: _pix!.pixCopyPaste),
                        );
                        if (!context.mounted) return;
                        showAppSnackBar(context, 'Código PIX copiado.');
                      },
                    ),
                    const SizedBox(height: 16),
                    const BookingPixWaitingCard(),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: _cancelling ? null : _giveUp,
                      child: const Text('Desistir do pagamento'),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (!showQr)
            onsiteSelected
                ? BookingPixGenerateBar(
                    enabled: true,
                    loading: _loadingOnsite,
                    label: 'Garantir vaga · pagar na arena',
                    onPressed: _joinOnsite,
                  )
                : BookingPixGenerateBar(
                    enabled: _hasValidCpf,
                    loading: _loadingPix,
                    onPressed: _loadPix,
                  ),
        ],
      ),
    );
  }
}

/// Como o atleta paga a vaga: PIX antecipado ou direto na arena no dia.
enum _ClubPayMethod { pix, onsite }

class _MethodSelector extends StatelessWidget {
  const _MethodSelector({
    required this.method,
    required this.amountLabel,
    required this.onChanged,
  });

  final _ClubPayMethod method;
  final String amountLabel;
  final ValueChanged<_ClubPayMethod> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _MethodOption(
          icon: Icons.pix_rounded,
          iconColor: AppColors.win,
          title: 'PIX antecipado',
          subtitle: '$amountLabel agora · aprovação na hora',
          selected: method == _ClubPayMethod.pix,
          onTap: () => onChanged(_ClubPayMethod.pix),
        ),
        const SizedBox(height: 10),
        _MethodOption(
          icon: Icons.storefront_rounded,
          iconColor: AppColors.brand,
          title: 'Pagar na arena',
          subtitle: '$amountLabel no dia · vaga garantida agora',
          selected: method == _ClubPayMethod.onsite,
          onTap: () => onChanged(_ClubPayMethod.onsite),
        ),
      ],
    );
  }
}

class _MethodOption extends StatelessWidget {
  const _MethodOption({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.surfaceRaised,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: iconColor, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                selected
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_off_rounded,
                color: selected
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OnsiteInfoCard extends StatelessWidget {
  const _OnsiteInfoCard({required this.amountLabel});

  final String amountLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.check_circle_outline_rounded,
                color: AppColors.brand,
                size: 18,
              ),
              const SizedBox(width: 8),
              Text(
                'Sem PIX agora',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Sua vaga é confirmada na hora e você paga $amountLabel direto '
            'na arena no dia do jogo. Se não puder ir, saia da lista até o '
            'início da sessão para liberar a vaga.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _PixErrorCard extends StatelessWidget {
  const _PixErrorCard({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.live.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: context.themeColors.onSurface),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: onRetry,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
              ),
              child: const Text('Tentar novamente'),
            ),
          ],
        ),
      ),
    );
  }
}
