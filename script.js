import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  update
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC5ENdkXqnd6XQJhDDlc6wDcVAAekvW5ak",
  authDomain: "temperatura-cameretta.firebaseapp.com",
  databaseURL:
    "https://temperatura-cameretta-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "temperatura-cameretta",
  storageBucket:
    "temperatura-cameretta.firebasestorage.app",
  messagingSenderId:
    "1031899495611",
  appId:
    "1:1031899495611:web:3a57f6e4c6615f15093d9e"
};

const app =
  initializeApp(firebaseConfig);

const database =
  getDatabase(app);

const cameraRef = ref(
  database,
  "dispositivi/cameretta"
);

const climaRef = ref(
  database,
  "dispositivi/cameretta/climatizzatore"
);

const TEMPO_OFFLINE_MS = 15000;
const MAX_EVENTI = 10;

const temperaturaEl =
  document.getElementById("temperatura");

const umiditaEl =
  document.getElementById("umidita");

const rssiEl =
  document.getElementById("rssi");

const statoEl =
  document.getElementById("stato");

const statusDotEl =
  document.getElementById("statusDot");

const ultimoAggiornamentoEl =
  document.getElementById("ultimoAggiornamento");

const indirizzoIpEl =
  document.getElementById("indirizzoIp");

const uptimeEl =
  document.getElementById("uptime");

const firmwareEl =
  document.getElementById("firmware");

const erroreEl =
  document.getElementById("errore");

const powerButtonEl =
  document.getElementById("powerButton");

const powerStateEl =
  document.getElementById("powerState");

const autoModeEl =
  document.getElementById("autoMode");

const tempOnEl =
  document.getElementById("tempOn");

const tempOffEl =
  document.getElementById("tempOff");

const saveSettingsEl =
  document.getElementById("saveSettings");

const scheduleEnabledEl =
  document.getElementById("scheduleEnabled");

const scheduleRowsEl =
  document.getElementById("scheduleRows");

const addScheduleEl =
  document.getElementById("addSchedule");

const saveScheduleEl =
  document.getElementById("saveSchedule");

let temperaturaCorrente = null;
let umiditaCorrente = null;
let rssiCorrente = null;
let ultimoAggiornamento = null;
let indirizzoIp = null;
let uptime = null;
let firmware = null;

let esp32Online = false;

let climatizzatoreAcceso = false;
let automaticoAttivo = false;

let comandoPowerInCorso = false;
let comandoAutomaticoInCorso = false;
let salvataggioSoglieInCorso = false;
let salvataggioProgrammaInCorso = false;

let programmaCaricato = false;

function mostraErrore(messaggio) {
  erroreEl.hidden = false;
  erroreEl.textContent = messaggio;
}

function nascondiErrore() {
  erroreEl.hidden = true;
  erroreEl.textContent = "";
}

function formattaUptime(secondi) {
  if (
    typeof secondi !== "number" ||
    !Number.isFinite(secondi) ||
    secondi < 0
  ) {
    return "--";
  }

  const giorni =
    Math.floor(secondi / 86400);

  const ore =
    Math.floor(
      (secondi % 86400) / 3600
    );

  const minuti =
    Math.floor(
      (secondi % 3600) / 60
    );

  if (giorni > 0) {
    return `${giorni}g ${ore}h ${minuti}m`;
  }

  if (ore > 0) {
    return `${ore}h ${minuti}m`;
  }

  return `${minuti}m`;
}

function nascondiValoriSensori() {
  temperaturaEl.textContent = "--";
  umiditaEl.textContent = "--";
  rssiEl.textContent = "--";
}

function mostraValoriSensori() {
  if (!esp32Online) {
    nascondiValoriSensori();
    return;
  }

  temperaturaEl.textContent =
    typeof temperaturaCorrente === "number"
      ? temperaturaCorrente.toFixed(1)
      : "--";

  umiditaEl.textContent =
    typeof umiditaCorrente === "number"
      ? umiditaCorrente.toFixed(0)
      : "--";

  rssiEl.textContent =
    typeof rssiCorrente === "number"
      ? rssiCorrente.toFixed(0)
      : "--";
}

