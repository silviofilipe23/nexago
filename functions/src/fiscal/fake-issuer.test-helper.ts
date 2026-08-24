/** Emissor em memória. Permite forçar rejeição e falha de rede nos testes. */
import type {
  FiscalIssuer,
  IssueServiceInvoiceInput,
  IssueServiceInvoiceResult,
  MunicipalRequirement,
  RegisterIssuerInput,
  RegisterIssuerResult,
} from "./issuer-port";

export class FakeIssuer implements FiscalIssuer {
  readonly issued: IssueServiceInvoiceInput[] = [];
  nextResult: IssueServiceInvoiceResult = {
    status: "authorized",
    numero: "42",
    serie: "1",
    codigoVerificacao: "ABC123",
    pdfUrl: "https://exemplo/nota.pdf",
    xmlUrl: "https://exemplo/nota.xml",
  };
  throwOnIssue: Error | null = null;

  async getMunicipalRequirements(): Promise<MunicipalRequirement[]> {
    return [{field: "inscricaoMunicipal", label: "Inscrição municipal", required: true, type: "text"}];
  }

  async registerIssuer(input: RegisterIssuerInput): Promise<RegisterIssuerResult> {
    return {issuerId: `emp_${input.cnpj}`, token: "tok_teste"};
  }

  async issueServiceInvoice(
    _token: string,
    input: IssueServiceInvoiceInput,
  ): Promise<IssueServiceInvoiceResult> {
    if (this.throwOnIssue) throw this.throwOnIssue;
    this.issued.push(input);
    return this.nextResult;
  }

  async getInvoice(): Promise<IssueServiceInvoiceResult> {
    return this.nextResult;
  }

  async cancelInvoice(): Promise<void> {
    // nada a fazer no fake
  }
}
