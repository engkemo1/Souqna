import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCart } from '../src/lib/promotions/engine.js';
import { definitionSchema, validateDefinition } from '../src/lib/promotions/definition.js';
import { distribute } from '../src/lib/promotions/money.js';

const L = (productId, price, qty = 1, catChain = [1]) => ({ key: `${productId}`, productId, price, qty, catChain });
let nextId = 1;
const promo = (def, o = {}) => ({ id: nextId++, priority: 0, stacking: 'per_product', ...o, def: definitionSchema.parse({ qualify: { all: true }, ...def }) });
const run = (lines, promotions, settings = { resolution: 'best_savings' }, extra = {}) => evaluateCart({ lines, promotions, settings, ...extra });

test('buy 2 get 1 free: cheapest / most expensive / second most expensive', () => {
  const lines = [L(1, 300), L(2, 200), L(3, 100)];
  const eff = (pick) => ({ effect: { kind: 'buy_x_get_y', buy: 2, get: 1, reward_pick: pick } });
  assert.equal(run(lines, [promo(eff('cheapest'))]).promoDiscount, 100);
  assert.equal(run(lines, [promo(eff('most_expensive'))]).promoDiscount, 300);
  assert.equal(run(lines, [promo(eff('second_most_expensive'))]).promoDiscount, 200);
  assert.equal(run([L(1, 300), L(2, 200)], [promo(eff('cheapest'))]).promoDiscount, 0, 'two items do not qualify');
});

test('buy 2 get 1 free repeats per group of three and ignores the partial group', () => {
  const lines = [L(1, 100, 4), L(2, 50, 3)]; // 7 items -> 2 groups of 3
  const r = run(lines, [promo({ effect: { kind: 'buy_x_get_y', buy: 2, get: 1 } })]);
  // sorted desc: 100x4, 50x3 -> groups [100,100,100] [100,50,50] (+50 left) -> cheapest of each free: 100 + 50
  assert.equal(r.promoDiscount, 150);
  assert.equal(r.applied[0].applications, 2);
});

test('percent off the cheapest item of the group and fixed price rewards', () => {
  const lines = [L(1, 300), L(2, 200), L(3, 100)];
  assert.equal(run(lines, [promo({ effect: { kind: 'buy_x_get_y', buy: 2, get: 1, reward_mode: 'percent', reward_value: 50 } })]).promoDiscount, 50);
  assert.equal(run(lines, [promo({ effect: { kind: 'buy_x_get_y', buy: 2, get: 1, reward_mode: 'fixed_off', reward_value: 30 } })]).promoDiscount, 30);
  assert.equal(run(lines, [promo({ effect: { kind: 'buy_x_get_y', buy: 2, get: 1, reward_mode: 'final_price', reward_value: 20 } })]).promoDiscount, 80);
});

test('separate qualifying and reward groups: buy 2 from A, get a specific product from B at 50%', () => {
  const A = { products: [], categories: [10] }; const B = { products: [99], categories: [] };
  const lines = [L(1, 200, 2, [10]), L(99, 400, 1, [20]), L(50, 90, 1, [20])];
  const p = promo({ qualify: A, reward: B, effect: { kind: 'buy_x_get_y', buy: 2, get: 1, reward_mode: 'percent', reward_value: 50 } });
  const r = run(lines, [p]);
  assert.equal(r.promoDiscount, 200);
  assert.deepEqual(r.lines.map((l) => l.promoDiscount), [0, 200, 0]);
  assert.equal(run([L(1, 200, 1, [10]), L(99, 400, 1, [20])], [p]).promoDiscount, 0, 'one qualifying item is not enough');
});

test('buy 3 for a fixed price never raises a price and picks groups', () => {
  const p = promo({ effect: { kind: 'group_price', qty: 3, price: 500 } });
  assert.equal(run([L(1, 300), L(2, 200), L(3, 100)], [p]).promoDiscount, 100);
  assert.equal(run([L(1, 100), L(2, 100), L(3, 100)], [p]).promoDiscount, 0, 'list price is already lower than the group price');
  assert.equal(run([L(1, 300), L(2, 200)], [p]).promoDiscount, 0);
  const six = run([L(1, 300, 6)], [p]); assert.equal(six.promoDiscount, 2 * (900 - 500));
});

