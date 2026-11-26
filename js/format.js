/* ROI Simulator — 表示用の整形（丸めはここだけ）
 * 画面とコピー文の両方がこの関数を使うので、表示とコピー内容は必ず一致する。
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./calc.js') : root.RoiCalc);
  if (isNode) module.exports = api;
  else root.RoiFormat = api;
})(typeof self !== 'undefined' ? self : this, function (Calc) {
  'use strict';

  const nfInt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfInput = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 });

  /** 整数・3 桁区切り（四捨五入。-0 は 0 にする） */
  function int(x) {
    const r = Math.round(Math.abs(x));
    if (r === 0) return '0';
    return (x < 0 ? '-' : '') + nfInt.format(r);
  }
  /** 円 → 万円の整数表示 */
  function man(yen) { return int(yen / Calc.YEN_PER_MAN); }
  /** 入力値の表示（直接入力の小数も丸めずに見せる） */
  function input(v) { return nfInput.format(v); }

  /** 計算結果を画面用の文字と色の区分にする */
  function view(result) {
    const netText = man(result.annualNetYen);
    const netTone = netText === '0' ? 'zero' : (result.annualNetYen > 0 ? 'pos' : 'neg');
    let payback;
    if (result.payback.status === 'unrecoverable') payback = { text: '回収不可', unit: '', tone: 'neg' };
    else if (result.payback.status === 'noInvestment') payback = { text: '初期投資なし', unit: '', tone: '' };
    else payback = { text: nf2.format(result.payback.years), unit: '年', tone: '' };
    return {
      hours:   { label: '年間削減工数',           text: int(result.annualHours),      unit: '時間', tone: '' },
      benefit: { label: '年間人件費換算効果',     text: man(result.annualBenefitYen), unit: '万円', tone: '' },
      net:     { label: '保守費控除後の年間効果', text: netText,                      unit: '万円', tone: netTone },
      payback: Object.assign({ label: '単純投資回収期間' }, payback),
    };
  }

  /** 横棒グラフの値（表示は万円の整数）と長さ（%・最大値基準） */
  function bars(result) {
    const items = [
      { key: 'benefit', label: '年間人件費換算効果', yen: result.annualBenefitYen },
      { key: 'initial', label: '初期開発・導入費',   yen: result.initialCostYen },
      { key: 'annual',  label: '年間運用・保守費',   yen: result.annualCostYen },
    ];
    const max = Math.max.apply(null, items.map(i => i.yen));
    return items.map(i => Object.assign({}, i, {
      text: man(i.yen), unit: '万円',
      pct: max > 0 && Number.isFinite(max) ? Math.max(0, Math.min(100, i.yen / max * 100)) : 0,
    }));
  }

  function dateText(d) {
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  /** コピー用の文章（メール・Teams・チャットに貼る想定） */
  function report(projectName, result, date) {
    const v = view(result);
    const name = String(projectName || '').trim();
    const lines = [
      '投資対効果シミュレーター 試算結果',
      '案件名：' + (name || '（未入力）'),
      '試算日：' + dateText(date || new Date()),
      '',
      '【入力条件】',
    ];
    Calc.FIELDS.forEach(f => lines.push('・' + f.label + '：' + input(result.inputs[f.key]) + ' ' + f.unit));
    lines.push('', '【試算結果】');
    ['hours', 'benefit', 'net', 'payback'].forEach(k => {
      lines.push('・' + v[k].label + '：' + v[k].text + (v[k].unit ? ' ' + v[k].unit : ''));
    });
    lines.push('', '※削減工数を人件費に換算した概算です。実際の現金支出削減額を保証するものではありません。');
    return lines.join('\n');
  }

  return { int, man, input, view, bars, report, dateText };
});
