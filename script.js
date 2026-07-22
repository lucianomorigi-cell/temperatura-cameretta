import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC5ENdkXqnd6XQJhDDlc6wDcVAAekvW5ak",
  authDomain: "temperatura-cameretta.firebaseapp.com",
  databaseURL: "https://temperatura-cameretta-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "temperatura-cameretta",
  storageBucket: "temperatura-cameretta.firebasestorage.app",
  messagingSenderId: "1031899495611",
  appId: "1:1031899495611:web:3a57f6e4c6615f15093d9e"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const sensoreRef = ref(database, "dispositivi/cameretta");

const temperaturaEl = document.getElementById("temperatura");
const umiditaEl = document.getElementById("umidita");
const rssiEl = document.getElementById("rssi");
const statoEl = document.getElementById("stato");
const statusDotEl = document.getElementById("statusDot");
const ultimoAggiornamentoEl = document.getElementById("ultimoAggiornamento");
const erroreEl = document.getElementById("errore");

function impostaStato(online) {
  statoEl.textContent = online ? "ESP32 online" : "ESP32 offline";
  statusDotEl.classList.toggle("online", online);
  statusDotEl.classList.toggle("offline", !online);
}

onValue(
  sensoreRef,
  (snapshot) => {
    const dati = snapshot.val();

    if (!dati) {
      erroreEl.hidden = false;
      erroreEl.textContent = "Nessun dato disponibile nel database.";
      impostaStato(false);
      return;
    }

    erroreEl.hidden = true;

    temperaturaEl.textContent =
      typeof dati.temperatura === "number" ? dati.temperatura.toFixed(1) : "--";

    umiditaEl.textContent =
      typeof dati.umidita === "number" ? dati.umidita.toFixed(0) : "--";

    rssiEl.textContent =
      typeof dati.rssi === "number" ? dati.rssi : "--";

    impostaStato(dati.online === true);
    ultimoAggiornamentoEl.textContent = new Date().toLocaleString("it-IT");
  },
  (errore) => {
    console.error(errore);
    erroreEl.hidden = false;
    erroreEl.textContent =
      "Impossibile leggere Firebase. Controlla le regole del database.";
    impostaStato(false);
  }
);
