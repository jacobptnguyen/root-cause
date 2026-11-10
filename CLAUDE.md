# root-cause

One outdoor radish with sensors feeding AI agents that tell you exactly what to do right now. The
agents are the point, not the logging.

## How it fits together
- `esp32/sensor_logger/sensor_logger.ino`: reads soil, light and temperature every 15 min and POSTs
  them to the Apps Script webhook.
- `apps_script/Code.gs`: writes readings to the Google Sheet, runs the agents, sends email, serves
  the dashboard.
- `apps_script/dashboard.html`: the public page.
- `agent-workflow.md`: how the agents decide.
- `targets.json`: every threshold with its source.
- `README.md`: parts list.

The backend, agents and dashboard are already deployed, so never suggest setting them up. Anything
that POSTs to the webhook feeds the live agents and can send email.

## Hardware
- Wired USB power from a wall brick kept indoors or covered. ESP32 Wi-Fi is 2.4 GHz only.
- Pins: soil AOUT to GPIO34, BH1750 SDA/SCL to GPIO21/22 (ADDR not connected), DS18B20 data to
  GPIO4 with a 4.7kΩ pull-up to 3V3. All sensors run from 3V3 and GND.
- BH1750 sits inside the clear-lid box behind a matte tape diffuser. Never in an opaque box.
- Soil and temperature cables exit through the glands. Power goes through a drilled, silicone-sealed
  hole with a drip loop.
- Flash with a data-capable micro-USB cable. Charge-only cables fail.

Check during the build:
- The soil sensor's circuit sits outside in the rain. Seal it with silicone, then calibrate, because
  the coating can shift readings. Its timer chip must be a TLC555, since an NE555 won't run reliably
  from 3V3.
- Some 38-pin ESP32 boards leave no free holes on one side of the breadboard. GPIO34, 4, 21, 22, 3V3
  and GND all have to be reachable.
- A gland only seals around a round cable. Fill any gap around a flat or loose-wire cable with silicone.
- A silicone cartridge needs a caulk gun. A squeeze tube doesn't.

## Sheet tabs
- `Log`: timestamp, soil_pct, lux, temp_c. Missing readings are gaps, never zeros.
- `Events`: date, watered_mm, notes, one row per watering. Feeds the soil agent.
- `AgentLog`: timestamp, action_needed, message.

## Dashboard
- The audience is recruiters seeing the plant's progress, so no owner instructions or controls.
- Only rows on or after `PLANT_DATE` in `Code.gs` appear. Dry-run data stays in the Sheet.
- Publish from `apps_script/` with `clasp push -f`, then `clasp redeploy <id>` using the versioned
  deployment from `clasp deployments` (not @HEAD). Never make a new deployment: the URL would change
  and the ESP32 would keep posting to the old code. That ID is part of the secret webhook URL, so keep
  it out of tracked files.
- To pause every Claude call, set the `AI_PAUSED` Script Property to `true`.

## Rules
- Simplest thing that works: the Sheet, Apps Script and one webpage. No database or framework.
- Every threshold and its source lives in `targets.json`. `TARGETS` in `Code.gs` is the copy the code
  reads, so change both together.
- The agents reason from real readings and real targets, and never invent either.
- Agent calls verify conditions, not health. Only photos and the harvest verify the plant.
- Don't touch the logger during the grow except to fix a failure.
- Treat the repo as public. Wi-Fi details, webhook URL and shared secret go in the git-ignored
  `esp32/sensor_logger/secrets.h`. The API key, `SHARED_SECRET` and `LAT`/`LON` go in Script
  Properties. Strip GPS metadata from photos.

## Plan
Build and calibrate, run a 2-day outdoor dry run, plant, grow 25-30 days acting on the emails and
logging each watering with a weekly photo, then record root weight and diameter at harvest.

Before planting:
- Create `secrets.h` from `secrets.example.h`.
- Replace `SOIL_DRY_RAW` and `SOIL_WET_RAW` with this sensor's readings (dry air = 0%, cup of water = 100%).
- Set the soil bands from real soil during the dry run.
- Set `PLANT_DATE` and publish.

Final deliverable: dashboard, trend chart, the agents' call history, harvest result against those
calls, and the full README per the global structure.
