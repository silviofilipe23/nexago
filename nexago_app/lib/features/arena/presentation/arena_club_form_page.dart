import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arenas/domain/arena_court.dart';
import '../../arenas/domain/slots_providers.dart';
import '../data/arena_club_service.dart';
import '../domain/arena_club.dart';
import '../domain/arena_club_admin_providers.dart';
import '../domain/arena_schedule_providers.dart';
import 'widgets/arena_async_state.dart';

/// Criar/editar clubinho. Escrita via callable `upsertArenaClub`; a edição só
/// vale para sessões futuras ainda não geradas.
class ArenaClubFormPage extends ConsumerStatefulWidget {
  const ArenaClubFormPage({super.key, this.clubId});

  /// `null` = criação.
  final String? clubId;

  @override
  ConsumerState<ArenaClubFormPage> createState() => _ArenaClubFormPageState();
}

class _ArenaClubFormPageState extends ConsumerState<ArenaClubFormPage> {
  static const List<String> _weekdayShort = [
    'SEG',
    'TER',
    'QUA',
    'QUI',
    'SEX',
    'SÁB',
    'DOM',
  ];

  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _capacityController = TextEditingController();
  final _priceController = TextEditingController();
  final _cancelWindowController = TextEditingController(text: '24');

  bool _weekly = true;
  int _weekday = DateTime.now().weekday;
  TimeOfDay _startTime = const TimeOfDay(hour: 18, minute: 0);
  TimeOfDay _endTime = const TimeOfDay(hour: 21, minute: 0);
  final Set<String> _selectedCourtIds = <String>{};
  bool _allowOnsitePayment = true;
  bool _busy = false;
  bool _prefilled = false;

