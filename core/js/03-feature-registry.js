/* ================= feature registry =================
   Every folder in features/ ends with js/99-register.js, which calls ZL.add({...}). Core never calls a feature's own
   functions by name: it asks the registry. So a feature folder can be left out of the build (or a new one added)
   without touching core. Everything below is optional for a feature:

   id                                  the folder name, e.g. 'payroll'
   flags: [[key, label, about, needs]] switches the Super Admin turns on per organization (orgs/{id}.features[key])
   views: {name: {render, tab, on, key}}   its top-bar pages: render() draws it, tab is the tab's #id, on() = may this
                                       person see it, key = keyboard shortcut ('5' …)
   menu: {view, on, subs, cur, go, href, ordKey}   a master entry in the left "Features" menu with sub-pages
   route: {hash(view), apply(parts)}   page addresses (#/clinic/patients/<id>): hash returns null when not its view
   api: {...}                          functions other features may use: ZL.api('payroll').attSummary(...)
   onView(view, from) · reset() · start() · supportView() · expose(testHook)
   boardPanel()                        draws its panel above the Planning Board (e.g. organization reminders)
   remHint                             what "Organization reminders" means for this feature (Organization → Planning Board)
   link: {ok(link), open(link), label} tasks that point into this feature ("Open in Clinic →")
   home: {load(again), reset(), widgets:{id: {t, ic, d, ok, r, size, pin, ensure}}, defaults:[ids], quick(), after(), click(e)}
   person: {addHtml(), editHtml(m, me), read(where, role, m), titleTags(m), roleTags(m), managerHint, employeeHint}
*/
const ZL = {
  list: [], apis: {},
  add(f){
    this.list.push(f);
    (f.flags || []).forEach(x => FEATURES.push(x));
    if (f.api) this.apis[f.id] = f.api;
    if (f.home && f.home.widgets) Object.assign(WIDGETS, f.home.widgets);
  },
  api(id){ return this.apis[id] || null; },                  // null when that feature isn't in this build
  has(id){ return !!this.list.find(f => f.id === id); },
  each(hook, ...a){ for (const f of this.list) if (typeof f[hook] === 'function') f[hook](...a); },
  collect(hook, ...a){ return this.list.map(f => typeof f[hook] === 'function' ? f[hook](...a) : null).filter(x => x != null && x !== ''); },
  // a group may set its own order (e.g. person.order) when it should appear in a different order than the features
  part(group, hook, ...a){ return this.list.slice().sort((x, y) => ((x[group] || {}).order || 50) - ((y[group] || {}).order || 50)).map(f => f[group] && typeof f[group][hook] === 'function' ? f[group][hook](...a) : null).filter(x => x != null && x !== ''); },
  views(){ return this.list.flatMap(f => Object.entries(f.views || {})); },
  view(v){ const e = this.views().find(([k]) => k === v); return e ? e[1] : null; },
  linkOwner(link){ return link ? this.list.find(f => f.link && f.link.ok(link)) || null : null; },
};
function openLink(link){ const f = ZL.linkOwner(link); if (f) f.link.open(link); }
function resetFeatures(){ ZL.each('reset'); }
