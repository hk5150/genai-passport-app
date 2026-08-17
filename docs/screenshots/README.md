# App Store用スクリーンショット

iPhone 6.9インチ(1320×2868)。**全点 RGB・アルファなし**。
App Store Connect はアルファチャンネル付きの画像を受け付けないため、`simctl` の出力(RGBA)を
そのまま使ってはいけない。

## 掲載順の推奨

App Store の検索結果には**先頭3枚だけ**が並ぶので、そこで価値が伝わる順に置く。

| 順 | ファイル | 何を伝えるか |
|---|---|---|
| 1 | `01-home.png` | 全5章×100問=500問という物量と、模試・復習の入口 |
| 2 | `03-explain.png` | **全問解説**。最大の差別化点 |
| 3 | `07-result.png` | 採点、分野別スコア、誤答の解説がまとめて出る |
| 4 | `02-quiz.png` | 本番同形式(60問・60分カウントダウン) |
| 5 | `05-stats.png` | 連続学習日数・章別正答率 |
| 6 | `06-review-explain.png` | 間違えた問題の解説だけを読み返せる |
| 7 | `04-home-reminder.png` | 学習リマインダー |

## 撮り直す手順

1. iPhone 17 Pro Max(6.9インチ)のシミュレータを起動する
   ```bash
   xcrun simctl boot 60E88DA3-2922-4411-994E-5E9872DE6423
   ```
2. `npm run ios:sync` してビルド・インストールし、一度起動してコンテナを作る
3. 学習履歴を仕込む。**プロパティリストを直接書き換えても効かない**(cfprefsd が
   キャッシュを持っているため)。必ず `defaults` 経由で書く:
   ```bash
   xcrun simctl spawn <UDID> defaults write com.hk5150.genaipassport \
     "CapacitorStorage.genai_passport_store_v1" -string "<JSON>"
   ```
4. `xcrun simctl io <UDID> screenshot out.png` で撮る
5. **RGBに変換する**(上記の理由)

結果画面は60問を解かないと出せないが、`inProgress.mock` に60問すべて回答済みの
データを入れておくと、起動後に模擬試験を開いた時点で `finishSession()` が走り
結果画面が出る(`startSession` の「中断時点で全問回答済み」の分岐)。

## 未対応

- 文字のキャプションを載せた装飾版は作っていない。素のスクリーンショットのままでも
  審査は通るが、訴求力を上げるなら「500問」「全問解説」などの見出しを重ねた版を別途作る
- 6.5インチ版は不要(6.9インチがあればAppleが自動で縮小して扱う)
