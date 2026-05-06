/**
 * Reads the generated JSON and outputs SQL INSERT batches to stdout.
 * Each batch has BATCH_SIZE rows.
 */
import { readFileSync } from 'fs';

const tmpDir = process.env.TEMP || process.env.TMP || '/tmp';
const records = JSON.parse(readFileSync(`${tmpDir}/montemina_data.json`, 'utf8'));
const BATCH_SIZE = 80;

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  // String — escape single quotes
  return `'${String(v).replace(/'/g, "''")}'`;
}

const cols = [
  'project_id','wbs_code','description','hh','start_date','end_date',
  'is_summary','is_milestone','parent_wbs','sort_order','discipline',
  'status','progress','program_source'
];

const batches = [];
for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const chunk = records.slice(i, i + BATCH_SIZE);
  const values = chunk.map(r =>
    `(${cols.map(c => sqlVal(r[c])).join(',')})`
  ).join(',\n');
  batches.push(`INSERT INTO program_activities (${cols.join(',')}) VALUES\n${values};`);
}

// Output as JSON array of SQL strings
const { writeFileSync } = await import('fs');
writeFileSync(`${tmpDir}/montemina_sql_batches.json`, JSON.stringify(batches));
process.stderr.write(`Wrote ${batches.length} batches to ${tmpDir}/montemina_sql_batches.json\n`);
