/** Validação dos campos livres do onboarding do atleta (data de nascimento e WhatsApp).
 *
 *  Mais estrito que `AthleteOnboardingDraft` do Flutter em dois pontos, por decisão
 *  de produto (23/07/2026): idade mínima de 13 anos e recusa de telefone fixo — o
 *  campo é rotulado "WhatsApp" e um fixo nunca receberia a mensagem. O formato
 *  gravado no Firestore continua o mesmo (`YYYY-MM-DD`, ver athlete_firestore_codes.dart).
 */

export const MIN_AGE_YEARS = 13;

/** Ano mínimo aceito — mesmo piso de `_isBirthDateValid` no Flutter. */
const MIN_BIRTH_YEAR = 1900;

/** DDDs em uso no Brasil (Anatel). Fora dessa lista o número não existe. */
const VALID_AREA_CODES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** `dd/mm/aaaa` → `YYYY-MM-DD`, rejeitando datas que não existem no calendário
 *  (31/02, por exemplo). Não aplica as regras de idade — use `validateBirthDate`. */
export function birthDateBrToIso(raw: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(m) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${m}-${d}`;
}

/** Data mínima aceita pelo `<input type="date">` nativo — mesmo piso de `MIN_BIRTH_YEAR`. */
export const MIN_NATIVE_BIRTH_DATE_ISO = `${MIN_BIRTH_YEAR}-01-01`;

/** Data máxima aceita pelo `<input type="date">` nativo — hoje menos `MIN_AGE_YEARS`,
 *  mesmo piso de idade mínima usado em `validateBirthDate`. Formato ISO (`YYYY-MM-DD`). */
export function maxNativeBirthDateIso(today: Date = new Date()): string {
  const year = today.getFullYear() - MIN_AGE_YEARS;
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Aplica a máscara `dd/mm/aaaa` enquanto o atleta digita — mesma lógica do
 *  `BrDateInputFormatter` do Flutter (`onboarding_input_formatters.dart`), portada
 *  pra manter paridade entre os dois clientes. */
export function formatBirthDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 4) result += '/';
    result += digits[i];
  }
  return result;
}

/** `YYYY-MM-DD` (valor do `<input type="date">` nativo) → `dd/mm/aaaa` (formato do campo mascarado). */
export function birthDateIsoToBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Idade completa em anos na data de referência. */
export function ageOn(birth: Date, reference: Date): number {
  const age = reference.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    reference.getMonth() < birth.getMonth() ||
    (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate());
  return beforeBirthday ? age - 1 : age;
}

/** Mensagem de erro para exibir no campo, ou `null` quando a data é aceitável. */
export function validateBirthDate(raw: string, today: Date = new Date()): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 'Obrigatório';

  const iso = birthDateBrToIso(trimmed);
  if (iso == null) return 'Data inválida (dd/mm/aaaa)';

  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  if (y < MIN_BIRTH_YEAR) return `Ano deve ser ${MIN_BIRTH_YEAR} ou posterior`;

  const birth = new Date(y, m - 1, d);
  // Compara só a data (zera a hora do "hoje") para nascer hoje não virar futuro.
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (birth.getTime() > todayMidnight.getTime()) return 'A data não pode ser no futuro';

  if (ageOn(birth, todayMidnight) < MIN_AGE_YEARS) {
    return `É preciso ter pelo menos ${MIN_AGE_YEARS} anos`;
  }
  return null;
}

/** Normaliza para os 11 dígitos nacionais (DDD + celular), removendo máscara e o
 *  código do país. Retorna `null` quando não dá para chegar a 11 dígitos. */
export function normalizeBrMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  return digits.length === 11 ? digits : null;
}

/** Mensagem de erro para exibir no campo, ou `null` quando o WhatsApp é aceitável. */
export function validatePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 'Obrigatório';

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 || (digits.length === 12 && digits.startsWith('55'))) {
    return 'Informe um celular (com o 9), não um telefone fixo';
  }

  const national = normalizeBrMobile(trimmed);
  if (national == null) return 'Informe DDD + celular com 9 dígitos';

  if (!VALID_AREA_CODES.has(Number(national.slice(0, 2)))) return 'DDD inválido';
  if (national[2] !== '9') return 'Celular deve começar com 9 depois do DDD';

  const subscriber = national.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) return 'Número inválido';

  return null;
}
