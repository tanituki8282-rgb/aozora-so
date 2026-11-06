(function () {
  'use strict';

  /**
   * 1ランの進行。
   * ドラフト、配置、週末判定、卒業、店。画面の描画はしない。
   * 予測点は preview、本番は confirmWeek。両方とも同じ評価器を通す。
   */
  class Game {
    /**
     * @param {number} seed
     */
    constructor(seed) {
      /** @type {number} */
      this.seed = seed >>> 0;
      if (this.seed === 0) {
        this.seed = 1;
      }
      /** @type {Rng} */
      this.rng = new Aozora.Rng(this.seed);
      /** @type {RuleEvaluator} */
      this.evaluator = new Aozora.RuleEvaluator();
      /** @type {number} */
      this.week = 1;
      /** @type {number} */
      this.strikes = 0;
      /** @type {number} */
      this.rent = 0;
      /** @type {string[]} */
      this.houseRuleIds = [];
      /** @type {Record<string, number>} */
      this.souvenirs = {};
      /** @type {{id:string,x:number,y:number,joinedWeek:number,seasonHappiness:number,totalHappiness:number}[]} */
      this.occupants = [];
      /** @type {{id:string,x:number,y:number,kind:string,label:string}[]} */
      this.rooms = Aozora.data.coreRooms().map(function (room) {
        return { id: room.id, x: room.x, y: room.y, kind: room.kind, label: room.label };
      });
      /** @type {string} */
      this.phase = 'title';
      /** @type {string[]} */
      this.offers = [];
      /** @type {string|null} */
      this.pendingId = null;
      /** @type {string|null} */
      this.newcomerId = null;
      /** @type {boolean} */
      this.movedThisWeek = false;
      /** @type {object|null} */
      this.lastReport = null;
      /** @type {string|null} */
      this.graduateId = null;
      /** @type {number} 引き止めた次の週だけ引く点。隣人の癖とは別。 */
      this.lingeringFee = 0;
      /** @type {object[]} */
      this.shopOffers = [];
      /** @type {object[]} */
      this.log = [];
      /** @type {string|null} */
      this.ending = null;
      /** @type {string[]} */
      this.graduated = [];
    }

    /**
     * @returns {{ok:boolean}}
     */
    begin() {
      this.week = 1;
      this.offers = this._rollOffers();
      this.phase = 'draft';
      this.log.push({ type: 'start', seed: this.seed });
      return { ok: true };
    }

    /**
     * @returns {number}
     */
    seasonNumber() {
      return Math.floor((this.week - 1) / 3) + 1;
    }

    /**
     * @returns {number}
     */
    weekInSeason() {
      return ((this.week - 1) % 3) + 1;
    }

    /**
     * @returns {string}
     */
    seasonName() {
      return Aozora.data.seasonNames[this.seasonNumber()] || '';
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {{id:string,x:number,y:number,kind:string,label:string}|null}
     */
    roomAt(x, y) {
      var i;
      for (i = 0; i < this.rooms.length; i++) {
        if (this.rooms[i].x === x && this.rooms[i].y === y) {
          return this.rooms[i];
        }
      }
      return null;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {{id:string,x:number,y:number}|null}
     */
    occupantAt(x, y) {
      var i;
      for (i = 0; i < this.occupants.length; i++) {
        if (this.occupants[i].x === x && this.occupants[i].y === y) {
          return this.occupants[i];
        }
      }
      return null;
    }

    /**
     * @param {string} id
     * @returns {{id:string,x:number,y:number,joinedWeek:number,seasonHappiness:number,totalHappiness:number}|null}
     */
    occupantById(id) {
      var i;
      for (i = 0; i < this.occupants.length; i++) {
        if (this.occupants[i].id === id) {
          return this.occupants[i];
        }
      }
      return null;
    }

    /**
     * @returns {{id:string,x:number,y:number,kind:string,label:string}[]}
     */
    emptyCells() {
      /** @type {{id:string,x:number,y:number,kind:string,label:string}[]} */
      var list = [];
      var i;
      for (i = 0; i < this.rooms.length; i++) {
        if (!this.occupantAt(this.rooms[i].x, this.rooms[i].y)) {
          list.push(this.rooms[i]);
        }
      }
      return list;
    }

    /**
     * 仮の配置で暮らし点を出す。盤は変えない。
     * @param {{
     *   ghostPlace?: {x:number,y:number}|null,
     *   assumePendingId?: string|null,
     *   ghostMove?: {id:string,x:number,y:number}|null,
     *   extraRent?: number
     * }} [spec]
     * @returns {object}
     */
    preview(spec) {
      var request = spec || {};
      /** @type {{id:string,x:number,y:number}[]} */
      var people = [];
      var i;
      for (i = 0; i < this.occupants.length; i++) {
        people.push({
          id: this.occupants[i].id,
          x: this.occupants[i].x,
          y: this.occupants[i].y
        });
      }

      var moveCost = this.movedThisWeek ? 2 : 0;
      if (request.ghostMove) {
        var mover = null;
        for (i = 0; i < people.length; i++) {
          if (people[i].id === request.ghostMove.id) {
            mover = people[i];
            break;
          }
        }
        if (!mover) {
          throw new Error('移動対象がいません');
        }
        for (i = 0; i < people.length; i++) {
          if (people[i] !== mover && people[i].x === request.ghostMove.x && people[i].y === request.ghostMove.y) {
            throw new Error('移動先が塞がっています');
          }
        }
        mover.x = request.ghostMove.x;
        mover.y = request.ghostMove.y;
        // 今週来た人も、ほかの人と同じ引越し費用。
        moveCost = 2;
      }

      var pending = request.assumePendingId || this.pendingId;
      if (pending && request.ghostPlace) {
        for (i = 0; i < people.length; i++) {
          if (people[i].x === request.ghostPlace.x && people[i].y === request.ghostPlace.y) {
            throw new Error('仮置きの部屋が塞がっています');
          }
        }
        people.push({ id: pending, x: request.ghostPlace.x, y: request.ghostPlace.y });
      }

      return this.evaluator.score(people, this.rooms, {
        houseRuleIds: this.houseRuleIds,
        souvenirs: this.souvenirs,
        rent: this.rent + (request.extraRent || 0),
        moveCost: moveCost,
        fee: this.lingeringFee,
        quota: Aozora.data.quotaFor(this.week)
      });
    }

    /**
     * 今季の満足。report を渡すと、その週の個人点を仮に足す。
     * @param {object|null} report
     * @returns {{id:string,name:string,icon:string,value:number}[]}
     */
    ranking(report) {
      /** @type {Record<string, number>} */
      var extra = {};
      if (report) {
        var t;
        for (t = 0; t < report.tenants.length; t++) {
          extra[report.tenants[t].id] = report.tenants[t].personal;
        }
      }
      /** @type {{id:string,name:string,icon:string,value:number}[]} */
      var rows = [];
      /** @type {Record<string, boolean>} */
      var seen = {};
      var i;
      for (i = 0; i < this.occupants.length; i++) {
        var occ = this.occupants[i];
        var tenant = Aozora.data.tenantById(occ.id);
        var add = report ? (extra[occ.id] || 0) : 0;
        rows.push({
          id: occ.id,
          name: tenant.name,
          icon: tenant.icon,
          value: Aozora.num.round2(occ.seasonHappiness + add),
          joinedWeek: occ.joinedWeek
        });
        seen[occ.id] = true;
      }
      if (report) {
        for (i = 0; i < report.tenants.length; i++) {
          var ts = report.tenants[i];
          if (seen[ts.id]) {
            continue;
          }
          rows.push({
            id: ts.id,
            name: ts.name,
            icon: ts.icon,
            value: ts.personal,
            joinedWeek: this.week
          });
        }
      }
      // 卒業の選抜と同じ順。同点なら先に住みはじめた人。
      rows.sort(function (a, b) {
        if (b.value !== a.value) {
          return b.value - a.value;
        }
        if (a.joinedWeek !== b.joinedWeek) {
          return a.joinedWeek - b.joinedWeek;
        }
        if (a.id < b.id) {
          return -1;
        }
        if (a.id > b.id) {
          return 1;
        }
        return 0;
      });
      return rows;
    }

    /**
     * @param {string} id
     * @returns {{ok:boolean, reason?:string}}
     */
    chooseApplicant(id) {
      if (this.phase !== 'draft') {
        return { ok: false, reason: '今は選べません' };
      }
      if (this.offers.indexOf(id) < 0) {
        return { ok: false, reason: 'その人は並んでいません' };
      }
      if (this.emptyCells().length <= 0) {
        return { ok: false, reason: '空き部屋がありません' };
      }
      this.pendingId = id;
      this.phase = 'place';
      this.log.push({ type: 'draft', week: this.week, id: id });
      return { ok: true };
    }

    /**
     * @returns {{ok:boolean, reason?:string}}
     */
    skipDraft() {
      if (this.phase !== 'draft') {
        return { ok: false, reason: '今は見送れません' };
      }
      this.rent += 1;
      this.pendingId = null;
      this.phase = 'place';
      this.log.push({ type: 'skip', week: this.week, rent: this.rent });
      return { ok: true };
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {{ok:boolean, reason?:string}}
     */
    placeNewcomer(x, y) {
      if (!this.pendingId) {
        return { ok: false, reason: 'まだ希望者を選んでいません' };
      }
      if (!this.roomAt(x, y)) {
        return { ok: false, reason: '部屋がありません' };
      }
      if (this.occupantAt(x, y)) {
        return { ok: false, reason: '空き部屋ではありません' };
      }
      this.occupants.push({
        id: this.pendingId,
        x: x,
        y: y,
        joinedWeek: this.week,
        seasonHappiness: 0,
        totalHappiness: 0
      });
      this.newcomerId = this.pendingId;
      this.pendingId = null;
      this.log.push({ type: 'place', week: this.week, id: this.newcomerId, x: x, y: y });
      return { ok: true };
    }

    /**
     * 今週来た人の移動も、週に1回・暮らし点 -2。
     * @param {number} x
     * @param {number} y
     * @returns {{ok:boolean, reason?:string}}
     */
    moveNewcomer(x, y) {
      if (!this.newcomerId) {
        return { ok: false, reason: '今週の新しい入居者はいません' };
      }
      return this.moveResident(this.newcomerId, x, y);
    }

    /**
     * 引越し。今週来た人も含めて、週に1回、暮らし点 -2。
     * @param {string} id
     * @param {number} x
     * @param {number} y
     * @returns {{ok:boolean, reason?:string}}
     */
    moveResident(id, x, y) {
      if (this.movedThisWeek) {
        return { ok: false, reason: '今週はもう引越し済みです' };
      }
      var who = this.occupantById(id);
      if (!who) {
        return { ok: false, reason: 'その人はいません' };
      }
      if (!this.roomAt(x, y)) {
        return { ok: false, reason: '部屋がありません' };
      }
      var blocking = this.occupantAt(x, y);
      if (blocking && blocking.id !== id) {
        return { ok: false, reason: '空き部屋ではありません' };
      }
      who.x = x;
      who.y = y;
      this.movedThisWeek = true;
      this.log.push({ type: 'move', week: this.week, id: id, x: x, y: y });
      return { ok: true };
    }

    /**
     * @returns {{ok:boolean, reason?:string, report?:object}}
     */
    confirmWeek() {
      if (this.phase !== 'place') {
        return { ok: false, reason: '今は週末にできません' };
      }
      if (this.pendingId) {
        return { ok: false, reason: '選んだ人の部屋がまだです' };
      }
      var report = this.preview();
      this._applyHappiness(report);
      if (!report.pass) {
        this.strikes += 1;
      }
      this.lastReport = report;
      // 引き止めの未練は、決めた次の週に一度だけ引く。
      this.lingeringFee = 0;
      this.log.push({
        type: 'score',
        week: this.week,
        season: this.seasonNumber(),
        total: report.total,
        quota: report.quota,
        pass: report.pass,
        strikes: this.strikes,
        rent: this.rent,
        moveCost: report.moveCost,
        occupants: this.occupants.map(function (o) {
          return { id: o.id, x: o.x, y: o.y, seasonHappiness: o.seasonHappiness };
        }),
        lines: this._flatLines(report)
      });
      this.phase = 'resolve';
      return { ok: true, report: report };
    }

    /**
     * @returns {{ok:boolean, reason?:string}}
     */
    ackResolve() {
      if (this.phase !== 'resolve') {
        return { ok: false, reason: '今は進めません' };
      }
      // 未達が二度目なら、卒業の前に審査落ち。
      if (this.strikes >= 2) {
        this.ending = 'fail';
        this.phase = 'ending';
        this.log.push({ type: 'ending', ending: 'fail', week: this.week });
        return { ok: true };
      }
      if (this.week % 3 === 0) {
        // 誰が旅立つかは、ここでは決めない。画面で損得を見て選ぶ。
        this.graduateId = null;
        this.phase = 'graduate';
        return { ok: true };
      }
      this._nextWeek();
      return { ok: true };
    }

    /**
     * 誰を送り出すと、置き土産と、残る盤がどうなるか。
     * 残る点は、その人を外して置き土産を足した今の配置。隣人の式は変えない。
     * @returns {{id:string,name:string,icon:string,happiness:number,lastPersonal:number,souvenirId:string,souvenirName:string,souvenirDesc:string,remainScore:number,wantsToLeave:boolean}[]}
     */
    graduationChoices() {
      /** @type {{id:string,name:string,icon:string,happiness:number,lastPersonal:number,souvenirId:string,souvenirName:string,souvenirDesc:string,remainScore:number,wantsToLeave:boolean}[]} */
      var list = [];
      var top = -Infinity;
      var i;
      for (i = 0; i < this.occupants.length; i++) {
        if (this.occupants[i].seasonHappiness > top) {
          top = this.occupants[i].seasonHappiness;
        }
      }
      for (i = 0; i < this.occupants.length; i++) {
        var occ = this.occupants[i];
        var tenant = Aozora.data.tenantById(occ.id);
        var souv = Aozora.data.souvenirById(tenant.souvenirId);
        var lastPersonal = 0;
        if (this.lastReport) {
          var t;
          for (t = 0; t < this.lastReport.tenants.length; t++) {
            if (this.lastReport.tenants[t].id === occ.id) {
              lastPersonal = this.lastReport.tenants[t].personal;
            }
          }
        }
        /** @type {{id:string,x:number,y:number}[]} */
        var staying = [];
        var s;
        for (s = 0; s < this.occupants.length; s++) {
          if (this.occupants[s].id === occ.id) {
            continue;
          }
          staying.push({ id: this.occupants[s].id, x: this.occupants[s].x, y: this.occupants[s].y });
        }
        /** @type {Record<string, number>} */
        var souvenirs = {};
        var key;
        for (key in this.souvenirs) {
          if (Object.prototype.hasOwnProperty.call(this.souvenirs, key)) {
            souvenirs[key] = this.souvenirs[key];
          }
        }
        souvenirs[souv.id] = Math.min(3, (souvenirs[souv.id] || 0) + 1);
        var report = this.evaluator.score(staying, this.rooms, {
          houseRuleIds: this.houseRuleIds,
          souvenirs: souvenirs,
          rent: this.rent,
          moveCost: 0,
          fee: 0,
          quota: 0
        });
        list.push({
          id: occ.id,
          name: tenant.name,
          icon: tenant.icon,
          happiness: occ.seasonHappiness,
          lastPersonal: lastPersonal,
          souvenirId: souv.id,
          souvenirName: souv.name,
          souvenirDesc: souv.desc,
          remainScore: report.total,
          wantsToLeave: occ.seasonHappiness === top
        });
      }
      list.sort(function (a, b) {
        if (b.happiness !== a.happiness) {
          return b.happiness - a.happiness;
        }
        if (a.id < b.id) {
          return -1;
        }
        if (a.id > b.id) {
          return 1;
        }
        return 0;
      });
      return list;
    }

    /**
     * 住人がいない季節の終わりだけ、ここを通す。
     * @returns {{ok:boolean, reason?:string}}
     */
    ackGraduate() {
      if (this.phase !== 'graduate') {
        return { ok: false, reason: '今は卒業の場面ではありません' };
      }
      if (this.occupants.length > 0) {
        return { ok: false, reason: '送り出す人を選んでください' };
      }
      return this._finishSeason();
    }

    /**
     * この人を送り出す。点は失われ、その人の置き土産が残る。
     * @param {string} id
     * @returns {{ok:boolean, reason?:string}}
     */
    chooseGraduate(id) {
      if (this.phase !== 'graduate') {
        return { ok: false, reason: '今は卒業の場面ではありません' };
      }
      var who = this.occupantById(id);
      if (!who) {
        return { ok: false, reason: 'その人はもういません' };
      }
      var tenant = Aozora.data.tenantById(id);
      var sid = tenant.souvenirId;
      var nextLevel = Math.min(3, (this.souvenirs[sid] || 0) + 1);
      this.souvenirs[sid] = nextLevel;
      this.graduateId = id;
      this.graduated.push(id);
      this.log.push({
        type: 'graduate',
        week: this.week,
        id: id,
        souvenirId: sid,
        level: nextLevel
      });
      this.occupants = this.occupants.filter(function (o) {
        return o.id !== id;
      });
      return this._finishSeason();
    }

    /**
     * ひとりだけのとき、残してもらう。置き土産はなく、次の週だけ未練で -3。
     * @returns {{ok:boolean, reason?:string}}
     */
    holdGraduate() {
      if (this.phase !== 'graduate') {
        return { ok: false, reason: '今は卒業の場面ではありません' };
      }
      if (this.occupants.length !== 1) {
        return { ok: false, reason: 'だれかを送り出す季節です' };
      }
      this.graduateId = null;
      this.lingeringFee = 3;
      this.log.push({ type: 'hold', week: this.week, id: this.occupants[0].id, fee: 3 });
      return this._finishSeason();
    }

    /**
     * 季節の満足をしまい、店か結末へ進む。
     * @returns {{ok:boolean}}
     */
    _finishSeason() {
      var i;
      for (i = 0; i < this.occupants.length; i++) {
        this.occupants[i].seasonHappiness = 0;
      }
      if (this.week >= 12) {
        this.ending = this.lastReport && this.lastReport.pass ? 'clear' : 'soft';
        this.phase = 'ending';
        this.log.push({ type: 'ending', ending: this.ending, week: this.week });
        return { ok: true };
      }
      this.shopOffers = this._rollShop();
      this.phase = 'shop';
      return { ok: true };
    }

    /**
     * @param {number} offerIndex  -1 は何も買わない
     * @returns {{ok:boolean, reason?:string}}
     */
    chooseShop(offerIndex) {
      if (this.phase !== 'shop') {
        return { ok: false, reason: '今は店ではありません' };
      }
      /** @type {object|null} */
      var picked = null;
      if (offerIndex >= 0) {
        picked = this.shopOffers[offerIndex] || null;
        if (!picked) {
          return { ok: false, reason: 'その品はありません' };
        }
        if (picked.type === 'rule') {
          if (this.houseRuleIds.indexOf(picked.id) < 0) {
            this.houseRuleIds.push(picked.id);
          }
        } else if (picked.type === 'expand') {
          this.rooms.push({
            id: picked.id,
            x: picked.x,
            y: picked.y,
            kind: 'extra',
            label: picked.label
          });
        }
      }
      this.log.push({ type: 'shop', week: this.week, picked: picked ? picked.id : null });
      this._nextWeek();
      return { ok: true };
    }

    /**
     * 店の品を仮に持ったときの点差。増築は人が入るまで点は動かない。
     * @param {number} index
     * @returns {{now:number, next:number, delta:number}|null}
     */
    previewShop(index) {
      var offer = this.shopOffers[index];
      if (!offer) {
        return null;
      }
      /** @type {string[]} */
      var rules = this.houseRuleIds.slice();
      /** @type {object[]} */
      var rooms = this.rooms.map(function (r) {
        return { id: r.id, x: r.x, y: r.y, kind: r.kind, label: r.label };
      });
      if (offer.type === 'rule') {
        rules.push(offer.id);
      }
      if (offer.type === 'expand') {
        rooms.push({ id: offer.id, x: offer.x, y: offer.y, kind: 'extra', label: offer.label });
      }
      var optsNow = {
        houseRuleIds: this.houseRuleIds,
        souvenirs: this.souvenirs,
        rent: this.rent,
        moveCost: 0,
        quota: Aozora.data.quotaFor(this.week)
      };
      var now = this.evaluator.score(this.occupants, this.rooms, optsNow);
      var hypo = this.evaluator.score(this.occupants, rooms, {
        houseRuleIds: rules,
        souvenirs: this.souvenirs,
        rent: this.rent,
        moveCost: 0,
        quota: Aozora.data.quotaFor(this.week)
      });
      return {
        now: now.total,
        next: hypo.total,
        delta: Aozora.num.round2(hypo.total - now.total)
      };
    }

    /**
     * @returns {object}
     */
    exportLog() {
      return {
        seed: this.seed,
        ending: this.ending,
        week: this.week,
        strikes: this.strikes,
        souvenirs: this.souvenirs,
        houseRuleIds: this.houseRuleIds.slice(),
        events: this.log
      };
    }

    /**
     * @returns {string[]}
     */
    _rollOffers() {
      var fixed = Aozora.data.fixedOffers[this.week];
      if (fixed) {
        return this.rng.shuffle(fixed.slice());
      }
      /** @type {Record<string, boolean>} */
      var living = {};
      /** @type {Record<string, boolean>} */
      var gone = {};
      var i;
      for (i = 0; i < this.occupants.length; i++) {
        living[this.occupants[i].id] = true;
      }
      for (i = 0; i < this.graduated.length; i++) {
        gone[this.graduated[i]] = true;
      }
      /** @type {string[]} */
      var pool = [];
      for (i = 0; i < Aozora.data.tenants.length; i++) {
        var id = Aozora.data.tenants[i].id;
        if (!living[id] && !gone[id]) {
          pool.push(id);
        }
      }
      if (this.emptyCells().length <= 0) {
        return [];
      }
      return this.rng.shuffle(pool).slice(0, 3);
    }

    /**
     * @returns {object[]}
     */
    _rollShop() {
      /** @type {object[]} */
      var offers = [];
      /** @type {string[]} */
      var ruleIds = [];
      var i;
      for (i = 0; i < Aozora.data.houseRules.length; i++) {
        if (this.houseRuleIds.indexOf(Aozora.data.houseRules[i].id) < 0) {
          ruleIds.push(Aozora.data.houseRules[i].id);
        }
      }
      var pickedRules = this.rng.shuffle(ruleIds).slice(0, 2);
      for (i = 0; i < pickedRules.length; i++) {
        var rule = Aozora.data.houseRuleById(pickedRules[i]);
        offers.push({ type: 'rule', id: rule.id, name: rule.name, desc: rule.desc });
      }
      /** @type {Record<string, boolean>} */
      var have = {};
      for (i = 0; i < this.rooms.length; i++) {
        have[this.rooms[i].id] = true;
      }
      /** @type {object[]} */
      var exps = [];
      for (i = 0; i < Aozora.data.expansions.length; i++) {
        if (!have[Aozora.data.expansions[i].id]) {
          exps.push(Aozora.data.expansions[i]);
        }
      }
      var expPick = this.rng.shuffle(exps).slice(0, 1);
      for (i = 0; i < expPick.length; i++) {
        offers.push({
          type: 'expand',
          id: expPick[i].id,
          name: '増築 ' + expPick[i].label,
          desc: expPick[i].desc,
          x: expPick[i].x,
          y: expPick[i].y,
          label: expPick[i].label
        });
      }
      return offers;
    }

    /**
     * @returns {void}
     */
    _nextWeek() {
      this.week += 1;
      this.movedThisWeek = false;
      this.newcomerId = null;
      this.pendingId = null;
      this.offers = this._rollOffers();
      this.phase = 'draft';
    }

    /**
     * @param {object} report
     * @returns {void}
     */
    _applyHappiness(report) {
      var i;
      for (i = 0; i < report.tenants.length; i++) {
        var who = this.occupantById(report.tenants[i].id);
        if (!who) {
          continue;
        }
        who.seasonHappiness = Aozora.num.round2(who.seasonHappiness + report.tenants[i].personal);
        who.totalHappiness = Aozora.num.round2(who.totalHappiness + report.tenants[i].personal);
      }
    }

    /**
     * 満足が高い人。同点なら先に住みはじめた人。それでも同じなら id 順。
     * @returns {object[]}
     */
    _sortedResidents() {
      var list = this.occupants.slice();
      list.sort(function (a, b) {
        if (b.seasonHappiness !== a.seasonHappiness) {
          return b.seasonHappiness - a.seasonHappiness;
        }
        if (a.joinedWeek !== b.joinedWeek) {
          return a.joinedWeek - b.joinedWeek;
        }
        if (a.id < b.id) {
          return -1;
        }
        if (a.id > b.id) {
          return 1;
        }
        return 0;
      });
      return list;
    }

    /**
     * @param {object} report
     * @returns {object[]}
     */
    _flatLines(report) {
      /** @type {object[]} */
      var lines = [];
      var i;
      var j;
      for (i = 0; i < report.tenants.length; i++) {
        var ts = report.tenants[i];
        for (j = 0; j < ts.lines.length; j++) {
          if (!ts.lines[j].fired) {
            continue;
          }
          lines.push({
            who: ts.id,
            text: ts.lines[j].text,
            amount: ts.lines[j].amount,
            kind: ts.lines[j].kind
          });
        }
      }
      for (i = 0; i < report.houseLines.length; i++) {
        lines.push({
          who: 'house',
          text: report.houseLines[i].text,
          amount: report.houseLines[i].amount,
          kind: report.houseLines[i].kind
        });
      }
      lines.push({ who: 'total', text: '暮らし点', amount: report.total, kind: 'total' });
      return lines;
    }
  }

  var root = globalThis.Aozora || (globalThis.Aozora = {});
  root.Game = Game;
})();
