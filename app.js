const APP_VERSION = 'v1.8.0';

const CHAPTERS = {
  1: "第1章 AI(人工知能)",
  2: "第2章 生成AI(ジェネレーティブAI)",
  3: "第3章 現在の生成AIの動向",
  4: "第4章 情報リテラシー・基本理念とAI社会原則",
  5: "第5章 テキスト生成AIのプロンプト制作と実例"
};

let QUESTIONS = [];
let session = null; // {mode, chapterOrNull, order:[idx...], pos, answers:[{idx,chosenIdx,correct}], startedAt}
let store = { history: [], wrong: {}, inProgress: {} }; // wrong: {questionKey: count}, inProgress: {sessionKey: {order,answers,startedAt,qCount}}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function qKey(q){ return q.id || (q.ch + "|" + q.q.slice(0,12)); }

// 模擬試験/分野別演習のみ中断→再開に対応(復習は誤答キューが変動するため対象外)
function sessionKey(mode, chapterOrNull){
  return mode === 'chapter' ? `chapter-${chapterOrNull}` : mode;
}

const STORE_KEY = 'genai_passport_store_v1';

// 永続化のバックエンドを実行環境で切り替える。
// Web(GitHub Pages/PWA): localStorage
// iOSアプリ(Capacitor): Preferences — WKWebViewのlocalStorageは端末のストレージが
// 逼迫するとOSに破棄されうるため、学習履歴の保存先としては使えない。
const isNative = () =>
  !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
     && window.Capacitor.isNativePlatform());
const nativePrefs = () =>
  (isNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences) || null;

async function readRaw(){
  const prefs = nativePrefs();
  if (prefs){
    const { value } = await prefs.get({ key: STORE_KEY });
    return value;
  }
  try { return localStorage.getItem(STORE_KEY); } catch(e){ return null; }
}

async function writeRaw(raw){
  const prefs = nativePrefs();
  if (prefs){ await prefs.set({ key: STORE_KEY, value: raw }); return; }
  try { localStorage.setItem(STORE_KEY, raw); } catch(e){}
}

// 起動時に一度だけ呼ぶ。以降はメモリ上の store が正で、読み直しは不要
async function loadStore(){
  try {
    const raw = await readRaw();
    if (raw) store = JSON.parse(raw);
  } catch(e){}
  if (!store.wrong) store.wrong = {};
  if (!store.history) store.history = [];
  if (!store.inProgress) store.inProgress = {};
}

// 書き込みは非同期だが待たない。UIを止めないためで、失敗しても次の保存で回復する
function saveStore(){
  writeRaw(JSON.stringify(store)).catch(()=>{});
}

function saveInProgress(){
  if (session.mode !== 'mock' && session.mode !== 'chapter') return;
  const key = sessionKey(session.mode, session.chapterOrNull);
  store.inProgress[key] = {
    order: session.order,
    answers: session.answers,
    startedAt: session.startedAt,
    qCount: QUESTIONS.length
  };
  saveStore();
}

// 中断中の未完了セッションがあれば {pos, total} を返す(ホーム画面の「つづきから」表示用)
function getResumableProgress(key){
  const ip = store.inProgress[key];
  if (!ip || ip.qCount !== QUESTIONS.length) return null;
  if (ip.answers.length >= ip.order.length) return null;
  return { pos: ip.answers.length, total: ip.order.length };
}

