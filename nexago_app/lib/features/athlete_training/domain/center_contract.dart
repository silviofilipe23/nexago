/// Contratos do Centro de Treinamento — parte pura, compartilhada pelo app do
/// aluno (K6–K9) e pela gestão do centro (K5).
///
/// Espelho de `contractState` em `functions/src/training-center-contracts-model.ts`:
/// `signed` com `endDate` antes de hoje é **expirado**; com `endDate` em até
/// [contractExpiringDays] dias é **renova em breve**. O texto do contrato é
/// texto puro: parágrafos separados por linha em branco; linha que começa com
/// `# ` é título de seção.
library;

/// Dias antes do fim da vigência em que o contrato "renova em breve".
const contractExpiringDays = 30;

/// Situação do contrato para as listas (status salvo + vencimento).
enum ContractState {
  sent,
  viewed,
  signed,
  expiring,
  expired,
  declined,
  terminated,
  cancelled,
}

/// Tom da etiqueta (o protótipo: amarelo, laranja, verde, vermelho, apagado).
enum ContractTone { yellow, orange, green, red, dim }

/// Situação a partir do status salvo e da vigência ([todayKey] `YYYY-MM-DD`).
ContractState contractStateOf(String status, String? endDate, String todayKey) {
  final end = endDate ?? '';
  if (status == 'signed' && end.isNotEmpty && todayKey.isNotEmpty) {
    if (end.compareTo(todayKey) < 0) return ContractState.expired;
    final limit = contractAddDays(todayKey, contractExpiringDays);
    if (limit.isNotEmpty && end.compareTo(limit) <= 0) {
      return ContractState.expiring;
    }
  }
  return switch (status) {
    'viewed' => ContractState.viewed,
    'signed' => ContractState.signed,
    'declined' => ContractState.declined,
    'terminated' => ContractState.terminated,
    'cancelled' => ContractState.cancelled,
    _ => ContractState.sent,
  };
}

/// Ainda espera a resposta do aluno.
bool contractStateIsOpen(ContractState s) =>
    s == ContractState.sent || s == ContractState.viewed;

/// Vai para o "Histórico" (não vale mais).
bool contractStateIsHistory(ContractState s) =>
    s == ContractState.expired ||
    s == ContractState.declined ||
    s == ContractState.terminated ||
    s == ContractState.cancelled;

String contractStateLabel(ContractState s) => switch (s) {
      ContractState.sent => 'Aguardando assinatura',
      ContractState.viewed => 'Aberto · não assinado',
      ContractState.signed => 'Assinado',
      ContractState.expiring => 'Renova em breve',
      ContractState.expired => 'Expirado',
      ContractState.declined => 'Recusado',
      ContractState.terminated => 'Encerrado',
      ContractState.cancelled => 'Cancelado',
    };

/// Rótulo curto para a etiqueta das listas.
String contractStateShortLabel(ContractState s) => switch (s) {
      ContractState.sent => 'Enviado',
      ContractState.viewed => 'Aberto',
      ContractState.signed => 'Assinado',
      ContractState.expiring => 'Renova em breve',
      ContractState.expired => 'Expirado',
      ContractState.declined => 'Recusado',
      ContractState.terminated => 'Encerrado',
      ContractState.cancelled => 'Cancelado',
    };

ContractTone contractStateTone(ContractState s) => switch (s) {
      ContractState.sent => ContractTone.yellow,
      ContractState.viewed || ContractState.expiring => ContractTone.orange,
      ContractState.signed => ContractTone.green,
      ContractState.expired => ContractTone.red,
      ContractState.declined ||
      ContractState.terminated ||
      ContractState.cancelled =>
        ContractTone.dim,
    };

/// Linha de apoio na lista do aluno (K6). [signedDay] é o dia da assinatura
/// no fuso do centro (`YYYY-MM-DD`).
String contractStudentLine({
  required ContractState state,
  required bool optional,
  required int version,
  String? signedDay,
  String? endDate,
}) {
  final day = signedDay == null ? '' : contractDayMonth(signedDay);
  final on = day.isEmpty ? '' : ' $day';
  return switch (state) {
    ContractState.sent ||
    ContractState.viewed =>
      optional ? 'Opcional · você pode recusar' : 'Aguardando sua assinatura',
    ContractState.signed => 'Assinado$on · v$version',
    ContractState.expiring =>
      'Assinado$on · vence ${contractDayMonth(endDate ?? '')}',
    ContractState.expired =>
      'Vigência terminou ${contractDayMonth(endDate ?? '')}',
    ContractState.declined => 'Não autorizado$on',
    ContractState.terminated => 'Assinado$on · encerrado',
    ContractState.cancelled => 'Cancelado pelo centro',
  };
}

