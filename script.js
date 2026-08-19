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


const app =
  initializeApp(firebaseConfig);

const database =
  getDatabase(app);


/* =========================================================
   RIFERIMENTI FIREBASE
   ========================================================= */

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
   CONFIGURAZIONE
   ========================================================= */

/*
 * ESP32 considerato offline soltanto
 * dopo 20 secondi senza aggiornamenti.
 */
const TEMPO_OFFLINE_MS =
  20000;


/*
 * Dopo 5 minuti senza variazioni
 * la freccia torna stabile.
 */
const TEMPO_TREND_STABILE_MS =
  5 * 60 * 1000;


/*
 * Grafico ultime 12 ore.
 */
const ORE_STORICO_GRAFICO =
  12;

const TEMPO_STORICO_GRAFICO_MS =
  ORE_STORICO_GRAFICO *
  60 *
  60 *
  1000;


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
   ELEMENTI PAGINA
   ========================================================= */

const temperaturaEl =
  document.getElementById(
    "temperatura"
  );

const umiditaEl =
  document.getElementById(
    "umidita"
  );

const trendArrowEl =
  document.getElementById(
    "trendArrow"
  );

const temperatureTrendEl =
  document.getElementById(
    "temperatureTrend"
  );

const rssiEl =
  document.getElementById(
    "rssi"
  );

const statoEl =
  document.getElementById(
    "stato"
  );

const statusDotEl =
  document.getElementById(
    "statusDot"
  );

const ultimoAggiornamentoEl =
  document.getElementById(
    "ultimoAggiornamento"
  );

const erroreEl =
  document.getElementById(
    "errore"
  );

const powerButtonEl =
  document.getElementById(
    "powerButton"
  );

const powerStateEl =
  document.getElementById(
    "powerState"
  );

const autoModeEl =
  document.getElementById(
    "autoMode"
  );

const tempOnEl =
  document.getElementById(
    "tempOn"
  );

const tempOffEl =
  document.getElementById(
    "tempOff"
  );

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

const historyChartCanvasEl =
  document.getElementById(
    "historyChart"
  );

const historyEmptyEl =
  document.getElementById(
    "historyEmpty"
  );

const historyPointsEl =
  document.getElementById(
    "historyPoints"
  );


/* =========================================================
   VARIABILI
   ========================================================= */

let ultimiDati =
  null;

let temperaturaPrecedenteDecimi =
  null;

let ultimoMovimentoTemperatura =
  null;

let climatizzatoreAcceso =
  false;

let automaticoAttivo =
  false;

let comandoPowerInCorso =
  false;

let comandoAutomaticoInCorso =
  false;

let salvataggioInCorso =
  false;

let programmi = {};

let programmaInModifica =
  null;

let salvataggioProgrammaInCorso =
  false;

let storicoDati = [];

let graficoStorico =
  null;


/* =========================================================
   TREND TEMPERATURA
   ========================================================= */

function mostraTrendStabile() {

  if (!trendArrowEl) {
    return;
  }

  trendArrowEl.textContent =
    "•";

  trendArrowEl.classList.remove(
    "rising",
    "falling"
  );

  trendArrowEl.classList.add(
    "stable"
  );

  if (temperatureTrendEl) {

    temperatureTrendEl.setAttribute(
      "aria-label",
      "Temperatura stabile"
    );
  }
}


function mostraTrendSalita() {

  if (!trendArrowEl) {
    return;
  }

  trendArrowEl.textContent =
    "↑";

  trendArrowEl.classList.remove(
    "falling",
    "stable"
  );

  trendArrowEl.classList.add(
    "rising"
  );

  if (temperatureTrendEl) {

    temperatureTrendEl.setAttribute(
      "aria-label",
      "Temperatura in aumento"
    );
  }
}


function mostraTrendDiscesa() {

  if (!trendArrowEl) {
    return;
  }

  trendArrowEl.textContent =
    "↓";

  trendArrowEl.classList.remove(
    "rising",
    "stable"
  );

  trendArrowEl.classList.add(
    "falling"
  );

  if (temperatureTrendEl) {

    temperatureTrendEl.setAttribute(
      "aria-label",
      "Temperatura in diminuzione"
    );
  }
}


