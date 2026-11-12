# Source and release / Código-fonte e lançamento

## English

The source files for v0.3.23 are in the repository root and in `api/`, `icons/` and `_locales/`. The extension uses a privileged Thunderbird Experiment API; ordinary browser-only test environments are insufficient.

The published `.xpi` can be downloaded from [GitHub Releases](https://github.com/aureliosrneto/Mail-Bounce/releases/tag/v0.3.23). The source files were extracted from that version's XPI. The original XPI may not be reproduced byte-for-byte with a different ZIP utility because archive metadata and file ordering can differ.

To verify the published package locally in PowerShell:

```powershell
Get-FileHash .\Mail-Bounce-0.3.23.xpi -Algorithm SHA256
```

Expected SHA-256: `1621e969f8aca830788d96f184e85d63d57fd0c875854a6e2d45d4ef856fe45c`.

The license and documentation belong in the repository; inclusion in a future package should be reviewed with any third-party notices. Do not package credentials, personal messages or local Thunderbird profiles. Run a manual Thunderbird test before distributing changed builds.

## Português (Brasil)

Os arquivos-fonte da v0.3.23 estão na raiz do repositório e em `api/`, `icons/` e `_locales/`. A extensão utiliza uma Experiment API privilegiada do Thunderbird; testes somente em navegadores comuns são insuficientes.

O `.xpi` publicado está em [GitHub Releases](https://github.com/aureliosrneto/Mail-Bounce/releases/tag/v0.3.23). Os arquivos-fonte foram extraídos desse pacote. A recriação do ZIP pode produzir bytes diferentes em razão da ordem e dos metadados dos arquivos.

Verifique o SHA-256 pelo PowerShell usando o comando acima e o valor esperado indicado. Não inclua credenciais, mensagens pessoais nem perfis locais nos pacotes. Teste a extensão no Thunderbird antes de distribuir novas compilações.
