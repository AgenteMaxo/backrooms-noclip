const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanLinkTarget,
  links,
  plainText,
  templateParams,
  parseClass,
  parsePage,
  buildTitleResolver,
  resolvePageLinks,
  classifyPage,
} = require('./parse');

function page(title, categories, wikitext) {
  return { pageid: 1, title, categories, timestamp: '2026-07-05T00:00:00Z', wikitext };
}

test('templateParams no deja una llave de cierre en el nombre', () => {
  const params = templateParams('{{Class 3}}', 'Class');
  assert.equal(params._name, 'Class 3');
});

test('normaliza variantes comunes y descarta enlaces de namespaces técnicos', () => {
  assert.equal(cleanLinkTarget(' level_34#Exits '), 'Level 34');
  assert.equal(cleanLinkTarget('the_Void'), 'The Void');
  assert.deepEqual(links('[[Special:RandomInCategory/Levels]] [[Level_1]]'), ['Level 1']);
});

test('parseClass interpreta clases estándar, ambientales y personalizadas', () => {
  assert.deepEqual(
    { label: parseClass('{{Class 3}}').label, numeric: parseClass('{{Class 3}}').numeric },
    { label: '3', numeric: '3' }
  );
  assert.equal(parseClass('{{Class 3e}}').environmental, true);
  const custom = parseClass(
    '{{Class Custom Image|class=4|safety=<b>Unsafe</b>|security=Unstable|entity=High Entity Count}}'
  );
  assert.equal(custom.numeric, '4');
  assert.equal(custom.safety, 'Unsafe');
  assert.equal(custom.entityLevel, 'High Entity Count');
  const alt = parseClass('{{Alt Class|ext=4|env=3|ent=2}}');
  assert.equal(alt.label, 'Threat Index');
  assert.equal(alt.exitLevel, '4');
  assert.equal(alt.environmentLevel, '3');
});

test('parsea entradas y salidas con subencabezados dentro de una sección combinada', () => {
  const parsed = parsePage(page('Level Test', ['Levels'], `
{{Class 1}}
== Description ==
Un lugar de prueba.
== Entrances & Exits ==
=== Entrances ===
* A door from [[Level_0]].
=== Exits ===
* Follow a corridor to
  [[Level 1]].
`));
  assert.deepEqual(parsed.entrances[0].targets, ['Level 0']);
  assert.deepEqual(parsed.exits[0].targets, ['Level 1']);
});

test('parsea pseudoencabezados decorados de entradas y salidas', () => {
  const parsed = parsePage(page('Level Test', ['Levels'], `
== Entrances and Exits ==
<span style="color:red">'''Entrances'''</span>
* Enter from [[Level 2]].
'''Exits'''
* Leave through a door to [[Level 3]].
`));
  assert.deepEqual(parsed.entrances[0].targets, ['Level 2']);
  assert.deepEqual(parsed.exits[0].targets, ['Level 3']);
});

test('separa entradas y salidas redactadas como prosa en una sección combinada', () => {
  const parsed = parsePage(page('Level Test', ['Levels'], `
== Entrances & Exits ==
The most common entrance is a door from [[Level 4]]. This entrance is uncommon.
The primary exit is a staircase leading to [[Level 5]].
`));
  assert.deepEqual(parsed.entrances[0].targets, ['Level 4']);
  assert.deepEqual(parsed.exits[0].targets, ['Level 5']);
});

test('normaliza títulos enlazados contra el título canónico', () => {
  const pages = [
    page('Level 0', ['Levels'], ''),
    page('Source', ['Levels'], '== Exits ==\n* Go to [[level_0]].'),
  ];
  const resolver = buildTitleResolver(pages);
  const parsed = resolvePageLinks(parsePage(pages[1]), resolver);
  assert.deepEqual(parsed.exits[0].targets, ['Level 0']);
});

test('una página multicategoría se conserva en todas sus colecciones', () => {
  const collections = { levels: {}, entities: {}, objects: {}, others: {} };
  const source = page('Hybrid', ['Levels', 'Entities', 'Objects', 'Phenomena'], '');
  classifyPage(source, parsePage(source), collections);
  for (const collection of Object.values(collections)) assert.ok(collection.Hybrid);
});

test('plainText elimina metadatos y tablas decorativas', () => {
  assert.equal(
    plainText('__NOTOC__\n{| class="wikitable"\n| basura\n|}\nTexto&nbsp;útil.'),
    'Texto útil.'
  );
});
