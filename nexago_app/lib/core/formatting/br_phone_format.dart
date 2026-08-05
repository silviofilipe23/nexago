/// Formata telefone brasileiro para exibição (10 ou 11 dígitos).
///
/// Aceita também E.164 (`+5562999999999`), formato gravado em
/// `users/{uid}.phoneNumber` pela Cloud Function `confirmPhoneVerification`
/// depois da verificação por SMS — o código do país sai antes da máscara.
String? formatPhoneBrDisplay(String? raw) {
  var digits = (raw ?? '').replaceAll(RegExp(r'\D'), '');
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) {
    digits = digits.substring(2);
  }
  if (digits.length < 10) return null;
  if (digits.length == 11) {
    return '(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}';
  }
  if (digits.length == 10) {
    return '(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}';
  }
  return digits;
}
