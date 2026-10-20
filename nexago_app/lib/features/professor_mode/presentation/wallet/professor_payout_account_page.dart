import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_wallet.dart';
import '../../domain/professor_wallet_logic.dart';
import '../../infrastructure/professor_students_repository.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_wallet_widgets.dart';

/// Explicação fixa da conta de recebimento.
const kProfessorPayoutExplanation =
    'Você recebe direto na sua conta Asaas. Depois de criar, confira o e-mail '
    'do Asaas para definir a senha e enviar os documentos; o saque é feito no '
    'app do Asaas. Taxa nexaGO: 5% + tarifa do Asaas';

/// Mais › Receber pelo nexaGO: sem conta, o formulário da subconta Asaas;
/// com conta, a situação (relida no Asaas ao abrir e no botão).
class ProfessorPayoutAccountPage extends ConsumerStatefulWidget {
  const ProfessorPayoutAccountPage({super.key});

  @override
  ConsumerState<ProfessorPayoutAccountPage> createState() =>
      _ProfessorPayoutAccountPageState();
}

class _ProfessorPayoutAccountPageState
    extends ConsumerState<ProfessorPayoutAccountPage> {
  bool _refreshing = false;
  bool _refreshedOnOpen = false;

  /// [silent]: a releitura ao abrir não avisa nem mostra erro (o
  /// servidor devolve a situação gravada se o Asaas falhar).
  Future<void> _refresh({bool silent = false}) async {
    setState(() => _refreshing = true);
    try {
      final status = await ref
          .read(professorWalletRepositoryProvider)
          .refreshAccountStatus();
      if (!silent && mounted && status != null) {
        showAppSnackBar(
          context,
          'Situação: ${professorAccountStatusLabel(status).toLowerCase()}.',
        );
      }
    } catch (e) {
      if (!silent && mounted) {
        showAppSnackBar(
          context,
          e is ProfessorStudentsException
              ? e.message
              : 'Não foi possível consultar a situação.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(professorPayoutAccountProvider);
    final account = async.valueOrNull;
    // Relê a situação no Asaas uma vez, quando a subconta existe.
    if (account != null && account.exists && !_refreshedOnOpen) {
      _refreshedOnOpen = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _refresh(silent: true);
      });
    }
    return ProfessorLinksScaffold(
      title: 'Receber pelo nexaGO',
      subtitle: 'CONTA DE RECEBIMENTO',
      onBack: () => popOrGo(context, AppRoutes.professorMore),
      body: switch (async) {
        AsyncValue(hasValue: false, hasError: true) => ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
            children: [
              ProfessorRetryCard(
                message: 'Não foi possível carregar sua conta.',
                onRetry: () => ref.invalidate(professorPayoutAccountProvider),
              ),
            ],
          ),
        AsyncValue(hasValue: false) => const ProfessorWalletLoading(),
        // Sem conta ou a última criação falhou: o formulário (de novo).
        _ => account == null || account.status == ProfessorAccountStatus.failed
            ? _AccountForm(failed: account != null)
            : _AccountStatus(
                account: account,
                refreshing: _refreshing,
                onRefresh: () => _refresh(),
              ),
      },
    );
  }
}

class _AccountStatus extends StatelessWidget {
  const _AccountStatus({
    required this.account,
    required this.refreshing,
    required this.onRefresh,
  });

  final ProfessorPayoutAccount account;
  final bool refreshing;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color = switch (account.status) {
      ProfessorAccountStatus.approved => AppColors.win,
      ProfessorAccountStatus.pending ||
      ProfessorAccountStatus.creating =>
        AppColors.pending,
      ProfessorAccountStatus.rejected ||
      ProfessorAccountStatus.failed =>
        AppColors.live,
    };
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        ProfessorLinksCard(
          key: const Key('professor-account-status-card'),
          borderColor: color.withValues(alpha: 0.4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Conta Asaas',
                      style: ProfessorLinksStyle.display(
                        16,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  ProfessorWalletTag(
                    professorAccountStatusLabel(account.status),
                    key: const Key('professor-account-status'),
                    color: color,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              ProfessorMutedText(professorAccountStatusCopy(account.status)),
            ],
          ),
        ),
        if (account.exists) ...[
          const SizedBox(height: 18),
          ProfessorRowsBlock(
            children: [
              ProfessorInfoRow(label: 'Nome', value: account.name),
              ProfessorInfoRow(label: 'E-mail', value: account.email),
              ProfessorInfoRow(
                label: 'CPF',
                value: account.cpfMasked ?? '—',
                last: true,
              ),
            ],
          ),
        ],
        const SizedBox(height: 18),
        const ProfessorLinksNote(
          kProfessorPayoutExplanation,
          tone: ProfessorLinksNoteTone.blue,
        ),
        const SizedBox(height: 18),
        ProfessorLinksGhostButton(
          key: const Key('professor-account-refresh'),
          label: 'Atualizar situação',
          loading: refreshing,
          onPressed: onRefresh,
        ),
        const SizedBox(height: 10),
        const ProfessorActionHintText(
          'Para trocar os dados da conta, fale com o suporte do nexaGO.',
        ),
      ],
    );
  }
}

