## Arquitetura – InvestAdmin (AWS Free Tier / Custo Zero)

### 1. Visão geral

Arquitetura serverless na AWS, projetada para operar **dentro do free tier**, com foco em:

- Baixo custo (uso pessoal, poucos acessos).
- Simplicidade de operação (sem servidores dedicados).
- Facilidade de implementação por agentes de IA.

Componentes principais:

- **Frontend**: SPA React/TypeScript hospedada em **S3** (e opcionalmente distribuída via **CloudFront**).
- **Backend**: APIs REST em **Node.js/TypeScript** rodando em **AWS Lambda** + **API Gateway**.
- **Dados**: **DynamoDB** para armazenar usuários, investimentos, índices econômicos e registros de OCR.
- **Autenticação**: **Cognito User Pool**.
- **Storage de imagens**: **S3** (bucket privado).
- **Jobs agendados**: Lambdas disparadas via **EventBridge/CloudWatch** para atualização de índices.
- **OCR**: integração futura com **Textract** ou **Tesseract em Lambda**.

---

### 2. Serviços AWS e papéis

#### 2.1. S3 (frontend e imagens)

- **Bucket `investadmin-frontend`**
  - Hospeda os arquivos estáticos do frontend (HTML, JS, CSS).
  - Configurado como static website hosting ou atrás do CloudFront.

- **Bucket `investadmin-uploads`**
  - Armazena prints de aplicativos bancários.
  - Acesso privado; o backend gera URLs pré-assinadas (pre-signed URLs) para upload/download.

#### 2.2. CloudFront (opcional)

- Distribui o conteúdo do S3 `investadmin-frontend` com melhor performance global.
- Pode ser adicionado depois; inicialmente, o S3 puro já atende o uso pessoal.

#### 2.3. API Gateway + Lambda (backend)

- **API Gateway REST** expõe endpoints sob `/api/...`.
- Cada grupo de funcionalidades é atendido por uma Lambda (ou handler agrupado):
  - `authHandler` – signup/login usando Cognito.
  - `investmentsHandler` – CRUD de investimentos.
  - `indexesHandler` – leitura dos índices econômicos.
  - `ocrHandler` (futuro) – orquestração do fluxo de OCR.
- As Lambdas são escritas em **TypeScript**, compiladas para JavaScript e empacotadas.

#### 2.4. DynamoDB (banco de dados)

Tabelas recomendadas:

- **Tabela `Users`**
  - `userId` (PK)
  - Dados básicos suplementares ao Cognito (se necessário).

- **Tabela `Investments`**
  - `userId` (PK, partition key)
  - `investmentId` (SK, sort key)
  - Atributos: tipo, emissor, produto, indexador, taxa, datas, valores, liquidez, IR, FGC, origem, etc.

- **Tabela `EconomicIndexes`**
  - `indexType` (PK) – ex.: "CDI", "SELIC", "IPCA".
  - `date` (SK) – data da taxa.
  - `rate` – valor anualizado.

- **Tabela `OcrUploads`** (fase 2)
  - `uploadId` (PK)
  - `userId`
  - `status` (RECEIVED, PROCESSING, DONE, ERROR)
  - `imageKey` (chave do arquivo no S3)
  - `rawText` (texto bruto do OCR)
  - `parsedData` (JSON com campos estruturados sugeridos)

#### 2.5. Cognito (autenticação)

- **User Pool** com:
  - Cadastro por e-mail/senha.
  - Fluxo de confirmação de e-mail opcional.
  - Integração com o frontend via SDK (amplify/auth ou cognito-identity-js).
  - Uso de **JWT** nas requisições para o API Gateway.

#### 2.6. Jobs agendados – atualização de índices

- **Lambda `updateEconomicIndexes`** disparada diariamente por **EventBridge/CloudWatch**.
- Fluxo:
  1. Chama APIs públicas (ex.: Banco Central, IBGE) para obter CDI, SELIC, IPCA.
  2. Grava/atualiza registros na tabela `EconomicIndexes`.
  3. Mantém histórico (line-by-line por data).

---

### 3. Fluxos principais

