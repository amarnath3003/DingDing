// DING bell for the ESP32 DevKit: reports clean contact edges to the hub over Wi-Fi and USB serial.
// Wiring: push button (or the bell's striker/dome wires) between GPIO 4 and GND.
//         GPIO 4 uses INPUT_PULLUP, so contact = LOW. No resistor needed.
//         On a 4-leg tactile button use two DIAGONAL legs.
//
// The hub (code/hub/bell.py) turns edges into PRESS / HOLD / RAPID with exactly the
// same classifier as the Enter key, so timing and on-screen feedback match.
// Debounce numbers come from bell_test/bell_test.ino (tuned on a raw capture of the bell).
//
// Wi-Fi: joins WIFI_SSID on power-up and keeps retrying, then listens on TCP port 8023 as
// ding-bell.local. The hub (BELL_WIFI_HOST in code/.env) connects and reads the same lines
// as over USB, plus PING every second so it can tell a dead link. One hub at a time: a new
// connection replaces the old one. USB serial keeps working with no Wi-Fi.
//
// Prints (115200 baud, and to the hub over Wi-Fi):
//   READY level=<0|1>  - after boot, and when the hub connects (0 = contact closed)
//   DOWN               - contact made
//   UP                 - contact released
// Serial only: WIFI OK <ip> | WIFI LOST | HUB CONNECTED
// The on-board LED (GPIO 2) is lit while contact is closed, for checking wiring.

#include <WiFi.h>
#include <ESPmDNS.h>

const char* WIFI_SSID = "Amarnath’s iPhone";  // the iPhone's name, curly apostrophe and all
const char* WIFI_PASS = "123456789";
const char* HOSTNAME  = "ding-bell";               // -> ding-bell.local

const uint8_t  CONTACT_PIN = 4;
const uint8_t  LED_PIN     = 2;
const uint16_t PRESS_MS    = 3;   // continuous LOW this long = contact made
const uint16_t RELEASE_MS  = 30;  // continuous HIGH this long = contact released (rides over chatter)

const uint16_t      HUB_PORT      = 8023;
const unsigned long PING_MS       = 1000;
const unsigned long WIFI_RETRY_MS = 15000;  // the hotspot may come up after the board

WiFiServer server(HUB_PORT);
WiFiClient hub;
bool wifiUp = false;
bool mdnsStarted = false;
unsigned long lastWifiKick = 0, lastPing = 0;

// Sampled once per millisecond, same as bell_test.ino (runs count real ms, so a slow Wi-Fi
// loop can't stretch the debounce)
unsigned long lastTick = 0;
uint16_t      lowRun = 0, highRun = 0;
bool          closed = false;

void report(const char* line) {
  Serial.println(line);
  if (hub.connected()) hub.printf("%s\n", line);
}

void reportReady() {
  char line[16];
  snprintf(line, sizeof line, "READY level=%d", digitalRead(CONTACT_PIN));
  report(line);
}

void checkWifi() {
  bool up = WiFi.status() == WL_CONNECTED;
  if (!up && millis() - lastWifiKick > WIFI_RETRY_MS) {
    lastWifiKick = millis();
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }
  if (up == wifiUp) return;
  wifiUp = up;

  if (up) {
    if (mdnsStarted) MDNS.end();
    mdnsStarted = MDNS.begin(HOSTNAME);
    Serial.print(F("WIFI OK  ding-bell.local  "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("WIFI LOST, reconnecting..."));
  }
}

void checkHub() {
  WiFiClient incoming = server.accept();
  if (incoming) {
    hub.stop();  // a restarted hub leaves a stale link behind
    hub = incoming;
    hub.setNoDelay(true);
    lastPing = millis();
    Serial.println(F("HUB CONNECTED"));
    reportReady();
  }
  if (hub && millis() - lastPing >= PING_MS) {
    lastPing = millis();
    if (hub.connected()) hub.print("PING\n");
    else hub.stop();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(CONTACT_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HOSTNAME);
  WiFi.setSleep(false);  // modem sleep adds 100+ ms to every edge
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  lastWifiKick = millis();
  server.begin();

  delay(50);
  Serial.println();
  reportReady();
}

void loop() {
  checkWifi();
  checkHub();

  unsigned long now = millis();
  if (now == lastTick) return;
  uint16_t dt = min(now - lastTick, 1000UL);
  lastTick = now;

  bool low = (digitalRead(CONTACT_PIN) == LOW);
  if (low) { lowRun = min(lowRun + dt, 60000);  highRun = 0; }
  else     { highRun = min(highRun + dt, 60000); lowRun = 0; }

  if (!closed && lowRun >= PRESS_MS) {
    closed = true;
    digitalWrite(LED_PIN, HIGH);
    report("DOWN");
  } else if (closed && highRun >= RELEASE_MS) {
    closed = false;
    digitalWrite(LED_PIN, LOW);
    report("UP");
  }
}
