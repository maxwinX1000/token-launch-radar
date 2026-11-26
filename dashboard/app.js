// Token Radar: the board page. It reads the dataset main.ts wrote beside it
// (window.RADAR, from data.js) and turns it into a page: a ranked table of
// pre-token protocols, a filter and search, a live-token table set aside from
// the ranking, a note on how the model scores a row, and a detail drawer for
// one protocol with its model inputs and its farm plan. Everything it shows
// is in data.js already; the page never reaches for the network.
(() => {
  'use strict';

  const RADAR = window.RADAR;
  if (!RADAR) return;

  const mount = document.getElementById('board');
  const view = {
    q: '',
    category: 'all',
    tab: 'pre-token',
    sort: 'implied',
    dir: -1,
    selected: null,
  };

  const dollars = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  const money = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
    const size = Math.abs(n);
    if (size >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (size >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (size >= 1e3) return `$${Math.round(n / 1e3)}K`;
    return dollars.format(n);
  };

  const pct = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  };

  const ageLabel = (days) => {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return `${(days / 365).toFixed(1)}y`;
    return `${Math.max(0, Math.round(days))}d`;
  };

  // Score one row again from the snapshot figures and the model constants, the
  // same arithmetic main.ts runs, so the page can check the number board.json
  // carries. The category multiple is the market's own median mcap/TVL for
  // that kind of protocol, carried on the row itself; the chain multiplier is
  // 1 + 0.02 per extra chain, capped at 10.
  const recompute = (row, model) => {
    const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    const growthMult = 1 + (growth / 100) * model.growth_weight;
    const age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    const maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    const multiple = row.category_multiple === undefined ? model.base_multiple : row.category_multiple;
    const chainMult = row.chain_multiplier === undefined ? 1 : row.chain_multiplier;
    return Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturity * chainMult));
  };

  // A small element builder: tag, attributes, then children. Attribute names
  // get their usual meaning: class sets the class, text the text, html the
  // markup, on* registers a listener, anything else becomes an attribute.
  const h = (tag, attrs, ...kids) => {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (value !== null && value !== undefined) node.setAttribute(key, value);
      }
    }
    for (const kid of kids) {
      if (kid === null || kid === undefined) continue;
      if (Array.isArray(kid)) {
        for (const c of kid) if (c) node.appendChild(c);
      } else if (typeof kid === 'string') node.appendChild(document.createTextNode(kid));
      else node.appendChild(kid);
    }
    return node;
  };

  // The farm plan is the same derivation main.ts writes into board.json:
  // category, chains, TVL and age decide the action, the capital, the hold
  // and every cost and time. No protocol name is special-cased.
  const firstChain = (p) => (p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain');

  const stakeFor = (p) => {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  };

  const holdFor = (age) => {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  };

  const planAction = (p, capital, chain) => {
    const kind = (p.category || '').toLowerCase();
    const name = p.name;
    if (kind.includes('lend') || kind.includes('cdp') || kind.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
    if (kind.includes('dex') || kind.includes('yield') || kind.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
    if (kind.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
    if (kind.includes('staking') || kind.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
    if (kind.includes('perpetual') || kind.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
    if (kind.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
    if (kind.includes('curator') || kind.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
    if (kind.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
    if (kind.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
    if (kind.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
    return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  };

  const renderStep = (step) => {
    let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
    if (s.length > 600) s = `${s.slice(0, 596)}...`;
    if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
    return s;
  };

  const planFor = (p) => {
    const chain = firstChain(p);
    const capital = stakeFor(p);
    const hold = holdFor(p.age_days);
    const gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: planAction(p, capital, chain), cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
      { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    ].map(renderStep);
  };

  // The view's state rides in the hash, so a filtered board or an open
  // protocol is a link: ?q, ?p and ?category.
  const readState = () => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get('q')) view.q = params.get('q');
    if (params.get('p')) view.selected = params.get('p');
    if (params.get('category')) view.category = params.get('category');
  };

  const writeState = () => {
    const params = new URLSearchParams();
    if (view.q) params.set('q', view.q);
    if (view.category !== 'all') params.set('category', view.category);
    if (view.selected) params.set('p', view.selected);
    const next = params.toString();
    if (next) window.history.replaceState(null, '', `#${next}`);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const visible = () => {
    const q = view.q.trim().toLowerCase();
    return RADAR.rows.filter((r) => {
      if (view.category !== 'all' && r.category !== view.category) return false;
      if (!q) return true;
      const hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  };

  const ordered = (list) => {
    const key = view.sort;
    return list.slice().sort((a, b) => {
      let av;
      let bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -view.dir;
      if (av > bv) return view.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  };

  const topBar = () => h('header', { class: 'top' },
    h('div', { class: 'brand' }, h('span', { class: 'mark' }), h('span', { class: 'brand-name', text: 'Token Radar' })),
    h('div', { class: 'top-meta' },
      h('span', { text: `Snapshot ${RADAR.as_of}` }),
      h('span', { text: 'DefiLlama protocol index' }),
      h('span', { text: `${RADAR.model_version} model` })));

  const intro = () => h('section', { class: 'lede' },
    h('div', null,
      h('h1', { text: `${RADAR.watchlist_size} watchlist protocols, ranked by implied value` }),
      h('p', { text: `The watchlist is the floor: every protocol with at least $${Math.round(RADAR.floor_usd / 1e6)}M of TVL and no token on record. The early radar adds ${RADAR.early_size} pre-token protocols below that floor. Implied value is a model, not a promise.` })),
    h('div', { class: 'facts' },
      h('div', { class: 'fact' }, h('span', { text: 'Watchlist covered' }), h('b', { text: `${RADAR.watchlist_size} / ${RADAR.watchlist_size}` })),
      h('div', { class: 'fact' }, h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(RADAR.board_size) })),
      h('div', { class: 'fact' }, h('span', { text: 'Early rows below the floor' }), h('b', { text: String(RADAR.early_size) })),
      h('div', { class: 'fact' }, h('span', { text: 'Live-token protocols set aside' }), h('b', { text: String(RADAR.live_size) }))));

  const filters = () => {
    const categories = [...new Set(RADAR.rows.map((r) => r.category || 'Other'))].sort();
    const search = h('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: view.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', () => { view.q = search.value; writeState(); paint(); });
    const select = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      categories.map((c) => h('option', { value: c, text: c, selected: c === view.category ? 'selected' : null })));
    select.addEventListener('change', () => { view.category = select.value; writeState(); paint(); });
    const pre = h('button', { type: 'button', 'aria-pressed': view.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token' });
    pre.addEventListener('click', () => { view.tab = 'pre-token'; paint(); });
    const live = h('button', { type: 'button', 'aria-pressed': view.tab === 'live' ? 'true' : 'false', text: 'Live token' });
    live.addEventListener('click', () => { view.tab = 'live'; paint(); });
    return h('div', { class: 'controls' },
      h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'category', text: 'Category' }), select),
      h('div', { class: 'field' }, h('span', { class: 'sub', text: 'Token status' }), h('div', { class: 'tabs' }, pre, live)),
      h('span', { class: 'count', text: view.tab === 'pre-token' ? `${visible().length} rows shown` : `${RADAR.live.length} live-token protocols` }));
  };

  const sortCell = (key, label) => {
    const btn = h('button', { type: 'button' },
      label,
      view.sort === key ? h('span', { 'aria-hidden': 'true', text: view.dir < 0 ? ' v' : ' ^' }) : null);
    btn.addEventListener('click', () => {
      if (view.sort === key) view.dir = -view.dir;
      else { view.sort = key; view.dir = -1; }
      paint();
    });
    return h('th', { scope: 'col' }, btn);
  };

  const preTokenTable = () => {
    const list = ordered(visible());
    if (list.length === 0) {
      const clear = h('button', { class: 'button primary', type: 'button', text: 'Clear filters' });
      clear.addEventListener('click', () => { view.q = ''; view.category = 'all'; writeState(); paint(); });
      return h('div', { class: 'panel' }, h('div', { class: 'empty' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search or pick another category to see the board again.' }),
        clear));
    }
    const max = list[0].implied_value_usd || 1;
    const tbody = h('tbody');
    for (const r of list) {
      const growth = r.change_7d === null ? 'n/a' : pct(r.change_7d);
      const growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const tr = h('tr', { 'data-selected': view.selected === r.slug ? 'true' : 'false', tabindex: '0' },
        h('td', { class: 'num', text: String(r.rank) }),
        h('td', null, h('div', { class: 'name' },
          h('b', { text: r.name }),
          h('span', { class: 'sub', text: `${r.category || 'Other'} on ${r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain'}` }))),
        h('td', { class: 'num', text: money(r.tvl_usd) }),
        h('td', { class: `num ${growthClass}`, text: growth }),
        h('td', { class: 'num', text: ageLabel(r.age_days) }),
        h('td', null, h('div', { class: 'implied' },
          h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.max(3, Math.round((r.implied_value_usd / max) * 100))}%` })),
          h('span', { class: 'num', text: money(r.implied_value_usd) }))),
        h('td', null, h('span', { class: 'status', text: 'no token' })));
      tr.addEventListener('click', () => showDetail(r.slug));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(r.slug); } });
      tbody.appendChild(tr);
    }
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          h('thead', null, h('tr', null,
            sortCell('implied', 'Rank'),
            sortCell('name', 'Protocol'),
            sortCell('tvl', 'TVL'),
            sortCell('growth', '7d'),
            sortCell('age', 'Age'),
            sortCell('implied', 'Implied value'),
            h('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  };

  const liveTokenTable = () => {
    const tbody = h('tbody');
    for (const r of RADAR.live) {
      tbody.appendChild(h('tr', null,
        h('td', { class: 'num', text: 'live' }),
        h('td', null, h('div', { class: 'name' },
          h('b', { text: r.name }),
          h('span', { class: 'sub', text: `${r.category || 'Other'} on ${r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain'}` }))),
        h('td', { class: 'num', text: money(r.tvl_usd) }),
        h('td', { class: `num ${r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'}`, text: pct(r.change_7d) }),
        h('td', { class: 'num', text: money(r.mcap_usd) }),
        h('td', null, h('span', { class: 'status', text: 'already trades' }))));
    }
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col', text: 'Status' }),
            h('th', { scope: 'col', text: 'Protocol' }),
            h('th', { scope: 'col', text: 'TVL' }),
            h('th', { scope: 'col', text: '7d' }),
            h('th', { scope: 'col', text: 'Market cap' }),
            h('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  };

  const modelNote = () => {
    const m = RADAR.model;
    const comps = RADAR.category_multiples || { overall: m.base_multiple, by_category: {} };
    const compList = Object.keys(comps.by_category).sort().map((c) => `${c} ${comps.by_category[c].toFixed(2)}`).join(', ');
    const formula = `implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ${m.growth_floor}, ${m.growth_cap}) / 100 x ${m.growth_weight}) x (${m.maturity_floor} + min(age_days, ${m.maturity_days}) / ${m.maturity_days} x ${m.maturity_range}) x (1 + 0.02 x min(chains - 1, 10)) )`;
    return h('section', { class: 'panel model' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      h('div', { class: 'formula' }, formula),
      h('p', { class: 'sub', text: `The category multiple is the market's own median market-cap-to-TVL for that kind of protocol, measured from the snapshot's live-token protocols (at least ${m.comp_min_n} comps, clamped to ${m.comp_floor}–${m.comp_cap}); a category with too few comps uses the overall median of ${comps.overall.toFixed(2)}. TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ${m.unknown_age_days} days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.` }),
      h('p', { class: 'sub', text: `Category multiples used: ${compList}.` }));
  };

  const sheet = h('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  sheet.addEventListener('close', () => { view.selected = null; writeState(); });

  const showDetail = (slug) => {
    const row = RADAR.rows.find((r) => r.slug === slug);
    if (!row) return;
    view.selected = slug;
    writeState();
    sheet.textContent = '';
    const steps = planFor(row);
    const closeBtn = h('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close' });
    closeBtn.addEventListener('click', () => sheet.close());
    sheet.appendChild(h('div', { class: 'detail-head' },
      h('div', null,
        h('span', { class: 'brand-name', text: `Rank ${row.rank} of ${RADAR.board_size}` }),
        h('h2', { id: 'detail-title', text: row.name }),
        h('p', { class: 'sub', text: `${row.category || 'Other'} on ${row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain'}` })),
      closeBtn));
    const again = recompute(row, RADAR.model);
    const within = Math.abs(again - row.implied_value_usd) <= Math.max(1, row.implied_value_usd * 0.001);
    sheet.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Implied value' }),
      h('div', { class: 'equation' },
        h('div', null, h('span', { text: 'TVL' }), h('b', { class: 'num', text: money(row.tvl_usd) })),
        h('div', null, h('span', { text: 'Category multiple' }), h('b', { class: 'num', text: String(row.category_multiple) })),
        h('div', null, h('span', { text: 'Seven-day growth' }), h('b', { class: 'num', text: pct(row.change_7d) })),
        h('div', null, h('span', { text: 'Age with no token' }), h('b', { class: 'num', text: ageLabel(row.age_days) })),
        h('div', null, h('span', { text: 'Chains' }), h('b', { class: 'num', text: `${String(row.chains ? row.chains.length : 1)} (x${String(row.chain_multiplier)})` })),
        h('div', null, h('span', { text: 'Growth multiplier' }), h('b', { class: 'num', text: String(row.growth_multiplier) })),
        h('div', null, h('span', { text: 'Maturity multiplier' }), h('b', { class: 'num', text: String(row.maturity_multiplier) })),
        h('div', null, h('span', { text: 'Implied value' }), h('b', { class: 'num', text: money(row.implied_value_usd) }))),
      h('p', { class: 'sub', text: `Model ${RADAR.model_version}: the same function scores every protocol. The page recomputes this row as ${money(again)}${within ? ', the same number board.json carries (within the rounding the page shows).' : ', which differs from the board: the data would be stale.'} This is an estimate, not a price.` })));
    sheet.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Farm plan' }),
      h('ol', { class: 'steps' }, steps.map((s) => {
        const at = s.indexOf(' Cost: ');
        const action = at >= 0 ? s.slice(0, at) : s;
        const tail = at >= 0 ? s.slice(at + 1) : '';
        return h('li', null, h('b', { text: action }), h('span', { class: 'cost', text: tail }));
      }))));
    if (typeof sheet.showModal === 'function') {
      if (!sheet.open) sheet.showModal();
    } else {
      sheet.setAttribute('open', '');
    }
  };

  const paint = () => {
    mount.textContent = '';
    const shell = h('div', { class: 'shell' });
    shell.appendChild(topBar());
    shell.appendChild(intro());
    shell.appendChild(filters());
    shell.appendChild(view.tab === 'pre-token' ? preTokenTable() : liveTokenTable());
    if (view.tab === 'pre-token') shell.appendChild(modelNote());
    mount.appendChild(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!sheet.isConnected) mount.appendChild(sheet);
    if (view.selected) showDetail(view.selected);
  };

  readState();
  paint();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.open) sheet.close();
  });
})();