test('buy more save more', () => {
  const p = promo({ effect: { kind: 'tiers', mode: 'percent', tiers: [{ qty: 2, value: 10 }, { qty: 3, value: 20 }, { qty: 5, value: 30 }] } });
  assert.equal(run([L(1, 100, 1)], [p]).promoDiscount, 0);
  assert.equal(run([L(1, 100, 2)], [p]).promoDiscount, 20);
  assert.equal(run([L(1, 100, 3)], [p]).promoDiscount, 60);
  assert.equal(run([L(1, 100, 4)], [p]).promoDiscount, 80);
  assert.equal(run([L(1, 100, 7)], [p]).promoDiscount, 210);
});

test('tiered quantity pricing picks the cheapest combination of tiers', () => {
  const p = promo({ effect: { kind: 'tiers', mode: 'total_price', tiers: [{ qty: 1, value: 200 }, { qty: 2, value: 350 }, { qty: 3, value: 450 }] } });
  const price = (n, each = 250) => { const r = run([L(1, each, n)], [p]); return each * n - r.promoDiscount; };
  assert.equal(price(1), 200); assert.equal(price(2), 350); assert.equal(price(3), 450);
  assert.equal(price(4), 450 + 200); assert.equal(price(5), 450 + 350); assert.equal(price(6), 900);
});

test('percentage discount: integer rounding and exact line split', () => {
  const lines = [L(1, 99, 3), L(2, 33, 1)];
  const r = run(lines, [promo({ effect: { kind: 'percent_off', percent: 20 } })]);
  assert.equal(r.promoDiscount, Math.round((99 * 3 + 33) * 0.2));
  assert.equal(r.lines.reduce((s, l) => s + l.promoDiscount, 0), r.promoDiscount);
});

test('fixed amount with minimum subtotal and per-unit cap', () => {
  const p = promo({ when: { logic: 'and', items: [{ kind: 'min_subtotal', value: 500, scope: 'cart' }] }, effect: { kind: 'fixed_off', amount: 50, per: 'cart' } });
  assert.equal(run([L(1, 450)], [p]).promoDiscount, 0);
  assert.equal(run([L(1, 300), L(2, 300)], [p]).promoDiscount, 50);
  const big = promo({ effect: { kind: 'fixed_off', amount: 500, per: 'unit' } });
  assert.equal(run([L(1, 100, 2)], [big]).promoDiscount, 200, 'cannot take more than the price');
});

test('bundle: T-shirt + pants + jacket for 700', () => {
  const p = promo({ qualify: { all: false, products: [], categories: [] }, effect: { kind: 'bundle', price: 700, slots: [
    { sel: { all: false, products: [], categories: [1] }, qty: 1 }, { sel: { all: false, products: [], categories: [2] }, qty: 1 }, { sel: { all: false, products: [], categories: [3] }, qty: 1 }] } });
  const lines = [L(1, 300, 2, [1]), L(2, 300, 1, [2]), L(3, 400, 1, [3])];
  const r = run(lines, [p]);
  assert.equal(r.promoDiscount, 300 + 300 + 400 - 700);
  assert.equal(r.applied[0].applications, 1);
  assert.equal(run([L(1, 300, 1, [1]), L(2, 300, 1, [2])], [p]).promoDiscount, 0);
});