// ── texto do contrato ────────────────────────────────────────────────────

/// Um bloco do texto: título de seção ou parágrafo.
class ContractBlock {
  const ContractBlock.heading(this.text) : isHeading = true;
  const ContractBlock.paragraph(this.text) : isHeading = false;

  final String text;
  final bool isHeading;

  @override
  bool operator ==(Object other) =>
      other is ContractBlock &&
      other.text == text &&
      other.isHeading == isHeading;

  @override
  int get hashCode => Object.hash(text, isHeading);

  @override
  String toString() => isHeading ? '# $text' : text;
}

/// Quebra o texto em títulos (`# `) e parágrafos (separados por linha em
/// branco). Linhas seguidas do mesmo parágrafo ficam com a quebra.
List<ContractBlock> parseContractBody(String body) {
  final out = <ContractBlock>[];
  final buffer = <String>[];
  void flush() {
    if (buffer.isEmpty) return;
    out.add(ContractBlock.paragraph(buffer.join('\n')));
    buffer.clear();
  }

  for (final raw in body.replaceAll('\r\n', '\n').split('\n')) {
    final line = raw.trimRight();
    if (line.trim().isEmpty) {
      flush();
    } else if (line.trimLeft().startsWith('# ')) {
      flush();
      final title = line.trimLeft().substring(2).trim();
      if (title.isNotEmpty) out.add(ContractBlock.heading(title));
    } else {
      buffer.add(line.trim());
    }
  }
  flush();
  return out;
}

/// Frase do aceite (K8). No menor, a conta vinculada assina declarando ser o
/// responsável legal.
String contractAgreementText({
  required String kind,
  required String title,
  required String centerName,
  required bool asGuardian,
  required String signerName,
  required String studentName,
}) {
  if (asGuardian) {
    return 'Sou $signerName, responsável legal por $studentName, e concordo '
        'com o contrato.';
  }
  final doc =
      kind == 'enrollment' ? 'o contrato de matrícula' : 'o documento "$title"';
  return 'Li e concordo com $doc do $centerName.';
}

// ── datas ────────────────────────────────────────────────────────────────

const _months = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/// `YYYY-MM-DD` + [days] (vazio se inválido).
String contractAddDays(String key, int days) {
  final d = _parseKey(key);
  if (d == null) return '';
  final r = DateTime.utc(d.year, d.month, d.day + days);
  return '${r.year.toString().padLeft(4, '0')}-'
      '${r.month.toString().padLeft(2, '0')}-'
      '${r.day.toString().padLeft(2, '0')}';
}

/// Dias de [fromKey] até [toKey] (ambos `YYYY-MM-DD`); `null` se inválido.
int? contractDaysBetween(String fromKey, String toKey) {
  final a = _parseKey(fromKey);
  final b = _parseKey(toKey);
  if (a == null || b == null) return null;
  return b.difference(a).inDays;
}

/// "24 out"; com [withYear], "24 out 2026".
String contractDayMonth(String key, {bool withYear = false}) {
  final d = _parseKey(key);
  if (d == null) return '';
  final base = '${d.day.toString().padLeft(2, '0')} ${_months[d.month - 1]}';
  return withYear ? '$base ${d.year}' : base;
}

/// "24 out 2026 · 14:31" de uma parede (já no fuso do centro).
String contractWallLabel(DateTime wall) =>
    '${wall.day.toString().padLeft(2, '0')} ${_months[wall.month - 1]} '
    '${wall.year} · ${wall.hour.toString().padLeft(2, '0')}:'
    '${wall.minute.toString().padLeft(2, '0')}';

/// "24 out 26 a 23 out 27" ou "Indeterminado" (termo sem vigência).
String contractTermLabel(String? startDate, String? endDate) {
  final s = startDate ?? '';
  final e = endDate ?? '';
  if (s.isEmpty && e.isEmpty) return 'Indeterminado';
  String short(String k) {
    final d = _parseKey(k);
    if (d == null) return '';
    return '${contractDayMonth(k)} ${(d.year % 100).toString().padLeft(2, '0')}';
  }

  if (e.isEmpty) return 'Desde ${short(s)}';
  if (s.isEmpty) return 'Até ${short(e)}';
  return '${short(s)} a ${short(e)}';
}

DateTime? _parseKey(String key) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(key.trim());
  if (m == null) return null;
  final mo = int.parse(m[2]!);
  if (mo < 1 || mo > 12) return null;
  return DateTime.utc(int.parse(m[1]!), mo, int.parse(m[3]!));
}
