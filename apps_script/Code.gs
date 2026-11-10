const PROPS = PropertiesService.getScriptProperties();
const SHEET = SpreadsheetApp.getActiveSpreadsheet();
const LOG_SHEET = SHEET.getSheetByName('Log');
const AGENT_LOG_SHEET = SHEET.getSheetByName('AgentLog');
const EVENTS_SHEET = SHEET.getSheetByName('Events');

// Copy of targets.json, where the sources live. Change both together.
const TARGETS = {
  soil_pct: {
    germination: { min: 70, max: 90 },
    leaf_growth: { min: 60, max: 80 },
    bulbing: { min: 60, max: 80 }
  },
  temp_c: { optimal_min: 10, optimal_max: 18, bolt_risk_above: 25 },
  dli_mol_per_m2_day: { min: 12, max: 15 },
  lux_to_ppfd: 54,
  stage_days: { germination: [0, 10], leaf_growth: [11, 15], bulbing: [16, 30] }
};

const PLANT_DATE = null; // 'YYYY-MM-DD', set on planting day

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  if (data.token !== PROPS.getProperty('SHARED_SECRET')) {
    return ContentService.createTextOutput('forbidden').setMimeType(ContentService.MimeType.TEXT);
  }
  LOG_SHEET.appendRow([new Date(), data.soil_pct, data.lux, data.temp_c]);
  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  // Apps Script ignores a viewport tag inside the HTML file, so phones need it set here.
  return HtmlService.createTemplateFromFile('dashboard').evaluate()
    .setTitle('root-cause dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Log rows with a numeric soil reading. Skips a header row or an empty sheet.
function logRows() {
  return LOG_SHEET.getDataRange().getValues().filter(r => typeof r[1] === 'number');
}

// google.script.run fails if a Date is in the returned data, so send ISO strings.
function iso(d) {
  return d instanceof Date ? d.toISOString() : null;
}

const isPaused = () => PROPS.getProperty('AI_PAUSED') === 'true';

function sincePlanting(row) {
  return row[0] instanceof Date && !!PLANT_DATE && row[0].getTime() >= new Date(PLANT_DATE).getTime();
}

function getDashboardData() {
  const recent = logRows().filter(sincePlanting).slice(-96); // last ~24h at 15-min intervals
  const latest = recent[recent.length - 1] || [];
  const stage = currentStage();
  const band = stage ? TARGETS.soil_pct[stage] : null;

  const agentRows = AGENT_LOG_SHEET.getDataRange().getValues()
    .filter(sincePlanting).reverse();

  return {
    latest: { time: iso(latest[0]), soil_pct: latest[1], lux: latest[2], temp_c: latest[3] },
    stage: stage,
    soil_band: band,
    temp_targets: TARGETS.temp_c,
    history: recent.map(r => ({ time: iso(r[0]), soil_pct: r[1], lux: r[2], temp_c: r[3] })),
    agent_log: agentRows.map(r => ({ time: iso(r[0]), action_needed: r[1], message: r[2] }))
  };
}

// Keeps rows where a sensor was missing, since the log shows those as gaps.
function getReadings() {
  return LOG_SHEET.getDataRange().getValues().filter(sincePlanting)
    .map(r => ({ time: iso(r[0]), soil_pct: r[1], lux: r[2], temp_c: r[3] }));
}

function currentStage() {
  if (!PLANT_DATE) return null;
  const days = Math.floor((Date.now() - new Date(PLANT_DATE).getTime()) / 86400000);
  for (const [stage, [start, end]] of Object.entries(TARGETS.stage_days)) {
    if (days >= start && days <= end) return stage;
  }
  return 'bulbing'; // past day 30, keep using the last band
}

function getForecast_() {
  const lat = PROPS.getProperty('LAT');
  const lon = PROPS.getProperty('LON');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_sum,temperature_2m_max&forecast_days=3&timezone=auto`;
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  return JSON.parse(resp.getContentText());
}

function callClaude_(prompt, model = 'claude-haiku-4-5-20251001', maxTokens = 200) {
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': PROPS.getProperty('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
    muteHttpExceptions: true
  });
  const json = JSON.parse(resp.getContentText());
  if (!(json.content && json.content[0])) Logger.log('Agent call failed: ' + resp.getContentText());
  return json.content && json.content[0] ? json.content[0].text : '';
}

const AGENT_RULES = 'Use only the facts given, never invent a reading or a target. Reply with JSON only.';
const AGENTS = {
  soil: 'You watch soil moisture for one outdoor radish plant. "act" = water now (or fix soil that is too wet), ' +
    '"hold" = acting now would be pointless or wrong, "fine" = soil is in band. ' +
    'If hours_since_watering is missing, no watering has been logged; that alone is not a reason to hold.',
  temp: 'You watch on-site temperature for one outdoor radish plant. "act" = it needs shade or a cooler root zone ' +
    '(bolting risk), "hold" = acting now would be pointless or wrong, "fine" = temperature is acceptable.',
  forecast: 'You watch the outside forecast for one outdoor radish plant. "hold" = rain makes watering pointless, ' +
    '"act" = coming heat needs preparation, "fine" = nothing notable.'
};
const LEAD_FACT = { soil: 'soil_pct', temp: 'temp_c', forecast: 'rain_mm' }; // agent is skipped without it
const VERDICTS = ['act', 'hold', 'fine'];
const ROUND1_TAIL = 'Reply JSON only: {"verdict":"act|hold|fine","action":"one short plain-English sentence ' +
  'telling the grower what to do","cites":{"<fact name>":<its exact number>}}. Cite at least one fact unless fine.';

function parseAgentJson(text) {
  const m = /\{[\s\S]*\}/.exec(text || '');
  try { return m ? JSON.parse(m[0]) : null; } catch (err) { return null; }
}

function badCites(cites, facts) {
  const entries = Object.entries(cites || {});
  if (!entries.length) return ['(no cites)'];
  return entries
    .filter(([k, v]) => !(k in facts) || !(Math.abs(v - facts[k]) <= 0.5))
    .map(([k]) => k);
}

function ask_(name, facts, tail) {
  return parseAgentJson(callClaude_(`${AGENTS[name]} ${AGENT_RULES}\nYour facts: ${JSON.stringify(facts)}\n${tail}`));
}

function hoursSinceWatering() {
  if (!EVENTS_SHEET) return null;
  const last = EVENTS_SHEET.getDataRange().getValues()
    .filter(r => r[0] instanceof Date && typeof r[1] === 'number' && r[1] > 0).pop();
  return last ? (Date.now() - last[0].getTime()) / 3600000 : null;
}

function agentFacts(recent, band, forecast) {
  const latest = recent[recent.length - 1];
  const temps = recent.map(r => r[3]).filter(t => typeof t === 'number');
  const hours = hoursSinceWatering();
  const all = {
    soil: {
      soil_pct: latest[1], band_min: band.min, band_max: band.max,
      soil_change_24h: Math.round((latest[1] - recent[0][1]) * 10) / 10,
      hours_since_watering: hours === null ? null : Math.round(hours)
    },
    temp: {
      temp_c: latest[3], temp_max_24h: temps.length ? Math.max(...temps) : null,
      bolt_risk_above: TARGETS.temp_c.bolt_risk_above,
      optimal_min: TARGETS.temp_c.optimal_min, optimal_max: TARGETS.temp_c.optimal_max
    },
    forecast: forecast ? {
      rain_mm: forecast.rain, forecast_max_c: forecast.maxTemp,
      bolt_risk_above: TARGETS.temp_c.bolt_risk_above
    } : {}
  };
  const facts = {};
  for (const [name, f] of Object.entries(all)) {
    const nums = Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === 'number'));
    if (LEAD_FACT[name] in nums) facts[name] = nums;
  }
  return facts;
}

// Readings outside these can't be real: the DS18B20 sends -127 unwired and 85 on power-up reset,
// and the BH1750 sketch sends -1 if not found.
const SENSOR_LIMITS = { temp_c: [-30, 50], lux: [0, 120000] };
function sensorFault(tempC, lux) {
  const bad = [];
  const [tLo, tHi] = SENSOR_LIMITS.temp_c, [lLo, lHi] = SENSOR_LIMITS.lux;
  if (typeof tempC === 'number' && !(tempC >= tLo && tempC <= tHi)) bad.push(`temperature ${tempC}C`);
  if (typeof lux === 'number' && !(lux >= lLo && lux <= lHi)) bad.push(`light ${lux} lux`);
  return bad.length ? `A sensor reading looks wrong (${bad.join(', ')}). Check that sensor's wiring.` : '';
}

// Checks run every 6h, so a 6h window here would skip every other ping whenever a run fires a few
// seconds early.
function onCooldown() {
  const last = AGENT_LOG_SHEET.getDataRange().getValues().filter(r => r[1] === true).pop();
  return !!last && Date.now() - new Date(last[0]).getTime() < 5 * 3600 * 1000;
}

function sendPing_(message, footer) {
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'root-cause: update',
    footer ? message + '\n\n' + footer : message);
  AGENT_LOG_SHEET.appendRow([new Date(), true, message]);
}

