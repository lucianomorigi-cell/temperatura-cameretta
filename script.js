import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  update,
  push,
  set,
  remove,
  query,
  orderByChild,
  startAt
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

const FINESTRA_TREND_MS = 3 * 60 * 1000;
const FINESTRA_GRAFICO_MS = 12 * 60 * 60 * 1000;
const SOGLIA_TREND_C = 0.10;

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


const trendIndicatorEl =
  document.getElementById("trendIndicator");

const trendArrowEl =
  document.getElementById("trendArrow");

const trendLabelEl =
  document.getElementById("trendLabel");

const trendDeltaEl =
  document.getElementById("trendDelta");

const historyCanvasEl =
  document.getElementById("historyChart");

const historyEmptyEl =
  document.getElementById("historyEmpty");

const historyTooltipEl =
  document.getElementById("historyTooltip");


let ultimiDati = null;

let climatizzatoreAcceso = false;
let automaticoAttivo = false;

let comandoPowerInCorso = false;
let comandoAutomaticoInCorso = false;
let salvataggioInCorso = false;

let programmi = {};
let programmaInModifica = null;
let salvataggioProgrammaInCorso = false;

let storicoCampioni = [];
let ultimoTimestampStoricoSalvato = null;


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
   STORICO - TREND - GRAFICO
   ========================================================= */

function normalizzaCampioneStorico(campione) {

  if (!campione) {
    return null;
  }

  const timestamp =
    Number(campione.timestamp);

  const temperatura =
    Number(campione.temperatura);

  const umidita =
    Number(campione.umidita);

  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(temperatura) ||
    !Number.isFinite(umidita)
  ) {
    return null;
  }

  return {
    timestamp,
    temperatura,
    umidita
  };
}


async function salvaCampioneStorico(dati) {

  if (
    !dati ||
    typeof dati.temperatura !== "number" ||
    typeof dati.umidita !== "number" ||
    typeof dati.ultimoAggiornamento !== "number"
  ) {
    return;
  }

  const timestamp =
    dati.ultimoAggiornamento;

  if (
    timestamp ===
    ultimoTimestampStoricoSalvato
  ) {
    return;
  }

  ultimoTimestampStoricoSalvato =
    timestamp;

  try {

    const campioneRef =
      push(storicoRef);

    await set(
      campioneRef,
      {
        timestamp,
        temperatura: dati.temperatura,
        umidita: dati.umidita
      }
    );

  } catch (errore) {

    console.error(
      "Errore salvataggio storico:",
      errore
    );
  }
}


function aggiornaTrend() {

  if (
    !trendIndicatorEl ||
    !trendArrowEl ||
    !trendLabelEl ||
    !trendDeltaEl
  ) {
    return;
  }

  trendIndicatorEl.classList.remove(
    "trend-rising",
    "trend-falling",
    "trend-stable",
    "trend-waiting"
  );

  const limite =
    Date.now() -
    FINESTRA_TREND_MS;

  const campioni =
    storicoCampioni.filter(
      (campione) =>
        campione.timestamp >= limite
    );

  if (campioni.length < 2) {

    trendIndicatorEl.classList.add(
      "trend-waiting"
    );

    trendArrowEl.textContent = "↕";
    trendLabelEl.textContent = "ATTESA";
    trendDeltaEl.textContent = "3 min";

    return;
  }

  const dimensioneGruppo =
    Math.max(
      1,
      Math.floor(campioni.length / 3)
    );

  const primi =
    campioni.slice(
      0,
      dimensioneGruppo
    );

  const ultimi =
    campioni.slice(
      -dimensioneGruppo
    );

  const media = (lista) =>
    lista.reduce(
      (somma, campione) =>
        somma + campione.temperatura,
      0
    ) / lista.length;

  const delta =
    media(ultimi) -
    media(primi);

  trendDeltaEl.textContent =
    `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}°`;

  if (delta > SOGLIA_TREND_C) {

    trendIndicatorEl.classList.add(
      "trend-rising"
    );

    trendArrowEl.textContent = "↑";
    trendLabelEl.textContent = "SALE";

    return;
  }

  if (delta < -SOGLIA_TREND_C) {

    trendIndicatorEl.classList.add(
      "trend-falling"
    );

    trendArrowEl.textContent = "↓";
    trendLabelEl.textContent = "SCENDE";

    return;
  }

  trendIndicatorEl.classList.add(
    "trend-stable"
  );

  trendArrowEl.textContent = "—";
  trendLabelEl.textContent = "STABILE";
}


