/* ROI Simulator — 画面の動き（入力の同期・表示・保存・コピー・オフライン）
 * 計算は calc.js、表示の丸めは format.js。ここは DOM だけを扱う。
 */
(function () {
  'use strict';
  const Calc = window.RoiCalc;
  const Fmt = window.RoiFormat;

  /** ★更新したら sw.js の VERSION と同じ値にそろえる */
  const APP_VERSION = '1.0.0';
  /** 保存の名前。同じ住所に置く他のアプリ（例: tire-pressure-app）と重ならない名前にする */
  const STORAGE_KEY = 'roi-simulator.state';
  const SCHEMA = 1;

  // ===== 1. 保存（端末内の localStorage だけ） =====
  const Store = {
    load() {
      let raw = null;
      try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
      if (raw == null) return null;
      try {
        const d = JSON.parse(raw);
        if (!d || typeof d !== 'object' || d.v !== SCHEMA) throw new Error('schema');
        return {
          project: typeof d.project === 'string' ? d.project.slice(0, 60) : '',
          inputs: Calc.sanitizeInputs(d.inputs),       // 不正な項目だけ初期値に戻す
        };
      } catch (e) {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* 何もしない */ }
        return null;                                     // 壊れていたら初期値で始める
      }
    },
    save(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA, project: state.project, inputs: state.inputs }));
      } catch (e) { /* 保存できない環境でも計算は続ける */ }
    },
  };

  const saved = Store.load();
  const state = saved || { project: '', inputs: Calc.defaults() };

  // ===== 2. 画面部品を作る =====
  const $ = id => document.getElementById(id);
  const refs = {};

  /** 入力値がスライダーの上限を超えたときの新しい上限（1・1.2・1.5・2・2.5・3・4・5・6・8 × 10 の累乗） */
  function sliderMax(f, v) {
    if (!(v > f.max)) return f.max;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
      const c = Math.round(m * 10) * mag / 10;
      if (c >= v) return Math.ceil(c / f.step) * f.step;
    }
    return Math.ceil(v / f.step) * f.step;
  }

  function buildFields() {
    const box = $('fields');
    Calc.FIELDS.forEach(f => {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.dataset.key = f.key;
      const hint = f.key === 'minutesSaved'
        ? '<p class="field-hint">新たに発生する作業時間を差し引いた、実質的な削減時間を入力してください。</p>' : '';
      wrap.innerHTML =
        '<div class="field-head">' +
          `<label class="field-label" for="in-${f.key}">${f.label}</label>` +
          '<div class="num">' +
            `<input id="in-${f.key}" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" spellcheck="false" aria-describedby="err-${f.key}">` +
            `<span class="unit">${f.unit}</span>` +
          '</div>' +
        '</div>' +
        `<input id="rg-${f.key}" class="range" type="range" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.label}（スライダー）">` +
        `<div class="range-scale"><span>${Fmt.input(f.min)}</span><span class="range-max"></span></div>` +
        hint +
        `<p id="err-${f.key}" class="field-error" hidden></p>`;
      box.appendChild(wrap);
      refs[f.key] = {
        f, wrap,
        input: wrap.querySelector('#in-' + f.key),
        range: wrap.querySelector('#rg-' + f.key),
        maxLabel: wrap.querySelector('.range-max'),
        err: wrap.querySelector('#err-' + f.key),
        lastText: '',
      };
    });
  }

  const RESULT_KEYS = ['hours', 'benefit', 'net', 'payback'];
  const cardRefs = {};
  function buildCards() {
    const box = $('cards');
    RESULT_KEYS.forEach(k => {
      const c = document.createElement('div');
      c.className = 'card';
      c.dataset.key = k;
      c.innerHTML = '<div class="card-label"></div><div class="card-value"><span class="card-num"></span><span class="card-unit"></span></div>';
      box.appendChild(c);
      cardRefs[k] = { card: c, label: c.querySelector('.card-label'), num: c.querySelector('.card-num'), unit: c.querySelector('.card-unit') };
    });
  }

  const barRefs = {};
  function buildChart() {
    const box = $('chart');
    ['benefit', 'initial', 'annual'].forEach(k => {
      const row = document.createElement('div');
      row.className = 'bar';
      row.dataset.key = k;
      row.innerHTML = '<div class="bar-label"></div><div class="bar-line"><div class="bar-track">' +
        `<div class="bar-fill ${k}"></div></div><div class="bar-value"><span class="v"></span><span class="u"></span></div></div>`;
      box.appendChild(row);
      barRefs[k] = { label: row.querySelector('.bar-label'), fill: row.querySelector('.bar-fill'),
                     value: row.querySelector('.v'), unit: row.querySelector('.u') };
    });
  }

  // ===== 3. 入力の同期 =====
  function setRange(r, v, adjustMax) {
    if (adjustMax) {
      const max = sliderMax(r.f, v);
      if (Number(r.range.max) !== max) r.range.max = String(max);
      r.maxLabel.textContent = Fmt.input(max);
    }
    r.range.value = String(v);
    const max = Number(r.range.max);
    r.range.style.setProperty('--pct', (max > 0 ? Math.min(100, v / max * 100) : 0) + '%');
  }

  function showError(r, msg) {
    r.err.textContent = msg;
    r.err.hidden = !msg;
    r.wrap.classList.toggle('invalid', !!msg);
  }

  function onText(r) {
    const before = r.input.value;
    const clean = Calc.sanitizeText(before);
    const p = Calc.parseNumber(clean);
    if (p.reason === 'tooLarge') {                     // 上限超えは受け付けず、直前の文字に戻す
      r.input.value = r.lastText;
      showError(r, '入力できるのは 1 兆までです');
      return;
    }
    if (clean !== before) r.input.value = clean;        // マイナス・文字・記号は入らない
    r.lastText = r.input.value;
    showError(r, /[^0-9０-９.．。,，\s]/.test(before) ? '0 以上の数値だけ入力できます' : '');
    const v = p.ok ? p.value : 0;                        // 空欄は 0 として計算（欄を離れると 0 と表示）
    state.inputs[r.f.key] = v;
    setRange(r, v, true);                                // 上限を超えたらスライダーの範囲を広げる
    render();
  }

  function onRange(r) {
    const v = Number(r.range.value);
    if (!Calc.isValidValue(v)) return;
    state.inputs[r.f.key] = v;
    r.input.value = Fmt.input(v);
    r.lastText = r.input.value;
    showError(r, '');
    setRange(r, v, false);                               // 操作中は範囲を変えない（つまみが飛ばない）
    render();
  }

  function bindField(r) {
    r.input.addEventListener('input', () => onText(r));
    r.input.addEventListener('focus', () => {
      r.input.value = Calc.sanitizeText(r.input.value);  // 編集中は桁区切りを外す
      r.lastText = r.input.value;
      setTimeout(() => { try { r.input.select(); } catch (e) { /* 何もしない */ } }, 0);
    });
    r.input.addEventListener('blur', () => {
      r.input.value = Fmt.input(state.inputs[r.f.key]);
      r.lastText = r.input.value;
      showError(r, '');
    });
    r.input.addEventListener('keydown', e => { if (e.key === 'Enter') r.input.blur(); });
    r.range.addEventListener('input', () => onRange(r));
  }

  function fillInputs() {
    Object.values(refs).forEach(r => {
      const v = state.inputs[r.f.key];
      r.input.value = Fmt.input(v);
      r.lastText = r.input.value;
      showError(r, '');
      setRange(r, v, true);
    });
    $('project').value = state.project;
  }

  // ===== 4. 表示 =====
  /** 文字幅の目安（数字・記号は半角、ほかは全角）。カードの文字の大きさを決める */
  function textLen(s) {
    let n = 0;
    for (const ch of s) n += /[0-9,.\-]/.test(ch) ? 1 : 1.75;
    return n;
  }

  let lastResult = null;
  function render() {
    const result = Calc.compute(state.inputs);
    lastResult = result;
    const v = Fmt.view(result);
    RESULT_KEYS.forEach(k => {
      const c = cardRefs[k];
      c.label.textContent = v[k].label;
      c.num.textContent = v[k].text;
      c.num.style.setProperty('--len', String(textLen(v[k].text)));
      c.unit.textContent = v[k].unit;
      c.unit.hidden = !v[k].unit;
      if (v[k].tone) c.card.dataset.tone = v[k].tone; else delete c.card.dataset.tone;
    });
    Fmt.bars(result).forEach(b => {
      const r = barRefs[b.key];
      r.label.textContent = b.label;
      r.fill.style.width = b.pct.toFixed(3) + '%';
      r.value.textContent = b.text;
      r.unit.textContent = b.unit;
    });
    Store.save(state);
  }

  // ===== 5. リセット・コピー =====
  let toastTimer = null;
  function toast(msg, isError) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function onReset() {
    if (!window.confirm('試算条件（5 項目）をすべて初期値に戻します。よろしいですか？\n※案件名はそのまま残ります。')) return;
    state.inputs = Calc.defaults();
    fillInputs();
    render();
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* 下の方法を試す */ }
    try {                                                 // 古い端末・http の場合
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  async function onCopy() {
    const text = Fmt.report(state.project, lastResult || Calc.compute(state.inputs), new Date());
    const ok = await copyText(text);
    if (ok) toast('試算結果をコピーしました');            // 成功したときだけ完了を出す
    else toast('コピーできませんでした。もう一度お試しください', true);
  }

  // ===== 6. オフライン（Service Worker） =====
  function registerServiceWorker() {
    const h = location.hostname;
    // PC 内の素の住所（localhost / 127.0.0.1）では登録しない。同じ番号を使う別のアプリを横取りしないため。
    // 手元での確認は roi-simulator.localhost のように専用の名前で開く（README 参照）。
    if (!('serviceWorker' in navigator) || h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;           // 初回のインストールでは読み直さない
      reloading = true;
      location.reload();                                 // 新しい版に切り替わったら 1 回だけ読み直す（入力は保存済み）
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      }).catch(() => { /* 登録できなくても計算は動く */ });
    });
  }

  // ===== 7. 起動 =====
  buildFields();
  buildCards();
  buildChart();
  Object.values(refs).forEach(bindField);
  fillInputs();
  $('project').addEventListener('input', e => { state.project = e.target.value; Store.save(state); });
  $('reset').addEventListener('click', onReset);
  $('copy').addEventListener('click', onCopy);
  $('version').textContent = 'v' + APP_VERSION;
  render();
  registerServiceWorker();

  // 将来の拡張・試験用の窓口（計算は RoiCalc、表示は RoiFormat）
  window.RoiApp = { APP_VERSION, STORAGE_KEY, Store, state, render, sliderMax };
})();
