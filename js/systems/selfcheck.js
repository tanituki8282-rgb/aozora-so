/**
 * ルール評価と第1季の通し確認。
 * ブラウザには読み込まない。 `node js/systems/selfcheck.js`
 * バランスの当たりを見るときは `node js/systems/selfcheck.js --sim`
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var rootDir = path.join(__dirname, '..', '..');
var files = [
  'js/systems/num.js',
  'js/systems/rng.js',
  'js/data/tenants.js',
  'js/data/world.js',
  'js/systems/board.js',
  'js/systems/evaluator.js',
  'js/systems/game.js'
];

var i;
for (i = 0; i < files.length; i++) {
  var file = path.join(rootDir, files[i]);
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

var failed = 0;

/**
 * @param {boolean} cond
 * @param {string} label
 * @returns {void}
 */
function check(cond, label) {
  if (!cond) {
    failed += 1;
    console.error('FAIL ' + label);
  }
}

/**
 * @param {number} actual
 * @param {number} expected
 * @param {string} label
 * @param {object} [dump]
 * @returns {void}
 */
function eq(actual, expected, label, dump) {
  if (actual !== expected) {
    failed += 1;
    console.error('FAIL ' + label + ' expected ' + expected + ' actual ' + actual);
    if (dump) {
      console.error(JSON.stringify(dump, null, 2));
    }
  }
}

var ev = new Aozora.RuleEvaluator();
var rooms = Aozora.data.coreRooms();

/**
 * @param {{id:string,x:number,y:number}[]} people
 * @param {object} [extra]
 * @returns {object}
 */
function score(people, extra) {
  var opts = extra || {};
  return ev.score(people, opts.rooms || rooms, {
    houseRuleIds: opts.houseRuleIds || [],
    souvenirs: opts.souvenirs || {},
    rent: opts.rent || 0,
    moveCost: opts.moveCost || 0,
    quota: opts.quota != null ? opts.quota : 0
  });
}

// 台帳の形
check(Aozora.data.tenants.length >= 8 && Aozora.data.tenants.length <= 12, '住人は8〜12');
check(Aozora.data.houseRules.length >= 4 && Aozora.data.houseRules.length <= 6, '家訓は4〜6');
check(Aozora.data.souvenirs.length >= 3 && Aozora.data.souvenirs.length <= 4, '置き土産は3〜4');

var kinds = {
  always: true,
  houseCount: true,
  adjacentTag: true,
  adjacentEmpty: true,
  verticalTag: true,
  verticalEmpty: true,
  aroundTag: true,
  houseTag: true,
  isCorner: true,
  isEdge: true,
  isCenter: true,
  isExtra: true,
  aboveOccupied: true
};
var ti;
for (ti = 0; ti < Aozora.data.tenants.length; ti++) {
  var tenant = Aozora.data.tenants[ti];
  check(!!Aozora.data.souvenirById(tenant.souvenirId), tenant.id + ' の置き土産');
  var ri;
  for (ri = 0; ri < tenant.rules.length; ri++) {
    check(!!kinds[tenant.rules[ri].query.kind], tenant.id + ' の条件 ' + tenant.rules[ri].id);
  }
}

var bonsaiAlone = score([{ id: 'bonsai', x: 0, y: 0 }], { quota: 4 });
eq(bonsaiAlone.total, 4, '盆栽を角に置くと4', bonsaiAlone);
check(bonsaiAlone.pass, '盆栽の角は週1ノルマ');

var bonsaiEdge = score([{ id: 'bonsai', x: 1, y: 0 }]);
eq(bonsaiEdge.total, 1, '盆栽を辺に置くと在室だけ');

var librarianCenter = score([{ id: 'librarian', x: 1, y: 1 }]);
eq(librarianCenter.total, 4, '図書委員を中に置くと4');

var catAlone = score([{ id: 'catlady', x: 2, y: 2 }]);
eq(catAlone.total, 4, '老婦人ひとりは気まま+在室');