test('free gift with purchase: needs a condition, uses stock and the shopper choice', () => {
  const p = promo({ qualify: { all: true }, when: { logic: 'and', items: [{ kind: 'min_qty', value: 3, scope: 'qualifying' }] }, effect: { kind: 'gift', gifts: [70, 71] } });
  assert.equal(run([L(1, 100, 2)], [p], undefined, { giftStock: new Map([[70, 5]]) }).gifts.length, 0);
  const r = run([L(1, 100, 3)], [p], undefined, { giftStock: new Map([[70, 5], [71, 5]]), selections: { [p.id]: 71 } });
  assert.deepEqual(r.gifts.map((g) => [g.productId, g.qty]), [[71, 1]]);
  const none = run([L(1, 100, 3)], [p], undefined, { giftStock: new Map([[70, 0], [71, 0]]) });
  assert.equal(none.gifts.length, 0);
  assert.equal(none.promoDiscount, 0);
});

test('maximum discount cap', () => {
  const p = promo({ max_discount: 100, effect: { kind: 'percent_off', percent: 50 } });
  assert.equal(run([L(1, 1000)], [p]).promoDiscount, 100);
});

test('excluded products and excluded-from-all-offers lines never get discounts', () => {
  const p = promo({ exclude: { all: false, products: [2], categories: [] }, effect: { kind: 'percent_off', percent: 10 } });
  const r = run([L(1, 100), L(2, 100), { ...L(3, 100), excluded: true }], [p]);
  assert.deepEqual(r.lines.map((l) => l.promoDiscount), [10, 0, 0]);
});

test('conflicts: one discount per product; best savings wins; priority wins when asked; no double discount', () => {
  const ten = promo({ effect: { kind: 'percent_off', percent: 10 } }, { priority: 5 });
  const thirty = promo({ effect: { kind: 'percent_off', percent: 30 } }, { priority: 1 });
  const lines = [L(1, 200)];
  assert.equal(run(lines, [ten, thirty]).promoDiscount, 60, 'best savings');
  assert.equal(run(lines, [ten, thirty], { resolution: 'priority' }).promoDiscount, 20, 'priority');
  assert.equal(run(lines, [ten, thirty]).applied.length, 1);
});

test('stackable offers compound on the remaining price and never exceed it', () => {
  const a = promo({ effect: { kind: 'percent_off', percent: 50 } }, { stacking: 'stackable' });
  const b = promo({ effect: { kind: 'percent_off', percent: 50 } }, { stacking: 'stackable' });
  const r = run([L(1, 200)], [a, b]);
  assert.equal(r.promoDiscount, 150); // 100 then 50, not 200
  const big = promo({ effect: { kind: 'fixed_off', amount: 500, per: 'unit' } }, { stacking: 'stackable' });
  assert.equal(run([L(1, 200)], [a, big]).promoDiscount, 200);
  const blocker = promo({ effect: { kind: 'percent_off', percent: 10 } });
  assert.equal(run([L(1, 200)], [blocker, a]).applied.length, 1, 'a non-stackable offer blocks stacking on the same unit');
});

test('exclusive offers beat the combination only when they save more', () => {
  const ex = promo({ effect: { kind: 'percent_off', percent: 40 } }, { stacking: 'exclusive' });
  const a = promo({ effect: { kind: 'percent_off', percent: 10 } }, { stacking: 'stackable' });
  const b = promo({ effect: { kind: 'percent_off', percent: 10 } }, { stacking: 'stackable' });
  const r = run([L(1, 100)], [ex, a, b]);
  assert.deepEqual(r.applied.map((x) => x.id), [ex.id]);
  const weak = promo({ effect: { kind: 'percent_off', percent: 5 } }, { stacking: 'exclusive' });
  const r2 = run([L(1, 100)], [weak, a, b]);
  assert.deepEqual(r2.applied.map((x) => x.id).sort(), [a.id, b.id].sort());
});

test('custom rule: OR conditions and multi-step effects', () => {
  const p = promo({
    when: { logic: 'or', items: [{ kind: 'min_qty', value: 5, scope: 'cart' }, { kind: 'min_subtotal', value: 1000, scope: 'cart' }] },
    effect: { kind: 'multi', effects: [{ kind: 'percent_off', percent: 10, apply_to: 'cheapest', group_size: 3 }, { kind: 'fixed_off', amount: 20, per: 'cart' }] },
  });
  assert.equal(run([L(1, 100, 2)], [p]).promoDiscount, 0);
  const r = run([L(1, 600), L(2, 500)], [p]);
  assert.ok(r.promoDiscount > 0);
  assert.ok(r.promoDiscount <= 1100);
});