function mostraDatiSistema() {
  indirizzoIpEl.textContent =
    esp32Online &&
    typeof indirizzoIp === "string" &&
    indirizzoIp.length > 0
      ? indirizzoIp
      : "--";

  uptimeEl.textContent =
    esp32Online
      ? formattaUptime(uptime)
      : "--";

  firmwareEl.textContent =
    typeof firmware === "string" &&
    firmware.length > 0
      ? firmware
      : "--";
}

function mostraOnline() {
  esp32Online = true;

  document.body.classList.add(
    "esp32-online"
  );

  statoEl.textContent =
    "ESP32 online";

  statusDotEl.classList.add(
    "online"
  );

  statusDotEl.classList.remove(
    "offline"
  );

  mostraValoriSensori();
  mostraDatiSistema();
}

function mostraOffline() {
  esp32Online = false;

  document.body.classList.remove(
    "esp32-online"
  );

  statoEl.textContent =
    "ESP32 offline";

  statusDotEl.classList.remove(
    "online"
  );

  statusDotEl.classList.add(
    "offline"
  );

  nascondiValoriSensori();

  indirizzoIpEl.textContent = "--";
  uptimeEl.textContent = "--";
}

function aggiornaStatoOnline() {
  if (
    typeof ultimoAggiornamento !==
      "number" ||
    !Number.isFinite(
      ultimoAggiornamento
    )
  ) {
    ultimoAggiornamentoEl.textContent =
      "--";

    mostraOffline();
    return;
  }

  ultimoAggiornamentoEl.textContent =
    new Date(
      ultimoAggiornamento
    ).toLocaleString("it-IT");

  const tempoTrascorso =
    Date.now() -
    ultimoAggiornamento;

  if (
    tempoTrascorso <=
    TEMPO_OFFLINE_MS
  ) {
    mostraOnline();
  } else {
    mostraOffline();
  }
}

function aggiornaPulsantePower() {
  powerStateEl.textContent =
    climatizzatoreAcceso
      ? "ACCESO"
      : "SPENTO";

  powerButtonEl.textContent =
    climatizzatoreAcceso
      ? "SPEGNI"
      : "ACCENDI";

  powerButtonEl.disabled =
    comandoPowerInCorso;

  if (comandoPowerInCorso) {
    powerButtonEl.textContent =
      "ATTENDERE...";
  }
}

function normalizzaNumero(
  valore,
  predefinito
) {
  return typeof valore === "number" &&
    Number.isFinite(valore)
    ? valore
    : predefinito;
}

function creaRigaEvento(
  evento = {}
) {
  if (
    scheduleRowsEl.children.length >=
    MAX_EVENTI
  ) {
    return;
  }

  const riga =
    document.createElement("div");

  riga.className =
    "schedule-row";

  const oraInput =
    document.createElement("input");

  oraInput.type = "time";
  oraInput.className =
    "event-time";

  const ora =
    normalizzaNumero(
      evento.ora,
      8
    );

  const minuto =
    normalizzaNumero(
      evento.minuto,
      0
    );

  oraInput.value =
    `${String(ora).padStart(2, "0")}:` +
    `${String(minuto).padStart(2, "0")}`;

  const azioneSelect =
    document.createElement("select");

  azioneSelect.className =
    "event-action";

  azioneSelect.innerHTML = `
    <option value="on">ACCENDI</option>
    <option value="off">SPEGNI</option>
  `;

  azioneSelect.value =
    evento.azione === false
      ? "off"
      : "on";

  const rimuoviButton =
    document.createElement("button");

  rimuoviButton.type = "button";
  rimuoviButton.className =
    "remove-event";

  rimuoviButton.textContent =
    "RIMUOVI";

  rimuoviButton.addEventListener(
    "click",
    () => {
      riga.remove();
    }
  );

  riga.append(
    oraInput,
    azioneSelect,
    rimuoviButton
  );

  scheduleRowsEl.appendChild(
    riga
  );
}

