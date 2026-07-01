import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arena/domain/payout_pix_key_type.dart';
import '../data/organizer_wallet_repository.dart';
import '../domain/organizer_wallet_providers.dart';

const double _minWithdrawalReais = 20;

class OrganizerFinancialPage extends ConsumerStatefulWidget {
  const OrganizerFinancialPage({super.key});

  @override
  ConsumerState<OrganizerFinancialPage> createState() =>
      _OrganizerFinancialPageState();
}

class _OrganizerFinancialPageState
    extends ConsumerState<OrganizerFinancialPage> {
  final _amountController = TextEditingController();
  PayoutPixKeyType _pixKeyType = PayoutPixKeyType.cpf;
  String _pixKey = '';
  bool _submitting = false;
  bool _prefilled = false;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  double? _parsedAmount() {
    final raw = _amountController.text.trim().replaceAll(',', '.');
    if (raw.isEmpty) return null;
    return double.tryParse(raw);
  }

  String? _amountError(double available) {
    final raw = _amountController.text.trim();
    if (raw.isEmpty) return null;
    final amount = _parsedAmount();
    if (amount == null) return 'Informe um valor válido.';
    if (amount < _minWithdrawalReais) {
      return 'Mínimo: ${formatBRL(_minWithdrawalReais)}.';
    }
    if (amount > available + 0.001) {
      return 'Máximo disponível: ${formatBRL(available)}.';
    }
    return null;
  }

  bool _canSubmit(double available) {
    if (_submitting) return false;
    if (_pixKey.trim().length < 5) return false;
    if (_pixKeyType.validateKey(_pixKey) != null) return false;
    final amount = _parsedAmount();
    if (amount == null || amount < _minWithdrawalReais) return false;
    return _amountError(available) == null;
  }

  void _withdrawAll(double available) {
    if (available <= 0) return;
    _amountController.text = available.toStringAsFixed(2).replaceAll('.', ',');
    setState(() {});
  }

  Future<void> _editPixKey() async {
    final result = await showModalBottomSheet<(PayoutPixKeyType, String)>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _PixKeyEditSheet(
        initialType: _pixKeyType,
        initialKey: _pixKey,
      ),
    );
    if (result == null) return;
    setState(() {
      _pixKeyType = result.$1;
      _pixKey = result.$2;
    });
    try {
      await ref.read(organizerWalletRepositoryProvider).setPayoutPixKey(
            pixKey: result.$2,
            pixKeyType: result.$1.asaasValue,
          );
      if (mounted) showAppSnackBar(context, 'Chave PIX salva.');
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Não foi possível salvar a chave: $e',
            isError: true);
      }
    }
  }

  Future<void> _requestWithdrawal(double available) async {
    final amount = _parsedAmount();
    final error = _amountError(available);
    if (error != null) {
      showAppSnackBar(context, error, isError: true);
      return;
    }
    if (amount == null || amount < _minWithdrawalReais) return;
    if (_pixKeyType.validateKey(_pixKey) != null) {
      showAppSnackBar(context, 'Informe uma chave PIX válida.', isError: true);
      return;
    }

    setState(() => _submitting = true);
    try {
      final result =
          await ref.read(organizerWalletRepositoryProvider).requestWithdrawal(
                amountReais: amount,
                pixKey: _pixKey.trim(),
                pixKeyType: _pixKeyType.asaasValue,
              );
      if (!mounted) return;
      _amountController.clear();
      showAppSnackBar(
        context,
        _resultMessage(result),
        isError: result.status == 'pending' && result.payoutStatus == 'failed',
      );
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Não foi possível solicitar: $e', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _resultMessage(OrganizerWithdrawalRequestResult r) {
    if (r.autoProcessed && r.status == 'approved' && r.payoutStatus == 'sent') {
      return 'PIX enviado. O valor deve cair em instantes na sua chave.';
    }
    if (r.message != null && r.message!.trim().isNotEmpty) {
      return r.message!.trim();
    }
    if (r.status == 'pending' && r.processingMode == 'manual_review') {
      return 'Saque acima de R\$ 500. Aguardando aprovação da plataforma.';
    }
    return 'Saque solicitado. Aguarde aprovação.';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final walletAsync = ref.watch(organizerWalletProvider);
    final ledger = ref.watch(organizerWalletLedgerProvider).valueOrNull ??
        const <OrganizerLedgerEntry>[];
    final withdrawals = ref.watch(organizerWithdrawalsProvider).valueOrNull ??
        const <OrganizerWithdrawalItem>[];

    final wallet = walletAsync.valueOrNull ?? OrganizerWalletSummary.empty;
    final available = wallet.availableReais;

    // Prefill único da chave PIX cadastrada.
    if (!_prefilled && wallet.payoutPixKey.trim().length >= 5) {
      _prefilled = true;
      _pixKey = wallet.payoutPixKey.trim();
      _pixKeyType = PayoutPixKeyType.initial(
        storedType: wallet.payoutPixKeyType,
        pixKey: _pixKey,
      );
    }

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: AppBar(
        backgroundColor: colors.canvas,
        elevation: 0,
        title: const Text('Financeiro'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: walletAsync.isLoading && walletAsync.valueOrNull == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                children: [
                  _BalanceCard(wallet: wallet),
                  const SizedBox(height: 20),
                  _PixKeyRow(
                    pixKey: _pixKey,
                    keyType: _pixKeyType,
                    onEdit: _editPixKey,
                  ),
                  const SizedBox(height: 20),
                  _WithdrawCard(
                    amountController: _amountController,
                    amountError: _amountError(available),
                    canSubmit: _canSubmit(available),
                    submitting: _submitting,
                    hasPixKey: _pixKey.trim().length >= 5,
                    onChanged: () => setState(() {}),
                    onWithdrawAll: () => _withdrawAll(available),
                    onSubmit: () => _requestWithdrawal(available),
                  ),
                  const SizedBox(height: 28),
                  _SectionTitle('Saques'),
                  const SizedBox(height: 8),
                  if (withdrawals.isEmpty)
                    _EmptyLine('Nenhum saque ainda.')
                  else
                    ...withdrawals.map((w) => _WithdrawalTile(item: w)),
                  const SizedBox(height: 24),
                  _SectionTitle('Recebimentos de inscrições'),
                  const SizedBox(height: 8),
                  if (ledger.isEmpty)
                    _EmptyLine('Nenhum recebimento ainda.')
                  else
                    ...ledger.map((e) => _LedgerTile(entry: e)),
                ],
              ),
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.wallet});

  final OrganizerWalletSummary wallet;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Disponível para saque',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            formatBRL(wallet.availableReais),
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
          ),
          if (wallet.pendingReais > 0.001) ...[
            const SizedBox(height: 6),
            Text(
              '${formatBRL(wallet.pendingReais)} em processamento',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.pending,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PixKeyRow extends StatelessWidget {
  const _PixKeyRow({
    required this.pixKey,
    required this.keyType,
    required this.onEdit,
  });

  final String pixKey;
  final PayoutPixKeyType keyType;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final hasKey = pixKey.trim().length >= 5;
    return Material(
      color: colors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onEdit,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(Icons.pix_rounded, color: AppColors.brand, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Chave PIX de repasse',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: colors.onSurfaceMuted,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      hasKey ? '${keyType.label} · $pixKey' : 'Cadastrar chave',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.edit_rounded, color: colors.onSurfaceMuted, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class _WithdrawCard extends StatelessWidget {
  const _WithdrawCard({
    required this.amountController,
    required this.amountError,
    required this.canSubmit,
    required this.submitting,
    required this.hasPixKey,
    required this.onChanged,
    required this.onWithdrawAll,
    required this.onSubmit,
  });

  final TextEditingController amountController;
  final String? amountError;
  final bool canSubmit;
  final bool submitting;
  final bool hasPixKey;
  final VoidCallback onChanged;
  final VoidCallback onWithdrawAll;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: amountController,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                  ],
                  onChanged: (_) => onChanged(),
                  decoration: InputDecoration(
                    labelText: 'Valor do saque',
                    prefixText: 'R\$ ',
                    errorText: amountError,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              TextButton(onPressed: onWithdrawAll, child: const Text('Tudo')),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 50,
            child: FilledButton(
              onPressed: canSubmit ? onSubmit : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.35),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: submitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.black,
                      ),
                    )
                  : const Text(
                      'Solicitar saque',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
            ),
          ),
          if (!hasPixKey) ...[
            const SizedBox(height: 8),
            Text(
              'Cadastre uma chave PIX acima para sacar.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}

class _WithdrawalTile extends StatelessWidget {
  const _WithdrawalTile({required this.item});

  final OrganizerWithdrawalItem item;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (label, color) = switch (item.status) {
      'approved' => ('Aprovado', AppColors.win),
      'rejected' => ('Rejeitado', AppColors.live),
      _ => ('Pendente', AppColors.pending),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  formatBRL(item.amountReais),
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                ),
                Text(
                  _formatDate(item.createdAt),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              label,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w700,
                fontSize: 11,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LedgerTile extends StatelessWidget {
  const _LedgerTile({required this.entry});

  final OrganizerLedgerEntry entry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '+ ${formatBRL(entry.netReais)}',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppColors.win,
                      ),
                ),
                Text(
                  '${_formatDate(entry.createdAt)} · taxa ${formatBRL(entry.platformFeeReais)}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
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

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
    );
  }
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
          ),
    );
  }
}

