(function () {
  'use strict';

  /**
   * 画面の描画とクリック。
   * 点数の意味は持たず、Game の予測と内訳をそのまま見せる。
   */
  class View {
    /**
     * @param {HTMLElement} root
     */
    constructor(root) {
      /** @type {HTMLElement} */
      this.root = root;
      /** @type {Game|null} */
      this.game = null;
      /** @type {{x:number,y:number}|null} */
      this.ghost = null;
      /** @type {{id:string|null, dest:{x:number,y:number}|null}|null} */
      this.move = null;
      /** @type {boolean} */
      this.help = false;
      /** @type {boolean} */
      this.armSkip = false;
      /** @type {string} */
      this.note = '';
      /** @type {string} */
      this.toast = '';
      /** @type {string|null} */
      this.selectedId = null;
      /** @type {number|null} */
      this.draftSeed = null;
      /** @type {boolean} */
      this._savedEnding = false;
      this._codexKey = 'aozora-codex-v1';
      var self = this;
      this.root.addEventListener('click', function (event) {
        self._onClick(event);
      });
      this.root.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') {
          return;
        }
        var target = event.target;
        if (target instanceof HTMLInputElement && target.id === 'seed-input') {
          event.preventDefault();
          self._captureSeed();
          self._start();
        }
      });
    }

    /**
     * @returns {void}
     */
    render() {
      this._maybeSaveEnding();
      if (!this.game || this.game.phase === 'title') {
        this.root.innerHTML = this._titleHtml() + (this.help ? this._helpHtml() : '');
        return;
      }
      var report = this._currentReport();
      this.root.innerHTML =
        '<div class="app-shell">' +
        this._topbarHtml() +
        this._ladyHtml() +
        (this.note ? '<p class="note">' + esc(this.note) + '</p>' : '') +
        (this.toast ? '<p class="toast">' + esc(this.toast) + '</p>' : '') +
        '<main class="stage">' + this._stageHtml(report) + '</main>' +
        this._dockHtml(report) +
        '</div>' +
        (this.help ? this._helpHtml() : '');
    }

    /**
     * @param {Event} event
     * @returns {void}
     */
    _onClick(event) {
      var target = event.target;
      if (!target || !target.closest) {
        return;
      }
      var node = target.closest('[data-action]');
      if (!node || node.hasAttribute('disabled')) {
        return;
      }
      var action = node.getAttribute('data-action') || '';
      if (action === 'noop') {
        return;
      }
      this._captureSeed();
      this.toast = '';
      if (action === 'help') {
        this.help = true;
        this.render();
        return;
      }
      if (action === 'help-close') {
        this.help = false;
        this.render();
        return;
      }
      if (action === 'start') {
        this._start();
        return;
      }
      if (!this.game) {
        return;
      }
      if (action === 'draft') {
        this._after(this.game.chooseApplicant(node.getAttribute('data-id') || ''));
        this.ghost = null;
        this.move = null;
        this.armSkip = false;
        this.render();
        return;
      }
      if (action === 'arm-skip') {
        this.armSkip = !this.armSkip;
        this.render();
        return;
      }
      if (action === 'skip-draft') {
        this._after(this.game.skipDraft());
        this.armSkip = false;
        this.render();
        return;
      }
      if (action === 'cell') {
        this._onCell(Number(node.getAttribute('data-x')), Number(node.getAttribute('data-y')));
        return;
      }
      if (action === 'commit-place') {
        this._commitPlace();
        return;
      }
      if (action === 'cancel-ghost') {
        this.ghost = null;
        this.render();
        return;
      }
      if (action === 'move-start') {
        this.move = { id: null, dest: null };
        this.ghost = null;
        this.note = '動かす人を選んでください。';
        this.render();
        return;
      }
      if (action === 'move-cancel') {
        this.move = null;
        this.note = '';
        this.render();
        return;
      }
      if (action === 'commit-move') {
        if (!this.move || !this.move.id || !this.move.dest) {
          return;
        }
        this._after(this.game.moveResident(this.move.id, this.move.dest.x, this.move.dest.y));
        this.move = null;
        this.render();
        return;
      }
      if (action === 'confirm-week') {
        var confirmed = this.game.confirmWeek();
        this._after(confirmed);
        if (confirmed.ok) {
          this.ghost = null;
          this.move = null;
          this.armSkip = false;
        }
        this.render();
        return;
      }
      if (action === 'ack-resolve') {
        this._after(this.game.ackResolve());
        this.render();
        return;
      }
      if (action === 'ack-graduate') {
        this._after(this.game.ackGraduate());
        this._writeCodex({ souvenirs: this.game.souvenirs });
        this.render();
        return;
      }
      if (action === 'shop') {
        this._after(this.game.chooseShop(Number(node.getAttribute('data-index'))));
        this.render();
        return;
      }
      if (action === 'shop-skip') {
        this._after(this.game.chooseShop(-1));
        this.render();
        return;
      }
      if (action === 'copy-log') {
        this._copyLog();
        return;
      }
      if (action === 'retry-same') {
        this._restart(this.game.seed);
        return;
      }
      if (action === 'retry-new') {
        this._restart(Math.floor(Math.random() * 999999) + 1);
        return;
      }
      if (action === 'title') {
        this.game = null;
        this.help = false;
        this._savedEnding = false;
        this.render();
      }
    }

    /**
     * @returns {void}
     */
    _start() {
      var seed = this.draftSeed || 1;
      this._restart(seed);
    }

    /**
     * @param {number} seed
     * @returns {void}
     */
    _restart(seed) {
      var next = Math.floor(Number(seed));
      if (!Number.isFinite(next) || next < 1) {
        next = 1;
      }
      next = next % 1000000000;
      this.draftSeed = next;
      this.game = new Aozora.Game(next);
      this.game.begin();
      this.ghost = null;
      this.move = null;
      this.armSkip = false;
      this.note = '';
      this.toast = '';
      this.selectedId = null;
      this.help = false;
      this._savedEnding = false;
      this._writeCodex({ run: true });
      try {
        var url = new URL(location.href);
        url.searchParams.set('seed', String(next));
        history.replaceState(null, '', url.pathname + url.search);
      } catch (err) {
        /* ファイルを直接開いた環境では、アドレスを書き換えなくても遊べる */
      }
      this.render();
    }

    /**
     * @param {{ok:boolean, reason?:string}} result
     * @returns {void}
     */
    _after(result) {
      if (!result.ok) {
        this.note = result.reason || 'うまくいきませんでした';
        return;
      }
      this.note = '';
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {void}
     */
    _onCell(x, y) {
      var g = this.game;
      if (!g || g.phase !== 'place') {
        return;
      }
      var occ = g.occupantAt(x, y);
      if (this.move) {
        if (!this.move.id) {
          if (!occ) {
            this.note = '動かす人を選んでください。';
          } else if (occ.id === g.newcomerId) {
            this.note = '今週来た人は、空き部屋を押せば無料で置き直せます。';
          } else {
            this.move.id = occ.id;
            this.move.dest = null;
            this.note = '';
          }
          this.render();
          return;
        }
        if (!occ) {
          this.move.dest = { x: x, y: y };
          this.note = '';
          this.render();
          return;
        }
        if (occ.id !== g.newcomerId) {
          this.move.id = occ.id;
          this.move.dest = null;
        }
        this.render();
        return;
      }
      if (occ) {
        this.selectedId = occ.id;
        this.note = '';
        this.render();
        return;
      }
      if (g.pendingId || g.newcomerId) {
        this.ghost = { x: x, y: y };
        this.note = '';
        this.render();
        return;
      }
      this.note = '置く人はいません。';
      this.render();
    }

    /**
     * @returns {void}
     */
    _commitPlace() {
      var g = this.game;
      if (!g || !this.ghost) {
        return;
      }
      /** @type {{ok:boolean, reason?:string}} */
      var result;
      if (g.pendingId) {
        result = g.placeNewcomer(this.ghost.x, this.ghost.y);
      } else {
        result = g.moveNewcomer(this.ghost.x, this.ghost.y);
      }
      this._after(result);
      if (result.ok) {
        this.ghost = null;
      }
      this.render();
    }

    /**
     * @returns {object|null}
     */
    _currentReport() {
      var g = this.game;
      if (!g) {
        return null;
      }
      if (g.phase === 'resolve') {
        return g.lastReport;
      }
      if (g.phase === 'graduate' || g.phase === 'shop' || g.phase === 'ending' || g.phase === 'title') {
        return g.lastReport;
      }
      /** @type {object} */
      var spec = {};
      if (this.move && this.move.id && this.move.dest) {
        spec.ghostMove = { id: this.move.id, x: this.move.dest.x, y: this.move.dest.y };
      } else if (this.ghost && g.pendingId) {
        spec.ghostPlace = { x: this.ghost.x, y: this.ghost.y };
      } else if (this.ghost && g.newcomerId) {
        spec.ghostMove = { id: g.newcomerId, x: this.ghost.x, y: this.ghost.y };
      }
      if (g.phase === 'draft' && this.armSkip) {
        spec.extraRent = 1;
      }
      try {
        return g.preview(spec);
      } catch (err) {
        return null;
      }
    }

    /**
     * @returns {string}
     */
    _titleHtml() {
      var seed = this._initialSeed();
      var codex = this._readCodex();
      var souvNames = [];
      var ids = Object.keys(codex.souvenirs || {});
      var i;
      for (i = 0; i < ids.length; i++) {
        var def = Aozora.data.souvenirById(ids[i]);
        if (def) {
          souvNames.push(def.name);
        }
      }
      var codexHtml = souvNames.length
        ? '<p class="codex">このブラウザで見た置き土産: ' + esc(souvNames.join('、')) + '</p>'
        : '<p class="codex">置き土産は、まだこのブラウザの記憶にありません。</p>';
      return (
        '<div class="title-screen"><section class="hero">' +
        '<p class="eyebrow">下宿屋の点数パズル</p>' +
        '<h1>あおぞら荘の入居審査</h1>' +
        '<p class="lead">癖のある人を、うまく隣り合わせる。暮らし点がノルマに届くか、鍵を渡す前に予測できます。</p>' +
        '<div class="seed-row"><label>種（同じ数字なら、同じ順番）<input id="seed-input" type="number" min="1" step="1" value="' +
        String(seed) +
        '"></label></div>' +
        '<div class="title-actions">' +
        '<button type="button" class="primary" data-action="start">審査をはじめる</button>' +
        '<button type="button" data-action="help">遊び方</button>' +
        '</div>' +
        codexHtml +
        '<p class="hint">1ランは春夏秋冬、各3週。第1季の並びは見本です。第2季から、種で顔ぶれが変わります。</p>' +
        '</section></div>'
      );
    }

    /**
     * @returns {number}
     */
    _initialSeed() {
      if (this.draftSeed) {
        return this.draftSeed;
      }
      var fromUrl = NaN;
      try {
        fromUrl = Number(new URLSearchParams(location.search).get('seed'));
      } catch (err) {
        fromUrl = NaN;
      }
      if (Number.isFinite(fromUrl) && fromUrl >= 1) {
        this.draftSeed = Math.floor(fromUrl);
      } else {
        this.draftSeed = Math.floor(Math.random() * 999999) + 1;
      }
      return this.draftSeed;
    }

    /**
     * @returns {void}
     */
    _captureSeed() {
      var input = this.root.querySelector('#seed-input');
      if (input instanceof HTMLInputElement && input.value) {
        var n = Number(input.value);
        if (Number.isFinite(n) && n >= 1) {
          this.draftSeed = Math.floor(n);
        }
      }
    }

    /**
     * @returns {string}
     */
    _topbarHtml() {
      var g = this.game;
      var rules = g.houseRuleIds.map(function (id) {
        var rule = Aozora.data.houseRuleById(id);
        return rule ? rule.name : id;
      });
      var souv = [];
      var keys = Object.keys(g.souvenirs);
      var i;
      for (i = 0; i < keys.length; i++) {
        var def = Aozora.data.souvenirById(keys[i]);
        if (def) {
          souv.push(def.name + (g.souvenirs[keys[i]] > 1 ? 'Lv' + g.souvenirs[keys[i]] : ''));
        }
      }
      return (
        '<header class="topbar">' +
        '<div><p class="eyebrow">種 ' + String(g.seed) + ' ・ 全12週</p>' +
        '<h1>' + esc(g.seasonName()) + ' 第' + String(g.weekInSeason()) + '週</h1></div>' +
        '<dl class="stats"><div><dt>家賃</dt><dd>+' + String(g.rent) + '</dd></div>' +
        '<div><dt>審査</dt><dd class="stamps">' + this._stampsHtml() + '</dd></div></dl>' +
        '<button type="button" data-action="help">遊び方</button>' +
        '</header>' +
        '<p class="meta">家訓: ' + esc(rules.length ? rules.join('・') : 'なし') +
        ' ／ 置き土産: ' + esc(souv.length ? souv.join('・') : 'なし') + '</p>'
      );
    }

    /**
     * @returns {string}
     */
    _stampsHtml() {
      var n = this.game.strikes;
      return '<span class="' + (n > 0 ? 'on' : 'off') + '">' + String(n) + '/2</span>';
    }

    /**
     * @returns {string}
     */
    _ladyHtml() {
      var g = this.game;
      var text = 'あおぞら荘へ、ようこそ。';
      if (g.phase === 'draft') {
        text = g.week <= 3
          ? '第1季は見本の並びです。三人の癖を読んで、ひとりに鍵を渡すか、今週は家賃だけいただくか。'
          : '今週の玄関に、三人が立っています。ひとりを選ぶか、家賃だけいただくか。';
      } else if (g.phase === 'place') {
        text = '部屋を押すと、予測の点と、なぜその点なのかが見えます。納得してから鍵を渡してくださいね。';
        if (g.week % 3 === 0) {
          text = '今季の最後の週です。満足がいちばん高い人が、このあと旅立ちます。予測の順位を見てから決めてください。';
        }
      } else if (g.phase === 'resolve' && g.lastReport) {
        text = g.lastReport.pass
          ? '暮らしは、今週も息をしていました。'
          : 'ノルマには、あと少し届きませんでした。判子は急がず、でも確かに増えます。';
      } else if (g.phase === 'graduate') {
        text = g.graduateId
          ? '満たされた人から、空へ出ていきます。残るルールが、置き土産です。'
          : '誰もいない季節は、風が通っただけでした。';
      } else if (g.phase === 'shop') {
        text = '季節のあいだに、家訓か増築を、ひとつだけ手に入れられます。何もしないのも、選択です。';
      } else if (g.phase === 'ending') {
        text = g.ending === 'fail'
          ? '今回は見送りです。あなたのせいにしすぎないでください。'
          : '四季が回りました。大家会議は、静かに頷いています。';
      }
      return '<p class="lady"><span class="eyebrow">女将</span><br>' + esc(text) + '</p>';
    }

    /**
     * @param {object|null} report
     * @returns {string}
     */
    _stageHtml(report) {
      var g = this.game;
      if (g.phase === 'draft') {
        return this._draftHtml();
      }
      if (g.phase === 'place') {
        var banner = '';
        if (g.pendingId) {
          var pending = Aozora.data.tenantById(g.pendingId);
          banner = '<p class="hint">鍵を渡す人: ' + pending.icon + ' ' + esc(pending.name) + '</p>';
        } else if (g.newcomerId) {
          var arrived = Aozora.data.tenantById(g.newcomerId);
          banner = '<p class="hint">今週の入居: ' + arrived.icon + ' ' + esc(arrived.name) + '。空き部屋を押すと、無料で置き直せます。</p>';
        }
        return (
          '<p class="compass">↑ 北が上の階。隣は上下左右だけ。ななめは隣ではありません。角・辺・中は、増築しても変わりません。</p>' +
          banner +
          '<div class="stage-grid"><div class="board-wrap">' + this._boardHtml() + '</div>' +
          '<div class="report-wrap">' + this._reportHtml(report, true) + '</div></div>'
        );
      }
      if (g.phase === 'resolve') {
        return this._reportHtml(report, false);
      }
      if (g.phase === 'graduate') {
        return this._graduateHtml();
      }
      if (g.phase === 'shop') {
        return this._shopHtml();
      }
      if (g.phase === 'ending') {
        return this._endingHtml();
      }
      return '';
    }

    /**
     * @returns {string}
     */
    _draftHtml() {
      var g = this.game;
      var html = '<section class="cards">';
      if (!g.offers.length) {
        html += '<p class="hint">空き部屋がありません。今週は見送りだけです。</p>';
      }
      var i;
      for (i = 0; i < g.offers.length; i++) {
        var tenant = Aozora.data.tenantById(g.offers[i]);
        var souv = Aozora.data.souvenirById(tenant.souvenirId);
        html += '<button type="button" class="card" data-action="draft" data-id="' + esc(tenant.id) + '">';
        html += '<span class="icon">' + tenant.icon + '</span>';
        html += '<span class="card-name">' + esc(tenant.name) + '</span>';
        html += '<span class="tags">';
        var t;
        for (t = 0; t < tenant.tags.length; t++) {
          html += '<span class="tag">' + esc(tenant.tags[t]) + '</span>';
        }
        html += '</span>';
        html += '<span class="quirk">' + esc(tenant.quirk) + '</span><ul>';
        var r;
        for (r = 0; r < tenant.rules.length; r++) {
          html += '<li>' + esc(tenant.rules[r].text) + '</li>';
        }
        html += '</ul><span class="souv">卒業すると「' + esc(souv.name) + '」</span></button>';
      }
      html += '</section>';
      if (this.armSkip) {
        html += '<p class="hint">見送りにすると家賃が +1 され、毎週の暮らし点に、倍率の外で足されます。今週だけでなく、この先も残ります。</p>';
      }
      return html;
    }

    /**
     * @returns {string}
     */
    _boardHtml() {
      var g = this.game;
      var minX = 99;
      var minY = 99;
      var maxX = -99;
      var maxY = -99;
      var i;
      for (i = 0; i < g.rooms.length; i++) {
        minX = Math.min(minX, g.rooms[i].x);
        minY = Math.min(minY, g.rooms[i].y);
        maxX = Math.max(maxX, g.rooms[i].x);
        maxY = Math.max(maxY, g.rooms[i].y);
      }
      var cols = maxX - minX + 1;
      var rows = maxY - minY + 1;
      var html = '<div class="board" style="grid-template-columns:repeat(' + cols + ',minmax(72px,1fr));grid-template-rows:repeat(' + rows + ',minmax(84px,auto))">';
      for (i = 0; i < g.rooms.length; i++) {
        var room = g.rooms[i];
        var occ = g.occupantAt(room.x, room.y);
        var tenant = occ ? Aozora.data.tenantById(occ.id) : null;
        var isGhost = this.ghost && this.ghost.x === room.x && this.ghost.y === room.y;
        var isMoveDest = this.move && this.move.dest && this.move.dest.x === room.x && this.move.dest.y === room.y;
        var isMoveWho = !!(this.move && this.move.id && occ && this.move.id === occ.id);
        var leavingNew = !!(occ && this.ghost && g.newcomerId === occ.id && (this.ghost.x !== occ.x || this.ghost.y !== occ.y));
        var leavingMove = !!(occ && this.move && this.move.id === occ.id && this.move.dest);
        var cls = 'room kind-' + room.kind;
        if (isGhost || isMoveDest) {
          cls += ' is-ghost';
        }
        if (isMoveWho) {
          cls += ' is-selected';
        }
        if (leavingNew || leavingMove) {
          cls += ' is-leaving';
        }
        html += '<button type="button" class="' + cls + '" data-action="cell" data-x="' + room.x + '" data-y="' + room.y + '" style="grid-column:' + (room.x - minX + 1) + ';grid-row:' + (room.y - minY + 1) + '">';
        html += '<span class="room-label">' + esc(room.label) + '</span>';
        /** @type {object|null} */
        var shown = null;
        if (isGhost && g.pendingId) {
          shown = Aozora.data.tenantById(g.pendingId);
        } else if (isGhost && g.newcomerId) {
          shown = Aozora.data.tenantById(g.newcomerId);
        } else if (isMoveDest && this.move && this.move.id) {
          shown = Aozora.data.tenantById(this.move.id);
        } else if (tenant && !leavingNew) {
          shown = tenant;
        }
        if (shown) {
          html += '<span class="icon">' + shown.icon + '</span><span class="who">' + esc(shown.name) + '</span>';
        } else if (!occ || leavingNew) {
          html += '<span class="icon faint">＋</span><span class="who">空室</span>';
        }
        html += '</button>';
      }
      html += '</div>';
      return html;
    }

    /**
     * @param {object|null} report
     * @param {boolean} hypothetical
     * @returns {string}
     */
    _reportHtml(report, hypothetical) {
      if (!report) {
        return '<section class="report"><p class="hint">部屋を選ぶと、予測がここに出ます。</p></section>';
      }
      var passClass = report.pass ? 'pass' : 'fail';
      var html = '<section class="report ' + passClass + '">';
      html += '<header class="report-head"><div><p class="eyebrow">' + (hypothetical ? '予測の暮らし点' : '今週の暮らし点') + '</p><p class="big">' + fmt(report.total) + '</p></div>';
      html += '<div><p class="eyebrow">今週のノルマ</p><p class="big">' + fmt(report.quota) + '</p></div>';
      html += '<p class="verdict ' + passClass + '">' + (report.pass ? '届きそうです' : 'このままだと未達です') + '</p></header>';
      if (hypothetical && this.ghost) {
        html += '<p class="hint">この数字は仮置きです。下の「この部屋に決める」で盤に残ります。</p>';
      }
      var i;
      for (i = 0; i < report.tenants.length; i++) {
        var ts = report.tenants[i];
        html += '<article class="tenant-score"><h3>' + ts.icon + ' ' + esc(ts.name);
        html += ' <span class="room-tag">' + esc(ts.roomLabel) + '</span> <b>' + fmt(ts.personal) + '</b></h3>';
        if (ts.sumMul) {
          html += '<p class="formula">' + fmt(ts.sumAdd) + ' × ' + fmt(1 + ts.sumMul) + ' = ' + fmt(ts.personal) + '</p>';
        }
        html += '<ul>';
        var j;
        var dormant = [];
        for (j = 0; j < ts.lines.length; j++) {
          var line = ts.lines[j];
          if (!line.fired) {
            dormant.push(line);
            continue;
          }
          var cls = line.kind === 'mul' ? 'mul' : (line.amount < 0 ? 'neg' : 'pos');
          var amount = line.kind === 'mul' ? '倍率+' + fmt(line.amount) : signed(line.amount);
          html += '<li class="' + cls + '">' + esc(line.text) + ' <b>' + amount + '</b></li>';
        }
        html += '</ul>';
        if (dormant.length) {
          html += '<details><summary>まだ出ていない癖</summary><ul class="dormant">';
          for (j = 0; j < dormant.length; j++) {
            html += '<li>' + esc(dormant[j].text) + '</li>';
          }
          html += '</ul></details>';
        }
        html += '</article>';
      }
      if (report.houseLines.length) {
        html += '<article class="tenant-score"><h3>荘のほう</h3><ul>';
        for (i = 0; i < report.houseLines.length; i++) {
          var houseLine = report.houseLines[i];
          if (houseLine.kind === 'mul') {
            html += '<li class="mul">' + esc(houseLine.text) + ' <b>×' + fmt(houseLine.amount) + '</b></li>';
          } else {
            html += '<li class="' + (houseLine.amount < 0 ? 'neg' : 'pos') + '">' + esc(houseLine.text) + ' <b>' + signed(houseLine.amount) + '</b></li>';
          }
        }
        html += '</ul></article>';
      }
      html += '<p class="formula">(' + fmt(report.subtotal) + ' + ' + fmt(report.houseAdd) + ') × ' + fmt(report.multiplier) +
        ' + 家賃 ' + fmt(report.rent) + ' − 引越し ' + fmt(report.moveCost) + ' = <b>' + fmt(report.total) + '</b></p>';
      html += this._rankingHtml(report, hypothetical);
      html += '</section>';
      return html;
    }

    /**
     * @param {object|null} report
     * @param {boolean} hypothetical
     * @returns {string}
     */
    _rankingHtml(report, hypothetical) {
      var g = this.game;
      var rows = g.ranking(hypothetical ? report : null);
      if (!rows.length) {
        return '<section class="ranking"><h3>今季の満足</h3><p class="hint">まだ誰もいません。</p></section>';
      }
      var seasonEnd = g.week % 3 === 0 && (g.phase === 'place' || g.phase === 'resolve' || g.phase === 'graduate');
      var html = '<section class="ranking"><h3>' + (seasonEnd ? '今季の満足（いちばん上が旅立つ）' : '今季の満足') + '</h3>';
      if (!seasonEnd) {
        html += '<p class="hint">旅立ちは、季節の最後の週です。</p>';
      }
      html += '<ol>';
      var i;
      for (i = 0; i < rows.length; i++) {
        var leaving = g.phase === 'graduate' && rows[i].id === g.graduateId;
        html += '<li class="' + (leaving || i === 0 ? 'top' : '') + '">' + rows[i].icon + ' ' + esc(rows[i].name) + ' ' + fmt(rows[i].value) + '</li>';
      }
      html += '</ol></section>';
      return html;
    }

    /**
     * @returns {string}
     */
    _graduateHtml() {
      var g = this.game;
      var html = '<section class="panel">';
      if (!g.graduateId) {
        html += '<h2>静かな季節の終わり</h2><p>住人がいないので、置き土産もありません。</p></section>';
        return html;
      }
      var tenant = Aozora.data.tenantById(g.graduateId);
      var souv = Aozora.data.souvenirById(tenant.souvenirId);
      var level = (g.souvenirs[souv.id] || 0) + 1;
      html += '<p class="eyebrow">卒業</p><h2>' + tenant.icon + ' ' + esc(tenant.name) + '</h2>';
      html += '<p>' + esc(tenant.souvenirNote) + '</p>';
      html += '<p><b>置き土産「' + esc(souv.name) + '」</b>';
      if (level > 1) {
        html += ' Lv' + String(Math.min(3, level));
      }
      html += '<br>' + esc(souv.desc) + '</p>';
      html += this._rankingHtml(null, false);
      html += '</section>';
      return html;
    }

    /**
     * @returns {string}
     */
    _shopHtml() {
      var g = this.game;
      var html = '<section class="shop-list">';
      if (!g.shopOffers.length) {
        html += '<p class="hint">もう置いてある品がありません。このまま次の季節へ進めます。</p>';
      }
      var i;
      for (i = 0; i < g.shopOffers.length; i++) {
        var offer = g.shopOffers[i];
        var hypo = g.previewShop(i);
        var delta = '今はまだ眠っています';
        if (offer.type === 'expand') {
          delta = '人が入るまで、点数そのものは変わりません。作業タグが来ると大きくなります。';
        } else if (hypo && hypo.delta > 0) {
          delta = '今の荘なら ' + signed(hypo.delta);
        }
        html += '<button type="button" class="shop-card" data-action="shop" data-index="' + String(i) + '">';
        html += '<strong>' + esc(offer.name) + '</strong>';
        html += '<span>' + esc(offer.desc) + '</span>';
        html += '<span class="delta">' + esc(delta) + '</span></button>';
      }
      html += '</section>';
      return html;
    }

    /**
     * @returns {string}
     */
    _endingHtml() {
      var g = this.game;
      var title = '条件つきの合格';
      var body = '最後の週はノルマにあと少し届きませんでした。それでも四季は見届けることができました。';
      if (g.ending === 'clear') {
        title = '合格';
        body = '四つの季節を、この荘で過ごしました。大家会議は、この暮らしを認めます。';
      } else if (g.ending === 'fail') {
        title = '審査落ち';
        body = '大家会議は、まだこの荘の暮らしを認めきれませんでした。判子は二つ。今回は見送りです。茶菓子は、また次の種までしまっておきましょう。';
      }
      var grads = g.log.filter(function (e) { return e.type === 'graduate'; });
      var gradText = 'なし';
      if (grads.length) {
        gradText = grads.map(function (e) {
          var tenant = Aozora.data.tenantById(e.id);
          var souv = Aozora.data.souvenirById(e.souvenirId);
          return tenant.name + '（' + souv.name + '）';
        }).join('、');
      }
      return (
        '<section class="panel ending"><p class="eyebrow">結果</p><h2>' + esc(title) + '</h2><p>' + esc(body) + '</p>' +
        '<p>種 ' + String(g.seed) + ' ／ 到達した週 ' + String(g.week) + ' ／ 未達 ' + String(g.strikes) + '</p>' +
        '<p>卒業: ' + esc(gradText) + '</p>' +
        '<div class="title-actions">' +
        '<button type="button" class="primary" data-action="retry-same">同じ種でもう一度</button>' +
        '<button type="button" data-action="retry-new">あたらしい種</button>' +
        '<button type="button" data-action="title">表紙へ</button>' +
        '<button type="button" data-action="copy-log">記録をコピー</button>' +
        '</div>' +
        '<details><summary>バランス用の記録</summary><pre class="log">' + esc(JSON.stringify(g.exportLog(), null, 2)) + '</pre></details>' +
        '</section>'
      );
    }

    /**
     * @param {object|null} report
     * @returns {string}
     */
    _dockHtml(report) {
      var g = this.game;
      if (g.phase === 'ending') {
        return '';
      }
      var buttons = '';
      var hint = '';
      if (g.phase === 'draft') {
        if (!this.armSkip) {
          buttons += '<button type="button" data-action="arm-skip">見送って家賃+1</button>';
        } else {
          buttons += '<button type="button" class="primary" data-action="skip-draft">家賃をもらう</button>';
          buttons += '<button type="button" data-action="arm-skip">やっぱり選ぶ</button>';
        }
        hint = 'いま住んでいる人だけで週末を迎えた場合の点です。';
      } else if (g.phase === 'place') {
        if (this.ghost && (g.pendingId || g.newcomerId)) {
          var label = g.pendingId ? 'この部屋に決める' : 'この部屋へ移す';
          buttons += '<button type="button" class="primary" data-action="commit-place">' + label + '</button>';
          buttons += '<button type="button" data-action="cancel-ghost">やめる</button>';
          hint = '予測は仮置きです。決めると盤に残ります。';
        }
        var veterans = false;
        var i;
        for (i = 0; i < g.occupants.length; i++) {
          if (g.occupants[i].id !== g.newcomerId) {
            veterans = true;
          }
        }
        if (!this.move && veterans && !g.movedThisWeek) {
          buttons += '<button type="button" data-action="move-start">引越し（-2）</button>';
        } else if (g.movedThisWeek) {
          buttons += '<button type="button" disabled>今週の引越しは済み</button>';
        }
        if (this.move) {
          if (this.move.id && this.move.dest) {
            buttons += '<button type="button" class="primary" data-action="commit-move">引越しを確定</button>';
          }
          buttons += '<button type="button" data-action="move-cancel">引越しをやめる</button>';
          if (!this.move.dest) {
            hint = '空室を押すと、引越し後の予測が出ます。';
          }
        }
        var canEnd = !g.pendingId && !this.ghost && !this.move;
        buttons += '<button type="button" class="primary" data-action="confirm-week"' + (canEnd ? '' : ' disabled') + '>この配置で週末へ</button>';
        if (g.pendingId && !this.ghost) {
          hint = '空き部屋を押すと、置いたあとの点が見えます。';
        }
      } else if (g.phase === 'resolve') {
        var nextLabel = '次の週へ';
        if (g.strikes >= 2) {
          nextLabel = '審査の結果へ';
        } else if (g.week % 3 === 0) {
          nextLabel = '卒業を見る';
        }
        buttons += '<button type="button" class="primary" data-action="ack-resolve">' + nextLabel + '</button>';
      } else if (g.phase === 'graduate') {
        buttons += '<button type="button" class="primary" data-action="ack-graduate">' + (g.week >= 12 ? '結果を見る' : '季節の店へ') + '</button>';
      } else if (g.phase === 'shop') {
        buttons += '<button type="button" data-action="shop-skip">何も買わない</button>';
      }
      var score = '予測はまだありません';
      if (g.phase === 'shop' || g.phase === 'graduate') {
        score = '季節の区切り';
      } else if (report) {
        var pill = report.pass ? 'pass' : 'fail';
        var word = report.pass ? '届きそう' : '未達';
        if (g.phase === 'resolve') {
          word = report.pass ? '届きました' : '未達';
        }
        score = (g.phase === 'resolve' ? '暮らし点 ' : '予測 ') + '<b>' + fmt(report.total) + '</b> / ノルマ ' + fmt(report.quota) +
          ' <span class="pill ' + pill + '">' + word + '</span>';
      }
      return '<footer class="dock"><p class="dock-score" aria-live="polite">' + score + '</p>' +
        (hint ? '<p class="hint">' + esc(hint) + '</p>' : '') +
        '<div class="dock-actions">' + buttons + '</div></footer>';
    }

    /**
     * @returns {string}
     */
    _helpHtml() {
      return (
        '<div class="modal" data-action="help-close"><div class="modal-card" data-action="noop">' +
        '<button type="button" data-action="help-close">閉じる</button>' +
        '<h2>遊び方</h2>' +
        '<h3>一週間</h3><p>三人からひとり選ぶか、見送って家賃を +1 します。空き部屋に置き、予測を見てから週末を迎えます。既にいる人は、週に1回だけ -2 で引越しできます。今週来た人の置き直しは無料です。</p>' +
        '<h3>隣・上下・周囲</h3><ul>' +
        '<li>隣は上下左右だけです。ななめは隣ではありません。</li>' +
        '<li>上下が空室は、上と下に人がいないことです。建物の外も空いています。</li>' +
        '<li>隣の空室は、実在する空き部屋だけを数えます。外は数えません。</li>' +
        '<li>周囲は、ななめを含む8方向にいる人です。</li>' +
        '<li>角・辺・中は最初の3×3に固定です。増築の部屋は「増」で、角にはなりません。</li>' +
        '<li>北が上です。料理の煙は、上の階の人に届きます。</li></ul>' +
        '<h3>暮らし点</h3><p>誰でも、暮らしているだけで +1。癖の加算を足して、個人の倍率をかけます。家訓と置き土産の加算を足したあと家の倍率をかけ、最後に家賃を足し、引越しを引きます。内訳は、点の横に必ず出します。</p>' +
        '<h3>ノルマ</h3><p>週ごとに暮らし点の目標があります。届かないと審査の判子がひとつ。二つ溜まると、そのランは審査落ちです。倒産ではなく、今回は見送り、という終わり方です。</p>' +
        '<h3>卒業</h3><p>3週ごとに季節が終わり、今季の満足がいちばん高い人が出ていきます。満足は、その週だけの点ではなく、今季に積もった個人点です。出ていった人は置き土産（恒久のルール）を残し、同じランには戻りません。同点なら、先に住みはじめた人が旅立ちます。</p>' +
        '<h3>店</h3><p>春・夏・秋の終わりに、家訓か増築をひとつ選べます。冬の終わりに店はありません。増築は、人が入るまで点数は増えません。</p>' +
        '<p class="hint">在室の +1 は、住人の癖とは別に、誰にでも付きます。</p>' +
        '</div></div>'
      );
    }

    /**
     * @returns {void}
     */
    _copyLog() {
      if (!this.game) {
        return;
      }
      var text = JSON.stringify(this.game.exportLog(), null, 2);
      var done = function () {};
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {
          fallback();
        });
      } else {
        fallback();
      }
      var self = this;
      function fallback() {
        var area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          /* 選べなかったときは、画面の記録から手でコピーできる */
        }
        area.remove();
      }
      this.toast = '記録をコピーしました。うまくいかないときは、下の記録を選択してください。';
      self.render();
    }

    /**
     * @returns {void}
     */
    _maybeSaveEnding() {
      if (!this.game || this.game.phase !== 'ending' || this._savedEnding) {
        return;
      }
      this._savedEnding = true;
      /** @type {object} */
      var patch = { souvenirs: this.game.souvenirs };
      if (this.game.ending === 'clear' || this.game.ending === 'soft') {
        patch.clear = true;
      }
      this._writeCodex(patch);
    }

    /**
     * @returns {{souvenirs:Record<string, number>, runs:number, clears:number}}
     */
    _readCodex() {
      try {
        var raw = localStorage.getItem(this._codexKey);
        if (!raw) {
          return { souvenirs: {}, runs: 0, clears: 0 };
        }
        var data = JSON.parse(raw);
        return {
          souvenirs: data.souvenirs || {},
          runs: data.runs || 0,
          clears: data.clears || 0
        };
      } catch (err) {
        return { souvenirs: {}, runs: 0, clears: 0 };
      }
    }

    /**
     * @param {{souvenirs?:Record<string, number>, run?:boolean, clear?:boolean}} patch
     * @returns {void}
     */
    _writeCodex(patch) {
      var cur = this._readCodex();
      if (patch.souvenirs) {
        var ids = Object.keys(patch.souvenirs);
        var i;
        for (i = 0; i < ids.length; i++) {
          cur.souvenirs[ids[i]] = Math.max(cur.souvenirs[ids[i]] || 0, patch.souvenirs[ids[i]]);
        }
      }
      if (patch.run) {
        cur.runs += 1;
      }
      if (patch.clear) {
        cur.clears += 1;
      }
      try {
        localStorage.setItem(this._codexKey, JSON.stringify(cur));
      } catch (err) {
        /* 保存できない環境では、図鑑だけ諦める */
      }
    }
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      if (ch === '&') {
        return '&amp;';
      }
      if (ch === '<') {
        return '&lt;';
      }
      if (ch === '>') {
        return '&gt;';
      }
      if (ch === '"') {
        return '&quot;';
      }
      return '&#39;';
    });
  }

  /**
   * @param {number} n
   * @returns {string}
   */
  function fmt(n) {
    return Aozora.num.format(n);
  }

  /**
   * @param {number} n
   * @returns {string}
   */
  function signed(n) {
    return Aozora.num.signed(n);
  }

  var root = globalThis.Aozora || (globalThis.Aozora = {});
  root.View = View;
})();
