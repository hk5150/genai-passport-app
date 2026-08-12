const CHAPTERS = {
  1: "第1章 AI(人工知能)",
  2: "第2章 生成AI(ジェネレーティブAI)",
  3: "第3章 現在の生成AIの動向",
  4: "第4章 情報リテラシー・基本理念とAI社会原則",
  5: "第5章 テキスト生成AIのプロンプト制作と実例"
};

let QUESTIONS = [];
let session = null; // {mode, order:[idx...], pos, answers:[{idx,selected,correct}], startedAt}
let store = { history: [], wrong: {} }; // wrong: {questionKey: count}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function qKey(q){ return q.id || (q.ch + "|" + q.q.slice(0,12)); }

function loadStore(){
  try {
    const raw = localStorage.getItem('genai_passport_store_v1');
    if (raw) store = JSON.parse(raw);
  } catch(e){}
}
function saveStore(){
  try { localStorage.setItem('genai_passport_store_v1', JSON.stringify(store)); } catch(e){}
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
  loadStore();
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
  $('#chapterList').innerHTML = Object.keys(CHAPTERS).map(ch => `
    <button class="chapBtn" data-ch="${ch}">
      <span class="chapName">${CHAPTERS[ch]}</span>
      <span class="chapCount">${chapCounts[ch]||0}問</span>
    </button>
  `).join('');
  $$('.chapBtn').forEach(b => b.addEventListener('click', () => startSession('chapter', parseInt(b.dataset.ch))));

  const reviewBtn = $('#reviewBtn');
  reviewBtn.disabled = wrongCount === 0;
  reviewBtn.querySelector('.count').textContent = wrongCount ? `(${wrongCount}問)` : '';
}

function startSession(mode, chapterOrNull){
  let pool;
  if (mode === 'mock'){
    pool = shuffle(QUESTIONS.map((q,i)=>i)).slice(0, Math.min(60, QUESTIONS.length));
  } else if (mode === 'chapter'){
    pool = QUESTIONS.map((q,i)=>i).filter(i => QUESTIONS[i].ch === chapterOrNull);
    pool = shuffle(pool);
  } else if (mode === 'review'){
    const keys = Object.keys(store.wrong).filter(k=>store.wrong[k]>0);
    pool = QUESTIONS.map((q,i)=>i).filter(i => keys.includes(qKey(QUESTIONS[i])));
    pool = shuffle(pool);
  }
  if (!pool.length){ alert('出題できる問題がありません。'); return; }
  session = { mode, order: pool, pos: 0, answers: [], startedAt: Date.now(), chapterOrNull };
  screen('quizScreen');
  renderQuestion();
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
  $$('.choiceBtn').forEach(btn => {
    btn.addEventListener('click', () => selectAnswer(idx, parseInt(btn.dataset.ci)));
  });
}

function selectAnswer(idx, chosenIdx){
  const q = QUESTIONS[idx];
  const correct = chosenIdx === q.a;
  $$('.choiceBtn').forEach(btn => {
    btn.disabled = true;
    const ci = parseInt(btn.dataset.ci);
    if (ci === q.a) btn.classList.add('correct');
    if (ci === chosenIdx && !correct) btn.classList.add('incorrect');
  });
  session.answers.push({idx, chosenIdx, correct});

  const key = qKey(q);
  if (!correct){
    store.wrong[key] = (store.wrong[key]||0) + 1;
  } else {
    if (store.wrong[key]) store.wrong[key] = Math.max(0, store.wrong[key]-1);
  }
  saveStore();

  const fb = $('#feedback');
  fb.classList.remove('hidden');
  fb.innerHTML = `
    <div class="fbHead ${correct ? 'ok':'ng'}">${correct ? '正解 ◎' : '不正解 ×'}</div>
    <div class="fbExp">${q.e}</div>
  `;
  $('#nextBtn').classList.remove('hidden');
  $('#nextBtn').textContent = session.pos + 1 < session.order.length ? '次の問題へ' : '結果を見る';
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
  const total = session.answers.length;
  const correctCount = session.answers.filter(a=>a.correct).length;
  const pct = Math.round((correctCount/total)*100);
  store.history.push({ date: Date.now(), mode: session.mode, total, correct: correctCount, pct, chapterOrNull: session.chapterOrNull||null });
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
    return `<div class="wrongItem">
      <div class="wrongQ">${q.q}</div>
      <div class="wrongYour">あなたの回答: ${q.c[a.chosenIdx]}</div>
      <div class="wrongCorrect">正解: ${q.c[q.a]}</div>
      <div class="wrongExp">${q.e}</div>
    </div>`;
  }).join('') : `<p class="muted">全問正解でした！</p>`;
}

function init(){
  fetch('./questions.json')
    .then(r=>r.json())
    .then(data => { QUESTIONS = data; renderHome(); screen('homeScreen'); });

  $('#mockBtn').addEventListener('click', () => startSession('mock'));
  $('#reviewBtn').addEventListener('click', () => startSession('review'));
  $('#nextBtn').addEventListener('click', nextQuestion);
  $('#quitBtn').addEventListener('click', () => {
    if (confirm('セッションを中断してホームに戻りますか？')){
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