/// Texto pequeno centralizado.
class ProfessorActionHintText extends StatelessWidget {
  const ProfessorActionHintText(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        textAlign: TextAlign.center,
        style: ProfessorLinksStyle.mono(
          10,
          weight: FontWeight.w500,
          color: ProfessorLinksStyle.dim(context.themeColors),
        ),
      );
}

class _AccountForm extends ConsumerStatefulWidget {
  const _AccountForm({this.failed = false});

  /// A tentativa anterior não criou a conta.
  final bool failed;

  @override
  ConsumerState<_AccountForm> createState() => _AccountFormState();
}

class _AccountFormState extends ConsumerState<_AccountForm> {
  final _c = {
    for (final f in ProfessorAccountField.values) f: TextEditingController(),
  };
  Map<ProfessorAccountField, String> _errors = const {};
  bool _saving = false;

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  ProfessorAccountForm get _form => ProfessorAccountForm(
        name: _c[ProfessorAccountField.name]!.text,
        cpf: _c[ProfessorAccountField.cpf]!.text,
        email: _c[ProfessorAccountField.email]!.text,
        mobilePhone: _c[ProfessorAccountField.mobilePhone]!.text,
        birthDate: _c[ProfessorAccountField.birthDate]!.text,
        incomeValue: _c[ProfessorAccountField.incomeValue]!.text,
        postalCode: _c[ProfessorAccountField.postalCode]!.text,
        address: _c[ProfessorAccountField.address]!.text,
        addressNumber: _c[ProfessorAccountField.addressNumber]!.text,
        complement: _c[ProfessorAccountField.complement]!.text,
        province: _c[ProfessorAccountField.province]!.text,
      );

  Future<void> _submit() async {
    final form = _form;
    final errors = validateProfessorAccountForm(
      form,
      todayKey: ref.read(professorWalletTodayKeyProvider),
    );
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;
    setState(() => _saving = true);
    await runProfessorWalletAction(
      context,
      () => ref
          .read(professorWalletRepositoryProvider)
          .createAccount(professorAccountPayload(form)),
      message: 'Conta criada! Confira seu e-mail do Asaas.',
    );
    if (mounted) setState(() => _saving = false);
  }

  Widget _field(
    ProfessorAccountField f,
    String label, {
    String? hint,
    TextInputType? keyboard,
    bool digitsOnly = false,
    int? maxLength,
    TextCapitalization caps = TextCapitalization.none,
  }) =>
      ProfessorWalletField(
        key: Key('professor-account-${f.name}'),
        label: label,
        controller: _c[f]!,
        hint: hint,
        error: _errors[f],
        keyboardType: keyboard,
        maxLength: maxLength,
        textCapitalization: caps,
        inputFormatters: digitsOnly
            ? [FilteringTextInputFormatter.allow(RegExp(r'[\d./-]'))]
            : null,
      );

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(height: 14);
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            children: [
              if (widget.failed) ...[
                ProfessorLinksNote(
                  professorAccountStatusCopy(ProfessorAccountStatus.failed),
                  key: const Key('professor-account-failed'),
                  tone: ProfessorLinksNoteTone.red,
                ),
                const SizedBox(height: 10),
              ],
              const ProfessorLinksNote(
                kProfessorPayoutExplanation,
                tone: ProfessorLinksNoteTone.blue,
              ),
              const SizedBox(height: 18),
              _field(ProfessorAccountField.name, 'Nome completo',
                  caps: TextCapitalization.words, maxLength: 100),
              gap,
              _field(ProfessorAccountField.cpf, 'CPF',
                  hint: '000.000.000-00',
                  keyboard: TextInputType.number,
                  digitsOnly: true,
                  maxLength: 14),
              gap,
              _field(ProfessorAccountField.email, 'E-mail',
                  keyboard: TextInputType.emailAddress, maxLength: 120),
              gap,
              _field(ProfessorAccountField.mobilePhone, 'Celular',
                  hint: '(62) 99999-0000', keyboard: TextInputType.phone),
              gap,
              _field(ProfessorAccountField.birthDate, 'Data de nascimento',
                  hint: 'DD/MM/AAAA',
                  keyboard: TextInputType.datetime,
                  digitsOnly: true,
                  maxLength: 10),
              gap,
              _field(ProfessorAccountField.incomeValue, 'Renda mensal (R\$)',
                  hint: 'Ex.: 4.000',
                  keyboard:
                      const TextInputType.numberWithOptions(decimal: true)),
              gap,
              _field(ProfessorAccountField.postalCode, 'CEP',
                  hint: '00000-000',
                  keyboard: TextInputType.number,
                  digitsOnly: true,
                  maxLength: 9),
              gap,
              _field(ProfessorAccountField.address, 'Endereço',
                  hint: 'Rua, avenida…', maxLength: 120),
              gap,
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _field(ProfessorAccountField.addressNumber, 'Número',
                        maxLength: 20),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: _field(
                        ProfessorAccountField.complement, 'Complemento',
                        hint: 'Opcional', maxLength: 60),
                  ),
                ],
              ),
              gap,
              _field(ProfessorAccountField.province, 'Bairro', maxLength: 80),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: ProfessorLinksPrimaryButton(
              key: const Key('professor-account-submit'),
              label: 'Criar conta de recebimento',
              loading: _saving,
              onPressed: _submit,
            ),
          ),
        ),
      ],
    );
  }
}
