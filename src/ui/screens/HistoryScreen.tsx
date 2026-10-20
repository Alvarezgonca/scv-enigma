import { useEffect } from 'react';
import { useApp } from '../state';
import { sound } from '../sound';

const TIMELINE: readonly { year: string; text: string; modern?: boolean }[] = [
  { year: '1918', text: 'Arthur Scherbius patenteia na Alemanha uma máquina de cifra com rotores; ela vira a Enigma comercial.' },
  { year: 'anos 1930', text: 'A Enigma I, com plugboard, entra em serviço no Exército e na Força Aérea alemãs.' },
  {
    year: '1932',
    text: 'Marian Rejewski, matemático polonês, reconstrói a fiação dos rotores com teoria das permutações e documentos obtidos pela inteligência francesa.',
  },
  { year: '1938', text: 'A Polônia constrói a “bomba kryptologiczna” e as folhas de Zygalski para achar as chaves do dia.' },
  { year: 'jul. 1939', text: 'Em Pyry, perto de Varsóvia, os poloneses entregam a britânicos e franceses réplicas da máquina e seus métodos.' },
  {
    year: '1940',
    text: 'Em Bletchley Park, Alan Turing projeta a Bomba; Gordon Welchman acrescenta o quadro diagonal. A primeira, “Victory”, começa a trabalhar em março.',
  },
  { year: '9 maio 1941', text: 'O U-110 é capturado pelo HMS Bulldog: máquina e documentos de chaves vão para Bletchley.' },
  {
    year: '1942',
    text: 'Os submarinos passam à M4 (quatro rotores) e o tráfego “Shark” fica ilegível por meses, até a captura de material do U-559 em outubro.',
  },
  { year: '1943', text: 'A Marinha americana constrói Bombas de alta velocidade em Dayton (EUA).' },
  { year: '1974', text: 'O segredo de Bletchley (“Ultra”) vem a público com o livro de F. W. Winterbotham.' },
  { year: '1949', text: 'Claude Shannon publica a teoria matemática do sigilo: confusão e difusão.', modern: true },
  { year: '1976', text: 'Diffie e Hellman inventam a criptografia de chave pública.', modern: true },
  { year: '2001', text: 'O NIST adota o Rijndael, de Daemen e Rijmen, como AES (FIPS 197), após concurso público.', modern: true },
  { year: '2007', text: 'O NIST padroniza o modo GCM (SP 800-38D): cifra e autentica na mesma operação.', modern: true },
  { year: '2024', text: 'O NIST publica os primeiros padrões pós-quânticos (FIPS 203, 204 e 205).', modern: true },
];

const LESSONS: readonly { then: string; now: string; here: string }[] = [
  {
    then: 'Folhas de chaves capturadas (U-110, 1941) abriram o tráfego inteiro de uma rede.',
    now: 'C&M Software (2025): credenciais de um fornecedor comprometidas deram acesso às contas-reserva de bancos no Pix.',
    here: 'Segredo AES por par de estações, cópia da folha só com o que a estação precisa, distribuição com senha e código de conferência.',
  },
  {
    then: 'Cabeçalhos e frases previsíveis viraram cribs; a máquina não percebia nada errado.',
    now: 'Meu INSS (2026): uma consulta de serviço sem a autorização certa expôs milhões de CPFs.',
    here: 'Todo QR é tratado como hostil e validado campo a campo; o cabeçalho é autenticado e quem não é destinatário não decifra o modo moderno.',
  },
  {
    then: 'A Enigma não tinha integridade: texto alterado saía alterado, sem alarme.',
    now: 'Dados adulterados no caminho são o começo de fraudes e de decisões erradas.',
    here: 'AES-256-GCM com etiqueta de 128 bits e partes encadeadas (STREAM): adulteração, parte faltando ou fora de ordem é recusada.',
  },
  {
    then: 'Chaves e procedimentos dependiam de disciplina humana e eram repetidos.',
    now: 'Incidentes com chaves Pix (2026): dados expostos por meses por falta de cifra em repouso e de monitoramento.',
    here: 'Folha cifrada em repouso com chave não exportável do navegador; nada sai do aparelho; nenhum dado pessoal coletado (LGPD).',
  },
];

