(function () {
  'use strict';

  var DIR4 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  var DIR8 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ];

  /**
   * 間取りと住人の位置だけを持つ。
   * 好き嫌いの意味は知らず、評価器が隣と空室を問い合わせる。
   */
  class Board {
    /**
     * @param {{id:string,x:number,y:number,kind:string,label:string}[]} rooms
     * @param {{id:string,x:number,y:number}[]} occupants
     */
    constructor(rooms, occupants) {
      /** @type {Map<string, {id:string,x:number,y:number,kind:string,label:string}>} */
      this.roomMap = new Map();
      var i;
      for (i = 0; i < rooms.length; i++) {
        this.roomMap.set(Board.key(rooms[i].x, rooms[i].y), rooms[i]);
      }
      /** @type {{id:string,x:number,y:number}[]} */
      this.occupants = occupants.slice();
      /** @type {Map<string, {id:string,x:number,y:number}>} */
      this.occMap = new Map();
      for (i = 0; i < this.occupants.length; i++) {
        this.occMap.set(Board.key(this.occupants[i].x, this.occupants[i].y), this.occupants[i]);
      }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    static key(x, y) {
      return String(x) + ',' + String(y);
    }

    /**
     * @returns {number[][]}
     */
    static dir4() {
      return DIR4;
    }

    /**
     * @returns {number[][]}
     */
    static dir8() {
      return DIR8;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    isRoom(x, y) {
      return this.roomMap.has(Board.key(x, y));
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {{id:string,x:number,y:number,kind:string,label:string}|null}
     */
    roomAt(x, y) {
      return this.roomMap.get(Board.key(x, y)) || null;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {{id:string,x:number,y:number}|null}
     */
    occupantAt(x, y) {
      return this.occMap.get(Board.key(x, y)) || null;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number[][]} dirs
     * @returns {string[]}
     */
    neighborIds(x, y, dirs) {
      /** @type {string[]} */
      var ids = [];
      var i;
      for (i = 0; i < dirs.length; i++) {
        var occ = this.occupantAt(x + dirs[i][0], y + dirs[i][1]);
        if (occ) {
          ids.push(occ.id);
        }
      }
      return ids;
    }
  }

  var root = globalThis.Aozora || (globalThis.Aozora = {});
  root.Board = Board;
})();
