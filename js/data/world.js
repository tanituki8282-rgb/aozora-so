(function () {
  'use strict';

  /**
   * 荘そのもののデータ。
   * 家訓・置き土産・増築・週ノルマ・第1季の見本ドラフト。
   * 第1季の並びは固定で、角・中・距離の読み方を必ず一度は触れる。
   * 第2季以降のノルマは試作の曲線。支配戦略の自動探索はまだしない。
   */

  /** @type {object[]} */
  var HOUSE_RULES = [
    {
      id: 'music-salon',
      name: '音楽サロン',
      desc: '音楽タグが2人以上いると、個人合計と家の加算に ×1.3。',
      layers: [
        {
          text: '音楽が揃った',
          query: { kind: 'houseTag', tag: '音楽' },
          cmp: '>=',
          threshold: 2,
          op: 'mul',
          value: 1.3,
          scale: 'once'
        }
      ]
    },
    {
      id: 'cat-frame',
      name: '猫の額縁',
      desc: '猫タグ1人につき +3。倍率の前に足す。',
      layers: [
        {
          text: '猫の額縁',
          query: { kind: 'houseTag', tag: '猫' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 3,
          scale: 'per'
        }
      ]
    },
    {
      id: 'curfew',
      name: '門限二十二時',
      desc: '早寝タグ1人につき +2。倍率の前に足す。',
      layers: [
        {
          text: '門限',
          query: { kind: 'houseTag', tag: '早寝' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per'
        }
      ]
    },
    {
      id: 'soundproof',
      name: '防音壁',
      desc: '騒音が原因の減点を、合計して半分にする（ゼロに近い方へ切り捨て）。',
      layers: [],
      halvePenalty: '騒音'
    },
    {
      id: 'morning-hall',
      name: '朝の廊下',
      desc: '毎週 +3。朝型がいると、さらに1人につき +2。',
      layers: [
        {
          text: '朝の気配',
          query: { kind: 'always' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 3,
          scale: 'once'
        },
        {
          text: '朝型',
          query: { kind: 'houseTag', tag: '朝型' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per'
        }
      ]
    },
    {
      id: 'shared-kitchen',
      name: '共同炊事',
      desc: '食タグが2人以上いると ×1.25。',
      layers: [
        {
          text: '共同炊事',
          query: { kind: 'houseTag', tag: '食' },
          cmp: '>=',
          threshold: 2,
          op: 'mul',
          value: 1.25,
          scale: 'once'
        }
      ]
    }
  ];

  /** @type {object[]} */
  var SOUVENIRS = [
    {
      id: 'night-owl',
      name: '夜更かし公認',
      desc: '夜型の住人1人につき +2。同じ置き土産はLv3まで重なる。',
      layers: [
        {
          text: '夜更かし公認',
          query: { kind: 'houseTag', tag: '夜型' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per'
        }
      ]
    },
    {
      id: 'cat-path',
      name: '猫の動線',
      desc: '猫タグの住人は、隣の猫1人につき追加で +1。',
      inject: [
        {
          id: 'cat-path-bonus',
          text: '猫の動線',
          requireSelfTag: '猫',
          query: { kind: 'adjacentTag', tag: '猫' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 1,
          scale: 'per',
          about: []
        }
      ]
    },
    {
      id: 'quiet-reform',
      name: '静音リフォーム',
      desc: '騒音が原因の減点を、判定1回につき1点やわらげる。',
      relief: { about: '騒音', amount: 1 }
    },
    {
      id: 'corner-gift',
      name: '角部屋の恵み',
      desc: '角部屋の住人は追加で +2。',
      inject: [
        {
          id: 'corner-gift-bonus',
          text: '角部屋の恵み',
          query: { kind: 'isCorner' },
          cmp: '==',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'once',
          about: []
        }
      ]
    }
  ];

  /** @type {object[]} */
  var EXPANSIONS = [
    {
      id: 'east-0',
      x: 3,
      y: 0,
      label: '東の上',
      desc: '東の上に一部屋。今の点数はすぐには増えない。作業タグが来ると輝く。'
    },
    {
      id: 'east-1',
      x: 3,
      y: 1,
      label: '東',
      desc: '東の辺に一部屋。見習い大工が、新しい木の匂いを探す。'
    },
    {
      id: 'east-2',
      x: 3,
      y: 2,
      label: '東の下',
      desc: '東の下に一部屋。角ではない、静かな作業場向き。'
    },
    {
      id: 'west-1',
      x: -1,
      y: 1,
      label: '西',
      desc: '西に一部屋。角ではない。隣は中央の辺だけ。'
    }
  ];

  /**
   * 週1〜12のノルマ。添字0は使わない。
   * 1〜3週は手で合わせて、第1季の卒業まで読めるようにしてある。
   * 4週以降は試作曲線。あとでログを見て動かす前提。
   */
  var QUOTAS = [0, 4, 7, 12, 11, 14, 16, 18, 21, 24, 27, 30, 34];

  var SEASON_NAMES = ['', '春', '夏', '秋', '冬'];

  /** 第1季だけ、並ぶ三人組を固定する。順番だけ種で混ぜる。 */
  var FIXED_OFFERS = {
    1: ['bonsai', 'librarian', 'catlady'],
    2: ['herbalist', 'guitarist', 'student'],
    3: ['pianist', 'nekomata', 'streamer']
  };

  var root = globalThis.Aozora || (globalThis.Aozora = {});
  root.data = root.data || {};
  root.data.houseRules = HOUSE_RULES;
  root.data.souvenirs = SOUVENIRS;
  root.data.expansions = EXPANSIONS;
  root.data.quotas = QUOTAS;
  root.data.seasonNames = SEASON_NAMES;
  root.data.fixedOffers = FIXED_OFFERS;

  /** @type {Record<string, object>} */
  var houseMap = {};
  var souvenirMap = {};
  var i;
  for (i = 0; i < HOUSE_RULES.length; i++) {
    houseMap[HOUSE_RULES[i].id] = HOUSE_RULES[i];
  }
  for (i = 0; i < SOUVENIRS.length; i++) {
    souvenirMap[SOUVENIRS[i].id] = SOUVENIRS[i];
  }

  /**
   * @param {string} id
   * @returns {object|null}
   */
  root.data.houseRuleById = function (id) {
    return houseMap[id] || null;
  };

  /**
   * @param {string} id
   * @returns {object|null}
   */
  root.data.souvenirById = function (id) {
    return souvenirMap[id] || null;
  };

  /**
   * @param {number} week
   * @returns {number}
   */
  root.data.quotaFor = function (week) {
    if (week < 1) {
      return QUOTAS[1];
    }
    if (week >= QUOTAS.length) {
      return QUOTAS[QUOTAS.length - 1];
    }
    return QUOTAS[week];
  };

  /**
   * 最初の3×3。角・辺・中は増築しても変わらない。
   * @returns {{id:string,x:number,y:number,kind:string,label:string}[]}
   */
  root.data.coreRooms = function () {
    /** @type {{id:string,x:number,y:number,kind:string,label:string}[]} */
    var rooms = [];
    var y;
    var x;
    for (y = 0; y < 3; y++) {
      for (x = 0; x < 3; x++) {
        var kind = 'edge';
        var label = '辺';
        if (x === 1 && y === 1) {
          kind = 'center';
          label = '中';
        } else if (x !== 1 && y !== 1) {
          kind = 'corner';
          label = '角';
        }
        rooms.push({ id: 'core-' + x + '-' + y, x: x, y: y, kind: kind, label: label });
      }
    }
    return rooms;
  };
})();