function preparaCanvas() {

  if (!historyCanvasEl) {
    return null;
  }

  const rettangolo =
    historyCanvasEl.getBoundingClientRect();

  const ratio =
    Math.max(
      1,
      window.devicePixelRatio || 1
    );

  const larghezza =
    Math.max(
      1,
      Math.round(rettangolo.width * ratio)
    );

  const altezza =
    Math.max(
      1,
      Math.round(rettangolo.height * ratio)
    );

  if (
    historyCanvasEl.width !== larghezza ||
    historyCanvasEl.height !== altezza
  ) {

    historyCanvasEl.width =
      larghezza;

    historyCanvasEl.height =
      altezza;
  }

  const ctx =
    historyCanvasEl.getContext("2d");

  ctx.setTransform(
    ratio,
    0,
    0,
    ratio,
    0,
    0
  );

  return {
    ctx,
    width: rettangolo.width,
    height: rettangolo.height
  };
}


function disegnaGrafico() {

  const canvas =
    preparaCanvas();

  if (!canvas) {
    return;
  }

  const {
    ctx,
    width,
    height
  } = canvas;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const fine =
    Date.now();

  const inizio =
    fine -
    FINESTRA_GRAFICO_MS;

  const dati =
    storicoCampioni.filter(
      (campione) =>
        campione.timestamp >= inizio &&
        campione.timestamp <= fine
    );

  if (historyEmptyEl) {
    historyEmptyEl.hidden =
      dati.length > 0;
  }

  if (dati.length === 0) {

    historyCanvasEl._grafico =
      null;

    return;
  }

  const margine = {
    top: 12,
    right: 42,
    bottom: 29,
    left: 43
  };

  const plotLeft =
    margine.left;

  const plotRight =
    width - margine.right;

  const plotTop =
    margine.top;

  const plotBottom =
    height - margine.bottom;

  const plotWidth =
    Math.max(
      1,
      plotRight - plotLeft
    );

  const plotHeight =
    Math.max(
      1,
      plotBottom - plotTop
    );

  const temperature =
    dati.map(
      (campione) =>
        campione.temperatura
    );

  const umidita =
    dati.map(
      (campione) =>
        campione.umidita
    );

  let tempMin =
    Math.min(...temperature);

  let tempMax =
    Math.max(...temperature);

  if (
    tempMax - tempMin < 1
  ) {

    tempMin -= 0.5;
    tempMax += 0.5;

  } else {

    const padding =
      (tempMax - tempMin) * 0.15;

    tempMin -= padding;
    tempMax += padding;
  }

  let humMin =
    Math.min(...umidita);

  let humMax =
    Math.max(...umidita);

  if (
    humMax - humMin < 4
  ) {

    humMin -= 2;
    humMax += 2;

  } else {

    const padding =
      (humMax - humMin) * 0.15;

    humMin -= padding;
    humMax += padding;
  }

  humMin =
    Math.max(
      0,
      humMin
    );

  humMax =
    Math.min(
      100,
      humMax
    );

  const x = (timestamp) =>
    plotLeft +
    (
      (timestamp - inizio) /
      FINESTRA_GRAFICO_MS
    ) *
    plotWidth;

  const yTemp = (valore) =>
    plotBottom -
    (
      (valore - tempMin) /
      (tempMax - tempMin)
    ) *
    plotHeight;

  const yHum = (valore) =>
    plotBottom -
    (
      (valore - humMin) /
      (humMax - humMin)
    ) *
    plotHeight;

  ctx.font =
    "11px Arial, sans-serif";

  ctx.fillStyle =
    "#77829d";

  ctx.strokeStyle =
    "rgba(255,255,255,0.08)";

  ctx.lineWidth = 1;

  for (
    let i = 0;
    i <= 4;
    i++
  ) {

    const rapporto =
      i / 4;

    const y =
      plotTop +
      rapporto *
      plotHeight;

    ctx.beginPath();

    ctx.moveTo(
      plotLeft,
      y
    );

    ctx.lineTo(
      plotRight,
      y
    );

    ctx.stroke();

    const temp =
      tempMax -
      rapporto *
      (tempMax - tempMin);

    const hum =
      humMax -
      rapporto *
      (humMax - humMin);

    ctx.textBaseline =
      "middle";

    ctx.textAlign =
      "right";

    ctx.fillText(
      `${temp.toFixed(1)}°`,
      plotLeft - 6,
      y
    );

    ctx.textAlign =
      "left";

    ctx.fillText(
      `${Math.round(hum)}%`,
      plotRight + 6,
      y
    );
  }

  for (
    let ore = 0;
    ore <= 12;
    ore += 3
  ) {

    const timestamp =
      inizio +
      ore *
      60 *
      60 *
      1000;

    const posizioneX =
      x(timestamp);

    ctx.beginPath();

    ctx.moveTo(
      posizioneX,
      plotTop
    );

    ctx.lineTo(
      posizioneX,
      plotBottom
    );

    ctx.stroke();

    ctx.textAlign =
      ore === 0
        ? "left"
        : ore === 12
          ? "right"
          : "center";

    ctx.textBaseline =
      "top";

    ctx.fillText(
      new Date(timestamp)
        .toLocaleTimeString(
          "it-IT",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        ),
      posizioneX,
      plotBottom + 7
    );
  }

  function tracciaLinea(
    colore,
    selettoreY
  ) {

    ctx.beginPath();

    dati.forEach(
      (campione, indice) => {

        const px =
          x(campione.timestamp);

        const py =
          selettoreY(campione);

        if (indice === 0) {

          ctx.moveTo(
            px,
            py
          );

        } else {

          ctx.lineTo(
            px,
            py
          );
        }
      }
    );

    ctx.strokeStyle =
      colore;

    ctx.lineWidth =
      2.2;

    ctx.lineJoin =
      "round";

    ctx.lineCap =
      "round";

    ctx.stroke();
  }

  tracciaLinea(
    "#ff8c73",
    (campione) =>
      yTemp(campione.temperatura)
  );

  tracciaLinea(
    "#59adff",
    (campione) =>
      yHum(campione.umidita)
  );

  historyCanvasEl._grafico = {
    dati,
    inizio,
    plotLeft,
    plotRight,
    x,
    yTemp,
    yHum
  };
}


