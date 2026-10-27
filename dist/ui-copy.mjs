// Display-only metadata punctuation. Do not use this to rewrite saved snapshots,
// official source records, eligibility rules, or the order of route steps.
export function metaText(value) {
  if (typeof value !== 'string') return '';
  // Metadata enumerations may be written without spaces (정부·지자체). Keep
  // administrative terms intact, including the suffix in 거주 시·도를.
  return value.split(/(시·군·구|시·도)/u)
    .map((part,index) => index % 2 ? part : part.replace(/[ \t]*·[ \t]*/g, ', '))
    .join('');
}
