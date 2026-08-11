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


const TEMPO_OFFLINE_MS = 5000;


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


let ultimiDati = null;


/* =========================================================
   VARIABILI TREND TEMPERATURA
   ========================================================= */

let temperaturaPrecedenteDecimi = null;

let ultimoTimestampTrend = null;

let statoTrend = "stable";


let climatizzatoreAcceso = false;
let automaticoAttivo = false;

let comandoPowerInCorso = false;
let comandoAutomaticoInCorso = false;
let salvataggioInCorso = false;

let programmi = {};
let programmaInModifica = null;
let salvataggioProgrammaInCorso = false;


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
  temperatura,
  timestamp
) {

  if (
    typeof temperatura !== "number" ||
    !Number.isFinite(temperatura)
  ) {

    return;
  }


  /*
   * Evitiamo di analizzare più volte
   * la stessa lettura Firebase.
   */

  if (
    typeof timestamp === "number" &&
    ultimoTimestampTrend === timestamp
  ) {

    return;
  }


  /*
   * Convertiamo la temperatura in decimi interi.
   *
   * Esempio:
   *
   * 24.3 °C -> 243
   * 24.4 °C -> 244
   *
   * In questo modo eliminiamo i problemi
   * dei decimali JavaScript.
   */

  const temperaturaAttualeDecimi =
    Math.round(
      temperatura * 10
    );


  /*
   * Prima lettura:
   * non possiamo ancora conoscere il trend.
   */

  if (
    temperaturaPrecedenteDecimi === null
  ) {

    temperaturaPrecedenteDecimi =
      temperaturaAttualeDecimi;


    if (
      typeof timestamp === "number"
    ) {

      ultimoTimestampTrend =
        timestamp;
    }


    mostraTrendStabile();

    return;
  }


  const differenzaDecimi =
    temperaturaAttualeDecimi -
    temperaturaPrecedenteDecimi;


  /*
   * Se aumenta almeno di 0.1 °C.
   */

  if (
    differenzaDecimi >= 1
  ) {

    mostraTrendSalita();
  }


  /*
   * Se diminuisce almeno di 0.1 °C.
   */

  else if (
    differenzaDecimi <= -1
  ) {

    mostraTrendDiscesa();
  }


  /*
   * Se la temperatura è identica,
   * manteniamo l'ultimo trend rilevato.
   *
   * Non torniamo subito a "stabile".
   */

  else {

    if (
      statoTrend === "rising"
    ) {

      mostraTrendSalita();

    } else if (
      statoTrend === "falling"
    ) {

      mostraTrendDiscesa();

    } else {

      mostraTrendStabile();
    }
  }


  temperaturaPrecedenteDecimi =
    temperaturaAttualeDecimi;


  if (
    typeof timestamp === "number"
  ) {

    ultimoTimestampTrend =
      timestamp;
  }
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
    dati.temperatura,
    dati.ultimoAggiornamento
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
    tempoTrascorso <= TEMPO_OFFLINE_MS
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