function mostraTooltipGrafico(evento) {

  if (
    !historyCanvasEl ||
    !historyTooltipEl
  ) {
    return;
  }

  const grafico =
    historyCanvasEl._grafico;

  if (
    !grafico ||
    grafico.dati.length === 0
  ) {

    historyTooltipEl.hidden =
      true;

    return;
  }

  const rettangolo =
    historyCanvasEl.getBoundingClientRect();

  const clientX =
    evento.touches &&
    evento.touches.length
      ? evento.touches[0].clientX
      : evento.clientX;

  const posizioneLocale =
    clientX -
    rettangolo.left;

  const rapporto =
    Math.max(
      0,
      Math.min(
        1,
        (
          posizioneLocale -
          grafico.plotLeft
        ) /
        (
          grafico.plotRight -
          grafico.plotLeft
        )
      )
    );

  const timestampCercato =
    grafico.inizio +
    rapporto *
    FINESTRA_GRAFICO_MS;

  let migliore =
    grafico.dati[0];

  let distanza =
    Math.abs(
      migliore.timestamp -
      timestampCercato
    );

  for (
    let i = 1;
    i < grafico.dati.length;
    i++
  ) {

    const nuovaDistanza =
      Math.abs(
        grafico.dati[i].timestamp -
        timestampCercato
      );

    if (
      nuovaDistanza < distanza
    ) {

      migliore =
        grafico.dati[i];

      distanza =
        nuovaDistanza;
    }
  }

  const px =
    grafico.x(
      migliore.timestamp
    );

  const py =
    Math.min(
      grafico.yTemp(
        migliore.temperatura
      ),
      grafico.yHum(
        migliore.umidita
      )
    );

  historyTooltipEl.innerHTML =
    `
      <strong>
        ${new Date(migliore.timestamp)
          .toLocaleTimeString(
            "it-IT",
            {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            }
          )}
      </strong>
      🌡️ ${migliore.temperatura.toFixed(1)} °C<br>
      💧 ${migliore.umidita.toFixed(0)} %
    `;

  historyTooltipEl.style.left =
    `${Math.max(
      72,
      Math.min(
        rettangolo.width - 72,
        px
      )
    )}px`;

  historyTooltipEl.style.top =
    `${Math.max(
      58,
      py
    )}px`;

  historyTooltipEl.hidden =
    false;
}