var far = score([
  { id: 'catlady', x: 0, y: 0 },
  { id: 'guitarist', x: 2, y: 0 }
], { quota: 7 });
eq(far.total, 7, '老婦人とギタリストを離すと7', far);
check(far.pass, '離して置くと週2ノルマ');

var near = score([
  { id: 'catlady', x: 0, y: 0 },
  { id: 'guitarist', x: 1, y: 0 }
]);
eq(near.total, 1, '隣り合わせると減点で1', near);
var nearText = JSON.stringify(near.tenants);
check(nearText.indexOf('早寝') >= 0 && nearText.indexOf('騒音') >= 0, '隣り合わせの内訳に早寝と騒音');

var diagonal = score([
  { id: 'bonsai', x: 0, y: 0 },
  { id: 'herbalist', x: 1, y: 1 }
]);
eq(diagonal.tenants[0].personal + diagonal.tenants[1].personal, diagonal.subtotal, '合計は個人の和');
var bonsaiDiag = diagonal.tenants.filter(function (t) { return t.id === 'bonsai'; })[0];
eq(bonsaiDiag.personal, 4, 'ななめは隣ではないので植物ボーナスなし', diagonal);

var pair = score([
  { id: 'bonsai', x: 0, y: 0 },
  { id: 'herbalist', x: 1, y: 0 }
]);
eq(pair.total, 10, '盆栽と店主が隣なら10', pair);

var trio = score([
  { id: 'bonsai', x: 0, y: 0 },
  { id: 'herbalist', x: 1, y: 0 },
  { id: 'pianist', x: 2, y: 0 }
], { quota: 12 });
eq(trio.total, 14, '春の見本配置は14', trio);
check(trio.pass, '見本配置は週3ノルマ超え');

var student = score([
  { id: 'catlady', x: 0, y: 0 },
  { id: 'student', x: 2, y: 2 }
]);
eq(student.tenants.filter(function (t) { return t.id === 'student'; })[0].personal, 6, '静かな受験生は6');

var noisyStudent = score([
  { id: 'student', x: 1, y: 1 },
  { id: 'streamer', x: 0, y: 0 }
]);
var stu = noisyStudent.tenants.filter(function (t) { return t.id === 'student'; })[0];
check(stu.sumMul === 0, 'ななめの騒音でも集中倍率は消える');
check(stu.personal < 6, '周囲の騒音で静けさボーナスが消える');

var withRule = score([
  { id: 'guitarist', x: 0, y: 0 },
  { id: 'pianist', x: 1, y: 0 }
], { houseRuleIds: ['music-salon'] });
check(withRule.multiplier === 1.3, '音楽サロンの倍率');
eq(withRule.total, Aozora.num.round2(withRule.beforeMul * 1.3), '倍率は加算の後');

var halved = score([
  { id: 'catlady', x: 0, y: 0 },
  { id: 'guitarist', x: 1, y: 0 }
], { houseRuleIds: ['soundproof'] });
var noiseLine = null;
var hi;
var hj;
for (hi = 0; hi < halved.tenants.length; hi++) {
  for (hj = 0; hj < halved.tenants[hi].lines.length; hj++) {
    var line = halved.tenants[hi].lines[hj];
    if (line.fired && line.about && line.about.indexOf('騒音') >= 0) {
      noiseLine = line;
    }
  }
}
check(noiseLine && noiseLine.amount === -2, '防音壁は個人の行を書き換えない');
var refund = halved.houseLines.filter(function (l) { return l.text.indexOf('防音壁') >= 0; })[0];
check(refund && refund.amount === 1, '騒音-2は半分になって+1戻る');
var earlyStill = JSON.stringify(halved.tenants);
check(earlyStill.indexOf('早寝') >= 0, '早寝の減点は防音壁の対象外');

var cushion = score([
  { id: 'catlady', x: 0, y: 0 },
  { id: 'guitarist', x: 1, y: 0 }
], { souvenirs: { 'quiet-reform': 1 } });
var softened = false;
for (hi = 0; hi < cushion.tenants.length; hi++) {
  for (hj = 0; hj < cushion.tenants[hi].lines.length; hj++) {
    var sline = cushion.tenants[hi].lines[hj];
    if (sline.fired && sline.about && sline.about.indexOf('騒音') >= 0 && sline.amount === -1) {
      softened = true;
    }
  }
}
check(softened, '静音リフォームで騒音-2が-1');

