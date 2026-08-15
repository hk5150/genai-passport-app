# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

生成AIパスポート試験(GUGA主催)対策のクイズPWA。公式テキスト全5章に沿ったオリジナル4択問題+解説を500問収録(各章100問)。ビルドステップなしの素のHTML/CSS/JSで動作する(現状Vite等は未導入)。

- 公開URL: https://hk5150.github.io/genai-passport-app/
- リポジトリ: https://github.com/hk5150/genai-passport-app (public, GitHub Pages配信、`main`ブランチのルートをそのまま配信)

## Commands

```bash
npx serve .                  # ローカルプレビュー(.claude/launch.json もこれを5173番ポートで使用)
# または
python3 -m http.server 8080
```

`index.html` を `file://` で直接開くと `fetch('./questions.json')` がCORSでブロックされる。必ず上記のような簡易サーバー経由で確認すること。ビルド・テスト・lintコマンドは存在しない。

## Release checklist (毎回のgit push前に必須)

静的ファイル(`app.js`/`index.html`/`styles.css`/`manifest.json`)を1文字でも変更したら、以下2つを必ず両方更新する。どちらか片方だけ上げると不整合が起きる:

1. `app.js` 冒頭の `APP_VERSION` 定数(例: `v1.5.0`)— ホーム画面のバッジに表示される。セマンティックバージョニング目安: 問題追加・軽微修正は patch、新機能追加は minor、大規模作り直しは major。
2. `sw.js` の `CACHE_NAME`(例: `genai-passport-v2`)— Service Workerがcache-first戦略のため、上げないとユーザー端末に古い`app.js`が残り続け、バージョン表示自体も更新されない。過去に実際にこれが原因で修正が反映されないバグが発生した。

`questions.json` はnetwork-first配信なのでこの問題は起きないが、それ以外の静的アセットは常に注意。

## Architecture

3画面(ホーム/クイズ/結果)のSPA。`app.js` 内で状態を持ち、`screen(id)` が `.screen.active` クラスをトグルするだけの単純な切り替え。

### 状態管理の中心 (`app.js`)
- `QUESTIONS`: `questions.json` をfetchした問題配列
- `session`: 受験中の状態 `{mode, chapterOrNull, order:[idx...], pos, answers, startedAt}`
- `store`: `localStorage`(キー `genai_passport_store_v1`)に永続化する受験履歴+誤答カウント+中断状態
  - `store.history`: 受験ごとの `{date, mode, total, correct, pct, chapterOrNull}`
  - `store.wrong`: 問題キー→誤答回数。正解すると1減算、0で復習キューから外れる
  - `store.inProgress[sessionKey]`: 模擬試験・分野別演習の中断→再開用データ `{order, answers, startedAt, qCount}`(`sessionKey` は `'mock'` または `'chapter-{章番号}'`)。復習モードは対象外(誤答キューが毎回変わるため)。`qCount` が現在の `QUESTIONS.length` と食い違えば無効化して最初から始める。
- 問題キーは `qKey(q) = q.id || (q.ch + "|" + q.q.slice(0,12))`。現行データは全問 `id` を持つのでハッシュ式フォールバックは実質未使用。

### 主要関数 (`app.js`)
`loadStore`/`saveStore`/`saveInProgress`/`getResumableProgress` — 永続化まわり
`startSession(mode, chapterOrNull)` — 出題開始・再開判定
`renderQuestion` / `answerQuestion(idx, chosenIdx)` — 出題・採点(`chosenIdx=null` で「わからない」を表現。不正解扱いだが誤答ハイライトはしない)
`startTimer`/`updateTimer`/`fmtTime` — タイマー(模擬試験は`MOCK_TIME_LIMIT_MS`=60分からのカウントダウン、それ以外はストップウォッチ)
`finishSession` — 完走処理、該当`inProgress`キーの削除

### 出題ロジック
- 模擬試験・復習: 毎回 `shuffle()` でシャッフル
- 分野別演習: シャッフルせず `questions.json` の並び順で出題(ユーザー要望による仕様)
- 選択肢の順序: どのモードでも常にシャッフル

### データモデル (`questions.json`)
```json
{
  "id": "ch1-001",     // "ch{章番号}-{章内連番3桁}"。新規追加時はその章の最大連番+1から採番
  "ch": 1,              // 章番号 1〜5
  "sec": "AIの定義",     // 章内セクション名(自由文字列)
  "q": "問題文",
  "c": ["選択肢1","選択肢2","選択肢3","選択肢4"],
  "a": 0,                // 正解インデックス(0始まり)
  "e": "解説文"
}
```

