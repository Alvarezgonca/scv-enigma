# Protocolo SCV1

Especificação do que vai dentro de cada QR Code. Todo quadro é texto que usa só os 45 caracteres do
**modo alfanumérico do QR** (`0–9`, `A–Z`, espaço e `$ % * + - . / :`), o modo mais denso para texto
(5,5 bits por caractere). Campos são separados por `:`. Implementação: `src/core/protocol/`.

Há três tipos de quadro, identificados pela letra depois de `SCV1:`.

| Tipo | Uso | Proteção |
|---|---|---|
| `E` | Mensagem Enigma | Nenhuma integridade (fiel à máquina de 1940) |
| `A` | Mensagem AES-256-GCM | Confidencialidade, integridade e autenticidade |
| `F` | Folha de chaves de uma estação | Opcionalmente cifrada com senha (PBKDF2 + AES-256-GCM) |

## 1. Quadro Enigma (`E`)

```
SCV1:E:<de>:<para>:<dia>:<hora>:<nº>:<parte>/<total>:<letras>:<Grundstellung>:<chave cifrada>:<grupos de 5>
```

| Campo | Formato | Significado |
|---|---|---|
| `de`, `para` | 2 a 10 letras | Indicativos das estações (ALFA, BRAVO…) |
| `dia` | 1–31 | Dia do mês: qual linha da folha de chaves foi usada |
| `hora` | `HHMM` | Hora de transmissão |
| `nº` | 1–4 dígitos | Número da mensagem (junta as partes) |
| `parte/total` | `1/3` | Partes de até 250 letras, como no procedimento real |
| `letras` | inteiro | Letras do corpo, contando o grupo de identificação |
| `Grundstellung` | 3 letras | Posição básica sorteada, em claro |
| `chave cifrada` | 3 letras | Chave da mensagem cifrada na posição básica |
| corpo | letras em grupos de 5 | 1º grupo = 2 letras ao acaso + Kenngruppe do dia; depois o texto cifrado |

**Procedimento de indicador (Exército e Força Aérea, a partir de 1940)**, em `enigma-message.ts`:

1. A máquina recebe a chave do dia da folha: ordem dos rotores, anéis e 10 cabos (refletor B).
2. O operador sorteia a posição básica (ex.: `QUX`) e a chave da mensagem (ex.: `TPT`).
3. Na posição `QUX`, digita `TPT`: as lâmpadas dão a chave cifrada (`YHR`).
4. Gira os rotores para `TPT` e digita o texto.
5. Cada parte de uma mensagem longa tem posição básica e chave próprias.

Antes de cifrar, o texto em português é preparado como os operadores faziam: maiúsculas sem acento
(Ç vira C), espaço e pontuação viram um único `X`, algarismos por extenso.

Exemplo real gerado pelo app (chave do dia 21: `IV V II`, anéis `08 03 02`, cabos
`BI CG EY HP JO LZ NV RS TX UW`, Kenngruppen `XEN TFR WVB MXR`):

```
SCV1:E:ALFA:BRAVO:21:1930:178:1/1:123:QUX:YHR:NVXEN TKNEW LWNQE TBIUM RWEMF HUVOD TGKJS PIXVN XDNAH RTSJK WBGVH PWLPD SMYYQ MSACC HLQLB FVWRF UQWZZ MTDIF WAFCH WTVMZ LEMBH ZKLJM GNGWC ABQUM WNY
```

Texto claro: `PARAXESTACAOXBRAVOXDEXESTACAOXALFAXABRIGOXABERTOXNOXGINASIOXDEXITAIPUACU…`

**O que o receptor consegue verificar:** a Kenngruppe (denuncia folha ou dia errados) e a contagem de
letras (denuncia mensagem cortada). Uma letra trocada no caminho vira outra letra no texto claro,
**sem nenhum alarme**. Isso é intencional: mostra a falta de integridade da Enigma.

