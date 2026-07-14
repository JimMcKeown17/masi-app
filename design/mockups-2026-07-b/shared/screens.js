/* ═══════════════════════════════════════════════════════════════
   screens.js: the four main screens, as ONE source of truth.

   A1 / A2 / A3 all render exactly this markup and differ only in
   their CSS skin. That makes the three variants a controlled
   experiment: identical content and identical structure, so the only
   thing being judged is type + colour + shape. It also proves the
   skin is expressible purely as tokens, which is what you'd need to
   port a winner into src/constants/colors.js.

   Every icon uses currentColor so a skin can recolour it.
   Content is faithful to direction-a-ithemba: same EA, same children,
   same numbers.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ico = {
    chev:   '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cloud:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 18a5 5 0 1 1 .8-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18H7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m9.5 13.5 2 2 3.5-3.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    plus:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    timer:  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="2.4"/><path d="M12 9.5V13l2.5 2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M9.5 2.5h5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    book:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 19V5.5A1.5 1.5 0 0 1 5.5 4H12v15H5.5A1.5 1.5 0 0 0 4 20.5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M20 19V5.5A1.5 1.5 0 0 0 18.5 4H12v15h6.5a1.5 1.5 0 0 1 1.5 1.5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    trend:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 20 10 13l4 3.5L20 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 9H20v4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    people: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9.5" r="2.4" stroke="currentColor" stroke-width="2"/><path d="M16.5 14.6c2.2.2 3.6 1.5 4 3.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  function syncPill() {
    return '<span class="sync-pill">' + ico.cloud + 'Synced</span>';
  }

  /* ── 01 HOME ────────────────────────────────────────────────── */
  var HOME =
    '<div class="screen"><div class="header">' +
      '<div class="header-top">' +
        '<div>' +
          '<h1 class="display greet">Molo, Asanda<span class="dot">.</span></h1>' +
          '<p class="role">Core Literacy · Charles Duna Primary</p>' +
        '</div>' + syncPill() +
      '</div>' +
    '</div>' +
    '<div class="content">' +

      '<section class="clock-ribbon">' +
        '<div>' +
          '<span class="label">On the clock</span>' +
          '<div class="display clock-elapsed num">3h 24m</div>' +
          '<div class="clock-since num">Clocked in at 07:42</div>' +
        '</div>' +
        '<button class="btn-out">Clock out</button>' +
      '</section>' +

      '<section>' +
        '<div class="sec-label"><span class="label">July so far</span></div>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="display v num">14</div><div class="k">days worked</div></div>' +
          '<div class="stat"><div class="display v num">42</div><div class="k">sessions</div></div>' +
          '<div class="stat"><div class="display v num">12</div><div class="k">children</div></div>' +
        '</div>' +
      '</section>' +

      '<section>' +
        '<div class="sec-label"><span class="label">This week</span><span class="sec-meta num">12 sessions</span></div>' +
        '<div class="week">' +
          '<div class="day done"><span class="d-label">MON</span><span class="display d-count num">3</span></div>' +
          '<div class="day done"><span class="d-label">TUE</span><span class="display d-count num">4</span></div>' +
          '<div class="day done"><span class="d-label">WED</span><span class="display d-count num">3</span></div>' +
          '<div class="day today"><span class="d-label">THU</span><span class="display d-count num">2</span></div>' +
          '<div class="day"><span class="d-label">FRI</span><span class="display d-count num">–</span></div>' +
        '</div>' +
      '</section>' +

      '<section>' +
        '<div class="sec-label"><span class="label">Assessment coverage</span></div>' +
        '<div class="cov-track"><div class="cov-fill"></div></div>' +
        '<div class="cov-caption">' +
          '<span class="left num">9 of 12 children assessed</span>' +
          '<span class="right">3 to go →</span>' +
        '</div>' +
      '</section>' +

      '<section>' +
        '<div class="sec-label"><span class="label">Your impact</span></div>' +
        '<div class="list-row"><span class="list-ico">' + ico.book + '</span>' +
          '<span class="list-t">Letter mastery<span class="list-sub">Which letters your children know</span></span>' + ico.chev + '</div>' +
        '<div class="list-row"><span class="list-ico">' + ico.trend + '</span>' +
          '<span class="list-t">Assessment scores<span class="list-sub">Every child, ranked and banded</span></span>' + ico.chev + '</div>' +
        '<div class="list-row"><span class="list-ico">' + ico.people + '</span>' +
          '<span class="list-t">Sessions per child<span class="list-sub">Who\'s had the most time with you</span></span>' + ico.chev + '</div>' +
      '</section>' +

    '</div></div>';

  /* ── 02 MY CHILDREN ─────────────────────────────────────────── */
  function pair(a, b, ca, cb, names, n) {
    return '<div class="pair-row">' +
      '<span class="av-stack"><span class="av ' + ca + '">' + a + '</span><span class="av ' + cb + '">' + b + '</span></span>' +
      '<span class="pair-names">' + names + '</span>' +
      '<span class="pair-tag">Pair ' + n + '</span>' +
    '</div>';
  }

  var CHILDREN =
    '<div class="screen"><div class="header">' +
      '<h1 class="display greet">My children<span class="dot">.</span></h1>' +
      '<p class="role num">12 children across 2 classes</p>' +
    '</div>' +
    '<div class="content">' +

      '<section><div class="search">' + ico.search + 'Search children or classes…</div></section>' +

      '<section><div class="panel class-card">' +
        '<div class="cc-top"><span class="display cc-name">Grade 1A</span><span class="cc-count num">6 children</span></div>' +
        '<p class="cc-meta">Mrs Nogaya · isiXhosa · Charles Duna</p>' +
        '<div class="pair-list">' +
          pair('SB', 'LJ', 'c1', 'c2', 'Sinovuyo &amp; Lithemba', 1) +
          pair('AM', 'ON', 'c3', 'c4', 'Anelisa &amp; Owethu', 2) +
          pair('ET', 'IG', 'c5', 'c6', 'Esona &amp; Iminathi', 3) +
        '</div>' +
        '<div class="cc-bottom"><span class="cc-assessed num">6 of 6 assessed ✓</span></div>' +
      '</div></section>' +

      '<section><div class="panel class-card">' +
        '<div class="cc-top"><span class="display cc-name">Grade 1B</span><span class="cc-count num">6 children</span></div>' +
        '<p class="cc-meta">Ms Botman · isiXhosa · Charles Duna</p>' +
        '<div class="pair-list">' +
          pair('KF', 'AP', 'c4', 'c1', 'Khanya &amp; Amahle', 1) +
          pair('MS', 'LD', 'c2', 'c3', 'Milani &amp; Lonwabo', 2) +
          pair('SM', 'BN', 'c6', 'c5', 'Sibabalwe &amp; Buhle', 3) +
        '</div>' +
        '<div class="cc-bottom"><span class="cc-assessed warn num">3 of 6 assessed · Khanya, Milani &amp; Buhle to go</span></div>' +
      '</div></section>' +

      '<section class="tail"><div class="quiet-link">＋ Add another class</div></section>' +

    '</div></div>';

  /* ── 03 SESSIONS ────────────────────────────────────────────── */
  var SESSIONS =
    '<div class="screen"><div class="header">' +
      '<h1 class="display greet">Sessions<span class="dot">.</span></h1>' +
    '</div>' +
    '<div class="content">' +

      '<section class="ring-wrap">' +
        '<div class="ring">' +
          '<svg width="168" height="168" viewBox="0 0 168 168">' +
            '<circle class="ring-track" cx="84" cy="84" r="75" fill="none" stroke-width="13"/>' +
            '<circle class="ring-fill"  cx="84" cy="84" r="75" fill="none" stroke-width="13" stroke-linecap="round" ' +
              'stroke-dasharray="471.2" stroke-dashoffset="157.1"/>' +
          '</svg>' +
          '<div class="ring-center">' +
            '<span class="display ring-count num">2</span>' +
            '<span class="ring-of num">of 3 today</span>' +
          '</div>' +
        '</div>' +
        '<p class="ring-caption">One more pair reaches today’s target</p>' +
      '</section>' +

      '<section><div class="stat-row">' +
        '<div class="stat"><div class="display v num">11</div><div class="k">this week</div></div>' +
        '<div class="stat"><div class="display v num">42</div><div class="k">this month</div></div>' +
        '<div class="stat"><div class="display v num">3.5</div><div class="k">avg / child</div></div>' +
      '</div></section>' +

      '<section>' +
        '<div class="sec-label"><span class="label">Not seen this week</span></div>' +
        '<div class="chip-row">' +
          '<span class="chip"><span class="av c4">ON</span>Owethu</span>' +
          '<span class="chip"><span class="av c5">ET</span>Esona</span>' +
          '<span class="chip"><span class="av c3">BN</span>Buhle</span>' +
        '</div>' +
      '</section>' +

      '<section>' +
        '<div class="sec-label"><span class="label">Recent</span><span class="sec-link">View history →</span></div>' +
        '<div class="sess-row"><div class="sess-time"><div class="t1 num">10:15</div><div class="t2">Today</div></div>' +
          '<div class="sess-body"><div class="who">Sinovuyo &amp; Lithemba</div><div class="what">Letter sounds · Shared reading</div></div></div>' +
        '<div class="sess-row"><div class="sess-time"><div class="t1 num">08:30</div><div class="t2">Today</div></div>' +
          '<div class="sess-body"><div class="who">Anelisa &amp; Owethu</div><div class="what">Phonics game · Writing practice</div></div></div>' +
        '<div class="sess-row"><div class="sess-time"><div class="t1 num">12:40</div><div class="t2">Wed</div></div>' +
          '<div class="sess-body"><div class="who">Esona &amp; Iminathi</div><div class="what">Letter sounds · Story time</div></div></div>' +
      '</section>' +

      '<section class="tail"><button class="btn-primary">' + ico.plus + 'Record a session</button></section>' +

    '</div></div>';

  /* ── 04 ASSESSMENTS ─────────────────────────────────────────── */
  function battery(name, desc, last) {
    return '<section><div class="panel batt-card">' +
      '<div class="bc-top"><span class="display bc-name">' + name + '</span>' +
        '<span class="bc-timed">' + ico.timer + '60 sec</span></div>' +
      '<p class="bc-desc">' + desc + '</p>' +
      '<div class="bc-actions"><span class="bc-last num">' + last + '</span>' +
        '<span class="btn-start">Start →</span></div>' +
    '</div></section>';
  }

  var ASSESSMENTS =
    '<div class="screen"><div class="header">' +
      '<h1 class="display greet">Assessments<span class="dot">.</span></h1>' +
      '<p class="role num">9 of 12 children assessed · 28 results</p>' +
    '</div>' +
    '<div class="content">' +

      battery('Letter sounds',
        'EGRA timed letter-sound recognition. The child reads letters aloud; tap the ones they get right.',
        'Last run today, 08:05') +
      battery('Word reading',
        'EGRA timed word-reading fluency. The child reads real words; mark each one as they go.',
        'Last run Tue, 11:40') +

      '<section>' +
        '<div class="sec-label"><span class="label">Latest results</span><span class="sec-link">All results →</span></div>' +
        '<div class="result-row"><span class="av c1">SB</span>' +
          '<span class="res-name"><span class="n">Sinovuyo Booi</span><span class="m">Letter sounds · today</span></span>' +
          '<span class="band good num">38 / min</span></div>' +
        '<div class="result-row"><span class="av c4">ON</span>' +
          '<span class="res-name"><span class="n">Owethu Nkohla</span><span class="m">Letter sounds · today</span></span>' +
          '<span class="band mid num">21 / min</span></div>' +
        '<div class="result-row"><span class="av c2">LJ</span>' +
          '<span class="res-name"><span class="n">Lithemba Jantjies</span><span class="m">Word reading · Tue</span></span>' +
          '<span class="band low num">12 / min</span></div>' +
      '</section>' +

    '</div></div>';

  window.SCREENS = {
    home: HOME,
    children: CHILDREN,
    sessions: SESSIONS,
    assessments: ASSESSMENTS
  };

  window.renderScreens = function () {
    var phones = document.querySelectorAll('.phone[data-screen]');
    for (var i = 0; i < phones.length; i++) {
      phones[i].insertAdjacentHTML('beforeend', window.SCREENS[phones[i].dataset.screen]);
    }
  };
})();
