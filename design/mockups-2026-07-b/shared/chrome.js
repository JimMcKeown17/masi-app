/* ═══════════════════════════════════════════════════════════════
   chrome.js: injects the iOS status bar and the Masi tab bar into
   every .phone on the page. Classic script (NOT type=module) so the
   mockups still work when opened directly from disk via file://,
   where ES-module imports are blocked by CORS.

   Usage:  <div class="phone" data-tab="home" data-name="01-home">
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STATUS_BAR =
    '<div class="statusbar">' +
      '<span class="time">09:41</span>' +
      '<svg width="62" height="12" viewBox="0 0 62 12" fill="none">' +
        '<rect x="0" y="7" width="3" height="5" rx="1" fill="currentColor"/>' +
        '<rect x="5" y="5" width="3" height="7" rx="1" fill="currentColor"/>' +
        '<rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/>' +
        '<rect x="15" y="1" width="3" height="11" rx="1" fill="currentColor" opacity=".35"/>' +
        '<path d="M28 4.5a7.5 7.5 0 0 1 9 0M29.8 7a4.8 4.8 0 0 1 5.4 0M31.6 9.4a2 2 0 0 1 1.8 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        '<circle cx="32.5" cy="11" r="1" fill="currentColor"/>' +
        '<rect x="44" y="1.5" width="16" height="9" rx="2.5" stroke="currentColor" stroke-opacity=".4"/>' +
        '<rect x="45.5" y="3" width="11" height="6" rx="1.2" fill="currentColor"/>' +
        '<path d="M61.5 4.5v3a1.7 1.7 0 0 0 0-3z" fill="currentColor" fill-opacity=".4"/>' +
      '</svg>' +
    '</div>';

  /* Icons mirror the live app: Ionicons home / people / document-text / clipboard
     (see src/components/navigation/BottomTabIcon.js). */
  var TABS = [
    { key: 'home', label: 'Home',
      icon: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.5 20v-5.5h5V20" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
    { key: 'children', label: 'My Children',
      icon: '<circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9.5" r="2.4" stroke="currentColor" stroke-width="2"/><path d="M16.5 14.6c2.2.2 3.6 1.5 4 3.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
    { key: 'sessions', label: 'Sessions',
      icon: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M8 8.5h8M8 12h8M8 15.5h4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
    { key: 'assessments', label: 'Assessments',
      icon: '<rect x="5" y="4" width="14" height="17" rx="2" stroke="currentColor" stroke-width="2"/><path d="M9 4.5V3h6v1.5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m8.8 13 2.2 2.2 4.2-4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' }
  ];

  function tabBar(active) {
    return '<div class="tabbar">' + TABS.map(function (t) {
      return '<div class="tab' + (t.key === active ? ' on' : '') + '">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' + t.icon + '</svg>' +
        t.label +
        '<span class="t-dot"></span>' +
      '</div>';
    }).join('') + '</div>';
  }

  window.renderChrome = function () {
    var phones = document.querySelectorAll('.phone');
    for (var i = 0; i < phones.length; i++) {
      var p = phones[i];
      p.insertAdjacentHTML('afterbegin', STATUS_BAR);
      if (p.dataset.tab !== 'none') {
        p.insertAdjacentHTML('beforeend', tabBar(p.dataset.tab || 'home'));
      }
    }
  };
})();