## 2. Quadro moderno (`A`)

```
SCV1:A:<de>:<para>:<dia>:<id>:<parte>/<total>:<Base45(texto cifrado ‖ etiqueta)>
```

| Campo | Formato | Significado |
|---|---|---|
| `id` | 24 hexadecimais | 96 bits aleatórios; é também o sal da derivação de chave |
| carga | Base45 (RFC 9285) | Pedaço cifrado com AES-256-GCM + etiqueta de 128 bits |

**Chaves.** A folha guarda um segredo aleatório de 256 bits por **par** de estações. Para cada
mensagem:

```
K = HKDF-SHA-256(segredo do par, sal = id, info = "SCV1 AES-256-GCM <de>><para> dia <dia>")
```

O sentido (`ALFA>BRAVO`) faz parte do `info`, então a chave de ida é diferente da de volta.

**Partes (construção STREAM).** O texto UTF-8 (com acentos) é dividido em pedaços de 150 bytes. A
parte *i* (contando de 0) é cifrada com:

- nonce de 96 bits = `00 00 00 00 00 00 00 ‖ i (32 bits) ‖ 01 se for a última, senão 00`;
- dado associado (AAD) = o cabeçalho exato do quadro, tudo antes do último `:`.

Assim o receptor detecta, e diz qual foi a parte:

| Ataque | Por que falha |
|---|---|
| Trocar um caractere do QR | A etiqueta GCM não confere |
| Trocar remetente, destinatário, dia ou id | O cabeçalho é AAD |
| Inverter partes de lugar | O índice está no nonce e no AAD |
| Sumir com a última parte e renumerar | A marca de “última” está no nonce |
| Partes de mensagens diferentes | Chave derivada do `id` |

Se qualquer parte falhar, **nenhum texto é entregue**.

## 3. Quadro de folha de chaves (`F`)

```
SCV1:F:<id da folha>:<parte>/<total>:<L|S>:<Base45>
```

A folha da estação é serializada em JSON compacto, comprimida (deflate) e, com `S`, cifrada com senha:
`sal(16) ‖ iv(12) ‖ AES-256-GCM(dados)`, chave por PBKDF2-HMAC-SHA-256 com 600.000 iterações e o
identificador da folha como AAD. Cada parte tem 330 caracteres (múltiplo de 3, então nenhum bloco
Base45 é cortado entre dois QR).

Defesas ao receber: todas as partes precisam ter o mesmo id, total e modo; quem espera senha recusa
folha sem senha (impede substituir por uma folha forjada); a descompressão para em 64 KB; o JSON é
validado campo a campo (rotores, anéis, cabos sem repetição, segredos de 32 bytes, só os pares da
estação). Por fim, os dois aparelhos mostram um **código de conferência** (80 bits do SHA-256 da folha)
que as pessoas comparam à vista.

## 4. Conteúdo da folha

Por dia: data, ordem dos rotores (3 de I–V), anéis, 10 pares do plugboard e 4 Kenngruppen. Por par de
estações: segredo AES de 256 bits. O Comando gera tudo com `crypto.getRandomValues` (inteiros por
rejeição, sem viés de módulo) e entrega a cada estação só os segredos dos pares dela.

## 5. Garantias e limites

- **Enigma:** sem integridade, sem autenticidade, chave de rede compartilhada. Serve para estudo.
- **AES-256-GCM:** confidencialidade, integridade e autenticidade entre as duas estações do par.
- O Comando conhece todos os segredos (modelo de centro de distribuição de chaves, como as redes da
  época). A evolução natural é troca de chaves por Diffie-Hellman (X25519) e assinaturas.
- Não há sigilo futuro (forward secrecy): quem obtiver o segredo de um par lê as mensagens antigas
  daquele par que tiver guardado.

Os testes de cada linha desta tabela estão em `src/core/protocol/protocol.test.ts` e
`src/ui/screens/receive-logic.test.ts`.
