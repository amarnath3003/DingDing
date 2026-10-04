// DING room ESP32 (Arduino): the room's Light, TV and SOS alarm, driven by the hub over Wi-Fi.
//
// Wiring (same board as the TV control prototype):
//   OLED SH1106 128x64 I2C  VDD->3V3  GND->GND  SCK->GPIO 22  SDA->GPIO 21   = the TV
//   Green LED  GPIO 26 -> 220R -> LED(+), LED(-) -> GND                       = the light
//   Red LED    GPIO 27 -> 220R -> LED(+), LED(-) -> GND                       = SOS lamp
//   Buzzer     GPIO 25 -> buzzer(+), buzzer(-) -> GND (small buzzer only)     = SOS beep
//
// The hub (code/hub/devices.py) sends the whole room state on every change and every few
// seconds, so a rebooted board catches up by itself:
//   GET http://ding-room.local/state?light=0|1&tv=0|1&sos=0|1|2
//     sos: 0 = off, 1 = help needed (red blinks + beeps), 2 = help is coming (red blinks, quiet)
//   Any parameter may be left out. Replies with the state as JSON; GET / returns it too.
//
// Serial (115200, Newline) still works for bench tests, but a connected hub overrides it
// within a few seconds:  TV | TV OFF | G | G OFF | O (SOS) | OK (stop SOS) | STATUS
//
// Libraries: U8g2 by oliver. WiFi / WebServer / ESPmDNS come with the ESP32 core.
// Wi-Fi must be 2.4 GHz and the same network as the laptop running the hub.

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Wire.h>
#include <U8g2lib.h>

// ==========================================
// WI-FI
// ==========================================

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* HOSTNAME  = "ding-room";  // -> http://ding-room.local

// ==========================================
// PINS + TIMING
// ==========================================

#define OLED_SDA  21
#define OLED_SCL  22
#define GREEN_LED 26
#define RED_LED   27
#define BUZZER    25

const unsigned long BLINK_INTERVAL = 500;
const int BEEP_HZ = 2000;

U8G2_SH1106_128X64_NONAME_F_HW_I2C display(U8G2_R0, U8X8_PIN_NONE, OLED_SCL, OLED_SDA);
WebServer server(80);

// ==========================================
// ROOM STATE
// ==========================================

bool lightOn = false;
bool tvOn = false;
int sos = 0;                // 0 off, 1 help needed, 2 help is coming
bool heardFromHub = false;  // until then the screen shows READY + the address
bool wifiUp = false;
bool mdnsStarted = false;

unsigned long lastBlink = 0;
bool blinkState = false;
bool redraw = true;

// ==========================================
// OLED
// ==========================================

void drawCentered(const char* text, int y) {
  int x = (128 - display.getStrWidth(text)) / 2;
  display.drawStr(x < 0 ? 0 : x, y, text);
}

void drawScreen() {
  display.clearBuffer();

  if (sos) {
    display.setFont(u8g2_font_ncenB24_tr);
    drawCentered("SOS", 34);
    display.setFont(u8g2_font_7x13B_tr);
    drawCentered(sos == 2 ? "HELP IS COMING" : "HELP NEEDED", 56);
  } else if (tvOn) {
    display.setFont(u8g2_font_ncenB14_tr);
    drawCentered("TV IS ON", 38);
  } else if (!heardFromHub) {
    display.setFont(u8g2_font_ncenB14_tr);
    drawCentered("READY", 26);
    display.setFont(u8g2_font_6x10_tr);
    if (wifiUp) {
      drawCentered(WiFi.localIP().toString().c_str(), 46);
      drawCentered("ding-room.local", 58);
    } else {
      drawCentered("Wi-Fi connecting...", 46);
    }
  }
  // TV off with the hub in charge: a dark screen, like a real TV.

  display.sendBuffer();
}

// ==========================================
// OUTPUTS
// ==========================================

void setLight(bool on) {
  if (on == lightOn) return;
  lightOn = on;
  digitalWrite(GREEN_LED, on ? HIGH : LOW);
  Serial.println(on ? "LIGHT ON" : "LIGHT OFF");
}

void setTv(bool on) {
  if (on == tvOn) return;
  tvOn = on;
  redraw = true;
  Serial.println(on ? "TV ON" : "TV OFF");
}

