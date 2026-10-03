// Bell contact tester: striker <-> dome acts as a (very bouncy) switch.
// Wiring: one wire to GND, other wire to D2 (INPUT_PULLUP, so contact = LOW).
//
// Thresholds were tuned from a raw edge capture of this bell (bell_raw/):
//   - making contact chatters for 30-300 ms, release chatters for 15-60 ms
//   - while held, the contact blips open for microseconds every 10-30 ms
//   - a normal press is ~130-210 ms of contact; quick taps are ~250-450 ms apart
//
// Prints:
//   PRESS     - one short contact
//   HOLD      - contact closed >= HOLD_MS, with duration
//   REPEATED  - several short contacts, each starting < REPEAT_GAP_MS after the last release

const uint8_t  CONTACT_PIN   = 2;
const uint16_t PRESS_MS      = 3;     // continuous LOW this long = contact made
const uint16_t RELEASE_MS    = 30;    // continuous HIGH this long = contact released (rides over chatter)
const uint16_t MIN_EVENT_MS  = 30;    // contacts shorter than this are bounce/ringing, ignored
const uint16_t HOLD_MS       = 1000;  // contact this long = HOLD
const uint16_t REPEAT_GAP_MS = 500;   // next press within this gap after a release = same burst
const bool     SHOW_IGNORED  = true;  // print ignored blips (handy while testing)

// Sampled once per millisecond so behaviour matches the offline replay (bell_raw/sim.py)
unsigned long lastTick = 0;
uint16_t      lowRun = 0, highRun = 0;

bool          closed = false;
unsigned long downAt = 0;
bool          holdAnnounced = false;

uint8_t       burstCount = 0;
unsigned long burstStart = 0;
unsigned long lastReleaseAt = 0;

void setup() {
  Serial.begin(115200);
  pinMode(CONTACT_PIN, INPUT_PULLUP);
  Serial.println(F("Bell contact test ready. Strike / hold / tap repeatedly."));
}

void flushBurst() {
  if (burstCount == 1) {
    Serial.println(F("PRESS"));
  } else if (burstCount > 1) {
    Serial.print(F("REPEATED  ")); Serial.print(burstCount);
    Serial.print(F(" presses in ")); Serial.print(lastReleaseAt - burstStart);
    Serial.println(F(" ms"));
  }
  burstCount = 0;
}

void onRelease(unsigned long releaseAt) {
  unsigned long dur = releaseAt - downAt;

  if (dur < MIN_EVENT_MS) {
    if (SHOW_IGNORED) { Serial.print(F("  (ignored ")); Serial.print(dur); Serial.println(F(" ms blip)")); }
    return;
  }

  if (dur >= HOLD_MS) {
    flushBurst();
    Serial.print(F("HOLD      duration=")); Serial.print(dur); Serial.println(F(" ms"));
    return;
  }

  if (burstCount > 0 && downAt - lastReleaseAt > REPEAT_GAP_MS) flushBurst();
  if (burstCount == 0) burstStart = downAt;
  burstCount++;
  lastReleaseAt = releaseAt;
  Serial.print(F("  contact #")); Serial.print(burstCount);
  Serial.print(F("  ")); Serial.print(dur); Serial.println(F(" ms"));
}

void loop() {
  unsigned long now = millis();
  if (now == lastTick) return;
  lastTick = now;

  bool low = (digitalRead(CONTACT_PIN) == LOW);
  if (low) { lowRun++;  highRun = 0; }
  else     { highRun++; lowRun = 0; }

  if (!closed && lowRun >= PRESS_MS) {
    closed = true;
    downAt = now - PRESS_MS + 1;
    holdAnnounced = false;
  } else if (closed && highRun >= RELEASE_MS) {
    closed = false;
    onRelease(now - RELEASE_MS + 1);
  }

  if (closed && !holdAnnounced && now - downAt >= HOLD_MS) {
    holdAnnounced = true;
    Serial.println(F("HOLD      started (still held...)"));
  }

  // Burst finished: no new press within the gap
  if (!closed && burstCount > 0 && now - lastReleaseAt > REPEAT_GAP_MS) flushBurst();
}
