// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, plus the live-token and set-aside views. No network: every
// byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', watch: false, early: false, sort: 'implied', dir: -1, selected: null };
  var lab = { base: DATA.model.base_multiple, weight: DATA.model.growth_weight, peak: DATA.model.maturity_peak_days };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var excess = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d - (row.category_median_growth || 0);
    excess = Math.min(model.excess_cap, Math.max(model.excess_floor, excess));
    var growthMult = 1 + (excess / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity;
    if (age <= model.maturity_peak_days) {
      maturity = model.maturity_floor + (1 - model.maturity_floor) * (Math.min(Math.max(age, 0), model.maturity_peak_days) / model.maturity_peak_days);
    } else {
      maturity = 1 - model.maturity_fade * (Math.min(age - model.maturity_peak_days, model.maturity_fade_days) / model.maturity_fade_days);
    }
    var chainMult = 1 + model.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_cap);
    // The multiple first, then TVL times the multiple: the same order lib/model.ts multiplies in,
    // so the recompute lands on the same dollar board.json carries.
    var multiple = model.base_multiple * growthMult * maturity * chainMult;
    return Math.max(1, Math.round(row.tvl_usd * multiple));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  var CHAIN_GAS = { Ethereum: 6, Bitcoin: 2, Solana: 0.01, Base: 0.05, Arbitrum: 0.1, Optimism: 0.05, Binance: 0.15, Polygon: 0.02, Avalanche: 0.1, Unichain: 0.05, Monad: 0.05, 'Hyperliquid L1': 0.01, Plasma: 0.05, Linea: 0.05, Scroll: 0.1, zkSync: 0.1, Sui: 0.01, Aptos: 0.01, Mantle: 0.05, Blast: 0.05, Berachain: 0.05, Sei: 0.01, Tron: 1, Fantom: 0.05, Gnosis: 0.05, Mode: 0.05, Ink: 0.05, Zora: 0.05, Celo: 0.02, Kava: 0.1, Cronos: 0.1 };
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasUsd(chain) { return CHAIN_GAS[chain] === undefined ? 1 : CHAIN_GAS[chain]; }
  function gasWords(n) {
    if (n < 0.05) return 'about $0.01 of gas';
    if (n < 1) return 'about $' + n.toFixed(2) + ' of gas';
    return 'about $' + Math.round(n) + ' of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 25e7) return 150;
    if (p.tvl_usd >= 5e7) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionsFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return ['Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.', 'Borrow $10 of a stablecoin against the supply and repay it the same week.'];
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return ['Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.', 'Swap $5 through the same pool so the wallet shows both providing and trading.'];
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('leveraged') >= 0) return ['Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the shares.', 'Deposit $10 into a second strategy in the same vault so the wallet holds two positions.'];
    if (c.indexOf('bridge') >= 0) return ['Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.', 'Bridge $10 back the other way so the wallet shows a round trip.'];
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return ['Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.', 'Deposit $10 of the receipt token into a lending market so it is used, not idle.'];
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return ['Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.', 'Add $10 to the margin once so the wallet shows a second deposit.'];
    if (c.indexOf('rwa') >= 0) return ["Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.', 'Claim the first yield distribution instead of leaving it unclaimed.'];
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return ['Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.', 'Deposit $10 into a second vault the same curator runs so the wallet holds two vaults.'];
    if (c.indexOf('chain') >= 0) return ['Bridge $' + capital + " of USDC to " + chain + " through the chain's own bridge and use it in a native app.", "Swap $5 on the chain's main decentralised exchange."];
    if (c.indexOf('btc') >= 0 || c.indexOf('bitcoin') >= 0) return ['Mint $' + capital + ' of the BTC-backed asset on ' + chain + ' and hold it.', 'Deposit $10 of it as collateral in a lending market.'];
    if (c.indexOf('stable') >= 0) return ['Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.', 'Stake $10 of the stable asset where the protocol offers it.'];
    if (c.indexOf('insurance') >= 0) return ['Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.', 'Extend the cover by one week before it lapses.'];
    if (c.indexOf('prediction') >= 0) return ['Fund $' + capital + ' and place one market position on ' + name + '.', 'Place a $5 position in a second market on the same protocol.'];
    return ['Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.', 'Make a second $10 deposit of a different kind, such as a swap or a vote.'];
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var gas = gasUsd(chain);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var acts = actionsFor(p, capital, chain);
    var weekly = gasWords(gas);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gasWords(gas), time: '5 minutes' },
      { text: acts[0], cost: '$' + capital + ' of capital and ' + gasWords(gas), time: '15 minutes to set up' },
      { text: acts[1], cost: gasWords(gas), time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: weekly + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, and revoke the approvals once you unwind.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('early') === '1') state.early = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watch) params.set('watch', '1');
    if (state.early) params.set('early', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.early && r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds every rankable pre-token protocol below that floor, ' + DATA.early_size + ' of them. Implied value is a model, not a promise: it says what a token would be worth if the protocol’s record stayed as it is.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Above the floor, set aside' }), el('b', { text: String(DATA.set_aside_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chn = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chn.addEventListener('change', function () { state.chain = chn.value; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watch ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; if (state.watch) state.early = false; writeHash(); render(); });
    var earlyBox = el('input', { type: 'checkbox', id: 'early', checked: state.early ? 'checked' : null, 'aria-label': 'Early rows only' });
    earlyBox.addEventListener('change', function () { state.early = earlyBox.checked; if (state.early) state.watch = false; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var set = el('button', { type: 'button', 'aria-pressed': state.tab === 'set-aside' ? 'true' : 'false', text: 'Set aside', onclick: function () { state.tab = 'set-aside'; render(); } });
    var count = state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.set_aside.length + ' protocols set aside';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chn),
      el('label', { class: 'check', for: 'watch' }, watchBox, 'Watchlist only'),
      el('label', { class: 'check', for: 'early' }, earlyBox, 'Early only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live, set)),
      el('span', { class: 'count', text: count })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; state.early = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var nameCell = el('div', { class: 'name' },
        el('div', { class: 'name-line' },
          el('b', { text: r.name }),
          r.watchlist ? el('span', { class: 'tag watch', text: 'watchlist' }) : null
        ),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
      );
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, nameCell),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.multiple.toFixed(2) + 'x' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function setAsideTable() {
    var tbody = el('tbody');
    DATA.set_aside.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', null, el('span', { class: 'reason', text: r.reason }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Above the $50M floor but left off the watchlist: wrapped, staked or bridged products of tokens that trade, or children of protocols whose tokens trade. They are not pre-token launches, so the board does not rank them.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Why set aside' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var labTop = el('div', { class: 'lab-top', id: 'lab-top' });
    var labBox = el('div', { class: 'lab' },
      el('h3', { text: 'Model lab: change the model, see the top 5 move' }),
      el('p', { class: 'sub', text: 'The board above never changes: it is the entry’s model, fixed at submission. The lab only shows what a different model would pick, from the same snapshot figures.' }),
      labRow('base', 'Base multiple', 0.1, 0.5, 0.01, lab.base, function (v) { lab.base = v; }),
      labRow('weight', 'Growth weight', 0, 0.9, 0.05, lab.weight, function (v) { lab.weight = v; }),
      labRow('peak', 'Maturity peak (days)', 365, 1460, 5, lab.peak, function (v) { lab.peak = v; }),
      labTop
    );
    function labRow(id, label, min, max, step, value, set) {
      var input = el('input', { type: 'range', id: 'lab-' + id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      var out = el('output', { for: 'lab-' + id, text: String(value) });
      input.addEventListener('input', function () { set(parseFloat(input.value)); out.textContent = input.value; updateLab(); });
      return el('div', { class: 'lab-row' }, el('label', { for: 'lab-' + id, text: label }), input, out);
    }
    function updateLab() {
      var model = { base_multiple: lab.base, growth_weight: lab.weight, excess_floor: m.excess_floor, excess_cap: m.excess_cap, maturity_floor: m.maturity_floor, maturity_peak_days: lab.peak, maturity_fade: m.maturity_fade, maturity_fade_days: m.maturity_fade_days, unknown_age_days: m.unknown_age_days, chain_step: m.chain_step, chain_cap: m.chain_cap };
      var top = DATA.rows.map(function (r) { return { r: r, v: impliedOf(r, model) }; }).sort(function (a, b) { return b.v - a.v || (a.r.slug < b.r.slug ? -1 : 1); }).slice(0, 5);
      labTop.textContent = '';
      top.forEach(function (t, i) {
        labTop.appendChild(el('span', null, el('b', { text: (i + 1) + '. ' + t.r.name + ' ' }), fmtUsd(t.v)));
      });
    }
    updateLab();
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d - category median, ' + m.excess_floor + ', ' + m.excess_cap + ') / 100 x ' + m.growth_weight + ') x maturity(age) x (1 + ' + m.chain_step + ' x min(chains - 1, ' + m.chain_cap + ')) )'
      ),
      el('p', { class: 'sub', text: 'Growth is measured against the protocol’s own category: outgrowing its peers matters, not the market’s week. Maturity rises with age up to ' + m.maturity_peak_days + ' days, then fades: past about two and a half years with no token, a protocol is likelier to be deliberately tokenless. Age is the time since the protocol was first listed; an unlisted age uses ' + m.unknown_age_days + ' days. Above the floor the board trusts the watchlist, and the protocols it leaves out are listed under Set aside with their reason.' }),
      labBox
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · watchlist' : ' · early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Category median growth' }), el('b', { class: 'num', text: fmtPct(row.category_median_growth) })),
        el('div', null, el('span', { text: 'Excess growth vs peers' }), el('b', { class: 'num', text: fmtPct(row.excess_growth_pct) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Final multiple' }), el('b', { class: 'num', text: row.multiple.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price, and it says the protocol records no token, never that it has none.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : state.tab === 'live' ? liveTable() : setAsideTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