function aggiornaTrendTemperatura(
  temperatura
) {

  if (
    typeof temperatura !==
      "number" ||
    !Number.isFinite(
      temperatura
    )
  ) {

    return;
  }


  const temperaturaAttualeDecimi =
    Math.round(
      temperatura * 10
    );


  if (
    temperaturaPrecedenteDecimi ===
    null
  ) {

    temperaturaPrecedenteDecimi =
      temperaturaAttualeDecimi;

    ultimoMovimentoTemperatura =
      Date.now();

    mostraTrendStabile();

    return;
  }


  const differenza =
    temperaturaAttualeDecimi -
    temperaturaPrecedenteDecimi;


  if (
    differenza > 0
  ) {

    mostraTrendSalita();

    ultimoMovimentoTemperatura =
      Date.now();

    temperaturaPrecedenteDecimi =
      temperaturaAttualeDecimi;

    return;
  }


  if (
    differenza < 0
  ) {

    mostraTrendDiscesa();

    ultimoMovimentoTemperatura =
      Date.now();

    temperaturaPrecedenteDecimi =
      temperaturaAttualeDecimi;

    return;
  }


  if (
    ultimoMovimentoTemperatura !==
    null
  ) {

    const tempoSenzaMovimento =
      Date.now() -
      ultimoMovimentoTemperatura;

    if (
      tempoSenzaMovimento >=
      TEMPO_TREND_STABILE_MS
    ) {

      mostraTrendStabile();
    }
  }


  temperaturaPrecedenteDecimi =
    temperaturaAttualeDecimi;
}


/* =========================================================
   SENSORI
   ========================================================= */

function mostraValori(
  dati
) {

  if (temperaturaEl) {

    temperaturaEl.textContent =
      typeof dati.temperatura ===
      "number"
        ? dati.temperatura.toFixed(1)
        : "--";
  }


  if (umiditaEl) {

    umiditaEl.textContent =
      typeof dati.umidita ===
      "number"
        ? dati.umidita.toFixed(0)
        : "--";
  }


  if (rssiEl) {

    rssiEl.textContent =
      typeof dati.rssi ===
      "number"
        ? dati.rssi
        : "--";
  }


  aggiornaTrendTemperatura(
    dati.temperatura
  );
}


function nascondiValori() {

  if (temperaturaEl) {
    temperaturaEl.textContent =
      "--";
  }

  if (umiditaEl) {
    umiditaEl.textContent =
      "--";
  }

  if (rssiEl) {
    rssiEl.textContent =
      "--";
  }
}


/* =========================================================
   STATO ESP32
   ========================================================= */

function mostraOnline() {

  if (statoEl) {

    statoEl.textContent =
      "ESP32 online";
  }


  if (statusDotEl) {

    statusDotEl.classList.add(
      "online"
    );

    statusDotEl.classList.remove(
      "offline"
    );
  }
}


function mostraOffline() {

  if (statoEl) {

    statoEl.textContent =
      "ESP32 offline";
  }


  if (statusDotEl) {

    statusDotEl.classList.remove(
      "online"
    );

    statusDotEl.classList.add(
      "offline"
    );
  }


  nascondiValori();
}