var gift = score([{ id: 'bonsai', x: 0, y: 0 }], { souvenirs: { 'corner-gift': 1 } });
eq(gift.total, 6, '角部屋の恵みで盆栽は6');

var moved = score([{ id: 'bonsai', x: 0, y: 0 }], { moveCost: 2, rent: 1, quota: 4 });
eq(moved.total, 3, '家賃は足し、引越しは後から引く');
check(!moved.pass, '引越しでノルマを割る例');

// 予測と本番が同じ数字になること
var game = new Aozora.Game(7);
game.begin();
check(game.offers.slice().sort().join() === 'bonsai,catlady,librarian', '週1の顔ぶれは固定');
var again = new Aozora.Game(7);
again.begin();
check(game.offers.join() === again.offers.join(), '同じ種なら並びも同じ');

var picked = game.chooseApplicant('bonsai');
check(picked.ok, '盆栽を選ぶ');
var placed = game.placeNewcomer(0, 0);
check(placed.ok, '角に置く');
var predicted = game.preview();
var confirmed = game.confirmWeek();
eq(confirmed.report.total, predicted.total, '予測と週末判定が一致');
eq(confirmed.report.total, 4, '週1本番は4');
game.ackResolve();
check(game.week === 2 && game.phase === 'draft', '週2のドラフトへ');

game.chooseApplicant('herbalist');
game.placeNewcomer(1, 0);
var week2 = game.confirmWeek();
eq(week2.report.total, 10, '週2の見本は10');
game.ackResolve();

game.chooseApplicant('pianist');
game.placeNewcomer(2, 0);
var previewGrad = game.ranking(game.preview());
check(previewGrad[0].id === 'bonsai', '週末前の予測で盆栽が満足1位');
var week3 = game.confirmWeek();
eq(week3.report.total, 14, '週3の見本は14');
check(week3.report.pass, '週3合格');
game.ackResolve();
check(game.phase === 'graduate' && game.graduateId === 'bonsai', 'いちばん満たされた盆栽が卒業');
game.ackGraduate();
check(game.souvenirs['corner-gift'] === 1, '角部屋の恵みが残る');
check(game.phase === 'shop', '季節の店が開く');
check(game.occupants.every(function (o) { return o.seasonHappiness === 0; }), '新季節の満足はゼロから');

// 未達が二度で審査落ち。卒業は見ない。
var bad = new Aozora.Game(3);
bad.begin();
bad.chooseApplicant('librarian');
bad.placeNewcomer(0, 0);
var miss1 = bad.confirmWeek();
check(!miss1.report.pass && bad.strikes === 1, '辺の図書委員は未達');
bad.ackResolve();
bad.skipDraft();
var miss2 = bad.confirmWeek();
check(!miss2.report.pass && bad.strikes === 2, '見送りでも届かず二度目');
bad.ackResolve();
check(bad.phase === 'ending' && bad.ending === 'fail', '審査落ち');
check(bad.graduated.length === 0, '落ちたランに卒業はない');

// ログに内訳が残る
check(game.log.some(function (e) { return e.type === 'score' && e.lines && e.lines.length > 0; }), 'ログに内訳');

/**
 * 空き部屋への仮置きと、既住人の引越し1回を総当たりして、予測点が最大の手を選ぶ。
 * @param {Game} g
 * @returns {{type:string, id?:string, x?:number, y?:number, move?:{id:string,x:number,y:number}|null}}
 */
