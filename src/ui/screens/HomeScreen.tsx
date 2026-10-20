import { href } from '../router';
import { useApp } from '../state';

export function HomeScreen() {
  const { sheet, station } = useApp();
  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">Desafio 2 · Comunicação segura</div>
          <h1>
            A <em>Enigma</em> caiu por falhas de projeto e de procedimento. Veja as duas acontecerem, e o que o{' '}
            <strong>AES</strong> faz diferente.
          </h1>
          <p className="lead">
            Uma rede de até quatro máquinas Enigma fiéis à original, trocando mensagens por QR Code, lado a lado com a
            criptografia de hoje. Veja a corrente atravessar os rotores, quebre a Enigma como Bletchley Park e tente
            fazer o mesmo com o AES-256-GCM.
          </p>
          <div className="row">
            {sheet === null ? (
              <a className="btn primary" href={href('folha')}>
                Montar a rede (folha de chaves)
              </a>
            ) : (
              <a className="btn primary" href={href('enviar')}>
                Transmitir como {station ?? 'estação'}
              </a>
            )}
            <a className="btn" href={href('maquina')}>
              Usar a máquina livremente
            </a>
          </div>
        </div>
        <article className="story" aria-label="Narrativa histórica">
          <h2>GEHEIM · 9 DE MAIO DE 1941</h2>
          <p>
            No Atlântico Norte, o submarino U-110 é forçado à superfície por cargas de profundidade. Antes de ele
            afundar, marinheiros do HMS Bulldog descem pela escotilha e voltam com a máquina e os{' '}
            <b>documentos de chaves</b>.
          </p>
          <p>
            A cifra era forte para a época. Caiu pelo conjunto: <b>procedimentos previsíveis</b> (frases repetidas,
            chaves preguiçosas), <b>chaves capturadas</b> e um detalhe de projeto: nenhuma letra vira ela mesma.
          </p>
          <p>Oitenta anos depois, os vazamentos ainda começam do mesmo jeito.</p>
          <span className="stamp">ULTRA</span>
        </article>
      </section>

      <div className="steps-cards">
        <a className="step-card" href={href('folha')}>
          <span className="n">01 · CHAVES</span>
          <h3>Folha de chaves da rede</h3>
          <p>O Comando gera a chave de cada dia e um segredo por par de estações. Cada máquina recebe só o que precisa.</p>
        </a>
        <a className="step-card" href={href('enviar')}>
          <span className="n">02 · TRANSMISSÃO</span>
          <h3>Cifrar e mandar por QR</h3>
          <p>A mesma mensagem sai na Enigma (procedimento de 1940) e no AES-256-GCM. A outra máquina lê pela câmera.</p>
        </a>
        <a className="step-card" href={href('bletchley')}>
          <span className="n">03 · CRIPTOANÁLISE</span>
          <h3>Quebrar como Bletchley Park</h3>
          <p>Um trecho previsível e a falha da letra que nunca vira ela mesma bastam para a Bomba achar a chave.</p>
        </a>
      </div>
    </>
  );
}
