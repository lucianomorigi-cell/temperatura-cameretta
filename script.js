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

const TEMPO_OFFLINE_MS = 3000;

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
let comandoPowerInCorso = false;
let salvataggioInCorso = false;

function mostraValori(dati) {
  temperaturaEl.textContent =
    typeof dati.temperatura === "number"
      ? dati.temperatura.toFixed(1)
      : "--";

  umiditaEl.textContent =
    typeof dati.umidita === "number"
      ? dati.umidita.toFixed(0)
      : "--";

  rssiEl.textContent =
    typeof dati.rssi === "number"
      ? dati.rssi
      : "--";
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

  nascondiValori();
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

  if (tempoTrascorso <= TEMPO_OFFLINE_MS) {
    mostraValori(ultimiDati);
    mostraOnline();
  } else {
    mostraOffline();
  }
}

function aggiornaPulsante() {
  if (climatizzatoreAcceso) {
    powerStateEl.textContent = "ACCESO";
    powerButtonEl.textContent = "SPEGNI";
  } else {
    powerStateEl.textContent = "SPENTO";
    powerButtonEl.textContent = "ACCENDI";
  }

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
    ultimiDati = snapshot.val();

    if (!ultimiDati) {
      erroreEl.hidden = false;

      erroreEl.textContent =
        "Nessun dato disponibile nel database.";

      aggiornaStato();
      return;
    }

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

    ultimiDati = null;

    aggiornaStato();
  }
);

onValue(
  climaRef,

  (snapshot) => {
    const dati = snapshot.val();

    if (!dati) {
      climatizzatoreAcceso = false;
      autoModeEl.checked = false;
      tempOnEl.value = 26;
      tempOffEl.value = 24;

      aggiornaPulsante();
      return;
    }

    climatizzatoreAcceso =
      dati.power === true;

    autoModeEl.checked =
      dati.automatico === true;

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

    comandoPowerInCorso = true;

    aggiornaPulsante();

    const nuovoStato =
      !climatizzatoreAcceso;

    try {
      await update(climaRef, {
        power: nuovoStato,
        automatico: false
      });

      climatizzatoreAcceso =
        nuovoStato;

      autoModeEl.checked =
        false;
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
        automatico: autoModeEl.checked,
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
