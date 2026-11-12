// DataLab — build supabase/datalab_full.sql: every migration in order + seed.sql + seed_scenarios.sql,
// to paste into the Supabase SQL Editor and run once.
// usage: node supabase/scripts/build-full.mjs   (writes supabase/datalab_full.sql)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrations = readdirSync(path.join(dir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
// the catalog seed goes right after the first release's migrations (20261005…, which create the tables it
// fills): the later ones may need its rows (costume skins → shop categories), as on a database updated over time
const first = migrations.filter((f) => f.startsWith('20261005')), later = migrations.filter((f) => !f.startsWith('20261005'));
const parts = first.map((f) => ['migrations/' + f, f]).concat([['seed.sql', 'seed.sql']], later.map((f) => ['migrations/' + f, f]), [['seed_scenarios.sql', 'seed_scenarios.sql']]);
const bar = '-- ===================================================================';
let out = '-- DataLab · SQL completo (gerado por supabase/scripts/build-full.mjs: migrations da 1ª versão, seed, migrations seguintes, seed dos cenários).\n' +
  '-- Cole no SQL Editor do Supabase e execute uma vez. Fonte da verdade: supabase/migrations/*.sql, seed.sql e seed_scenarios.sql\n' +
  '-- (este arquivo é só a concatenação).\n';
for (const [file, label] of parts) out += '\n' + bar + '\n-- ' + label + '\n' + bar + '\n' + readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '').trimEnd() + '\n';
writeFileSync(path.join(dir, 'datalab_full.sql'), out);
console.log('datalab_full.sql: ' + parts.length + ' partes, ' + out.length + ' bytes');
