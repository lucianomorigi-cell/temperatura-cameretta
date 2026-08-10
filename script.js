import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  update,
  push,
  set,
  remove
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

const programmiRef = ref(
  database,
  "dispositivi/cameretta/programmi"
);

const storicoRef = ref(
  database,
  "storico/cameretta"
);


const TEMPO_OFFLINE_MS = 5000;
const FINESTRA_GRAFICO_MS = 12 * 60 * 60 * 1000;
const INTERVALLO_STORICO_MS = 2 * 60 * 1000;
const CONSERVAZIONE_STORICO_MS = 24 * 60 * 60 * 1000;
const SOGLIA_TREND_C = 0.15;

const NOMI_GIORNI = [
  "Dom",
  "Lun",
  "Mar",
  "Mer",
  "Gio",
  "Ven",
  "Sab"
];


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

const programListEl =
  document.getElementById("programList");

const addProgramButtonEl =
  document.getElementById("addProgramButton");

const trendArrowEl =
  document.getElementById("trendArrow");

const trendTextEl =
  document.getElementById("trendText");

const trendDeltaEl =
  document.getElementById("trendDelta");

const historyChartEl =
  document.getElementById("historyChart");

const chartEmptyEl =
  document.getElementById("chartEmpty");

const chartRangeEl =
  document.getElementById("chartRange");


let ultimiDati = null;

let climatizzatoreAcceso = false;
let automaticoAttivo = false;

let comandoPowerInCorso = false;
let comandoAutomaticoInCorso = false;
let salvataggioInCorso = false;

let programmi = {};
let programmaInModifica = null;
let salvataggioProgrammaInCorso = false;

let storico = [];
let temperatureRecenti = [];
let ultimoTimestampSensoreVisto = null;
let ultimoTimestampStoricoSalvato = 0;
let puliziaStoricoEseguita = false;


/* =========================================================
   SENSORI
   ========================================================= */

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

  statoEl.textContent =
    "ESP32 online";

  statusDotEl.classList.add("online");
  statusDotEl.classList.remove("offline");
}


function mostraOffline() {

  statoEl.textContent =
    "ESP32 offline";

  statusDotEl.classList.remove("online");
  statusDotEl.classList.add("offline");

  nascondiValori();
}


function aggiornaStato() {

  if (
    !ultimiDati ||
    typeof ultimiDati.ultimoAggiornamento !== "number"
  ) {

    ultimoAggiornamentoEl.textContent =
      "--";

    mostraOffline();

    return;
  }

  const timestamp =
    ultimiDati.ultimoAggiornamento;

  const tempoTrascorso =
    Date.now() - timestamp;

  ultimoAggiornamentoEl.textContent =
    new Date(timestamp).toLocaleString("it-IT");

  if (
    tempoTrascorso <= TEMPO_OFFLINE_MS
  ) {

    mostraValori(ultimiDati);
    mostraOnline();

  } else {

    mostraOffline();
  }
}


/* =========================================================
   TREND TEMPERATURA E STORICO 12 ORE
   ========================================================= */

function registraTemperaturaRecente(dati) {

  if (
    !dati ||
    typeof dati.temperatura !== "number" ||
    typeof dati.ultimoAggiornamento !== "number"
  ) {
    return;
  }

  if (dati.ultimoAggiornamento === ultimoTimestampSensoreVisto) {
    return;
  }

  ultimoTimestampSensoreVisto = dati.ultimoAggiornamento;

  temperatureRecenti.push({
    timestamp: dati.ultimoAggiornamento,
    temperatura: dati.temperatura
  });

  const limite = Date.now() - (30 * 60 * 1000);

  temperatureRecenti = temperatureRecenti
    .filter((punto) => punto.timestamp >= limite)
    .slice(-20);

  aggiornaTrend();
}


