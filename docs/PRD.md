## PRD – InvestAdmin (MVP)

### 1. Visão geral

- **Produto**: Sistema web responsivo (mobile-first) para gestão de investimentos de renda fixa brasileira (CDB, Tesouro, LCI/LCA).
- **Público-alvo**: Investidor pessoa física **iniciante e intermediário**, uso inicial **pessoal** (do idealizador).
- **Objetivo principal**: Centralizar e simplificar o acompanhamento de investimentos de renda fixa, com:
  - Cadastro manual de investimentos.
  - Importação futura via prints de aplicativos bancários brasileiros (ex.: Banco Inter).
  - Cálculo de rendimento atual, médio, real (descontando IPCA).
  - Projeções de crescimento futuro com base em SELIC, CDI e IPCA.
- **Restrição chave**: Arquitetura desenhada para operar **dentro do free tier da AWS** (custo zero ou próximo de zero).

### 2. Escopo do MVP

- **Incluso**:
  - Renda fixa: **CDB, Tesouro, LCI, LCA**.
  - Gestão de carteira para **um único usuário** (sem multi-conta).
  - Cadastro manual completo de investimentos.
  - Visualização de carteira consolidada e detalhes por investimento.
  - Cálculo de:
    - Rendimento atual (bruto e líquido de IR).
    - Rentabilidade média (ao mês e ao ano).
    - Rentabilidade real (descontando IPCA).
    - Projeções futuras (cenário base usando índices atuais).
  - Atualização **diária** dos índices SELIC, CDI e IPCA via fontes públicas gratuitas.
  - Autenticação básica (login/senha) com AWS Cognito.
- **Fora do MVP** (pode entrar depois):
  - Multiusuário com compartilhamento de carteira.
  - Outras classes de ativos (ações, FIIs, cripto etc.).
  - Integração direta com corretoras/bancos (API proprietária).
  - Múltiplos perfis (família/empresa).

### 3. Core Features

1. **Gestão de carteira de renda fixa**
   - Cadastro manual de CDB/Tesouro/LCI/LCA com campos financeiros essenciais.
   - Painel de carteira com totais investidos, valor atual estimado e próximos vencimentos.

2. **Importação de dados via prints (OCR) – fase 2**
   - Upload de prints de aplicativos bancários brasileiros (inicialmente Banco Inter).
   - Extração e pré-preenchimento de campos de investimento a partir da imagem.
   - Tela de revisão/edição antes de salvar.

3. **Cálculos de rendimento e projeções**
   - Cálculo de rendimento atual, médio e real (IPCA).
   - Projeções futuras com base em índices atualizados diariamente (SELIC, CDI, IPCA).

### 4. Tipos e modelos principais (visão de produto)

- **Tipos de investimento**: CDB, TESOURO, LCI, LCA.
- **Indexadores**: CDI, SELIC, IPCA, PREFIXADO.
- **Origem**: MANUAL ou OCR.
- **Principais campos de um investimento**:
  - Emissor, nome do produto, tipo, indexador, taxa (ex.: 117,5% do CDI), data de aplicação, vencimento, valor investido, liquidez, regime de IR, FGC, risco, regras de resgate.

### 5. User Stories principais

#### 5.1. Cadastro e visualização

- **US01 – Cadastro manual**
  - Como **investidor iniciante**,
  - quero **cadastrar manualmente um investimento de renda fixa (CDB, Tesouro, LCI, LCA)**,
  - para **acompanhar meus investimentos em um único lugar**.

- **US02 – Visualizar carteira**
  - Como **investidor**,
  - quero **ver um painel com total investido, valor atual estimado, rentabilidade acumulada e próximos vencimentos**,
  - para **entender rapidamente como está minha carteira de renda fixa**.

- **US03 – Detalhe do investimento**
  - Como **investidor**,
  - quero **abrir o detalhe de um investimento específico com todas as informações relevantes**,
  - para **decidir se mantenho, resgato ou reinvisto**.

#### 5.2. Cálculos e projeções

- **US04 – Ver rendimento atual e médio**
  - Como **investidor**,
  - quero **ver o rendimento atual (R$ e %) e a rentabilidade média (ao mês e ao ano)**,
  - para **saber se o investimento está performando como esperado**.

- **US05 – Ver rentabilidade real**
  - Como **investidor preocupado com inflação**,
  - quero **ver a rentabilidade real dos meus investimentos (descontando IPCA)**,
  - para **avaliar se estou protegendo meu poder de compra**.

- **US06 – Ver projeções de crescimento**
  - Como **investidor planejando o futuro**,
  - quero **ver projeções de valor futuro para cada investimento e para a carteira**,
  - para **planejar objetivos financeiros com base em números realistas**.

#### 5.3. Índices econômicos

- **US07 – Atualização automática de índices**
  - Como **investidor**,
  - quero que **SELIC, CDI e IPCA sejam atualizados automaticamente uma vez por dia**,
  - para **não precisar procurar essas informações manualmente**.

#### 5.4. Importação via prints (OCR) – fase 2

- **US08 – Upload de print para pré-cadastro**
  - Como **investidor que está avaliando um título no app do banco**,
  - quero **enviar um print da tela de detalhes do produto**,
  - para **preencher automaticamente os campos do investimento**.

- **US09 – Revisão de dados extraídos**
  - Como **investidor**,
  - quero **revisar e corrigir os dados extraídos do print**,
  - para **garantir que minhas informações fiquem corretas antes de salvar**.

### 6. Métricas de sucesso (para uso pessoal)

- Conseguir **cadastrar e acompanhar toda a carteira pessoal de renda fixa** apenas com este sistema.
- Conseguir **simular e comparar** pelo menos 3–5 novos investimentos por mês usando a ferramenta.
- Manter o ambiente hospedado na AWS **sem custos mensais perceptíveis** (dentro do free tier).

