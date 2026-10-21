import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arena/domain/payout_pix_key_type.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_earnings_providers.dart';
import '../../domain/professor_earnings.dart';
import '../../domain/professor_wallet_logic.dart' show professorParseMoney;
import '../../infrastructure/professor_students_repository.dart';
import '../widgets/professor_students_widgets.dart';
import '../wallet/professor_wallet_widgets.dart';

enum _Step { amount, review, done }

/// C2 Valor → C4 Revisar → C5 confirmação (diálogo) → C6 resultado. Destino
/// é a chave PIX do perfil de recebimento (C3), com "Trocar" (C9). Sem
/// tarifa; até R$ 500 sai na hora, acima aguarda a aprovação.
class ProfessorWithdrawPage extends ConsumerStatefulWidget {
  const ProfessorWithdrawPage({super.key});

  @override
  ConsumerState<ProfessorWithdrawPage> createState() =>
      _ProfessorWithdrawPageState();
}

class _ProfessorWithdrawPageState extends ConsumerState<ProfessorWithdrawPage> {
  final _amount = TextEditingController();
  _Step _step = _Step.amount;
  String? _error;
  bool _sending = false;
  ProfessorWithdrawalResult? _result;
  double? _sentAmount;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  void _back() {
    if (_step == _Step.review) {
      setState(() => _step = _Step.amount);
      return;
    }
    popOrGo(context, AppRoutes.professorEarnings);
  }

  void _setAmount(double v) {
    _amount.text = formatBRL(v).replaceAll(RegExp(r'[R$\s ]'), '');
    setState(() => _error = null);
  }

  void _continue(double available, ProfessorPayoutPixKey? key) {
    final amount = professorParseMoney(_amount.text);
    final error = key == null
        ? 'Cadastre sua chave PIX antes de sacar.'
        : validateProfessorWithdrawal(amount, available);
    setState(() => _error = error);
    if (error == null) setState(() => _step = _Step.review);
  }

