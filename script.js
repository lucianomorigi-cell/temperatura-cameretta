import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  set
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

const sensoreRef = ref(database, "dispositivi/cameretta");
const powerRef = ref(
  database,
  "dispositivi/cameretta/climatizzatore/power"
);

const TEMPO_OFFLINE_MS = 90000;

const temperaturaEl = document.getElementById("temperatura");
const umiditaEl = document.getElementById("umidita");
const rssiEl = document.getElementById("rssi");
const statoEl = document.getElementById("stato");
const statusDotEl = document.getElementById("statusDot");
const ultimoAggiornamentoEl =
  document.getElementById("ultimoAggiornamento");
const erroreEl = document.getElementById("errore");

const powerButtonEl = document.getElementById("powerButton");
const powerStateEl = document.getElementById("powerState");

let ultimiDati = null;
let climatizzatoreAcceso = false;

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

  const timestamp = ultimiDati.ultimoAggiornamento;
  const tempoTrascorso = Date.now() - timestamp;

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
    console.error(errore);

    erroreEl.hidden = false;
    erroreEl.textContent =
      "Impossibile leggere i dati da Firebase.";

    ultimiDati = null;
    aggiornaStato();
  }
);

onValue(powerRef, (snapshot) => {
  climatizzatoreAcceso = snapshot.val() === true;
  aggiornaPulsante();
});

powerButtonEl.addEventListener("click", async () => {
  try {
    await set(powerRef, !climatizzatoreAcceso);
  } catch (errore) {
    console.error(errore);
    alert("Errore durante l'invio del comando.");
  }
});

setInterval(aggiornaStato, 5000);
