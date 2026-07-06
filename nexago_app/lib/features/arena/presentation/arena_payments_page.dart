import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../data/arena_wallet_repository.dart';
import '../domain/arena_financial_logic.dart';
import '../domain/arena_providers.dart';
import '../domain/arena_schedule_providers.dart';
import '../domain/arena_wallet_providers.dart';
import '../domain/payout_pix_key_type.dart';
import 'widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_financial_widgets.dart';

class ArenaPaymentsPage extends ConsumerStatefulWidget {
  const ArenaPaymentsPage({super.key});

  @override
  ConsumerState<ArenaPaymentsPage> createState() => _ArenaPaymentsPageState();
}

class _ArenaPaymentsPageState extends ConsumerState<ArenaPaymentsPage> {
  final _amountController = TextEditingController();
  late PayoutPixKeyType _pixKeyType;
  String _pixKey = '';
  bool _submitting = false;
  ArenaFinancialPeriod _period = ArenaFinancialPeriod.d30;
  ArenaFinancialHistoryFilter _historyFilter = ArenaFinancialHistoryFilter.all;

  @override
  void initState() {
    super.initState();
    _pixKeyType = PayoutPixKeyType.cpf;
    _amountController.addListener(_onWithdrawalFieldsChanged);
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
    if (amount < arenaMinWithdrawalReais) {
      return 'Mínimo: ${formatBRL(arenaMinWithdrawalReais)}.';
    }
    if (amount <= 0) return 'O valor deve ser maior que zero.';
    if (amount > availableReais + 0.001) {
      return 'Máximo disponível: ${formatBRL(availableReais)}.';
    }
    return null;
  }

  String? _pixKeyValidationError() {
    final key = _pixKey.trim();
    if (key.length < 5) return null;
    return _pixKeyType.validateKey(key);
  }

  bool _canSubmitWithdrawal(double availableReais) {
    if (_submitting) return false;
    if (_pixKey.trim().length < 5) return false;
    if (_pixKeyValidationError() != null) return false;
    final amount = _parsedWithdrawalAmount();
    if (amount == null || amount < arenaMinWithdrawalReais) return false;
    if (_amountValidationError(availableReais) != null) return false;
    return true;
  }

  void _prefillPixFromArena() {
    final arena = ref.read(managedArenaDetailProvider).valueOrNull;
    if (arena == null) return;
    final key = arena.payoutPixKey.trim();
    if (_pixKey.trim().isEmpty && key.isNotEmpty) {
      _pixKey = key;
    }
    _pixKeyType = PayoutPixKeyType.initial(
      storedType: arena.payoutPixKeyType,
      pixKey: key.isNotEmpty ? key : _pixKey,
    );
    if (mounted) setState(() {});
  }

  void _withdrawAll(double availableReais) {
    if (availableReais <= 0) return;
    _amountController.text = availableReais.toStringAsFixed(2).replaceAll('.', ',');
    setState(() {});
  }

  Future<void> _editPixKey() async {
    await showArenaFinancialPixEditSheet(
      context: context,
      initialType: _pixKeyType,
      initialKey: _pixKey,
      onSave: (result) {
        setState(() {
          _pixKeyType = result.$1;
          _pixKey = result.$2;
        });
      },
    );
  }