function shuffle(arr){
  const a = arr.slice();
  for (let i = a.length -1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function screen(id){
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#'+id).classList.add('active');
}

function renderHome(){
  const attempts = store.history.length;
  const avg = attempts ? Math.round(store.history.reduce((s,h)=>s+h.pct,0)/attempts) : null;
  const wrongCount = Object.keys(store.wrong).filter(k=>store.wrong[k]>0).length;
  $('#homeStats').innerHTML = attempts
    ? `<div class="stat"><span class="num">${attempts}</span><span class="lbl">受験回数</span></div>
       <div class="stat"><span class="num">${avg}%</span><span class="lbl">平均正答率</span></div>
       <div class="stat"><span class="num">${wrongCount}</span><span class="lbl">要復習</span></div>`
    : `<p class="muted">まだ受験記録がありません。模擬試験か分野別演習を始めましょう。</p>`;

  const chapCounts = {};
  QUESTIONS.forEach(q => chapCounts[q.ch] = (chapCounts[q.ch]||0)+1);
  $('#chapterList').innerHTML = Object.keys(CHAPTERS).map(ch => {
    const prog = getResumableProgress(sessionKey('chapter', parseInt(ch)));
    return `
    <button class="chapBtn" data-ch="${ch}">
      <span class="chapName">${CHAPTERS[ch]}${prog ? `<span class="chapResume">つづきから(${prog.pos}/${prog.total}問)</span>` : ''}</span>
      <span class="chapCount">${chapCounts[ch]||0}問</span>
    </button>
  `;
  }).join('');
  $$('.chapBtn').forEach(b => b.addEventListener('click', () => startSession('chapter', parseInt(b.dataset.ch))));

  const mockProg = getResumableProgress('mock');
  $('#mockBtn').querySelector('.sub').textContent = mockProg
    ? `つづきから(${mockProg.pos}/${mockProg.total}問)`
    : '最大60問・ランダム出題';

  const reviewBtn = $('#reviewBtn');
  reviewBtn.disabled = wrongCount === 0;
  reviewBtn.querySelector('.count').textContent = wrongCount ? `(${wrongCount}問)` : '';

  const explainBtn = $('#explainListBtn');
  explainBtn.disabled = wrongCount === 0;
  explainBtn.querySelector('.count').textContent = wrongCount ? `(${wrongCount}問)` : '';
}

// 間違えた問題(誤答カウント>0)を再回答せず解説だけ一覧で読める画面
function renderExplainList(){
  const wrongKeys = new Set(Object.keys(store.wrong).filter(k => store.wrong[k] > 0));
  const items = QUESTIONS.filter(q => wrongKeys.has(qKey(q)));

  if (!items.length){
    $('#explainList').innerHTML = `<p class="muted">復習が必要な問題はありません。</p>`;
    return;
  }

  const byChap = {};
  items.forEach(q => { (byChap[q.ch] = byChap[q.ch] || []).push(q); });

  $('#explainList').innerHTML = Object.keys(byChap).sort((a,b)=>a-b).map(ch => `
    <div class="sectionLabel">${CHAPTERS[ch]}(${byChap[ch].length}問)</div>
    ${byChap[ch].map(q => `
      <div class="wrongItem">
        <span class="tag sec">${q.sec}</span>
        <div class="wrongQ">${q.q}</div>
        <div class="wrongCorrect">正解: ${q.c[q.a]}</div>
        <div class="wrongExp">${q.e}</div>
      </div>
    `).join('')}
  `).join('');
}

function startSession(mode, chapterOrNull){
  const key = sessionKey(mode, chapterOrNull);
  const ip = (mode === 'mock' || mode === 'chapter') ? store.inProgress[key] : null;
  const ipValid = !!(ip && ip.qCount === QUESTIONS.length);

  // 中断時点で全問回答済みだったが結果画面まで進んでいなかった場合は、その結果を確定させる
  if (ipValid && ip.answers.length >= ip.order.length && ip.order.length > 0){
    session = { mode, order: ip.order, pos: ip.answers.length, answers: ip.answers, startedAt: ip.startedAt, chapterOrNull };
    finishSession();
    return;
  }

  let order, answers, startedAt;
  if (ipValid && ip.answers.length < ip.order.length){
    order = ip.order; answers = ip.answers.slice(); startedAt = ip.startedAt;
  } else {
    let pool;
    if (mode === 'mock'){
      pool = shuffle(QUESTIONS.map((q,i)=>i)).slice(0, Math.min(60, QUESTIONS.length));
    } else if (mode === 'chapter'){
      // 分野別演習は出題順を維持(シャッフルしない)
      pool = QUESTIONS.map((q,i)=>i).filter(i => QUESTIONS[i].ch === chapterOrNull);
    } else if (mode === 'review'){
      const keys = Object.keys(store.wrong).filter(k=>store.wrong[k]>0);
      pool = QUESTIONS.map((q,i)=>i).filter(i => keys.includes(qKey(QUESTIONS[i])));
      pool = shuffle(pool);
    }
    if (!pool.length){ alert('出題できる問題がありません。'); return; }
    order = pool; answers = []; startedAt = Date.now();
  }

  session = { mode, order, pos: answers.length, answers, startedAt, chapterOrNull };
  screen('quizScreen');
  renderQuestion();
  startTimer();
}

function renderQuestion(){
  const idx = session.order[session.pos];
  const q = QUESTIONS[idx];
  $('#progressLabel').textContent = `${session.pos+1} / ${session.order.length}`;
  $('#progressFill').style.width = `${((session.pos)/session.order.length)*100}%`;
  $('#chapTag').textContent = CHAPTERS[q.ch].replace(/^第\d章\s*/,'');
  $('#secTag').textContent = q.sec;
  $('#questionText').textContent = q.q;
  const choiceOrder = shuffle(q.c.map((c,i)=>i));
  $('#choices').innerHTML = choiceOrder.map(ci => `
    <button class="choiceBtn" data-ci="${ci}">
      <span class="choiceMark"></span>
      <span class="choiceText">${q.c[ci]}</span>
    </button>
  `).join('');
  $('#feedback').classList.add('hidden');
  $('#feedback').innerHTML = '';
  $('#nextBtn').classList.add('hidden');
  const dontKnowBtn = $('#dontKnowBtn');
  dontKnowBtn.disabled = false;
  dontKnowBtn.onclick = () => answerQuestion(idx, null);
  $$('.choiceBtn').forEach(btn => {
    btn.addEventListener('click', () => answerQuestion(idx, parseInt(btn.dataset.ci)));
  });
}

// chosenIdx が null の場合は「わからない」回答(不正解扱いで復習対象になるが、
// どの選択肢も誤答としてはマークしない)
function answerQuestion(idx, chosenIdx){
  const q = QUESTIONS[idx];
  const correct = chosenIdx === q.a;
  $$('.choiceBtn').forEach(btn => {
    btn.disabled = true;
    const ci = parseInt(btn.dataset.ci);
    if (ci === q.a) btn.classList.add('correct');
    if (ci === chosenIdx && !correct) btn.classList.add('incorrect');
  });
  $('#dontKnowBtn').disabled = true;
  session.answers.push({idx, chosenIdx, correct});

  const key = qKey(q);
  if (!correct){
    store.wrong[key] = (store.wrong[key]||0) + 1;
  } else {
    if (store.wrong[key]) store.wrong[key] = Math.max(0, store.wrong[key]-1);
  }
  saveStore();
  saveInProgress(); // 中断→再開のため回答ごとに進捗を保存(模擬試験・分野別演習のみ)

  const headClass = correct ? 'ok' : (chosenIdx === null ? 'unknown' : 'ng');
  const headText = correct ? '正解 ◎' : (chosenIdx === null ? 'わからない' : '不正解 ×');
  const fb = $('#feedback');
  fb.classList.remove('hidden');
  fb.innerHTML = `
    <div class="fbHead ${headClass}">${headText}</div>
    <div class="fbExp">${q.e}</div>
  `;
  $('#nextBtn').classList.remove('hidden');
  $('#nextBtn').textContent = session.pos + 1 < session.order.length ? '次の問題へ' : '結果を見る';
}

const MOCK_TIME_LIMIT_MS = 60 * 60 * 1000; // 模擬試験は60分の目安

let timerInterval = null;

function fmtTime(ms){
  const totalSec = Math.max(0, Math.round(ms/1000));
  const m = Math.floor(totalSec/60);
  const s = totalSec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function stopTimer(){
  if (timerInterval){ clearInterval(timerInterval); timerInterval = null; }
}

// タイマーは模擬試験のみ表示(分野別演習・復習には表示しない)
function startTimer(){
  stopTimer();
  const el = $('#timerLabel');
  if (session.mode !== 'mock'){
    el.textContent = '';
    el.className = 'timerLabel hidden';
    return;
  }
  el.className = 'timerLabel';
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

// 模擬試験は60分からのカウントダウン(0になったらそこまでの回答で自動終了)
function updateTimer(){
  if (!session || session.mode !== 'mock') return;
  const el = $('#timerLabel');
  const elapsed = Date.now() - session.startedAt;
  const remaining = MOCK_TIME_LIMIT_MS - elapsed;
  el.textContent = `残り ${fmtTime(remaining)}`;
  el.className = 'timerLabel' + (remaining <= 60000 ? ' danger' : remaining <= 5*60000 ? ' warn' : '');
  if (remaining <= 0){
    stopTimer();
    finishSession();
  }
}

function nextQuestion(){
  session.pos++;
  if (session.pos >= session.order.length){
    finishSession();
  } else {
    renderQuestion();
  }
}

function finishSession(){
  stopTimer();
  const total = session.answers.length;
  const correctCount = session.answers.filter(a=>a.correct).length;
  const pct = Math.round((correctCount/total)*100);
  store.history.push({ date: Date.now(), mode: session.mode, total, correct: correctCount, pct, chapterOrNull: session.chapterOrNull||null });
  const key = sessionKey(session.mode, session.chapterOrNull);
  if (store.inProgress[key]) delete store.inProgress[key];
  saveStore();

  screen('resultScreen');
  $('#resultScoreNum').textContent = `${correctCount} / ${total}`;
  $('#resultPct').textContent = `${pct}%`;
  $('#resultPct').className = 'resultPct ' + (pct>=70?'good':pct>=50?'mid':'low');

  const byChap = {};
  session.answers.forEach(a => {
    const ch = QUESTIONS[a.idx].ch;
    byChap[ch] = byChap[ch] || {c:0,t:0};
    byChap[ch].t++;
    if (a.correct) byChap[ch].c++;
  });
  $('#chapBreakdown').innerHTML = Object.keys(byChap).sort().map(ch => {
    const {c,t} = byChap[ch];
    const p = Math.round((c/t)*100);
    return `<div class="breakRow">
      <span class="breakName">${CHAPTERS[ch].replace(/^第\d章\s*/,'')}</span>
      <div class="breakBarWrap"><div class="breakBar" style="width:${p}%"></div></div>
      <span class="breakNum">${c}/${t}</span>
    </div>`;
  }).join('');

  const wrongOnes = session.answers.filter(a=>!a.correct);
  $('#wrongList').innerHTML = wrongOnes.length ? wrongOnes.map(a => {
    const q = QUESTIONS[a.idx];
    const isUnknown = a.chosenIdx === null;
    return `<div class="wrongItem ${isUnknown ? 'unknown':''}">
      <div class="wrongQ">${q.q}</div>
      <div class="wrongYour ${isUnknown ? 'unknown':''}">あなたの回答: ${isUnknown ? 'わからない(未回答)' : q.c[a.chosenIdx]}</div>
      <div class="wrongCorrect">正解: ${q.c[q.a]}</div>
      <div class="wrongExp">${q.e}</div>
    </div>`;
  }).join('') : `<p class="muted">全問正解でした！</p>`;
}

function init(){
  $('#versionBadge').textContent = APP_VERSION;

  // 永続化データ → 問題データの順に読み込む。
  // loadStore を待たずに描画すると、受験履歴や「つづきから」が空のまま表示されてしまう
  loadStore()
    .then(() => fetch('./questions.json'))
    .then(r => {
      if (!r.ok) throw new Error(`questions.json の取得に失敗 (HTTP ${r.status})`);
      return r.json();
    })
    .then(data => { QUESTIONS = data; renderHome(); screen('homeScreen'); })
    .catch(err => {
      console.error(err);
      $('#homeStats').innerHTML =
        `<p class="muted">問題データを読み込めませんでした。アプリを再起動してください。</p>`;
      screen('homeScreen');
    });

  $('#mockBtn').addEventListener('click', () => startSession('mock'));
  $('#reviewBtn').addEventListener('click', () => startSession('review'));
  $('#explainListBtn').addEventListener('click', () => { renderExplainList(); screen('explainScreen'); });
  $('#explainBackBtn').addEventListener('click', () => { renderHome(); screen('homeScreen'); });
  $('#nextBtn').addEventListener('click', nextQuestion);
  $('#quitBtn').addEventListener('click', () => {
    if (confirm('セッションを中断してホームに戻りますか？')){
      stopTimer();
      renderHome(); screen('homeScreen');
    }
  });
  $('#homeFromResult').addEventListener('click', () => { renderHome(); screen('homeScreen'); });
  $('#retryFromResult').addEventListener('click', () => {
    if (session.mode==='chapter') startSession('chapter', session.chapterOrNull);
    else startSession(session.mode);
  });
}

document.addEventListener('DOMContentLoaded', init);
