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
  limitToLast
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

import {
  Chart,
  registerables
} from "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/+esm";

Chart.register(...registerables);


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
   CONFIGURAZIONE
   ========================================================= */

const TEMPO_OFFLINE_MS = 5000;

/*
 * Dopo 5 minuti senza variazioni reali
 * la freccia torna sullo stato stabile.
 */
const TEMPO_TREND_STABILE_MS =
  5 * 60 * 1000;

/*
 * Grafico storico:
 * l'ESP32 salva circa un campione al minuto.
 * Limitiamo la lettura agli ultimi 720 record e poi
 * mostriamo solo quelli realmente compresi nelle ultime 12 ore.
 */
const ORE_STORICO = 12;
const MAX_CAMPIONI_STORICO = 720;


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
  document.getElementById("temperatura");

const umiditaEl =
  document.getElementById("umidita");

const trendArrowEl =
  document.getElementById("trendArrow");

const temperatureTrendEl =
  document.getElementById("temperatureTrend");

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

const historyChartEl =
  document.getElementById("historyChart");

const historySampleCountEl =
  document.getElementById("historySampleCount");

const historyEmptyEl =
  document.getElementById("historyEmpty");


/* =========================================================
   VARIABILI GLOBALI
   ========================================================= */

let ultimiDati = null;


/* =========================================================
   VARIABILI TREND TEMPERATURA
   ========================================================= */

/*
 * La temperatura precedente viene memorizzata
 * come numero intero in decimi.
 *
 * Esempio:
 *
 * 24.3 °C = 243
 * 24.4 °C = 244
 */

let temperaturaPrecedenteDecimi = null;


/*
 * Stato attuale:
 *
 * stable
 * rising
 * falling
 */

let statoTrend = "stable";


/*
 * Momento dell'ultima variazione reale
 * della temperatura.
 */

let ultimoMovimentoTemperatura =
  null;


let climatizzatoreAcceso = false;
let automaticoAttivo = false;

let comandoPowerInCorso = false;
let comandoAutomaticoInCorso = false;
let salvataggioInCorso = false;

let programmi = {};
let programmaInModifica = null;
let salvataggioProgrammaInCorso = false;

let graficoStorico = null;


/* =========================================================
   TREND TEMPERATURA
   ========================================================= */