function caricaProgrammazione(
  programmazione
) {
  scheduleEnabledEl.checked =
    programmazione?.abilitata === true;

  scheduleRowsEl.innerHTML = "";

  const eventi =
    programmazione?.eventi ?? {};

  const listaEventi =
    Array.isArray(eventi)
      ? eventi
      : Object.values(eventi);

  listaEventi
    .filter(
      (evento) =>
        evento &&
        evento.attivo !== false
    )
    .sort(
      (a, b) =>
        (
          normalizzaNumero(
            a.ora,
            0
          ) *
            60 +
          normalizzaNumero(
            a.minuto,
            0
          )
        ) -
        (
          normalizzaNumero(
            b.ora,
            0
          ) *
            60 +
          normalizzaNumero(
            b.minuto,
            0
          )
        )
    )
    .slice(0, MAX_EVENTI)
    .forEach(
      (evento) => {
        creaRigaEvento(evento);
      }
    );

  if (
    scheduleRowsEl.children.length ===
    0
  ) {
    creaRigaEvento({
      ora: 8,
      minuto: 0,
      azione: true
    });

    creaRigaEvento({
      ora: 9,
      minuto: 0,
      azione: false
    });
  }

  programmaCaricato = true;
}

function leggiEventiInterfaccia() {
  return [
    ...scheduleRowsEl.querySelectorAll(
      ".schedule-row"
    )
  ]
    .map(
      (riga) => {
        const oraInput =
          riga.querySelector(
            ".event-time"
          );

        const azioneSelect =
          riga.querySelector(
            ".event-action"
          );

        if (
          !oraInput ||
          !azioneSelect ||
          !oraInput.value
        ) {
          return null;
        }

        const [ora, minuto] =
          oraInput.value
            .split(":")
            .map(Number);

        if (
          !Number.isInteger(ora) ||
          !Number.isInteger(minuto) ||
          ora < 0 ||
          ora > 23 ||
          minuto < 0 ||
          minuto > 59
        ) {
          return null;
        }

        return {
          attivo: true,
          ora,
          minuto,
          azione:
            azioneSelect.value ===
            "on"
        };
      }
    )
    .filter(Boolean)
    .sort(
      (a, b) =>
        (
          a.ora * 60 +
          a.minuto
        ) -
        (
          b.ora * 60 +
          b.minuto
        )
    );
}

function aggiornaDatiCamera(
  dati
) {
  const sensori =
    dati?.sensori ?? {};

  const sistema =
    dati?.sistema ?? {};

  temperaturaCorrente =
    typeof sensori.temperatura ===
      "number"
      ? sensori.temperatura
      : null;

  umiditaCorrente =
    typeof sensori.umidita ===
      "number"
      ? sensori.umidita
      : null;

  rssiCorrente =
    typeof sistema.rssi === "number"
      ? sistema.rssi
      : null;

  ultimoAggiornamento =
    typeof sistema
      .ultimoAggiornamento ===
      "number"
      ? sistema.ultimoAggiornamento
      : null;

  indirizzoIp =
    typeof sistema.ip === "string"
      ? sistema.ip
      : null;

  uptime =
    typeof sistema.uptime === "number"
      ? sistema.uptime
      : null;

  firmware =
    typeof sistema.firmware === "string"
      ? sistema.firmware
      : null;

  aggiornaStatoOnline();
}