function aggiornaStato() {

  if (
    !ultimiDati ||
    typeof ultimiDati
      .ultimoAggiornamento !==
      "number"
  ) {

    if (
      ultimoAggiornamentoEl
    ) {

      ultimoAggiornamentoEl
        .textContent =
        "--";
    }

    mostraOffline();

    return;
  }


  const timestamp =
    ultimiDati
      .ultimoAggiornamento;


  const tempoTrascorso =
    Date.now() -
    timestamp;


  if (
    ultimoAggiornamentoEl
  ) {

    ultimoAggiornamentoEl
      .textContent =
      new Date(
        timestamp
      ).toLocaleString(
        "it-IT"
      );
  }


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
   GRAFICO STORICO 12 ORE
   ========================================================= */

function formattaOraGrafico(
  timestamp
) {

  return new Date(
    timestamp
  ).toLocaleTimeString(
    "it-IT",
    {
      hour:
        "2-digit",

      minute:
        "2-digit"
    }
  );
}


function normalizzaStorico(
  dati
) {

  if (!dati) {

    return [];
  }


  const limite =
    Date.now() -
    TEMPO_STORICO_GRAFICO_MS;


  return Object.values(
    dati
  )
    .filter(
      (campione) => {

        return (
          campione &&
          typeof campione.timestamp ===
            "number" &&
          typeof campione.temperatura ===
            "number" &&
          typeof campione.umidita ===
            "number" &&
          campione.timestamp >=
            limite
        );
      }
    )
    .sort(
      (a, b) =>
        a.timestamp -
        b.timestamp
    );
}


function distruggiGraficoStorico() {

  if (
    graficoStorico
  ) {

    graficoStorico.destroy();

    graficoStorico =
      null;
  }
}


function renderGraficoStorico() {

  if (
    !historyChartCanvasEl
  ) {

    return;
  }


  if (
    storicoDati.length === 0
  ) {

    distruggiGraficoStorico();


    historyChartCanvasEl.hidden =
      true;


    if (
      historyEmptyEl
    ) {

      historyEmptyEl.hidden =
        false;

      historyEmptyEl.textContent =
        "Raccolta dati in corso...";
    }


    if (
      historyPointsEl
    ) {

      historyPointsEl.textContent =
        "0 campioni";
    }


    return;
  }


  historyChartCanvasEl.hidden =
    false;


  if (
    historyEmptyEl
  ) {

    historyEmptyEl.hidden =
      true;
  }


  if (
    historyPointsEl
  ) {

    historyPointsEl.textContent =
      `${storicoDati.length} campioni`;
  }


  if (
    typeof Chart ===
    "undefined"
  ) {

    console.error(
      "Chart.js non disponibile"
    );

    return;
  }


  const labels =
    storicoDati.map(
      (campione) =>
        formattaOraGrafico(
          campione.timestamp
        )
    );


  const temperature =
    storicoDati.map(
      (campione) =>
        campione.temperatura
    );


  const umidita =
    storicoDati.map(
      (campione) =>
        campione.umidita
    );


  distruggiGraficoStorico();


  const ctx =
    historyChartCanvasEl
      .getContext(
        "2d"
      );


  graficoStorico =
    new Chart(
      ctx,
      {

        type:
          "line",


        data: {

          labels,

          datasets: [

            {
              label:
                "Temperatura °C",

              data:
                temperature,

              yAxisID:
                "yTemperatura",

              borderColor:
                "#ff806f",

              backgroundColor:
                "rgba(255,128,111,0.12)",

              pointRadius:
                0,

              pointHoverRadius:
                4,

              borderWidth:
                2.2,

              tension:
                0.28,

              spanGaps:
                true
            },


            {
              label:
                "Umidità %",

              data:
                umidita,

              yAxisID:
                "yUmidita",

              borderColor:
                "#62adff",

              backgroundColor:
                "rgba(98,173,255,0.12)",

              pointRadius:
                0,

              pointHoverRadius:
                4,

              borderWidth:
                2.2,

              tension:
                0.28,

              spanGaps:
                true
            }

          ]
        },


        options: {

          responsive:
            true,

          maintainAspectRatio:
            false,


          interaction: {

            mode:
              "index",

            intersect:
              false
          },


          plugins: {

            legend: {

              position:
                "top",

              labels: {

                color:
                  "#c5cce0",

                usePointStyle:
                  true,

                boxWidth:
                  8,

                boxHeight:
                  8,

                padding:
                  18
              }
            },


            tooltip: {

              backgroundColor:
                "rgba(8,13,29,0.96)",

              titleColor:
                "#ffffff",

              bodyColor:
                "#d9e0f4",

              borderColor:
                "rgba(255,255,255,0.10)",

              borderWidth:
                1,


              callbacks: {

                title(
                  elementi
                ) {

                  if (
                    !elementi.length
                  ) {

                    return "";
                  }


                  const indice =
                    elementi[0]
                      .dataIndex;


                  return new Date(
                    storicoDati[
                      indice
                    ].timestamp
                  ).toLocaleString(
                    "it-IT"
                  );
                }
              }
            }
          },


          scales: {

            x: {

              grid: {

                color:
                  "rgba(255,255,255,0.045)"
              },


              ticks: {

                color:
                  "#77829d",

                maxRotation:
                  0,

                autoSkip:
                  true,

                maxTicksLimit:
                  7
              }
            },


            yTemperatura: {

              type:
                "linear",

              position:
                "left",


              grid: {

                color:
                  "rgba(255,255,255,0.055)"
              },


              ticks: {

                color:
                  "#ff9b8e",

                callback:
                  (valore) =>
                    `${valore}°`
              },


              title: {

                display:
                  true,

                text:
                  "Temperatura °C",

                color:
                  "#ff9b8e"
              }
            },


            yUmidita: {

              type:
                "linear",

              position:
                "right",

              min:
                0,

              max:
                100,


              grid: {

                drawOnChartArea:
                  false
              },


              ticks: {

                color:
                  "#8bc5ff",

                callback:
                  (valore) =>
                    `${valore}%`
              },


              title: {

                display:
                  true,

                text:
                  "Umidità %",

                color:
                  "#8bc5ff"
              }
            }
          }
        }
      }
    );
}


/* =========================================================
   CLIMATIZZATORE
   ========================================================= */

function aggiornaPulsante() {

  if (
    powerStateEl
  ) {

    powerStateEl.textContent =
      climatizzatoreAcceso
        ? "ACCESO"
        : "SPENTO";
  }


  if (
    powerButtonEl
  ) {

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
}


/* =========================================================
   PROGRAMMI - FUNZIONI BASE
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


  if (
    !giorni
  ) {

    return risultato;
  }


  for (
    let i = 0;
    i < 7;
    i++
  ) {

    risultato[i] =
      giorni[i] ===
        true ||
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
      giorni[i] ===
      true;
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


  return /^([01]\d|2[0-3]):[0-5]\d$/.test(
    orario
  );
}


/* =========================================================
   VISUALIZZAZIONE PROGRAMMI
   ========================================================= */

function renderProgrammi() {

  if (
    !programListEl
  ) {

    return;
  }


  const elementi =
    Object.entries(
      programmi
    );


  if (
    elementi.length === 0
  ) {

    programListEl.innerHTML = `
      <p class="program-empty">
        Nessun programma configurato.
        Premi “+ Nuovo programma” per crearne uno.
      </p>
    `;

    return;
  }


  programListEl.innerHTML =
    elementi.map(
      ([id, programma]) => {


        const giorni =
          normalizzaGiorni(
            programma.giorni
          );


        const giorniHtml =
          NOMI_GIORNI.map(
            (
              nome,
              indice
            ) => `

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
          ).join("");


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
            programma.oraAccensione
          )
            ? programma.oraAccensione
            : "--:--";


        const oraSpegnimento =
          orarioValido(
            programma.oraSpegnimento
          )
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

                ${
                  attivo
                    ? "Attivo"
                    : "Disattivo"
                }

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
      }

    ).join("");
}


/* =========================================================
   FINESTRA PROGRAMMA
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

            ${
              NOMI_GIORNI.map(
                (
                  nome,
                  indice
                ) => `

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
              ).join("")
            }

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

            <span
              class="switch-slider"
            ></span>

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

    (evento) => {

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
   APRI PROGRAMMA
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
        ? programma.oraAccensione
        : "";


    timeOffEl.value =
      orarioValido(
        programma.oraSpegnimento
      )
        ? programma.oraSpegnimento
        : "";


    enabledEl.checked =
      programma.attivo ===
      true;


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


    enabledEl.checked =
      true;


    checkboxes.forEach(
      (checkbox) => {

        checkbox.checked =
          false;
      }
    );
  }


  modalEl.hidden =
    false;
}


/* =========================================================
   CHIUDI PROGRAMMA
   ========================================================= */

function chiudiModaleProgramma() {

  const modalEl =
    document.getElementById(
      "scheduleModal"
    );


  if (
    modalEl
  ) {

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


  if (
    !nome
  ) {

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
      (giorno) =>
        giorno
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
        push(
          programmiRef
        );


      await set(
        nuovoProgrammaRef,
        datiProgramma
      );
    }


    chiudiModaleProgramma();


  } catch (
    errore
  ) {

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


  if (
    !programma
  ) {

    return;
  }


  const conferma =
    confirm(
      `Vuoi eliminare il programma "${programma.nome || "Programma"}"?`
    );


  if (
    !conferma
  ) {

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


  } catch (
    errore
  ) {

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


    if (
      !ultimiDati
    ) {

      if (
        erroreEl
      ) {

        erroreEl.hidden =
          false;

        erroreEl.textContent =
          "Nessun dato disponibile nel database.";
      }


      aggiornaStato();

      return;
    }


    if (
      erroreEl
    ) {

      erroreEl.hidden =
        true;
    }


    aggiornaStato();
  },


  (errore) => {

    console.error(
      "Errore lettura sensori:",
      errore
    );


    if (
      erroreEl
    ) {

      erroreEl.hidden =
        false;

      erroreEl.textContent =
        "Impossibile leggere i dati da Firebase.";
    }


    ultimiDati =
      null;


    aggiornaStato();
  }
);


/* =========================================================
   LETTURA STORICO FIREBASE
   ========================================================= */

onValue(
  storicoRef,

  (snapshot) => {

    storicoDati =
      normalizzaStorico(
        snapshot.val()
      );


    renderGraficoStorico();
  },


  (errore) => {

    console.error(
      "Errore lettura storico:",
      errore
    );


    storicoDati =
      [];


    renderGraficoStorico();


    if (
      historyEmptyEl
    ) {

      historyEmptyEl.hidden =
        false;

      historyEmptyEl.textContent =
        "Impossibile leggere lo storico.";
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


    if (
      !dati
    ) {

      climatizzatoreAcceso =
        false;


      automaticoAttivo =
        false;


      if (
        autoModeEl
      ) {

        autoModeEl.checked =
          false;
      }


      if (
        tempOnEl
      ) {

        tempOnEl.value =
          26;
      }


      if (
        tempOffEl
      ) {

        tempOffEl.value =
          24;
      }


      aggiornaPulsante();

      return;
    }


    climatizzatoreAcceso =
      dati.power ===
      true;


    automaticoAttivo =
      dati.automatico ===
      true;


    if (
      autoModeEl
    ) {

      autoModeEl.checked =
        automaticoAttivo;
    }


    if (
      tempOnEl
    ) {

      tempOnEl.value =
        typeof dati.sogliaAccensione ===
        "number"
          ? dati.sogliaAccensione
          : 26;
    }


    if (
      tempOffEl
    ) {

      tempOffEl.value =
        typeof dati.sogliaSpegnimento ===
        "number"
          ? dati.sogliaSpegnimento
          : 24;
    }


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
      snapshot.val() ||
      {};


    renderProgrammi();
  },


  (errore) => {

    console.error(
      "Errore lettura programmi:",
      errore
    );


    if (
      programListEl
    ) {

      programListEl.innerHTML = `
        <p class="program-empty">
          Impossibile leggere i programmi.
        </p>
      `;
    }
  }
);


/* =========================================================
   ACCENSIONE / SPEGNIMENTO
   ========================================================= */

if (
  powerButtonEl
) {

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


      } catch (
        errore
      ) {

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
}


/* =========================================================
   MODALITÀ AUTOMATICA
   ========================================================= */

if (
  autoModeEl
) {

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


      } catch (
        errore
      ) {

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
}


/* =========================================================
   SALVA SOGLIE
   ========================================================= */

if (
  saveSettingsEl
) {

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


      } catch (
        errore
      ) {

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
}


/* =========================================================
   NUOVO PROGRAMMA
   ========================================================= */

if (
  addProgramButtonEl
) {

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

if (
  programListEl
) {

  programListEl.addEventListener(
    "click",

    (evento) => {

      const bottone =
        evento.target.closest(
          "[data-action]"
        );


      if (
        !bottone
      ) {

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
   AVVIO
   ========================================================= */

creaModaleProgramma();

mostraTrendStabile();

aggiornaStato();


setInterval(
  aggiornaStato,
  1000
);
