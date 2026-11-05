(function () {
  'use strict';

  /**
   * 起動だけを担当する。
   * 進行は Game、描画は View。
   */
  var mount = document.getElementById('app');
  if (!mount) {
    return;
  }
  var view = new Aozora.View(mount);
  view.render();
})();