function nascondiTooltipGrafico() {

  if (historyTooltipEl) {

    historyTooltipEl.hidden =
      true;
  }
}


function caricaStorico() {

  const dodiciOreFa =
    Date.now() -
    FINESTRA_GRAFICO_MS;

  const richiesta =
    query(
      storicoRef,
      orderByChild("timestamp"),
      startAt(dodiciOreFa)
    );

  onValue(
    richiesta,

    (snapshot) => {

      const dati =
        snapshot.val() || {};

      storicoCampioni =
        Object.values(dati)
          .map(
            normalizzaCampioneStorico
          )
          .filter(Boolean)
          .filter(
            (campione) =>
              campione.timestamp >=
              Date.now() -
              FINESTRA_GRAFICO_MS
          )
          .sort(
            (a, b) =>
              a.timestamp -
              b.timestamp
          );

      aggiornaTrend();
      disegnaGrafico();
    },

    (errore) => {

      console.error(
        "Errore lettura storico:",
        errore
      );
    }
  );
}


function configuraGrafico() {

  if (!historyCanvasEl) {
    return;
  }

  historyCanvasEl.addEventListener(
    "mousemove",
    mostraTooltipGrafico
  );

  historyCanvasEl.addEventListener(
    "mouseleave",
    nascondiTooltipGrafico
  );

  historyCanvasEl.addEventListener(
    "touchstart",
    mostraTooltipGrafico,
    {
      passive: true
    }
  );

  historyCanvasEl.addEventListener(
    "touchmove",
    mostraTooltipGrafico,
    {
      passive: true
    }
  );

  historyCanvasEl.addEventListener(
    "touchend",
    () => {

      setTimeout(
        nascondiTooltipGrafico,
        800
      );
    },
    {
      passive: true
    }
  );

  window.addEventListener(
    "resize",
    disegnaGrafico
  );
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


    if (!ultimiDati) {

      erroreEl.hidden = false;

      erroreEl.textContent =
        "Nessun dato disponibile nel database.";

      aggiornaStato();

      return;
    }


    erroreEl.hidden = true;

    aggiornaStato();

    salvaCampioneStorico(
      ultimiDati
    );
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


/* =========================================================
   AVVIO
   ========================================================= */

creaModaleProgramma();

configuraGrafico();
caricaStorico();


setInterval(
  aggiornaStato,
  1000
);


setInterval(
  () => {

    aggiornaTrend();
    disegnaGrafico();
  },
  5000
);
