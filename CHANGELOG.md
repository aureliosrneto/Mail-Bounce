# Changelog / Histórico de alterações

Maintained in English and Portuguese (Brazil). Entries below summarize the history included in the original v0.3.23 XPI; versions not listed in that archive are not inferred.

Mantido em inglês e português (Brasil). Os registros abaixo resumem o histórico presente no XPI original v0.3.23; versões ausentes daquele histórico não foram presumidas.

## Unreleased / Não lançado

- **EN:** Documentation and repository maintenance only; the v0.3.23 extension source remains unchanged.
- **PT-BR:** Apenas manutenção de documentação e repositório; o código da extensão v0.3.23 permanece inalterado.

## 0.3.23 — Published release / Versão publicada

**Release / Lançamento:** https://github.com/aureliosrneto/Mail-Bounce/releases/tag/v0.3.23

**XPI SHA-256:** `1621e969f8aca830788d96f184e85d63d57fd0c875854a6e2d45d4ef856fe45c`

- **EN:** Kept Manifest V2 background persistent; reduced quick-bar startup races by waiting for the background listener.
- **PT-BR:** Mantido o background persistente no Manifest V2; reduzidas as condições de corrida na inicialização da barra, aguardando o listener.

## 0.3.20

- **EN:** Thunderbird 155.x compatibility and updated supported version range; redirect, Sent copy and marker retained.
- **PT-BR:** Compatibilidade com Thunderbird 155.x e atualização da faixa de versões; mantidos redirecionamento, cópia em Enviados e indicador.

## 0.3.19

- **EN:** Native Redirected marker applied to the original message only after successful SMTP delivery.
- **PT-BR:** Indicador nativo de Redirecionada aplicado à mensagem original somente após envio SMTP confirmado.

## 0.3.18

- **EN:** Fixed missing TextEncoder in the privileged Experiment API by writing Resent-* header bytes directly.
- **PT-BR:** Corrigida a ausência de TextEncoder na Experiment API privilegiada mediante gravação direta dos bytes dos cabeçalhos Resent-*.

## 0.3.17

- **EN:** Fixed forwarding the RFC 822 message data obtained via messages.getRaw() to the Experiment API.
- **PT-BR:** Corrigido o envio do conteúdo RFC 822 obtido por messages.getRaw() à Experiment API.

## 0.3.16

- **EN:** Replaced fragile internal reader with messages.getRaw(); improved uncached IMAP support, MIME preservation and consecutive sends.
- **PT-BR:** Substituída a leitura interna por messages.getRaw(); melhorados suporte a IMAP sem cache, preservação MIME e envios consecutivos.

## 0.3.15

- **EN:** Fixed consecutive sends and cross-account identity resolution; serialized operations and improved Sent-folder lookup.
- **PT-BR:** Corrigidos envios consecutivos e identidades de contas diferentes; operações serializadas e localização de Enviados melhorada.

## 0.3.13

- **EN:** Retained temporary RFC file until SMTP delivery and optional Sent copy; improved error handling.
- **PT-BR:** Arquivo RFC temporário preservado até o envio SMTP e a cópia opcional em Enviados; tratamento de erros melhorado.

## 0.3.12

- **EN:** Resolved Sent-folder using configured FCC URI and completed copy-service listener.
- **PT-BR:** Localização da pasta Enviados pela URI FCC configurada e conclusão do listener do serviço de cópia.

## 0.3.11

- **EN:** Fixed Sent copy-service listener and distinguished send success from copy failure.
- **PT-BR:** Corrigido o listener de cópia em Enviados, diferenciando envio concluído de falha ao salvar a cópia.

## 0.3.10

- **EN:** Disabled native FCC copy; used an explicit copy of the redirected RFC message after sending.
- **PT-BR:** Desativada a cópia FCC nativa; adicionada cópia explícita da mensagem RFC redirecionada após o envio.

## 0.3.9

- **EN:** Restored startup compatibility; temporary files created using Thunderbird native temp service.
- **PT-BR:** Restaurada a compatibilidade na inicialização; arquivos temporários criados pelo serviço nativo do Thunderbird.

## 0.3.8

- **EN:** Restored background redirection with original From and RFC Resent-* headers using internal sender.
- **PT-BR:** Restaurado o redirecionamento em segundo plano com From original e cabeçalhos RFC Resent-* pelo mecanismo interno de envio.

## 0.3.7

- **EN:** Added a fallback compose API for Thunderbird 153.0.1 when messages.sendMessage() was unavailable.
- **PT-BR:** Adicionado fallback da API compose no Thunderbird 153.0.1 quando messages.sendMessage() não estava disponível.

## 0.3.6

- **EN:** Corrected Experiment API schema types and startup lifecycle support.
- **PT-BR:** Corrigidos os tipos do schema da Experiment API e o suporte ao ciclo de inicialização.

## 0.3.5

- **EN:** Fixed import path of ExtensionSupport in Thunderbird 153.
- **PT-BR:** Corrigido o caminho de importação do ExtensionSupport no Thunderbird 153.

## 0.3.4

- **EN:** Corrected locale identifiers en_US/pt_BR and startup initialization logging.
- **PT-BR:** Corrigidos os identificadores de idioma en_US/pt_BR e os logs de inicialização.

## 0.3.3

- **EN:** Fixed Experiment API initialization and global class export.
- **PT-BR:** Corrigida a inicialização da Experiment API e a exportação da classe global.

## 0.3.2

- **EN:** Restored the message-header bar lifecycle and relaxed Experiment API parameter schema.
- **PT-BR:** Restaurado o ciclo de vida da barra do cabeçalho e flexibilizado o schema de parâmetros da Experiment API.

## 0.3.1

- **EN:** Fixed the quick bar visibility and already-open-window enumeration in Thunderbird 153.
- **PT-BR:** Corrigida a exibição da barra e a enumeração de janelas já abertas no Thunderbird 153.

## 0.3.0

- **EN:** Introduced the independent redirect engine, six saved recipients and a temporary field; removed Simple Mail Redirection code/assets.
- **PT-BR:** Introduzido mecanismo independente, seis destinatários salvos e campo temporário; removidos códigos e recursos do Simple Mail Redirection.