章番号マッピング(公式テキスト目次に対応。日本語表示名は `app.js` 冒頭の `CHAPTERS` オブジェクトで管理 — 章を増減・改名する場合は両方を合わせて更新):

| ch | 内容 |
|----|------|
| 1 | AI(人工知能)— 定義, 機械学習, AIの種類, 歴史, シンギュラリティ |
| 2 | 生成AI — 誕生の歴史(CNN/VAE/GAN/RNN/Transformer), ChatGPT, Gemini/Claude/Copilot |
| 3 | 現在の生成AIの動向 — マルチモーダル生成AI, ディープフェイク, RAG, AIエージェント/MCP |
| 4 | 情報リテラシー・基本理念とAI社会原則 — セキュリティ, 個人情報保護法, 知的財産権, AI社会原則, AI事業者ガイドライン, AI新法 |
| 5 | テキスト生成AIのプロンプト制作と実例 — LM/LLM, プロンプティング, ビジネス応用, 不得意なこと |

### PWA
`manifest.json` + `sw.js`。Service Workerはアプリシェル(html/css/js/manifest/icons)をcache-first、`questions.json`はnetwork-firstで配信。アイコンは仮デザイン(紺地にAIロゴ)。ネイティブアプリ化(Capacitor等)は未実施。

## Content policy (問題追加時は必ず遵守)

公式テキスト(GUGA発行『生成AIパスポート公式テキスト』2026年試験シラバス対応版)を参照して問題の精度を上げることはあるが、本文のOCR結果や文章をそのまま `questions.json` に転記することは一切禁止。概念・数値・固有名詞を理解した上で、問題文・選択肢・解説は必ず独自の表現で書き起こすこと(著作権侵害リスクの回避)。他社問題集(FujiCert等)も同様に内容転用禁止、分野バランスの参考に留める。

### 選択肢の作り方(問題追加・修正時は必ず遵守)

過去に「正解の選択肢だけが極端に長い」問題を大量に作ってしまい、**中身を知らなくても「最も長い選択肢を選ぶ」だけで正答率73.3%が取れる**状態になった(2026-08-15に発覚)。有料アプリとして致命的なので、以下を守る:

1. **4つの選択肢の文字数を揃える。最長が最短の1.5倍を超えないこと。** 正解だけ丁寧に説明して誤答を短く切り捨てるのが典型的な失敗パターン。正解を短くするか、誤答を同じ粒度まで書き足して揃える
2. **略語・用語を問う問題は4つとも同じ粒度で書く。** 正解にだけ `RNN(回帰型ニューラルネットワーク)` と正式名称を付け、誤答を `CNN` `GAN` `VAE` と略語のままにするのは即バレる。全部に付けるか、全部付けないかのどちらか
3. **正解インデックス `a` を 0〜3 に散らす。** 描画時に `renderQuestion` がシャッフルするため実害はないが、データとして健全に保つ
4. **誤答は「ありそうな誤解」にする。** 「〜が一切不要」「必ず〜になる」のような明らかな捨て選択肢ばかりにしない

追加・修正したら必ず検証すること:

```bash
python3 -c "
import json
d=json.load(open('questions.json'))
for th in (4,6):
    n=0
    for q in d:
        L=sorted((len(c) for c in q['c']), reverse=True)
        if len(q['c'][q['a']])==L[0] and L[0]-L[1]>=th: n+=1
    print(f'正解が2位より+{th}字以上長い問題: {n}/{len(d)}')
"
```

**判定基準: `+6字以上` が0件ならOK。** 単に「最長の選択肢が正解か」で測ると、1〜2字差でも該当してしまい実態より悪く出る(人間は1字差を目視で判別できない)。2位との差が何字かで見ること。用語そのものが長い場合(`シンボルグラウンディング問題`、`ノーフリーランチ定理` など)の4〜5字差は不可避なので許容する。

## Known limitations

- localStorage永続化のため、Claude.aiのartifactプレビュー内では正しく動作しない(artifactはlocalStorage非対応)。実運用確認は必ずデプロイ先(GitHub Pages)で行うこと。
- 4択の正解インデックス(0〜3)は2026-08-16に均等化済み(各125問)。問題を追加したら偏りが戻るので、上記「選択肢の作り方」の検証を都度行うこと。
