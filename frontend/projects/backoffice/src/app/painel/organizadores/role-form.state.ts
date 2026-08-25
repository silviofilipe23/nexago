import { computed, linkedSignal, signal, type Signal } from '@angular/core';
import {
  COMMISSION_OPTIONS,
  DEFAULT_PERMISSIONS,
  LIMIT_OPTIONS,
  PAYOUT_OPTIONS,
  ROLE_PERMISSIONS,
  cityStateLabel,
  type AccountType,
  type CommissionOption,
  type VerificationItem,
} from './organizadores.data';

/**
 * Conta que vai receber a role. O `Athlete` do mock satisfaz esta forma, e o
 * usuário real do Auth é convertido para ela em `subjectFromUser()`.
 */
export interface RoleFormSubject {
  name: string;
  /** Elo do atleta ou rótulo curto do papel atual. Vazio = sem badge. */
  badge: string;
  brand: string;
  city: string;
  /** Sigla da UF (`'PB'`); `''` quando a conta não tem estado gravado. */
  state: string;
  accountType: AccountType;
  document: string;
  documentStatus: string;
  email: string;
  whatsapp: string;
  /** Vazio quando não há backend de verificação para esta conta. */
  verification: readonly VerificationItem[];
}

export interface SummaryRow {
  label: string;
  value: string;
  tone?: 'green' | 'orange';
}

const EMPTY = '—';

/**
 * Estado do formulário de atribuição da role de organizador.
 * Os campos herdados da conta usam linkedSignal: reprefilham ao trocar de
 * usuário, mas continuam editáveis pelo admin.
 */
export class OrganizerRoleForm {
  constructor(private readonly subject: Signal<RoleFormSubject | null>) {}

  readonly brand = linkedSignal(() => this.subject()?.brand ?? '');
  readonly city = linkedSignal(() => this.subject()?.city ?? '');
  readonly state = linkedSignal(() => this.subject()?.state ?? '');
  readonly accountType = linkedSignal<AccountType>(
    () => this.subject()?.accountType ?? 'Pessoa física (CPF)',
  );
  readonly document = linkedSignal(() => this.subject()?.document ?? '');
  readonly email = linkedSignal(() => this.subject()?.email ?? '');
  readonly whatsapp = linkedSignal(() => this.subject()?.whatsapp ?? '');

  readonly commission = signal<CommissionOption>(COMMISSION_OPTIONS[0]!);
  readonly payout = signal(PAYOUT_OPTIONS[0]!);
  readonly limit = signal(LIMIT_OPTIONS[0]!);

  /** `'João Pessoa · PB'` — só para exibir; o gravado são os dois campos. */
  readonly cityLabel = computed(() => cityStateLabel(this.city(), this.state()));

  /**
   * Chave PIX de SAQUE lida de `organizerWallets/{uid}` — exibição apenas.
   * O backoffice não grava: a carteira é write-only por Cloud Function e o
   * destino do dinheiro é escolha do próprio organizador, no portal dele.
   * `''` = não configurada.
   */
  readonly payoutPixKey = signal('');

  readonly permissions = signal<readonly string[]>(DEFAULT_PERMISSIONS);

  readonly verification: Signal<readonly VerificationItem[]> = computed(
    () => this.subject()?.verification ?? [],
  );

  private readonly verificationDone = computed(
    () => this.verification().filter((v) => v.state === 'done').length,
  );

  readonly hasVerification = computed(() => this.verification().length > 0);

  readonly verificationLabel = computed(() =>
    this.hasVerification() ? `${this.verificationDone()} de ${this.verification().length}` : EMPTY,
  );

  readonly verificationComplete = computed(
    () => this.hasVerification() && this.verificationDone() === this.verification().length,
  );

  /** Só a porcentagem, para o resumo lateral. */
  readonly commissionShort = computed(() => `${this.commission().percent}%`);

  readonly permissionsLabel = computed(
    () => `${this.permissions().length} de ${ROLE_PERMISSIONS.length} ativas`,
  );

  readonly summaryRows = computed<SummaryRow[]>(() => {
    const subject = this.subject();
    if (!subject) {
      return [
        { label: 'Conta', value: EMPTY },
        { label: 'Papel atual', value: EMPTY },
        { label: 'Marca', value: EMPTY },
        { label: 'Cidade', value: EMPTY },
        { label: 'Documento', value: EMPTY },
        { label: 'Verificação', value: EMPTY },
        { label: 'Comissão', value: EMPTY },
        { label: 'Permissões', value: EMPTY },
      ];
    }
    return [
      { label: 'Conta', value: subject.name },
      { label: 'Papel atual', value: subject.badge || EMPTY },
      { label: 'Marca', value: this.brand() || subject.name },
      { label: 'Cidade', value: this.cityLabel() || EMPTY },
      {
        label: 'Documento',
        value: subject.documentStatus || EMPTY,
        ...(subject.documentStatus.includes('válido') ? { tone: 'green' as const } : {}),
      },
      {
        label: 'Verificação',
        value: this.verificationLabel(),
        ...(this.hasVerification()
          ? { tone: this.verificationComplete() ? ('green' as const) : ('orange' as const) }
          : {}),
      },
      { label: 'Comissão', value: this.commissionShort() },
      { label: 'Permissões', value: this.permissionsLabel() },
    ];
  });

  /**
   * O que vai para `saveOrganizerRegistration`. Dois destinos, por
   * sensibilidade: `profile` é o mesmo mapa que o organizador edita no portal
   * dele (`users/{uid}.organizerProfile`, legível por autenticado quando a
   * conta também é atleta); `terms` é o doc admin-only `organizers/{uid}`, onde
   * ficam documento e condições comerciais.
   *
   * `logoUrl` fica de fora de propósito: o backoffice não sobe logo, e mandar
   * `null` apagaria a que o organizador já tinha.
   */
  readonly registration = computed(() => ({
    profile: {
      orgName: this.brand().trim(),
      contactEmail: this.email().trim(),
      contactPhone: this.whatsapp().replace(/\D/g, ''),
      city: this.city().trim(),
      state: this.state().trim(),
    },
    terms: {
      accountType: this.accountType(),
      document: this.document().trim(),
      commissionPercent: this.commission().percent,
      payoutSchedule: this.payout(),
      tournamentLimit: this.limit(),
      permissions: [...this.permissions()],
    },
  }));

  isEnabled(permissionId: string): boolean {
    return this.permissions().includes(permissionId);
  }

  setPermission(permissionId: string, enabled: boolean): void {
    this.permissions.update((current) =>
      enabled
        ? current.includes(permissionId)
          ? current
          : [...current, permissionId]
        : current.filter((id) => id !== permissionId),
    );
  }
}