#### 3.1. Cadastro manual de investimento

1. Usuário acessa SPA React hospedada em S3.
2. Faz login via Cognito e obtém JWT.
3. Abre tela de "Novo investimento" e preenche os dados.
4. Frontend envia `POST /api/investments` com JWT no header.
5. API Gateway valida o token e chama a Lambda `investmentsHandler`.
6. Handler valida dados, calcula campos básicos, salva item na tabela `Investments`.
7. Retorna o investimento criado para o frontend.

#### 3.2. Visualização da carteira

1. Frontend chama `GET /api/investments`.
2. Lambda `investmentsHandler` lê todos os registros da tabela `Investments` para o `userId`.
3. Para cada investimento, consulta os índices mais recentes em `EconomicIndexes` (ou usa cache).
4. Calcula rendimento atual, médio e real, monta um resumo.
5. Retorna lista de investimentos com campos calculados.

#### 3.3. Atualização diária dos índices

1. EventBridge dispara `updateEconomicIndexes` diariamente.
2. Lambda obtém dados de CDI/SELIC/IPCA em APIs públicas.
3. Salva/atualiza taxas em `EconomicIndexes`.
4. Frontend/Backend usam sempre o valor mais recente disponível nas requisições subsequentes.

#### 3.4. Upload de print e OCR (fase 2)

1. Frontend solicita URL pré-assinada: `POST /api/ocr/uploads`.
2. Backend:
   - Gera `uploadId`.
   - Cria item em `OcrUploads` com status `RECEIVED`.
   - Gera URL pré-assinada S3 e retorna ao frontend.
3. Frontend faz upload direto da imagem para S3.
4. (Futuro) Lambda ou Textract é acionado:
   - Lê a imagem do S3.
   - Executa OCR.
   - Normaliza o texto e preenche `parsedData`.
   - Atualiza `status` para `DONE`.
5. Frontend consulta `GET /api/ocr/uploads/:uploadId` para obter dados sugeridos.

---

### 4. Especificações para agentes de engenharia

#### 4.1. Backend Agent

- Linguagem: **TypeScript** (Node 18+).
- Framework: pode usar **Express** ou **fastify** adaptado a Lambda, ou uma estrutura leve customizada.
- Padronizar:
  - Pasta `src/handlers/` para handlers de Lambda.
  - Pasta `src/models/` para tipos e mapeamento de DynamoDB.
  - Pasta `src/services/` para regras de negócio (cálculos, integração com APIs de índices, OCR, etc.).
- Expor **OpenAPI/Swagger** (gerado a partir de schemas) para apoiar o Frontend e QA.

#### 4.2. Frontend Agent

- Stack sugerida:
  - **React + TypeScript** (Vite ou Create React App).
  - **React Query** para consumo da API.
  - **React Router** para navegação.
  - Estilização com **Tailwind CSS** ou outro utilitário CSS.
- Requisitos de UX:
  - Layout **mobile-first**, leitura fácil em telas pequenas.
  - Componentes claros para:
    - Lista de investimentos (cards).
    - Detalhe do investimento (incluindo projeções).
    - Formulário de cadastro/edição.

#### 4.3. QA Agent

- Garantir testes:
  - Unitários dos cálculos de rentabilidade.
  - Testes de API (ex.: usando Jest + supertest).
  - Testes de fluxo básico do frontend (ex.: Testing Library).

---

### 5. Considerações de custo

- **S3**: arquivos estáticos e poucos uploads de imagem → dentro do free tier.
- **Lambda**: volume de invocações baixo (uso pessoal) → dentro do free tier.
- **API Gateway**: poucas requisições diárias → dentro do free tier.
- **DynamoDB**: poucos itens e baixa taxa de leitura/escrita → usar modo on-demand ou provisionado baixo; dentro do free tier.
- **Cognito**: 50.000 MAUs no free tier — muito acima do necessário.
- **Textract** (se usado):
  - Free tier de 3 meses para até ~1.000 páginas/mês; suficiente para validação inicial.
  - Após isso, avaliar custo real de uso (provavelmente baixo para uso pessoal) ou migrar para Tesseract em Lambda.