String _formatDate(DateTime? d) {
  if (d == null) return '';
  return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}

class _PixKeyEditSheet extends StatefulWidget {
  const _PixKeyEditSheet({required this.initialType, required this.initialKey});

  final PayoutPixKeyType initialType;
  final String initialKey;

  @override
  State<_PixKeyEditSheet> createState() => _PixKeyEditSheetState();
}

class _PixKeyEditSheetState extends State<_PixKeyEditSheet> {
  late PayoutPixKeyType _type;
  late TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _type = widget.initialType;
    _controller = TextEditingController(text: widget.initialKey);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final key = _controller.text.trim();
    final error = key.isEmpty ? null : _type.validateKey(key);
    final canSave = key.length >= 5 && error == null;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: 20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Chave PIX de repasse',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<PayoutPixKeyType>(
            initialValue: _type,
            decoration: const InputDecoration(
              labelText: 'Tipo',
              border: OutlineInputBorder(),
            ),
            items: PayoutPixKeyType.values
                .map((t) => DropdownMenuItem(value: t, child: Text(t.label)))
                .toList(),
            onChanged: (t) => setState(() => _type = t ?? _type),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Chave',
              hintText: _type.hintForField(),
              errorText: error,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 50,
            child: FilledButton(
              onPressed: canSave
                  ? () => Navigator.of(context).pop((_type, key))
                  : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.35),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text('Salvar',
                  style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
  }
}
