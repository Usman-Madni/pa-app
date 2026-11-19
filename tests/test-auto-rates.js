// Automatic rates: once a day, a day with no rates gets the world prices (gold and silver in dollars an ounce, the
// dollar in rupees) as rupees a tola and rupees for each currency in use, marked Automatic. Only prices are asked for.
// A rate typed for the day replaces it; a zakat record on a day with only a fill-in warns; it can be turned off; a
// read-only device never fills in; no connection, no harm.
const { loadApp, check, done, tick } = require('./helpers');

(async () => {
  const asked = [];
  const answers = { XAU: { price: 3110.35 }, XAG: { price: 31.1035 }, FX: { rates: { USD: 1, PKR: 280, EUR: 0.9, GBP: 0.8 } } };
  const fakeFetch = async (url) => {
    asked.push(url);
    const key = /XAU$/.test(url) ? 'XAU' : /XAG$/.test(url) ? 'XAG' : /er-api/.test(url) ? 'FX' : '';
    return key ? { ok: true, json: async () => answers[key] } : { ok: false };
  };
  const app = loadApp({ fetch: fakeFetch });
  const { win, doc, PA } = app;
  const AR = win.eval('AutoRates');
  const A = win.eval('Assets');
  const today = PA.toISO(new Date());
  await tick(50);

  // Worked out
  const r = AR.rates(3110.35, 31.1035, answers.FX.rates ? answers.FX : null);
  const perTola = Math.round((3110.35 / 31.1034768) * 11.7 * 280);
  check(r.gold['24'] === perTola && r.gold['22'] === Math.round(perTola * 22 / 24) && r.silver === Math.round((31.1035 / 31.1034768) * 11.7 * 280), 'gold by karat and silver in rupees a tola (11.7 g) from dollars an ounce');
  check(r.fx.USD === 280, 'the dollar in rupees');

  // Filled in on start
  const e = PA.DB.rates.find((x) => x.date === today);
  check(e && e.auto && e.id === `auto-${today}` && e.gold['24'] === perTola, 'today gets the world prices, marked Automatic (one id on both devices)');
  check(asked.every((u) => /^https:\/\/(api\.gold-api\.com|open\.er-api\.com)\//.test(u) && !/[?&]/.test(u)), 'only the price services are asked, with nothing about you');
  const n = asked.length;
  await AR.fill();
  check(asked.length === n, 'once a day');
  doc.querySelector('[data-view="assets"]').click();
  doc.querySelector('[data-asset-tab="rates"]').click();
  check(/Automatic/.test(doc.querySelector('#main .list').textContent) && doc.querySelector('[data-auto-rates]').checked, 'the Rates tab marks it Automatic, with the setting to turn it off');

  // A zakat record on a day with only a fill-in warns
  win.eval('People').setZakat('me', 15, 8);
  A.add({ kind: 'cash', name: 'Savings', currency: 'PKR', amount: 1000000, date: today });
  check(win.eval('Zakat').checks('me', today).some((c) => /automatic world prices/.test(c)), 'Make record warns that the day has only a fill-in, not the sarafa rate');
  // A typed rate replaces it
  A.setRates({ date: today, gold: { 22: 500000 }, silver: 6000, fx: {} });
  win.eval('changed')('rates');
  const typed = PA.DB.rates.filter((x) => x.date === today);
  check(typed.length === 1 && !typed[0].auto && typed[0].silver === 6000, 'a rate typed for the day replaces the fill-in');
  check(!win.eval('Zakat').checks('me', today).some((c) => /automatic world prices/.test(c)), 'and the warning goes');

  // Off; read-only; no connection
  const box = doc.querySelector('[data-auto-rates]');
  box.checked = false;
  box.dispatchEvent(new win.Event('change', { bubbles: true }));
  check(AR.on() === false, 'it can be turned off (on this device)');
  check(!app.errors.length, 'no script errors');
  app.close();

  const ro = loadApp({ fsa: false, fetch: fakeFetch });
  await tick(50);
  check(!ro.PA.DB.rates.length, 'a read-only device never fills in');
  ro.close();

  const off = loadApp({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await tick(50);
  check(!off.PA.DB.rates.length && !off.errors.length, 'no connection: nothing filled in, no error (it tries again later)');
  off.close();
  done();
})();
