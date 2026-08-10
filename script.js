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


/* =========================================================
   FIREBASE
   ========================================================= */

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
  "dispositivi/cameretta/storico"
);


/* =========================================================
   COSTANTI
   ========================================================= */

const TEMPO_OFFLINE_MS = 5000;

const FINESTRA_TREND_MS =
  3 * 60 * 1000;

const FINESTRA_GRAFICO_MS =
  12 * 60 * 60 * 1000;

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


/* =========================================================
   ELEMENTI HTML
   ========================================================= */

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
  document.getElementById(
    "ultimoAggiornamento"
  );

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
  document.getElementById(
    "saveSettings"
  );


const programListEl =
  document.getElementById(
    "programList"
  );

const addProgramButtonEl =
  document.getElementById(
    "addProgramButton"
  );


/* TREND */

const trendCardEl =
  document.getElementById(
    "trendCard"
  );

const trendArrowEl =
  document.getElementById(
    "trendArrow"
  );

const trendTextEl =
  document.getElementById(
    "trendText"
  );

const trendDeltaEl =
  document.getElementById(
    "trendDelta"
  );


/* GRAFICO */

const historyCanvasEl =
  document.getElementById(
    "historyChart"
  );

const chartEmptyEl =
  document.getElementById(
    "chartEmpty"
  );

const chartTooltipEl =
  document.getElementById(
    "chartTooltip"
  );


/* =========================================================
   VARIABILI
   ========================================================= */

let ultimiDati = null;

let climatizzatoreAcceso = false;
let automaticoAttivo = false;

let comandoPowerInCorso = false;
let comandoAutomaticoInCorso = false;
let salvataggioInCorso = false;

let programmi = {};

let programmaInModifica = null;

let salvataggioProgrammaInCorso =
  false;

let storicoCampioni = [];

let ultimoTimestampSensoreSalvato =
  null;


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

  statusDotEl.classList.add(
    "online"
  );

  statusDotEl.classList.remove(
    "offline"
  );
}


function mostraOffline() {

  statoEl.textContent =
    "ESP32 offline";

  statusDotEl.classList.remove(
    "online"
  );

  statusDotEl.classList.add(
    "offline"
  );

  nascondiValori();
}


