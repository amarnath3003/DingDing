// DING bell for the ESP32 DevKit: reports clean contact edges to the hub over USB serial.
// Wiring: push button (or the bell's striker/dome wires) between GPIO 4 and GND.
//         GPIO 4 uses INPUT_PULLUP, so contact = LOW. No resistor needed.
//         On a 4-leg tactile button use two DIAGONAL legs.
//
// The hub (code/hub/bell.py) turns edges into PRESS / HOLD / RAPID with exactly the
// same classifier as the Enter key, so timing and on-screen feedback match.
// Debounce numbers come from bell_test/bell_test.ino (tuned on a raw capture of the bell).
//
// Prints (115200 baud):
//   READY level=<0|1>  - after boot (0 = contact closed)
//   DOWN               - contact made
//   UP                 - contact released
// The on-board LED (GPIO 2) is lit while contact is closed, for checking wiring.

const uint8_t  CONTACT_PIN = 4;
const uint8_t  LED_PIN     = 2;
const uint16_t PRESS_MS    = 3;   // continuous LOW this long = contact made
const uint16_t RELEASE_MS  = 30;  // continuous HIGH this long = contact released (rides over chatter)

// Sampled once per millisecond, same as bell_test.ino
unsigned long lastTick = 0;
uint16_t      lowRun = 0, highRun = 0;
bool          closed = false;

void setup() {
  Serial.begin(115200);
  pinMode(CONTACT_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  delay(50);
  Serial.println();
  Serial.print(F("READY level=")); Serial.println(digitalRead(CONTACT_PIN));
}

void loop() {
  unsigned long now = millis();
  if (now == lastTick) return;
  lastTick = now;

  bool low = (digitalRead(CONTACT_PIN) == LOW);
  if (low) { if (lowRun < 60000) lowRun++;  highRun = 0; }
  else     { if (highRun < 60000) highRun++; lowRun = 0; }

  if (!closed && lowRun >= PRESS_MS) {
    closed = true;
    digitalWrite(LED_PIN, HIGH);
    Serial.println(F("DOWN"));
  } else if (closed && highRun >= RELEASE_MS) {
    closed = false;
    digitalWrite(LED_PIN, LOW);
    Serial.println(F("UP"));
  }
}
