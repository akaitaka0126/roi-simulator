/* 実ブラウザでの機能試験（Chrome をヘッドレスで起動し、DevTools Protocol で操作する）
 * 実行: node tests/e2e.test.js
 * 必要: Node 22 以上（WebSocket が標準）・Google Chrome。外部ライブラリは使わない。
 * 試験用のサーバーは 127.0.0.1:8958（tools/serve.py の 8957 とは別）、ブラウザは roi-simulator.localhost で開く。
 * 画面写真は docs/screenshots/ に保存する。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8958;
const DEBUG_PORT = 9339;
const APP = `http://roi-simulator.localhost:${PORT}/`;
const BARE = `http://127.0.0.1:${PORT}/`;
const PROFILE = path.join(ROOT, '.test-profile');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean).find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** 今の版（js/app.js の APP_VERSION） */
const VER = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];

// ---------- 試験用の配信（更新試験のときだけ版を差し替える） ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let nextVersion = null;
let server = null;
function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      let body = fs.readFileSync(file);
      if (nextVersion && (p === '/sw.js' || p === '/js/app.js')) body = Buffer.from(body.toString().split(`'${VER}'`).join(`'${nextVersion}'`));
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });
}
function stopServer() {
  return new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); });
}

// ---------- Chrome と DevTools Protocol ----------
let chrome = null;
async function startChrome() {
  fs.mkdirSync(PROFILE, { recursive: true });
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=390,844', 'about:blank'],
  { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json(); return; } catch (e) { await sleep(250); }
  }
  throw new Error('Chrome が起動しない');
}
function stopChrome() {
  if (!chrome) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
  else chrome.kill('SIGKILL');
  chrome = null;
}

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.wait = new Map(); this.handlers = []; }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = e => reject(e);
      this.ws.onmessage = m => {
        const msg = JSON.parse(m.data);
        if (msg.id && this.wait.has(msg.id)) {
          const { res, rej } = this.wait.get(msg.id); this.wait.delete(msg.id);
          msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
        } else if (msg.method) this.handlers.forEach(h => h(msg));
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.wait.set(id, { res, rej }));
  }
  on(fn) { this.handlers.push(fn); }
  once(method, timeout = 15000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('待ちきれない: ' + method)), timeout);
      const h = msg => { if (msg.method === method) { clearTimeout(t); this.handlers = this.handlers.filter(x => x !== h); res(msg.params); } };
      this.on(h);
    });
  }
  close() { try { this.ws.close(); } catch (e) { /* 何もしない */ } }
}