void setSos(int level) {
  level = constrain(level, 0, 2);
  if (level == sos) return;

  if (sos == 0) {
    // Start the blink on the very next loop, not half a second later
    blinkState = false;
    lastBlink = millis() - BLINK_INTERVAL;
  }
  sos = level;

  if (sos != 1) noTone(BUZZER);
  if (sos == 0) digitalWrite(RED_LED, LOW);

  redraw = true;
  Serial.println(sos == 0 ? "SOS OFF" : sos == 1 ? "SOS: HELP NEEDED" : "SOS: HELP IS COMING");
}

void blinkSos() {
  if (!sos || millis() - lastBlink < BLINK_INTERVAL) return;
  lastBlink = millis();
  blinkState = !blinkState;

  digitalWrite(RED_LED, blinkState ? HIGH : LOW);
  if (blinkState && sos == 1) {
    tone(BUZZER, BEEP_HZ);
  } else {
    noTone(BUZZER);
  }
}

// ==========================================
// HTTP (the hub)
// ==========================================

String stateJson() {
  return String("{\"light\":") + (lightOn ? "true" : "false") +
         ",\"tv\":" + (tvOn ? "true" : "false") +
         ",\"sos\":" + sos + "}";
}

void handleState() {
  if (server.hasArg("light")) setLight(server.arg("light") == "1");
  if (server.hasArg("tv"))    setTv(server.arg("tv") == "1");
  if (server.hasArg("sos"))   setSos(server.arg("sos").toInt());

  if (server.args() > 0 && !heardFromHub) {
    heardFromHub = true;
    redraw = true;
    Serial.println("HUB CONNECTED");
  }
  server.send(200, "application/json", stateJson());
}

void handleRoot() {
  server.send(200, "application/json", stateJson());
}

// ==========================================
// WI-FI
// ==========================================

void checkWifi() {
  bool up = WiFi.status() == WL_CONNECTED;
  if (up == wifiUp) return;
  wifiUp = up;
  redraw = true;

  if (up) {
    if (mdnsStarted) MDNS.end();
    mdnsStarted = MDNS.begin(HOSTNAME);
    if (mdnsStarted) MDNS.addService("http", "tcp", 80);

    Serial.print("WIFI OK  http://");
    Serial.print(HOSTNAME);
    Serial.print(".local  http://");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WIFI LOST, reconnecting...");
  }
}

// ==========================================
// SERIAL (bench testing)
// ==========================================

void printStatus() {
  Serial.print("STATE ");
  Serial.print(stateJson());
  Serial.print("  wifi=");
  Serial.println(wifiUp ? WiFi.localIP().toString() : String("down"));
}

void handleSerial() {
  if (Serial.available() == 0) return;

  String command = Serial.readStringUntil('\n');
  command.trim();
  command.toUpperCase();

  if (command == "TV")          setTv(true);
  else if (command == "TV OFF") setTv(false);
  else if (command == "G")      setLight(true);
  else if (command == "G OFF")  setLight(false);
  else if (command == "O")      setSos(1);
  else if (command == "OK")     setSos(0);
  else if (command == "STATUS") printStatus();
  else if (command.length() > 0) {
    Serial.println("Unknown command! Use: TV, TV OFF, G, G OFF, O, OK, STATUS");
  }
}

// ==========================================
// SETUP
// ==========================================

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(100);

  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, LOW);
  noTone(BUZZER);

  display.begin();
  drawScreen();

  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HOSTNAME);
  WiFi.setSleep(false);  // modem sleep adds 100+ ms to every command
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  server.on("/", handleRoot);
  server.on("/state", handleState);
  server.begin();

  Serial.println();
  Serial.println("================================");
  Serial.println("        DING ROOM ESP32");
  Serial.println("================================");
  Serial.println("Green = light, OLED = TV, red + buzzer = SOS");
  Serial.println("Serial: TV, TV OFF, G, G OFF, O, OK, STATUS");
  Serial.print("Wi-Fi: connecting to ");
  Serial.println(WIFI_SSID);
}

// ==========================================
// LOOP
// ==========================================

void loop() {
  checkWifi();
  server.handleClient();
  handleSerial();
  blinkSos();

  if (redraw) {
    redraw = false;
    drawScreen();
  }
}
