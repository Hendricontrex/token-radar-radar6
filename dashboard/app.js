// radar-6 dashboard: renders the board from window.RADAR, the data file the
// program wrote beside this page. The table, the filters and the detail view
// all read the same rows the board was ranked from, so the page and the
// board cannot disagree. No network: every number comes from data.js.
//
// Deep links, for the screenshots and for sharing a view:
//   #detail=<slug>  opens that protocol's detail view
//   #verdict=FARM   filters to one verdict
//   #watch=1        shows watchlist protocols only
//   #section=<id>   scrolls to a section (e.g. #section=method)

(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) return;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n, digits) {
    return (n * 100).toFixed(digits === undefined ? 1 : digits) + '%';
  }
  function days(n) {
    return n === null || n === undefined ? '\u2014' : n.toLocaleString('en-US') + 'd';
  }

  // Row tuple: [rank, slug, name, category, chains, tvl, change_7d, age_days,
  //   implied, range_lo, range_hi, odds, verdict, ev, catPeers, bandPeers,
  //   farm_steps, deposit, gas, hold_weeks]
  var rows = R.rows;
  var watchlist = {};
  R.watchlist.forEach(function (s) { watchlist[s] = true; });

  var state = { q: '', cat: '', verdict: '', watch: false, sort: 'rank', dir: 1 };

  function verdictRank(v) { return v === 'FARM' ? 0 : v === 'WATCH' ? 1 : 2; }

  function filtered() {
    var q = state.q.toLowerCase();
    var out = rows.filter(function (r) {
      if (state.watch && !watchlist[r[1]]) return false;
      if (state.verdict && r[12] !== state.verdict) return false;
      if (state.cat && (r[3] || 'Unknown') !== state.cat) return false;
      if (q && (r[2] + ' ' + r[1]).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    var get = {
      rank: function (r) { return r[0]; },
      name: function (r) { return r[2].toLowerCase(); },
      category: function (r) { return (r[3] || 'Unknown').toLowerCase(); },
      tvl: function (r) { return r[5]; },
      growth: function (r) { return r[6] === null ? -999 : r[6]; },
      age: function (r) { return r[7] === null ? -1 : r[7]; },
      implied: function (r) { return r[8]; },
      odds: function (r) { return r[11]; },
      ev: function (r) { return r[13]; },
      verdict: function (r) { return verdictRank(r[12]); },
    }[key] || function (r) { return r[0]; };
    out.sort(function (a, b) {
      var va = get(a); var vb = get(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a[0] - b[0];
    });
    return out;
  }

  function render() {
    var list = filtered();
    var tbody = document.getElementById('rows');
    var html = '';
    list.forEach(function (r) {
      var growth = r[6] === null ? '\u2014' : (r[6] >= 0 ? '+' : '') + r[6].toFixed(1) + '%';
      html += '<tr data-slug="' + esc(r[1]) + '">'
        + '<td class="num">' + r[0] + '</td>'
        + '<td><b>' + esc(r[2]) + '</b><span class="sub">' + esc(r[1]) + (watchlist[r[1]] ? ' \u00b7 watchlist' : '') + '</span></td>'
        + '<td>' + esc(r[3] || 'Unknown') + '</td>'
        + '<td class="num">' + money(r[5]) + '</td>'
        + '<td class="num">' + growth + '</td>'
        + '<td class="num">' + days(r[7]) + '</td>'
        + '<td class="num"><b>' + money(r[8]) + '</b><span class="sub">' + money(r[9]) + ' \u2013 ' + money(r[10]) + '</span></td>'
        + '<td class="num">' + pct(r[11]) + '</td>'
        + '<td class="num">' + money(r[13]) + '</td>'
        + '<td><span class="verdict ' + r[12] + '">' + r[12] + '</span></td>'
        + '</tr>';
    });
    tbody.innerHTML = html;
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' rows';
  }

  function renderPeers() {
    var html = '';
    R.live.forEach(function (p) {
      var growth = p.change_7d === null ? '\u2014' : (p.change_7d >= 0 ? '+' : '') + p.change_7d.toFixed(1) + '%';
      html += '<tr><td><b>' + esc(p.name) + '</b><span class="sub">' + esc(p.slug) + '</span></td>'
        + '<td>' + esc(p.category || 'Unknown') + '</td>'
        + '<td class="num">' + money(p.tvl_usd) + '</td>'
        + '<td class="num">' + money(p.mcap_usd) + '</td>'
        + '<td class="num">&times;' + p.ratio.toFixed(3) + '</td>'
        + '<td class="num">' + growth + '</td></tr>';
    });
    document.getElementById('peer-rows').innerHTML = html;
  }

  function fillCategories() {
    var cats = {};
    rows.forEach(function (r) { cats[r[3] || 'Unknown'] = true; });
    var sel = document.getElementById('cat');
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }

  // The break-even calculator: a hypothetical reward pool, the reader's own
  // deposit, and the row's own numbers. Assumptions, stated on the page:
  // farmers collectively hold 1% of the protocol's TVL; gas is the row's
  // per-transaction figure times 7 transactions; friction is 2% of what is
  // received; the deposit could otherwise earn 5% a year for the hold.
  function calculator(r) {
    var poolInput = document.getElementById('calc-pool');
    var depInput = document.getElementById('calc-dep');
    var out = document.getElementById('calc-out');
    function recompute() {
      var pool = parseFloat(poolInput.value) || 0;
      var dep = parseFloat(depInput.value) || 0;
      var tvl = r[5];
      var share = tvl > 0 ? dep / (tvl * 0.01) : 0;
      var gross = pool * share;
      var fees = r[18] * 7;
      var opp = dep * 0.05 * (r[19] / 52);
      var odds = r[11];
      function net(o) { return gross * o - fees - 0.02 * gross * o - opp; }
      var be = gross * 0.98 > 0 ? (fees + opp) / (gross * 0.98) : Infinity;
      out.innerHTML = 'Share of the farmer pool: <b>' + (share * 100).toFixed(3) + '%</b> &middot; '
        + 'gas and fees: <b>' + money(fees) + '</b> &middot; opportunity cost: <b>' + money(opp) + '</b><br>'
        + 'Expected net at this row&rsquo;s odds (' + pct(odds) + '): <b>' + money(net(odds)) + '</b> &middot; '
        + 'break-even odds: <b>' + (be === Infinity ? 'never — the pool is too small for the costs' : pct(be)) + '</b><br>'
        + 'Sensitivity — odds halved: <b>' + money(net(odds / 2)) + '</b> &middot; at the row&rsquo;s odds: <b>'
        + money(net(odds)) + '</b> &middot; odds doubled: <b>' + money(net(Math.min(1, odds * 2))) + '</b>';
    }
    poolInput.addEventListener('input', recompute);
    depInput.addEventListener('input', recompute);
    recompute();
  }

  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i][1] === slug) { r = rows[i]; break; }
    if (!r) return;
    var growth = r[6] === null ? 'unreported (0 in the model)' : (r[6] >= 0 ? '+' : '') + r[6].toFixed(1) + '%';
    var steps = r[16].map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    document.getElementById('detail-body').innerHTML =
      '<h2>' + esc(r[2]) + ' <span style="color:var(--muted);font-size:15px">' + esc(r[1]) + ' &middot; rank ' + r[0] + '</span></h2>'
      + '<p><span class="verdict ' + r[12] + '">' + r[12] + '</span> &middot; expected value ' + money(r[13])
      + ' &middot; ' + (watchlist[r[1]] ? 'on the watchlist' : 'below the watchlist floor') + ' &middot; records no token.</p>'
      + '<div class="stats">'
      + '<div class="stat"><b>' + money(r[8]) + '</b><span>Implied value</span></div>'
      + '<div class="stat"><b>' + money(r[9]) + ' \u2013 ' + money(r[10]) + '</b><span>Conformal range</span></div>'
      + '<div class="stat"><b>' + pct(r[11]) + '</b><span>Token odds &middot; ' + r[14] + ' cat / ' + r[15] + ' age peers</span></div>'
      + '<div class="stat"><b>' + money(r[13]) + '</b><span>Expected value</span></div>'
      + '<div class="stat"><b>' + money(r[5]) + '</b><span>TVL</span></div>'
      + '<div class="stat"><b>' + growth + '</b><span>7-day change</span></div>'
      + '<div class="stat"><b>' + days(r[7]) + '</b><span>Age</span></div>'
      + '<div class="stat"><b>' + esc(r[4].join(', ')) + '</b><span>Chains</span></div>'
      + '</div>'
      + '<h3>Farm plan — 7 steps</h3><ol>' + steps + '</ol>'
      + '<div class="calc"><h3 style="margin-top:0">Break-even calculator</h3>'
      + '<p class="small">Hypothetical reward pool and your deposit. Assumes farmers hold 1% of TVL, '
      + 'gas $' + r[18] + ' &times; 7 transactions, 2% friction, and a 5% yearly '
      + 'return for the ' + r[19] + '-week hold. Assumptions, not quotes.</p>'
      + '<div class="fields"><div>'
      + '<label for="calc-pool">Hypothetical total reward pool ($)</label>'
      + '<input id="calc-pool" type="number" min="0" step="100000" value="10000000">'
      + '</div><div>'
      + '<label for="calc-dep">Your deposit ($)</label>'
      + '<input id="calc-dep" type="number" min="0" step="10" value="' + r[17] + '">'
      + '</div></div>'
      + '<output id="calc-out"></output></div>';
    var dlg = document.getElementById('detail');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    calculator(r);
  }

  document.getElementById('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  document.getElementById('close-detail').addEventListener('click', function () {
    document.getElementById('detail').close();
  });
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  document.getElementById('cat').addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  document.getElementById('verdict').addEventListener('change', function (e) { state.verdict = e.target.value; render(); });
  document.getElementById('watch').addEventListener('change', function (e) { state.watch = e.target.checked; render(); });
  document.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = k === 'name' || k === 'category' || k === 'chains' ? 1 : -1; }
      render();
    });
  });

  fillCategories();
  render();
  renderPeers();

  // Deep links.
  var hash = (window.location.hash || '').replace(/^#/, '');
  var params = {};
  hash.split('&').forEach(function (part) {
    var kv = part.split('=');
    if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
  });
  if (params.verdict) {
    state.verdict = params.verdict;
    document.getElementById('verdict').value = params.verdict;
  }
  if (params.watch === '1') {
    state.watch = true;
    document.getElementById('watch').checked = true;
  }
  if (params.cat) {
    state.cat = params.cat;
    document.getElementById('cat').value = params.cat;
  }
  if (params.q) {
    state.q = params.q;
    document.getElementById('q').value = params.q;
  }
  render();
  if (params.detail) openDetail(params.detail);
  if (params.section) {
    var el = document.getElementById(params.section);
    if (el) el.scrollIntoView();
  }
})();