function mostraTrendStabile() {

  statoTrend = "stable";


  if (!trendArrowEl) {
    return;
  }


  trendArrowEl.textContent = "•";


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

  statoTrend = "rising";


  if (!trendArrowEl) {
    return;
  }


  trendArrowEl.textContent = "↑";


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

  statoTrend = "falling";


  if (!trendArrowEl) {
    return;
  }


  trendArrowEl.textContent = "↓";


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

  /*
   * Controlliamo che il dato ricevuto
   * sia effettivamente un numero.
   */

  if (
    typeof temperatura !== "number" ||
    !Number.isFinite(temperatura)
  ) {

    return;
  }


  /*
   * Convertiamo la temperatura in decimi.
   *
   * Questo evita completamente problemi
   * tipo:
   *
   * 24.4 - 24.3 =
   * 0.099999999999
   */

  const temperaturaAttualeDecimi =
    Math.round(
      temperatura * 10
    );


  /*
   * PRIMA LETTURA
   *
   * Non esiste ancora una temperatura
   * precedente da confrontare.
   */

  if (
    temperaturaPrecedenteDecimi === null
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


  /*
   * TEMPERATURA AUMENTATA
   *
   * Basta una variazione visualizzata
   * di almeno +0.1 °C.
   */

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


  /*
   * TEMPERATURA DIMINUITA
   *
   * Basta una variazione visualizzata
   * di almeno -0.1 °C.
   */

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


  /*
   * TEMPERATURA IDENTICA
   *
   * Non cambiamo immediatamente
   * la freccia.
   *
   * Se era ↑ rimane ↑.
   * Se era ↓ rimane ↓.
   *
   * Soltanto dopo 5 minuti senza
   * nessuna variazione torniamo •.
   */

  if (
    ultimoMovimentoTemperatura !== null
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


  aggiornaTrendTemperatura(
    dati.temperatura
  );
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


/* =========================================================
   STATO ESP32
   ========================================================= */

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
    new Date(timestamp).toLocaleString(
      "it-IT"
    );


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
   PROGRAMMI - FUNZIONI BASE
   ========================================================= */

function escapeHtml(testo) {

  return String(
    testo ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
      giorni[String(i)] === true;
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
    typeof orario !== "string"
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
            (nome, indice) => `

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
          programma.attivo === true;


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
   APERTURA PROGRAMMA
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
      programma.nome || "";


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
   CHIUSURA PROGRAMMA
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
   SALVATAGGIO PROGRAMMA
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
   STORICO - GRAFICO ULTIME 12 ORE
   ========================================================= */

function numeroValido(valore) {
  const numero = Number(valore);

  return Number.isFinite(numero)
    ? numero
    : null;
}


function arrotondaDecimo(valore) {
  return Math.round(
    Number(valore) * 10
  ) / 10;
}


function formattaTemperaturaAsse(valore) {
  return (
    Number(valore)
      .toFixed(1)
      .replace(".", ",") +
    "°"
  );
}


function formattaOraStorico(timestamp) {
  return new Date(timestamp)
    .toLocaleTimeString(
      "it-IT",
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );
}


function calcolaLimitiTemperatura(punti) {

  const temperature =
    punti.map(
      (punto) => punto.temperatura
    );


  let minimo =
    Math.floor(
      Math.min(...temperature) * 10
    ) / 10;


  let massimo =
    Math.ceil(
      Math.max(...temperature) * 10
    ) / 10;


  /*
   * Se tutti i campioni hanno la stessa temperatura,
   * allarghiamo leggermente l'asse per evitare un grafico piatto.
   */
  if (minimo === massimo) {
    minimo =
      arrotondaDecimo(
        minimo - 0.2
      );

    massimo =
      arrotondaDecimo(
        massimo + 0.2
      );
  }


  return {
    minimo,
    massimo
  };
}


function aggiornaGraficoStorico(punti) {

  if (
    !historyChartEl ||
    !historySampleCountEl
  ) {
    return;
  }


  historySampleCountEl.textContent =
    `${punti.length} ${
      punti.length === 1
        ? "campione"
        : "campioni"
    }`;


  if (historyEmptyEl) {
    historyEmptyEl.hidden =
      punti.length > 0;
  }


  if (punti.length === 0) {

    if (graficoStorico) {
      graficoStorico.destroy();
      graficoStorico = null;
    }

    return;
  }


  const limitiTemperatura =
    calcolaLimitiTemperatura(
      punti
    );


  const datiTemperatura =
    punti.map(
      (punto) => ({
        x: punto.timestamp,
        y: punto.temperatura
      })
    );


  const datiUmidita =
    punti.map(
      (punto) => ({
        x: punto.timestamp,
        y: punto.umidita
      })
    );


  const primoTimestamp =
    punti[0].timestamp;


  const ultimoTimestamp =
    punti[
      punti.length - 1
    ].timestamp;


  const configurazione = {

    type: "line",

    data: {

      datasets: [

        {
          label: "Temperatura °C",
          data: datiTemperatura,
          yAxisID: "yTemperatura",
          borderColor: "#ff7d6e",
          backgroundColor: "#ff7d6e",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          stepped: true,
          spanGaps: true
        },

        {
          label: "Umidità %",
          data: datiUmidita,
          yAxisID: "yUmidita",
          borderColor: "#5aaeff",
          backgroundColor: "#5aaeff",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.15,
          spanGaps: true
        }

      ]
    },

    options: {

      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,

      interaction: {
        mode: "index",
        intersect: false
      },

      plugins: {

        legend: {
          position: "top",

          labels: {
            color: "#dce3f8",
            usePointStyle: true,
            boxWidth: 10,
            boxHeight: 10,
            padding: 18
          }
        },

        tooltip: {

          callbacks: {

            title: (elementi) => {

              if (
                !elementi ||
                elementi.length === 0
              ) {
                return "";
              }

              const timestamp =
                elementi[0].parsed.x;

              return new Date(timestamp)
                .toLocaleString(
                  "it-IT"
                );
            },

            label: (contesto) => {

              if (
                contesto.dataset.yAxisID ===
                  "yTemperatura"
              ) {

                return (
                  "Temperatura: " +
                  Number(
                    contesto.parsed.y
                  )
                    .toFixed(1)
                    .replace(".", ",") +
                  " °C"
                );
              }

              return (
                "Umidità: " +
                Number(
                  contesto.parsed.y
                )
                  .toFixed(0) +
                " %"
              );
            }
          }
        }
      },

      scales: {

        x: {

          type: "linear",

          min: primoTimestamp,
          max: ultimoTimestamp,

          grid: {
            color: "rgba(255,255,255,0.06)"
          },

          border: {
            color: "rgba(255,255,255,0.12)"
          },

          ticks: {
            color: "#8f9ab8",
            maxTicksLimit: 7,

            callback: (valore) =>
              formattaOraStorico(
                Number(valore)
              )
          }
        },

        yTemperatura: {

          type: "linear",
          position: "left",

          min:
            limitiTemperatura.minimo,

          max:
            limitiTemperatura.massimo,

          grid: {
            color: "rgba(255,255,255,0.07)"
          },

          border: {
            color: "rgba(255,125,110,0.38)"
          },

          title: {
            display: true,
            text: "Temperatura °C",
            color: "#ff9589"
          },

          ticks: {
            color: "#ff9589",

            /*
             * QUESTA È LA CORREZIONE DEI NUMERI
             * tipo 30.200000000000003.
             */
            stepSize: 0.1,
            precision: 1,

            callback: (valore) =>
              formattaTemperaturaAsse(
                valore
              )
          }
        },

        yUmidita: {

          type: "linear",
          position: "right",

          min: 0,
          max: 100,

          grid: {
            drawOnChartArea: false
          },

          border: {
            color: "rgba(90,174,255,0.38)"
          },

          title: {
            display: true,
            text: "Umidità %",
            color: "#83c4ff"
          },

          ticks: {
            color: "#83c4ff",
            stepSize: 10,

            callback: (valore) =>
              `${Math.round(
                Number(valore)
              )}%`
          }
        }
      }
    }
  };


  if (graficoStorico) {
    graficoStorico.destroy();
  }


  graficoStorico =
    new Chart(
      historyChartEl,
      configurazione
    );
}


/*
 * Firebase push genera chiavi ordinate temporalmente.
 * limitToLast(720) evita di scaricare tutto lo storico,
 * che cresce di circa 1440 record al giorno.
 */
const storicoQuery =
  query(
    storicoRef,
    limitToLast(
      MAX_CAMPIONI_STORICO
    )
  );


onValue(

  storicoQuery,

  (snapshot) => {

    const dati =
      snapshot.val() || {};


    const limiteTemporale =
      Date.now() -
      ORE_STORICO *
        60 *
        60 *
        1000;


    const punti =
      Object.values(dati)

        .map(
          (elemento) => {

            if (
              !elemento ||
              typeof elemento !==
                "object"
            ) {
              return null;
            }


            const timestamp =
              numeroValido(
                elemento.timestamp
              );


            const temperatura =
              numeroValido(
                elemento.temperatura
              );


            const umidita =
              numeroValido(
                elemento.umidita
              );


            if (
              timestamp === null ||
              temperatura === null ||
              umidita === null
            ) {
              return null;
            }


            return {
              timestamp,
              temperatura:
                arrotondaDecimo(
                  temperatura
                ),
              umidita:
                arrotondaDecimo(
                  umidita
                )
            };
          }
        )

        .filter(
          (punto) =>
            punto !== null &&
            punto.timestamp >=
              limiteTemporale
        )

        .sort(
          (a, b) =>
            a.timestamp -
            b.timestamp
        );


    aggiornaGraficoStorico(
      punti
    );
  },

  (errore) => {

    console.error(
      "Errore lettura storico:",
      errore
    );


    if (historySampleCountEl) {
      historySampleCountEl.textContent =
        "Errore storico";
    }


    if (historyEmptyEl) {
      historyEmptyEl.hidden = false;
      historyEmptyEl.textContent =
        "Impossibile leggere lo storico da Firebase.";
    }
  }
);


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
  },


  (errore) => {

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
      typeof dati.sogliaAccensione ===
      "number"
        ? dati.sogliaAccensione
        : 26;


    tempOffEl.value =
      typeof dati.sogliaSpegnimento ===
      "number"
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
   PULSANTE ACCENSIONE / SPEGNIMENTO
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


/* =========================================================
   PULSANTE NUOVO PROGRAMMA
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
        bottone.dataset.programId;


      const azione =
        bottone.dataset.action;


      if (
        azione === "edit"
      ) {

        apriModaleProgramma(
          id
        );


        return;
      }


      if (
        azione === "delete"
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


setInterval(
  aggiornaStato,
  1000
);
