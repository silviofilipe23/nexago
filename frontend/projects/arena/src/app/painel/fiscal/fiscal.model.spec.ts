import { mapFiscalConfig, fiscalConfigStatusLabel, FISCAL_MODE_LABEL } from './fiscal.model';

describe('mapFiscalConfig', () => {
  it('devolve null quando a arena não tem config', () => {
    expect(mapFiscalConfig(undefined)).toBeNull();
  });

  it('mapeia os campos e o catálogo de serviços', () => {
    const config = mapFiscalConfig({
      cnpj: '12345678000199',
      razaoSocial: 'Arena X Ltda',
      inscricaoMunicipal: '123456',
      services: [{ id: 's1', codigoMunicipal: '3.03', descricao: 'Quadra', aliquotaIss: 2 }],
      mode: 'always',
      status: 'active',
    });
    expect(config?.cnpj).toBe('12345678000199');
    expect(config?.services.length).toBe(1);
    expect(config?.mode).toBe('always');
  });

  it('assume rascunho e desligado quando os campos faltam', () => {
    const config = mapFiscalConfig({ cnpj: '12345678000199' });
    expect(config?.status).toBe('draft');
    expect(config?.mode).toBe('off');
    expect(config?.services).toEqual([]);
  });
});

describe('fiscalConfigStatusLabel', () => {
  it('traduz cada status para português', () => {
    expect(fiscalConfigStatusLabel('draft')).toBe('Rascunho');
    expect(fiscalConfigStatusLabel('testing')).toBe('Em teste');
    expect(fiscalConfigStatusLabel('active')).toBe('Ativa');
    expect(fiscalConfigStatusLabel('error')).toBe('Com erro');
  });

  it('rotula os modos', () => {
    expect(FISCAL_MODE_LABEL.always).toBe('Emitir sempre');
    expect(FISCAL_MODE_LABEL.on_demand).toBe('Só quando o cliente pedir');
    expect(FISCAL_MODE_LABEL.off).toBe('Desligado');
  });
});