function aggiornaStato() {

  if (
    !ultimiDati ||
    typeof ultimiDati
      .ultimoAggiornamento !== "number"
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
    new Date(timestamp)
      .toLocaleString("it-IT");


  if (
    tempoTrascorso <=
    TEMPO_OFFLINE_MS
  ) {

    mostraValori(
      ultimiDati
    );

    mostraOnline();

  } else {

    mostraOffline();
  }
}


/* =========================================================
   SALVATAGGIO STORICO
   ========================================================= */

async function salvaCampioneStorico(
  dati
) {

  if (
    !dati ||
    typeof dati.temperatura !==
      "number" ||
    typeof dati.umidita !==
      "number" ||
    typeof dati
      .ultimoAggiornamento !==
      "number"
  ) {

    return;
  }


  const timestamp =
    dati.ultimoAggiornamento;


  /*
    Evita di scrivere più volte
    lo stesso campione.
  */

  if (
    timestamp ===
    ultimoTimestampSensoreSalvato
  ) {

    return;
  }


  ultimoTimestampSensoreSalvato =
    timestamp;


  try {

    const nuovoCampioneRef =
      push(storicoRef);


    await set(
      nuovoCampioneRef,
      {
        timestamp:
          timestamp,

        temperatura:
          dati.temperatura,

        umidita:
          dati.umidita
      }
    );

  } catch (errore) {

    console.error(
      "Errore salvataggio storico:",
      errore
    );
  }
}


/* =========================================================
   NORMALIZZAZIONE STORICO
   ========================================================= */

function normalizzaCampione(
  campione
) {

  if (!campione) {

    return null;
  }


  const timestamp =
    Number(
      campione.timestamp ??
      campione.ultimoAggiornamento
    );


  const temperatura =
    Number(
      campione.temperatura
    );


  const umidita =
    Number(
      campione.umidita
    );


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


/* =========================================================
   TREND TEMPERATURA
   ULTIMI 3 MINUTI
   ========================================================= */

function aggiornaTrend() {

  if (
    !trendCardEl ||
    !trendArrowEl ||
    !trendTextEl ||
    !trendDeltaEl
  ) {

    return;
  }


  trendCardEl.classList.remove(
    "trend-rising",
    "trend-falling",
    "trend-stable",
    "trend-neutral"
  );


  const limiteTempo =
    Date.now() -
    FINESTRA_TREND_MS;


  const campioniTrend =
    storicoCampioni.filter(
      campione =>
        campione.timestamp >=
        limiteTempo
    );


  if (
    campioniTrend.length < 2
  ) {

    trendCardEl.classList.add(
      "trend-neutral"
    );

    trendArrowEl.textContent =
      "↕";

    trendTextEl.textContent =
      "ATTESA";

    trendDeltaEl.textContent =
      "3 min";

    return;
  }


  /*
    Usiamo una media dei campioni
    iniziali e una media dei campioni
    finali.

    È più stabile rispetto a confrontare
    semplicemente due letture.
  */


  const numeroCampioni =
    campioniTrend.length;


  const gruppo =
    Math.max(
      1,
      Math.floor(
        numeroCampioni / 3
      )
    );


  const campioniInizio =
    campioniTrend.slice(
      0,
      gruppo
    );


  const campioniFine =
    campioniTrend.slice(
      -gruppo
    );


  function mediaTemperatura(
    lista
  ) {

    const totale =
      lista.reduce(
        (
          somma,
          campione
        ) =>
          somma +
          campione.temperatura,
        0
      );


    return (
      totale /
      lista.length
    );
  }


  const temperaturaInizio =
    mediaTemperatura(
      campioniInizio
    );


  const temperaturaFine =
    mediaTemperatura(
      campioniFine
    );


  const differenza =
    temperaturaFine -
    temperaturaInizio;


  trendDeltaEl.textContent =
    (
      differenza >= 0
        ? "+"
        : ""
    ) +
    differenza.toFixed(1) +
    "°";


  /* TEMPERATURA SALE */

  if (
    differenza >
    SOGLIA_TREND_C
  ) {

    trendCardEl.classList.add(
      "trend-rising"
    );

    trendArrowEl.textContent =
      "↑";

    trendTextEl.textContent =
      "SALE";

    return;
  }


  /* TEMPERATURA SCENDE */

  if (
    differenza <
    -SOGLIA_TREND_C
  ) {

    trendCardEl.classList.add(
      "trend-falling"
    );

    trendArrowEl.textContent =
      "↓";

    trendTextEl.textContent =
      "SCENDE";

    return;
  }


  /* STABILE */

  trendCardEl.classList.add(
    "trend-stable"
  );

  trendArrowEl.textContent =
    "—";

  trendTextEl.textContent =
    "STABILE";
}


/* =========================================================
   GRAFICO
   ========================================================= */

function preparaCanvas() {

  if (!historyCanvasEl) {

    return null;
  }


  const rettangolo =
    historyCanvasEl
      .getBoundingClientRect();


  const pixelRatio =
    Math.max(
      1,
      window.devicePixelRatio ||
      1
    );


  const larghezza =
    Math.max(
      1,
      Math.round(
        rettangolo.width *
        pixelRatio
      )
    );


  const altezza =
    Math.max(
      1,
      Math.round(
        rettangolo.height *
        pixelRatio
      )
    );


  if (
    historyCanvasEl.width !==
      larghezza ||
    historyCanvasEl.height !==
      altezza
  ) {

    historyCanvasEl.width =
      larghezza;

    historyCanvasEl.height =
      altezza;
  }


  const ctx =
    historyCanvasEl.getContext(
      "2d"
    );


  ctx.setTransform(
    pixelRatio,
    0,
    0,
    pixelRatio,
    0,
    0
  );


  return {

    ctx,

    width:
      rettangolo.width,

    height:
      rettangolo.height
  };
}


/* =========================================================
   DISEGNA GRAFICO 12 ORE
   ========================================================= */

function disegnaGrafico() {

  if (!historyCanvasEl) {

    return;
  }


  const canvas =
    preparaCanvas();


  if (!canvas) {

    return;
  }


  const ctx =
    canvas.ctx;

  const width =
    canvas.width;

  const height =
    canvas.height;


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
      campione =>
        campione.timestamp >=
          inizio &&
        campione.timestamp <=
          fine
    );


  if (chartEmptyEl) {

    chartEmptyEl.hidden =
      dati.length > 0;
  }


  if (
    dati.length === 0
  ) {

    return;
  }


  /* MARGINI */

  const left = 43;
  const right = 42;
  const top = 12;
  const bottom = 30;


  const plotLeft =
    left;

  const plotRight =
    width - right;

  const plotTop =
    top;

  const plotBottom =
    height - bottom;


  const plotWidth =
    plotRight -
    plotLeft;


  const plotHeight =
    plotBottom -
    plotTop;


  /* DATI TEMPERATURA */

  const temperature =
    dati.map(
      campione =>
        campione.temperatura
    );


  let temperaturaMin =
    Math.min(
      ...temperature
    );


  let temperaturaMax =
    Math.max(
      ...temperature
    );


  if (
    temperaturaMax -
    temperaturaMin <
    1
  ) {

    temperaturaMin -= 0.5;

    temperaturaMax += 0.5;

  } else {

    const margine =
      (
        temperaturaMax -
        temperaturaMin
      ) * 0.15;


    temperaturaMin -=
      margine;

    temperaturaMax +=
      margine;
  }


  /* DATI UMIDITÀ */

  const umidita =
    dati.map(
      campione =>
        campione.umidita
    );


  let umiditaMin =
    Math.min(
      ...umidita
    );


  let umiditaMax =
    Math.max(
      ...umidita
    );


  if (
    umiditaMax -
    umiditaMin <
    4
  ) {

    umiditaMin -= 2;

    umiditaMax += 2;

  } else {

    const margine =
      (
        umiditaMax -
        umiditaMin
      ) * 0.15;


    umiditaMin -=
      margine;

    umiditaMax +=
      margine;
  }


  umiditaMin =
    Math.max(
      0,
      umiditaMin
    );


  umiditaMax =
    Math.min(
      100,
      umiditaMax
    );


  function x(timestamp) {

    return (
      plotLeft +
      (
        (
          timestamp -
          inizio
        ) /
        FINESTRA_GRAFICO_MS
      ) *
      plotWidth
    );
  }


  function yTemperatura(
    valore
  ) {

    return (
      plotBottom -
      (
        (
          valore -
          temperaturaMin
        ) /
        (
          temperaturaMax -
          temperaturaMin
        )
      ) *
      plotHeight
    );
  }


  function yUmidita(
    valore
  ) {

    return (
      plotBottom -
      (
        (
          valore -
          umiditaMin
        ) /
        (
          umiditaMax -
          umiditaMin
        )
      ) *
      plotHeight
    );
  }


  /* STILE TESTO */

  ctx.font =
    "11px Arial";

  ctx.fillStyle =
    "#77829d";

  ctx.strokeStyle =
    "rgba(255,255,255,0.08)";

  ctx.lineWidth = 1;


  /* GRIGLIA ORIZZONTALE */

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
      temperaturaMax -
      rapporto *
      (
        temperaturaMax -
        temperaturaMin
      );


    const hum =
      umiditaMax -
      rapporto *
      (
        umiditaMax -
        umiditaMin
      );


    ctx.textBaseline =
      "middle";


    ctx.textAlign =
      "right";


    ctx.fillText(
      temp.toFixed(1) +
      "°",
      plotLeft - 6,
      y
    );


    ctx.textAlign =
      "left";


    ctx.fillText(
      Math.round(hum) +
      "%",
      plotRight + 6,
      y
    );
  }


  /* ASSE TEMPO */

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


    if (ore === 0) {

      ctx.textAlign =
        "left";

    } else if (
      ore === 12
    ) {

      ctx.textAlign =
        "right";

    } else {

      ctx.textAlign =
        "center";
    }


    ctx.textBaseline =
      "top";


    ctx.fillText(
      new Date(timestamp)
        .toLocaleTimeString(
          "it-IT",
          {
            hour:
              "2-digit",

            minute:
              "2-digit"
          }
        ),

      posizioneX,

      plotBottom + 8
    );
  }


  /* LINEA TEMPERATURA */

  ctx.beginPath();


  dati.forEach(
    (
      campione,
      indice
    ) => {

      const px =
        x(
          campione.timestamp
        );


      const py =
        yTemperatura(
          campione.temperatura
        );


      if (
        indice === 0
      ) {

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
    "#ff8c73";

  ctx.lineWidth =
    2.3;

  ctx.lineJoin =
    "round";

  ctx.lineCap =
    "round";

  ctx.stroke();


  /* LINEA UMIDITÀ */

  ctx.beginPath();


  dati.forEach(
    (
      campione,
      indice
    ) => {

      const px =
        x(
          campione.timestamp
        );


      const py =
        yUmidita(
          campione.umidita
        );


      if (
        indice === 0
      ) {

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
    "#59adff";

  ctx.lineWidth =
    2.3;

  ctx.stroke();


  /*
    Salviamo le coordinate
    per il tooltip.
  */

  historyCanvasEl
    ._grafico = {

      dati,

      inizio,

      x,

      yTemperatura,

      yUmidita,

      plotLeft,

      plotRight
    };
}


/* =========================================================
   TOOLTIP GRAFICO
   ========================================================= */

function mostraTooltip(
  evento
) {

  if (
    !historyCanvasEl ||
    !chartTooltipEl
  ) {

    return;
  }


  const grafico =
    historyCanvasEl
      ._grafico;


  if (
    !grafico ||
    grafico.dati.length === 0
  ) {

    return;
  }


  const rettangolo =
    historyCanvasEl
      .getBoundingClientRect();


  let clientX;


  if (
    evento.touches &&
    evento.touches.length
  ) {

    clientX =
      evento.touches[0]
        .clientX;

  } else {

    clientX =
      evento.clientX;
  }


  const posizioneLocale =
    clientX -
    rettangolo.left;


  const rapporto =
    (
      posizioneLocale -
      grafico.plotLeft
    ) /
    (
      grafico.plotRight -
      grafico.plotLeft
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
    i <
    grafico.dati.length;
    i++
  ) {

    const nuovaDistanza =
      Math.abs(
        grafico
          .dati[i]
          .timestamp -
        timestampCercato
      );


    if (
      nuovaDistanza <
      distanza
    ) {

      distanza =
        nuovaDistanza;

      migliore =
        grafico.dati[i];
    }
  }


  const px =
    grafico.x(
      migliore.timestamp
    );


  const py =
    Math.min(
      grafico.yTemperatura(
        migliore.temperatura
      ),

      grafico.yUmidita(
        migliore.umidita
      )
    );


  chartTooltipEl.innerHTML =
    `

    <strong>

      ${
        new Date(
          migliore.timestamp
        )
        .toLocaleTimeString(
          "it-IT",
          {
            hour:
              "2-digit",

            minute:
              "2-digit",

            second:
              "2-digit"
          }
        )
      }

    </strong>

    🌡️ ${migliore.temperatura.toFixed(1)} °C

    <br>

    💧 ${migliore.umidita.toFixed(0)} %

  `;


  chartTooltipEl.style.left =
    Math.max(
      70,
      Math.min(
        rettangolo.width -
        70,
        px
      )
    ) +
    "px";


  chartTooltipEl.style.top =
    Math.max(
      55,
      py
    ) +
    "px";


  chartTooltipEl.hidden =
    false;
}


function nascondiTooltip() {

  if (
    chartTooltipEl
  ) {

    chartTooltipEl.hidden =
      true;
  }
}


/* =========================================================
   CARICA STORICO FIREBASE
   ========================================================= */

function caricaStorico() {

  const dodiciOreFa =
    Date.now() -
    FINESTRA_GRAFICO_MS;


  const richiesta =
    query(

      storicoRef,

      orderByChild(
        "timestamp"
      ),

      startAt(
        dodiciOreFa
      )
    );


  onValue(

    richiesta,

    snapshot => {

      const dati =
        snapshot.val() ||
        {};


      storicoCampioni =
        Object
          .values(dati)

          .map(
            normalizzaCampione
          )

          .filter(
            Boolean
          )

          .filter(
            campione =>
              campione.timestamp >=
              Date.now() -
              FINESTRA_GRAFICO_MS
          )

          .sort(
            (
              a,
              b
            ) =>
              a.timestamp -
              b.timestamp
          );


      aggiornaTrend();

      disegnaGrafico();
    },


    errore => {

      console.error(
        "Errore lettura storico:",
        errore
      );
    }
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


  if (
    comandoPowerInCorso
  ) {

    powerButtonEl.textContent =
      "ATTENDERE...";
  }
}


/* =========================================================
   FUNZIONI PROGRAMMI
   ========================================================= */

function escapeHtml(
  testo
) {

  return String(
    testo ?? ""
  )

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );
}


function normalizzaGiorni(
  giorni
) {

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


  for (
    let i = 0;
    i < 7;
    i++
  ) {

    risultato[i] =
      giorni[i] === true ||
      giorni[String(i)] ===
        true;
  }


  return risultato;
}


function creaGiorniFirebase(
  giorni
) {

  const risultato = {};


  for (
    let i = 0;
    i < 7;
    i++
  ) {

    risultato[String(i)] =
      giorni[i] === true;
  }


  return risultato;
}


function orarioValido(
  orario
) {

  if (
    typeof orario !==
    "string"
  ) {

    return false;
  }


  return /^([01]\d|2[0-3]):[0-5]\d$/
    .test(orario);
}


/* =========================================================
   VISUALIZZA PROGRAMMI
   ========================================================= */

function renderProgrammi() {

  if (!programListEl) {

    return;
  }


  const elementi =
    Object.entries(
      programmi
    );


  if (
    elementi.length === 0
  ) {

    programListEl.innerHTML =
      `

      <p class="program-empty">

        Nessun programma configurato.
        Premi “+ Nuovo programma”
        per crearne uno.

      </p>

      `;

    return;
  }


  programListEl.innerHTML =
    elementi
      .map(
        (
          [
            id,
            programma
          ]
        ) => {


          const giorni =
            normalizzaGiorni(
              programma.giorni
            );


          const giorniHtml =
            NOMI_GIORNI
              .map(
                (
                  nome,
                  indice
                ) =>
                  `

                  <span
                    class="program-day ${
                      giorni[indice]
                        ? "active"
                        : ""
                    }"
                  >
                    ${nome}
                  </span>

                  `
              )

              .join("");


          const attivo =
            programma.attivo ===
            true;


          const nome =
            escapeHtml(
              programma.nome ||
              "Programma"
            );


          const oraAccensione =
            orarioValido(
              programma
                .oraAccensione
            )
              ? programma
                  .oraAccensione
              : "--:--";


          const oraSpegnimento =
            orarioValido(
              programma
                .oraSpegnimento
            )
              ? programma
                  .oraSpegnimento
              : "--:--";


          return `

          <article
            class="program-card ${
              attivo
                ? ""
                : "is-disabled"
            }"
          >

            <div
              class="program-header"
            >

              <h3
                class="program-name"
              >
                ${nome}
              </h3>

              <span
                class="program-status"
              >
                ${
                  attivo
                    ? "Attivo"
                    : "Disattivo"
                }
              </span>

            </div>


            <div
              class="program-days"
            >

              ${giorniHtml}

            </div>


            <div
              class="program-times"
            >

              <div
                class="program-time on"
              >

                <span
                  class="program-time-label"
                >
                  Accensione
                </span>

                <strong
                  class="program-time-value"
                >
                  ${oraAccensione}
                </strong>

              </div>


              <div
                class="program-time off"
              >

                <span
                  class="program-time-label"
                >
                  Spegnimento
                </span>

                <strong
                  class="program-time-value"
                >
                  ${oraSpegnimento}
                </strong>

              </div>

            </div>


            <div
              class="program-actions"
            >

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
        }
      )

      .join("");
}


/* =========================================================
   CREA MODALE PROGRAMMA
   ========================================================= */

function creaModaleProgramma() {

  if (
    document.getElementById(
      "scheduleModal"
    )
  ) {

    return;
  }


  const contenitore =
    document.createElement(
      "div"
    );


  contenitore.id =
    "scheduleModal";


  contenitore.className =
    "schedule-modal";


  contenitore.hidden =
    true;


  contenitore.innerHTML =
    `

    <div
      class="schedule-dialog"
      role="dialog"
      aria-modal="true"
    >

      <div
        class="schedule-dialog-header"
      >

        <div>

          <p
            class="section-kicker"
          >
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

        <label
          class="schedule-field"
        >

          <span
            class="schedule-field-label"
          >
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


        <div
          class="schedule-time-grid"
        >

          <label
            class="schedule-field"
          >

            <span
              class="schedule-field-label"
            >
              Ora accensione
            </span>

            <input
              id="scheduleTimeOn"
              class="schedule-input"
              type="time"
              required
            >

          </label>


          <label
            class="schedule-field"
          >

            <span
              class="schedule-field-label"
            >
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


        <div
          class="schedule-field"
        >

          <span
            class="schedule-field-label"
          >
            Giorni
          </span>


          <div
            class="schedule-day-grid"
          >

            ${
              NOMI_GIORNI
                .map(
                  (
                    nome,
                    indice
                  ) =>
                    `

                    <label
                      class="schedule-day-option"
                    >

                      <input
                        type="checkbox"
                        data-day="${indice}"
                      >

                      <span>
                        ${nome}
                      </span>

                    </label>

                    `
                )

                .join("")
            }

          </div>

        </div>


        <div
          class="schedule-enabled-row"
        >

          <div
            class="schedule-enabled-text"
          >

            <strong>
              Programma attivo
            </strong>

            <span>
              L'ESP32 eseguirà
              gli orari selezionati
            </span>

          </div>


          <label class="switch">

            <input
              id="scheduleEnabled"
              type="checkbox"
              checked
            >

            <span
              class="switch-slider"
            ></span>

          </label>

        </div>


        <div
          class="schedule-form-actions"
        >

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
    .getElementById(
      "scheduleCloseButton"
    )

    .addEventListener(
      "click",
      chiudiModaleProgramma
    );


  document
    .getElementById(
      "scheduleCancelButton"
    )

    .addEventListener(
      "click",
      chiudiModaleProgramma
    );


  document
    .getElementById(
      "scheduleForm"
    )

    .addEventListener(
      "submit",
      salvaProgramma
    );


  contenitore.addEventListener(
    "click",
    evento => {

      if (
        evento.target ===
        contenitore
      ) {

        chiudiModaleProgramma();
      }
    }
  );
}


/* =========================================================
   APRE PROGRAMMA
   ========================================================= */

function apriModaleProgramma(
  id = null
) {

  creaModaleProgramma();


  programmaInModifica =
    id;


  const modalEl =
    document.getElementById(
      "scheduleModal"
    );


  const titleEl =
    document.getElementById(
      "scheduleDialogTitle"
    );


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
      programma.nome ||
      "";


    timeOnEl.value =
      orarioValido(
        programma.oraAccensione
      )
        ? programma
            .oraAccensione
        : "";


    timeOffEl.value =
      orarioValido(
        programma.oraSpegnimento
      )
        ? programma
            .oraSpegnimento
        : "";


    enabledEl.checked =
      programma.attivo ===
      true;


    const giorni =
      normalizzaGiorni(
        programma.giorni
      );


    checkboxes.forEach(
      checkbox => {

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


    nameEl.value =
      "";


    timeOnEl.value =
      "";


    timeOffEl.value =
      "";


    enabledEl.checked =
      true;


    checkboxes.forEach(
      checkbox => {

        checkbox.checked =
          false;
      }
    );
  }


  modalEl.hidden =
    false;
}


/* =========================================================
   CHIUDE PROGRAMMA
   ========================================================= */

function chiudiModaleProgramma() {

  const modalEl =
    document.getElementById(
      "scheduleModal"
    );


  if (modalEl) {

    modalEl.hidden =
      true;
  }


  programmaInModifica =
    null;
}


/* =========================================================
   SALVA PROGRAMMA
   ========================================================= */

async function salvaProgramma(
  evento
) {

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
    !orarioValido(
      oraAccensione
    ) ||
    !orarioValido(
      oraSpegnimento
    )
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
    checkbox => {

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
      giorno => giorno
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
      creaGiorniFirebase(
        giorni
      ),

    oraAccensione,

    oraSpegnimento
  };


  salvataggioProgrammaInCorso =
    true;


  saveButtonEl.disabled =
    true;


  saveButtonEl.textContent =
    "SALVATAGGIO...";


  try {

    if (
      programmaInModifica &&
      programmi[
        programmaInModifica
      ]
    ) {

      const riferimento =
        ref(
          database,
          `dispositivi/cameretta/programmi/${programmaInModifica}`
        );


      await set(
        riferimento,
        datiProgramma
      );

    } else {

      const riferimento =
        push(
          programmiRef
        );


      await set(
        riferimento,
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

    salvataggioProgrammaInCorso =
      false;


    saveButtonEl.disabled =
      false;


    saveButtonEl.textContent =
      "SALVA PROGRAMMA";
  }
}


/* =========================================================
   ELIMINA PROGRAMMA
   ========================================================= */

async function eliminaProgramma(
  id
) {

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

    const riferimento =
      ref(
        database,
        `dispositivi/cameretta/programmi/${id}`
      );


    await remove(
      riferimento
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
   FIREBASE - LETTURA SENSORI
   ========================================================= */

onValue(

  sensoreRef,

  snapshot => {

    ultimiDati =
      snapshot.val();


    if (!ultimiDati) {

      erroreEl.hidden =
        false;


      erroreEl.textContent =
        "Nessun dato disponibile nel database.";


      aggiornaStato();

      return;
    }


    erroreEl.hidden =
      true;


    aggiornaStato();


    /*
      Salva nello storico
      soltanto quando cambia
      ultimoAggiornamento.
    */

    salvaCampioneStorico(
      ultimiDati
    );
  },


  errore => {

    console.error(
      "Errore lettura sensori:",
      errore
    );


    erroreEl.hidden =
      false;


    erroreEl.textContent =
      "Impossibile leggere i dati da Firebase.";


    ultimiDati =
      null;


    aggiornaStato();
  }
);


/* =========================================================
   FIREBASE - CLIMATIZZATORE
   ========================================================= */

onValue(

  climaRef,

  snapshot => {

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
      dati.power ===
      true;


    automaticoAttivo =
      dati.automatico ===
      true;


    autoModeEl.checked =
      automaticoAttivo;


    tempOnEl.value =
      typeof dati
        .sogliaAccensione ===
        "number"
        ? dati
            .sogliaAccensione
        : 26;


    tempOffEl.value =
      typeof dati
        .sogliaSpegnimento ===
        "number"
        ? dati
            .sogliaSpegnimento
        : 24;


    aggiornaPulsante();
  }
);


/* =========================================================
   FIREBASE - PROGRAMMI
   ========================================================= */

onValue(

  programmiRef,

  snapshot => {

    programmi =
      snapshot.val() ||
      {};


    renderProgrammi();
  },


  errore => {

    console.error(
      "Errore lettura programmi:",
      errore
    );


    if (
      programListEl
    ) {

      programListEl.innerHTML =
        `

        <p class="program-empty">

          Impossibile leggere
          i programmi.

        </p>

        `;
    }
  }
);


/* =========================================================
   POWER CLIMATIZZATORE
   ========================================================= */

powerButtonEl.addEventListener(

  "click",

  async () => {

    if (
      comandoPowerInCorso
    ) {

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

          power:
            nuovoStato,

          automatico:
            false
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
   NUOVO PROGRAMMA
   ========================================================= */

if (
  addProgramButtonEl
) {

  addProgramButtonEl
    .addEventListener(

      "click",

      () => {

        apriModaleProgramma();
      }
    );
}


/* =========================================================
   MODIFICA / ELIMINA PROGRAMMA
   ========================================================= */

if (
  programListEl
) {

  programListEl.addEventListener(

    "click",

    evento => {

      const bottone =
        evento.target.closest(
          "[data-action]"
        );


      if (!bottone) {

        return;
      }


      const id =
        bottone.dataset
          .programId;


      const azione =
        bottone.dataset
          .action;


      if (
        azione ===
        "edit"
      ) {

        apriModaleProgramma(
          id
        );

        return;
      }


      if (
        azione ===
        "delete"
      ) {

        eliminaProgramma(
          id
        );
      }
    }
  );
}


/* =========================================================
   INTERAZIONE GRAFICO
   ========================================================= */

if (
  historyCanvasEl
) {

  historyCanvasEl
    .addEventListener(
      "mousemove",
      mostraTooltip
    );


  historyCanvasEl
    .addEventListener(
      "mouseleave",
      nascondiTooltip
    );


  historyCanvasEl
    .addEventListener(
      "touchstart",
      mostraTooltip,
      {
        passive: true
      }
    );


  historyCanvasEl
    .addEventListener(
      "touchmove",
      mostraTooltip,
      {
        passive: true
      }
    );


  historyCanvasEl
    .addEventListener(
      "touchend",
      () => {

        setTimeout(
          nascondiTooltip,
          800
        );
      },
      {
        passive: true
      }
    );
}


/* =========================================================
   RIDIMENSIONAMENTO
   ========================================================= */

window.addEventListener(

  "resize",

  () => {

    disegnaGrafico();
  }
);


/* =========================================================
   AVVIO
   ========================================================= */

creaModaleProgramma();

caricaStorico();


/*
  Aggiornamento stato,
  trend e grafico ogni secondo.
*/

setInterval(

  () => {

    aggiornaStato();

    aggiornaTrend();

    disegnaGrafico();
  },

  1000
);