  @override
  void dispose() {
    _amountController.removeListener(_onWithdrawalFieldsChanged);
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _requestWithdrawal(String arenaId, double availableReais) async {
    final amount = _parsedWithdrawalAmount();
    final pixKey = _pixKey.trim();
    final amountError = _amountValidationError(availableReais);
    if (amountError != null) {
      showAppSnackBar(context, amountError, isError: true);
      return;
    }
    if (amount == null || amount < arenaMinWithdrawalReais) {
      showAppSnackBar(
        context,
        'Valor mínimo: ${formatBRL(arenaMinWithdrawalReais)}.',
        isError: true,
      );
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
      final result = await ref
          .read(arenaWalletRepositoryProvider)
          .requestWithdrawal(
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
    if (result.status == 'pending' &&
        result.processingMode == 'manual_review') {
      return 'Saque acima de R\$ 500. Aguardando aprovação da plataforma.';
    }
    if (result.status == 'pending' && result.payoutStatus == 'failed') {
      return 'Não foi possível enviar o PIX automaticamente. Nossa equipe vai revisar.';
    }
    return 'Saque solicitado. Aguarde aprovação.';
  }

  static const double _shellBottomNavHeight = 100;

  double _scrollBottomPadding(BuildContext context) {
    return _shellBottomNavHeight +
        MediaQuery.paddingOf(context).bottom +
        24;
  }

  @override
  Widget build(BuildContext context) {
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
    final arena = ref.watch(managedArenaDetailProvider).valueOrNull;
    final walletAsync = ref.watch(managedArenaWalletProvider);
    final ledgerAsync = arenaId == null
        ? const AsyncValue<List<ArenaLedgerEntry>>.data([])
        : ref.watch(arenaWalletLedgerProvider(arenaId));
    final withdrawalsAsync = arenaId == null
        ? const AsyncValue<List<ArenaWithdrawalItem>>.data([])
        : ref.watch(arenaWithdrawalsProvider(arenaId));

    final availableReais = walletAsync.valueOrNull?.availableReais ?? 0;
    final amountError = _amountValidationError(availableReais);
    final canSubmit = _canSubmitWithdrawal(availableReais);

    ref.listen(managedArenaDetailProvider, (previous, next) {
      final loaded = next.valueOrNull;
      if (loaded == null) return;
      final key = loaded.payoutPixKey.trim();
      if (key.length >= 5 && _pixKey.trim().isEmpty) {
        setState(() {
          _pixKey = key;
          _pixKeyType = PayoutPixKeyType.initial(
            storedType: loaded.payoutPixKeyType,
            pixKey: key,
          );
        });
      }
    });

    final ledger = ledgerAsync.valueOrNull ?? const <ArenaLedgerEntry>[];
    final withdrawals =
        withdrawalsAsync.valueOrNull ?? const <ArenaWithdrawalItem>[];
    final stats = computeFinancialPeriodStats(
      ledger: ledger,
      withdrawals: withdrawals,
      period: _period,
    );
    final allMovements = buildFinancialMovements(
      ledger: ledger,
      withdrawals: withdrawals,
      arenaName: arena?.name ?? '',
    );
    final filteredMovements =
        filterFinancialMovements(allMovements, _historyFilter);

    final isLoading = walletAsync.isLoading ||
        ledgerAsync.isLoading ||
        withdrawalsAsync.isLoading;
    final viewportHeight = MediaQuery.sizeOf(context).height;
    final topInset = MediaQuery.paddingOf(context).top;
    final minContentHeight = viewportHeight -
        topInset -
        _scrollBottomPadding(context) -
        72;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: arenaId == null || arenaId.isEmpty
          ? Center(
              child: Text(
                'Nenhuma arena vinculada.',
                style: TextStyle(color: context.themeColors.onSurfaceMuted),
              ),
            )
          : SafeArea(
              bottom: false,
              child: isLoading && walletAsync.valueOrNull == null
                  ? Center(
                      child: CircularProgressIndicator(
                        color: AppColors.brand,
                      ),
                    )
                  : CustomScrollView(
                      physics: const AlwaysScrollableScrollPhysics(
                        parent: BouncingScrollPhysics(),
                      ),
                      slivers: [
                        SliverToBoxAdapter(
                          child: ArenaFinancialHeader(
                            onBack: () => context.pop(),
                            onReport: () => showAppSnackBar(
                              context,
                              'Extrato completo em breve.',
                            ),
                          ),
                        ),
                        SliverPadding(
                          padding: EdgeInsets.fromLTRB(
                            ArenaDashboardTokens.horizontalPadding,
                            0,
                            ArenaDashboardTokens.horizontalPadding,
                            _scrollBottomPadding(context),
                          ),
                          sliver: SliverToBoxAdapter(
                            child: ConstrainedBox(
                              constraints: BoxConstraints(
                                minHeight: minContentHeight.clamp(0, double.infinity),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  walletAsync.when(
                                    loading: () => const SizedBox(
                                      height: 140,
                                      child: Center(
                                        child: CircularProgressIndicator(
                                          color: AppColors.brand,
                                        ),
                                      ),
                                    ),
                                    error: (e, _) => AppInlineErrorView(error: e),
                                    data: (wallet) => ArenaFinancialBalanceCard(
                                      wallet: wallet,
                                      period: _period,
                                      stats: stats,
                                      onPeriodChanged: (p) =>
                                          setState(() => _period = p),
                                    ),
                                  ),
                                  const SizedBox(height: 24),
                                  ArenaFinancialWithdrawSection(
                                    amountController: _amountController,
                                    pixKey: _pixKey,
                                    amountError: amountError,
                                    canSubmit: canSubmit,
                                    submitting: _submitting,
                                    onWithdrawAll: () =>
                                        _withdrawAll(availableReais),
                                    onEditPix: _editPixKey,
                                    onSubmit: () => _requestWithdrawal(
                                      arenaId,
                                      availableReais,
                                    ),
                                  ),
                                  const SizedBox(height: 28),
                                  if (ledgerAsync.hasError ||
                                      withdrawalsAsync.hasError)
                                    Text(
                                      'Erro ao carregar histórico.',
                                      style: TextStyle(
                                        color: context
                                            .themeColors.onSurfaceMuted,
                                      ),
                                    )
                                  else
                                    ArenaFinancialHistorySection(
                                      movements: filteredMovements,
                                      filter: _historyFilter,
                                      onFilterChanged: (f) =>
                                          setState(() => _historyFilter = f),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
    );
  }
}
