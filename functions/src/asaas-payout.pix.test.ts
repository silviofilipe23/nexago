/**
 * Testes manuais de normalização PIX — executar com:
 *   npx ts-node --transpile-only src/asaas-payout.pix.test.ts
 */
import {
  inferPixKeyType,
  normalizePixAddressKey,
  resolveWithdrawalPixFields,
} from "./asaas-payout";

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  }
}

function run(): void {
  assertEqual(inferPixKeyType("62998539835"), "CPF", "CPF 11 digits");
  const cpf = resolveWithdrawalPixFields("629.985.398-35");
  assertEqual(cpf.pixAddressKeyType, "CPF", "CPF type masked");
  assertEqual(cpf.pixAddressKey, "62998539835", "CPF digits only");

  const cnpj = resolveWithdrawalPixFields("12.345.678/0001-95");
  assertEqual(cnpj.pixAddressKeyType, "CNPJ", "CNPJ type");
  assertEqual(cnpj.pixAddressKey, "12345678000195", "CNPJ digits");

  const email = resolveWithdrawalPixFields("  Arena@Example.COM ");
  assertEqual(email.pixAddressKeyType, "EMAIL", "email type");
  assertEqual(email.pixAddressKey, "arena@example.com", "email lower");

  const phone = resolveWithdrawalPixFields("+55 (62) 99853-9835");
  assertEqual(phone.pixAddressKeyType, "PHONE", "phone type");

  const phoneExplicit = resolveWithdrawalPixFields("62998539835", "PHONE");
  assertEqual(phoneExplicit.pixAddressKeyType, "PHONE", "explicit phone type");
  assertEqual(phoneExplicit.pixAddressKey, "62998539835", "phone digits");

  const cpfExplicit = resolveWithdrawalPixFields("629.985.398-35", "CPF");
  assertEqual(cpfExplicit.pixAddressKeyType, "CPF", "explicit cpf type");
  assertEqual(
    normalizePixAddressKey(phone.pixAddressKey, phone.pixAddressKeyType),
    phone.pixAddressKey.replace(/\D/g, ""),
    "phone digits",
  );

  console.log("asaas-payout.pix.test.ts: all assertions passed");
}

run();