// Any dashboard visitor can call a public function from the browser (names ending in _ are blocked),
// so the two scheduled jobs only run when called by one of this project's own triggers.
function fromTrigger_(e) {
  return !!e && ScriptApp.getProjectTriggers().some(t => t.getUniqueId() === e.triggerUid);
}

function checkAndAdvise(e) {
  if (!fromTrigger_(e)) return;
  const rows = logRows();
  if (rows.length < 1) return;
  const [time, soilPct, lux, tempC] = rows[rows.length - 1];

  // A dead logger would otherwise look like "all fine" forever on its last reading.
  const ageMin = (Date.now() - new Date(time).getTime()) / 60000;
  if (ageMin > 90) {
    if (!onCooldown()) {
      sendPing_(`No sensor reading for ${Math.round(ageMin)} min. Check the ESP32's power and Wi-Fi.`);
    }
    return;
  }

  const fault = sensorFault(tempC, lux);
  if (fault) {
    if (!onCooldown()) sendPing_(fault);
    return;
  }

  const stage = currentStage();
  const band = stage ? TARGETS.soil_pct[stage] : TARGETS.soil_pct.leaf_growth;

  const soilLow = soilPct < band.min;
  const soilHigh = soilPct > band.max;
  const tooHot = tempC > TARGETS.temp_c.bolt_risk_above;

  if (!soilLow && !soilHigh && !tooHot) {
    AGENT_LOG_SHEET.appendRow([new Date(), false, 'OK — soil, temp in range.']);
    return;
  }
  if (onCooldown()) return;
  if (isPaused()) return;

  let forecast = null;
  try {
    const f = getForecast_();
    forecast = { rain: f.daily.precipitation_sum[0], maxTemp: f.daily.temperature_2m_max[0] };
  } catch (err) {
    // keep going without the forecast agent rather than fail the whole check
  }

  const skip = msg => AGENT_LOG_SHEET.appendRow([new Date(), false, msg]);
  const facts = agentFacts(rows.slice(-96), band, forecast);
  const names = Object.keys(facts);

  const r1 = {};
  names.forEach(n => {
    const v = ask_(n, facts[n], ROUND1_TAIL);
    if (v && VERDICTS.includes(v.verdict)) r1[n] = v;
  });
  const summary = names.map(n => `${n}: ${r1[n] ? r1[n].verdict : 'no answer'}`).join(', ');
  const said = verdict => names.filter(n => r1[n] && r1[n].verdict === verdict);

  const acts = said('act');
  if (!acts.length) return skip(`No agent called for action (${summary}).`);
  const holds = said('hold');
  if (holds.length) return skip(`Held: ${holds.map(n => `${n}: ${r1[n].action}`).join(' ')} (${summary}).`);
  const badNames = names.filter(n => r1[n] && r1[n].verdict !== 'fine' && badCites(r1[n].cites, facts[n]).length);
  if (badNames.length) return skip(`Blocked: ${badNames.join(', ')} cited numbers that don't match the readings (${summary}).`);

  const verdicts = {};
  names.forEach(n => { if (r1[n]) verdicts[n] = { verdict: r1[n].verdict, action: r1[n].action }; });
  const objections = [];
  names.filter(n => n === 'forecast').forEach(n => {
    const others = {};
    Object.keys(verdicts).filter(k => k !== n && verdicts[k].verdict === 'act').forEach(k => { others[k] = verdicts[k]; });
    if (!Object.keys(others).length) return;
    const tail = `Recommendations from the other agents: ${JSON.stringify(others)}. Object only if one of your own ` +
      `facts directly contradicts what they recommend (for example they say water now but your facts show ` +
      `rain coming). Your own verdict being "fine" is not a contradiction, and watering is not a way to cool ` +
      `or heat anything. Anything outside your own facts is not yours to judge, so agree. Reply JSON only: ` +
      `{"vote":"agree|object","reason":"one sentence"}`;
    const v = ask_(n, facts[n], tail);
    if (v && v.vote === 'object') objections.push(`${n}: ${v.reason}`);
  });
  const readings = [['Soil', soilPct, '%'], ['Temp', tempC, '°C'], ['Light', lux, ' lux']]
    .filter(([, v]) => typeof v === 'number').map(([k, v, u]) => `${k} ${Math.round(v * 10) / 10}${u}`).join(' · ');
  if (objections.length) return sendPing_(`No action needed right now — ${objections.join(' ')}`, readings);

  sendPing_(r1[acts[0]].action, readings);
}