test('progress hints', () => {
  const p = promo({ effect: { kind: 'buy_x_get_y', buy: 2, get: 1 } });
  assert.deepEqual(run([L(1, 100, 2)], [p]).hints.map((h) => [h.kind, h.qty]), [['add_qty', 1]]);
  const amt = promo({ when: { logic: 'and', items: [{ kind: 'min_subtotal', value: 500, scope: 'cart' }] }, effect: { kind: 'percent_off', percent: 10 } });
  assert.deepEqual(run([L(1, 400)], [amt]).hints.map((h) => [h.kind, h.amount]), [['add_amount', 100]]);
});

test('validation refuses unsafe or ambiguous rules', () => {
  const bad = definitionSchema.parse({ qualify: { all: false }, effect: { kind: 'gift', gifts: [1] } });
  const codes = validateDefinition('gift', bad).map((i) => i.code);
  assert.ok(codes.includes('no_products') || codes.includes('gift_needs_condition'));
  assert.ok(validateDefinition('percentage', definitionSchema.parse({ qualify: { all: true }, effect: { kind: 'gift', gifts: [1] } })).some((i) => i.code === 'effect_not_allowed'));
});

test('fuzz: totals are conserved, never negative, never above the cart', () => {
  let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const stackings = ['exclusive', 'per_product', 'stackable'];
  for (let it = 0; it < 400; it++) {
    const lines = Array.from({ length: 1 + rnd(5) }, (_, i) => L(i + 1, 10 + rnd(500), 1 + rnd(5), [1 + rnd(3)]));
    const effects = [
      { kind: 'percent_off', percent: 1 + rnd(100), apply_to: ['all', 'cheapest', 'most_expensive'][rnd(3)], group_size: rnd(2) ? 1 + rnd(4) : null },
      { kind: 'fixed_off', amount: 1 + rnd(300), per: rnd(2) ? 'unit' : 'cart' },
      { kind: 'buy_x_get_y', buy: 1 + rnd(3), get: 1 + rnd(2), reward_pick: ['cheapest', 'most_expensive', 'second_most_expensive'][rnd(3)], reward_mode: 'percent', reward_value: 1 + rnd(100) },
      { kind: 'group_price', qty: 2 + rnd(3), price: rnd(900) },
      { kind: 'tiers', mode: ['percent', 'fixed_off', 'total_price'][rnd(3)], tiers: [{ qty: 1, value: 10 + rnd(20) }, { qty: 2 + rnd(2), value: 30 + rnd(20) }] },
    ];
    const promos = Array.from({ length: 1 + rnd(4) }, () => promo({ qualify: { all: !!rnd(2), products: [], categories: [1 + rnd(3)] }, max_discount: rnd(3) ? null : 1 + rnd(200), effect: effects[rnd(effects.length)] }, { stacking: stackings[rnd(3)], priority: rnd(5) }));
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
    for (const resolution of ['priority', 'best_savings']) {
      const r = run(lines, promos, { resolution });
      assert.ok(Number.isInteger(r.promoDiscount) && r.promoDiscount >= 0 && r.promoDiscount <= total, `bad total ${r.promoDiscount} / ${total}`);
      assert.equal(r.lines.reduce((s, l) => s + l.promoDiscount, 0), r.promoDiscount);
      r.lines.forEach((l, i) => { assert.ok(Number.isInteger(l.promoDiscount) && l.promoDiscount >= 0 && l.promoDiscount <= lines[i].price * lines[i].qty); });
      assert.equal(r.applied.reduce((s, a) => s + a.discount, 0), r.promoDiscount);
      assert.deepEqual(run(lines, promos, { resolution }), r, 'deterministic');
    }
  }
});

