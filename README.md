# ROI Simulator（投資対効果シミュレーター）

業務効率化・システム導入・自動化の投資対効果を、スマートフォンでその場で試算する PWA（ホーム画面に追加して使える Web アプリ）です。
条件を動かすと、年間削減工数・人件費換算効果・保守費控除後の年間効果・投資回収期間がすぐ変わります。

- 計算はすべて端末の中で行い、入力内容を外部へ送りません（ログイン・外部 API・データベースなし）。
- 一度開けば、オフラインでも使えます。
- 対応: iPhone / Android / iPad / PC（スマートフォン縦画面を優先）。
- **公開 URL: https://akaitaka0126.github.io/roi-simulator/** （GitHub `akaitaka0126/roi-simulator`・2026-11-27 公開）

---

## 1. 他のアプリと競合しないための作り

| 競合しうるもの | この作りでの扱い |
|---|---|
| 置き場所 | `Desktop\roi-simulator\` の独立したフォルダ。他のプロジェクトのファイルは読みも書きもしない |
| 手元で動かすときの番号（ポート） | 8957（収支アプリの 8765 などと別）。**使用中なら二重に待ち受けず止まる** |
| 手元で開く住所 | `roi-simulator.localhost` という専用の名前。保存データとキャッシュが他のアプリと混ざらない |
| 素の `localhost` / `127.0.0.1` | Service Worker を登録しない（同じ番号の別アプリの画面を横取りしない） |
| 公開先の住所 | GitHub Pages なら `…github.io/roi-simulator/`。空気圧アプリ（`/tire-pressure-pwa/`）と別の範囲 |
| オフライン用キャッシュ | 名前は `roi-simulator-<版>`。更新時に消すのは自分の古い版だけ |
| 端末内の保存 | localStorage の `roi-simulator.state` だけを使う |

> 同じ github.io の住所に置く空気圧アプリも、更新時に自分のキャッシュだけを消す形に直しています（`tire-pressure-pwa/sw.js`。まだ公開していません）。

## 2. ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 画面の骨組み（タイトル → 案件名 → 入力 5 項目 → 結果カード → グラフ → リセット・コピー → 注意事項） |
| `css/app.css` | 見た目（沖縄の海の写真の背景・白いパネル・大きいスライダー） |
| `js/calc.js` | **計算ロジック**（画面に依存しない。Node からも使える） |
| `js/format.js` | **表示用の丸めと文字の整形**（画面とコピー文が同じ関数を使う） |
| `js/app.js` | 画面の動き（入力の同期・表示・保存・リセット・コピー・Service Worker の登録） |
| `sw.js` | Service Worker（オフライン対応・版ごとのキャッシュ） |
| `manifest.webmanifest` | アプリ名・アイコン・全画面表示の設定 |
| `img/okinawa-sea.webp` | 背景（沖縄の海の写真・人物なし。Koji 提供の写真を 1333×2000・約 240KB の WebP にしたもの） |
| `icons/` | アプリアイコン（192 / 512 / maskable 512 / iOS 用 180 / favicon 32） |
| `tools/serve.py` | 手元で動かす確認用サーバー（Python 標準ライブラリのみ） |
| `tools/make_icons.py` | アイコンを作り直すスクリプト（Pillow が必要） |
| `tests/unit.test.js` | 計算の単体試験（Node） |
| `tests/e2e.test.js` | 実ブラウザ（Chrome）での機能試験 |
| `docs/TEST_RESULTS.md` | 試験項目と結果 |
| `docs/screenshots/` | 試験で撮った画面写真とコピー文の実物 |

公開に必要なのは `index.html` `manifest.webmanifest` `sw.js` `css/` `js/` `img/` `icons/` だけです。

## 3. 使用技術・依存関係

| 区分 | 内容 |
|---|---|
| アプリ本体 | HTML / CSS / JavaScript・Web App Manifest・Service Worker・localStorage |
| 外部ライブラリ | **なし**（フレームワーク・CDN・Web フォントも使わない） |
| 文字 | 端末の標準フォント（Windows: BIZ UDPゴシック／iPhone: ヒラギノ角ゴ／Android: Noto Sans） |
| 開発時だけ使うもの | Node.js 22 以上（試験）・Google Chrome（実ブラウザ試験）・Python 3（手元サーバー）・Pillow（アイコンを作り直すときだけ） |

---

## 4. 手元の PC で動かす

このフォルダで次を実行し、表示された住所を **Chrome か Edge** で開きます。

```powershell
python tools/serve.py
```

開く住所: http://roi-simulator.localhost:8957/

- 番号が使用中なら「別のソフトが使っています」と出て止まります。`python tools/serve.py 8960` のように番号を変えてください。
- `http://127.0.0.1:8957/` でも開けますが、その場合はオフライン機能（Service Worker）が働きません（他のアプリと混ざらないための仕様）。
- 終わるときは黒い画面で Ctrl+C を押すか、画面を閉じます。

## 5. HTTPS 環境へ配備する（GitHub Pages の例）

> **本番公開は Koji の承認を得てから行います。** 以下は手順です。