function aggiornaDatiClima(
  dati
) {
  if (!dati) {
    climatizzatoreAcceso = false;
    automaticoAttivo = false;

    autoModeEl.checked = false;
    tempOnEl.value = 26;
    tempOffEl.value = 24;

    aggiornaPulsantePower();

    if (!programmaCaricato) {
      caricaProgrammazione(null);
    }

    return;
  }

  climatizzatoreAcceso =
    dati.power === true;

  automaticoAttivo =
    dati.automatico === true;

  autoModeEl.checked =
    automaticoAttivo;

  if (
    document.activeElement !==
      tempOnEl &&
    typeof dati.sogliaAccensione ===
      "number"
  ) {
    tempOnEl.value =
      dati.sogliaAccensione;
  }

  if (
    document.activeElement !==
      tempOffEl &&
    typeof dati.sogliaSpegnimento ===
      "number"
  ) {
    tempOffEl.value =
      dati.sogliaSpegnimento;
  }

  if (!programmaCaricato) {
    caricaProgrammazione(
      dati.programmazione
    );
  } else if (
    !salvataggioProgrammaInCorso
  ) {
    scheduleEnabledEl.checked =
      dati.programmazione
        ?.abilitata === true;
  }

  aggiornaPulsantePower();
}

onValue(
  cameraRef,
  (snapshot) => {
    const dati =
      snapshot.val();

    if (!dati) {
      temperaturaCorrente = null;
      umiditaCorrente = null;
      rssiCorrente = null;
      ultimoAggiornamento = null;
      indirizzoIp = null;
      uptime = null;
      firmware = null;

      aggiornaStatoOnline();

      mostraErrore(
        "Nessun dato disponibile."
      );

      return;
    }

    aggiornaDatiCamera(dati);
    nascondiErrore();
  },
  (errore) => {
    console.error(
      "Errore lettura camera:",
      errore
    );

    mostraOffline();

    mostraErrore(
      "Impossibile leggere i dati da Firebase."
    );
  }
);

onValue(
  climaRef,
  (snapshot) => {
    aggiornaDatiClima(
      snapshot.val()
    );
  },
  (errore) => {
    console.error(
      "Errore lettura climatizzatore:",
      errore
    );

    mostraErrore(
      "Impossibile leggere lo stato del climatizzatore."
    );
  }
);

powerButtonEl.addEventListener(
  "click",
  async () => {
    if (comandoPowerInCorso) {
      return;
    }

    const statoPrecedente =
      climatizzatoreAcceso;

    const nuovoStato =
      !climatizzatoreAcceso;

    comandoPowerInCorso = true;
    climatizzatoreAcceso =
      nuovoStato;

    aggiornaPulsantePower();

    try {
      await update(
        climaRef,
        {
          power: nuovoStato,
          automatico: false,
          "programmazione/abilitata":
            false
        }
      );
    } catch (errore) {
      console.error(
        "Errore comando manuale:",
        errore
      );

      climatizzatoreAcceso =
        statoPrecedente;

      aggiornaPulsantePower();

      alert(
        "Errore durante l'invio del comando."
      );
    } finally {
      comandoPowerInCorso = false;
      aggiornaPulsantePower();
    }
  }
);

autoModeEl.addEventListener(
  "change",
  async () => {
    if (
      comandoAutomaticoInCorso
    ) {
      return;
    }

    const statoPrecedente =
      automaticoAttivo;

    const nuovoStato =
      autoModeEl.checked;

    comandoAutomaticoInCorso =
      true;

    automaticoAttivo =
      nuovoStato;

    autoModeEl.disabled = true;

    try {
      await update(
        climaRef,
        {
          automatico: nuovoStato,
          "programmazione/abilitata":
            nuovoStato
              ? false
              : scheduleEnabledEl
                  .checked
        }
      );
    } catch (errore) {
      console.error(
        "Errore modalità automatica:",
        errore
      );

      automaticoAttivo =
        statoPrecedente;

      autoModeEl.checked =
        statoPrecedente;

      alert(
        "Errore durante la modifica della modalità automatica."
      );
    } finally {
      comandoAutomaticoInCorso =
        false;

      autoModeEl.disabled = false;
    }
  }
);

