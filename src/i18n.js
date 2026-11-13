// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys at runtime (action messages, status
// messages, widget labels, device names), in the four supported languages.
//
// Gladys picks the language of the user from a multi-language object
// (`{ en, fr, de, es }`, `en` being the mandatory fallback): `t(key, params)`
// builds one, replacing the `{name}` placeholders. test/i18n.test.js checks
// that every message exists in every language.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const MESSAGES = {
  // --- Device and feature names (English is what Gladys stores) --------------
  'energy.electricity': {
    en: 'Electricity',
    fr: 'Électricité',
    de: 'Strom',
    es: 'Electricidad',
  },
  'energy.gas': { en: 'Gas', fr: 'Gaz', de: 'Gas', es: 'Gas' },

  // --- Connection status ------------------------------------------------------
  'status.no_credentials': {
    en: 'Enter the e-mail address and password of your Sibelga account.',
    fr: "Saisissez l'adresse e-mail et le mot de passe de votre compte Sibelga.",
    de: 'Geben Sie die E-Mail-Adresse und das Passwort Ihres Sibelga-Kontos ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su cuenta Sibelga.',
  },
  'status.credentials': {
    en: 'Sibelga refused the e-mail address or the password.',
    fr: "Sibelga a refusé l'adresse e-mail ou le mot de passe.",
    de: 'Sibelga hat die E-Mail-Adresse oder das Passwort abgelehnt.',
    es: 'Sibelga ha rechazado el correo electrónico o la contraseña.',
  },
  'status.unreachable': {
    en: 'The Sibelga consumption portal cannot be reached, retrying later.',
    fr: 'Le portail de consommation Sibelga est injoignable, nouvel essai plus tard.',
    de: 'Das Sibelga-Verbrauchsportal ist nicht erreichbar, neuer Versuch später.',
    es: 'No se puede acceder al portal de consumo de Sibelga, se reintentará más tarde.',
  },
  'status.unexpected': {
    en: 'Sibelga answered in an unexpected way: check the integration logs.',
    fr: "Sibelga a répondu de manière inattendue : consultez les logs de l'intégration.",
    de: 'Sibelga hat unerwartet geantwortet: Prüfen Sie die Logs der Integration.',
    es: 'Sibelga respondió de forma inesperada: consulte los registros de la integración.',
  },
  'status.init_failed': {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, prüfen Sie die Logs der Integration.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },

  // --- Network status ---------------------------------------------------------
  'network.blocked': {
    en: 'sibelga.be refused the automated reading (anti-bot check).',
    fr: 'sibelga.be a refusé la lecture automatisée (vérification anti-robot).',
    de: 'sibelga.be hat das automatische Auslesen abgelehnt (Bot-Schutz).',
    es: 'sibelga.be rechazó la lectura automatizada (verificación antibots).',
  },
  'network.unavailable': {
    en: 'The Sibelga outage page could not be read.',
    fr: "La page des pannes de Sibelga n'a pas pu être lue.",
    de: 'Die Störungsseite von Sibelga konnte nicht gelesen werden.',
    es: 'No se pudo leer la página de averías de Sibelga.',
  },

  // --- Configuration screen actions -------------------------------------------
  'action.test.ok': {
    en: 'Connected to Sibelga: {count} metering point(s) found ({meters}).',
    fr: 'Connecté à Sibelga : {count} point(s) de comptage trouvé(s) ({meters}).',
    de: 'Mit Sibelga verbunden: {count} Zählpunkt(e) gefunden ({meters}).',
    es: 'Conectado a Sibelga: {count} punto(s) de medida encontrado(s) ({meters}).',
  },
  'action.test.no_meter': {
    en: 'Connected to Sibelga, but the account has no meter: add one on conso.sibelga.be.',
    fr: "Connecté à Sibelga, mais le compte n'a aucun compteur : ajoutez-en un sur conso.sibelga.be.",
    de: 'Mit Sibelga verbunden, aber das Konto hat keinen Zähler: Fügen Sie einen auf conso.sibelga.be hinzu.',
    es: 'Conectado a Sibelga, pero la cuenta no tiene contador: añada uno en conso.sibelga.be.',
  },
  'action.network.ok': {
    en: 'Sibelga grid: {count} ongoing outage(s), {watched} in your municipalities.',
    fr: 'Réseau Sibelga : {count} panne(s) en cours, dont {watched} dans vos communes.',
    de: 'Sibelga-Netz: {count} laufende Störung(en), davon {watched} in Ihren Gemeinden.',
    es: 'Red Sibelga: {count} avería(s) en curso, {watched} en sus municipios.',
  },
  'action.network.disabled': {
    en: 'The grid status is disabled in the configuration.',
    fr: "L'état du réseau est désactivé dans la configuration.",
    de: 'Der Netzstatus ist in der Konfiguration deaktiviert.',
    es: 'El estado de la red está desactivado en la configuración.',
  },
  'action.refresh.done': {
    en: 'Data refreshed: {meters} meter(s), {outages} ongoing outage(s).',
    fr: 'Données actualisées : {meters} compteur(s), {outages} panne(s) en cours.',
    de: 'Daten aktualisiert: {meters} Zähler, {outages} laufende Störung(en).',
    es: 'Datos actualizados: {meters} contador(es), {outages} avería(s) en curso.',
  },
  'action.refresh.partial': {
    en: 'Refresh incomplete: {reason}',
    fr: 'Actualisation incomplète : {reason}',
    de: 'Aktualisierung unvollständig: {reason}',
    es: 'Actualización incompleta: {reason}',
  },

  // --- Widgets ----------------------------------------------------------------
  'widget.last_day': {
    en: 'Last day',
    fr: 'Dernier jour',
    de: 'Letzter Tag',
    es: 'Último día',
  },
  'widget.last_month': {
    en: 'Last month',
    fr: 'Dernier mois',
    de: 'Letzter Monat',
    es: 'Último mes',
  },
  'widget.average': {
    en: 'Daily average',
    fr: 'Moyenne par jour',
    de: 'Tagesdurchschnitt',
    es: 'Media diaria',
  },
  'widget.consumption': {
    en: 'Consumption',
    fr: 'Consommation',
    de: 'Verbrauch',
    es: 'Consumo',
  },
  'widget.injection': {
    en: 'Injection',
    fr: 'Injection',
    de: 'Einspeisung',
    es: 'Inyección',
  },
  'widget.chart_title': {
    en: 'Daily consumption',
    fr: 'Consommation par jour',
    de: 'Verbrauch pro Tag',
    es: 'Consumo diario',
  },
  'widget.meter': { en: 'Meter', fr: 'Compteur', de: 'Zähler', es: 'Contador' },
  'widget.last_reading': {
    en: 'Last reading',
    fr: 'Dernier relevé',
    de: 'Letzte Ablesung',
    es: 'Última lectura',
  },
  'widget.no_meter': {
    en: 'Pick a Sibelga meter in the settings of this widget.',
    fr: 'Choisissez un compteur Sibelga dans les réglages de ce widget.',
    de: 'Wählen Sie einen Sibelga-Zähler in den Einstellungen dieses Widgets.',
    es: 'Elija un contador Sibelga en los ajustes de este widget.',
  },
  'widget.no_data': {
    en: 'No reading yet: Sibelga publishes the data of a day on the next one.',
    fr: 'Pas encore de relevé : Sibelga publie les données d’un jour le lendemain.',
    de: 'Noch keine Ablesung: Sibelga veröffentlicht die Daten eines Tages am Folgetag.',
    es: 'Aún no hay lecturas: Sibelga publica los datos de un día al día siguiente.',
  },
  'widget.network.title': {
    en: 'Sibelga grid',
    fr: 'Réseau Sibelga',
    de: 'Sibelga-Netz',
    es: 'Red Sibelga',
  },
  'widget.network.state': { en: 'Status', fr: 'État', de: 'Status', es: 'Estado' },
  'widget.network.ok': {
    en: 'No outage',
    fr: 'Aucune panne',
    de: 'Keine Störung',
    es: 'Sin averías',
  },
  'widget.network.outage': {
    en: 'Outage in progress',
    fr: 'Panne en cours',
    de: 'Störung aktiv',
    es: 'Avería en curso',
  },
  'widget.network.elsewhere': {
    en: 'Outages elsewhere',
    fr: 'Pannes ailleurs',
    de: 'Störungen anderswo',
    es: 'Averías en otras zonas',
  },
  'widget.network.unknown': {
    en: 'Unknown',
    fr: 'Inconnu',
    de: 'Unbekannt',
    es: 'Desconocido',
  },
  'widget.network.disabled': {
    en: 'Disabled',
    fr: 'Désactivé',
    de: 'Deaktiviert',
    es: 'Desactivado',
  },
  'widget.network.watched': {
    en: 'In my municipalities',
    fr: 'Dans mes communes',
    de: 'In meinen Gemeinden',
    es: 'En mis municipios',
  },
  'widget.network.total': {
    en: 'In Brussels',
    fr: 'À Bruxelles',
    de: 'In Brüssel',
    es: 'En Bruselas',
  },
  'widget.network.checked': {
    en: 'Last check',
    fr: 'Dernière vérification',
    de: 'Letzte Prüfung',
    es: 'Última comprobación',
  },
  'widget.network.badge': { en: 'Ongoing', fr: 'En cours', de: 'Aktiv', es: 'En curso' },
  'widget.network.link': {
    en: 'Details on sibelga.be',
    fr: 'Détails sur sibelga.be',
    de: 'Details auf sibelga.be',
    es: 'Detalles en sibelga.be',
  },
  'widget.refresh': {
    en: 'Refresh',
    fr: 'Actualiser',
    de: 'Aktualisieren',
    es: 'Actualizar',
  },
};

/**
 * Build the multi-language object of a message.
 * @param {string} key key of MESSAGES
 * @param {Record<string, string|number>} [params] values of the `{name}` placeholders
 * @returns {{ en: string, fr: string, de: string, es: string }}
 */
export function t(key, params = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message: ${key}`);
  }
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      message[language].replace(/\{(\w+)\}/g, (placeholder, name) =>
        name in params ? String(params[name]) : placeholder,
      ),
    ]),
  );
}

/** Cut every language of a multi-language object to `max` characters. */
export function truncate(message, max) {
  return Object.fromEntries(
    Object.entries(message).map(([language, text]) => [
      language,
      text.length > max ? `${text.slice(0, max - 1)}…` : text,
    ]),
  );
}
