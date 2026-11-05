(function () {
  'use strict';

  /**
   * 再現可能な乱数。
   * ドラフトと店の並びはすべてここを通す。同じ種・同じ選び方なら同じ順番になる。
   */
  class Rng {
    /**
     * @param {number} seed
     */
    constructor(seed) {
      this.seed = seed >>> 0;
      this.state = this.seed | 0;
    }

    /**
     * @returns {number} 0以上1未満
     */
    next() {
      var a = this.state | 0;
      a = (a + 0x6D2B79F5) | 0;
      this.state = a;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * @param {number} n 1以上
     * @returns {number}
     */
    int(n) {
      return Math.floor(this.next() * n);
    }

    /**
     * @template T
     * @param {T[]} list
     * @returns {T[]}
     */
    shuffle(list) {
      /** @type {T[]} */
      var copy = list.slice();
      var i = copy.length - 1;
      for (; i > 0; i--) {
        var j = this.int(i + 1);
        var tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    }

    /**
     * @returns {number}
     */
    getState() {
      return this.state | 0;
    }

    /**
     * @param {number} state
     * @returns {void}
     */
    setState(state) {
      this.state = state | 0;
    }
  }

  var root = globalThis.Aozora || (globalThis.Aozora = {});
  root.Rng = Rng;
})();
