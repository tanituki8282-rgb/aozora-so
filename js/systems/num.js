(function () {
  'use strict';

  /**
   * 点数の丸めと表示。
   * 計算は小数第2位まで持って、画面は読みやすい桁に揃える。
   */
  var root = globalThis.Aozora || (globalThis.Aozora = {});

  root.num = {
    /**
     * @param {number} n
     * @returns {number}
     */
    round2: function (n) {
      return Math.round((n + Number.EPSILON) * 100) / 100;
    },

    /**
     * @param {number} n
     * @returns {string}
     */
    format: function (n) {
      var v = Math.round(n * 10) / 10;
      if (Math.abs(v - Math.round(v)) < 0.001) {
        return String(Math.round(v));
      }
      return v.toFixed(1);
    },

    /**
     * @param {number} n
     * @returns {string}
     */
    signed: function (n) {
      var text = root.num.format(n);
      if (n > 0) {
        return '+' + text;
      }
      return text;
    }
  };
})();
