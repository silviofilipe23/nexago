import { signal } from '@angular/core';
import { cityStateLabel } from './organizadores.data';
import { OrganizerRoleForm, type RoleFormSubject } from './role-form.state';

function subjectOf(overrides: Partial<RoleFormSubject> = {}): RoleFormSubject {
  return {
    name: 'Gustavo Brito',
    badge: 'Atleta',
    brand: 'Circuito Paraibano BT',
    city: 'João Pessoa',
    state: 'PB',
    accountType: 'Pessoa física (CPF)',
    document: '083.514.229-06',
    documentStatus: '',
    email: 'gustavo@exemplo.com',
    whatsapp: '(83) 99812-4407',
    verification: [],
    ...overrides,
  };
}

describe('cityStateLabel', () => {
  it('junta cidade e UF só na exibição', () => {
    expect(cityStateLabel('João Pessoa', 'PB')).toBe('João Pessoa · PB');
  });

  it('não deixa separador solto quando falta uma das partes', () => {
    expect(cityStateLabel('João Pessoa', '')).toBe('João Pessoa');
    expect(cityStateLabel('', 'PB')).toBe('PB');
    expect(cityStateLabel('', '')).toBe('');
  });
});

describe('OrganizerRoleForm', () => {
  it('preenche cidade e UF como campos separados da conta', () => {
    const form = new OrganizerRoleForm(signal(subjectOf()));

    expect(form.city()).toBe('João Pessoa');
    expect(form.state()).toBe('PB');
    expect(form.cityLabel()).toBe('João Pessoa · PB');
  });

  it('trocar de conta reprefila os campos herdados', () => {
    const subject = signal(subjectOf());
    const form = new OrganizerRoleForm(subject);

    subject.set(subjectOf({ city: 'Goiânia', state: 'GO', brand: 'Liga Goiana' }));

    expect(form.city()).toBe('Goiânia');
    expect(form.state()).toBe('GO');
    expect(form.brand()).toBe('Liga Goiana');
  });

  it('o que o admin digita sobrevive até a troca de conta', () => {
    const form = new OrganizerRoleForm(signal(subjectOf()));

    form.city.set('Campina Grande');

    expect(form.city()).toBe('Campina Grande');
    expect(form.cityLabel()).toBe('Campina Grande · PB');
  });

  it('grava cidade e UF separadas, nunca a string juntada', () => {
    const form = new OrganizerRoleForm(signal(subjectOf()));

    const { profile } = form.registration();

    expect(profile.city).toBe('João Pessoa');
    expect(profile.state).toBe('PB');
    expect(JSON.stringify(profile)).not.toContain('·');
  });

  it('o WhatsApp vai só com dígitos, como o portal do organizador grava', () => {
    const form = new OrganizerRoleForm(signal(subjectOf()));

    expect(form.registration().profile.contactPhone).toBe('83998124407');
  });

  it('a comissão vai como número, não como rótulo', () => {
    const form = new OrganizerRoleForm(signal(subjectOf()));

    expect(form.registration().terms.commissionPercent).toBe(8);
    expect(form.commissionShort()).toBe('8%');
  });

  it('sem conta selecionada o resumo não inventa valor', () => {
    const form = new OrganizerRoleForm(signal<RoleFormSubject | null>(null));

    const cidade = form.summaryRows().find((r) => r.label === 'Cidade');
    expect(cidade?.value).toBe('—');
  });
});
