# Sibelga

Verfolgen Sie Ihren Gas- und Stromverbrauch sowie den Zustand des
Sibelga-Netzes (Region Brüssel-Hauptstadt) in Gladys Assistant.

Diese Integration wird nicht von Sibelga herausgegeben. Sibelga bietet keine
öffentliche API: Die Integration liest dieselben Webseiten, die Sie in Ihrem
Browser öffnen können — das Portal „Mein Verbrauch“ mit Ihrem eigenen Konto
und die öffentliche Seite der laufenden Störungen. Ändert Sibelga diese
Seiten, kann die Integration bis zu ihrer Aktualisierung ausfallen.

## Was Sie erhalten

- Ein Gerät pro Zähler Ihres Sibelga-Kontos (Strom und Gas) mit dem
  Tagesverbrauch, dem Verbrauch des letzten Tages und des letzten Monats
  sowie den Zählerständen.
- Ein Gerät **Sibelga grid** (Sibelga-Netz), das die laufenden Störungen
  zählt, in Brüssel und in Ihren Gemeinden.
- Szenen-Auslöser und -Aktionen sowie zwei Dashboard-Widgets.

## Bevor Sie beginnen

Für die Verbrauchsdaten benötigen Sie:

1. ein Sibelga-Verbrauchskonto: Erstellen Sie es auf
   [conso.sibelga.be](https://conso.sibelga.be/) (es ist das Konto der App
   My Sibelga, nicht das für Arbeitsanfragen);
2. Ihre Zähler, die diesem Konto mit ihrem EAN-Code hinzugefügt wurden;
3. einen **intelligenten Zähler** mit erlaubter **Fernablesung**: Ohne sie
   hat Sibelga keine Tagesdaten, und der Zähler erhält nur die Werte, die
   Sibelga kennt.

Melden Sie sich einmal im Portal an und prüfen Sie, ob Sie dort Ihren
Verbrauch sehen: Die Integration zeigt dieselben Daten, nicht mehr.

Der Netzstatus benötigt kein Konto.

## Konfiguration

1. Öffnen Sie den Tab **Konfiguration** der Integration.
2. Geben Sie die **E-Mail-Adresse** und das **Passwort** Ihres
   Sibelga-Verbrauchskontos ein und speichern Sie.
3. Drücken Sie **Sibelga-Konto testen**: Die Integration meldet sich an und
   listet die gefundenen Zähler auf.
4. Öffnen Sie den Tab **Erkennung** und fügen Sie die Geräte hinzu.

Weitere Einstellungen:

- **Zu importierender Verlauf** — Anzahl der Tage mit Tagesverbrauch, die pro
  Zähler an Gladys gesendet werden (standardmäßig 30). Der Verlauf wird
  gesendet, wenn Sie das Gerät hinzufügen.
- **Aktualisierung des Verbrauchs** — wie oft das Portal gelesen wird
  (standardmäßig alle 6 Stunden). Sibelga veröffentlicht die Werte eines
  Tages am Folgetag; ein kürzeres Intervall bringt nichts.
- **Netzstatus verfolgen** — schalten Sie dies aus, wenn Sie nur den
  Verbrauch möchten.
- **Gemeinde meines Zuhauses verfolgen** — standardmäßig aktiv. Die
  Integration liest den Standort der in Gladys definierten Häuser und verfolgt die Brüsseler Gemeinde jedes
  Hauses. Ein Haus außerhalb Brüssels oder ohne Standort wird ignoriert.
- **Weitere zu verfolgende Gemeinden** — Gemeinden, die zusätzlich zu der
  Ihres Zuhauses verfolgt werden (Ihr Arbeitsplatz, das Zuhause eines
  Angehörigen). Wird gar keine Gemeinde verfolgt, gilt die gesamte Region.
- **Aktualisierung des Netzstatus** — standardmäßig alle 15 Minuten,
  höchstens alle 5 Minuten.

## Geräte

Jeder Zähler trägt den Namen, den Sie ihm im Portal gegeben haben, und seinen
EAN-Code.

| Funktion                          | Bedeutung                                                             |
| --------------------------------- | --------------------------------------------------------------------- |
| Daily consumption                 | Ein datierter Wert pro Tag, für die Energie-Ansichten von Gladys      |
| Consumption of the last day       | Letzter von Sibelga veröffentlichter Tag (meist gestern)              |
| Consumption of the last month     | Wie im Portal angezeigt                                               |
| Meter index (peak / off-peak)     | Letzte Zählerstände (Hoch- / Niedertarif) eines intelligenten Zählers |
| Injection of the last day, index… | Nur für einen Zähler, der auch einspeist (Solaranlage)                |

Alle Werte sind in kWh, wie im Portal. Die Daten eines Tages treffen am
Folgetag ein: Es gibt hier keine Leistung in Echtzeit. Für Live-Werte nutzen
Sie den P1-Port Ihres intelligenten Zählers mit einer anderen Integration.

Das Gerät **Sibelga grid** hat zwei Zähler: die laufenden Störungen in
Brüssel und die in Ihren Gemeinden.

