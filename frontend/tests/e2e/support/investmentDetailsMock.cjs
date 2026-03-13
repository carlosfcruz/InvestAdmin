const now = '2026-03-10T12:00:00.000Z';

function createInvestmentDetailsScenario() {
  const investment = {
    userId: 'qa-user',
    investmentId: 'inv-detail-1',
    type: 'CDB',
    indexer: 'CDI',
    origin: 'MANUAL',
    issuer: 'Banco QA',
    productName: 'CDB QA 120% CDI',
    rate: 120,
    applicationDate: '2025-03-10T12:00:00.000Z',
    maturityDate: '2030-03-10T12:00:00.000Z',
    amountInvested: 10000,
    liquidity: 'D+0',
    incomeTaxRegime: 'REGRESSIVE',
    hasFGC: true,
    createdAt: now,
    updatedAt: now,
    currentValue: 10983.45,
    grossReturn: 983.45,
    grossReturnPct: 0.098345,
    taxAmount: 172.1,
    taxRate: 0.175,
    daysElapsed: 365,
    daysToMaturity: 1826,
    maturityStatus: 'ACTIVE',
    netValue: 10811.35,
    monthlyProjection: 88.53,
    yearlyProjection: 1318.01,
    maturityNetValue: 14220.5,
    benchmarkAvailable: true,
    benchmarkLabel: 'CDI',
    benchmarkComparatorLabel: 'Pós-fixado',
    benchmarkCurrentValue: 10810.0,
    benchmarkProfit: 810.0,
    benchmarkReturnPct: 0.081,
    excessReturnPct: 0.017345,
    benchmarkStartDate: '2025-03-10',
    benchmarkLastIndexDate: '2026-03-10',
  };

  return {
    user: {
      id: 'qa-user',
      email: 'qa@investadmin.local',
    },
    indexes: {
      latest: {
        CDI: { indexType: 'CDI', date: '2026-03-10', rate: 0.0006 },
        SELIC: { indexType: 'SELIC', date: '2026-03-10', rate: 0.0006 },
        IPCA: { indexType: 'IPCA', date: '2026-02-01', rate: 0.007 },
      },
      display: {
        CDI: { indexType: 'CDI', label: 'CDI Hoje', rate: 0.1632, basis: 'annual', date: '2026-03-10', sourceDate: '2026-03-10' },
        SELIC: { indexType: 'SELIC', label: 'SELIC', rate: 0.1632, basis: 'annual', date: '2026-03-10', sourceDate: '2026-03-10' },
        IPCA: { indexType: 'IPCA', label: 'IPCA (12m)', rate: 0.0873, basis: 'trailing12m', date: '2026-02-01', sourceDate: '2026-02-01' },
      },
    },
    summary: {
      totals: {
        activeInvestedValue: 10000,
        activeCurrentValue: 10983.45,
        activeOpenProfit: 983.45,
        activeOpenProfitPct: 0.098345,
        pendingRedemptionValue: 0,
        pendingRedemptionPrincipal: 0,
        pendingRedemptionResult: 0,
        consolidatedValue: 10983.45,
      },
      benchmark: {
        hasData: true,
        label: 'CDI',
        methodology: 'TWR',
        periodLabel: 'Desde o Início',
        startDate: '2025-03-10',
        lastIndexDate: '2026-03-10',
        eligibleInvestedValue: 10000,
        eligibleCurrentValue: 10983.45,
        benchmarkCurrentValue: 10810.0,
        portfolioReturnPct: 0.098345,
        benchmarkReturnPct: 0.081,
        excessReturnPct: 0.017345,
        benchmarkProfit: 810.0,
      },
    },
    opportunities: {
      summary: {
        activeCount: 1,
        analyzedCount: 1,
        underperformingCount: 0,
        highSeverityCount: 0,
      },
      items: [],
    },
    investments: [investment],
    portfolioEvolution: [
      { date: '2025-03-10', value: 10000.0, applied: 10000.0, profit: 0.0, benchmarkValue: 10000.0, benchmarkProfit: 0.0, excessValue: 0.0 },
      { date: '2025-07-10', value: 10195.4, applied: 10000.0, profit: 195.4, benchmarkValue: 10160.0, benchmarkProfit: 160.0, excessValue: 35.4 },
      { date: '2025-12-10', value: 10640.25, applied: 10000.0, profit: 640.25, benchmarkValue: 10535.0, benchmarkProfit: 535.0, excessValue: 105.25 },
      { date: '2026-03-10', value: 10983.45, applied: 10000.0, profit: 983.45, benchmarkValue: 10810.0, benchmarkProfit: 810.0, excessValue: 173.45 },
    ],
    investmentEvolution: {
      [investment.investmentId]: [
        { date: '2025-03-10', value: 10000.0, applied: 10000.0, yield: 0.0, dailyRate: 0.00031, benchmarkValue: 10000.0, benchmarkProfit: 0.0, excessValue: 0.0 },
        { date: '2025-07-10', value: 10195.4, applied: 10000.0, yield: 195.4, dailyRate: 0.00036, benchmarkValue: 10160.0, benchmarkProfit: 160.0, excessValue: 35.4 },
        { date: '2025-12-10', value: 10640.25, applied: 10000.0, yield: 640.25, dailyRate: 0.00043, benchmarkValue: 10535.0, benchmarkProfit: 535.0, excessValue: 105.25 },
        { date: '2026-03-10', value: 10983.45, applied: 10000.0, yield: 983.45, dailyRate: 0.00045, benchmarkValue: 10810.0, benchmarkProfit: 810.0, excessValue: 173.45 },
      ],
    },
  };
}

