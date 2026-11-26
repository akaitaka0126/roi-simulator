/* ROI Simulator — 計算ロジック（画面に依存しない）
 * ブラウザでは window.RoiCalc、Node では require('./calc.js') で使う。
 * 途中計算では丸めない。丸めは format.js（表示）だけで行う。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoiCalc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 入力項目の定義。項目を増やすときはここに 1 行足す */
  const FIELDS = [
    { key: 'casesPerMonth', symbol: 'N', label: '月間対象件数',          unit: '件',   def: 1500, min: 0, max: 10000, step: 10 },
    { key: 'minutesSaved',  symbol: 'T', label: '1件あたりの純削減時間', unit: '分',   def: 10,   min: 0, max: 60,    step: 1 },
    { key: 'hourlyCost',    symbol: 'R', label: '時間あたり人件費',      unit: '円',   def: 5000, min: 0, max: 20000, step: 100 },
    { key: 'initialCost',   symbol: 'C', label: '初期開発・導入費',      unit: '万円', def: 500,  min: 0, max: 3000,  step: 10 },
    { key: 'annualCost',    symbol: 'M', label: '年間運用・保守費',      unit: '万円', def: 100,  min: 0, max: 1000,  step: 1 },
  ];

  const YEN_PER_MAN = 10000;
  /** 直接入力の上限（1 兆）。桁あふれ・Infinity を防ぐ */
  const MAX_INPUT = 1e12;
  /** 将来「年間稼働月数」を変えられるようにするための既定値 */
  const DEFAULT_OPTIONS = Object.freeze({ monthsPerYear: 12 });

  function defaults() {
    const out = {};
    FIELDS.forEach(f => { out[f.key] = f.def; });
    return out;
  }

  /** 受け付ける値か（有限・0 以上・上限以下の数値） */
  function isValidValue(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_INPUT;
  }

  /** 入力欄の文字を、受け付ける文字だけにする（全角数字→半角、全角の小数点→「.」、桁区切りは捨てる） */
  function sanitizeText(text) {
    let s = String(text == null ? '' : text)
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[．。]/g, '.')
      .replace(/[^0-9.]/g, '');           // 数字と小数点以外（- e , 空白 文字）は受け付けない
    const i = s.indexOf('.');
    if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
    return s;
  }

  /** 文字列を数値にする。{ ok, value, empty, reason } */
  function parseNumber(text) {
    const s = sanitizeText(text);
    if (s === '' || s === '.') return { ok: false, empty: true, value: null, reason: 'empty' };
    const v = Number(s);
    if (!Number.isFinite(v)) return { ok: false, empty: false, value: null, reason: 'invalid' };
    if (v > MAX_INPUT) return { ok: false, empty: false, value: null, reason: 'tooLarge' };
    return { ok: true, empty: false, value: v, reason: null };
  }

  /** 保存データなど外から来た値を検査し、不正な項目だけ初期値に戻す */
  function sanitizeInputs(obj) {
    const out = defaults();
    if (obj && typeof obj === 'object') {
      FIELDS.forEach(f => { if (isValidValue(obj[f.key])) out[f.key] = obj[f.key]; });
    }
    return out;
  }

  /**
   * 試算する。入力は丸めずに使い、結果も丸めない。
   * 金額はすべて「円」で返す（万円への換算と丸めは表示側）。
   */
  function compute(inputs, options) {
    const opt = Object.assign({}, DEFAULT_OPTIONS, options || {});
    const x = sanitizeInputs(inputs);
    const N = x.casesPerMonth, T = x.minutesSaved, R = x.hourlyCost, C = x.initialCost, M = x.annualCost;

    const annualHours = N * opt.monthsPerYear * T / 60;          // 4-1 年間削減工数（時間）
    const annualBenefitYen = annualHours * R;                     // 4-2 年間人件費換算効果（円）
    const annualCostYen = M * YEN_PER_MAN;
    const annualNetYen = annualBenefitYen - annualCostYen;        // 4-3 保守費控除後の年間効果（円）
    const initialCostYen = C * YEN_PER_MAN;

    let payback;                                                  // 4-4 単純投資回収期間（年）
    if (!(annualNetYen > 0)) payback = { status: 'unrecoverable', years: null };
    else if (initialCostYen === 0) payback = { status: 'noInvestment', years: 0 };
    else payback = { status: 'ok', years: initialCostYen / annualNetYen };

    return { inputs: x, annualHours, annualBenefitYen, annualCostYen, annualNetYen, initialCostYen, payback };
  }

  return { FIELDS, YEN_PER_MAN, MAX_INPUT, DEFAULT_OPTIONS, defaults, isValidValue, sanitizeText, parseNumber, sanitizeInputs, compute };
});
