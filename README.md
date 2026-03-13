## InvestAdmin - Sistema de Administração de Investimentos (MVP)

Aplicação web responsiva, focada em renda fixa brasileira (CDB, Tesouro, LCI/LCA), para uso pessoal inicial, pensada para rodar com **custo zero ou próximo de zero** na AWS, aproveitando o free tier.

### Objetivo do projeto

- **Centralizar** o acompanhamento de investimentos de renda fixa.
- **Cadastrar investimentos manualmente** e, futuramente, via **prints de aplicativos bancários brasileiros**.
- **Calcular** rendimento atual, rendimento médio, rendimento real (descontando IPCA) e **projeções futuras**, ajustando automaticamente com base em **SELIC, CDI e IPCA**.

### Stack planejada

- **Frontend**: React + TypeScript, hospedado em **S3** com opção de **CloudFront**.
- **Backend**: Node.js + TypeScript em **AWS Lambda**, exposto via **API Gateway**.
- **Banco de dados**: **DynamoDB**.
- **Autenticação**: **AWS Cognito**.
- **Storage de imagens**: **S3**.
- **OCR**:
  - Fase 1: interface preparada, sem processamento real.
  - Fase 2: integração com **AWS Textract** ou **Tesseract em Lambda**.

### Estrutura inicial do repositório

- `docs/` - Documentos de produto e arquitetura.
  - `PRD.md` - Documento de requisitos do produto.
  - `ARCHITECTURE_AWS_FREE.md` - Arquitetura detalhada focada em custo zero.
- `backend/` - Código do backend.
- `frontend/` - Código do frontend.
- `scripts/` - Utilitários de desenvolvimento local.

### Próximos passos

- Evoluir a cobertura automatizada para CI/CD.
- Refinar as regras de benchmark e oportunidades.
- Integrar novas fontes de dados e, futuramente, captura de investimentos por OCR.
