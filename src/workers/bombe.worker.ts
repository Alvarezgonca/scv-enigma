import { type BombeStop, type RotorOrder, buildMenu, searchOrder } from '../core/analysis/bombe';

/**
 * Uma Bomba por núcleo do processador: o app abre vários destes workers e divide entre eles as
 * ordens de rotores, como Bletchley dividia as ordens entre as Bombas da sala.
 */

export interface BombeJob {
  readonly cipher: readonly number[];
  readonly crib: readonly number[];
  readonly offset: number;
  readonly orders: readonly RotorOrder[];
  readonly withTurnover: boolean;
}

export type BombeMessage =
  | { readonly type: 'order'; readonly order: RotorOrder; readonly stops: readonly BombeStop[]; readonly tested: number }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string };

const post = (m: BombeMessage): void => {
  (self as unknown as { postMessage: (m: BombeMessage) => void }).postMessage(m);
};

self.onmessage = (event: MessageEvent<BombeJob>) => {
  const job = event.data;
  const menu = buildMenu(job.cipher, job.crib, job.offset);
  if (menu === null) {
    post({ type: 'error', message: 'alinhamento impossível para o crib' });
    return;
  }
  const table = new Uint8Array(26 ** 4);
  for (const order of job.orders) {
    const { stops, tested } = searchOrder(menu, order, { withTurnover: job.withTurnover, table, maxStops: 400 });
    post({ type: 'order', order, stops, tested });
  }
  post({ type: 'done' });
};