const REFERENCES: readonly string[] = [
  'M. Rejewski. An application of the theory of permutations in breaking the Enigma cipher. Applicationes Mathematicae 16(4):543–559, 1980. doi:10.4064/am-16-4-543-559',
  'A. M. Turing. Treatise on the Enigma (“Prof’s Book”), c. 1940. The National Archives (UK), HW 25/3.',
  'G. Welchman. The Hut Six Story: Breaking the Enigma Codes. McGraw-Hill, 1982.',
  'D. Davies. The Bombe: a remarkable logic machine. Cryptologia 23(2), 1999.',
  'F. Carter. The Turing Bombe. The Rutherford Journal 3, 2010.',
  'D. H. Hamer. Enigma: actions involved in the “double stepping” of the middle rotor. Cryptologia 21(1), 1997.',
  'A. R. Miller. The Cryptographic Mathematics of Enigma. NSA, Center for Cryptologic History, 1995.',
  'J. J. Gillogly. Ciphertext-only cryptanalysis of Enigma. Cryptologia 19(4), 1995. doi:10.1080/0161-119591884060',
  'F. Weierud e G. Sullivan. Breaking German Army ciphers. Cryptologia 29(3), 2005.',
  'O. Ostwald e F. Weierud. Modern breaking of Enigma ciphertexts. Cryptologia 41(5):395–421, 2017. doi:10.1080/01611194.2016.1238423',
  'D. Kahn. Seizing the Enigma: The Race to Break the German U-Boat Codes, 1939–1943. Houghton Mifflin, 1991.',
  'W. F. Friedman. The Index of Coincidence and Its Applications in Cryptography. Riverbank Laboratories, publ. 22, 1922.',
  'A. Kerckhoffs. La cryptographie militaire. Journal des sciences militaires IX:5–38, 161–191, 1883.',
  'C. E. Shannon. Communication theory of secrecy systems. Bell System Technical Journal 28(4):656–715, 1949.',
  'NIST FIPS 197. Advanced Encryption Standard (AES), 2001 (atualizado em 2023).',
  'M. Dworkin. NIST SP 800-38D. Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC, 2007.',
  'H. Krawczyk e P. Eronen. RFC 5869: HMAC-based Extract-and-Expand Key Derivation Function (HKDF), 2010.',
  'NIST SP 800-132. Recommendation for Password-Based Key Derivation, 2010; OWASP Password Storage Cheat Sheet (PBKDF2-HMAC-SHA-256, 600.000 iterações).',
  'V. T. Hoang, R. Reyhanitabar, P. Rogaway e D. Vizár. Online authenticated-encryption and its nonce-reuse misuse-resistance. CRYPTO 2015, LNCS 9215.',
  'P. Fältström, F. Ljunggren e D. W. van Gulik. RFC 9285: The Base45 Data Encoding, 2022.',
  'ISO/IEC 18004. Information technology — QR Code bar code symbology specification.',
  'L. K. Grover. A fast quantum mechanical algorithm for database search. STOC 1996.',
  'Lei nº 13.709/2018 (LGPD), arts. 6º (minimização) e 46 (segurança e privacidade desde a concepção).',
];

export default function HistoryScreen() {
  const { prefs, setPrefs } = useApp();
  useEffect(() => {
    sound.ambience(prefs.ambience && prefs.sound);
    return () => sound.ambience(false);
  }, [prefs.ambience, prefs.sound]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Narrativa histórica</div>
          <h1>Da Enigma ao AES</h1>
          <p>
            A Enigma era forte para a época e caiu por um conjunto: matemática dos poloneses, a falha do refletor, cabeçalhos
            previsíveis, chaves capturadas e milhares de pessoas em Bletchley Park. O AES foi desenhado em público, testado
            por anos e resiste ao mesmo ataque.
          </p>
        </div>
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={prefs.ambience} onChange={(e) => setPrefs({ ambience: e.target.checked })} />
          Som ambiente da sala de rádio
        </label>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Linha do tempo</h2>
          <ol className="timeline">
            {TIMELINE.map((t) => (
              <li key={`${t.year}-${t.text.slice(0, 12)}`} className={t.modern === true ? 'modern' : ''}>
                <div className="year">{t.year}</div>
                <div>{t.text}</div>
              </li>
            ))}
          </ol>
        </div>
        <div className="stack">
          <div className="card">
            <h2>O caminho de uma letra (para explicar à banca)</h2>
            <ol className="steps">
              <li>A tecla fecha o circuito; antes da corrente passar, o rotor da direita anda uma casa (e às vezes arrasta o do meio).</li>
              <li>A corrente passa pelo plugboard, que pode trocar a letra por outra (10 cabos = 10 trocas).</li>
              <li>Atravessa os três rotores da direita para a esquerda; cada um é uma permutação fixa, girada pela posição.</li>
              <li>O refletor manda a corrente de volta por OUTRO contato: por isso nenhuma letra vira ela mesma.</li>
              <li>Volta pelos três rotores, da esquerda para a direita, e pelo plugboard de novo.</li>
              <li>Acende a lâmpada da letra cifrada. Como o caminho é o mesmo nos dois sentidos, a máquina também decifra.</li>
            </ol>
          </div>
          <div className="card">
            <h2>Kerckhoffs, 1883</h2>
            <p>
              “O sistema não deve exigir segredo; pode cair nas mãos do inimigo sem inconveniente.” Os Aliados tinham a
              máquina e a fiação; faltava a chave. O AES é público há 25 anos e toda a segurança está na chave de 256 bits.
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>A mesma lição, 80 anos depois</h2>
        <p>Os incidentes citados no edital repetem o padrão da Enigma: raramente é o algoritmo; é projeto, credenciais e operação.</p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Na guerra</th>
                <th>Hoje</th>
                <th>O que este projeto faz</th>
              </tr>
            </thead>
            <tbody>
              {LESSONS.map((l) => (
                <tr key={l.then}>
                  <td>{l.then}</td>
                  <td>{l.now}</td>
                  <td>{l.here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Referências</h2>
        <ol className="refs">
          {REFERENCES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </div>
    </>
  );
}
