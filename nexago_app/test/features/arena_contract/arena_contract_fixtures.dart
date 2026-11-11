import 'package:nexago_app/features/arena_contract/domain/arena_contract.dart';

/// Payload de um contrato como a callable `getMyArenaContracts` devolve
/// (`AthleteContract` em `functions/src/arena-crm-athlete-model.ts`).
Map<String, dynamic> contractMap({
  String id = 'c1',
  String arenaId = 'a1',
  String arenaName = 'Arena CFC',
  String planName = 'Mensalista 3h',
  String period = 'monthly',
  int dueDay = 15,
  num weeklyHours = 3,
  num monthlyPriceReais = 300,
  String? endDate,
  bool autoRenew = true,
  String status = 'active',
  String? nextDueDate = '2026-11-15',
  int overdueCount = 0,
  num overdueReais = 0,
  String? overdueSince,
  int paidInstallments = 2,
  int? totalInstallments,
  List<Map<String, dynamic>>? installments,
  Map<String, dynamic>? payLink,
  List<Map<String, dynamic>> payments = const [],
  List<num> weekHours = const [2, 3, 1, 0, 3, 2.5, 3, 1.5],
  String? arenaWhatsapp = '5562999990000',
}) =>
    {
      'id': id,
      'arenaId': arenaId,
      'arenaName': arenaName,
      'arenaLogoUrl': null,
      'arenaWhatsapp': arenaWhatsapp,
      'planName': planName,
      'period': period,
      'dueDay': dueDay,
      'weeklyHours': weeklyHours,
      'monthlyPriceReais': monthlyPriceReais,
      'startDate': '2026-09-15',
      'endDate': endDate,
      'autoRenew': autoRenew,
      'status': status,
      'nextDueDate': nextDueDate,
      'overdueCount': overdueCount,
      'overdueReais': overdueReais,
      'overdueSince': overdueSince,
      'paidInstallments': paidInstallments,
      'totalInstallments': totalInstallments,
      'installments': installments ??
          [
            {
              'number': 1,
              'month': '2026-09',
              'dueDate': '2026-09-15',
              'amountReais': 300,
              'state': 'paid',
            },
            {
              'number': 2,
              'month': '2026-10',
              'dueDate': '2026-10-15',
              'amountReais': 300,
              'state': 'paid',
            },
            {
              'number': 3,
              'month': '2026-11',
              'dueDate': '2026-11-15',
              'amountReais': 300,
              'state': 'open',
            },
            {
              'number': 4,
              'month': '2026-12',
              'dueDate': '2026-12-15',
              'amountReais': 300,
              'state': 'future',
            },
          ],
      'payLink': payLink,
      'payments': payments,
      'weekHours': weekHours,
    };

/// Contrato com duas mensalidades em atraso.
Map<String, dynamic> overdueContractMap({
  String id = 'c1',
  Map<String, dynamic>? payLink,
  String? arenaWhatsapp = '5562999990000',
}) =>
    contractMap(
      id: id,
      status: 'overdue',
      nextDueDate: '2026-11-15',
      overdueCount: 2,
      overdueReais: 600,
      overdueSince: '2026-09-15',
      paidInstallments: 0,
      payLink: payLink,
      arenaWhatsapp: arenaWhatsapp,
      installments: [
        {
          'number': 1,
          'month': '2026-09',
          'dueDate': '2026-09-15',
          'amountReais': 300,
          'state': payLink == null ? 'late' : 'link',
        },
        {
          'number': 2,
          'month': '2026-10',
          'dueDate': '2026-10-15',
          'amountReais': 300,
          'state': payLink == null ? 'late' : 'link',
        },
        {
          'number': 3,
          'month': '2026-11',
          'dueDate': '2026-11-15',
          'amountReais': 300,
          'state': 'open',
        },
      ],
    );

ArenaContract contract({
  String id = 'c1',
  String? nextDueDate = '2026-11-15',
  Map<String, dynamic>? payLink,
  num weeklyHours = 3,
  List<num> weekHours = const [2, 3, 1, 0, 3, 2.5, 3, 1.5],
  String arenaName = 'Arena CFC',
  String period = 'monthly',
  bool autoRenew = true,
  String? endDate,
  int dueDay = 15,
}) =>
    ArenaContract.fromMap(contractMap(
      id: id,
      nextDueDate: nextDueDate,
      payLink: payLink,
      weeklyHours: weeklyHours,
      weekHours: weekHours,
      arenaName: arenaName,
      period: period,
      autoRenew: autoRenew,
      endDate: endDate,
      dueDay: dueDay,
    ));

ArenaContract overdueContract(
        {String id = 'c1', Map<String, dynamic>? payLink}) =>
    ArenaContract.fromMap(overdueContractMap(id: id, payLink: payLink));

const payLinkMap = <String, dynamic>{
  'invoiceUrl': 'https://www.asaas.com/i/crm1',
  'amountReais': 612.5,
  'installments': 2,
};