  bool get _isEdit => widget.clubId != null && widget.clubId!.isNotEmpty;

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _capacityController.dispose();
    _priceController.dispose();
    _cancelWindowController.dispose();
    super.dispose();
  }

  void _prefillFrom(ArenaClub club) {
    if (_prefilled) return;
    _prefilled = true;
    _nameController.text = club.name;
    _descriptionController.text = club.description ?? '';
    _capacityController.text = club.capacity > 0 ? '${club.capacity}' : '';
    _priceController.text =
        club.priceReais > 0 ? club.priceReais.toStringAsFixed(2) : '';
    _cancelWindowController.text = '${club.cancelWindowHours}';
    _weekly = club.isWeekly;
    if (club.weekday != null) _weekday = club.weekday!;
    final start = _parseTime(club.startTime);
    if (start != null) _startTime = start;
    final end = _parseTime(club.endTime);
    if (end != null) _endTime = end;
    _selectedCourtIds
      ..clear()
      ..addAll(club.courtIds);
    _allowOnsitePayment = club.allowOnsitePayment;
  }

  @override
  Widget build(BuildContext context) {
    final managed = ref.watch(managedArenaIdProvider);

    if (_isEdit) {
      final clubAsync = ref.watch(arenaClubProvider(widget.clubId!));
      final club = clubAsync.valueOrNull;
      if (club != null) _prefillFrom(club);
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _FormHeader(
              title: _isEdit ? 'Editar clubinho' : 'Novo clubinho',
              onBack: () => context.pop(),
            ),
            Expanded(
              child: managed.when(
                data: (arenaId) {
                  if (arenaId == null || arenaId.isEmpty) {
                    return const ArenaEmptyState(
                      title: 'Arena não encontrada',
                      message:
                          'Nenhuma arena vinculada ao seu usuário como gestor.',
                      icon: Icons.store_mall_directory_outlined,
                    );
                  }
                  return _buildForm(context, arenaId);
                },
                loading: () =>
                    const ArenaLoadingState(label: 'Carregando arena...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForm(BuildContext context, String arenaId) {
    final theme = Theme.of(context);
    final courts =
        ref.watch(courtsStreamProvider(arenaId)).valueOrNull ??
            const <ArenaCourt>[];

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        Text(
          'Jogo aberto da arena: os atletas colocam o nome na lista pública '
          'e pagam um valor fixo por sessão — PIX antecipado ou, se você '
          'permitir, direto na arena no dia.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            height: 1.4,
          ),
        ),
        if (_isEdit) ...[
          const SizedBox(height: 14),
          DecoratedBox(
            decoration: BoxDecoration(
              color: AppColors.pending.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  const Icon(
                    Icons.info_outline_rounded,
                    color: AppColors.pending,
                    size: 18,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'A edição vale apenas para as sessões futuras ainda '
                      'não geradas. Sessões já criadas não mudam.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurface,
                        fontWeight: FontWeight.w600,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 24),
        _sectionLabel(context, 'NOME'),
        const SizedBox(height: 8),
        TextField(
          controller: _nameController,
          textCapitalization: TextCapitalization.words,
          style: TextStyle(color: context.themeColors.onSurface),
          decoration:
              _inputDecoration(context, hint: 'Ex: Clubinho de sexta'),
        ),
        const SizedBox(height: 20),
        _sectionLabel(context, 'DESCRIÇÃO (OPCIONAL)'),
        const SizedBox(height: 8),
        TextField(
          controller: _descriptionController,
          maxLines: 2,
          textCapitalization: TextCapitalization.sentences,
          style: TextStyle(color: context.themeColors.onSurface),
          decoration: _inputDecoration(
            context,
            hint: 'Ex: nível intermediário, rodízio de duplas',
          ),
        ),
        const SizedBox(height: 20),
        _sectionLabel(context, 'RECORRÊNCIA'),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: [
            _SelectChip(
              label: 'Semanal',
              selected: _weekly,
              onTap: () => setState(() => _weekly = true),
            ),
            _SelectChip(
              label: 'Só sessões avulsas',
              selected: !_weekly,
              onTap: () => setState(() => _weekly = false),
            ),
          ],
        ),
        if (_weekly) ...[
          const SizedBox(height: 14),
          _sectionLabel(context, 'DIA DA SEMANA'),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (var d = 1; d <= 7; d++)
                _SelectChip(
                  label: _weekdayShort[d - 1],
                  selected: _weekday == d,
                  onTap: () => setState(() => _weekday = d),
                ),
            ],
          ),
        ],
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionLabel(context, 'INÍCIO'),
                  const SizedBox(height: 8),
                  _PickerField(
                    label: _formatTimeOfDay(_startTime),
                    icon: Icons.schedule_rounded,
                    onTap: () => _pickTime(isStart: true),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionLabel(context, 'FIM'),
                  const SizedBox(height: 8),
                  _PickerField(
                    label: _formatTimeOfDay(_endTime),
                    icon: Icons.schedule_rounded,
                    onTap: () => _pickTime(isStart: false),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        _sectionLabel(context, 'QUADRAS RESERVADAS'),
        const SizedBox(height: 10),
        if (courts.isEmpty)
          Text(
            'Cadastre quadras na arena antes de criar um clubinho.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
            ),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final court in courts)
                _SelectChip(
                  label: court.name,
                  selected: _selectedCourtIds.contains(court.id),
                  onTap: () => setState(() {
                    if (!_selectedCourtIds.add(court.id)) {
                      _selectedCourtIds.remove(court.id);
                    }
                  }),
                ),
            ],
          ),
        const SizedBox(height: 20),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionLabel(context, 'VAGAS'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _capacityController,
                    keyboardType: TextInputType.number,
                    style: TextStyle(color: context.themeColors.onSurface),
                    decoration: _inputDecoration(context, hint: 'Ex: 24'),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionLabel(context, 'VALOR (R\$)'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _priceController,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    style: TextStyle(color: context.themeColors.onSurface),
                    decoration: _inputDecoration(context, hint: 'Ex: 15.00'),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        _sectionLabel(context, 'PRAZO PARA SAIR COM ESTORNO (HORAS)'),
        const SizedBox(height: 8),
        TextField(
          controller: _cancelWindowController,
          keyboardType: TextInputType.number,
          style: TextStyle(color: context.themeColors.onSurface),
          decoration: _inputDecoration(context, hint: 'Ex: 24'),
        ),
        const SizedBox(height: 6),
        Text(
          'Quem sair da lista até esse prazo antes do início recebe o PIX '
          'de volta automaticamente.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 20),
        _sectionLabel(context, 'PAGAMENTO'),
        const SizedBox(height: 8),
        Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          child: SwitchListTile.adaptive(
            value: _allowOnsitePayment,
            onChanged: (v) => setState(() => _allowOnsitePayment = v),
            activeThumbColor: AppColors.brand,
            activeTrackColor: AppColors.brand.withValues(alpha: 0.45),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            title: Text(
              'Aceitar pagamento na arena',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurface,
                fontWeight: FontWeight.w700,
              ),
            ),
            subtitle: Text(
              'O atleta garante a vaga sem PIX e paga direto na arena no '
              'dia. Desligado, só entra quem pagar o PIX antecipado.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.35,
              ),
            ),
          ),
        ),
        const SizedBox(height: 32),
        FilledButton(
          onPressed: _busy ? null : () => _submit(arenaId),
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
              : Text(
                  _isEdit ? 'Salvar alterações' : 'Criar clubinho',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
        ),
      ],
    );
  }

  Future<void> _submit(String arenaId) async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      showAppSnackBar(context, 'Informe o nome do clubinho.', isError: true);
      return;
    }
    if (_selectedCourtIds.isEmpty) {
      showAppSnackBar(
        context,
        'Selecione ao menos uma quadra.',
        isError: true,
      );
      return;
    }
    final capacity = int.tryParse(_capacityController.text.trim());
    if (capacity == null || capacity <= 0) {
      showAppSnackBar(
        context,
        'Informe um número de vagas válido.',
        isError: true,
      );
      return;
    }
    final price = double.tryParse(
      _priceController.text.replaceAll(',', '.'),
    );
    if (price == null || price <= 0) {
      showAppSnackBar(
        context,
        'Informe um valor por atleta válido.',
        isError: true,
      );
      return;
    }
    final cancelWindow = int.tryParse(_cancelWindowController.text.trim());
    if (cancelWindow == null || cancelWindow < 0) {
      showAppSnackBar(
        context,
        'Informe um prazo de cancelamento válido.',
        isError: true,
      );
      return;
    }
    if (_toMinutes(_endTime) <= _toMinutes(_startTime)) {
      showAppSnackBar(
        context,
        'O horário de fim precisa ser depois do início.',
        isError: true,
      );
      return;
    }

    setState(() => _busy = true);
    try {
      final result = await ref.read(arenaClubServiceProvider).upsertClub(
            clubId: _isEdit ? widget.clubId : null,
            arenaId: arenaId,
            name: name,
            description: _descriptionController.text,
            weekday: _weekly ? _weekday : null,
            startTime: _formatTimeOfDay(_startTime),
            endTime: _formatTimeOfDay(_endTime),
            courtIds: _selectedCourtIds.toList(),
            capacity: capacity,
            priceReais: price,
            cancelWindowHours: cancelWindow,
            allowOnsitePayment: _allowOnsitePayment,
          );
      if (!mounted) return;
      if (result.skippedDates.isNotEmpty) {
        await _showSkippedDatesDialog(result.skippedDates);
      }
      if (!mounted) return;
      showAppSnackBar(
        context,
        _isEdit
            ? 'Clubinho atualizado.'
            : result.createdDates.isNotEmpty
                ? 'Clubinho criado com ${result.createdDates.length} '
                    'sessão(ões) agendada(s).'
                : 'Clubinho criado.',
      );
      context.pop();
    } on ArenaClubAdminException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível salvar o clubinho: $e',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showSkippedDatesDialog(List<String> dates) {
    final labels = dates.map(_formatDateKey).join(', ');
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: Text('${dates.length} data(s) com conflito'),
        content: Text(
          'Estas datas tinham conflito de agenda em todas as quadras e '
          'ficaram sem sessão: $labels.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Entendi'),
          ),
        ],
      ),
    );
  }

  Future<void> _pickTime({required bool isStart}) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: isStart ? _startTime : _endTime,
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _startTime = picked;
      } else {
        _endTime = picked;
      }
    });
  }

  static int _toMinutes(TimeOfDay t) => t.hour * 60 + t.minute;

  static TimeOfDay? _parseTime(String? hhmm) {
    if (hhmm == null || !RegExp(r'^\d{2}:\d{2}').hasMatch(hhmm.trim())) {
      return null;
    }
    final parts = hhmm.trim().split(':');
    return TimeOfDay(
      hour: int.parse(parts[0]),
      minute: int.parse(parts[1].substring(0, 2)),
    );
  }

  static String _formatTimeOfDay(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:'
      '${t.minute.toString().padLeft(2, '0')}';

  static String _formatDateKey(String key) {
    final parts = key.split('-');
    if (parts.length != 3) return key;
    return '${parts[2]}/${parts[1]}';
  }

  Widget _sectionLabel(BuildContext context, String label) {
    return Text(
      label,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
          ),
    );
  }

  InputDecoration _inputDecoration(BuildContext context, {String? hint}) {
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
}

class _FormHeader extends StatelessWidget {
  const _FormHeader({required this.title, required this.onBack});

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
                  'GESTOR · CLUBINHO',
                  textAlign: TextAlign.center,
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

class _SelectChip extends StatelessWidget {
  const _SelectChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.brand : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: selected
                  ? AppColors.black
                  : context.themeColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _PickerField extends StatelessWidget {
  const _PickerField({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: context.themeColors.onSurface,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Icon(
                icon,
                size: 18,
                color: context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
