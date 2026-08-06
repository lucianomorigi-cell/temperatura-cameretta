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
  storageBucket: "temperatura-cameretta.firebasestorage.app",
  messagingSenderId: "1031899495611",
  appId: "1:1031899495611:web:3a57f6e4c6615f15093d9e"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const temperaturaRef = ref(
  database,
  "dispositivi/cameretta/temperatura"
);

const umiditaRef = ref(
  database,
  "dispositivi/cameretta/umidita"
);

const rssiRef = ref(
  database,
  "dispositivi/cameretta/rssi"
);

const ultimoAggiornamentoRef = ref(
  database,
  "dispositivi/cameretta/ultimoAggiornamento"
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

let esp32Online = false;

let climatizzatoreAcceso = false;
let automaticoAttivo = false;

let comandoPowerInCorso = false;
let comandoAutomaticoInCorso = false;
let salvataggioInCorso = false;
let salvataggioProgrammaInCorso = false;

let programmaCaricato = false;

function mostraErrore(messaggio) {
  erroreEl.hidden = false;
  erroreEl.textContent = messaggio;
}

function nascondiErrore() {
  erroreEl.hidden = true;
}

function mostraValori() {
  if (!esp32Online) {
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

function nascondiValori() {
  temperaturaEl.textContent = "--";
  umiditaEl.textContent = "--";
  rssiEl.textContent = "--";
}

function mostraOnline() {
  esp32Online = true;

  statoEl.textContent = "ESP32 online";

  statusDotEl.classList.add("online");
  statusDotEl.classList.remove("offline");

  mostraValori();
}

function mostraOffline() {
  esp32Online = false;

  statoEl.textContent = "ESP32 offline";

  statusDotEl.classList.remove("online");
  statusDotEl.classList.add("offline");

  nascondiValori();
}

function aggiornaStato() {
  if (typeof ultimoAggiornamento !== "number") {
    ultimoAggiornamentoEl.textContent = "--";
    mostraOffline();
    return;
  }

  ultimoAggiornamentoEl.textContent =
    new Date(
      ultimoAggiornamento
    ).toLocaleString("it-IT");

  const tempoTrascorso =
    Date.now() - ultimoAggiornamento;

  if (tempoTrascorso <= TEMPO_OFFLINE_MS) {
    mostraOnline();
  } else {
    mostraOffline();
  }
}

function aggiornaPulsante() {
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

function creaRigaEvento(evento = {}) {
  if (
    !scheduleRowsEl ||
    scheduleRowsEl.children.length >= MAX_EVENTI
  ) {
    return;
  }

  const riga =
    document.createElement("div");

  riga.className =
    "schedule-row";

  const ora =
    document.createElement("input");

  ora.type = "time";
  ora.className = "event-time";

  const oraEvento =
    Number.isInteger(evento.ora)
      ? evento.ora
      : 8;

  const minutoEvento =
    Number.isInteger(evento.minuto)
      ? evento.minuto
      : 0;

  ora.value =
    `${String(oraEvento).padStart(2, "0")}:` +
    `${String(minutoEvento).padStart(2, "0")}`;

  const azione =
    document.createElement("select");

  azione.className =
    "event-action";

  azione.innerHTML = `
    <option value="on">ACCENDI</option>
    <option value="off">SPEGNI</option>
  `;

  azione.value =
    evento.azione === false
      ? "off"
      : "on";

  const rimuovi =
    document.createElement("button");

  rimuovi.type = "button";
  rimuovi.className =
    "remove-event";

  rimuovi.textContent =
    "RIMUOVI";

  rimuovi.addEventListener(
    "click",
    () => {
      riga.remove();
    }
  );

  riga.append(
    ora,
    azione,
    rimuovi
  );

  scheduleRowsEl.appendChild(
    riga
  );
}

function caricaProgramma(programmazione) {
  if (
    !scheduleEnabledEl ||
    !scheduleRowsEl
  ) {
    return;
  }

  scheduleEnabledEl.checked =
    programmazione?.abilitata === true;

  scheduleRowsEl.innerHTML = "";

  const eventi =
    programmazione?.eventi ?? {};

  const lista =
    Array.isArray(eventi)
      ? eventi
      : Object.values(eventi);

  lista
    .filter(
      (evento) =>
        evento &&
        evento.attivo !== false
    )
    .sort(
      (a, b) =>
        (
          Number(a.ora) * 60 +
          Number(a.minuto)
        ) -
        (
          Number(b.ora) * 60 +
          Number(b.minuto)
        )
    )
    .forEach(
      (evento) => {
        creaRigaEvento(evento);
      }
    );

  if (
    scheduleRowsEl.children.length === 0
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
  if (!scheduleRowsEl) {
    return [];
  }

  return [
    ...scheduleRowsEl.querySelectorAll(
      ".schedule-row"
    )
  ]
    .map(
      (riga) => {
        const valoreOra =
          riga.querySelector(
            ".event-time"
          ).value;

        const valoreAzione =
          riga.querySelector(
            ".event-action"
          ).value;

        if (!valoreOra) {
          return null;
        }

        const [ora, minuto] =
          valoreOra
            .split(":")
            .map(Number);

        return {
          attivo: true,
          ora,
          minuto,
          azione:
            valoreAzione === "on"
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

onValue(
  temperaturaRef,

  (snapshot) => {
    const valore =
      snapshot.val();

    if (
      typeof valore === "number"
    ) {
      temperaturaCorrente =
        valore;

      mostraValori();
      nascondiErrore();
    }
  },

  (errore) => {
    console.error(
      "Errore temperatura:",
      errore
    );

    mostraErrore(
      "Impossibile leggere la temperatura."
    );
  }
);

onValue(
  umiditaRef,

  (snapshot) => {
    const valore =
      snapshot.val();

    if (
      typeof valore === "number"
    ) {
      umiditaCorrente =
        valore;

      mostraValori();
      nascondiErrore();
    }
  },

  (errore) => {
    console.error(
      "Errore umidità:",
      errore
    );

    mostraErrore(
      "Impossibile leggere l'umidità."
    );
  }
);

onValue(
  rssiRef,

  (snapshot) => {
    const valore =
      snapshot.val();

    if (
      typeof valore === "number"
    ) {
      rssiCorrente =
        valore;

      mostraValori();
      nascondiErrore();
    }
  },

  (errore) => {
    console.error(
      "Errore RSSI:",
      errore
    );

    mostraErrore(
      "Impossibile leggere il segnale Wi-Fi."
    );
  }
);

onValue(
  ultimoAggiornamentoRef,

  (snapshot) => {
    const valore =
      snapshot.val();

    if (
      typeof valore === "number"
    ) {
      ultimoAggiornamento =
        valore;

      aggiornaStato();
      nascondiErrore();
    } else {
      ultimoAggiornamento =
        null;

      aggiornaStato();
    }
  },

  (errore) => {
    console.error(
      "Errore stato ESP32:",
      errore
    );

    mostraErrore(
      "Impossibile leggere lo stato dell'ESP32."
    );

    mostraOffline();
  }
);

onValue(
  climaRef,

  (snapshot) => {
    const dati =
      snapshot.val();

    if (!dati) {
      climatizzatoreAcceso =
        false;

      automaticoAttivo =
        false;

      autoModeEl.checked =
        false;

      tempOnEl.value =
        26;

      tempOffEl.value =
        24;

      aggiornaPulsante();

      if (!programmaCaricato) {
        caricaProgramma(null);
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
      caricaProgramma(
        dati.programmazione
      );
    } else if (
      !salvataggioProgrammaInCorso &&
      scheduleEnabledEl
    ) {
      scheduleEnabledEl.checked =
        dati.programmazione
          ?.abilitata === true;
    }

    aggiornaPulsante();
  },

  (errore) => {
    console.error(
      "Errore climatizzatore:",
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

    comandoPowerInCorso =
      true;

    climatizzatoreAcceso =
      nuovoStato;

    aggiornaPulsante();

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

      aggiornaPulsante();

      alert(
        "Errore durante l'invio del comando."
      );
    } finally {
      comandoPowerInCorso =
        false;

      aggiornaPulsante();
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

    const nuovoStato =
      autoModeEl.checked;

    const statoPrecedente =
      automaticoAttivo;

    comandoAutomaticoInCorso =
      true;

    automaticoAttivo =
      nuovoStato;

    autoModeEl.disabled =
      true;

    try {
      await update(
        climaRef,
        {
          automatico:
            nuovoStato,

          "programmazione/abilitata":
            nuovoStato
              ? false
              : (
                  scheduleEnabledEl
                    ?.checked === true
                )
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

      autoModeEl.disabled =
        false;
    }
  }
);

saveSettingsEl.addEventListener(
  "click",

  async () => {
    if (salvataggioInCorso) {
      return;
    }

    const sogliaAccensione =
      parseFloat(
        tempOnEl.value
      );

    const sogliaSpegnimento =
      parseFloat(
        tempOffEl.value
      );

    if (
      Number.isNaN(
        sogliaAccensione
      ) ||
      Number.isNaN(
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

    salvataggioInCorso =
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
        "Errore salvataggio:",
        errore
      );

      alert(
        "Errore durante il salvataggio."
      );
    } finally {
      salvataggioInCorso =
        false;

      saveSettingsEl.disabled =
        false;

      saveSettingsEl.textContent =
        testoOriginale;
    }
  }
);

if (addScheduleEl) {
  addScheduleEl.addEventListener(
    "click",

    () => {
      creaRigaEvento({
        ora: 12,
        minuto: 0,
        azione:
          scheduleRowsEl
            .children
            .length % 2 === 0
      });
    }
  );
}

if (saveScheduleEl) {
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

      if (
        eventi.length === 0
      ) {
        alert(
          "Aggiungi almeno un evento."
        );

        return;
      }

      salvataggioProgrammaInCorso =
        true;

      saveScheduleEl.disabled =
        true;

      addScheduleEl.disabled =
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
              scheduleEnabledEl
                .checked
                ? false
                : automaticoAttivo,

            programmazione: {
              abilitata:
                scheduleEnabledEl
                  .checked,

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

        saveScheduleEl.textContent =
          testoOriginale;
      }
    }
  );
}

setInterval(
  aggiornaStato,
  1000
);