test('distribute keeps totals exact', () => {
  for (let i = 0; i < 300; i++) {
    const w = Array.from({ length: 1 + (i % 6) }, (_, k) => (k * 7 + i) % 13);
    const total = (i * 17) % 200;
    const out = distribute(total, w);
    if (w.some((x) => x > 0)) assert.equal(out.reduce((s, v) => s + v, 0), total);
  }
});

test('any Buy X Get Y combination, entered freely by the owner', () => {
  const combos = [[1, 1], [2, 1], [2, 2], [3, 1], [3, 2], [3, 3], [4, 2], [5, 2], [5, 3], [10, 5]];
  for (const [buy, get] of combos) {
    const size = buy + get;
    const p = promo({ effect: { kind: 'buy_x_get_y', buy, get, reward_pick: 'cheapest' } });
    // 2 full groups + a partial one, each item a different price
    const n = size * 2 + (size - 1);
    const lines = Array.from({ length: n }, (_, i) => L(i + 1, 100 + i * 10));
    const r = run(lines, [p]);
    const sorted = lines.map((l) => l.price).sort((a, b) => b - a);
    let expected = 0;
    for (let g = 0; g < 2; g++) expected += sorted.slice(g * size, (g + 1) * size).slice(buy).reduce((s, x) => s + x, 0);
    assert.equal(r.promoDiscount, expected, `buy ${buy} get ${get}`);
    assert.equal(r.applied[0].applications, 2, `buy ${buy} get ${get} applications`);
    assert.equal(run(lines.slice(0, size - 1), [p]).promoDiscount, 0, `buy ${buy} get ${get} not enough`);
  }
});

test('reward strategies: second cheapest, specific product, percent, fixed, final price', () => {
  const lines = [L(1, 400), L(2, 300), L(3, 200), L(4, 100)];
  const e = (o) => promo({ effect: { kind: 'buy_x_get_y', buy: 3, get: 1, ...o } });
  assert.equal(run(lines, [e({ reward_pick: 'second_cheapest' })]).promoDiscount, 200);
  assert.equal(run(lines, [e({ reward_pick: 'cheapest' })]).promoDiscount, 100);
  assert.equal(run(lines, [e({ reward_pick: 'second_most_expensive' })]).promoDiscount, 300);
  assert.equal(run(lines, [e({ reward_pick: 'most_expensive' })]).promoDiscount, 400);
  assert.equal(run(lines, [e({ reward_mode: 'percent', reward_value: 25 })]).promoDiscount, 25);
  assert.equal(run(lines, [e({ reward_mode: 'fixed_off', reward_value: 40 })]).promoDiscount, 40);
  assert.equal(run(lines, [e({ reward_mode: 'final_price', reward_value: 10 })]).promoDiscount, 90);
  const specific = promo({ qualify: { products: [], categories: [1] }, reward: { products: [4], categories: [] }, effect: { kind: 'buy_x_get_y', buy: 3, get: 1, reward_mode: 'percent', reward_value: 100 } });
  const lines2 = [L(1, 400, 1, [1]), L(2, 300, 1, [1]), L(3, 200, 1, [1]), L(4, 100, 1, [9])];
  const r = run(lines2, [specific]);
  assert.deepEqual(r.lines.map((l) => l.promoDiscount), [0, 0, 0, 100]);
});

test('multiple qualifying categories and repeated application with a separate reward product', () => {
  const p = promo({ qualify: { products: [], categories: [1, 2] }, reward: { products: [99], categories: [] }, effect: { kind: 'buy_x_get_y', buy: 2, get: 1 } });
  const lines = [L(1, 100, 2, [1]), L(2, 150, 2, [2]), L(99, 80, 2, [7])]; // 4 qualifiers across two categories -> 2 rewards
  const r = run(lines, [p]);
  assert.equal(r.promoDiscount, 160);
  assert.equal(r.applied[0].applications, 2);
  assert.equal(run([L(1, 100, 4, [1]), L(99, 80, 1, [7])], [p]).promoDiscount, 80, 'only one reward product in the cart');
});