function bestDraft(g) {
  /** @type {{type:string, id?:string, x?:number, y?:number, move?:{id:string,x:number,y:number}|null, total:number}} */
  var best = { type: 'skip', total: g.preview({ extraRent: 1 }).total };
  var cells = g.emptyCells();
  var oi;
  for (oi = 0; oi < g.offers.length; oi++) {
    var id = g.offers[oi];
    var ci;
    for (ci = 0; ci < cells.length; ci++) {
      var cell = cells[ci];
      /** @type {({id:string,x:number,y:number}|null)[]} */
      var moves = [null];
      var ri2;
      for (ri2 = 0; ri2 < g.occupants.length; ri2++) {
        var who = g.occupants[ri2];
        var di;
        for (di = 0; di < cells.length; di++) {
          var dest = cells[di];
          if (dest.x === cell.x && dest.y === cell.y) {
            continue;
          }
          if (dest.x === who.x && dest.y === who.y) {
            continue;
          }
          moves.push({ id: who.id, x: dest.x, y: dest.y });
        }
      }
      var mi;
      for (mi = 0; mi < moves.length; mi++) {
        var report;
        try {
          report = g.preview({
            assumePendingId: id,
            ghostPlace: { x: cell.x, y: cell.y },
            ghostMove: moves[mi]
          });
        } catch (err) {
          continue;
        }
        if (report.total > best.total) {
          best = { type: 'draft', id: id, x: cell.x, y: cell.y, move: moves[mi], total: report.total };
        }
      }
    }
  }
  return best;
}

/**
 * @param {Game} g
 * @returns {number}
 */
function bestShop(g) {
  var bestIndex = -1;
  var bestDelta = 0;
  var s;
  for (s = 0; s < g.shopOffers.length; s++) {
    var hypo = g.previewShop(s);
    var delta = hypo ? hypo.delta : 0;
    if (g.shopOffers[s].type === 'expand') {
      delta = Math.max(delta, 0.25);
    }
    if (delta > bestDelta) {
      bestDelta = delta;
      bestIndex = s;
    }
  }
  return bestIndex;
}

/**
 * @param {number} seed
 * @param {boolean} skipShop
 * @returns {{ending:string|null, graduated:boolean, weeks:{week:number,total:number,pass:boolean}[]}}
 */
function simulate(seed, skipShop) {
  var g = new Aozora.Game(seed);
  g.begin();
  /** @type {{week:number,total:number,pass:boolean}[]} */
  var weeks = [];
  var guard = 0;
  while (g.phase !== 'ending' && guard < 80) {
    guard += 1;
    if (g.phase === 'draft') {
      var choice = bestDraft(g);
      if (choice.type === 'skip') {
        g.skipDraft();
      } else {
        g.chooseApplicant(choice.id);
        g.placeNewcomer(choice.x, choice.y);
        if (choice.move) {
          g.moveResident(choice.move.id, choice.move.x, choice.move.y);
        }
      }
      var done = g.confirmWeek();
      if (!done.ok) {
        throw new Error(done.reason || 'confirm失敗');
      }
      weeks.push({ week: g.week, total: done.report.total, pass: done.report.pass });
    } else if (g.phase === 'resolve') {
      g.ackResolve();
    } else if (g.phase === 'graduate') {
      g.ackGraduate();
    } else if (g.phase === 'shop') {
      g.chooseShop(skipShop ? -1 : bestShop(g));
    } else {
      throw new Error('想定外の局面 ' + g.phase);
    }
  }
  return {
    ending: g.ending,
    graduated: g.log.some(function (e) { return e.type === 'graduate'; }),
    weeks: weeks
  };
}

var scripted = simulate(1, false);
check(scripted.graduated, '総当たりでも最初の卒業に到達');
check(scripted.weeks[0].pass && scripted.weeks[1].pass && scripted.weeks[2].pass, '第1季の3週は総当たりで合格');

/**
 * 予測は見るが、引越しはしない。
 * @param {Game} g
 * @returns {{type:string, id?:string, x?:number, y?:number, move?:null, total:number}}
 */
function humanDraft(g) {
  var best = { type: 'skip', total: g.preview({ extraRent: 1 }).total, move: null };
  var cells = g.emptyCells();
  var oi;
  for (oi = 0; oi < g.offers.length; oi++) {
    var ci;
    for (ci = 0; ci < cells.length; ci++) {
      var report;
      try {
        report = g.preview({
          assumePendingId: g.offers[oi],
          ghostPlace: { x: cells[ci].x, y: cells[ci].y }
        });
      } catch (err) {
        continue;
      }
      if (report.total > best.total) {
        best = {
          type: 'draft',
          id: g.offers[oi],
          x: cells[ci].x,
          y: cells[ci].y,
          move: null,
          total: report.total
        };
      }
    }
  }
  return best;
}

