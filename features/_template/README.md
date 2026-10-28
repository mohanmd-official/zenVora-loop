# Feature template

1. Copy this folder: `cp -r features/_template features/my-feature`
2. In `feature.json` set `"name"`, `"order"` (where its tab sits) and `"enabled": true`.
3. Rename the view / tab ids (`example`, `#exampleTab`, `#v-example`, `#exampleBody`) and the flag key.
4. Write the code in `js/` (files run in name order; keep `99-register.js` last) and styles in `css/`.
5. Put its Firestore rules in `rules.part` (they go inside `match /orgs/{o}`).
6. `python3 build.py` → then turn the feature on for an organization in Super Admin → Organizations.

Test that the app still works without it: `python3 build.py --only payroll,dental-clinic` (leaves your feature out) and
that it works alone: `python3 build.py --only my-feature` (both write to build/, not public/).