// Run by hand in the Apps Script editor: checks the pure parsing and cite logic, no API calls.
function demo() {
  const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
  eq(parseAgentJson('```json\n{"verdict":"act"}\n```'), { verdict: 'act' });
  eq(parseAgentJson('nope'), null);
  eq(parseAgentJson(''), null);
  eq(stats([50, '', 54]), { now: 54, min: 50, max: 54 });
  eq(stats(['']), null);
  const txt = dailyReportText([[0, 50, 900, 17], [0, 54, 1800, '']], null, [], null);
  if (!/Soil moisture: now 54%, low 50%, high 54%/.test(txt) || !/unavailable/.test(txt) || !/none/.test(txt)) throw new Error(txt);
  eq(sensorFault(17, 20000), '');
  eq(sensorFault('', ''), '');                                  // gaps are not faults
  eq(/temperature -127C/.test(sensorFault(-127, 500)), true);
  eq(/light -1 lux/.test(sensorFault(17, -1)), true);
  const facts = { soil_pct: 54, band_min: 60 };
  eq(badCites({ soil_pct: 54.2, band_min: 60 }, facts), []);   // rounding is fine
  eq(badCites({ soil_pct: 40 }, facts), ['soil_pct']);          // wrong number
  eq(badCites({ rain_mm: 5 }, facts), ['rain_mm']);             // unknown fact
  eq(badCites({ soil_pct: 'x' }, facts), ['soil_pct']);         // non-number
  eq(badCites({}, facts), ['(no cites)']);                      // ungrounded
  const f = agentFacts([[0, 50, 1, ''], [0, 54, 1, '']], { min: 60, max: 80 }, null);
  eq(Object.keys(f), ['soil']);                                 // no temp reading, no forecast: those agents drop out
  eq(f.soil.soil_change_24h, 4);
  Logger.log('demo ok');
}

