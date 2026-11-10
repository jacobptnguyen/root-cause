# Agent workflow

Three agents each judge one data source. An email goes out only when one calls for action and
nobody blocks it. Code: `checkAndAdvise()` in `apps_script/Code.gs`, every 6 hours.

| Agent | Sees | Can say |
|---|---|---|
| **soil** | soil %, 24h change, target band, hours since last watering | water now / hold / fine |
| **temp** | temperature, 24h max, optimal range, bolt-risk temp | shade or cool / hold / fine |
| **forecast** | today's rain and max temp, bolt-risk temp | rain coming, hold off / prepare for heat / fine |

## Each run

**Gate, no Claude calls.** The first match ends the run:

1. Latest reading is over 90 min old: email "no sensor reading".
2. A reading can't be real (e.g. -127°C): email "a sensor reading looks wrong".
3. Soil is in band and temp is under the bolt-risk limit: log "OK".
4. An email went out in the last 5 hours: stop.
5. `AI_PAUSED` is `true`: stop.

The two failure emails are also skipped during the 5-hour cooldown.

**Round 1.** Each agent gets only its own facts and returns `{verdict: act|hold|fine, action, cites}`.

**Checks in code.** Any of these logs the reason and stops:

- Nobody said `act`.
- Anyone said `hold` (e.g. soil is dry but rain is forecast).
- An `act` or `hold` agent cited nothing, cited an unknown fact, or cited a number more than 0.5 off
  the real value.

**Round 2.** The forecast agent reviews the other agents' `act` recommendations. It may object only
when one of its own facts directly contradicts them. Soil and temp don't vote.

**Email.** The first `act` agent's sentence (soil, then temp, then forecast) goes out with the current
readings. If the forecast agent objected, the email says "No action needed right now" and gives its
reason instead. Any email starts the cooldown.

## Daily report

`sendDailyReport()` emails around 8am whether or not anything is wrong. Sonnet writes a short
plain-English summary, with the raw numbers below it so you can cross-check by hand. If the Claude
call fails, the numbers go out alone.

## Pausing

With `AI_PAUSED` set to `true`, no Claude calls are made and no daily report is sent. Sensor logging
and the two failure emails keep running.

## Edge cases

- A failed call or bad JSON counts as "no answer", so it can neither trigger nor veto an email.
- With no forecast or no temp reading, that agent sits out the run.
- Runs that stop at the checks don't start the cooldown, so a lasting problem re-runs the Haiku agents
  every 6 hours (a few calls per run).
- An unlogged watering looks like a sudden soil jump. `Events` dates have no time of day, so "hours
  since watering" is coarse.
- All three agents are the same model and lean toward agreeing. The number check in code is what
  makes agreement mean something.

Run `demo()` in the Apps Script editor to test the parsing and citation logic without API calls.