/**
 * 並びの先頭を、最初の空きへ置く。予測は見ない。
 * @param {Game} g
 * @returns {{type:string, id?:string, x?:number, y?:number, move?:null}}
 */
function blindDraft(g) {
  if (!g.offers.length || !g.emptyCells().length) {
    return { type: 'skip', move: null };
  }
  var cell = g.emptyCells()[0];
  return { type: 'draft', id: g.offers[0], x: cell.x, y: cell.y, move: null };
}

/**
 * @param {number} seed
 * @param {'brute'|'human'|'blind'} policy
 * @param {boolean} skipShop
 * @returns {{ending:string|null, graduated:boolean, weeks:{week:number,total:number,pass:boolean}[]}}
 */
function simulatePolicy(seed, policy, skipShop) {
  var g = new Aozora.Game(seed);
  g.begin();
  /** @type {{week:number,total:number,pass:boolean}[]} */
  var weeks = [];
  var guard = 0;
  while (g.phase !== 'ending' && guard < 80) {
    guard += 1;
    if (g.phase === 'draft') {
      var choice = policy === 'human' ? humanDraft(g) : policy === 'blind' ? blindDraft(g) : bestDraft(g);
      if (choice.type === 'skip') {
        g.skipDraft();
      } else {
        g.chooseApplicant(choice.id);
        var placedOk = g.placeNewcomer(choice.x, choice.y);
        if (!placedOk.ok) {
          throw new Error(placedOk.reason || 'place失敗');
        }
        if (choice.move) {
          g.moveResident(choice.move.id, choice.move.x, choice.move.y);
        }
      }
      var done = g.confirmWeek();
      if (!done.ok) {
        throw new Error(done.reason || 'confirm失敗');
      }
      weeks.push({ week: g.week, total: done.report.total, pass: done.report.pass });
    } else if (g.phase === 'resolve') {
      g.ackResolve();
    } else if (g.phase === 'graduate') {
      g.ackGraduate();
    } else if (g.phase === 'shop') {
      g.chooseShop(skipShop ? -1 : bestShop(g));
    } else {
      throw new Error('想定外の局面 ' + g.phase);
    }
  }
  return {
    ending: g.ending,
    graduated: g.log.some(function (e) { return e.type === 'graduate'; }),
    weeks: weeks
  };
}

if (process.argv.indexOf('--sim') >= 0) {
  var seeds = 30;
  var policies = ['brute', 'human', 'blind'];
  var p;
  for (p = 0; p < policies.length; p++) {
    var policy = policies[p];
    var grad = 0;
    var finish = 0;
    var fail = 0;
    /** @type {number[][]} */
    var bucket = [];
    var w;
    for (w = 1; w <= 12; w++) {
      bucket[w] = [];
    }
    var seed;
    for (seed = 1; seed <= seeds; seed++) {
      var played = simulatePolicy(seed, policy, false);
      if (played.graduated) {
        grad += 1;
      }
      if (played.ending === 'clear' || played.ending === 'soft') {
        finish += 1;
      } else {
        fail += 1;
      }
      for (w = 0; w < played.weeks.length; w++) {
        bucket[played.weeks[w].week].push(played.weeks[w].total);
      }
    }
    console.log(policy, 'graduate', grad, 'finish', finish, 'fail', fail);
    for (w = 1; w <= 12; w++) {
      var arr = bucket[w].slice().sort(function (a, b) { return a - b; });
      if (!arr.length) {
        continue;
      }
      var mid = arr[Math.floor(arr.length / 2)];
      console.log(' ', policy, 'week', w, 'n', arr.length, 'min', arr[0], 'median', mid, 'max', arr[arr.length - 1], 'quota', Aozora.data.quotaFor(w));
    }
  }
}

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('selfcheck ok');