const READING_INTERVAL_S = 900;

const round1 = n => Math.round(n * 10) / 10;

function stats(vals) {
  const v = vals.filter(x => typeof x === 'number');
  return v.length ? { now: v[v.length - 1], min: Math.min(...v), max: Math.max(...v) } : null;
}

const fmtStats = (s, unit) => s
  ? `now ${round1(s.now)}${unit}, low ${round1(s.min)}${unit}, high ${round1(s.max)}${unit}`
  : 'no readings';

function dailyReportText(rows, forecast, pings, stage) {
  const soil = stats(rows.map(r => r[1]));
  const temp = stats(rows.map(r => r[3]));
  const luxVals = rows.map(r => r[2]).filter(x => typeof x === 'number');
  const dli = luxVals.reduce((s, l) => s + l, 0) / TARGETS.lux_to_ppfd * READING_INTERVAL_S / 1e6;
  const band = stage ? TARGETS.soil_pct[stage] : null;
  const t = TARGETS.temp_c;

  const lines = [
    `Growth stage: ${stage || 'not planted yet'}${band ? ` (soil target ${band.min}-${band.max}%)` : ''}`,
    `Readings in the last 24h: ${rows.length}`,
    '',
    `Soil moisture: ${fmtStats(soil, '%')}`,
    `Temperature: ${fmtStats(temp, 'C')} (best ${t.optimal_min}-${t.optimal_max}C, bolting risk above ${t.bolt_risk_above}C)`,
    `Light: ${luxVals.length ? `peak ${Math.round(Math.max(...luxVals))} lux, ` +
      `about ${round1(dli)} mol/m2 over the last 24h (target ${TARGETS.dli_mol_per_m2_day.min}-${TARGETS.dli_mol_per_m2_day.max})` : 'no readings'}`,
    '',
    'Forecast:'
  ];
  if (forecast) {
    forecast.time.forEach((day, i) => {
      lines.push(`  ${day}: ${forecast.precipitation_sum[i]} mm rain, ${forecast.temperature_2m_max[i]}C high`);
    });
  } else {
    lines.push('  unavailable');
  }
  lines.push('', 'Agent emails in the last 24h: ' + (pings.length ? '' : 'none'));
  pings.forEach(p => lines.push(`  - ${p}`));
  return lines.join('\n');
}

