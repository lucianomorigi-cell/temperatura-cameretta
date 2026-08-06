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

const sensoreRef = ref(
  database,
  "dispositivi/cameretta"
);

const climaRef = ref(
  database,
  "dispositivi/cameretta/climatizzatore"
);

const TEMPO_OFFLINE_MS = 15000;

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

let ultimiDati = null;
let climatizzatoreAcceso = false;
let automaticoAttivo = false;
let comandoPowerInCorso = false;
let comandoAutomaticoInCorso = false;
let salvataggioInCorso = false;

function mostraValori(dati) {
  if (typeof dati.temperatura === "number") {
    temperaturaEl.textContent =
      dati.temperatura.toFixed(1);
  }

  if (typeof dati.umidita === "number") {
    umiditaEl.textContent =
      dati.umidita.toFixed(0);
  }

  if (typeof dati.rssi === "number") {
    rssiEl.textContent =
      dati.rssi;
  }
}

function nascondiValori() {
  temperaturaEl.textContent = "--";
  umiditaEl.textContent = "--";
  rssiEl.textContent = "--";
}

function mostraOnline() {
  statoEl.textContent = "ESP32 online";

  statusDotEl.classList.add("online");
  statusDotEl.classList.remove("offline");
}

function mostraOffline() {
  statoEl.textContent = "ESP32 offline";

  statusDotEl.classList.remove("online");
  statusDotEl.classList.add("offline");
}

function aggiornaStato() {
  if (
    !ultimiDati ||
    typeof ultimiDati.ultimoAggiornamento !== "number"
  ) {
    ultimoAggiornamentoEl.textContent = "--";
    mostraOffline();
    return;
  }

  const timestamp =
    ultimiDati.ultimoAggiornamento;

  const tempoTrascorso =
    Date.now() - timestamp;

  ultimoAggiornamentoEl.textContent =
    new Date(timestamp).toLocaleString("it-IT");

  mostraValori(ultimiDati);

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

onValue(
  sensoreRef,

  (snapshot) => {
    const nuoviDati = snapshot.val();

    if (!nuoviDati) {
      erroreEl.hidden = false;

      erroreEl.textContent =
        "Nessun dato disponibile nel database.";

      aggiornaStato();
      return;
    }

    ultimiDati = {
      ...(ultimiDati || {}),
      ...nuoviDati
    };

    erroreEl.hidden = true;

    aggiornaStato();
  },

  (errore) => {
    console.error(
      "Errore lettura sensori:",
      errore
    );

    erroreEl.hidden = false;

    erroreEl.textContent =
      "Impossibile leggere i dati da Firebase.";

    mostraOffline();
  }
);

onValue(
  climaRef,

  (snapshot) => {
    const dati = snapshot.val();

    if (!dati) {
      climatizzatoreAcceso = false;
      automaticoAttivo = false;

      autoModeEl.checked = false;
      tempOnEl.value = 26;
      tempOffEl.value = 24;

      aggiornaPulsante();
      return;
    }

    climatizzatoreAcceso =
      dati.power === true;

    automaticoAttivo =
      dati.automatico === true;

    autoModeEl.checked =
      automaticoAttivo;

    tempOnEl.value =
      typeof dati.sogliaAccensione === "number"
        ? dati.sogliaAccensione
        : 26;

    tempOffEl.value =
      typeof dati.sogliaSpegnimento === "number"
        ? dati.sogliaSpegnimento
        : 24;

    aggiornaPulsante();
  },

  (errore) => {
    console.error(
      "Errore lettura climatizzatore:",
      errore
    );

    erroreEl.hidden = false;

    erroreEl.textContent =
      "Impossibile leggere lo stato del climatizzatore.";
  }
);

powerButtonEl.addEventListener(
  "click",

  async () => {
    if (comandoPowerInCorso) {
      return;
    }

    const nuovoStato =
      !climatizzatoreAcceso;

    comandoPowerInCorso = true;

    aggiornaPulsante();

    try {
      await update(climaRef, {
        power: nuovoStato,
        automatico: false
      });
    } catch (errore) {
      console.error(
        "Errore comando manuale:",
        errore
      );

      alert(
        "Errore durante l'invio del comando."
      );
    } finally {
      comandoPowerInCorso = false;

      aggiornaPulsante();
    }
  }
);

autoModeEl.addEventListener(
  "change",

  async () => {
    if (comandoAutomaticoInCorso) {
      return;
    }

    const nuovoStato =
      autoModeEl.checked;

    const statoPrecedente =
      automaticoAttivo;

    comandoAutomaticoInCorso = true;
    autoModeEl.disabled = true;

    try {
      await update(climaRef, {
        automatico: nuovoStato
      });
    } catch (errore) {
      console.error(
        "Errore modalità automatica:",
        errore
      );

      autoModeEl.checked =
        statoPrecedente;

      alert(
        "Errore durante la modifica della modalità automatica."
      );
    } finally {
      comandoAutomaticoInCorso = false;
      autoModeEl.disabled = false;
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
      parseFloat(tempOnEl.value);

    const sogliaSpegnimento =
      parseFloat(tempOffEl.value);

    if (
      Number.isNaN(sogliaAccensione) ||
      Number.isNaN(sogliaSpegnimento)
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

    salvataggioInCorso = true;
    saveSettingsEl.disabled = true;

    const testoOriginale =
      saveSettingsEl.textContent;

    saveSettingsEl.textContent =
      "SALVATAGGIO...";

    try {
      await update(climaRef, {
        sogliaAccensione,
        sogliaSpegnimento
      });

      alert(
        "Impostazioni salvate e inviate all'ESP32."
      );
    } catch (errore) {
      console.error(
        "Errore salvataggio impostazioni:",
        errore
      );

      alert(
        "Errore durante il salvataggio."
      );
    } finally {
      salvataggioInCorso = false;
      saveSettingsEl.disabled = false;

      saveSettingsEl.textContent =
        testoOriginale;
    }
  }
);

setInterval(
  aggiornaStato,
  1000
);
