const { test, expect } = require('@playwright/test');
const { createInvestmentDetailsScenario, mockInvestmentDetailsApi } = require('./support/investmentDetailsMock.cjs');

test.describe('Investment details screen', () => {
  test('keeps API calls on the current origin when running on 127.0.0.1', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();

    await mockInvestmentDetailsApi(page, scenario);

    const authResponsePromise = page.waitForResponse((response) => response.url().includes('/api/auth/me'));
    await page.goto('/');
    const authResponse = await authResponsePromise;
    const authRequestUrl = authResponse.request().url();

    expect(authRequestUrl).toContain('127.0.0.1:4173/api/auth/me');
    expect(authRequestUrl).not.toContain('localhost:4000');
  });

  test('renders the market cards with annualized CDI/SELIC and IPCA in 12 months', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    await mockInvestmentDetailsApi(page, scenario);

    await page.goto('/');

    await expect(page.locator('p').filter({ hasText: 'CDI Hoje' }).first()).toBeVisible();
    await expect(page.locator('p').filter({ hasText: 'SELIC' }).first()).toBeVisible();
    await expect(page.locator('p').filter({ hasText: 'IPCA (12m)' }).first()).toBeVisible();
    await expect(page.getByText('16.32% a.a.')).toHaveCount(2);
    await expect(page.getByText('8.73%')).toHaveCount(1);
  });

  test('uses title case and PT-BR accents in the main dashboard controls', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    await mockInvestmentDetailsApi(page, scenario);

    await page.goto('/');

    await expect(page.getByText('Patrimônio Consolidado')).toBeVisible();
    await expect(page.locator('select').first()).toHaveValue('ALL');
    await expect(page.locator('select').first()).toContainText('Todas as Classes');
    await expect(page.locator('select').nth(1)).toHaveValue('ALL');
    await expect(page.locator('select').nth(1)).toContainText('Todos os Índices');
    await expect(page.getByRole('button', { name: 'Adicionar Ativo' })).toBeVisible();
    await expect(page.getByText('Renda Fixa x CDI')).toBeVisible();
    await expect(page.getByText('Ações Necessárias')).toBeVisible();
    await expect(page.getByText('Estados Patrimoniais')).toBeVisible();
    await expect(page.getByText('Caixa Disponível', { exact: true })).toBeVisible();
    await expect(page.locator('div.card').filter({ hasText: 'Renda Fixa x CDI' }).getByText('Desde o Início')).toBeVisible();
  });

  test('shows lightweight opportunity badges on the dashboard and counts them in navigation', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments = [
      {
        ...scenario.investments[0],
        investmentId: 'inv-opportunity-cdb',
        productName: 'CDB QA 92% CDI',
        rate: 92,
        benchmarkLabel: 'CDI',
        benchmarkComparatorLabel: 'Pós-fixado',
      },
    ];
    scenario.opportunities = {
      summary: {
        activeCount: 1,
        analyzedCount: 1,
        underperformingCount: 1,
        highSeverityCount: 0,
      },
      items: [
        {
          investmentId: 'inv-opportunity-cdb',
          productName: 'CDB QA 92% CDI',
          issuer: 'Banco QA',
          type: 'CDB',
          indexer: 'CDI',
          severity: 'MEDIUM',
          reasonCode: 'BELOW_MIN_POST_FIXED_RATE',
          benchmarkLabel: 'CDI',
          comparatorLabel: 'Régua Mínima',
          currentRate: 92,
          targetRate: 100,
          rateGap: -8,
          excessReturnPct: -0.0132,
          benchmarkStartDate: '2025-03-10',
          benchmarkLastIndexDate: '2026-03-10',
          title: 'Abaixo da Régua Mínima',
          explanation: 'CDB a 92% do CDI está abaixo da régua mínima automática adotada para esta categoria.',
          recommendation: 'Para prazo e liquidez comparáveis, procure opções de CDB a partir de 100% do CDI.',
        },
      ],
    };

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    await expect(page.getByRole('link', { name: /Oportunidades/ })).toContainText('1');
    await expect(page.getByRole('button', { name: 'Abaixo da Régua' })).toBeVisible();
  });

  test('renders the dedicated opportunities page with filters, grouping and normalized CDI labels', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.opportunities = {
      summary: {
        activeCount: 2,
        analyzedCount: 2,
        underperformingCount: 2,
        highSeverityCount: 1,
      },
      items: [
        {
          investmentId: 'inv-opportunity-lci',
          productName: 'LCI QA 80% CDI',
          issuer: 'Banco QA',
          type: 'LCI',
          indexer: 'CDI',
          severity: 'HIGH',
          reasonCode: 'BELOW_NET_EQUIVALENT_RATE',
          benchmarkLabel: 'CDI',
          comparatorLabel: 'Equivalente Líquido',
          currentRate: 80,
          targetRate: 85,
          rateGap: -5,
          excessReturnPct: -0.0075,
          benchmarkStartDate: '2025-03-10',
          benchmarkLastIndexDate: '2026-03-10',
          title: 'Abaixo do Equivalente Líquido',
          explanation: 'LCI a 80% do CDI está abaixo do equivalente líquido estimado de um produto tributado comparável.',
          recommendation: 'Para prazo comparável, procure opções de LCI a partir de 85% do CDI.',
        },
        {
          investmentId: 'inv-opportunity-legacy-cdb',
          productName: 'CDB QA Legado',
          issuer: 'Banco QA',
          type: 'CDB',
          indexer: 'SELIC',
          severity: 'MEDIUM',
          reasonCode: 'BELOW_MIN_POST_FIXED_RATE',
          benchmarkLabel: 'SELIC',
          comparatorLabel: 'Régua Mínima',
          currentRate: 91.17,
          targetRate: 100,
          rateGap: -8.83,
          excessReturnPct: -0.0248,
          benchmarkStartDate: '2025-03-10',
          benchmarkLastIndexDate: '2026-03-10',
          title: 'Abaixo da Régua Mínima',
          explanation: 'CDB a 91,17% do CDI está abaixo da régua mínima automática adotada para esta categoria.',
          recommendation: 'Para prazo e liquidez comparáveis, procure opções de CDB a partir de 100% do CDI.',
        },
      ],
    };

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/oportunidades');

    await expect(page.getByRole('heading', { name: 'Oportunidades na Carteira' })).toBeVisible();
    await expect(page.getByText('Regras automáticas para pós-fixados CDI e SELIC')).toBeVisible();
    await expect(page.getByText('Oportunidades Encontradas')).toBeVisible();
    await expect(page.getByText('Filtros')).toBeVisible();
    await expect(page.getByText('LCI/LCA abaixo do equivalente líquido')).toBeVisible();
    await expect(page.getByText('CDB abaixo de 100% do CDI')).toBeVisible();
    await expect(page.getByText('91,17% do CDI')).toBeVisible();

    await page.getByRole('button', { name: 'Filtrar oportunidades por tipo' }).click();
    await page.getByRole('option', { name: 'LCI/LCA' }).click();

    await expect(page.getByText('LCI/LCA abaixo do equivalente líquido')).toBeVisible();
    await expect(page.getByText('LCI QA 80% CDI')).toBeVisible();
    await expect(page.getByText('CDB abaixo de 100% do CDI')).toHaveCount(0);
    await expect(page.getByText('Para prazo comparável, procure opções de LCI a partir de 85% do CDI.')).toBeVisible();
  });

  test('shows benchmark descriptors and excess return by fixed-income product in custody rows', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments = [
      {
        ...scenario.investments[0],
        investmentId: 'inv-benchmark-cdi',
        productName: 'CDB QA CDI',
        indexer: 'CDI',
        rate: 120,
        benchmarkAvailable: true,
        benchmarkLabel: 'CDI',
        benchmarkComparatorLabel: 'Pós-fixado',
        excessReturnPct: 0.012,
      },
      {
        ...scenario.investments[0],
        investmentId: 'inv-benchmark-prefixado',
        productName: 'CDB QA Prefixado',
        indexer: 'PREFIXADO',
        rate: 12.3,
        benchmarkAvailable: true,
        benchmarkLabel: 'CDI',
        benchmarkComparatorLabel: 'Curva Contratada',
        excessReturnPct: -0.004,
      },
      {
        ...scenario.investments[0],
        investmentId: 'inv-benchmark-ipca',
        productName: 'CDB QA IPCA',
        indexer: 'IPCA',
        rate: 6.5,
        benchmarkAvailable: true,
        benchmarkLabel: 'IPCA',
        benchmarkComparatorLabel: 'Curva Contratada',
        excessReturnPct: 0.0215,
      },
    ];

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    const custodyCard = page.locator('div.card').filter({ hasText: 'Custódia: CDB' }).first();
    await expect(custodyCard.getByText('Benchmark: CDI')).toHaveCount(2);
    await expect(custodyCard.getByText('Benchmark: IPCA')).toBeVisible();
    await expect(custodyCard.getByText('Curva Contratada')).toHaveCount(2);
    await expect(custodyCard.getByText('Pós-fixado')).toBeVisible();
    await expect(custodyCard.getByText('+1.20 p.p. vs benchmark')).toBeVisible();
    await expect(custodyCard.getByText('-0.40 p.p. vs benchmark')).toBeVisible();
    await expect(custodyCard.getByText('+2.15 p.p. vs benchmark')).toBeVisible();
  });

  test('uses the net-equivalent benchmark for tax-exempt products in custody and detail views', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    const lciInvestment = {
      ...scenario.investments[0],
      investmentId: 'inv-benchmark-lci',
      type: 'LCI',
      productName: 'LCI QA 83% CDI',
      rate: 83,
      amountInvested: 1000,
      currentValue: 1141.5,
      grossReturn: 141.5,
      grossReturnPct: 0.1415,
      taxAmount: 0,
      taxRate: 0,
      netValue: 1141.5,
      benchmarkAvailable: true,
      benchmarkLabel: 'CDI',
      benchmarkComparatorLabel: 'Equivalente Líquido',
      benchmarkCurrentValue: 1133.4,
      benchmarkProfit: 133.4,
      benchmarkReturnPct: 0.1334,
      excessReturnPct: 0.0081,
    };

    scenario.investments = [lciInvestment];
    scenario.summary.totals.activeInvestedValue = 1000;
    scenario.summary.totals.activeCurrentValue = 1141.5;
    scenario.summary.totals.activeOpenProfit = 141.5;
    scenario.summary.totals.activeOpenProfitPct = 0.1415;
    scenario.summary.totals.consolidatedValue = 1141.5;
    scenario.investmentEvolution = {
      [lciInvestment.investmentId]: [
        { date: '2025-03-10', value: 1000.0, applied: 1000.0, yield: 0.0, dailyRate: 0.00031, benchmarkValue: 1000.0, benchmarkProfit: 0.0, excessValue: 0.0 },
        { date: '2025-07-10', value: 1030.4, applied: 1000.0, yield: 30.4, dailyRate: 0.00036, benchmarkValue: 1028.1, benchmarkProfit: 28.1, excessValue: 2.3 },
        { date: '2025-12-10', value: 1088.2, applied: 1000.0, yield: 88.2, dailyRate: 0.00043, benchmarkValue: 1080.6, benchmarkProfit: 80.6, excessValue: 7.6 },
        { date: '2026-03-10', value: 1141.5, applied: 1000.0, yield: 141.5, dailyRate: 0.00045, benchmarkValue: 1133.4, benchmarkProfit: 133.4, excessValue: 8.1 },
      ],
    };

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('http://127.0.0.1:5173');

    const custodyCard = page.locator('div.card').filter({ hasText: 'Custódia: LCI/LCA' }).first();
    await expect(custodyCard.getByText('Benchmark: CDI')).toBeVisible();
    await expect(custodyCard.getByText('Equivalente Líquido')).toBeVisible();
    await expect(custodyCard.getByText('+0.81 p.p. vs benchmark líquido')).toBeVisible();

    await page.getByText('LCI QA 83% CDI').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Comparação no Período')).toBeVisible();
    await expect(dialog.getByText('Equivalente Líquido')).toBeVisible();
    await expect(dialog.getByText('14.15%', { exact: true })).toBeVisible();
    await expect(dialog.getByText('13.34%', { exact: true })).toBeVisible();
    await expect(dialog.getByText('+0.81 p.p.', { exact: true })).toBeVisible();
  });

  test('groups LCI and LCA together in the active custody view', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments = [
      {
        ...scenario.investments[0],
        investmentId: 'inv-lci-group',
        type: 'LCI',
        productName: 'LCI QA Grupo',
      },
      {
        ...scenario.investments[0],
        investmentId: 'inv-lca-group',
        type: 'LCA',
        productName: 'LCA QA Grupo',
      },
    ];

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    const custodyCard = page.locator('div.card').filter({ hasText: 'Custódia: LCI/LCA' }).first();
    await expect(custodyCard).toBeVisible();
    await expect(custodyCard.getByText('2 ativos')).toBeVisible();
    await expect(custodyCard.getByText('LCI QA Grupo')).toBeVisible();
    await expect(custodyCard.getByText('LCA QA Grupo')).toBeVisible();
    await expect(page.getByText('Custódia: LCI', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Custódia: LCA', { exact: true })).toHaveCount(0);
  });

  test('renders the CDI benchmark in the main chart and keeps it out of the product detail chart', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    await mockInvestmentDetailsApi(page, scenario);

    await page.goto('/');

    const portfolioChartCard = page.getByTestId('portfolio-yield-chart');
    await expect(portfolioChartCard.getByText('Benchmark CDI')).toBeVisible();
    await expect(portfolioChartCard.getByRole('button', { name: 'Patrimônio' })).toBeVisible();
    await expect(portfolioChartCard.getByRole('button', { name: 'Rentabilidade' })).toBeVisible();
    await expect(portfolioChartCard.getByRole('button', { name: 'Excesso vs CDI' })).toBeVisible();

    const rentabilidadeButton = portfolioChartCard.getByRole('button', { name: 'Rentabilidade' });
    await rentabilidadeButton.click();
    await expect(rentabilidadeButton).toHaveClass(/bg-blue-600/);

    const excessoButton = portfolioChartCard.getByRole('button', { name: 'Excesso vs CDI' });
    await excessoButton.click();
    await expect(excessoButton).toHaveClass(/bg-blue-600/);

    await page.getByText('CDB QA 120% CDI').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Benchmark CDI')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Patrimônio' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Rentabilidade' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Excesso vs CDI' })).toHaveCount(0);
  });

  test('shows contextual tooltips for the summary cards', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    await mockInvestmentDetailsApi(page, scenario);

    await page.goto('/');

    await page.getByRole('button', { name: 'Ajuda sobre Patrimônio Consolidado' }).click();
    await expect(page.getByRole('tooltip')).toContainText('Soma das posições ativas, dos valores em liquidação e do caixa disponível');

    await page.getByRole('button', { name: 'Ajuda sobre Renda Fixa x CDI' }).click();
    await expect(page.getByRole('tooltip')).toContainText('Compara a rentabilidade acumulada da parcela elegível de renda fixa');
  });

  test('shows the 6 month filter in the portfolio and detail charts', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    await mockInvestmentDetailsApi(page, scenario);

    await page.goto('/');

    const portfolioPeriodButton = page.getByRole('button').filter({ hasText: 'Desde o Início' }).first();
    await portfolioPeriodButton.hover();
    await expect(page.getByRole('button', { name: '6 Meses' }).first()).toBeVisible();

    await page.getByText('CDB QA 120% CDI').first().click();

    const dialog = page.getByRole('dialog');
    const detailPeriodButton = dialog.getByRole('button').filter({ hasText: 'Desde o Início' }).first();
    await detailPeriodButton.hover();
    await expect(dialog.getByRole('button', { name: '6 Meses' })).toBeVisible();
  });

  test('shows application and maturity dates in the custody table and in-app maturity alerts', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments[0].applicationDate = '2025-03-10T12:00:00.000Z';
    scenario.investments[0].maturityDate = '2026-03-15T12:00:00.000Z';
    scenario.investments[0].daysToMaturity = 5;
    scenario.investments[0].maturityStatus = 'ACTIVE';
    await mockInvestmentDetailsApi(page, scenario);

    await page.goto('/');

    await expect(page.getByText('10/03/2025')).toBeVisible();
    await expect(page.getByText('15/03/2026')).toBeVisible();
    await expect(page.getByText('Vence em 5d')).toBeVisible();

    const notificationButton = page.getByRole('button', { name: 'Notificações de Vencimento' });
    await expect(notificationButton).toContainText('1');
    await notificationButton.click();

    await expect(page.getByText('Vencimento Iminente')).toBeVisible();
    await expect(page.getByText('Vence em 5 dias (15/03/2026)')).toBeVisible();
  });

  test('separates matured assets from the active portfolio totals', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments = [
      scenario.investments[0],
      {
        ...scenario.investments[0],
        investmentId: 'inv-matured-1',
        productName: 'LCI QA Vencida',
        type: 'LCI',
        amountInvested: 5000,
        currentValue: 6800,
        netValue: 6800,
        maturityNetValue: 6800,
        grossReturn: 1800,
        grossReturnPct: 0.36,
        maturityStatus: 'MATURED',
        maturityDate: '2026-02-10T12:00:00.000Z',
      },
    ];

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    await expect(page.getByText('Patrimônio Consolidado')).toBeVisible();
    await expect(page.getByText('Posições Ativas', { exact: true })).toBeVisible();
    await expect(page.getByText('Em Liquidação', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Resgates Pendentes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver Pendentes (1)' })).toBeVisible();
    await expect(page.getByText('LCI QA Vencida')).toHaveCount(0);

    await page.getByRole('button', { name: 'Ver Pendentes (1)' }).click();
    await expect(page.getByText('LCI QA Vencida')).toBeVisible();
  });

  test('paginates pending redemptions with fixed page size', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments = [
      scenario.investments[0],
      ...Array.from({ length: 13 }, (_, index) => ({
        ...scenario.investments[0],
        investmentId: `inv-matured-bulk-${index + 1}`,
        productName: `CDB QA Pendente ${index + 1}`,
        amountInvested: 1000 + index,
        currentValue: 1300 + index,
        netValue: 1280 + index,
        maturityNetValue: 1280 + index,
        grossReturn: 300,
        grossReturnPct: 0.3,
        maturityStatus: 'MATURED',
        maturityDate: '2026-02-10T12:00:00.000Z',
      })),
    ];

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    await page.getByRole('button', { name: 'Ver Pendentes (13)' }).click();
    await expect(page.getByText('CDB QA Pendente 5')).toBeVisible();
    await expect(page.getByText('CDB QA Pendente 6')).toHaveCount(0);
    await expect(page.getByText('Página 1 de 3 - exibindo 5 de 13 pendentes')).toBeVisible();

    await page.getByRole('button', { name: 'Página 2 de 3' }).click();
    await expect(page.getByText('CDB QA Pendente 6')).toBeVisible();
    await expect(page.getByText('CDB QA Pendente 5')).toHaveCount(0);

    await page.getByRole('button', { name: 'Página 3 de 3' }).click();
    await expect(page.getByText('CDB QA Pendente 13')).toBeVisible();
  });

  test('paginates active custody rows with fixed page size', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments = Array.from({ length: 6 }, (_, index) => ({
      ...scenario.investments[0],
      investmentId: `inv-paged-${index + 1}`,
      productName: `CDB QA Pagina ${String(index + 1).padStart(2, '0')}`,
      amountInvested: 1000 + index,
      currentValue: 1200 + index,
      grossReturn: 200 + index,
      grossReturnPct: 0.2,
      maturityStatus: 'ACTIVE',
      maturityDate: '2030-03-10T12:00:00.000Z',
    }));

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    await expect(page.getByText('CDB QA Pagina 05')).toBeVisible();
    await expect(page.getByText('CDB QA Pagina 06')).toHaveCount(0);

    await page.getByRole('button', { name: 'Página 2 de 2' }).click();

    await expect(page.getByText('CDB QA Pagina 06')).toBeVisible();
    await expect(page.getByText('CDB QA Pagina 01')).toHaveCount(0);
    await expect(page.getByText('Página 2 de 2 - exibindo 1 de 6 ativos')).toBeVisible();
  });

  test('moves matured assets to hidden redeemed history after marking them as redeemed', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments = [
      {
        ...scenario.investments[0],
        investmentId: 'inv-matured-2',
        productName: 'CDB QA Vencido',
        amountInvested: 5000,
        currentValue: 6500,
        netValue: 6400,
        maturityNetValue: 6400,
        grossReturn: 1500,
        grossReturnPct: 0.3,
        maturityStatus: 'MATURED',
        maturityDate: '2026-02-10T12:00:00.000Z',
      },
    ];

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    await page.getByRole('button', { name: 'Ver Pendentes (1)' }).click();
    await expect(page.getByText('CDB QA Vencido')).toBeVisible();

    await page.getByRole('button', { name: 'Marcar Como Resgatado' }).click();

    await expect(page.getByRole('heading', { name: 'Resgates Pendentes' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Histórico de Resgates' })).toBeVisible();
    const cashCard = page.locator('div.rounded-xl').filter({ hasText: 'Caixa Disponível' }).first();
    await expect(cashCard.getByText('Caixa Disponível', { exact: true })).toBeVisible();
    await expect(cashCard.getByText('R$ 6.400,00')).toBeVisible();

    const historyToggle = page.getByRole('button', { name: 'Ocultar Histórico' });
    await expect(historyToggle).toBeVisible();
    await expect(page.getByText('CDB QA Vencido')).toBeVisible();
  });

  test('allows deleting an investment from redeemed history and removes it from totals', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments = [
      {
        ...scenario.investments[0],
        investmentId: 'inv-redeemed-delete',
        productName: 'CDB QA Histórico',
        portfolioStatus: 'REDEEMED',
        redeemedAt: '2026-03-10T12:00:00.000Z',
        amountInvested: 5000,
        currentValue: 6500,
        redeemedAmount: 6400,
        maturityStatus: 'MATURED',
        maturityDate: '2026-02-10T12:00:00.000Z',
      },
    ];

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    const cashCard = page.locator('div.rounded-xl').filter({ hasText: 'Caixa Disponível' }).first();
    await expect(cashCard.getByText('R$ 6.400,00')).toBeVisible();

    await page.getByRole('button', { name: 'Ver Histórico (1)' }).click();
    await expect(page.getByText('CDB QA Histórico')).toBeVisible();

    await page.getByRole('button', { name: 'Excluir CDB QA Histórico do histórico' }).click();
    const deleteDialog = page.locator('div.card').filter({ hasText: 'Excluir investimento?' }).first();
    await expect(deleteDialog.getByText('Excluir investimento?')).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Excluir' }).click();

    await expect(page.getByText('CDB QA Histórico')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Histórico de Resgates' })).toHaveCount(0);
    await expect(cashCard.getByText('R$ 0,00')).toBeVisible();
  });

  test('paginates redeemed history with fixed page size', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments = Array.from({ length: 6 }, (_, index) => ({
      ...scenario.investments[0],
      investmentId: `inv-redeemed-${index + 1}`,
      productName: `CDB QA Resgatado ${String(index + 1).padStart(2, '0')}`,
      portfolioStatus: 'REDEEMED',
      redeemedAt: '2026-03-10T12:00:00.000Z',
      amountInvested: 1000 + index,
      currentValue: 1200 + index,
      redeemedAmount: 1200 + index,
      maturityStatus: 'MATURED',
      maturityDate: '2026-02-10T12:00:00.000Z',
    }));

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    await page.getByRole('button', { name: 'Ver Histórico (6)' }).click();
    await expect(page.getByText('CDB QA Resgatado 05')).toBeVisible();
    await expect(page.getByText('CDB QA Resgatado 06')).toHaveCount(0);
    await expect(page.getByText('Página 1 de 2 - exibindo 5 de 6 resgates')).toBeVisible();

    await page.getByRole('button', { name: 'Página 2 de 2' }).click();
    await expect(page.getByText('CDB QA Resgatado 06')).toBeVisible();
    await expect(page.getByText('CDB QA Resgatado 01')).toHaveCount(0);
  });

  test('clears current notifications and only reopens them on a new maturity stage', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments[0].maturityDate = '2026-03-15T12:00:00.000Z';
    scenario.investments[0].daysToMaturity = 5;
    scenario.investments[0].maturityStatus = 'ACTIVE';

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    let notificationButton = page.getByRole('button', { name: 'Notificações de Vencimento' });
    await expect(notificationButton).toContainText('1');
    await notificationButton.click();

    await page.getByRole('button', { name: 'Limpar todas' }).click();
    await expect(page.getByText('Nenhum alerta pendente. Alertas limpos voltam apenas quando o vencimento mudar de etapa.')).toBeVisible();
    await expect(notificationButton).not.toContainText('1');

    await page.reload();

    notificationButton = page.getByRole('button', { name: 'Notificações de Vencimento' });
    await expect(notificationButton).not.toContainText('1');

    scenario.investments[0].daysToMaturity = 0;
    scenario.investments[0].maturityStatus = 'MATURES_TODAY';

    await page.reload();

    notificationButton = page.getByRole('button', { name: 'Notificações de Vencimento' });
    await expect(notificationButton).toContainText('1');
    await notificationButton.click();
    await expect(page.locator('div.card').filter({ hasText: 'Vencimentos' }).getByText('Vence hoje').first()).toBeVisible();
  });

  test('collapses the custody group on the first click after reload', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    await mockInvestmentDetailsApi(page, scenario);

    await page.goto('/');

    const groupHeader = page.locator('div.card > div.cursor-pointer').first();
    const groupBody = page.locator('div.card > div.overflow-x-auto').first();
    await expect(groupBody).toHaveClass(/max-h-\[2000px\]/);

    await groupHeader.click();
    await expect(groupBody).toHaveClass(/max-h-0/);
    await expect(groupBody).toHaveClass(/pointer-events-none/);

    await groupHeader.click();
    await expect(groupBody).toHaveClass(/max-h-\[2000px\]/);
  });

  test('sorts custody rows when clicking table headers', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    scenario.investments = [
      scenario.investments[0],
      {
        ...scenario.investments[0],
        investmentId: 'inv-detail-2',
        productName: 'CDB QA 90% CDI',
        amountInvested: 5000,
        currentValue: 5300,
        grossReturn: 300,
        grossReturnPct: 0.06,
      },
    ];

    await mockInvestmentDetailsApi(page, scenario);
    await page.goto('/');

    const rows = page.locator('tbody tr');
    await expect(rows.first()).toContainText('CDB QA 120% CDI');

    await page.getByRole('button', { name: 'Principal' }).click();
    await expect(rows.first()).toContainText('CDB QA 90% CDI');

    await page.getByRole('button', { name: 'Principal' }).click();
    await expect(rows.first()).toContainText('CDB QA 120% CDI');
  });

  test('opens the modal with formatted metrics and IR badge', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    await mockInvestmentDetailsApi(page, scenario);

    await page.goto('/');

    await expect(page.getByText('CDB QA 120% CDI')).toBeVisible();
    await page.getByText('CDB QA 120% CDI').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Valor Investido')).toBeVisible();
    await expect(dialog.getByText('R$ 10.000,00')).toBeVisible();
    await expect(dialog.getByText('R$ 10.983,45')).toBeVisible();
    await expect(dialog.getByText('R$ 983,45')).toBeVisible();
    await expect(dialog.getByText('17.5% na faixa (365 dias)')).toBeVisible();
    await expect(dialog.getByText('R$ 10.811,35')).toBeVisible();
    await expect(dialog.getByText('R$ 88,53')).toBeVisible();
    await expect(dialog.getByText('R$ 1.318,01')).toBeVisible();
    await expect(dialog.getByText('R$ 14.220,50')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Exportar Histórico' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Fechar' })).toBeVisible();
    await expect(dialog.getByText('Todos os Tipos')).toHaveCount(0);
  });

  test('shows the benchmark comparison in the product detail and updates it by selected period', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    await mockInvestmentDetailsApi(page, scenario);

    await page.goto('/');
    await page.getByText('CDB QA 120% CDI').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Comparação no Período')).toBeVisible();
    await expect(dialog.getByText('Pós-fixado')).toBeVisible();
    await expect(dialog.getByText('9.83%', { exact: true })).toBeVisible();
    await expect(dialog.getByText('8.10%', { exact: true })).toBeVisible();
    await expect(dialog.getByText('+1.73 p.p.', { exact: true })).toBeVisible();
    await expect(dialog.getByText('10/03/2025 até 10/03/2026')).toBeVisible();

    const detailPeriodButton = dialog.getByRole('button').filter({ hasText: 'Desde o Início' }).first();
    await detailPeriodButton.hover();
    await dialog.getByRole('button', { name: '6 Meses' }).click();

    await expect(dialog.getByText('10/12/2025 até 10/03/2026')).toBeVisible();
    await expect(dialog.getByText('3.23%', { exact: true })).toBeVisible();
    await expect(dialog.getByText('2.61%', { exact: true })).toBeVisible();
    await expect(dialog.getByText('+0.62 p.p.', { exact: true })).toBeVisible();
  });

  test('exports the investment history as CSV', async ({ page }) => {
    const scenario = createInvestmentDetailsScenario();
    await mockInvestmentDetailsApi(page, scenario);

    await page.goto('/');
    await page.getByText('CDB QA 120% CDI').first().click();

    const dialog = page.getByRole('dialog');
    const exportButton = dialog.getByRole('button', { name: 'Exportar Histórico' });
    await expect(exportButton).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await exportButton.evaluate((node) => node.click());
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('extrato_CDB_QA_120%_CDI.csv');

    const filePath = await download.path();
    expect(filePath).not.toBeNull();

    const fs = require('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf8');

    expect(content).toContain('date;value;applied;yield;dailyRate;benchmarkValue;benchmarkProfit;excessValue');
    expect(content).toContain('2026-03-10;10983,45;10000;983,45;0,00045;10810;810;173,45');
  });
});

