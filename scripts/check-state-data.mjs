#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fetchPublicText, githubClient, monitorRegistry, reportStateIssue } from './state-data-monitor.mjs';

const reportPath = 'state-data-report.json';
const reportOnly = process.argv.includes('--report-issues');
const centralRepository = process.env.GITHUB_REPOSITORY || 'ACCIDDA/measles-dashboard';
const origin = new URL(process.env.DASHBOARD_ORIGIN || `https://${centralRepository.split('/')[0].toLowerCase()}.github.io`).origin;

async function main() {
  if (reportOnly) {
    const results = JSON.parse(readFileSync(reportPath, 'utf8')).results;
    const failures = results.filter(result => result.errors.length);
    if (!failures.length) return;
    const token = process.env.STATE_DATA_ISSUES_TOKEN;
    if (!token) throw new Error('Set STATE_DATA_ISSUES_TOKEN with Issues: write access to the state repositories. Validation results are in state-data-report.json.');
    const request = githubClient(token);
    for (const result of failures) {
      try {
        const status = await reportStateIssue(result, {
          request, centralRepository,
          runUrl: `https://github.com/${centralRepository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        });
        console.log(`${result.state}: ${status.status} ${status.url || ''}`);
      } catch (error) {
        console.error(`Issue delivery failed: ${error.message}`);
        process.exitCode = 1;
      }
    }
    return;
  }
  const registry = JSON.parse(readFileSync('public/data/stateRegistry.json', 'utf8'));
  // Use the same county topology as useUnifiedMapData: a valid CSV with the
  // wrong county spelling still cannot join to the map. A shared CDN failure
  // fails this run without blaming every state's repository.
  let countyGeometries;
  if (Object.keys(registry).length) {
    const atlas = JSON.parse(await fetchPublicText('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json'));
    countyGeometries = atlas.objects.counties.geometries;
    if (!Array.isArray(countyGeometries) || !countyGeometries.length) throw new Error('Shared county topology is unavailable.');
  }
  const results = await monitorRegistry(registry, {
    request: githubClient(process.env.GITHUB_TOKEN),
    readText: fetchPublicText, origin, countyGeometries,
  });
  writeFileSync(reportPath, `${JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2)}\n`);
  const summary = results.length ? results.map(result => {
    const status = result.errors.length ? 'FAIL' : 'PASS';
    return `${result.state.toUpperCase()}: ${status}\n${[...result.errors, ...result.warnings].join('\n')}`;
  }).join('\n\n') : 'No registered states; no live endpoints were checked.';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    // Escape remote data rather than allowing it to inject workflow Markdown.
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `<pre>${summary.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre>\n`);
  }
  if (results.some(result => result.errors.length)) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
