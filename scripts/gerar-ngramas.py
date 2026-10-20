#!/usr/bin/env python3
"""Gera src/core/analysis/pt-ngrams.ts a partir de um texto em português de domínio público.

Uso: python3 -I scripts/gerar-ngramas.py <livro.txt> [mais livros...]
Corpus usado na versão publicada: "Dom Casmurro", Machado de Assis (1899), Projeto Gutenberg
nº 55752 (domínio público). O texto é preparado como na Enigma: sem acento, maiúsculas, espaço e
pontuação viram X, números por extenso. Saída: frequência de cada letra (texto sem os X) e o
log10 da probabilidade de cada trigrama, quantizado em 1 byte (26³ = 17.576 bytes, em base64).
"""
import base64
import math
import re
import sys
import unicodedata
from pathlib import Path

DIGITS = ['ZERO', 'UM', 'DOIS', 'TRES', 'QUATRO', 'CINCO', 'SEIS', 'SETE', 'OITO', 'NOVE']


def gutenberg_body(text: str) -> str:
    start = re.search(r'\*\*\* ?START OF.*?\*\*\*', text)
    end = re.search(r'\*\*\* ?END OF', text)
    return text[start.end() if start else 0 : end.start() if end else len(text)]


def prepare(text: str) -> str:
    plain = unicodedata.normalize('NFD', text)
    plain = ''.join(c for c in plain if not unicodedata.combining(c)).upper()
    out, pending, prev_digit = [], False, False
    for ch in plain:
        is_digit = ch.isdigit() and ch.isascii()
        if ('A' <= ch <= 'Z') or is_digit:
            if out and (pending or (is_digit and not prev_digit) or (not is_digit and prev_digit)):
                out.append('X')
            out.append(DIGITS[int(ch)] if is_digit else ch)
            pending, prev_digit = False, is_digit
        else:
            pending = True
    return ''.join(out)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    letters_only = []
    prepared = []
    for path in sys.argv[1:]:
        body = gutenberg_body(Path(path).read_text(encoding='utf-8', errors='ignore'))
        p = prepare(body)
        prepared.append(p)
        letters_only.append(prepare(body.replace('\n', ' ')).replace('X', ''))
    text = 'X'.join(prepared)
    raw_letters = ''.join(letters_only)

    freq = [0] * 26
    for c in raw_letters:
        freq[ord(c) - 65] += 1
    total_letters = sum(freq)

    tri = [0] * (26 ** 3)
    for i in range(len(text) - 2):
        a, b, c = (ord(text[i]) - 65, ord(text[i + 1]) - 65, ord(text[i + 2]) - 65)
        tri[(a * 26 + b) * 26 + c] += 1
    total = sum(tri)
    lo, hi = -10.0, 0.0
    q = bytearray()
    for n in tri:
        lp = math.log10((n + 0.01) / total)
        q.append(max(0, min(255, round((lp - lo) / (hi - lo) * 255))))

    out = Path(__file__).resolve().parent.parent / 'src/core/analysis/pt-ngrams.ts'
    pct = ', '.join(f'{100 * f / total_letters:.2f}' for f in freq)
    out.write_text(
        '/* Arquivo gerado por scripts/gerar-ngramas.py; não editar à mão.\n'
        ' * Fonte: "Dom Casmurro", Machado de Assis (1899), Projeto Gutenberg nº 55752, domínio público.\n'
        f' * {total_letters} letras; {total} trigramas no texto preparado como na Enigma (X = espaço). */\n\n'
        '/** Frequência (%) de A a Z no português, sem contar os X de separação. */\n'
        f'export const PT_LETTER_PERCENT: readonly number[] = [{pct}];\n\n'
        '/** log10 da probabilidade de cada trigrama, quantizado: valor = -10 + byte × 10 / 255. */\n'
        f"export const PT_TRIGRAMS_B64 =\n  '{base64.b64encode(bytes(q)).decode()}';\n",
        encoding='utf-8',
    )
    print(f'{out}: {total_letters} letras, {total} trigramas')
    print('top letras:', sorted(zip(freq, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), reverse=True)[:8])


if __name__ == '__main__':
    main()
