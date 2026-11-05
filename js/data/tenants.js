(function () {
  'use strict';

  /**
   * 入居希望者の台帳。
   * 癖は rules のデータだけに書く。新しい住人を足すとき、評価器のコードは触らない。
   *
   * query.kind:
   * adjacentTag / aroundTag / verticalTag / houseTag / adjacentEmpty /
   * verticalEmpty / aboveOccupied / houseCount / isCorner / isCenter / isExtra / always
   * op: add（点数）か mulBonus（個人倍率への加算。0.5 なら ×1.5）
   * scale: once か per（per は一致した人数・部屋数をかける）
   * about: 減点の理由タグ。静音リフォームや防音壁が「騒音」だけをやわらげる。
   */

  /** @type {object[]} */
  var TENANTS = [
    {
      id: 'guitarist',
      name: '夜更かしのギタリスト',
      icon: '🎸',
      tags: ['夜型', '騒音', '音楽'],
      quirk: '朝の人の隣だと、コードが申し訳なくなる。',
      souvenirId: 'night-owl',
      souvenirNote: '夜の練習を、家の慣わしに残していく。',
      rules: [
        {
          id: 'g-corner',
          text: '角部屋で夜が深い +2',
          query: { kind: 'isCorner' },
          cmp: '==',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'once',
          about: []
        },
        {
          id: 'g-vertical',
          text: '上下が空いている +3',
          query: { kind: 'verticalEmpty' },
          cmp: '>=',
          threshold: 2,
          op: 'add',
          value: 3,
          scale: 'once',
          about: []
        },
        {
          id: 'g-early',
          text: '隣の早寝 1人につき -2',
          query: { kind: 'adjacentTag', tag: '早寝' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -2,
          scale: 'per',
          about: ['早寝']
        },
        {
          id: 'g-music',
          text: '隣の音楽 1人につき +2',
          query: { kind: 'adjacentTag', tag: '音楽' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per',
          about: []
        }
      ]
    },
    {
      id: 'catlady',
      name: '猫好きの老婦人',
      icon: '🐈',
      tags: ['猫', '穏やか', '早寝'],
      quirk: '猫の気配がないと、お茶が薄い。ひとりのあいだは気まま。',
      souvenirId: 'cat-path',
      souvenirNote: '猫の通り道を、縁側に残していく。',
      rules: [
        {
          id: 'c-alone',
          text: 'ひとりの間は気まま +3',
          query: { kind: 'houseCount' },
          cmp: '==',
          threshold: 1,
          op: 'add',
          value: 3,
          scale: 'once',
          about: []
        },
        {
          id: 'c-cat',
          text: '隣の猫 1人につき +2',
          query: { kind: 'adjacentTag', tag: '猫' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per',
          about: []
        },
        {
          id: 'c-calm',
          text: '隣の穏やか 1人につき +2',
          query: { kind: 'adjacentTag', tag: '穏やか' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per',
          about: []
        },
        {
          id: 'c-noise',
          text: '隣の騒音 1人につき -2',
          query: { kind: 'adjacentTag', tag: '騒音' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -2,
          scale: 'per',
          about: ['騒音']
        }
      ]
    },
    {
      id: 'student',
      name: '受験生',
      icon: '📚',
      tags: ['勉強', '早寝', '静か'],
      quirk: '騒音は、単語帳より先に耳に入る。',
      souvenirId: 'quiet-reform',
      souvenirNote: '静かな時間の残響を、壁に残していく。',
      rules: [
        {
          id: 's-quiet',
          text: '周囲に騒音がない +3',
          query: { kind: 'aroundTag', tag: '騒音' },
          cmp: '==',
          threshold: 0,
          op: 'add',
          value: 3,
          scale: 'once',
          about: []
        },
        {
          id: 's-focus',
          text: '静けさで集中 倍率+0.5',
          query: { kind: 'aroundTag', tag: '騒音' },
          cmp: '==',
          threshold: 0,
          op: 'mulBonus',
          value: 0.5,
          scale: 'once',
          about: []
        },
        {
          id: 's-study',
          text: '隣の勉強 1人につき +2',
          query: { kind: 'adjacentTag', tag: '勉強' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per',
          about: []
        },
        {
          id: 's-noise',
          text: '隣の騒音 1人につき -3',
          query: { kind: 'adjacentTag', tag: '騒音' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -3,
          scale: 'per',
          about: ['騒音']
        }
      ]
    },
    {
      id: 'runner',
      name: '朝活ランナー',
      icon: '🏃',
      tags: ['早寝', '健康', '朝型'],
      quirk: '日の出前に廊下を走る。夜の人は敵。',
      souvenirId: 'corner-gift',
      souvenirNote: '縁側の補強を、足跡ごと残していく。',
      rules: [
        {
          id: 'r-corner',
          text: '角部屋 +3',
          query: { kind: 'isCorner' },
          cmp: '==',
          threshold: 1,
          op: 'add',
          value: 3,
          scale: 'once',
          about: []
        },
        {
          id: 'r-night',
          text: '隣の夜型 1人につき -2',
          query: { kind: 'adjacentTag', tag: '夜型' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -2,
          scale: 'per',
          about: []
        },
        {
          id: 'r-morning',
          text: '隣の朝型 1人につき +2',
          query: { kind: 'adjacentTag', tag: '朝型' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per',
          about: []
        }
      ]
    },
    {
      id: 'bonsai',
      name: '盆栽職人',
      icon: '🪴',
      tags: ['静か', '植物', '穏やか'],
      quirk: '角の光が、枝の向きを決める。',
      souvenirId: 'corner-gift',
      souvenirNote: '角の光の覚えを、窓辺に残していく。',
      rules: [
        {
          id: 'b-corner',
          text: '角部屋 +3',
          query: { kind: 'isCorner' },
          cmp: '==',
          threshold: 1,
          op: 'add',
          value: 3,
          scale: 'once',
          about: []
        },
        {
          id: 'b-plant',
          text: '隣の植物 1人につき +2',
          query: { kind: 'adjacentTag', tag: '植物' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per',
          about: []
        },
        {
          id: 'b-noise',
          text: '隣の騒音 1人につき -1',
          query: { kind: 'adjacentTag', tag: '騒音' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -1,
          scale: 'per',
          about: ['騒音']
        }
      ]
    },
    {
      id: 'streamer',
      name: '深夜配信者',
      icon: '🎤',
      tags: ['騒音', '夜型', 'ネット'],
      quirk: '人の少ない壁際が、いちばん映える。',
      souvenirId: 'night-owl',
      souvenirNote: '配信のルームランプを、玄関に残していく。',
      rules: [
        {
          id: 'st-empty',
          text: '隣の空室 1部屋につき +1',
          query: { kind: 'adjacentEmpty' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 1,
          scale: 'per',
          about: []
        },
        {
          id: 'st-night',
          text: '隣の夜型 1人につき +2',
          query: { kind: 'adjacentTag', tag: '夜型' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per',
          about: []
        },
        {
          id: 'st-early',
          text: '隣の早寝 1人につき -2',
          query: { kind: 'adjacentTag', tag: '早寝' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -2,
          scale: 'per',
          about: []
        }
      ]
    },
    {
      id: 'cook',
      name: '料理研究家',
      icon: '🍳',
      tags: ['食', '穏やか', '騒音'],
      quirk: 'いい匂いも、上の階には罪。',
      souvenirId: 'quiet-reform',
      souvenirNote: '換気扇の図面を、台所に残していく。',
      rules: [
        {
          id: 'cook-food',
          text: '隣の食 1人につき +2',
          query: { kind: 'adjacentTag', tag: '食' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per',
          about: []
        },
        {
          id: 'cook-up',
          text: '上の階に人がいる -2',
          query: { kind: 'aboveOccupied' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -2,
          scale: 'once',
          about: []
        },
        {
          id: 'cook-cat',
          text: '隣の猫 1人につき +1',
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
      id: 'nekomata',
      name: '猫又見習い',
      icon: '🐱',
      tags: ['猫', '夜型', '静か'],
      quirk: '猫が隣にいると、しっぽが落ち着く。',
      souvenirId: 'cat-path',
      souvenirNote: '猫の足跡を、廊下の習わしに残していく。',
      rules: [
        {
          id: 'n-cat',
          text: '隣の猫 1人につき +3',
          query: { kind: 'adjacentTag', tag: '猫' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 3,
          scale: 'per',
          about: []
        },
        {
          id: 'n-corner',
          text: '角部屋 +1',
          query: { kind: 'isCorner' },
          cmp: '==',
          threshold: 1,
          op: 'add',
          value: 1,
          scale: 'once',
          about: []
        },
        {
          id: 'n-noise',
          text: '隣の騒音 1人につき -1',
          query: { kind: 'adjacentTag', tag: '騒音' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -1,
          scale: 'per',
          about: ['騒音']
        }
      ]
    },
    {
      id: 'carpenter',
      name: '見習い大工',
      icon: '🔨',
      tags: ['作業', '騒音', '朝型'],
      quirk: '新しい木材の匂いがしないと、腕が鳴らない。',
      souvenirId: 'quiet-reform',
      souvenirNote: '試しの防音壁を、一枚残していく。',
      rules: [
        {
          id: 'car-extra',
          text: '増築の部屋 +5',
          query: { kind: 'isExtra' },
          cmp: '==',
          threshold: 1,
          op: 'add',
          value: 5,
          scale: 'once',
          about: []
        },
        {
          id: 'car-center',
          text: '中の部屋 +2',
          query: { kind: 'isCenter' },
          cmp: '==',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'once',
          about: []
        },
        {
          id: 'car-quiet',
          text: '隣の静か 1人につき -2',
          query: { kind: 'adjacentTag', tag: '静か' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -2,
          scale: 'per',
          about: []
        },
        {
          id: 'car-morning',
          text: '隣の朝型 1人につき +1',
          query: { kind: 'adjacentTag', tag: '朝型' },
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
      id: 'librarian',
      name: '図書委員',
      icon: '📖',
      tags: ['勉強', '静か', '早寝'],
      quirk: '真ん中の机でないと、ページが落ち着かない。',
      souvenirId: 'quiet-reform',
      souvenirNote: '防音のしおりを、机に残していく。',
      rules: [
        {
          id: 'lib-center',
          text: '中の部屋 +3',
          query: { kind: 'isCenter' },
          cmp: '==',
          threshold: 1,
          op: 'add',
          value: 3,
          scale: 'once',
          about: []
        },
        {
          id: 'lib-study',
          text: '勉強仲間（自分以外）1人につき +2',
          query: { kind: 'houseTag', tag: '勉強', includeSelf: false },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per',
          about: []
        },
        {
          id: 'lib-noise',
          text: '隣の騒音 1人につき -2',
          query: { kind: 'adjacentTag', tag: '騒音' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -2,
          scale: 'per',
          about: ['騒音']
        }
      ]
    },
    {
      id: 'pianist',
      name: 'ジャズピアニスト',
      icon: '🎹',
      tags: ['音楽', '夜型', '穏やか'],
      quirk: '隣の旋律には、ついハモってしまう。',
      souvenirId: 'night-owl',
      souvenirNote: '夜の調律を、家の慣わしに残していく。',
      rules: [
        {
          id: 'p-music',
          text: '隣の音楽 1人につき +3',
          query: { kind: 'adjacentTag', tag: '音楽' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 3,
          scale: 'per',
          about: []
        },
        {
          id: 'p-vertical',
          text: '上下が空いている +2',
          query: { kind: 'verticalEmpty' },
          cmp: '>=',
          threshold: 2,
          op: 'add',
          value: 2,
          scale: 'once',
          about: []
        },
        {
          id: 'p-early',
          text: '隣の早寝 1人につき -1',
          query: { kind: 'adjacentTag', tag: '早寝' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -1,
          scale: 'per',
          about: ['早寝']
        }
      ]
    },
    {
      id: 'herbalist',
      name: 'ハーブ茶の店主',
      icon: '🍵',
      tags: ['植物', '穏やか', '食'],
      quirk: '植物と、やさしい人が隣だと湯気が丸い。',
      souvenirId: 'corner-gift',
      souvenirNote: '角に置いた茶器を、そのまま残していく。',
      rules: [
        {
          id: 'h-plant',
          text: '隣の植物 1人につき +2',
          query: { kind: 'adjacentTag', tag: '植物' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'per',
          about: []
        },
        {
          id: 'h-food',
          text: '隣の食 1人につき +1',
          query: { kind: 'adjacentTag', tag: '食' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 1,
          scale: 'per',
          about: []
        },
        {
          id: 'h-calm',
          text: '隣の穏やか 1人につき +1',
          query: { kind: 'adjacentTag', tag: '穏やか' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: 1,
          scale: 'per',
          about: []
        },
        {
          id: 'h-corner',
          text: '角部屋 +2',
          query: { kind: 'isCorner' },
          cmp: '==',
          threshold: 1,
          op: 'add',
          value: 2,
          scale: 'once',
          about: []
        },
        {
          id: 'h-noise',
          text: '隣の騒音 1人につき -1',
          query: { kind: 'adjacentTag', tag: '騒音' },
          cmp: '>=',
          threshold: 1,
          op: 'add',
          value: -1,
          scale: 'per',
          about: ['騒音']
        }
      ]
    }
  ];

  var root = globalThis.Aozora || (globalThis.Aozora = {});
  root.data = root.data || {};
  root.data.tenants = TENANTS;

  /** @type {Record<string, object>} */
  var map = {};
  for (var i = 0; i < TENANTS.length; i++) {
    map[TENANTS[i].id] = TENANTS[i];
  }

  /**
   * @param {string} id
   * @returns {object|null}
   */
  root.data.tenantById = function (id) {
    return map[id] || null;
  };
})();
