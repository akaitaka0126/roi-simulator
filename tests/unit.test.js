/* 計算ロジックの単体試験: node tests/unit.test.js */
const assert = require('assert');
const Calc = require('../js/calc.js');
const Fmt = require('../js/format.js');
let n = 0;
function t(name, fn) { fn(); n++; console.log('PASS', name); }
const base = Calc.defaults();
const V = inputs => Fmt.view(Calc.compute(inputs));

t('基準テスト（3,000 時間 / 1,500 万円 / 1,400 万円 / 0.36 年）', () => {
  const r = Calc.compute(base);
  assert.strictEqual(r.annualHours, 3000);
  assert.strictEqual(r.annualBenefitYen, 15000000);
  assert.strictEqual(r.annualNetYen, 14000000);
  const v = Fmt.view(r);
  assert.deepStrictEqual([v.hours.text, v.benefit.text, v.net.text, v.payback.text], ['3,000', '1,500', '1,400', '0.36']);
  assert.strictEqual(v.net.tone, 'pos');
});
t('途中で丸めない（12,345 件・7.5 分）', () => {
  const r = Calc.compute(Object.assign({}, base, { casesPerMonth: 12345, minutesSaved: 7.5 }));
  assert.strictEqual(r.annualHours, 12345 * 12 * 7.5 / 60);
  assert.strictEqual(Fmt.view(r).hours.text, '18,518');
});
t('すべて 0 でもエラーなし・回収不可', () => {
  const z = { casesPerMonth: 0, minutesSaved: 0, hourlyCost: 0, initialCost: 0, annualCost: 0 };
  const v = V(z);
  assert.deepStrictEqual([v.hours.text, v.benefit.text, v.net.text, v.payback.text], ['0', '0', '0', '回収不可']);
  assert.strictEqual(v.net.tone, 'zero');
  Fmt.bars(Calc.compute(z)).forEach(b => assert.strictEqual(b.pct, 0));
});
t('年間純効果が負 → 赤・回収不可', () => {
  const v = V(Object.assign({}, base, { annualCost: 2000 }));
  assert.strictEqual(v.net.text, '-500'); assert.strictEqual(v.net.tone, 'neg');
  assert.strictEqual(v.payback.text, '回収不可'); assert.strictEqual(v.payback.tone, 'neg');
});
t('年間純効果が 0 → 通常色・回収不可', () => {
  const v = V({ casesPerMonth: 1000, minutesSaved: 6, hourlyCost: 1000, initialCost: 500, annualCost: 120 });
  assert.strictEqual(v.net.text, '0'); assert.strictEqual(v.net.tone, 'zero');
  assert.strictEqual(v.payback.text, '回収不可');
});
t('初期費用 0 かつ純効果が正 → 初期投資なし', () => {
  assert.strictEqual(V(Object.assign({}, base, { initialCost: 0 })).payback.text, '初期投資なし');
});
t('不正値は受け付けない', () => {
  assert.strictEqual(Calc.sanitizeText('-5'), '5');
  assert.strictEqual(Calc.sanitizeText('1e5'), '15');
  assert.strictEqual(Calc.sanitizeText('Infinity'), '');
  assert.strictEqual(Calc.sanitizeText('１，５００．５'), '1500.5');
  assert.strictEqual(Calc.sanitizeText('1.2.3'), '1.23');
  assert.strictEqual(Calc.parseNumber('abc').ok, false);
  assert.strictEqual(Calc.parseNumber('9'.repeat(14)).reason, 'tooLarge');
  [NaN, Infinity, -1, '5', null, undefined, 1e13].forEach(x => assert.strictEqual(Calc.isValidValue(x), false));
  const s = Calc.sanitizeInputs({ casesPerMonth: -3, minutesSaved: NaN, hourlyCost: 'x', initialCost: Infinity, annualCost: 50 });
  assert.deepStrictEqual(s, Object.assign(Calc.defaults(), { annualCost: 50 }));
});
t('上限いっぱいの値でも NaN / Infinity にならない', () => {
  const big = { casesPerMonth: 1e12, minutesSaved: 1e12, hourlyCost: 1e12, initialCost: 1e12, annualCost: 1e12 };
  const txt = JSON.stringify(V(big)) + Fmt.report('x', Calc.compute(big));
  assert.ok(!/NaN|Infinity/.test(txt), txt);
});
t('グラフは最大値基準', () => {
  const b = Fmt.bars(Calc.compute(base));
  assert.deepStrictEqual(b.map(x => Math.round(x.pct)), [100, 33, 7]);
  assert.deepStrictEqual(b.map(x => x.text), ['1,500', '500', '100']);
});
t('コピー文に画面と同じ値が入る', () => {
  const txt = Fmt.report('在庫管理システム', Calc.compute(base), new Date(2026, 10, 27));
  ['案件名：在庫管理システム', '試算日：2026年11月27日', '・月間対象件数：1,500 件', '・年間削減工数：3,000 時間',
   '・年間人件費換算効果：1,500 万円', '・保守費控除後の年間効果：1,400 万円', '・単純投資回収期間：0.36 年']
    .forEach(s => assert.ok(txt.includes(s), s));
  assert.ok(Fmt.report('', Calc.compute(base)).includes('案件名：（未入力）'));
});
t('将来の拡張: 年間稼働月数を変えられる', () => {
  assert.strictEqual(Calc.compute(base, { monthsPerYear: 10 }).annualHours, 2500);
});
t('版の番号が app.js と sw.js でそろっている・事前キャッシュのファイルが全部ある', () => {
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.strictEqual(sw.match(/const VERSION = '([^']+)'/)[1], app);
  const assets = sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].match(/'\.\/([^']*)'/g).map(x => x.slice(3, -1)).filter(Boolean);
  assets.forEach(a => assert.ok(fs.existsSync(path.join(root, a)), a));
});
console.log(`\n${n} 件すべて PASS`);
