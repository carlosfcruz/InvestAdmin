# GitHub Actions OIDC para Deploy na AWS

Este projeto usa deploy do frontend para S3 via GitHub Actions. O fluxo foi ajustado para autenticar na AWS com OIDC, sem `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` estáticos.

## Variáveis necessárias no GitHub

Configure estas variáveis no repositório ou na organização:

- `AWS_DEPLOY_ROLE_ARN`
- `AWS_REGION`
- `AWS_FRONTEND_BUCKET`

Durante a transição, o workflow também aceita os mesmos nomes em `Secrets`, mas o caminho recomendado é usar `Repository variables` para tudo que não é segredo.

## Permissões do workflow

O job de deploy precisa de:

- `contents: read`
- `id-token: write`

Essas permissões já estão declaradas em `.github/workflows/deploy-frontend.yml`.

## Passos na AWS

1. Criar o provedor OIDC `token.actions.githubusercontent.com` no IAM, caso ele ainda não exista.
2. Criar uma role para o deploy do frontend.
3. Restringir a trust policy ao repositório e branch corretos.
4. Anexar apenas as permissões mínimas de S3 necessárias.

## Exemplo de trust policy

Alinhe `<owner>`, `<repo>` e branch com o seu repositório real. Se a branch principal continuar `master`, troque `main` por `master` na policy e no workflow.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:<owner>/<repo>:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

## Exemplo de política mínima para S3

Substitua `<bucket-name>` pelo bucket real do frontend:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::<bucket-name>"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::<bucket-name>/*"
    }
  ]
}
```

## Observações

- O workflow faz `aws s3 sync dist s3://bucket --delete`, então a role precisa listar o bucket e gravar/remover objetos.
- Se o deploy usar CloudFront depois, adicione também as permissões mínimas para invalidation.
- Se você mudar a branch principal do projeto, atualize tanto a trust policy quanto o gatilho do workflow.
