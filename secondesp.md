# Second ESP32: the room (Light, TV, SOS)

The second ESP32 stands in for the room: its green LED is the **light**, its OLED is the **TV**, and its red LED and buzzer are the **SOS alarm**. It joins Wi-Fi, and the Ding.AI hub on the laptop drives it over HTTP. No USB cable to the laptop is needed.

The firmware is in [`room_esp32/room_esp32.ino`](room_esp32/room_esp32.ino), and a full copy is in [section 9](#9-full-code).

---

## 1. What it does

| On the Bell Screen | On the board |
|---|---|
| Light turned on | Green LED on |
| TV turned on | OLED shows **TV IS ON** |
| TV turned off | OLED goes dark, like a real TV |
| Help raised (3 quick rings, a Help card, or no answer to a check-in) | Red LED blinks and buzzer beeps every 500 ms. OLED shows **SOS / HELP NEEDED** |
| Caregiver presses "I'm coming" | Red LED keeps blinking, buzzer goes quiet. OLED shows **SOS / HELP IS COMING** |
| Help cleared | Red LED and buzzer off |

An SOS on the OLED takes priority over the TV. Once the help is cleared, the OLED shows the TV state again.

---

## 2. Parts

- ESP32 DOIT DevKit V1
- 0.96" 128x64 I2C OLED (SH1106), with pins GND, VDD, SCK, SDA
- 1 green LED, 1 red LED
- 2 × 220 Ω resistors
- 1 small, low-current buzzer
- Breadboard and jumper wires
- A USB charger or power bank to power the board

---

## 3. Wiring

| Part | Part pin | ESP32 pin |
|---|---|---|
| OLED | VDD | 3V3 |
| OLED | GND | GND |
| OLED | SCK | GPIO 22 |
| OLED | SDA | GPIO 21 |
| Green LED (light) | anode (+), long leg | GPIO 26 through a 220 Ω resistor |
| Green LED | cathode (−) | GND |
| Red LED (SOS) | anode (+), long leg | GPIO 27 through a 220 Ω resistor |
| Red LED | cathode (−) | GND |
| Buzzer | + | GPIO 25 |
| Buzzer | − | GND |

```text
                     ESP32 DOIT DEVKIT V1
                ┌───────────────────────────┐
                │  3V3 ───────────────────────> OLED VDD
                │  GND ───────────────────────> OLED GND
                │   ├─────────────────────────> Green LED (-)
                │   ├─────────────────────────> Red LED (-)
                │   └─────────────────────────> Buzzer (-)
                │  GPIO 21 ───────────────────> OLED SDA
                │  GPIO 22 ───────────────────> OLED SCK
                │  GPIO 25 ───────────────────> Buzzer (+)
                │  GPIO 26 ── 220Ω ───────────> Green LED (+)   = light
                │  GPIO 27 ── 220Ω ───────────> Red LED (+)     = SOS
                └───────────────────────────┘
```

All the GNDs can share one GND rail on the breadboard.

> Connect only a small buzzer straight to a GPIO pin. A larger buzzer, a real lamp or a real TV needs a transistor, MOSFET or relay. Never power a load from a GPIO pin.

---

## 4. Arduino IDE setup (once per computer)

1. **Add the ESP32 boards.** Open *Arduino IDE → Settings → Additional boards manager URLs* and add:
   ```text
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```
   Then open *Tools → Board → Boards Manager*, search for **esp32** and install **esp32 by Espressif Systems**.
2. **Add the OLED library.** Open *Tools → Manage Libraries*, search for **U8g2** and install **U8g2 by oliver**.
   `WiFi`, `WebServer` and `ESPmDNS` come with the ESP32 boards package, so you don't need to install anything else.
3. **Pick the board.** Choose *Tools → Board → esp32 → DOIT ESP32 DEVKIT V1*, then set *Tools → Port* to the board's port (for example `/dev/cu.usbserial-0001`).

---

## 5. Flash the board

1. Open `room_esp32/room_esp32.ino` in the Arduino IDE.
2. Put your Wi-Fi name and password at the top:
   ```cpp
   const char* WIFI_SSID = "YOUR_WIFI";
   const char* WIFI_PASS = "YOUR_PASSWORD";
   ```
   - The network must be **2.4 GHz**. The ESP32 can't join 5 GHz networks.
   - It must be **the same network as the laptop** running the hub.
   - The venue Wi-Fi blocks OpenAI, so use a **phone hotspot** and join both the laptop and the ESP32 to it. On an iPhone, turn on *Personal Hotspot → Maximize Compatibility* so the hotspot uses 2.4 GHz.
3. **Stop the hub** if it's running, and close any other Serial Monitor. Either one can hold the USB port and block the upload.
4. Click **Upload**. If the IDE gets stuck on `Connecting....`, hold the board's **BOOT** button until the upload starts.

---

## 6. Check it on its own

1. Open the Serial Monitor at **115200** baud with the line ending set to **Newline**. You should see:
   ```text
   ================================
           DING ROOM ESP32
   ================================
   Wi-Fi: connecting to <your network>
   WIFI OK  http://ding-room.local  http://172.20.10.5
   ```
   The OLED shows **READY**, the board's IP address and `ding-room.local`. Note the IP address.
2. Test the outputs from the Serial Monitor:

   | Type | Result |
   |---|---|
   | `TV` | OLED: TV IS ON |
   | `TV OFF` | OLED goes dark |
   | `G` | Green LED on |
   | `G OFF` | Green LED off |
   | `O` | SOS: red LED blinks and buzzer beeps |
   | `OK` | SOS off |
   | `STATUS` | Prints the state and IP address |

3. Test over Wi-Fi from the laptop:
   ```bash
   curl 'http://ding-room.local/state?tv=1&light=1'   # TV + light on
   curl 'http://ding-room.local/state?sos=1'          # SOS: blink + beep
   curl 'http://ding-room.local/state?sos=2'          # help is coming: blink, quiet
   curl 'http://ding-room.local/state?light=0&tv=0&sos=0'
   curl 'http://ding-room.local/'                     # current state as JSON
   ```
   Each command replies with the state, for example `{"light":true,"tv":true,"sos":0}`.
   If `ding-room.local` doesn't resolve, use the IP address instead, for example `curl 'http://172.20.10.5/state?tv=1'`.

---

## 7. Connect it to the hub

1. Add this line to `code/.env`:
   ```bash
   ROOM_ESP32_URL=http://ding-room.local     # or http://<ip shown on the OLED>
   ```
2. **Power the board from a USB charger or power bank, not from the laptop.** With `BELL_SERIAL_PORT=auto`, the hub uses the first USB serial port it finds as the bell, which could be this board. If the board has to stay plugged into the laptop, set `BELL_SERIAL_PORT` to the bell's exact port path.
3. Start the hub with `./code/run.sh`.
4. Open the operator panel at `http://127.0.0.1:8000/#/sim`. Under **Devices**, a green dot reading *"Room ESP32 at http://ding-room.local"* means the board is connected. The OLED goes from READY to the room state.
5. Try it out:
   - Click **Light** or **TV** in the operator panel. The LED and OLED follow within a moment.
   - Ring the bell three times quickly, or press Enter three times quickly. The SOS starts.
   - Click *Caregiver replies "I'm coming"* in the operator panel. The buzzer goes quiet and the red LED keeps blinking.
   - Choose *"I'm OK now. Cancel help."* on the Bell Screen. Everything stops.

### How the hub talks to the board

```text
Bell Screen / AI card / operator panel
              │
              ▼
        Hub (laptop)  ── GET /state?light=1&tv=0&sos=1 ──►  Room ESP32 (Wi-Fi)
              │            on every change + every 3 s          ├─ green LED  (light)
              │                                                 ├─ OLED       (TV)
              └─ screen shows the board as Simulated            └─ red LED + buzzer (SOS)
                 again while it isn't answering
```

- The hub sends the **whole state** every time. If the board reboots or reconnects to Wi-Fi, it catches up within 3 s.
- Sends happen in the background. If the board is unreachable, the Bell Screen doesn't slow down.
- `sos`: `0` = off, `1` = help needed, `2` = help is coming.
- You can tune these in `code/.env`: `ROOM_HEARTBEAT_S` (default 3) and `ROOM_TIMEOUT_S` (default 1.5).

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| OLED stays on "Wi-Fi connecting..." | Check the SSID and password. Make sure the network is 2.4 GHz. Venue Wi-Fi with a login page won't work, so use a phone hotspot. |
| `ding-room.local` doesn't resolve | Use the IP address shown on the OLED in `ROOM_ESP32_URL`. Some hotspots block `.local` names. |
| `curl` works by IP but the operator panel says "not reachable" | `ROOM_ESP32_URL` doesn't match. Restart the hub after editing `.env`. |
| `curl` times out even by IP | The laptop and ESP32 are on different networks, or the network blocks devices from talking to each other (common on venue Wi-Fi). Use a phone hotspot. |
| OLED stays blank | Check the wiring (SDA = 21, SCK = 22, VDD = 3V3). If the display is an SSD1306 rather than an SH1106, change the display line to `U8G2_SSD1306_128X64_NONAME_F_HW_I2C`. |
| A serial command works, then undoes itself | The hub is connected and resends its state every 3 s. Use the operator panel instead, or stop the hub. |
| Upload fails or the port is busy | Stop the hub and close the Serial Monitor. Hold BOOT while it says `Connecting....`. |
| The hub thinks this board is the bell | Power the board from a charger, or set `BELL_SERIAL_PORT` to the bell's exact port. |
| Buzzer is silent | Check the buzzer's + and − legs. A passive buzzer needs the `tone()` signal, which this code already sends. |

---

## 9. Full code

`room_esp32/room_esp32.ino`:

```cpp
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
```
