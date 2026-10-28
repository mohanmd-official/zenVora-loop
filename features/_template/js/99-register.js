/* ================= Example feature: how it plugs into core (all hooks: core/js/03-feature-registry.js) ================= */
ZL.add({
  id:'_template',
  flags:[['example', 'Example', 'what the Super Admin sees next to the switch']],      // orgs/{id}.features.example
  views:{example:{render:renderExample, tab:'#exampleTab', on:() => feat('example')}},
  reset(){ ex.key = ''; },                            // signed out / another organization: forget cached data
  // optional: menu (left "Features" menu with sub-pages), route, home {widgets, quick …}, person {…}, boardPanel, link, api
});