Jedes Gerät trägt das Abzeichen **Cloud**: Die Daten kommen über das Internet
von Sibelga. Das Abzeichen wechselt zu „nicht erreichbar“, wenn Sibelga nicht
gelesen werden kann.

## Aktionen

Schaltflächen des Tabs Konfiguration:

- **Sibelga-Konto testen** — meldet sich an und listet Ihre Zähler auf.
- **Netzstatus testen** — liest die Störungsseite und sagt, was sie zeigt.
- **Daten jetzt aktualisieren** — liest beides ohne zu warten.

## Szenen

Die Integration fügt dem Szenen-Editor eigene Karten hinzu (Gladys 5.1 oder
neuer).

Auslöser:

- **Sibelga-Störung begonnen** — eine neue Störung ist aufgetreten. Filtern
  Sie nach _In meinen Gemeinden_ oder _Anderswo in Brüssel_; bleibt der
  Filter leer, passt jede Störung. Variablen: `{{triggerEvent.data.title}}`,
  `municipalities`, `url`, `count` (laufende Störungen in Ihren Gemeinden)
  und `id`.
- **Sibelga-Störung behoben** — eine Störung wird nicht mehr gemeldet.
  Gleicher Filter, gleiche Variablen.
- **Neue Sibelga-Verbrauchsdaten** — Sibelga hat einen neuen Tag für einen
  Zähler veröffentlicht. Filtern Sie nach Zähler oder Energie. Variablen:
  `consumption` und `injection` (kWh), `date`, `name`, `ean`.

Aktionen:

- **Sibelga-Daten aktualisieren** — liest Sibelga jetzt. Verwenden Sie sie
  nicht in einer Szene, die von einem der obigen Auslöser gestartet wird:
  Eine Aktualisierung kann sie auslösen.
- **Sibelga-Verbrauch abrufen** — Verbrauch eines Zählers über den letzten
  Tag, die letzten 7 oder die letzten 30 Tage, für die folgenden Aktionen
  (zum Beispiel eine Nachricht mit dem Verbrauch von gestern).
- **Sibelga-Netzstatus abrufen** — Anzahl der laufenden Störungen und ob
  Ihre Gemeinden betroffen sind, für eine Bedingung oder eine Nachricht.

Beim Start von Gladys lösen bereits laufende Störungen und bereits
veröffentlichte Werte nichts aus: nur, was sich danach ändert.

## Dashboard

- **Sibelga-Verbrauch** — wählen Sie einen Zähler und eine Anzahl von Tagen:
  letzter Tag, letzter Monat, Tagesdurchschnitt und ein Balkendiagramm des
  Tagesverbrauchs.
- **Sibelga-Netzstatus** — laufende Störungen (Ihre Gemeinden zuerst) mit
  einem Link zu ihrer Seite auf sibelga.be und eine Schaltfläche zum
  Aktualisieren.

## Datenschutz und Grenzen

- Ihr Passwort wird von Gladys in einem geheimen Feld gespeichert und nur an
  die Anmeldeseite von Sibelga gesendet. Es wird nie in die Logs
  geschrieben.
- Die Integration liest nur: Sie ändert nie etwas an Ihrem Sibelga-Konto.
- Störungen werden von einer öffentlichen Webseite gelesen. Sibelga schützt
  seine Website vor Robotern: Lehnt sie die Integration ab, zeigt der Status
  **Unbekannt**, und die Integration versucht nicht, den Schutz zu umgehen.
- Die Integration fragt Gladys nach dem Standort Ihrer Häuser, nur um deren
  Gemeinde zu ermitteln. Sie tut dies selbst, anhand der mitgelieferten
  Gemeindegrenzen: Die Koordinaten werden nie an Sibelga oder einen anderen
  Dienst gesendet, nie in die Logs geschrieben und nie gespeichert.
- Geplante Unterbrechungen und Baustellen werden nicht verfolgt.

## Fehlerbehebung

- **„Sibelga hat die E-Mail-Adresse oder das Passwort abgelehnt“** — melden
  Sie sich auf [conso.sibelga.be](https://conso.sibelga.be/) mit denselben
  Zugangsdaten an. Das Konto für Arbeitsanfragen ist ein anderes.
- **„Sibelga did not complete the sign-in“** (in den Logs) — das Portal
  wartet auf Sie: neue Bedingungen akzeptieren oder Adresse bestätigen.
  Melden Sie sich einmal im Browser an und drücken Sie dann **Sibelga-Konto
  testen**.
- **Kein Gerät oder kein Tagesverbrauch** — prüfen Sie im Portal, ob der
  Zähler aufgeführt ist, ein intelligenter Zähler ist und die Fernablesung
  erlaubt ist. Die Daten beginnen am Tag nach der Erlaubnis.
- **Netzstatus „Unbekannt“** — sibelga.be hat die Anfrage abgelehnt oder die
  Seite geändert. Die Störungen bleiben auf der Website von Sibelga
  sichtbar.
- Für mehr Details lesen Sie die Logs der Integration in der
  Gladys-Oberfläche, mit `LOG_LEVEL=debug` für alles.