const REPORT_MODEL = 'claude-sonnet-5-5';
const REPORT_PROMPT = 'You write the daily report for one outdoor radish plant. The grower is not a gardener. ' +
  'In under 120 words of plain English, say how soil, temperature and light are doing against the targets, ' +
  'what the next 3 days of weather mean for the plant, and whether anything needs doing (if nothing, say so). ' +
  'Use only the numbers below, never invent a reading or a target, and say so if data is missing.\n\n';

function sendDailyReport(e) {
  if (!fromTrigger_(e)) return;
  if (isPaused()) return;
  const since = Date.now() - 24 * 3600 * 1000;
  const rows = logRows().filter(r => r[0] instanceof Date && r[0].getTime() >= since);
  const pings = AGENT_LOG_SHEET.getDataRange().getValues()
    .filter(r => r[0] instanceof Date && r[0].getTime() >= since && r[1] === true).map(r => r[2]);
  let forecast = null;
  try { forecast = getForecast_().daily; } catch (err) { /* report goes out without it */ }
  const numbers = dailyReportText(rows, forecast, pings, currentStage());
  const summary = callClaude_(REPORT_PROMPT + numbers, REPORT_MODEL, 400);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'root-cause daily report',
    (summary ? summary + '\n\n--- the numbers ---\n' : '') + numbers);
}

// Run by hand from the Apps Script editor. Safe to rerun: it clears the old triggers first.
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkAndAdvise')
    .timeBased()
    .everyHours(6)
    .create();
  ScriptApp.newTrigger('sendDailyReport')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
}
