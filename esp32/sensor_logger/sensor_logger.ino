// Libraries (Arduino IDE > Tools > Manage Libraries):
//   - "BH1750" by claws
//   - "OneWire" by Paul Stoffregen
//   - "DallasTemperature" by Miles Burton
// Board: install "esp32" via Boards Manager, select your ESP32 DevKitC board.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <BH1750.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// Copy secrets.example.h to secrets.h (same folder) and fill in your values.
#include "secrets.h"

const int SOIL_DRY_RAW = 3000; // raw ADC value in dry air, replace after calibrating
const int SOIL_WET_RAW = 1200; // raw ADC value in a cup of water, replace after calibrating

const int SOIL_PIN = 34;
const int ONE_WIRE_PIN = 4;
// Set to 10000 (10 s) while calibrating, then put it back.
const unsigned long INTERVAL_MS = 15UL * 60UL * 1000UL;

BH1750 lightMeter;
OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature tempSensor(&oneWire);

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
  }
}

int soilPercent(int raw) {
  int pct = map(raw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  lightMeter.begin();
  // Low sensitivity: default tops out ~54k lux, full sun is ~100k. MTreg 32 reads up to ~118k,
  // under Code.gs's 120k "looks wrong" limit.
  lightMeter.setMTreg(32);
  tempSensor.begin();
  connectWiFi();
}

void loop() {
  connectWiFi();

  int soilRaw = analogRead(SOIL_PIN);
  int soilPct = soilPercent(soilRaw);

  float lux = lightMeter.readLightLevel();

  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);

  // Serial Monitor at 115200 baud. Use soil raw to calibrate. temp -127 means the probe isn't wired
  // right, lux -1 means the light sensor wasn't found.
  Serial.printf("soil raw=%d (%d%%)  lux=%.1f  temp=%.1fC\n", soilRaw, soilPct, lux, tempC);

  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.begin(client, WEBHOOK_URL);
    http.addHeader("Content-Type", "application/json");
    String body = String("{\"token\":\"") + SHARED_SECRET +
                  "\",\"soil_pct\":" + soilPct +
                  ",\"lux\":" + lux +
                  ",\"temp_c\":" + tempC + "}";
    int status = http.POST(body);
    Serial.printf("POST status: %d\n", status);
    http.end();
  } else {
    Serial.println("WiFi not connected, skipping this reading.");
  }

  delay(INTERVAL_MS);
}