function aggiornaTrend() {

  if (!trendArrowEl || !trendTextEl || !trendDeltaEl) {
    return;
  }

  let campioni = temperatureRecenti;

  if (campioni.length < 2) {
    campioni = storico
      .filter((punto) => punto.timestamp >= Date.now() - (30 * 60 * 1000))
      .map((punto) => ({
        timestamp: punto.timestamp,
        temperatura: punto.temperatura
      }));
  }

  if (campioni.length < 2) {
    trendArrowEl.textContent = "•";
    trendArrowEl.className = "trend-arrow stable";
    trendTextEl.textContent = "Trend in attesa";
    trendDeltaEl.textContent = "--";
    return;
  }

  const primo = campioni[0].temperatura;
  const ultimo = campioni[campioni.length - 1].temperatura;
  const delta = ultimo - primo;

  trendDeltaEl.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} °C`;

  if (delta > SOGLIA_TREND_C) {
    trendArrowEl.textContent = "↑";
    trendArrowEl.className = "trend-arrow warming";
    trendTextEl.textContent = "Verso il caldo";
    return;
  }

  if (delta < -SOGLIA_TREND_C) {
    trendArrowEl.textContent = "↓";
    trendArrowEl.className = "trend-arrow cooling";
    trendTextEl.textContent = "Verso il freddo";
    return;
  }

  trendArrowEl.textContent = "↔";
  trendArrowEl.className = "trend-arrow stable";
  trendTextEl.textContent = "Temperatura stabile";
}


async function salvaPuntoStorico(dati) {

  if (
    !dati ||
    typeof dati.temperatura !== "number" ||
    typeof dati.umidita !== "number" ||
    typeof dati.ultimoAggiornamento !== "number"
  ) {
    return;
  }

  const timestamp = dati.ultimoAggiornamento;

  if (timestamp <= ultimoTimestampStoricoSalvato) {
    return;
  }

  if (
    ultimoTimestampStoricoSalvato > 0 &&
    timestamp - ultimoTimestampStoricoSalvato < INTERVALLO_STORICO_MS
  ) {
    return;
  }

  ultimoTimestampStoricoSalvato = timestamp;

  try {

    const puntoRef = ref(
      database,
      `storico/cameretta/${timestamp}`
    );

    await set(puntoRef, {
      timestamp,
      temperatura: Number(dati.temperatura.toFixed(2)),
      umidita: Number(dati.umidita.toFixed(2))
    });

  } catch (errore) {

    console.error(
      "Errore salvataggio storico:",
      errore
    );
  }
}


function normalizzaStorico(valore) {

  if (!valore || typeof valore !== "object") {
    return [];
  }

  return Object.values(valore)
    .filter((punto) =>
      punto &&
      typeof punto.timestamp === "number" &&
      typeof punto.temperatura === "number" &&
      typeof punto.umidita === "number"
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}


async function pulisciStoricoVecchio(punti) {

  if (puliziaStoricoEseguita) {
    return;
  }

  puliziaStoricoEseguita = true;

  const limite = Date.now() - CONSERVAZIONE_STORICO_MS;
  const vecchi = punti.filter((punto) => punto.timestamp < limite);

  for (const punto of vecchi.slice(0, 100)) {

    try {
      await remove(
        ref(database, `storico/cameretta/${punto.timestamp}`)
      );
    } catch (errore) {
      console.warn("Pulizia storico non riuscita:", errore);
      break;
    }
  }
}


function formattaOra(timestamp) {

  return new Date(timestamp).toLocaleTimeString(
    "it-IT",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


function creaPercorso(punti, x, y, chiave) {

  return punti
    .map((punto, indice) => {
      const comando = indice === 0 ? "M" : "L";
      return `${comando}${x(punto.timestamp).toFixed(1)},${y(punto[chiave]).toFixed(1)}`;
    })
    .join(" ");
}


function disegnaGrafico() {

  if (!historyChartEl) {
    return;
  }

  const adesso = Date.now();
  const inizio = adesso - FINESTRA_GRAFICO_MS;

  const punti = storico.filter(
    (punto) => punto.timestamp >= inizio && punto.timestamp <= adesso
  );

  if (chartRangeEl) {
    chartRangeEl.textContent = `${formattaOra(inizio)} – ${formattaOra(adesso)}`;
  }

  if (punti.length < 2) {
    historyChartEl.innerHTML = "";
    if (chartEmptyEl) {
      chartEmptyEl.hidden = false;
      chartEmptyEl.textContent = "Lo storico si sta popolando. Servono almeno due rilevazioni per disegnare il grafico.";
    }
    return;
  }

  if (chartEmptyEl) {
    chartEmptyEl.hidden = true;
  }

  const width = 760;
  const height = 330;
  const margin = {
    top: 24,
    right: 56,
    bottom: 48,
    left: 56
  };

  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const temperature = punti.map((punto) => punto.temperatura);
  const umidita = punti.map((punto) => punto.umidita);

  let tMin = Math.floor(Math.min(...temperature) - 1);
  let tMax = Math.ceil(Math.max(...temperature) + 1);

  if (tMax - tMin < 4) {
    const centro = (tMax + tMin) / 2;
    tMin = Math.floor(centro - 2);
    tMax = Math.ceil(centro + 2);
  }

  let hMin = Math.max(0, Math.floor(Math.min(...umidita) - 5));
  let hMax = Math.min(100, Math.ceil(Math.max(...umidita) + 5));

  if (hMax - hMin < 20) {
    const centro = (hMax + hMin) / 2;
    hMin = Math.max(0, Math.floor(centro - 10));
    hMax = Math.min(100, Math.ceil(centro + 10));
  }

  const x = (timestamp) =>
    margin.left + ((timestamp - inizio) / FINESTRA_GRAFICO_MS) * plotW;

  const yTemp = (valore) =>
    margin.top + (1 - ((valore - tMin) / (tMax - tMin))) * plotH;

  const yHum = (valore) =>
    margin.top + (1 - ((valore - hMin) / (hMax - hMin))) * plotH;

  const griglia = [];
  const etichetteX = [];
  const etichetteTemp = [];
  const etichetteHum = [];

  for (let i = 0; i <= 4; i++) {
    const yPos = margin.top + (plotH * i / 4);
    griglia.push(
      `<line x1="${margin.left}" y1="${yPos}" x2="${width - margin.right}" y2="${yPos}" class="chart-grid-line" />`
    );

    const tempVal = tMax - ((tMax - tMin) * i / 4);
    const humVal = hMax - ((hMax - hMin) * i / 4);

    etichetteTemp.push(
      `<text x="${margin.left - 10}" y="${yPos + 4}" text-anchor="end" class="chart-axis-label temp-label">${tempVal.toFixed(0)}°</text>`
    );

    etichetteHum.push(
      `<text x="${width - margin.right + 10}" y="${yPos + 4}" text-anchor="start" class="chart-axis-label hum-label">${humVal.toFixed(0)}%</text>`
    );
  }

  for (let i = 0; i <= 6; i++) {
    const ts = inizio + (FINESTRA_GRAFICO_MS * i / 6);
    const xPos = x(ts);

    griglia.push(
      `<line x1="${xPos}" y1="${margin.top}" x2="${xPos}" y2="${height - margin.bottom}" class="chart-grid-line vertical" />`
    );

    etichetteX.push(
      `<text x="${xPos}" y="${height - 18}" text-anchor="middle" class="chart-axis-label">${formattaOra(ts)}</text>`
    );
  }

  const tempPath = creaPercorso(punti, x, yTemp, "temperatura");
  const humPath = creaPercorso(punti, x, yHum, "umidita");

  const ultimo = punti[punti.length - 1];

  historyChartEl.innerHTML = `
    <svg
      class="history-svg"
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="Grafico della temperatura e dell'umidità nelle ultime 12 ore"
    >
      ${griglia.join("")}
      ${etichetteX.join("")}
      ${etichetteTemp.join("")}
      ${etichetteHum.join("")}

      <path d="${tempPath}" class="chart-line chart-line-temp" />
      <path d="${humPath}" class="chart-line chart-line-hum" />

      <circle cx="${x(ultimo.timestamp)}" cy="${yTemp(ultimo.temperatura)}" r="4.5" class="chart-point chart-point-temp" />
      <circle cx="${x(ultimo.timestamp)}" cy="${yHum(ultimo.umidita)}" r="4.5" class="chart-point chart-point-hum" />
    </svg>
  `;
}


/* =========================================================
   CLIMATIZZATORE
   ========================================================= */

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


/* =========================================================
   PROGRAMMI - FUNZIONI BASE
   ========================================================= */

function escapeHtml(testo) {

  return String(testo ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function normalizzaGiorni(giorni) {

  const risultato = [
    false,
    false,
    false,
    false,
    false,
    false,
    false
  ];

  if (!giorni) {
    return risultato;
  }

  for (let i = 0; i < 7; i++) {

    risultato[i] =
      giorni[i] === true ||
      giorni[String(i)] === true;
  }

  return risultato;
}


function creaGiorniFirebase(giorni) {

  const risultato = {};

  for (let i = 0; i < 7; i++) {

    risultato[String(i)] =
      giorni[i] === true;
  }

  return risultato;
}


function orarioValido(orario) {

  if (typeof orario !== "string") {
    return false;
  }

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(orario);
}


/* =========================================================
   VISUALIZZAZIONE PROGRAMMI
   ========================================================= */

function renderProgrammi() {

  if (!programListEl) {
    return;
  }

  const elementi =
    Object.entries(programmi);

  if (elementi.length === 0) {

    programListEl.innerHTML = `
      <p class="program-empty">
        Nessun programma configurato.
        Premi “+ Nuovo programma” per crearne uno.
      </p>
    `;

    return;
  }


  programListEl.innerHTML =
    elementi.map(([id, programma]) => {

      const giorni =
        normalizzaGiorni(programma.giorni);

      const giorniHtml =
        NOMI_GIORNI.map(
          (nome, indice) => `
            <span class="program-day ${
              giorni[indice]
                ? "active"
                : ""
            }">
              ${nome}
            </span>
          `
        ).join("");


      const attivo =
        programma.attivo === true;


      const nome =
        escapeHtml(
          programma.nome || "Programma"
        );


      const oraAccensione =
        orarioValido(programma.oraAccensione)
          ? programma.oraAccensione
          : "--:--";


      const oraSpegnimento =
        orarioValido(programma.oraSpegnimento)
          ? programma.oraSpegnimento
          : "--:--";


      return `
        <article
          class="program-card ${
            attivo
              ? ""
              : "is-disabled"
          }"
        >

          <div class="program-header">

            <h3 class="program-name">
              ${nome}
            </h3>

            <span class="program-status">
              ${attivo ? "Attivo" : "Disattivo"}
            </span>

          </div>


          <div class="program-days">
            ${giorniHtml}
          </div>


          <div class="program-times">

            <div class="program-time on">

              <span class="program-time-label">
                Accensione
              </span>

              <strong class="program-time-value">
                ${oraAccensione}
              </strong>

            </div>


            <div class="program-time off">

              <span class="program-time-label">
                Spegnimento
              </span>

              <strong class="program-time-value">
                ${oraSpegnimento}
              </strong>

            </div>

          </div>


          <div class="program-actions">

            <button
              class="program-action-button edit"
              type="button"
              data-action="edit"
              data-program-id="${escapeHtml(id)}"
            >
              MODIFICA
            </button>


            <button
              class="program-action-button delete"
              type="button"
              data-action="delete"
              data-program-id="${escapeHtml(id)}"
            >
              ELIMINA
            </button>

          </div>

        </article>
      `;

    }).join("");
}


/* =========================================================
   FINESTRA PROGRAMMA
   ========================================================= */

function creaModaleProgramma() {

  if (
    document.getElementById("scheduleModal")
  ) {
    return;
  }


  const contenitore =
    document.createElement("div");


  contenitore.id =
    "scheduleModal";

  contenitore.className =
    "schedule-modal";

  contenitore.hidden = true;


  contenitore.innerHTML = `

    <div
      class="schedule-dialog"
      role="dialog"
      aria-modal="true"
    >

      <div class="schedule-dialog-header">

        <div>

          <p class="section-kicker">
            Programmazione
          </p>

          <h2
            id="scheduleDialogTitle"
            class="schedule-dialog-title"
          >
            Nuovo programma
          </h2>

        </div>


        <button
          id="scheduleCloseButton"
          class="schedule-close"
          type="button"
        >
          ✕
        </button>

      </div>


      <form
        id="scheduleForm"
        class="schedule-form"
      >


        <label class="schedule-field">

          <span class="schedule-field-label">
            Nome programma
          </span>

          <input
            id="scheduleName"
            class="schedule-input"
            type="text"
            maxlength="40"
            placeholder="Es. Notte"
            required
          >

        </label>


        <div class="schedule-time-grid">


          <label class="schedule-field">

            <span class="schedule-field-label">
              Ora accensione
            </span>

            <input
              id="scheduleTimeOn"
              class="schedule-input"
              type="time"
              required
            >

          </label>


          <label class="schedule-field">

            <span class="schedule-field-label">
              Ora spegnimento
            </span>

            <input
              id="scheduleTimeOff"
              class="schedule-input"
              type="time"
              required
            >

          </label>

        </div>


        <div class="schedule-field">

          <span class="schedule-field-label">
            Giorni
          </span>

          <div class="schedule-day-grid">

            ${NOMI_GIORNI.map(
              (nome, indice) => `

                <label class="schedule-day-option">

                  <input
                    type="checkbox"
                    data-day="${indice}"
                  >

                  <span>
                    ${nome}
                  </span>

                </label>

              `
            ).join("")}

          </div>

        </div>


        <div class="schedule-enabled-row">

          <div class="schedule-enabled-text">

            <strong>
              Programma attivo
            </strong>

            <span>
              L'ESP32 eseguirà gli orari selezionati
            </span>

          </div>


          <label class="switch">

            <input
              id="scheduleEnabled"
              type="checkbox"
              checked
            >

            <span class="switch-slider"></span>

          </label>

        </div>


        <div class="schedule-form-actions">

          <button
            id="scheduleCancelButton"
            class="schedule-cancel-button"
            type="button"
          >
            ANNULLA
          </button>


          <button
            id="scheduleSaveButton"
            class="schedule-save-button"
            type="submit"
          >
            SALVA PROGRAMMA
          </button>

        </div>

      </form>

    </div>
  `;


  document.body.appendChild(
    contenitore
  );


  document
    .getElementById("scheduleCloseButton")
    .addEventListener(
      "click",
      chiudiModaleProgramma
    );


  document
    .getElementById("scheduleCancelButton")
    .addEventListener(
      "click",
      chiudiModaleProgramma
    );


  document
    .getElementById("scheduleForm")
    .addEventListener(
      "submit",
      salvaProgramma
    );


  contenitore.addEventListener(
    "click",
    (evento) => {

      if (
        evento.target === contenitore
      ) {

        chiudiModaleProgramma();
      }
    }
  );
}


/* =========================================================
   APERTURA PROGRAMMA
   ========================================================= */

function apriModaleProgramma(id = null) {

  creaModaleProgramma();

  programmaInModifica = id;


  const modalEl =
    document.getElementById("scheduleModal");

  const titleEl =
    document.getElementById("scheduleDialogTitle");

  const nameEl =
    document.getElementById("scheduleName");

  const timeOnEl =
    document.getElementById("scheduleTimeOn");

  const timeOffEl =
    document.getElementById("scheduleTimeOff");

  const enabledEl =
    document.getElementById("scheduleEnabled");

  const checkboxes =
    modalEl.querySelectorAll(
      "[data-day]"
    );


  if (
    id &&
    programmi[id]
  ) {

    const programma =
      programmi[id];


    titleEl.textContent =
      "Modifica programma";


    nameEl.value =
      programma.nome || "";


    timeOnEl.value =
      orarioValido(programma.oraAccensione)
        ? programma.oraAccensione
        : "";


    timeOffEl.value =
      orarioValido(programma.oraSpegnimento)
        ? programma.oraSpegnimento
        : "";


    enabledEl.checked =
      programma.attivo === true;


    const giorni =
      normalizzaGiorni(
        programma.giorni
      );


    checkboxes.forEach(
      (checkbox) => {

        const indice =
          Number(
            checkbox.dataset.day
          );

        checkbox.checked =
          giorni[indice];
      }
    );

  } else {

    titleEl.textContent =
      "Nuovo programma";

    nameEl.value = "";
    timeOnEl.value = "";
    timeOffEl.value = "";

    enabledEl.checked = true;


    checkboxes.forEach(
      (checkbox) => {

        checkbox.checked =
          false;
      }
    );
  }


  modalEl.hidden = false;
}


/* =========================================================
   CHIUSURA PROGRAMMA
   ========================================================= */

function chiudiModaleProgramma() {

  const modalEl =
    document.getElementById(
      "scheduleModal"
    );

  if (modalEl) {

    modalEl.hidden = true;
  }

  programmaInModifica = null;
}


/* =========================================================
   SALVATAGGIO PROGRAMMA
   ========================================================= */

async function salvaProgramma(evento) {

  evento.preventDefault();


  if (
    salvataggioProgrammaInCorso
  ) {
    return;
  }


  const nameEl =
    document.getElementById(
      "scheduleName"
    );

  const timeOnEl =
    document.getElementById(
      "scheduleTimeOn"
    );

  const timeOffEl =
    document.getElementById(
      "scheduleTimeOff"
    );

  const enabledEl =
    document.getElementById(
      "scheduleEnabled"
    );

  const saveButtonEl =
    document.getElementById(
      "scheduleSaveButton"
    );


  const nome =
    nameEl.value.trim();

  const oraAccensione =
    timeOnEl.value;

  const oraSpegnimento =
    timeOffEl.value;


  if (!nome) {

    alert(
      "Inserisci un nome per il programma."
    );

    return;
  }


  if (
    !orarioValido(oraAccensione) ||
    !orarioValido(oraSpegnimento)
  ) {

    alert(
      "Inserisci gli orari di accensione e spegnimento."
    );

    return;
  }


  const checkboxes =
    document.querySelectorAll(
      "#scheduleModal [data-day]"
    );


  const giorni = [
    false,
    false,
    false,
    false,
    false,
    false,
    false
  ];


  checkboxes.forEach(
    (checkbox) => {

      const indice =
        Number(
          checkbox.dataset.day
        );

      giorni[indice] =
        checkbox.checked;
    }
  );


  if (
    !giorni.some(
      (giorno) => giorno
    )
  ) {

    alert(
      "Seleziona almeno un giorno."
    );

    return;
  }


  const datiProgramma = {

    nome,

    attivo:
      enabledEl.checked,

    giorni:
      creaGiorniFirebase(giorni),

    oraAccensione,

    oraSpegnimento
  };


  salvataggioProgrammaInCorso = true;

  saveButtonEl.disabled = true;

  saveButtonEl.textContent =
    "SALVATAGGIO...";


  try {

    if (
      programmaInModifica &&
      programmi[programmaInModifica]
    ) {

      const programmaRef =
        ref(
          database,
          `dispositivi/cameretta/programmi/${programmaInModifica}`
        );


      await set(
        programmaRef,
        datiProgramma
      );

    } else {

      const nuovoProgrammaRef =
        push(programmiRef);


      await set(
        nuovoProgrammaRef,
        datiProgramma
      );
    }


    chiudiModaleProgramma();


  } catch (errore) {

    console.error(
      "Errore salvataggio programma:",
      errore
    );


    alert(
      "Errore durante il salvataggio del programma."
    );


  } finally {

    salvataggioProgrammaInCorso = false;

    saveButtonEl.disabled = false;

    saveButtonEl.textContent =
      "SALVA PROGRAMMA";
  }
}


/* =========================================================
   ELIMINA PROGRAMMA
   ========================================================= */

async function eliminaProgramma(id) {

  const programma =
    programmi[id];


  if (!programma) {
    return;
  }


  const conferma =
    confirm(
      `Vuoi eliminare il programma "${programma.nome || "Programma"}"?`
    );


  if (!conferma) {
    return;
  }


  try {

    const programmaRef =
      ref(
        database,
        `dispositivi/cameretta/programmi/${id}`
      );


    await remove(
      programmaRef
    );


  } catch (errore) {

    console.error(
      "Errore eliminazione programma:",
      errore
    );


    alert(
      "Errore durante l'eliminazione del programma."
    );
  }
}


/* =========================================================
   LETTURA SENSORI FIREBASE
   ========================================================= */

onValue(
  sensoreRef,

  (snapshot) => {

    ultimiDati =
      snapshot.val();


    registraTemperaturaRecente(ultimiDati);
    salvaPuntoStorico(ultimiDati);


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


/* =========================================================
   LETTURA STORICO FIREBASE
   ========================================================= */

onValue(
  storicoRef,

  (snapshot) => {

    const tuttiIPunti =
      normalizzaStorico(snapshot.val());

    storico = tuttiIPunti.filter(
      (punto) => punto.timestamp >= Date.now() - FINESTRA_GRAFICO_MS
    );

    if (storico.length > 0) {
      ultimoTimestampStoricoSalvato = Math.max(
        ultimoTimestampStoricoSalvato,
        storico[storico.length - 1].timestamp
      );
    }

    aggiornaTrend();
    disegnaGrafico();
    pulisciStoricoVecchio(tuttiIPunti);
  },

  (errore) => {
    console.error("Errore lettura storico:", errore);

    if (chartEmptyEl) {
      chartEmptyEl.hidden = false;
      chartEmptyEl.textContent = "Impossibile leggere lo storico da Firebase.";
    }
  }
);


/* =========================================================
   LETTURA CLIMATIZZATORE FIREBASE
   ========================================================= */

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
  }
);


/* =========================================================
   LETTURA PROGRAMMI FIREBASE
   ========================================================= */

onValue(
  programmiRef,

  (snapshot) => {

    programmi =
      snapshot.val() || {};


    renderProgrammi();
  },


  (errore) => {

    console.error(
      "Errore lettura programmi:",
      errore
    );


    if (programListEl) {

      programListEl.innerHTML = `
        <p class="program-empty">
          Impossibile leggere i programmi.
        </p>
      `;
    }
  }
);


/* =========================================================
   PULSANTE ACCENSIONE / SPEGNIMENTO
   ========================================================= */

powerButtonEl.addEventListener(
  "click",

  async () => {

    if (comandoPowerInCorso) {
      return;
    }


    const nuovoStato =
      !climatizzatoreAcceso;


    comandoPowerInCorso =
      true;


    aggiornaPulsante();


    try {

      await update(
        climaRef,
        {
          power: nuovoStato,
          automatico: false
        }
      );


    } catch (errore) {

      console.error(
        "Errore comando manuale:",
        errore
      );


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


/* =========================================================
   MODALITÀ AUTOMATICA
   ========================================================= */

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


    autoModeEl.disabled =
      true;


    try {

      await update(
        climaRef,
        {
          automatico:
            nuovoStato
        }
      );


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

      comandoAutomaticoInCorso =
        false;


      autoModeEl.disabled =
        false;
    }
  }
);


/* =========================================================
   SALVA SOGLIE
   ========================================================= */

saveSettingsEl.addEventListener(
  "click",

  async () => {

    if (
      salvataggioInCorso
    ) {
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


    salvataggioInCorso =
      true;


    saveSettingsEl.disabled =
      true;


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

      salvataggioInCorso =
        false;


      saveSettingsEl.disabled =
        false;


      saveSettingsEl.textContent =
        "SALVA IMPOSTAZIONI";
    }
  }
);


/* =========================================================
   PULSANTE NUOVO PROGRAMMA
   ========================================================= */

if (addProgramButtonEl) {

  addProgramButtonEl.addEventListener(
    "click",

    () => {

      apriModaleProgramma();
    }
  );
}


/* =========================================================
   MODIFICA / ELIMINA PROGRAMMA
   ========================================================= */

if (programListEl) {

  programListEl.addEventListener(
    "click",

    (evento) => {

      const bottone =
        evento.target.closest(
          "[data-action]"
        );


      if (!bottone) {
        return;
      }


      const id =
        bottone.dataset.programId;


      const azione =
        bottone.dataset.action;


      if (
        azione === "edit"
      ) {

        apriModaleProgramma(id);

        return;
      }


      if (
        azione === "delete"
      ) {

        eliminaProgramma(id);
      }
    }
  );
}


window.addEventListener(
  "resize",
  () => {
    disegnaGrafico();
  }
);

setInterval(
  disegnaGrafico,
  60 * 1000
);


/* =========================================================
   AVVIO
   ========================================================= */

creaModaleProgramma();


setInterval(
  aggiornaStato,
  1000
);
