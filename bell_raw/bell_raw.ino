// Raw edge logger for the bell contact: no debounce, no interpretation.
// Wiring: striker/dome wires -> D2 and GND. D2 uses INPUT_PULLUP (contact = 0).
// Output per edge: "<micros>,<level>"  (level 0 = touching, 1 = open)

const uint8_t CONTACT_PIN = 2;  // INT0

volatile uint32_t tBuf[256];
volatile uint8_t  lBuf[256];
volatile uint8_t  head = 0, tail = 0;
volatile bool     overflow = false;

void onEdge() {
  uint32_t t = micros();
  uint8_t next = head + 1;
  if (next == tail) { overflow = true; return; }
  tBuf[head] = t;
  lBuf[head] = digitalRead(CONTACT_PIN);
  head = next;
}

void setup() {
  Serial.begin(115200);
  pinMode(CONTACT_PIN, INPUT_PULLUP);
  Serial.print(F("#READY level=")); Serial.println(digitalRead(CONTACT_PIN));
  attachInterrupt(digitalPinToInterrupt(CONTACT_PIN), onEdge, CHANGE);
}

void loop() {
  while (tail != head) {
    Serial.print(tBuf[tail]); Serial.print(','); Serial.println(lBuf[tail]);
    tail++;
  }
  if (overflow) { overflow = false; Serial.println(F("#OVERFLOW")); }
}
