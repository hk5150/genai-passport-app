#!/usr/bin/env node
// リポジトリのルートにある配信用アセットを www/ にコピーする。
//
// なぜこれが要るか:
//   GitHub Pages は main のルートをそのまま配信するので、ソースはルートに置いたままにしたい。
//   一方 Capacitor は webDir を丸ごとアプリバンドルへ取り込むため、ルートを指定すると
//   node_modules や .git まで同梱されてしまう。そこで必要なファイルだけ www/ に集める。
//
// sw.js は意図的に除外する(理由は下部のコメント参照)。

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');

// Service Worker は同梱しない。
// Capacitor はアプリバンドル内のファイルを capacitor://localhost から直接配信するため
// キャッシュ層が不要で、cache-first の SW は古いアセットを掴む原因にしかならない。
const ASSETS = ['index.html', 'app.js', 'styles.css', 'manifest.json', 'questions.json', 'icons'];

await rm(www, { recursive: true, force: true });
await mkdir(www, { recursive: true });

for (const name of ASSETS) {
  await cp(join(root, name), join(www, name), { recursive: true });
}

// www/ は生成物なので、誤ってここを直接編集しないよう印を残す
await writeFile(
  join(www, 'README.txt'),
  'このディレクトリは scripts/sync-www.mjs が生成します。直接編集しないでください。\n' +
  '編集するのはリポジトリのルートにある index.html / app.js / styles.css などです。\n'
);

console.log(`www/ を更新しました (${ASSETS.length}件)`);
