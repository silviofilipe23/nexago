import { computed, linkedSignal, signal, type Signal } from '@angular/core';
import {
  COMMISSION_OPTIONS,
  DEFAULT_PERMISSIONS,
  LIMIT_OPTIONS,
  PAYOUT_OPTIONS,
  ROLE_PERMISSIONS,
  type AccountType,
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
  readonly accountType = linkedSignal<AccountType>(
    () => this.subject()?.accountType ?? 'Pessoa física (CPF)',
  );
  readonly document = linkedSignal(() => this.subject()?.document ?? '');
  readonly email = linkedSignal(() => this.subject()?.email ?? '');
  readonly whatsapp = linkedSignal(() => this.subject()?.whatsapp ?? '');

  readonly pixOptions = computed(() => {
    const subject = this.subject();
    if (!subject) {
      return [];
    }
    const docLabel = subject.accountType === 'Pessoa jurídica (CNPJ)' ? 'CNPJ' : 'CPF';
    return [
      ...(subject.document ? [`${subject.document} (${docLabel})`] : []),
      ...(subject.email ? [`${subject.email} (e-mail)`] : []),
      ...(subject.whatsapp ? [`${subject.whatsapp} (telefone)`] : []),
      'Chave aleatória',
    ];
  });
  readonly pixKey = linkedSignal(() => this.pixOptions()[0] ?? '');

  readonly commission = signal(COMMISSION_OPTIONS[0]!);
  readonly payout = signal(PAYOUT_OPTIONS[0]!);
  readonly limit = signal(LIMIT_OPTIONS[0]!);

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

  /** Só a porcentagem, para o resumo lateral ("8% por inscrição (padrão)" → "8%"). */
  readonly commissionShort = computed(() => this.commission().split(' ')[0] ?? EMPTY);

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
