import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../data/arena_wallet_repository.dart';
import '../domain/arena_providers.dart';
import '../domain/arena_schedule_providers.dart';
import '../domain/arena_wallet_providers.dart';
import '../domain/payout_pix_key_type.dart';
import 'widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_platform_pix_card.dart';

class ArenaPaymentsPage extends ConsumerStatefulWidget {
  const ArenaPaymentsPage({super.key});

  @override
  ConsumerState<ArenaPaymentsPage> createState() => _ArenaPaymentsPageState();
}

class _ArenaPaymentsPageState extends ConsumerState<ArenaPaymentsPage> {
  final _amountController = TextEditingController();
  final _pixKeyController = TextEditingController();
  late PayoutPixKeyType _pixKeyType;
  bool _submitting = false;

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );

  @override
  void initState() {
    super.initState();
    _pixKeyType = PayoutPixKeyType.cpf;
    _amountController.addListener(_onWithdrawalFieldsChanged);
    _pixKeyController.addListener(_onWithdrawalFieldsChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _prefillPixFromArena();
    });
  }

  void _onWithdrawalFieldsChanged() {
    if (mounted) setState(() {});
  }

  double? _parsedWithdrawalAmount() {
    final raw = _amountController.text.trim().replaceAll(',', '.');
    if (raw.isEmpty) return null;
    return double.tryParse(raw);
  }

  String? _amountValidationError(double availableReais) {
    final amount = _parsedWithdrawalAmount();
    final raw = _amountController.text.trim();
    if (raw.isEmpty) return null;
    if (amount == null) return 'Informe um valor válido.';
    if (amount <= 0) return 'O valor deve ser maior que zero.';
    if (amount > availableReais + 0.001) {
      return 'Máximo disponível: ${_currency.format(availableReais)}.';
    }
    return null;
  }

  String? _pixKeyValidationError() {
    final key = _pixKeyController.text.trim();
    if (key.length < 5) return null;
    return _pixKeyType.validateKey(key);
  }

  bool _canSubmitWithdrawal(double availableReais) {
    if (_submitting) return false;
    if (_pixKeyController.text.trim().length < 5) return false;
    if (_pixKeyValidationError() != null) return false;
    final amount = _parsedWithdrawalAmount();
    if (amount == null || amount <= 0) return false;
    if (_amountValidationError(availableReais) != null) return false;
    return true;
  }

  void _prefillPixFromArena() {
    final arena = ref.read(managedArenaDetailProvider).valueOrNull;
    if (arena == null) return;
    if (_pixKeyController.text.trim().isEmpty && arena.payoutPixKey.trim().isNotEmpty) {
      _pixKeyController.text = arena.payoutPixKey.trim();
    }
    _pixKeyType = PayoutPixKeyType.initial(
      storedType: arena.payoutPixKeyType,
      pixKey: arena.payoutPixKey,
    );
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _amountController.removeListener(_onWithdrawalFieldsChanged);
    _pixKeyController.removeListener(_onWithdrawalFieldsChanged);
    _amountController.dispose();
    _pixKeyController.dispose();
    super.dispose();
  }

  Future<void> _requestWithdrawal(String arenaId, double availableReais) async {
    final amount = _parsedWithdrawalAmount();
    final pixKey = _pixKeyController.text.trim();
    final amountError = _amountValidationError(availableReais);
    if (amountError != null) {
      showAppSnackBar(context, amountError, isError: true);
      return;
    }
    if (amount == null || amount <= 0) {
      showAppSnackBar(context, 'Informe um valor válido.', isError: true);
      return;
    }
    if (pixKey.length < 5) {
      showAppSnackBar(context, 'Informe uma chave PIX válida.', isError: true);
      return;
    }
    final pixError = _pixKeyType.validateKey(pixKey);
    if (pixError != null) {
      showAppSnackBar(context, pixError, isError: true);
      return;
    }

    setState(() => _submitting = true);
    try {
      final result = await ref.read(arenaWalletRepositoryProvider).requestWithdrawal(
            arenaId: arenaId,
            amountReais: amount,
            pixKey: pixKey,
            pixKeyType: _pixKeyType.asaasValue,
          );
      if (!mounted) return;
      _amountController.clear();
      final snackMessage = _withdrawalResultMessage(result);
      showAppSnackBar(
        context,
        snackMessage,
        isError: result.status == 'pending' && result.payoutStatus == 'failed',
      );
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Não foi possível solicitar: $e', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _withdrawalResultMessage(ArenaWithdrawalRequestResult result) {
    if (result.autoProcessed &&
        result.status == 'approved' &&
        result.payoutStatus == 'sent') {
      return 'PIX enviado. O valor deve cair em instantes na sua chave.';
    }
    if (result.message != null && result.message!.trim().isNotEmpty) {
      return result.message!.trim();
    }
    if (result.status == 'pending' && result.processingMode == 'manual_review') {
      return 'Saque acima de R\$ 500. Aguardando aprovação da plataforma.';
    }
    if (result.status == 'pending' && result.payoutStatus == 'failed') {
      return 'Não foi possível enviar o PIX automaticamente. Nossa equipe vai revisar.';
    }
    return 'Saque solicitado. Aguarde aprovação.';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
    final arena = ref.watch(managedArenaDetailProvider).valueOrNull;
    final walletAsync = ref.watch(managedArenaWalletProvider);
    final availableReais = walletAsync.valueOrNull?.availableReais ?? 0;
    final amountError = _amountValidationError(availableReais);
    final pixKeyError = _pixKeyValidationError();
    final canSubmit = _canSubmitWithdrawal(availableReais);
    ref.listen(managedArenaDetailProvider, (previous, next) {
      final arena = next.valueOrNull;
      if (arena == null) return;
      final key = arena.payoutPixKey.trim();
      if (key.length >= 5 && _pixKeyController.text.trim().isEmpty) {
        _pixKeyController.text = key;
        _pixKeyType = PayoutPixKeyType.initial(
          storedType: arena.payoutPixKeyType,
          pixKey: key,
        );
        if (mounted) setState(() {});
      }
    });

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
        title: const Text('Pagamentos'),
      ),
      body: arenaId == null || arenaId.isEmpty
          ? const Center(
              child: Text(
                'Nenhuma arena vinculada.',
                style: TextStyle(color: AppColors.onSurfaceMuted),
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(
                ArenaDashboardTokens.horizontalPadding,
                12,
                ArenaDashboardTokens.horizontalPadding,
                32,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ArenaPlatformPixCard(
                    payoutPixKey: arena?.payoutPixKey ?? '',
                  ),
                  const SizedBox(height: 20),
                  walletAsync.when(
                    loading: () => const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: CircularProgressIndicator(color: AppColors.brand),
                      ),
                    ),
                    error: (e, _) => Text('Erro: $e'),
                    data: (wallet) => _BalanceCard(wallet: wallet),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'SOLICITAR SAQUE',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: AppColors.onSurfaceMuted,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 10),
                  DecoratedBox(
                    decoration: ArenaDashboardTokens.cardDecoration(
                      color: AppColors.surfaceRaised,
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          TextField(
                            controller: _amountController,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            inputFormatters: [
                              FilteringTextInputFormatter.allow(
                                RegExp(r'[0-9.,]'),
                              ),
                            ],
                            style: const TextStyle(color: AppColors.onSurface),
                            decoration: InputDecoration(
                              labelText: 'Valor (reais)',
                              filled: true,
                              fillColor: AppColors.surfaceSheet,
                              errorText: amountError,
                              helperText: amountError == null && availableReais > 0
                                  ? 'Disponível: ${_currency.format(availableReais)}'
                                  : null,
                              helperMaxLines: 2,
                            ),
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<PayoutPixKeyType>(
                            value: _pixKeyType,
                            dropdownColor: AppColors.surfaceSheet,
                            style: const TextStyle(color: AppColors.onSurface),
                            decoration: const InputDecoration(
                              labelText: 'Tipo da chave PIX',
                              filled: true,
                              fillColor: AppColors.surfaceSheet,
                            ),
                            items: [
                              for (final t in PayoutPixKeyType.values)
                                DropdownMenuItem(
                                  value: t,
                                  child: Text(t.label),
                                ),
                            ],
                            onChanged: (v) {
                              if (v != null) setState(() => _pixKeyType = v);
                            },
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _pixKeyController,
                            style: const TextStyle(color: AppColors.onSurface),
                            decoration: InputDecoration(
                              labelText: 'Chave PIX para receber',
                              hintText: _pixKeyType.hintForField(),
                              filled: true,
                              fillColor: AppColors.surfaceSheet,
                              errorText: pixKeyError,
                            ),
                          ),
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              onPressed: canSubmit
                                  ? () => _requestWithdrawal(
                                        arenaId,
                                        availableReais,
                                      )
                                  : null,
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.brand,
                                foregroundColor: AppColors.black,
                                padding: const EdgeInsets.symmetric(vertical: 14),
                              ),
                              child: _submitting
                                  ? const SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: AppColors.black,
                                      ),
                                    )
                                  : const Text('Solicitar saque'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  _WithdrawalsSection(arenaId: arenaId),
                  const SizedBox(height: 24),
                  _LedgerSection(arenaId: arenaId),
                ],
              ),
            ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.wallet});

  final ArenaWalletSummary wallet;

  static final _fmt = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(
        color: AppColors.surfaceRaised,
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Saldo disponível',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.onSurfaceMuted,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _fmt.format(wallet.availableReais),
              style: theme.textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
              ),
            ),
            if (wallet.pendingReais > 0) ...[
              const SizedBox(height: 8),
              Text(
                'Em análise: ${_fmt.format(wallet.pendingReais)}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.pending,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _WithdrawalsSection extends ConsumerWidget {
  const _WithdrawalsSection({required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final async = ref.watch(arenaWithdrawalsProvider(arenaId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'SAQUES',
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 10),
        async.when(
          loading: () => const LinearProgressIndicator(),
          error: (e, _) => Text('$e'),
          data: (items) {
            if (items.isEmpty) {
              return Text(
                'Nenhum saque solicitado ainda.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
              );
            }
            return Column(
              children: items
                  .map(
                    (w) {
                      final payout = w.payoutStatus?.trim();
                      final transfer = w.asaasTransferId?.trim();
                      final subtitleParts = <String>[
                        w.status,
                        if (payout != null && payout.isNotEmpty) payout,
                        w.pixKey,
                        if (transfer != null && transfer.isNotEmpty)
                          'ID: $transfer',
                      ];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(_currency.format(w.amountReais)),
                        subtitle: Text(subtitleParts.join(' · ')),
                      );
                    },
                  )
                  .toList(),
            );
          },
        ),
      ],
    );
  }

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );
}

class _LedgerSection extends ConsumerWidget {
  const _LedgerSection({required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final async = ref.watch(arenaWalletLedgerProvider(arenaId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'ÚLTIMOS RECEBIMENTOS',
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 10),
        async.when(
          loading: () => const LinearProgressIndicator(),
          error: (e, _) => Text('$e'),
          data: (items) {
            if (items.isEmpty) {
              return Text(
                'Recebimentos PIX aparecerão aqui.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
              );
            }
            return Column(
              children: items
                  .map(
                    (e) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        '+ ${_WithdrawalsSection._currency.format(e.netReais)}',
                        style: const TextStyle(
                          color: AppColors.win,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      subtitle: Text(
                        e.bookingId != null
                            ? 'Reserva ${e.bookingId!.substring(0, 8)}…'
                            : 'Crédito',
                      ),
                    ),
                  )
                  .toList(),
            );
          },
        ),
      ],
    );
  }
}