saveSettingsEl.addEventListener(
  "click",
  async () => {
    if (
      salvataggioSoglieInCorso
    ) {
      return;
    }

    const sogliaAccensione =
      Number.parseFloat(
        tempOnEl.value
      );

    const sogliaSpegnimento =
      Number.parseFloat(
        tempOffEl.value
      );

    if (
      !Number.isFinite(
        sogliaAccensione
      ) ||
      !Number.isFinite(
        sogliaSpegnimento
      )
    ) {
      alert(
        "Inserisci due temperature valide."
      );

      return;
    }

    if (
      sogliaSpegnimento >
      sogliaAccensione
    ) {
      alert(
        "La temperatura di spegnimento non può essere superiore a quella di accensione."
      );

      return;
    }

    if (
      sogliaAccensione < 15 ||
      sogliaAccensione > 35 ||
      sogliaSpegnimento < 15 ||
      sogliaSpegnimento > 35
    ) {
      alert(
        "Le temperature devono essere comprese tra 15 °C e 35 °C."
      );

      return;
    }

    salvataggioSoglieInCorso =
      true;

    saveSettingsEl.disabled =
      true;

    const testoOriginale =
      saveSettingsEl.textContent;

    saveSettingsEl.textContent =
      "SALVATAGGIO...";

    try {
      await update(
        climaRef,
        {
          sogliaAccensione,
          sogliaSpegnimento
        }
      );

      alert(
        "Impostazioni salvate."
      );
    } catch (errore) {
      console.error(
        "Errore salvataggio soglie:",
        errore
      );

      alert(
        "Errore durante il salvataggio."
      );
    } finally {
      salvataggioSoglieInCorso =
        false;

      saveSettingsEl.disabled =
        false;

      saveSettingsEl.textContent =
        testoOriginale;
    }
  }
);

addScheduleEl.addEventListener(
  "click",
  () => {
    if (
      scheduleRowsEl.children.length >=
      MAX_EVENTI
    ) {
      alert(
        "Puoi inserire al massimo 10 eventi."
      );

      return;
    }

    creaRigaEvento({
      ora: 12,
      minuto: 0,
      azione:
        scheduleRowsEl.children
          .length %
          2 ===
        0
    });
  }
);

saveScheduleEl.addEventListener(
  "click",
  async () => {
    if (
      salvataggioProgrammaInCorso
    ) {
      return;
    }

    const eventi =
      leggiEventiInterfaccia();

    if (eventi.length === 0) {
      alert(
        "Aggiungi almeno un evento."
      );

      return;
    }

    const orariDuplicati =
      new Set();

    for (const evento of eventi) {
      const chiave =
        `${evento.ora}:${evento.minuto}`;

      if (
        orariDuplicati.has(chiave)
      ) {
        alert(
          "Non puoi inserire due eventi allo stesso orario."
        );

        return;
      }

      orariDuplicati.add(chiave);
    }

    salvataggioProgrammaInCorso =
      true;

    saveScheduleEl.disabled =
      true;

    addScheduleEl.disabled =
      true;

    scheduleEnabledEl.disabled =
      true;

    const testoOriginale =
      saveScheduleEl.textContent;

    saveScheduleEl.textContent =
      "SALVATAGGIO...";

    const eventiFirebase = {};

    eventi.forEach(
      (evento, indice) => {
        eventiFirebase[indice] =
          evento;
      }
    );

    try {
      await update(
        climaRef,
        {
          automatico:
            scheduleEnabledEl.checked
              ? false
              : automaticoAttivo,

          programmazione: {
            abilitata:
              scheduleEnabledEl.checked,

            eventi:
              eventiFirebase
          }
        }
      );

      alert(
        "Programmazione salvata."
      );
    } catch (errore) {
      console.error(
        "Errore programmazione:",
        errore
      );

      alert(
        "Errore durante il salvataggio della programmazione."
      );
    } finally {
      salvataggioProgrammaInCorso =
        false;

      saveScheduleEl.disabled =
        false;

      addScheduleEl.disabled =
        false;

      scheduleEnabledEl.disabled =
        false;

      saveScheduleEl.textContent =
        testoOriginale;
    }
  }
);

setInterval(
  () => {
    aggiornaStatoOnline();

    if (!esp32Online) {
      nascondiValoriSensori();
    }
  },
  1000
);