1. GitHub で新しいリポジトリ `roi-simulator` を **Public** で作る
2. このフォルダの中身を入れる（`git` を使う場合）:
   ```powershell
   git init
   ```
   ```powershell
   git add .
   ```
   ```powershell
   git commit -m "ROI Simulator 1.0.0"
   ```
   ```powershell
   git remote add origin https://github.com/akaitaka0126/roi-simulator.git
   ```
   ```powershell
   git push -u origin main
   ```
   （`.test-profile/` は `.gitignore` で除外済み。ブラウザでのアップロードでも可）
3. リポジトリの **Settings → Pages** で Source を **Deploy from a branch**、Branch を **main / (root)** にして **Save**
4. 1〜2 分後に `https://akaitaka0126.github.io/roi-simulator/` で開けます（HTTPS は自動）

Netlify・Cloudflare Pages など他の静的ホスティングでも、フォルダをそのまま置けば動きます（相対パスで作っています）。

## 6. スマートフォンのホーム画面に追加する

**iPhone / iPad（Safari）**
1. Safari で公開 URL を開く
2. 下の共有ボタン（四角から矢印）→ **ホーム画面に追加** → **追加**

**Android（Chrome）**
1. Chrome で公開 URL を開く
2. 右上の **⋮** → **ホーム画面に追加**（または **アプリをインストール**）→ **インストール**

**PC（Chrome / Edge）**
- アドレス欄の右にあるインストールのアイコン → **インストール**

追加したら一度オンラインで開いてください。その後は機内モードでも使えます。

## 7. 更新するとき

1. `js/app.js` の `APP_VERSION` と `sw.js` の `VERSION` を**同じ値で**上げる（例: `1.0.0` → `1.0.1`）
   ※そろっていないと単体試験が失敗します
2. 試験を流す（下の 8）
3. 公開先へ反映する
4. 利用者側: アプリを開くと裏で新しい版を取り込み、**自動で 1 回読み直して新しい版になります**。入力値は保持されます。古い版のキャッシュは自動で消えます。
   GitHub Pages は配信に約 10 分のキャッシュがあるため、反映直後は少し待ってから開いてください。

## 8. 試験を流す

```powershell
node tests/unit.test.js
```

```powershell
node tests/e2e.test.js
```

- `e2e.test.js` は Chrome を画面なしで起動し、127.0.0.1:8958 の試験用サーバーで実際に操作します（手元サーバーの 8957 とは別）。
- 結果は画面と `docs/e2e-result.json`、画面写真は `docs/screenshots/` に出ます。項目と結果の一覧は `docs/TEST_RESULTS.md`。
- 試験用のブラウザ設定が `.test-profile/` に残ります。不要なら消してかまいません。

---

## 9. 計算式

| 記号 | 項目 | 単位 |
|---|---|---|
| N | 月間対象件数 | 件 |
| T | 1件あたりの純削減時間 | 分 |
| R | 時間あたり人件費 | 円 |
| C | 初期開発・導入費 | 万円 |
| M | 年間運用・保守費 | 万円 |

- 年間削減工数（時間）＝ N × 12 × T ÷ 60
- 年間人件費換算効果（円）＝ 年間削減工数 × R
- 年間純効果（円）＝ 年間人件費換算効果 − M × 10,000
- 投資回収期間（年）＝ C × 10,000 ÷ 年間純効果
  - 年間純効果が 0 以下 →「回収不可」
  - 年間純効果が正で C = 0 →「初期投資なし」

途中では丸めません。丸めは表示だけ（工数・金額は整数、回収期間は小数 2 桁）。

**表示の決まり（指示書に無い細部の判断）**
- 保守費控除後の年間効果の色は、**表示した値**で決めます（例: −3,000 円は「0 万円」と表示し、通常色）。回収期間は丸める前の値で判定します。
- 入力の上限は 1 兆です（桁あふれや Infinity を防ぐため）。
- 欄を空にした間は 0 として計算し、欄を離れると「0」と表示します。
- リセットで戻すのは 5 項目です。**案件名は残します**（確認ダイアログにも書いています）。

## 10. 将来の拡張の置き場所

| 拡張 | 置き場所 |
|---|---|
| 入力項目の追加 | `js/calc.js` の `FIELDS` に 1 行足す（画面の入力欄・スライダー・コピー文は自動で増える） |
| 年間稼働月数の変更 | `compute(inputs, { monthsPerYear })` で既に変えられる（画面の欄を足すだけ） |
| 3 年・5 年の累積効果、損益分岐点グラフ | `compute()` の戻り値（すべて丸めなしの円）から計算し、`js/format.js` に表示関数を足す |
| 複数案件の保存・比較 | 保存は `js/app.js` の `Store`。形を変えるときは `SCHEMA` を 2 に上げ、`load()` に 1 → 2 の変換を書く |
| CSV・PDF 出力 | コピー文と同じく `Fmt.report()` を基にする |
| 英語・多通貨 | 文言は `FIELDS` と `format.js` に集めてある |

## 11. 注意点

- データは端末の中だけにあり、ブラウザのサイトデータ削除や機種変更で消えます。
- iPhone は Safari から「ホーム画面に追加」してください（他のブラウザでは動きが変わることがあります）。