let cdp = null;
const pageErrors = [];
let dialogAccept = true;
async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  cdp.on(msg => {
    if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') pageErrors.push(msg.params.args.map(a => a.value || a.description).join(' '));
    if (msg.method === 'Page.javascriptDialogOpening') cdp.send('Page.handleJavaScriptDialog', { accept: dialogAccept });
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
}
async function ev(expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('ページ内エラー: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function go(url) {
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await loaded;
  await sleep(150);
}
async function reload() {
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.reload', { ignoreCache: false });
  await loaded;
  await sleep(150);
}
/** 実際のキー入力に近い形で欄に打ち込む（全選択して置き換え） */
async function typeInto(key, text) {
  await ev(`document.getElementById('in-${key}').focus()`);
  await sleep(30);
  await ev(`document.getElementById('in-${key}').select()`);
  await cdp.send('Input.insertText', { text });
  await sleep(20);
}
async function blur() { await ev('document.activeElement && document.activeElement.blur()'); await sleep(20); }
async function setAll(values) {
  for (const [k, v] of Object.entries(values)) await typeInto(k, String(v));
  await blur();
}
const DEFAULTS = { casesPerMonth: 1500, minutesSaved: 10, hourlyCost: 5000, initialCost: 500, annualCost: 100 };
async function snapshot() {
  return ev(`(() => {
    const cards = {};
    document.querySelectorAll('.card').forEach(c => { cards[c.dataset.key] = {
      text: c.querySelector('.card-num').textContent, unit: c.querySelector('.card-unit').hidden ? '' : c.querySelector('.card-unit').textContent,
      tone: c.dataset.tone || '', color: getComputedStyle(c.querySelector('.card-num')).color }; });
    const fields = {};
    document.querySelectorAll('.field').forEach(f => { const r = f.querySelector('.range'); fields[f.dataset.key] = {
      text: f.querySelector('input[type=text]').value, range: r.value, max: r.max,
      maxLabel: f.querySelector('.range-max').textContent, err: f.querySelector('.field-error').hidden ? '' : f.querySelector('.field-error').textContent }; });
    const bars = {};
    document.querySelectorAll('.bar').forEach(b => { bars[b.dataset.key] = { width: b.querySelector('.bar-fill').style.width, value: b.querySelector('.v').textContent }; });
    return { cards, fields, bars, project: document.getElementById('project').value, version: document.getElementById('version').textContent,
             body: document.body.innerText };
  })()`);
}
const cardTexts = s => ['hours', 'benefit', 'net', 'payback'].map(k => s.cards[k].text);

// ---------- 試験の記録 ----------
const results = [];
async function test(name, fn) {
  const before = pageErrors.length;
  try {
    const detail = await fn();
    if (pageErrors.length > before) throw new Error('ページでエラー: ' + pageErrors.slice(before).join(' / '));
    results.push({ name, ok: true, detail: detail || '' });
    console.log('PASS', name, detail ? '— ' + detail : '');
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.log('FAIL', name, '—', e.message);
  }
}
function eq(a, b, what) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: 期待 ${JSON.stringify(b)} / 実際 ${JSON.stringify(a)}`); }
function ok(c, what) { if (!c) throw new Error(what); }
const noBadText = s => ok(!/NaN|Infinity|undefined/.test(s.body), '画面に NaN / Infinity / undefined が出ている');

/** 実際の画面の大きさで撮る（背景は画面に固定なので、全体を 1 枚にすると実物と違って見える）。scrollTo は要素 ID */
async function shot(name, width, height, mobile, scrollTo) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await ev(scrollTo ? `document.getElementById('${scrollTo}').scrollIntoView({ block: 'start' })` : 'window.scrollTo(0, 0)');
  await sleep(250);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(data, 'base64'));
  return ev('({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })');
}

// ---------- 本体 ----------
(async () => {
  if (!CHROME) { console.log('Chrome が見つかりません（CHROME_PATH で指定できます）'); process.exit(2); }
  await startServer();
  await startChrome();
  await connect();
  for (const origin of [APP.slice(0, -1), BARE.slice(0, -1)]) {
    await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  await test('基準テスト（初期条件）', async () => {
    await go(APP);
    const s = await snapshot();
    eq(cardTexts(s), ['3,000', '1,500', '1,400', '0.36'], '4 つの結果');
    eq([s.cards.hours.unit, s.cards.benefit.unit, s.cards.net.unit, s.cards.payback.unit], ['時間', '万円', '万円', '年'], '単位');
    eq(s.cards.net.tone, 'pos', '年間効果の色区分');
    eq(s.cards.net.color, 'rgb(15, 122, 82)', '年間効果の色（緑）');
    eq(Object.values(s.bars).map(b => b.value), ['1,500', '500', '100'], 'グラフの値');
    return cardTexts(s).join(' / ');
  });

  await test('オフライン準備（Service Worker の登録とキャッシュ）', async () => {
    await ev('navigator.serviceWorker.ready.then(() => true)');
    await reload();
    const info = await ev(`(async () => ({ controlled: !!navigator.serviceWorker.controller, keys: await caches.keys(),
      n: (await (await caches.open('roi-simulator-${VER}')).keys()).length }))()`);
    ok(info.controlled, 'Service Worker が画面を制御していない');
    eq(info.keys, [`roi-simulator-${VER}`], 'キャッシュ名');
    eq(info.n, 13, 'キャッシュしたファイル数');
    return `キャッシュ ${info.n} ファイル`;
  });

  await test('スライダー → 数値欄（指で動かす操作）', async () => {
    const r = await ev(`(() => { const b = document.getElementById('rg-casesPerMonth').getBoundingClientRect();
      window.scrollTo(0, window.scrollY + b.top - 200); const c = document.getElementById('rg-casesPerMonth').getBoundingClientRect();
      return { x: c.left, y: c.top + c.height / 2, w: c.width }; })()`);
    const target = r.x + 15 + (r.w - 30) * 0.3;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x + 15 + (r.w - 30) * 0.15, y: r.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target, y: r.y, button: 'left', buttons: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target, y: r.y, button: 'left', clickCount: 1 });
    await sleep(50);
    const s = await snapshot();
    const v = Number(s.fields.casesPerMonth.range);
    ok(v > 2000 && v < 4000, 'つまみの位置が想定外: ' + v);
    eq(s.fields.casesPerMonth.text, v.toLocaleString('ja-JP'), '数値欄');
    eq(s.cards.hours.text, (v * 12 * 10 / 60).toLocaleString('ja-JP'), '年間削減工数');
    return `つまみ ${v} 件 → 欄 ${s.fields.casesPerMonth.text} / 工数 ${s.cards.hours.text} 時間`;
  });

  await test('数値欄 → スライダー（全 5 項目）', async () => {
    const vals = { casesPerMonth: 2000, minutesSaved: 15, hourlyCost: 4000, initialCost: 800, annualCost: 50 };
    await setAll(vals);
    const s = await snapshot();
    for (const [k, v] of Object.entries(vals)) eq(Number(s.fields[k].range), v, k + ' のスライダー');
    eq(cardTexts(s), ['6,000', '2,400', '2,350', '0.34'], '結果');
    return '5 項目とも一致・結果も即時更新';
  });

  await test('スライダー上限を超える直接入力・刻み幅に丸めない', async () => {
    await setAll({ casesPerMonth: 12345, minutesSaved: 75, hourlyCost: 25050, initialCost: 3333, annualCost: 1234.5 });
    const s = await snapshot();
    eq(s.fields.casesPerMonth.text, '12,345', '件数の欄（10 刻みに丸めない）');
    eq(s.fields.annualCost.text, '1,234.5', '保守費の欄（小数も丸めない）');
    eq([s.fields.casesPerMonth.max, s.fields.minutesSaved.max, s.fields.hourlyCost.max, s.fields.initialCost.max, s.fields.annualCost.max],
       ['15000', '80', '30000', '4000', '1500'], '広がったスライダーの上限');
    eq(s.fields.casesPerMonth.maxLabel, '15,000', '上限の表示');
    eq(s.cards.hours.text, '185,175', '年間削減工数（12,345×12×75÷60）');
    noBadText(s);
    await setAll({ casesPerMonth: 1500 });
    eq((await snapshot()).fields.casesPerMonth.max, '10000', '戻したら上限も元に戻る');
    return '上限 10,000 → 15,000 に拡張・元の値に戻すと上限も戻る';
  });

  await test('0 入力でエラーにならない', async () => {
    await setAll({ casesPerMonth: 0, minutesSaved: 0, hourlyCost: 0, initialCost: 0, annualCost: 0 });
    const s = await snapshot();
    eq(cardTexts(s), ['0', '0', '0', '回収不可'], '結果');
    eq(Object.values(s.bars).map(b => parseFloat(b.width)), [0, 0, 0], 'グラフの長さ');
    noBadText(s);
    await typeInto('casesPerMonth', '');
    await blur();
    eq((await snapshot()).fields.casesPerMonth.text, '0', '空欄は離れると 0');
    return '全項目 0・空欄でも表示は正常';
  });

  await test('年間純効果が負 → 回収不可（赤）', async () => {
    await setAll(Object.assign({}, DEFAULTS, { annualCost: 2000 }));
    const s = await snapshot();
    eq([s.cards.net.text, s.cards.net.tone, s.cards.net.color], ['-500', 'neg', 'rgb(196, 33, 33)'], '年間効果');
    eq([s.cards.payback.text, s.cards.payback.tone, s.cards.payback.unit], ['回収不可', 'neg', ''], '回収期間');
    return '年間効果 -500 万円（赤）・回収不可（赤）';
  });

  await test('年間純効果が 0 → 回収不可', async () => {
    await setAll({ casesPerMonth: 1000, minutesSaved: 6, hourlyCost: 1000, initialCost: 500, annualCost: 120 });
    const s = await snapshot();
    eq([s.cards.net.text, s.cards.net.color], ['0', 'rgb(15, 34, 54)'], '年間効果（通常色）');
    eq(s.cards.payback.text, '回収不可', '回収期間');
    return '年間効果 0 万円（通常色）・回収不可';
  });

  await test('初期費用 0・純効果が正 → 初期投資なし', async () => {
    await setAll(Object.assign({}, DEFAULTS, { initialCost: 0 }));
    eq((await snapshot()).cards.payback.text, '初期投資なし', '回収期間');
  });

  await test('不正入力を受け付けない', async () => {
    const cases = [['-5', '5'], ['abc', ''], ['1e5', '15'], ['Infinity', ''], ['１２３', '123'], ['1.2.3', '1.23']];
    const seen = [];
    for (const [input, expect] of cases) {
      await typeInto('minutesSaved', input);
      const s = await snapshot();
      eq(s.fields.minutesSaved.text, expect, `「${input}」の欄`);
      noBadText(s);
      seen.push(`${input}→${expect === '' ? '空' : expect}`);
    }
    await typeInto('minutesSaved', '10');
    await typeInto('minutesSaved', '9999999999999');
    const s = await snapshot();
    eq(s.fields.minutesSaved.text, '10', '1 兆を超える値は入らない');
    ok(s.fields.minutesSaved.err.includes('1 兆'), 'メッセージが出ない');
    await blur();
    return seen.join('、') + '、13 桁→拒否';
  });

  await test('リセット（確認ダイアログ）', async () => {
    await ev(`(() => { const p = document.getElementById('project'); p.value = 'リセット確認'; p.dispatchEvent(new Event('input')); })()`);
    await setAll({ casesPerMonth: 777, initialCost: 0 });
    dialogAccept = false;
    await ev(`document.getElementById('reset').click()`);
    await sleep(100);
    eq((await snapshot()).fields.casesPerMonth.text, '777', 'キャンセル時は変わらない');
    dialogAccept = true;
    await ev(`document.getElementById('reset').click()`);
    await sleep(100);
    const s = await snapshot();
    eq(Object.keys(DEFAULTS).map(k => s.fields[k].text), ['1,500', '10', '5,000', '500', '100'], '初期値');
    eq(cardTexts(s), ['3,000', '1,500', '1,400', '0.36'], '結果');
    eq(s.project, 'リセット確認', '案件名は残る');
    return 'キャンセル→変化なし／OK→初期値';
  });

  await test('試算結果のコピー（画面と一致）', async () => {
    await cdp.send('Browser.grantPermissions', { origin: APP.slice(0, -1), permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await ev(`(() => { const p = document.getElementById('project'); p.value = '在庫管理システム'; p.dispatchEvent(new Event('input')); })()`);
    await setAll({ casesPerMonth: 2400, minutesSaved: 7.5 });
    await ev(`document.getElementById('copy').click()`);
    await sleep(300);
    const s = await snapshot();
    const toast = await ev(`(() => { const t = document.getElementById('toast'); return t.hidden ? '' : t.textContent; })()`);
    eq(toast, '試算結果をコピーしました', '完了メッセージ');
    const clip = await ev('navigator.clipboard.readText()');
    const need = ['案件名：在庫管理システム',
      ...[['casesPerMonth', '月間対象件数', '件'], ['minutesSaved', '1件あたりの純削減時間', '分'], ['hourlyCost', '時間あたり人件費', '円'],
          ['initialCost', '初期開発・導入費', '万円'], ['annualCost', '年間運用・保守費', '万円']].map(([k, l, u]) => `・${l}：${s.fields[k].text} ${u}`),
      `・年間削減工数：${s.cards.hours.text} 時間`, `・年間人件費換算効果：${s.cards.benefit.text} 万円`,
      `・保守費控除後の年間効果：${s.cards.net.text} 万円`, `・単純投資回収期間：${s.cards.payback.text} 年`];
    need.forEach(line => ok(clip.includes(line), 'コピーに無い: ' + line));
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, 'copied-text.txt'), clip, 'utf8');
    return `${need.length} 行が画面と一致（docs/screenshots/copied-text.txt）`;
  });

  async function restartAndCompare(how) {
    const before = await snapshot();
    if (how === 'close') {                                   // 普通に閉じる
      const exited = new Promise(r => chrome.once('exit', r));
      await cdp.send('Browser.close').catch(() => {});
      await Promise.race([exited, sleep(8000)]);
      cdp.close(); stopChrome();
    } else {                                                 // 強制終了（保存の書き出しを待ってから）
      await sleep(6000);
      cdp.close(); stopChrome(); await sleep(800);
    }
    await startChrome(); await connect();
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await go(APP);
    const s = await snapshot();
    eq(Object.keys(DEFAULTS).map(k => s.fields[k].text), Object.keys(DEFAULTS).map(k => before.fields[k].text), '入力値');
    eq(s.project, before.project, '案件名');
    eq(cardTexts(s), cardTexts(before), '結果');
  }

  await test('再起動後も入力値を保持（ブラウザを普通に閉じて起動し直す）', async () => {
    await restartAndCompare('close');
    return '5 項目・案件名・結果が終了前と一致';
  });

  await test('再起動後も入力値を保持（強制終了・入力の 6 秒後）', async () => {
    await setAll({ hourlyCost: 4200 });
    await restartAndCompare('kill');
    return '強制終了でも、入力から数秒たっていれば保持';
  });

  await test('保存データが壊れていても初期値で起動', async () => {
    await ev(`localStorage.setItem('roi-simulator.state', '{壊れたデータ')`);
    await reload();
    let s = await snapshot();
    eq(cardTexts(s), ['3,000', '1,500', '1,400', '0.36'], '壊れた JSON → 初期値');
    await ev(`localStorage.setItem('roi-simulator.state', JSON.stringify({ v: 1, project: 7, inputs: { casesPerMonth: -5, minutesSaved: 'x', hourlyCost: 6000, initialCost: null, annualCost: 1e99 } }))`);
    await reload();
    s = await snapshot();
    eq(Object.keys(DEFAULTS).map(k => s.fields[k].text), ['1,500', '10', '6,000', '500', '100'], '不正な項目だけ初期値');
    eq(s.project, '', '案件名（文字列でない）');
    noBadText(s);
    await setAll(DEFAULTS);
    return '壊れた JSON・不正な値の両方で安全に初期値';
  });

  await test('オフラインで計算できる（配信サーバーを止めて開き直す）', async () => {
    await stopServer();
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await reload();
    await setAll({ casesPerMonth: 3000 });
    const s = await snapshot();
    eq(cardTexts(s), ['6,000', '3,000', '2,900', '0.17'], 'オフラインでの結果');
    const bg = await ev(`new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = './img/okinawa-sea.webp?x=1'; })`);
    ok(bg, '背景画像がオフラインで出ない');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await startServer();
    await setAll(DEFAULTS);
    return 'サーバー停止・通信遮断でも表示・計算・背景とも正常';
  });

  await test('アプリ更新後に新しい版になり、古いキャッシュが消える', async () => {
    await ev(`caches.open('tire-pressure-v3').then(() => true)`);        // 同じ住所の他アプリのキャッシュ（消えてはいけない）
    nextVersion = VER + '-next';
    await reload();                                                      // 古い版で開く → 裏で新しい版を検出 → 自動で 1 回読み直す
    let s;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try { s = await snapshot(); if (s.version === 'v' + nextVersion) break; } catch (e) { /* 読み直し中 */ }
    }
    eq(s.version, 'v' + nextVersion, '表示中の版');
    const keys = await ev('caches.keys()');
    eq(keys.slice().sort(), [`roi-simulator-${nextVersion}`, 'tire-pressure-v3'], 'キャッシュ（古い版だけ消える）');
    eq(cardTexts(s), ['3,000', '1,500', '1,400', '0.36'], '更新後の計算');
    nextVersion = null;                                                  // 元の版に戻す（以降の試験と画面写真のため）
    await reload();
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try { s = await snapshot(); if (s.version === 'v' + VER) break; } catch (e) { /* 読み直し中 */ }
    }
    eq(s.version, 'v' + VER, '元の版に戻る');
    await ev(`caches.delete('tire-pressure-v3')`);
    return `開き直し 1 回で v${VER} → v${VER}-next（→ v${VER} に戻す）・他アプリのキャッシュは残る`;
  });

  await test('素の 127.0.0.1 では Service Worker を登録しない（他アプリと競合しない）', async () => {
    await go(BARE);
    await sleep(1200);
    const r = await ev(`(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, keys: await caches.keys(),
      hours: document.querySelector('.card[data-key=hours] .card-num').textContent }))()`);
    eq([r.regs, r.keys.length], [0, 0], '登録・キャッシュ');
    eq(r.hours, '3,000', '計算は動く');
    await go(APP);
    return '登録 0・キャッシュ 0（計算は動く）';
  });

  await test('表示崩れ・横スクロールなし（320px 幅・最大桁）', async () => {
    await setAll({ casesPerMonth: 999999999999, minutesSaved: 999999999999, hourlyCost: 999999999999, initialCost: 999999999999, annualCost: 999999999999 });
    const m = await shot('phone-320-max-digits', 320, 640, true, 'h-results');
    ok(m.sw <= m.iw, `横スクロールが出る（${m.sw} > ${m.iw}）`);
    const over = await ev(`[...document.querySelectorAll('.card, .bar, .field, .panel')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className)`);
    eq(over, [], 'はみ出している部品');
    noBadText(await snapshot());
    await setAll(DEFAULTS);
    return `ページ幅 ${m.sw}px ≤ 画面 ${m.iw}px`;
  });

  await test('画面写真（スマホ縦・iPad・PC）', async () => {
    await ev(`(() => { const p = document.getElementById('project'); p.value = '在庫管理システム'; p.dispatchEvent(new Event('input')); window.scrollTo(0, 0); })()`);
    const out = [];
    for (const [name, w, h, mobile, to] of [['phone-390-top', 390, 844, true], ['phone-390-results', 390, 844, true, 'h-results'],
      ['tablet-820', 820, 1180, true], ['pc-1280', 1280, 800, false]]) {
      const m = await shot(name, w, h, mobile, to);
      ok(m.sw <= m.iw, `${name} で横スクロール`);
      out.push(`${name}: ${m.sw}≤${m.iw}`);
    }
    return out.join(' / ');
  });

  cdp.close(); stopChrome(); await stopServer();
  const failed = results.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(ROOT, 'docs', 'e2e-result.json'), JSON.stringify({ date: new Date().toISOString(), chrome: CHROME, results }, null, 2));
  console.log(`\n${results.length - failed} / ${results.length} PASS`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('試験が止まりました:', e); try { stopChrome(); } catch (_) { /* 何もしない */ } process.exit(1); });