async function mockInvestmentDetailsApi(page, scenario, onRequest) {
  await page.route('**/api/**', async (route) => {
    if (typeof onRequest === 'function') {
      onRequest(route.request().url());
    }

    const url = new URL(route.request().url());
    const { pathname } = url;

    if (pathname.endsWith('/api/auth/me')) {
      await fulfill(route, { user: scenario.user });
      return;
    }

    if (pathname.endsWith('/api/auth/logout')) {
      await fulfill(route, { ok: true });
      return;
    }

    if (pathname.endsWith('/api/investments/redeem') && route.request().method() === 'POST') {
      const body = route.request().postDataJSON() || {};
      const investmentIds = Array.isArray(body.investmentIds) ? body.investmentIds : [];

      scenario.investments = scenario.investments.map((currentInvestment) => {
        if (!investmentIds.includes(currentInvestment.investmentId)) {
          return currentInvestment;
        }

        return {
          ...currentInvestment,
          portfolioStatus: 'REDEEMED',
          redeemedAt: now,
          redeemedAmount: currentInvestment.maturityNetValue || currentInvestment.netValue || currentInvestment.currentValue || currentInvestment.amountInvested,
        };
      });

      await fulfill(route, {
        redeemedCount: investmentIds.length,
        items: scenario.investments.filter((currentInvestment) => investmentIds.includes(currentInvestment.investmentId)),
      });
      return;
    }

    if (pathname.endsWith('/api/indexes')) {
      await fulfill(route, {
        latest: scenario.indexes.latest,
        items: Object.values(scenario.indexes.latest),
        display: scenario.indexes.display,
      });
      return;
    }

    if (pathname.endsWith('/api/investments/summary')) {
      await fulfill(route, { summary: scenario.summary });
      return;
    }

    if (pathname.endsWith('/api/investments/opportunities')) {
      await fulfill(route, scenario.opportunities);
      return;
    }

    if (pathname.endsWith('/api/investments/evolution')) {
      await fulfill(route, { items: scenario.portfolioEvolution });
      return;
    }

    if (pathname.endsWith('/api/investments')) {
      await fulfill(route, { items: scenario.investments });
      return;
    }

    const deleteMatch = pathname.match(/\/api\/investments\/([^/]+)$/);
    if (deleteMatch && route.request().method() === 'DELETE') {
      const investmentId = deleteMatch[1];
      scenario.investments = scenario.investments.filter((currentInvestment) => currentInvestment.investmentId !== investmentId);
      delete scenario.investmentEvolution[investmentId];

      await fulfill(route, { ok: true });
      return;
    }

    const match = pathname.match(/\/api\/investments\/([^/]+)\/evolution$/);
    if (match) {
      const investmentId = match[1];
      await fulfill(route, { items: scenario.investmentEvolution[investmentId] || [] });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: `Unhandled mock route: ${pathname}` }),
    });
  });
}

async function fulfill(route, body) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

module.exports = {
  createInvestmentDetailsScenario,
  mockInvestmentDetailsApi,
};
