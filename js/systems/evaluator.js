(function () {
  'use strict';

  /**
   * 盤面とルールデータから暮らし点と内訳を作る。
   * 配置前の予測も、週末の本番も、同じ計算を通す。
   *
   * 暮らし点 = (個人の合計 + 家の加算) × 家の倍率 + 家賃 − 引越し
   * 個人点 = (在室1 + 加算の癖) × (1 + 倍率の癖)
   */
  class RuleEvaluator {
    /**
     * @param {{id:string,x:number,y:number}[]} occupants
     * @param {{id:string,x:number,y:number,kind:string,label:string}[]} rooms
     * @param {{houseRuleIds?:string[], souvenirs?:Record<string, number>, rent?:number, moveCost?:number, fee?:number, quota?:number}} options
     * @returns {object}
     */
    score(occupants, rooms, options) {
      this._assertLayout(occupants, rooms);
      var board = new Aozora.Board(rooms, occupants);
      var souvenirs = options.souvenirs || {};
      var houseRuleIds = options.houseRuleIds || [];
      /** @type {object[]} */
      var tenantScores = [];
      var i;
      for (i = 0; i < occupants.length; i++) {
        tenantScores.push(this._scoreTenant(board, occupants[i], souvenirs));
      }

      var subtotal = 0;
      for (i = 0; i < tenantScores.length; i++) {
        subtotal += tenantScores[i].personal;
      }
      subtotal = Aozora.num.round2(subtotal);

      var houseAdd = 0;
      /** @type {object[]} */
      var houseLines = [];
      /** @type {{text:string, value:number}[]} */
      var muls = [];

      // 置き土産の家全体効果を先に足す。個人への注入は _scoreTenant 側。
      var active = this._activeSouvenirs(souvenirs);
      for (i = 0; i < active.length; i++) {
        this._applyLayers(board, active[i].def.layers || [], active[i].level, active[i].def.name, houseLines, muls, function (amount) {
          houseAdd += amount;
        });
      }

      for (i = 0; i < houseRuleIds.length; i++) {
        var rule = Aozora.data.houseRuleById(houseRuleIds[i]);
        if (!rule) {
          continue;
        }
        this._applyLayers(board, rule.layers || [], 1, rule.name, houseLines, muls, function (amount) {
          houseAdd += amount;
        });
        if (rule.halvePenalty) {
          var refund = this._halveRefund(tenantScores, rule);
          if (refund.amount !== 0) {
            houseAdd += refund.amount;
            houseLines.push({
              scope: 'house',
              text: refund.text,
              amount: refund.amount,
              kind: 'add',
              fired: true
            });
          }
        }
      }

      houseAdd = Aozora.num.round2(houseAdd);
      var product = 1;
      for (i = 0; i < muls.length; i++) {
        product = Aozora.num.round2(product * muls[i].value);
        houseLines.push({
          scope: 'house',
          text: muls[i].text,
          amount: muls[i].value,
          kind: 'mul',
          fired: true
        });
      }

      var rent = options.rent || 0;
      var moveCost = options.moveCost || 0;
      var fee = options.fee || 0;
      if (rent) {
        houseLines.push({ scope: 'house', text: '家賃', amount: rent, kind: 'add', fired: true });
      }
      if (moveCost) {
        houseLines.push({ scope: 'house', text: '引越し費用', amount: -moveCost, kind: 'add', fired: true });
      }
      if (fee) {
        houseLines.push({ scope: 'house', text: '引き止めの未練', amount: -fee, kind: 'add', fired: true });
      }

      var beforeMul = Aozora.num.round2(subtotal + houseAdd);
      var afterMul = Aozora.num.round2(beforeMul * product);
      var total = Aozora.num.round2(afterMul + rent - moveCost - fee);
      var quota = options.quota;

      return {
        tenants: tenantScores,
        houseLines: houseLines,
        subtotal: subtotal,
        houseAdd: houseAdd,
        beforeMul: beforeMul,
        multiplier: product,
        afterMul: afterMul,
        rent: rent,
        moveCost: moveCost,
        fee: fee,
        total: total,
        quota: quota,
        pass: total + 1e-9 >= quota
      };
    }

    /**
     * @param {{id:string,x:number,y:number}[]} occupants
     * @param {{x:number,y:number}[]} rooms
     * @returns {void}
     */
    _assertLayout(occupants, rooms) {
      /** @type {Record<string, boolean>} */
      var seen = {};
      var i;
      for (i = 0; i < occupants.length; i++) {
        var key = occupants[i].x + ',' + occupants[i].y;
        if (seen[key]) {
          throw new Error('同じ部屋に二人います');
        }
        seen[key] = true;
        var found = false;
        var r;
        for (r = 0; r < rooms.length; r++) {
          if (rooms[r].x === occupants[i].x && rooms[r].y === occupants[i].y) {
            found = true;
            break;
          }
        }
        if (!found) {
          throw new Error('部屋の外に住人がいます');
        }
      }
    }

    /**
     * @param {Record<string, number>} levels
     * @returns {{def:object, level:number}[]}
     */
    _activeSouvenirs(levels) {
      /** @type {{def:object, level:number}[]} */
      var list = [];
      var all = Aozora.data.souvenirs;
      var i;
      for (i = 0; i < all.length; i++) {
        var level = levels[all[i].id] || 0;
        if (level > 0) {
          list.push({ def: all[i], level: level });
        }
      }
      return list;
    }

    /**
     * @param {string} id
     * @returns {object}
     */
    _tenant(id) {
      var tenant = Aozora.data.tenantById(id);
      if (!tenant) {
        throw new Error('未知の住人です: ' + id);
      }
      return tenant;
    }

    /**
     * @param {string} id
     * @param {string} tag
     * @returns {boolean}
     */
    _hasTag(id, tag) {
      return this._tenant(id).tags.indexOf(tag) >= 0;
    }

    /**
     * @param {string[]} ids
     * @param {string} tag
     * @returns {number}
     */
    _countTag(ids, tag) {
      var n = 0;
      var i;
      for (i = 0; i < ids.length; i++) {
        if (this._hasTag(ids[i], tag)) {
          n += 1;
        }
      }
      return n;
    }

    /**
     * @param {object} board
     * @param {{id:string,x:number,y:number}} occupant
     * @param {object} query
     * @returns {number}
     */
    _query(board, occupant, query) {
      var x = occupant.x;
      var y = occupant.y;
      var room = board.roomAt(x, y);
      var kind = query.kind;
      if (kind === 'always') {
        return 1;
      }
      if (kind === 'houseCount') {
        return board.occupants.length;
      }
      if (kind === 'isCorner') {
        return room && room.kind === 'corner' ? 1 : 0;
      }
      if (kind === 'isEdge') {
        return room && room.kind === 'edge' ? 1 : 0;
      }
      if (kind === 'isCenter') {
        return room && room.kind === 'center' ? 1 : 0;
      }
      if (kind === 'isExtra') {
        return room && room.kind === 'extra' ? 1 : 0;
      }
      if (kind === 'aboveOccupied') {
        return board.occupantAt(x, y - 1) ? 1 : 0;
      }
      if (kind === 'verticalEmpty') {
        var empty = 0;
        if (!board.occupantAt(x, y - 1)) {
          empty += 1;
        }
        if (!board.occupantAt(x, y + 1)) {
          empty += 1;
        }
        return empty;
      }
      if (kind === 'adjacentEmpty') {
        var nEmpty = 0;
        var dirs = Aozora.Board.dir4();
        var d;
        for (d = 0; d < dirs.length; d++) {
          var nx = x + dirs[d][0];
          var ny = y + dirs[d][1];
          if (!board.isRoom(nx, ny)) {
            continue;
          }
          if (!board.occupantAt(nx, ny)) {
            nEmpty += 1;
          }
        }
        return nEmpty;
      }
      if (kind === 'adjacentTag') {
        return this._countTag(board.neighborIds(x, y, Aozora.Board.dir4()), query.tag);
      }
      if (kind === 'aroundTag') {
        return this._countTag(board.neighborIds(x, y, Aozora.Board.dir8()), query.tag);
      }
      if (kind === 'verticalTag') {
        /** @type {string[]} */
        var verticalIds = [];
        var up = board.occupantAt(x, y - 1);
        var down = board.occupantAt(x, y + 1);
        if (up) {
          verticalIds.push(up.id);
        }
        if (down) {
          verticalIds.push(down.id);
        }
        return this._countTag(verticalIds, query.tag);
      }
      if (kind === 'houseTag') {
        var count = 0;
        var i;
        for (i = 0; i < board.occupants.length; i++) {
          if (query.includeSelf === false && board.occupants[i].id === occupant.id) {
            continue;
          }
          if (this._hasTag(board.occupants[i].id, query.tag)) {
            count += 1;
          }
        }
        return count;
      }
      throw new Error('未知の条件です: ' + kind);
    }

    /**
     * 家訓・置き土産の家全体効果。特定の住人の隣は見ない。
     * @param {object} board
     * @param {object} query
     * @returns {number}
     */
    _queryHouse(board, query) {
      if (query.kind === 'always') {
        return 1;
      }
      if (query.kind === 'houseCount') {
        return board.occupants.length;
      }
      if (query.kind === 'houseTag') {
        var n = 0;
        var i;
        for (i = 0; i < board.occupants.length; i++) {
          if (this._hasTag(board.occupants[i].id, query.tag)) {
            n += 1;
          }
        }
        return n;
      }
      throw new Error('家のルールに使えない条件です: ' + query.kind);
    }

    /**
     * @param {number} n
     * @param {string} op
     * @param {number} threshold
     * @returns {boolean}
     */
    _cmp(n, op, threshold) {
      if (op === '>=') {
        return n >= threshold;
      }
      if (op === '<=') {
        return n <= threshold;
      }
      if (op === '>') {
        return n > threshold;
      }
      if (op === '<') {
        return n < threshold;
      }
      if (op === '==') {
        return n === threshold;
      }
      throw new Error('未知の比較です: ' + op);
    }

    /**
     * @param {object} tenant
     * @param {Record<string, number>} souvenirs
     * @returns {object[]}
     */
    _personalRules(tenant, souvenirs) {
      /** @type {object[]} */
      var rules = tenant.rules.slice();
      var active = this._activeSouvenirs(souvenirs);
      var i;
      for (i = 0; i < active.length; i++) {
        var inject = active[i].def.inject || [];
        var j;
        for (j = 0; j < inject.length; j++) {
          var inj = inject[j];
          if (inj.requireSelfTag && tenant.tags.indexOf(inj.requireSelfTag) < 0) {
            continue;
          }
          rules.push({
            id: inj.id || active[i].def.id,
            text: inj.text,
            query: inj.query,
            cmp: inj.cmp,
            threshold: inj.threshold,
            op: inj.op,
            value: inj.value * active[i].level,
            scale: inj.scale,
            about: inj.about || []
          });
        }
      }
      return rules;
    }

    /**
     * @param {Record<string, number>} souvenirs
     * @returns {{about:string, amount:number, name:string}|null}
     */
    _relief(souvenirs) {
      var amount = 0;
      var name = '';
      var about = '';
      var active = this._activeSouvenirs(souvenirs);
      var i;
      for (i = 0; i < active.length; i++) {
        if (!active[i].def.relief) {
          continue;
        }
        amount += active[i].def.relief.amount * active[i].level;
        name = active[i].def.name;
        about = active[i].def.relief.about;
      }
      if (amount <= 0) {
        return null;
      }
      return { about: about, amount: amount, name: name };
    }

    /**
     * @param {object} board
     * @param {{id:string,x:number,y:number}} occupant
     * @param {Record<string, number>} souvenirs
     * @returns {object}
     */
    _scoreTenant(board, occupant, souvenirs) {
      var tenant = this._tenant(occupant.id);
      var rules = this._personalRules(tenant, souvenirs);
      var relief = this._relief(souvenirs);
      /** @type {object[]} */
      var lines = [];
      // 誰がいても、暮らしているだけで1点。内訳に必ず出す。
      var sumAdd = 1;
      lines.push({
        scope: 'tenant',
        tenantId: tenant.id,
        text: '暮らしている',
        amount: 1,
        kind: 'add',
        fired: true,
        about: [],
        count: 1
      });
      var sumMul = 0;
      var i;
      for (i = 0; i < rules.length; i++) {
        var rule = rules[i];
        var n = this._query(board, occupant, rule.query);
        var matched = this._cmp(n, rule.cmp, rule.threshold);
        if (!matched) {
          lines.push({
            scope: 'tenant',
            tenantId: tenant.id,
            text: rule.text,
            amount: 0,
            kind: rule.op === 'mulBonus' ? 'mul' : 'add',
            fired: false,
            about: rule.about || [],
            count: n
          });
          continue;
        }
        if (rule.op === 'mulBonus') {
          sumMul += rule.value;
          lines.push({
            scope: 'tenant',
            tenantId: tenant.id,
            text: rule.text,
            amount: rule.value,
            kind: 'mul',
            fired: true,
            about: rule.about || [],
            count: n
          });
          continue;
        }
        var amount = rule.scale === 'per' ? rule.value * n : rule.value;
        var note = '';
        if (amount < 0 && relief && (rule.about || []).indexOf(relief.about) >= 0) {
          var give = relief.amount * (rule.scale === 'per' ? n : 1);
          var softened = Math.min(0, amount + give);
          if (softened !== amount) {
            note = '（' + relief.name + 'で ' + Aozora.num.signed(amount) + ' → ' + Aozora.num.signed(softened) + '）';
            amount = softened;
          }
        }
        sumAdd += amount;
        var countNote = rule.scale === 'per' ? ' ×' + String(n) : '';
        lines.push({
          scope: 'tenant',
          tenantId: tenant.id,
          text: rule.text + countNote + note,
          amount: amount,
          kind: 'add',
          fired: true,
          about: rule.about || [],
          count: n
        });
      }
      var room = board.roomAt(occupant.x, occupant.y);
      return {
        id: tenant.id,
        name: tenant.name,
        icon: tenant.icon,
        tags: tenant.tags.slice(),
        personal: Aozora.num.round2(sumAdd * (1 + sumMul)),
        sumAdd: Aozora.num.round2(sumAdd),
        sumMul: sumMul,
        lines: lines,
        roomLabel: room ? room.label : '',
        x: occupant.x,
        y: occupant.y
      };
    }

    /**
     * @param {object} board
     * @param {object[]} layers
     * @param {number} level
     * @param {string} sourceName
     * @param {object[]} houseLines
     * @param {{text:string, value:number}[]} muls
     * @param {function(number):void} add
     * @returns {void}
     */
    _applyLayers(board, layers, level, sourceName, houseLines, muls, add) {
      var i;
      for (i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var n = this._queryHouse(board, layer.query);
        if (!this._cmp(n, layer.cmp, layer.threshold)) {
          continue;
        }
        if (layer.op === 'mul') {
          muls.push({ text: sourceName, value: layer.value });
          continue;
        }
        var amount = Aozora.num.round2((layer.scale === 'per' ? layer.value * n : layer.value) * level);
        add(amount);
        var suffix = layer.scale === 'per' ? ' ×' + String(n) : '';
        var levelNote = level > 1 ? ' Lv' + String(level) : '';
        houseLines.push({
          scope: 'house',
          text: sourceName + levelNote + ' ' + layer.text + suffix,
          amount: amount,
          kind: 'add',
          fired: true
        });
      }
    }

    /**
     * 騒音減点の合計を半分にし、戻した分を家の加算にする。
     * @param {object[]} tenantScores
     * @param {object} rule
     * @returns {{amount:number, text:string}}
     */
    _halveRefund(tenantScores, rule) {
      var neg = 0;
      var i;
      var j;
      for (i = 0; i < tenantScores.length; i++) {
        var lines = tenantScores[i].lines;
        for (j = 0; j < lines.length; j++) {
          var line = lines[j];
          if (!line.fired || line.kind !== 'add' || line.amount >= 0) {
            continue;
          }
          if ((line.about || []).indexOf(rule.halvePenalty) >= 0) {
            neg += line.amount;
          }
        }
      }
      neg = Aozora.num.round2(neg);
      if (neg >= 0) {
        return { amount: 0, text: '' };
      }
      var halved = Math.trunc(neg / 2);
      var refund = Aozora.num.round2(halved - neg);
      return {
        amount: refund,
        text: rule.name + '（' + rule.halvePenalty + 'の減点 ' + Aozora.num.format(neg) + ' を半分に）'
      };
    }
  }

  var root = globalThis.Aozora || (globalThis.Aozora = {});
  root.RuleEvaluator = RuleEvaluator;
})();