  Future<void> _confirm(double amount, ProfessorPayoutPixKey key) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmar saque?'),
        content: Text(
          '${formatBRL(amount)} para '
          '${professorMaskedPixKey(key.pixKey, key.type)}. '
          '${amount <= kProfessorWithdrawalAutoMaxReais ? 'O PIX sai na hora.' : 'Acima de ${formatBRL(kProfessorWithdrawalAutoMaxReais)} o saque aguarda a aprovação da plataforma.'}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            key: const Key('professor-withdraw-confirm-dialog'),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sacar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _sending = true);
    try {
      final r = await ref
          .read(professorEarningsRepositoryProvider)
          .requestWithdrawal(amount);
      if (!mounted) return;
      setState(() {
        _result = r;
        _sentAmount = amount;
        _step = _Step.done;
        _sending = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não foi possível pedir o saque.',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final wallet = ref.watch(professorEarningsWalletProvider).valueOrNull;
    final keyAsync = ref.watch(professorPayoutPixKeyProvider);
    final key = keyAsync.valueOrNull;
    final available = wallet?.availableReais ?? 0;
    return switch (_step) {
      _Step.amount => _amountStep(available, key, keyAsync.hasValue),
      _Step.review => _reviewStep(available, key!),
      _Step.done => _doneStep(key),
    };
  }

  Widget _keyCard(ProfessorPayoutPixKey? key, bool loaded) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      key: const Key('professor-withdraw-key'),
      onTap: () => context.pushNamed(AppRouteNames.professorPixKey),
      child: Row(
        children: [
          const Icon(Icons.pix_rounded, color: AppColors.brand),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  key == null
                      ? (loaded ? 'Nenhuma chave PIX' : 'Carregando chave…')
                      : professorMaskedPixKey(key.pixKey, key.type),
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                Text(
                  key == null
                      ? 'Cadastre a chave para receber'
                      : 'Pix · mesma chave do seu perfil de recebimento',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          Text(
            key == null ? 'Cadastrar' : 'Trocar',
            style: ProfessorLinksStyle.display(
              12.5,
              weight: FontWeight.w600,
              color: AppColors.brand,
            ),
          ),
        ],
      ),
    );
  }

  Widget _amountStep(
    double available,
    ProfessorPayoutPixKey? key,
    bool keyLoaded,
  ) {
    final colors = context.themeColors;
    final amount = professorParseMoney(_amount.text);
    final left = amount == null ? null : available - amount;
    return ProfessorLinksScaffold(
      title: 'Sacar',
      subtitle: 'DISPONÍVEL ${formatBRL(available)}',
      onBack: _back,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
              children: [
                const Center(
                  child: ProfessorLinksKicker('Quanto você quer sacar'),
                ),
                const SizedBox(height: 10),
                TextField(
                  key: const Key('professor-withdraw-amount'),
                  controller: _amount,
                  textAlign: TextAlign.center,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[\d.,]')),
                  ],
                  onChanged: (_) => setState(() => _error = null),
                  style: ProfessorLinksStyle.display(
                    40,
                    color: colors.onSurface,
                  ),
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    prefixText: 'R\$ ',
                    hintText: '0,00',
                    hintStyle: ProfessorLinksStyle.display(
                      40,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ),
                if (left != null && left >= 0)
                  Center(
                    child: Text(
                      'Restam ${formatBRL(left)} no saldo',
                      style: AppTypography.bodyS.copyWith(
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final v in const [100.0, 500.0])
                      if (v <= available)
                        ArenaClassChip(
                          key: Key('professor-withdraw-chip-${v.toInt()}'),
                          label: formatBRL(v).replaceAll(',00', ''),
                          selected: amount == v,
                          onTap: () => _setAmount(v),
                        ),
                    ArenaClassChip(
                      key: const Key('professor-withdraw-chip-all'),
                      label: 'Tudo · ${formatBRL(available)}',
                      selected: amount == available && available > 0,
                      onTap: () => _setAmount(available),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                _keyCard(key, keyLoaded),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  ProfessorLinksNote(
                    _error!,
                    key: const Key('professor-withdraw-error'),
                    tone: ProfessorLinksNoteTone.red,
                  ),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('professor-withdraw-continue'),
                label: 'Continuar',
                onPressed: () => _continue(available, key),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _reviewStep(double available, ProfessorPayoutPixKey key) {
    final colors = context.themeColors;
    final amount = professorParseMoney(_amount.text)!;
    return ProfessorLinksScaffold(
      title: 'Revisar saque',
      subtitle: 'CONFIRA ANTES DE ENVIAR',
      onBack: _back,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                const Center(child: ProfessorLinksKicker('Você recebe')),
                const SizedBox(height: 8),
                Center(
                  child: Text(
                    formatBRL(amount),
                    key: const Key('professor-withdraw-review-amount'),
                    style: ProfessorLinksStyle.display(
                      40,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                ProfessorRowsBlock(
                  children: [
                    ProfessorInfoRow(
                      label: 'Valor do saque',
                      value: formatBRL(amount),
                    ),
                    const ProfessorInfoRow(
                      label: 'Tarifa',
                      value: 'Grátis',
                      valueColor: AppColors.win,
                    ),
                    ProfessorInfoRow(
                      label: 'Destino',
                      value: professorMaskedPixKey(key.pixKey, key.type),
                      sub: 'Pix',
                    ),
                    ProfessorInfoRow(
                      key: const Key('professor-withdraw-deadline'),
                      label: 'Prazo',
                      value: professorWithdrawalDeadline(amount),
                      sub: amount <= kProfessorWithdrawalAutoMaxReais
                          ? 'Até ${formatBRL(kProfessorWithdrawalAutoMaxReais)}'
                          : 'Acima de '
                              '${formatBRL(kProfessorWithdrawalAutoMaxReais)} '
                              'a plataforma aprova antes',
                    ),
                    ProfessorInfoRow(
                      label: 'Saldo após o saque',
                      value: formatBRL(available - amount),
                      last: true,
                    ),
                  ],
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('professor-withdraw-confirm'),
                label: 'Confirmar saque',
                loading: _sending,
                onPressed: () => _confirm(amount, key),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _doneStep(ProfessorPayoutPixKey? key) {
    final colors = context.themeColors;
    final r = _result!;
    final sent = r.sent;
    final color = sent ? AppColors.win : AppColors.pending;
    return ProfessorLinksScaffold(
      title: sent ? 'Saque enviado' : 'Saque pedido',
      onBack: () => popOrGo(context, AppRoutes.professorEarnings),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 30, 24, 24),
              children: [
                Center(
                  child: Container(
                    width: 76,
                    height: 76,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: color.withValues(alpha: 0.4)),
                    ),
                    child: Icon(
                      sent ? Icons.check_rounded : Icons.schedule_rounded,
                      size: 34,
                      color: color,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  sent ? 'Saque enviado' : 'Saque em análise',
                  key: const Key('professor-withdraw-done-title'),
                  textAlign: TextAlign.center,
                  style: ProfessorLinksStyle.display(
                    24,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  r.message ??
                      (sent
                          ? '${formatBRL(_sentAmount ?? 0)} a caminho da sua '
                              'conta.'
                          : 'Avisamos quando o PIX sair.'),
                  key: const Key('professor-withdraw-done-message'),
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyM.copyWith(
                    color: ProfessorLinksStyle.mute(colors),
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 24),
                ProfessorRowsBlock(
                  children: [
                    ProfessorInfoRow(
                      label: 'Valor',
                      value: formatBRL(_sentAmount ?? 0),
                    ),
                    ProfessorInfoRow(
                      label: 'Status',
                      value: sent ? 'Enviado' : 'Pendente',
                      valueColor: color,
                    ),
                    ProfessorInfoRow(
                      label: 'Destino',
                      value: key == null
                          ? 'Pix'
                          : professorMaskedPixKey(key.pixKey, key.type),
                      last: true,
                    ),
                  ],
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('professor-withdraw-back'),
                label: 'Voltar para ganhos',
                onPressed: () => popOrGo(context, AppRoutes.professorEarnings),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// C9 Chave PIX: tipo + chave (a do perfil de recebimento — vale também para
/// o organizador). `setProfessorPayoutPixKey`.
class ProfessorPixKeyPage extends ConsumerStatefulWidget {
  const ProfessorPixKeyPage({super.key});

  @override
  ConsumerState<ProfessorPixKeyPage> createState() =>
      _ProfessorPixKeyPageState();
}

class _ProfessorPixKeyPageState extends ConsumerState<ProfessorPixKeyPage> {
  final _key = TextEditingController();
  PayoutPixKeyType? _type;
  bool _loaded = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _key.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final type = _type!;
    final raw = _key.text.trim();
    final error = raw.isEmpty ? 'Informe a chave PIX.' : type.validateKey(raw);
    setState(() => _error = error);
    if (error != null) return;
    setState(() => _saving = true);
    final ok = await runProfessorWalletAction(
      context,
      () => ref.read(professorEarningsRepositoryProvider).setPixKey(
            pixKey: raw,
            pixKeyType: type.asaasValue,
          ),
      message: 'Chave PIX salva.',
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) popOrGo(context, AppRoutes.professorEarnings);
  }

  @override
  Widget build(BuildContext context) {
    final current = ref.watch(professorPayoutPixKeyProvider);
    if (!_loaded && (current.hasValue || current.hasError)) {
      final c = current.valueOrNull;
      _type = c?.type ?? PayoutPixKeyType.cpf;
      _key.text = c?.pixKey ?? '';
      _loaded = true;
    }
    return ProfessorLinksScaffold(
      title: 'Chave Pix',
      subtitle: 'ONDE VOCÊ RECEBE OS SAQUES',
      onBack: () => popOrGo(context, AppRoutes.professorEarnings),
      body: !_loaded
          ? const ProfessorWalletLoading()
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    children: [
                      const ProfessorLinksKicker('Tipo de chave'),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final t in PayoutPixKeyType.values)
                            ArenaClassChip(
                              key: Key('professor-pix-type-${t.name}'),
                              label: t.label,
                              selected: _type == t,
                              onTap: () => setState(() {
                                _type = t;
                                _error = null;
                              }),
                            ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      ProfessorWalletField(
                        key: const Key('professor-pix-key'),
                        label: 'Chave',
                        hint: _type!.hintForField(),
                        controller: _key,
                        error: _error,
                        keyboardType: switch (_type!) {
                          PayoutPixKeyType.email => TextInputType.emailAddress,
                          PayoutPixKeyType.evp => TextInputType.text,
                          _ => TextInputType.number,
                        },
                      ),
                      const SizedBox(height: 14),
                      const ProfessorLinksNote(
                        'Use uma chave no seu CPF. É a mesma chave do seu '
                        'perfil de recebimento no nexaGO (vale também se '
                        'você organiza torneios).',
                      ),
                    ],
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                    child: ProfessorLinksPrimaryButton(
                      key: const Key('professor-pix-save'),
                      label: 'Salvar chave',
                      loading: _saving,
                      onPressed: _save,
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
