# root-cause

## Parts

| # | Part | Picture | Link |
|---|---|---|---|
| 1 | Espressif ESP32-DevKitC dev board | <img src="photos/parts/01-esp32-devkitc.jpg" alt="Espressif ESP32-DevKitC dev board" width="200"> | [Amazon](https://www.amazon.com/dp/B087TNPQCV) |
| 2 | Capacitive soil moisture sensor v1.2 | <img src="photos/parts/02-soil-moisture-sensor.jpg" alt="Capacitive soil moisture sensor v1.2" width="200"> | [Amazon](https://www.amazon.com/dp/B07Z43WM7F) |
| 3 | NOYITO BH1750 light sensor | <img src="photos/parts/03-bh1750-light-sensor.jpg" alt="NOYITO BH1750 light sensor" width="200"> | [Amazon](https://www.amazon.com/dp/B07PNL13XM) |
| 4 | DS18B20 waterproof temperature probe | <img src="photos/parts/04-ds18b20-temp-probe.jpg" alt="DS18B20 waterproof temperature probe" width="200"> | [Amazon](https://www.amazon.com/dp/B07V2KS43L) |
| 5 | Chanzon 4.7kΩ resistors | <img src="photos/parts/05-resistors-4k7.jpg" alt="Chanzon 4.7kΩ resistors" width="200"> | [Amazon](https://www.amazon.com/dp/B08QRZRRGB) |
| 6 | ELEGOO 400-point breadboard kit | <img src="photos/parts/06-breadboard-400.jpg" alt="ELEGOO 400-point breadboard kit" width="200"> | [Amazon](https://www.amazon.com/dp/B0CYPVMK9J) |
| 7 | ELEGOO 120-pc Dupont wire kit | <img src="photos/parts/07-dupont-wires.jpg" alt="ELEGOO 120-pc Dupont wire kit" width="200"> | [Amazon](https://www.amazon.com/dp/B01EV70C78) |
| 8 | Zulkit IP65 clear-lid junction box, 150x100x70mm, 2 cable glands | <img src="photos/parts/08-enclosure-ip65.jpg" alt="Zulkit IP65 clear-lid junction box" width="200"> | [Amazon](https://www.amazon.com/dp/B07RPNWD47) |
| 9 | SOHLER 5g silica gel packs | <img src="photos/parts/09-silica-gel.jpg" alt="SOHLER 5g silica gel packs" width="200"> | [Amazon](https://www.amazon.com/dp/B08SBZWXC5) |
| 10 | Amazon Basics USB-A to micro-USB cable | <img src="photos/parts/10-cable-usb-a-micro.jpg" alt="Amazon Basics USB-A to micro-USB cable" width="200"> | [Amazon](https://www.amazon.com/dp/B0711PVX6Z) |
| 11 | Cable Matters braided USB-C to micro-USB cable, 6.6 ft | <img src="photos/parts/11-cable-usb-c-micro.jpg" alt="Cable Matters braided USB-C to micro-USB cable" width="200"> | [Amazon](https://www.amazon.com/dp/B00UUBRYS0) |
| 12 | Aleric step drill bit set | <img src="photos/parts/12-step-drill-bits.jpg" alt="Aleric step drill bit set" width="200"> | [Amazon](https://www.amazon.com/dp/B08Y96Z669) |
| 13 | GE Advanced Silicone, clear | <img src="photos/parts/13-silicone-sealant.jpg" alt="GE Advanced Silicone, clear" width="200"> | [Amazon](https://www.amazon.com/dp/B0H2G56HNK) |
| 14 | 5V USB wall power brick | <img src="photos/parts/14-usb-power-brick.jpg" alt="5V USB wall power brick" width="200"> | [Amazon](https://www.amazon.com/dp/B0HDCGSXR4) |
| 15 | Stover organic Cherry Belle radish seeds | <img src="photos/parts/15-radish-seeds.jpg" alt="Stover organic Cherry Belle radish seeds" width="200"> | [Home Depot]() |
| 16 | Miracle-Gro All Purpose Garden Soil, 0.75 cu ft | <img src="photos/parts/16-garden-soil.jpg" alt="Miracle-Gro All Purpose Garden Soil" width="200"> | [Home Depot](https://www.homedepot.com/p/Miracle-Gro-Garden-Soil-All-Purpose-0-75-cu-ft-for-In-Ground-Use-Gardens-and-Raised-Beds-Flowers-Vegetables-Trees-Shrubs-75030430/206553445) |

Product names and logos in the photos belong to their owners.

## Credits

### Research

The thresholds in `targets.json` come from these sources:

- University of Minnesota Extension, [Growing radishes](https://extension.umn.edu/vegetables/growing-radishes): weekly water, germination time, cracking from uneven moisture.
- Penn State PlantVillage, [Radish](https://plantvillage.psu.edu/topics/radish/infos): optimal growing temperature, keeping soil evenly moist.
- Texas A&M AgriLife Extension, [Radish](https://aggie-horticulture.tamu.edu/vegetable/files/2011/10/radish.pdf): preferred temperature range, days to harvest.
- C. Currey (Iowa State University), radish daily light integral trial, summarized in [Greenhouse Grower](https://www.greenhousegrower.com/?p=165409): daily light target.
- Botanical Interests, [Cherry Belle Radish Seeds](https://botanicalinterests.com/product/Cherry-Belle-Radish-Seeds): days to maturity.
- Apogee Instruments, [Conversion: PPFD to lux](https://www.apogeeinstruments.com/conversion-ppfd-to-lux/), based on Thimijan, R. W., and Heins, R. D. (1983), HortScience 18(6): 818-822: lux to PPFD factor for sunlight.

### Data and services

- Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- [Claude API](https://www.anthropic.com/api) by Anthropic runs the agents and writes the daily report.
- [Google Apps Script](https://developers.google.com/apps-script) and Google Sheets store the readings and serve the dashboard.
- [Geist and Geist Mono](https://fonts.google.com/specimen/Geist) fonts, licensed under the SIL Open Font License.

### Arduino libraries

- [BH1750](https://github.com/claws/BH1750) by claws
- [OneWire](https://github.com/PaulStoffregen/OneWire) by Paul Stoffregen
- [DallasTemperature](https://github.com/milesburton/Arduino-Temperature-Control-Library) by Miles Burton
- [Arduino core for ESP32](https://github.com/espressif/arduino-esp32) by Espressif
