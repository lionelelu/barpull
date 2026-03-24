
// ═══════════════════════════════════════════════════════════════════
// DATA & STORAGE
// ═══════════════════════════════════════════════════════════════════
var DB = {
  settings: { dark:false, sound:true, vibration:true, wakelock:true, prepDelay:5 },
  pullupLog: [],
  weights: [],
  sessions: [],
  records: {},
  totalTrainingTime: 0,
  streak: 0,
  lastTrainingDate: null,
  achievements: {}
};

function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function localDateStr(d) {
  var date = d || new Date();
  var y = date.getFullYear();
  var m = String(date.getMonth()+1).padStart(2,'0');
  var day = String(date.getDate()).padStart(2,'0');
  return y + '-' + m + '-' + day;
}

// SAFE LOCALSTORAGE WRAPPER
var LS = {
  get: function(key, fallback) {
    try { var v = localStorage.getItem(key); return v !== null ? v : fallback; } 
    catch(e) { return fallback; }
  },
  set: function(key, value) {
    try { localStorage.setItem(key, value); return true; } 
    catch(e) { console.error('LS.set failed:', key, e); return false; }
  },
  remove: function(key) {
    try { localStorage.removeItem(key); return true; } 
    catch(e) { console.error('LS.remove failed:', key, e); return false; }
  },
  getJSON: function(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch(e) { return fallback; }
  },
  setJSON: function(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e) { console.error('LS.setJSON failed:', key, e); return false; }
  }
};

// ═══════════════════════════════════════════════════════════════════
// DB / STATE
// ═══════════════════════════════════════════════════════════════════
function loadDB() {
  try {
    var profileId = LS.get(CURRENT_PROFILE_KEY) || 'default';
    var dbKey = profileId === 'default' ? DB_KEY_PREFIX : 'barra_pro_v2_' + profileId;
    var saved = localStorage.getItem(dbKey);
    if (saved) {
      var parsed = JSON.parse(saved);
      Object.assign(DB, parsed);
      // Ensure arrays exist
      if (!Array.isArray(DB.pullupLog)) DB.pullupLog = [];
      if (!Array.isArray(DB.weights)) DB.weights = [];
      if (!Array.isArray(DB.sessions)) DB.sessions = [];
      if (!DB.records) DB.records = {};
      if (!DB.settings) DB.settings = { dark:false, sound:true, vibration:true, wakelock:true, prepDelay:5 };
    }
  } catch(e) { console.log('DB load error', e); }
}

function saveDB() {
  try { localStorage.setItem(DB_KEY_PREFIX, JSON.stringify(DB)); } catch(e) {}
  // Auto-sync to GitHub if connected (debounced 8 sec, skip if already saving)
  if (GH && GH.token && GH.username && !GH._saving) {
    if (GH._saveTimer) clearTimeout(GH._saveTimer);
    GH._saveTimer = setTimeout(function() {
      if (!GH._saving) ghSave();
    }, SYNC_DEBOUNCE);
  }
}

function saveSetting(key, val) {
  DB.settings[key] = (val === 'true' || val === true) ? true : (val === 'false' || val === false) ? false : val;
  saveDB();
}

// ═══════════════════════════════════════════════════════════════════
// EXERCISE DATA (for training mode)
// ═══════════════════════════════════════════════════════════════════
// type: 'max'=reps to failure, 'reps'=fixed reps, 'time'=seconds, 'reps_side'=per side
// restType: 'pull','push','core','between'
var EX_DATA = {"Wide pull-up": {"steps": ["Agarra la barra más ancha que tus hombros. Las palmas miran hacia afuera — lejos de tu cara.", "Antes de subir, baja los hombros lejos de las orejas. Imagina meterte los omóplatos en los bolsillos traseros del pantalón.", "Jala los codos hacia abajo y hacia tus caderas. Sube hasta que el mentón pase la barra.", "Baja contando \"uno, dos\". No te dejes caer — controla el descenso siempre.", "Si el cuerpo balancea, aprieta glúteos y abdomen durante todo el movimiento."], "tip": "Error más común: los hombros suben hacia las orejas al subir. Cuando pasa, solo trabajan los trapecios, no la espalda. Mantén los hombros abajo en todo momento.", "vid": ""}, "Neutral pull-up": {"steps": ["Agarra los mangos paralelos de tu barra — los que apuntan hacia ti. Las palmas se miran entre sí.", "Cuelga con los brazos completamente estirados.", "Sube jalando los codos hacia tus costillas. Piensa en \"llevar los codos al piso\".", "Sube hasta que el pecho quede a la altura de los mangos. Baja en 2 segundos."], "tip": "Por qué lo haces después del wide: es más amigable con los hombros y codos — perfecto cuando ya están cansados del wide pull-up.", "vid": "Ai4S1uzMP7A"}, "Chin-up supino": {"steps": ["Agarra la barra con las palmas mirando hacia tu cara, al ancho de los hombros.", "Cuelga con los brazos completamente estirados.", "Sube jalando los codos hacia abajo y atrás. Mentón sobre la barra.", "Baja en 2 segundos. Sin soltar ni balancear."], "tip": "Diferencia con el wide: solo cambian las palmas — activa más bíceps y es un poco más fácil. Perfecto para el final del bloque cuando ya estás cansado.", "vid": ""}, "Dead bug": {"steps": ["Acuéstate boca arriba. Pega la espalda baja al piso — ese contacto no se pierde en ningún momento del ejercicio.", "Sube los brazos apuntando al techo. Dobla las rodillas a 90° con los muslos verticales (como una mesa).", "Lentamente: extiende el brazo derecho hacia atrás y la pierna izquierda hacia adelante al mismo tiempo. Ambos quedan casi paralelos al piso — sin tocar.", "Vuelve al centro controlado. Ahora el otro lado: brazo izquierdo + pierna derecha. Eso es 1 rep por lado."], "tip": "si la espalda baja se despega del piso, el movimiento fue demasiado largo. Acorta el rango hasta que el core sea suficientemente fuerte para controlarlo. Calidad sobre cantidad siempre.", "vid": "g_BYB0R-4Ws"}, "Push-up en barra": {"steps": ["Pon la barra en el piso. Agárrala al ancho de los hombros. El cuerpo recto de cabeza a talones.", "Baja el pecho hasta casi tocar la barra. Codos a 45° — ni pegados ni completamente abiertos.", "Empuja hasta estirar los brazos. Glúteos y abdomen apretados durante toda la rep."], "tip": "Ventaja de la barra: el agarre neutro pone la muñeca en posición más natural que el piso, permite bajar más y trabajar mejor el pecho.", "vid": "IODxDxX7oi4"}, "Push-up diamante": {"steps": ["Posición de push-up. Junta las manos en el centro del pecho formando un diamante con los dedos.", "Baja el pecho hacia las manos. Los codos van hacia atrás, no hacia los lados.", "Empuja hacia arriba apretando los tríceps al final."], "tip": "Si no llegas al piso: empieza con las manos en la barra — un poco más alto, más fácil, mientras ganas fuerza en los tríceps.", "vid": "PPTj-MW2tcs"}, "Push-up arquero": {"steps": ["Push-up con las manos más anchas que normal. Extiende un brazo completamente hacia el lado.", "Baja el pecho hacia el lado del brazo doblado. El brazo extendido se estira más.", "Sube y alterna el lado. 6 reps por cada lado."], "tip": "Si es muy difícil: no extiendas el brazo completamente. Empieza a 45° y ve aumentando semana a semana.", "vid": "mzr0RYNDzzI"}, "Pike push-up": {"steps": ["Posición de push-up, luego sube la cadera formando una V invertida.", "Baja la cabeza entre las manos doblando los codos.", "Sube empujando hasta volver a la V. Cuanto más vertical el cuerpo, más difícil."], "tip": "Por qué importa: hombros fuertes = pull-ups más seguras a largo plazo.", "vid": "eG20L9cl81w"}, "Plank": {"steps": ["Apoya los antebrazos en el piso, codo debajo del hombro. Cuerpo completamente recto.", "Aprieta los glúteos y el abdomen. La cadera no sube ni baja.", "Mira al piso. Respira normal y aguanta el tiempo indicado."], "tip": "Si la cadera cae antes de los 30s: descansa unos segundos y sube de nuevo. Dos partes bien hechas son mejor que 30s mal.", "vid": "pSHjTRCQxIw"}, "Mountain climber": {"steps": ["Posición de push-up con los brazos estirados.", "Jala una rodilla al pecho rápido. Vuelve y jala la otra. 20 reps = 10 por lado.", "Las caderas no suben ni bajan durante todo el movimiento."], "tip": "Ritmo: empieza lento hasta que la posición sea sólida, luego acelera. Constante quema más que rápido y desordenado.", "vid": "nmwgirgXLYM"}, "Wide pull-up + banda roja": {"steps": ["Cuelga la banda roja de la barra: pasa un extremo por el otro y jala hasta que quede firme.", "Agarra la barra en agarre wide. Pon una rodilla dentro del lazo inferior de la banda.", "Haz el pull-up exactamente igual que sin banda. La banda ayuda pero no cambia el movimiento.", "Controla la bajada igual — no te dejes caer aunque la banda asista."], "tip": "Objetivo del día 3: 8-10 reps con la banda roja. Si bajas de 6 reps en alguna serie, usa la banda azul esa semana.", "vid": ""}, "Remo con banda": {"steps": ["Ancla la banda a la barra arriba del marco de la puerta — pásala por el centro y haz un nudo firme.", "Agarra los dos extremos de la banda con los brazos extendidos. Da un paso atrás y recuéstate hacia atrás unos 45°, como si fueras a hacer un inverted row pero de pie.", "Jala los codos hacia las caderas apretando los omóplatos. El pecho sube hacia la barra.", "Vuelve lento controlando la tensión. Eso es una rep.", "Cuanto más te inclinas hacia atrás, más difícil. Empieza a 45° y ve aumentando la inclinación."], "tip": "empieza con la roja o naranja. Si es muy fácil con 12 reps, combina dos bandas o inclínate más. El objetivo es que las últimas 3 reps de cada serie cuesten.", "vid": ""}, "Negativas lentas": {"steps": ["Salta o usa una silla para llegar al punto más alto — mentón sobre la barra.", "Quita los pies y baja lo más lento que puedas. Cuenta en voz alta: uno… dos… tres… cuatro.", "Cuando llegues abajo, vuelve a saltar arriba. Meta: 4-6 segundos por bajada."], "tip": "Por qué funciona: bajar controlado trabaja el músculo más intensamente que subir. Es la forma más rápida de ganar fuerza en pull-ups.", "vid": "A5q4qiSc_Aw"}, "Face pull + curl con banda amarilla": {"steps": ["Face pull: ata la banda amarilla a la barra a la altura de la cara. Da un paso atrás. Jala hacia tu cara con codos altos en Y. Vuelve lento. 3 × 15.", "Curl: pisa la banda con un pie. Brazos pegados al cuerpo. Sube las manos hacia los hombros. Baja controlado. 3 × 15."], "tip": "No saltarse el face pull: hacer muchas dominadas sin trabajar los rotadores externos termina en lesión de hombro. 3 series, siempre.", "vid": ""}, "Wide pull-up — Test semanal": {"steps": ["La primera serie es tu número oficial — cuando estás más fresco. Registra ese número en el Tracker.", "Misma técnica del Día 1: agarre wide, palmas afuera, hombros abajo.", "Ve al máximo absoluto limpio en la primera serie. Ese es tu número semanal.", "Las series 2 y 3 también al máximo pero sin presión de marca.", "Al terminar el entrenamiento, abre el Tracker y registra."], "tip": "Qué registrar: la primera serie del Día 4, cuando estás más fresco. No el promedio, no la última serie. Siempre la primera.", "vid": ""}, "Burpee": {"steps": ["De pie. Baja las manos al piso al lado de los pies.", "Salta los pies hacia atrás — posición de push-up.", "Baja el pecho al piso (push-up completo).", "Sube, salta los pies hacia adelante y salta con los brazos arriba. Eso es una rep."], "tip": "Ritmo: no tiene que ser rápido — tiene que ser continuo. Sin pausas entre reps.", "vid": "auBLPXO8Fww"}, "Jump squat": {"steps": ["Pies al ancho de los hombros. Baja en squat hasta muslos paralelos al piso.", "Explota hacia arriba saltando lo más alto que puedas.", "Aterriza suave con rodillas ligeramente dobladas. Baja directo al siguiente squat."], "tip": "Si las rodillas duelen: asegúrate que no vayan hacia adentro al bajar ni al aterrizar. Si persiste, haz squat normal sin salto.", "vid": "A-cFYWvaHr0"}, "V-up": {"steps": ["Acuéstate boca arriba con brazos y piernas estirados.", "Al mismo tiempo: sube los brazos y las piernas formando una V. Intenta tocar los pies.", "Baja controlado sin dejar caer ni brazos ni piernas."], "tip": "Si es muy difícil: haz sit-ups y leg raises por separado hasta tener la fuerza de core para el V-up completo.", "vid": "7UVgs18Y1P4"}, "Plank lateral": {"steps": ["Acuéstate de lado. Apoya el antebrazo en el piso, codo debajo del hombro.", "Sube la cadera del piso — el cuerpo forma una línea recta de cabeza a pies.", "Aprieta abdomen y glúteo de arriba. Aguanta 20 segundos. Descansa y haz el otro lado."], "tip": "Si la cadera cae: descansa unos segundos y sube de nuevo. En partes bien hechas es mejor que el tiempo completo mal.", "vid": "_rdfjFSFKMY"}, "Wide pull-up — TEST ⭐": {"steps": ["Agarra la barra más ancha que tus hombros. Las palmas miran hacia afuera — lejos de tu cara.", "Antes de subir, baja los hombros lejos de las orejas. Imagina meterte los omóplatos en los bolsillos traseros del pantalón.", "Jala los codos hacia abajo y hacia tus caderas. Sube hasta que el mentón pase la barra.", "Baja contando \"uno, dos\". No te dejes caer — controla el descenso siempre.", "Si el cuerpo balancea, aprieta glúteos y abdomen durante todo el movimiento."], "tip": "Error más común: los hombros suben hacia las orejas al subir. Cuando pasa, solo trabajan los trapecios, no la espalda. Mantén los hombros abajo en todo momento.", "vid": ""}, "Narrow pull-up + banda roja": {"steps": ["Agarra los mangos paralelos de tu barra — los que apuntan hacia ti. Las palmas se miran entre sí.", "Cuelga con los brazos completamente estirados.", "Sube jalando los codos hacia tus costillas. Piensa en \"llevar los codos al piso\".", "Sube hasta que el pecho quede a la altura de los mangos. Baja en 2 segundos."], "tip": "Por qué lo haces después del wide: es más amigable con los hombros y codos — perfecto cuando ya están cansados del wide pull-up.", "vid": "Ai4S1uzMP7A"}, "Curl bíceps + banda amarilla": {"steps": ["Face pull: ata la banda amarilla a la barra a la altura de la cara. Da un paso atrás. Jala hacia tu cara con codos altos en Y. Vuelve lento. 3 × 15.", "Curl: pisa la banda con un pie. Brazos pegados al cuerpo. Sube las manos hacia los hombros. Baja controlado. 3 × 15."], "tip": "No saltarse el face pull: hacer muchas dominadas sin trabajar los rotadores externos termina en lesión de hombro. 3 series, siempre.", "vid": ""}, "Push-up explosivo": {"steps": ["Posición de push-up normal.", "Baja el pecho al piso.", "Empuja con fuerza explosiva hasta que las manos despeguen del suelo.", "Aterriza suave con codos ligeramente doblados."], "tip": "No pierdas la forma — cuerpo recto en todo momento.", "vid": ""}, "Wall slide": {"steps": ["Párate con la espalda completamente pegada a la pared — cabeza, hombros, espalda baja y glúteos tocando.", "Sube los brazos en forma de W: codos a 90°, pegados a la pared, manos a altura de la cabeza.", "Desliza los brazos hacia arriba hasta formar una Y, manteniendo codos y muñecas pegados todo el tiempo.", "Vuelve lento a la W. Si algo se despega, reduce el rango."], "tip": "Activa el serrato anterior y el trapecio inferior — los músculos que protegen el hombro durante las dominadas.", "vid": ""}, "Reverse crunch": {"steps": ["Acuéstate boca arriba, manos a los lados o bajo los glúteos. Piernas dobladas a 90°, muslos verticales.", "Pega la espalda baja al piso y no la despegues.", "Usando el abdomen, sube las caderas del piso llevando las rodillas al pecho.", "Baja lento controlando. No dejes caer las piernas."], "tip": "Mueves las caderas hacia el pecho, no el pecho hacia las caderas. Es el core inferior que las dominadas necesitan.", "vid": ""}};
var WARMUP_DATA = [{"name": "Círculos de brazos", "reps": "15 hacia adelante + 15 hacia atrás", "steps": ["Párate derecho con los brazos extendidos a los lados, a la altura de los hombros.", "Haz círculos pequeños hacia adelante durante 15 repeticiones. Mantén los brazos rectos.", "Ahora invierte la dirección: 15 círculos hacia atrás.", "Termina con 5 círculos grandes en cada dirección para calentar bien el hombro."], "tip": "Empieza con círculos pequeños y ve agrandándolos. Si sientes tensión, es señal de que necesitabas este calentamiento.", "vid": ""}, {"name": "Rotaciones de hombro y apertura de pecho", "reps": "10 repeticiones lentas", "steps": ["Párate frente a la puerta con los brazos en cruz, codos a 90°.", "Abre los brazos hacia atrás lentamente hasta sentir el pecho abrirse. Aguanta 2 segundos.", "Cierra volviendo al frente. Eso es 1 rep.", "Mantén los hombros bajos — no los encorves hacia las orejas."], "tip": "Este movimiento activa los músculos entre los omóplatos que protegen el hombro durante las dominadas.", "vid": ""}, {"name": "Dead hang (colgado relajado)", "reps": "20 segundos", "steps": ["Cuélgate de la barra con agarre cómodo al ancho de los hombros.", "Relaja completamente los hombros — deja que la gravedad los jale hacia abajo.", "Respira profundo y siente cómo se estira toda la espalda y el espacio entre vértebras.", "Aguanta 20 segundos. Si llegas fácil, intenta 30."], "tip": "Es el momento de relajarse y preparar la mente. No hagas fuerza — deja que el peso del cuerpo haga el trabajo.", "vid": ""}, {"name": "Superman", "reps": "10 repeticiones lentas", "steps": ["Acuéstate boca abajo con los brazos estirados al frente (como Superman volando) y las piernas rectas.", "Lentamente levanta los brazos, pecho y piernas al mismo tiempo, despegando todo lo que puedas del piso.", "Aprieta los glúteos y la espalda en la parte más alta. Aguanta 2 segundos.", "Baja despacio controlando el movimiento. Eso es 1 rep."], "tip": "No es un movimiento explosivo — sube lento y siente cómo trabaja toda la cadena posterior. Si sientes dolor en la zona lumbar, reduce el rango de movimiento.", "vid": ""}];

var DAYS = {
  1: {
    name: 'Tirón vertical',
    warmup: true,
    exercises: [
      { name:'Wide pull-up', sets:4, reps:'max', type:'max', rest:90, restType:'pull', isometric:false },
      { name:'Neutral pull-up', sets:3, reps:'max', type:'max', rest:90, restType:'pull', isometric:false },
      { name:'Chin-up supino', sets:3, reps:'max', type:'max', rest:90, restType:'pull', isometric:false },
      { name:'Wall slide', sets:3, reps:10, type:'reps', rest:45, restType:'core', isometric:false },
      { name:'Dead bug', sets:3, reps:'8/lado', type:'reps_side', rest:45, restType:'core', isometric:false },
      { name:'Reverse crunch', sets:3, reps:12, type:'reps', rest:45, restType:'core', isometric:false }
    ]
  },
  2: {
    name: 'Empuje + core',
    warmup: false,
    exercises: [
      { name:'Push-up en barra', sets:4, reps:'max', type:'max', rest:60, restType:'push', isometric:false },
      { name:'Push-up diamante', sets:3, reps:10, type:'reps', rest:60, restType:'push', isometric:false },
      { name:'Push-up arquero', sets:3, reps:'6/lado', type:'reps_side', rest:60, restType:'push', isometric:false },
      { name:'Pike push-up', sets:3, reps:10, type:'reps', rest:60, restType:'push', isometric:false },
      { name:'Plank', sets:3, reps:30, type:'time', rest:45, restType:'core', isometric:true },
      { name:'Mountain climber', sets:3, reps:20, type:'reps', rest:45, restType:'core', isometric:false }
    ]
  },
  3: {
    name: 'Tirón + volumen',
    warmup: true,
    exercises: [
      { name:'Wide pull-up + banda roja', sets:4, reps:'8-10', type:'reps', rest:90, restType:'pull', isometric:false },
      { name:'Remo con banda', sets:4, reps:12, type:'reps', rest:90, restType:'pull', isometric:false },
      { name:'Narrow pull-up + banda roja', sets:3, reps:8, type:'reps', rest:90, restType:'pull', isometric:false },
      { name:'Negativas lentas', sets:3, reps:5, type:'reps', rest:90, restType:'pull', isometric:false },
      { name:'Curl bíceps + banda amarilla', sets:3, reps:15, type:'reps', rest:60, restType:'push', isometric:false },
      { name:'Sit-up con pies en barra', sets:3, reps:15, type:'reps', rest:45, restType:'core', isometric:false }
    ]
  },
  4: {
    name: 'Full body + Test ⭐',
    warmup: true,
    exercises: [
      { name:'Wide pull-up — TEST ⭐', sets:3, reps:'max', type:'max', rest:90, restType:'pull', isometric:false },
      { name:'Push-up explosivo', sets:3, reps:8, type:'reps', rest:60, restType:'push', isometric:false },
      { name:'Burpee', sets:4, reps:10, type:'reps', rest:60, restType:'push', isometric:false },
      { name:'Jump squat', sets:4, reps:12, type:'reps', rest:60, restType:'push', isometric:false },
      { name:'V-up', sets:3, reps:12, type:'reps', rest:45, restType:'core', isometric:false },
      { name:'Plank lateral', sets:3, reps:'20s/lado', type:'time', rest:45, restType:'core', isometric:true, timeVal:20 }
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION — 5 main tabs with sub-navigation
// ═══════════════════════════════════════════════════════════════════
var NAV_MAP = {
  entrenar: { pages: ['hoy'], labels: null },
  guia:     { pages: ['programa','ejercicios','bandas'], labels: ['Rutina','Ejercicios','Bandas'] },
  progreso: { pages: ['progresion','peso','tracker'], labels: ['Progresión','Peso','Tracker'] },
  logros:   { pages: ['logros'], labels: null },
  ajustes:  { pages: ['ajustes'], labels: null }
};
var CURRENT_MAIN = 'entrenar';
var CURRENT_PAGE = 'hoy';

function goMain(mainId, btn) {
  CURRENT_MAIN = mainId;
  var group = NAV_MAP[mainId];
  if (!group) return;
  // Update main nav
  document.querySelectorAll('.nb').forEach(function(b) { b.classList.remove('on'); });
  if (btn) btn.classList.add('on');
  // Show sub-nav if group has multiple pages
  var subNav = document.getElementById('sub-nav');
  var subInner = document.getElementById('sub-nav-inner');
  if (group.labels && group.labels.length > 1) {
    subNav.style.display = 'block';
    var html = '';
    group.pages.forEach(function(pageId, i) {
      var isActive = (i === 0 && !group._lastSub) || group._lastSub === pageId;
      html += '<button type="button" class="snb' + (isActive ? ' on' : '') + '" onclick="goSub(\''+pageId+'\',this)">' + group.labels[i] + '</button>';
    });
    subInner.innerHTML = html;
    // Go to last visited sub-page or first
    go(group._lastSub || group.pages[0]);
  } else {
    subNav.style.display = 'none';
    go(group.pages[0]);
  }
}

function goSub(pageId, btn) {
  // Update sub-nav active state
  document.querySelectorAll('.snb').forEach(function(b) { b.classList.remove('on'); });
  if (btn) btn.classList.add('on');
  // Remember last sub-page for this group
  NAV_MAP[CURRENT_MAIN]._lastSub = pageId;
  go(pageId);
}

function go(id) {
  CURRENT_PAGE = id;
  document.querySelectorAll('.pg').forEach(function(p) { p.classList.remove('on'); });
  var page = document.getElementById(id);
  if (page) page.classList.add('on');
  window.scrollTo({ top:0, behavior:'smooth' });
  // Show timer only on Hoy tab
  var timerBar = document.getElementById('timerBar');
  if (timerBar) timerBar.style.display = id === 'hoy' ? 'block' : 'none';
  // Refresh data when switching to relevant tabs
  if (id === 'tracker') { renderLog(); renderSessionHistory(); renderRecords(); renderTotalStats(); }
  if (id === 'progresion') { renderProgresion(); renderDynamicUI(); }
  if (id === 'logros') { renderLogros(); renderHeatmap(); }
  if (id === 'peso') { renderPeso(); renderDynamicUI(); }
  if (id === 'ajustes') { loadSettings(); }
  if (id === 'hoy') { renderHoyDate(); renderWeeklyChallenge(); }
  if (id === 'bandas' || id === 'programa') { renderDynamicUI(); }
}

function switchDay2(id, btn) {
  document.querySelectorAll('.dp').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.dg .db').forEach(b => b.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  btn.classList.add('on');
}

// ═══════════════════════════════════════════════════════════════════
// HOY — TRAINING MODE
// ═══════════════════════════════════════════════════════════════════
var HOY_STATE = {
  day: null, exIdx: 0, serieIdx: 0, warmupDone: false,
  seriesDone: 0, seriesTotal: 0,
  startTime: null, elapsed: 0, elapsedTimer: null,
  sessionFeeling: 3,
  completedExercises: [], // [{name, sets:[{reps,rpe}]}]
  warmupIdx: 0, inWarmup: false
};

function renderHoyDate() {
  var d = new Date();
  var days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  document.getElementById('hoy-fecha').textContent = days[d.getDay()] + ', ' + d.getDate() + ' de ' + months[d.getMonth()] + ' de ' + d.getFullYear();
  autoSelectToday();
  // Week badge
  var badge = document.getElementById('hoy-week-badge');
  if (badge) {
    var weekNum = DB.pullupLog ? DB.pullupLog.length : 1;
    badge.textContent = 'SEM ' + Math.min(weekNum, 10) + '/10';
    badge.style.background = weekNum >= 8 ? 'var(--green)' : weekNum >= 5 ? 'var(--amber)' : 'var(--blue)';
  }
}

// Map JS day (0=Sun) to training day or rest
var DAY_MAP = {
  1: 1,  // Monday → Day 1
  2: 2,  // Tuesday → Day 2
  4: 3,  // Thursday → Day 3
  6: 4   // Saturday → Day 4
  // 0=Sun, 3=Wed, 5=Fri → rest
};
var REST_NAMES = {
  0: 'Domingo — Día de descanso',
  3: 'Miércoles — Día de descanso',
  5: 'Viernes — Día de descanso'
};

function autoSelectToday() {
  var dow = new Date().getDay();
  var trainingDay = getCustomDayMap()[dow];
  var restBanner = document.getElementById('hoy-rest-banner');
  var restDayName = document.getElementById('hoy-rest-day-name');
  var grid = document.getElementById('hoy-day-grid');

  if (trainingDay) {
    // It's a training day — auto-select it
    if (restBanner) restBanner.style.display = 'none';
    if (grid) grid.style.display = 'grid';
    var btn = document.getElementById('hoy-d' + trainingDay);
    if (btn) {
      // Check if already done today
      var todayStr = localDateStr();
      var doneTodayDay = DB.sessions.find(function(s) {
        return s.date === todayStr && s.day === trainingDay;
      });
      if (doneTodayDay) {
        btn.classList.add('done');
      }
      selectHoyDay(trainingDay, btn);
    }
  } else {
    // Rest day
    if (restBanner) {
      restBanner.style.display = 'block';
      if (restDayName) restDayName.textContent = REST_NAMES[dow] || 'Día de descanso';
    }
    if (grid) grid.style.display = 'grid';
    // Still show the grid so they can manually pick another day
    document.getElementById('hoy-training').style.display = 'none';
    document.getElementById('hoy-start-panel') && (document.getElementById('hoy-start-panel').style.display = 'none');
    // Auto-check the rest day in checklist
    autoCheckRestDay(dow);
  }
}

function autoCheckRestDay(dow) {
  // If it's a rest day, auto-check the caminata checkbox
  if (dow === 3 || dow === 5 || dow === 0) {
    var ck6 = document.getElementById('ck6');
    if (ck6) ck6.checked = true;
  }
}

function selectHoyDay(dayNum, btn) {
  document.querySelectorAll('.hoy-day-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  HOY_STATE.day = dayNum;
  HOY_STATE.warmupDone = false;
  var dayData = DAYS[dayNum];
  // Hide training, show start panel
  document.getElementById('hoy-training').style.display = 'none';
  document.getElementById('session-summary').classList.remove('show');
  document.getElementById('hoy-msg').style.display = 'none';
  // Show start panel
  var startPanel = document.getElementById('hoy-start-panel');
  if (startPanel) {
    startPanel.style.display = 'block';
    document.getElementById('hoy-start-day-name').textContent = 'Día ' + dayNum + ' — ' + dayData.name;
    var exCount = dayData.exercises.length;
    var setCount = dayData.exercises.reduce(function(a,e){return a+e.sets;},0);
    document.getElementById('hoy-start-info').textContent = exCount + ' ejercicios · ' + setCount + ' series';
    // Show warmup requirement
    var warmupReq = document.getElementById('hoy-warmup-req');
    var bandEl=document.getElementById('band-suggestion');
    if(bandEl){if(dayNum===3){renderBandSuggestion();}else{bandEl.style.display='none';}}
    if (dayData.warmup) {
      warmupReq.style.display = 'block';
    } else {
      warmupReq.style.display = 'none';
      document.getElementById('start-train-btn').disabled = false;
      document.getElementById('start-train-btn').classList.remove('disabled-btn');
    }
  }
}

function startTraining() {
  if (!HOY_STATE.day) return;
  var dayData = DAYS[HOY_STATE.day];
  if (dayData.warmup && !HOY_STATE.warmupDone) {
    showToast('Primero completa el calentamiento', '⚠️', 3500);
    return;
  }
  document.getElementById('hoy-start-panel').style.display = 'none';
  buildTrainingList(HOY_STATE.day);
  document.getElementById('hoy-training').style.display = 'block';
  document.getElementById('session-summary').classList.remove('show');
  HOY_STATE.startTime = Date.now();
  HOY_STATE.elapsed = 0;
  if (HOY_STATE.elapsedTimer) clearInterval(HOY_STATE.elapsedTimer);
  HOY_STATE.elapsedTimer = setInterval(function() {
    HOY_STATE.elapsed = Math.floor((Date.now() - HOY_STATE.startTime) / 1000);
    var m = Math.floor(HOY_STATE.elapsed/60), s = HOY_STATE.elapsed%60;
    var el = document.getElementById('hoy-elapsed');
    if (el) el.textContent = m + ':' + (s<10?'0':'') + s;
  }, 1000);
  if (DB.settings.wakelock) requestWakeLock();
  showMotivacional(HOY_STATE.day, 0);
}

function buildTrainingList(dayNum) {
  var dayData = DAYS[dayNum];
  var exercises = dayData.exercises;
  HOY_STATE.seriesTotal = exercises.reduce(function(a,e){return a+e.sets;},0);
  HOY_STATE.seriesDone = 0;
  HOY_STATE.completedExercises = exercises.map(function(ex){ return {name:ex.name,sets:[]}; });
  document.getElementById('hoy-series-total').textContent = HOY_STATE.seriesTotal;
  document.getElementById('hoy-series-done').innerHTML = '0/<span id="hoy-series-total">' + HOY_STATE.seriesTotal + '</span>';
  document.getElementById('hoy-current-ex').textContent = exercises[0].name;
  document.getElementById('finish-btn').style.display = 'none';

  var html = '';
  exercises.forEach(function(ex, idx) {
    var repsLabel = ex.type === 'time' ? ex.reps + 's' : ex.type === 'max' ? 'Al máximo' : ex.reps + (ex.type==='reps_side'?' por lado':' reps');
    var restLabel = ex.isometric ? ex.reps+'s' : ex.restType==='pull'?'90s':ex.restType==='push'?'60s':'45s';
    var isActive = idx === 0;
    var statusClass = isActive ? 'ex-status-active' : 'ex-status-pending';
    var statusIcon = isActive ? '▶' : '○';
    var cardClass = isActive ? 'training-ex active-ex' : 'training-ex';

    // Series badges
    var badgesHTML = '';
    for (var s = 0; s < ex.sets; s++) {
      var bCls = (s===0 && isActive) ? 'serie-badge current' : 'serie-badge';
      badgesHTML += '<div class="' + bCls + '" id="badge-' + idx + '-' + s + '">' + (s+1) + '</div>';
    }

    html += '<div class="' + cardClass + '" id="trex-' + idx + '">';
    // Header row — always visible
    html += '<div class="training-ex-header" onclick="toggleTrainingEx(' + idx + ')">';
    html += '<div class="ex-status-icon ' + statusClass + '" id="ex-icon-' + idx + '">' + statusIcon + '</div>';
    html += '<div class="ex-info">';
    html += '<div class="ex-info-name">' + ex.name + '</div>';
    html += '<div class="ex-info-reps">' + ex.sets + ' × ' + repsLabel + ' · ' + restLabel + ' descanso</div>';
    html += '</div>';
    html += '<div class="ex-series-badges">' + badgesHTML + '</div>';
    html += '</div>';

    // Expandable body — instructions + current series action
    var bodyClass = isActive ? 'training-ex-body open' : 'training-ex-body';
    html += '<div class="' + bodyClass + '" id="trex-body-' + idx + '">';

    // Current serie action area
    html += '<div id="serie-action-' + idx + '" style="padding:12px 0;border-bottom:1px solid var(--border)">';
    html += buildSerieAction(ex, idx, 0);
    html += '</div>';

    // Instructions section
    html += '<div style="margin-top:10px">';
    html += '<button type="button" class="mini-tab" id="instr-btn-' + idx + '" onclick="toggleInstructions(' + idx + ',this)" style="background:var(--s2);border:1px solid var(--border);border-radius:var(--rs);padding:5px 12px;font-size:12px;font-weight:500;color:var(--ink2);cursor:pointer">📝 Instrucciones</button>';
    html += '<div id="instr-panel-' + idx + '" style="display:none;margin-top:10px">';
    html += getInstructionsHTML(ex.name);
    html += '</div>';
    html += '</div>';

    html += '</div>'; // end trex-body
    html += '</div>'; // end training-ex
  });

  document.getElementById('training-list').innerHTML = html;
  HOY_STATE.exIdx = 0;
  HOY_STATE.serieIdx = 0;
}

function buildSerieAction(ex, exIdx, serieIdx) {
  if (serieIdx >= ex.sets) return '';
  var html = '';
  html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
  html += '<span style="font-size:13px;font-weight:600;color:var(--ink)">Serie ' + (serieIdx+1) + ' de ' + ex.sets + '</span>';
  if (ex.type === 'max') {
    html += '<input class="serie-input" type="number" placeholder="reps" min="0" max="50" id="cur-reps-' + exIdx + '" style="width:80px">';
  } else {
    html += '<span style="font-size:13px;color:var(--ink2);background:var(--s2);padding:4px 10px;border-radius:var(--rs)">' + (ex.type==='time'?ex.reps+'s':ex.reps+(ex.type==='reps_side'?' por lado':' reps')) + '</span>';
  }

  // If isometric, auto-timer button
  if (ex.isometric || ex.type === 'time') {
    var timeVal = typeof ex.reps === 'number' ? ex.reps : (ex.timeVal || 20);
    html += '<button type="button" class="btn btn-ghost btn-sm" onclick="startTimer(' + timeVal + ')" style="margin-left:auto">⏱ ' + timeVal + 's</button>';
  }
  html += '</div>';
  html += '<button type="button" class="serie-done-btn" id="sdone-' + exIdx + '-' + serieIdx + '" onclick="completeSerie(' + exIdx + ',' + serieIdx + ')" style="margin-top:10px;width:100%">✓ Serie ' + (serieIdx+1) + ' completada</button>';
  return html;
}

function getInstructionsHTML(exName) {
  // Map training names to data keys
  var aliases = {
    'Wide pull-up — TEST ⭐': 'Wide pull-up',
    'Narrow pull-up + banda roja': 'Neutral pull-up',
    'Wide pull-up + banda roja': 'Wide pull-up + banda roja',
    'Curl bíceps + banda amarilla': 'Face pull + curl con banda amarilla',
  };
  var key = aliases[exName] || exName;
  var data = EX_DATA[key];
  if (!data || !data.steps || data.steps.length === 0) {
    return '<div style="font-size:13px;color:var(--ink3);padding:8px 0">Ve a la pestaña <strong>Ejercicios</strong> para ver el tutorial completo.</div>';
  }
  var html = '';
  if (data.vid) {
    html += '<div style="margin-bottom:10px">';
    html += '<button type="button" onclick="openVidInline(this,\'' + data.vid + '\')" style="display:inline-flex;align-items:center;gap:7px;background:#FF0000;color:#fff;border:none;border-radius:6px;padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer">';
    html += '<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.75 15.5v-7l6.5 3.5-6.5 3.5z"/></svg>';
    html += 'Ver video</button>';
    html += '<div id="inline-vid-PLACEHOLDER" style="display:none;position:relative;padding-bottom:56.25%;margin-top:8px;border-radius:8px;overflow:hidden"><iframe style="position:absolute;inset:0;width:100%;height:100%;border:none" allowfullscreen allow="autoplay;encrypted-media"></iframe></div>';
    html += '</div>';
  }
  html += '<ol style="list-style:none;padding:0;margin:0">';
  data.steps.forEach(function(step, i) {
    html += '<li style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--ink2);align-items:flex-start">';
    html += '<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--blue);color:#fff;font-size:11px;font-weight:600;flex-shrink:0">' + (i+1) + '</span>';
    html += step;
    html += '</li>';
  });
  html += '</ol>';
  if (data.tip) {
    html += '<div style="background:var(--abg);border:1px solid var(--aborder);border-radius:8px;padding:9px 12px;font-size:12px;color:var(--ink2);margin-top:8px">' + data.tip + '</div>';
  }
  return html;
}

function toggleInstructions(idx, btn) {
  var panel = document.getElementById('instr-panel-' + idx);
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  btn.style.background = isOpen ? 'var(--s2)' : 'var(--bbg)';
  btn.style.color = isOpen ? 'var(--ink2)' : 'var(--blue)';
}

function openVidInline(btn, vidId) {
  var container = btn.nextElementSibling;
  if (!container) return;
  if (container.style.display !== 'none') { container.style.display = 'none'; return; }
  container.style.display = 'block';
  var iframe = container.querySelector('iframe');
  if (iframe && !iframe.src) {
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + vidId + '?autoplay=1&rel=0&modestbranding=1';
  }
}

function toggleTrainingEx(idx) {
  var body = document.getElementById('trex-body-' + idx);
  if (body) body.classList.toggle('open');
}

function completeSerie(exIdx, serieIdx) {
  var dayData = DAYS[HOY_STATE.day];
  var ex = dayData.exercises[exIdx];
  var repsInput = document.getElementById('cur-reps-' + exIdx);
  var reps = repsInput ? (parseInt(repsInput.value) || ex.reps) : ex.reps;

  // Save set data
  if (!HOY_STATE.completedExercises[exIdx].sets[serieIdx]) HOY_STATE.completedExercises[exIdx].sets[serieIdx] = {};
  HOY_STATE.completedExercises[exIdx].sets[serieIdx].reps = reps;

  // Update personal record
  if (ex.type === 'max' && typeof reps === 'number' && reps > 0) {
    var cur = DB.records[ex.name];
    if (!cur || reps > cur.value) {
      DB.records[ex.name] = { value:reps, date:localDateStr() };
      // Animate record badge
      var badge = document.getElementById('badge-' + exIdx + '-' + serieIdx);
      if (badge) { badge.classList.add('record-flash'); setTimeout(function(){ badge.classList.remove('record-flash'); }, 700); }
      showToast('¡Nuevo récord! ' + reps + ' reps 🏆', '⭐', 3500);
    }
  }

  // Mark badge as done
  var badge = document.getElementById('badge-' + exIdx + '-' + serieIdx);
  if (badge) { badge.classList.remove('current'); badge.classList.add('done'); badge.textContent = '✓'; }

  HOY_STATE.seriesDone++;
  updateHoyProgress();

  // Determine next
  var nextSerie = serieIdx + 1;
  if (nextSerie < ex.sets) {
    HOY_STATE.serieIdx = nextSerie;
    // Mark next badge current
    var nb = document.getElementById('badge-' + exIdx + '-' + nextSerie);
    if (nb) { nb.classList.add('current'); }
    // Update action area for next serie
    var actionArea = document.getElementById('serie-action-' + exIdx);
    if (actionArea) actionArea.innerHTML = buildSerieAction(ex, exIdx, nextSerie);
    // Start rest timer
    var restTime = ex.rest;
    T.restType = 'series';
    startTimer(restTime);
    schedulePrep(restTime, ex.name, nextSerie + 1);
  } else {
    // Exercise done — mark icon
    var icon = document.getElementById('ex-icon-' + exIdx);
    if (icon) { icon.className = 'ex-status-icon ex-status-done'; icon.textContent = '✓'; }
    var trex = document.getElementById('trex-' + exIdx);
    if (trex) { trex.classList.remove('active-ex'); trex.classList.add('done-ex'); }
    var body = document.getElementById('trex-body-' + exIdx);
    if (body) body.classList.remove('open');

    var nextEx = exIdx + 1;
    if (nextEx < dayData.exercises.length) {
      HOY_STATE.exIdx = nextEx;
      HOY_STATE.serieIdx = 0;
      var nextExData = dayData.exercises[nextEx];
      var nextTrex = document.getElementById('trex-' + nextEx);
      if (nextTrex) { nextTrex.classList.add('active-ex'); setTimeout(function(){ nextTrex.scrollIntoView({behavior:'smooth',block:'start'}); }, 150); }
      var nextIcon = document.getElementById('ex-icon-' + nextEx);
      if (nextIcon) { nextIcon.className = 'ex-status-icon ex-status-active'; nextIcon.textContent = '▶'; }
      var nextBody = document.getElementById('trex-body-' + nextEx);
      if (nextBody) nextBody.classList.add('open');
      document.getElementById('hoy-current-ex').textContent = nextExData.name;
      T.restType = 'between';
      startTimer(120);
      schedulePrep(120, nextExData.name, 1);
    } else {
      completeAllExercises();
    }
  }
  saveSessionDraft();
  saveDB();
}

function updateHoyProgress() {
  var pct = HOY_STATE.seriesTotal > 0 ? (HOY_STATE.seriesDone / HOY_STATE.seriesTotal * 100) : 0;
  var bar = document.getElementById('hoy-prog-bar');
  if (bar) bar.style.width = pct + '%';
  var doneEl = document.getElementById('hoy-series-done');
  if (doneEl) doneEl.innerHTML = HOY_STATE.seriesDone + '/<span id="hoy-series-total">' + HOY_STATE.seriesTotal + '</span>';
  // Show finish button after at least 1 serie (allows ending early)
  var finBtn = document.getElementById('finish-btn');
  if (finBtn) finBtn.style.display = HOY_STATE.seriesDone > 0 ? 'inline-flex' : 'none';
}

function completeAllExercises() {
  if (HOY_STATE.elapsedTimer) clearInterval(HOY_STATE.elapsedTimer);
  var elapsed = HOY_STATE.elapsed;
  var m = Math.floor(elapsed/60), s = elapsed%60;
  // Show summary
  document.getElementById('sum-series').textContent = HOY_STATE.seriesDone;
  document.getElementById('sum-time').textContent = m + ':' + (s<10?'0':'') + s;
  document.getElementById('sum-ex').textContent = DAYS[HOY_STATE.day].exercises.length;
  // Calorie estimation
  var calEst = estimateCalories(elapsed, HOY_STATE.completedExercises);
  var calEl = document.getElementById('sum-calories');
  if (calEl) calEl.textContent = calEst;
  var calLabel = document.getElementById('sum-cal-label');
  if (calLabel) calLabel.textContent = getCalorieLabel(calEst);
  document.getElementById('session-summary').classList.add('show');
  document.getElementById('finish-btn').style.display = 'none';
  document.getElementById('hoy-prog-bar').style.width = '100%';
  document.getElementById('hoy-prog-bar').style.background = 'var(--green)';
  if (DB.settings.vibration && navigator.vibrate) navigator.vibrate([200,100,200,100,400]);
  // Auto-check the day in checklist
  var ckMap = { 1:'ck1', 2:'ck2', 3:'ck3', 4:'ck4' };
  var ck = document.getElementById(ckMap[HOY_STATE.day]);
  if (ck) ck.checked = true;
  // If Day 4, also check the test registered checkbox reminder
  if (HOY_STATE.day === 4) {
    // Highlight test checkbox
    var ck5 = document.getElementById('ck5');
    if (ck5) ck5.style.outline = '2px solid var(--amber)';
  }
  saveChecklistState();
  // Update total training time
  DB.totalTrainingTime = (DB.totalTrainingTime || 0) + elapsed;
  // Update streak
  updateStreak();
  saveDB();
}

function setFeeling(val, btn) {
  HOY_STATE.sessionFeeling = val;
  document.querySelectorAll('.feeling-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}

function saveSession() {
  // Prevent saving empty sessions
  if (HOY_STATE.seriesDone === 0) {
    showToast('No hay series completadas para guardar', '⚠️');
    return;
  }
  clearSessionDraft();
  var notes = document.getElementById('session-notes').value;
  var session = {
    date: localDateStr(),
    day: HOY_STATE.day,
    dayName: DAYS[HOY_STATE.day].name,
    exercises: HOY_STATE.completedExercises,
    duration: HOY_STATE.elapsed,
    seriesDone: HOY_STATE.seriesDone,
    feeling: HOY_STATE.sessionFeeling,
    notes: notes,
    calories: estimateCalories(HOY_STATE.elapsed, HOY_STATE.completedExercises)
  };
  DB.sessions.unshift(session);
  if (DB.sessions.length > 100) DB.sessions = DB.sessions.slice(0,100);
  saveDB();
  checkAchievements();
  showToast('¡Sesión guardada!', '💪');
}

function resetHoy() {
  clearSessionDraft();
  HOY_STATE.day = null;
  if (HOY_STATE.elapsedTimer) clearInterval(HOY_STATE.elapsedTimer);
  document.querySelectorAll('.hoy-day-btn').forEach(b => { b.classList.remove('active','done'); });
  document.getElementById('hoy-training').style.display = 'none';
  var warmupStrip = document.getElementById('warmup-mode');
  if (warmupStrip) warmupStrip.style.display = 'none';
  document.getElementById('session-summary').classList.remove('show');
  document.getElementById('session-notes').value = '';
  document.getElementById('hoy-elapsed').textContent = '0:00';
  document.getElementById('hoy-prog-bar').style.width = '0%';
  document.getElementById('hoy-prog-bar').style.background = 'var(--blue)';
  // Clear all pending timers
  if (T.prepTimer) { clearTimeout(T.prepTimer); T.prepTimer = null; }
  if (prepCountInterval) { clearInterval(prepCountInterval); prepCountInterval = null; }
  var overlay = document.getElementById('prepOverlay');
  if (overlay) overlay.classList.remove('show');
  releaseWakeLock();
}

function showMotivacional(dayNum, exIdx) {
  var msgs = [
    'Cada rep te acerca a tu meta. <strong>Tú puedes.</strong>',
    'Los músculos se construyen en el descanso, no en el gym. <strong>Descansa bien esta noche.</strong>',
    'No hay atajos. Solo trabajo consistente. <strong>Y tú lo estás haciendo.</strong>',
    'Hace semanas no podías hacer ni una. <strong>Mira hasta dónde has llegado.</strong>',
    'El dolor de hoy es la fuerza de mañana.',
    'Cada vez que terminas esto, eres un poco más fuerte.',
    'El entrenamiento más difícil es el que decides empezar.',
  ];
  var msg = msgs[Math.floor(Math.random() * msgs.length)];
  var el = document.getElementById('hoy-msg');
  if (el) { el.innerHTML = sanitize(msg).replace(/&lt;strong&gt;/g,'<strong>').replace(/&lt;\/strong&gt;/g,'</strong>'); el.style.display = 'block'; }
}

// ── WARMUP ──────────────────────────────────────────────────────────
function startWarmup() {
  HOY_STATE.warmupIdx = 0;
  document.getElementById('hoy-start-panel').style.display = 'none';
  document.getElementById('warmup-mode').style.display = 'block';
  renderWarmupStep(0);
}

function renderWarmupStep(idx) {
  var steps = WARMUP_DATA;
  var total = steps.length;
  var step = steps[idx];
  // Progress
  var pct = (idx / total) * 100;
  var pb = document.getElementById('warmup-prog-bar');
  if (pb) pb.style.width = pct + '%';
  var lbl = document.getElementById('warmup-progress-label');
  if (lbl) lbl.textContent = (idx+1) + ' / ' + total;
  // Content
  var el = document.getElementById('warmup-step-content');
  if (!el) return;
  var isLast = idx === total - 1;
  var html = '';
  html += '<div style="font-size:18px;font-weight:700;color:var(--ink);margin-bottom:4px">' + step.name + '</div>';
  html += '<div style="font-size:14px;color:var(--amber);font-weight:500;margin-bottom:12px">' + step.reps + '</div>';
  html += '<ol style="list-style:none;padding:0;margin:0 0 14px">';
  step.steps.forEach(function(s, i) {
    html += '<li style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--ink2)">';
    html += '<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--amber);color:#fff;font-size:11px;font-weight:600;flex-shrink:0">' + (i+1) + '</span>';
    html += s + '</li>';
  });
  html += '</ol>';
  if (step.tip) {
    html += '<div style="background:var(--abg);border:1px solid var(--aborder);border-radius:8px;padding:9px 12px;font-size:12px;color:var(--ink2)">💡 ' + step.tip + '</div>';
  }
  // Timer for timed steps
  if (step.reps.includes('segundo')) {
    var sec = 30;
    html += '<button type="button" class="btn btn-ghost btn-sm" onclick="startTimer(' + sec + ')" style="margin-top:10px">⏱ Iniciar ' + sec + 's</button>';
  }
  el.innerHTML = html;
  // Update next button
  var nextBtn = document.getElementById('warmup-next-btn');
  if (nextBtn) nextBtn.textContent = isLast ? '✓ Terminar calentamiento' : 'Siguiente →';
}

function nextWarmupStep() {
  var total = WARMUP_DATA.length;
  HOY_STATE.warmupIdx++;
  if (HOY_STATE.warmupIdx >= total) {
    // Done
    document.getElementById('warmup-mode').style.display = 'none';
    HOY_STATE.warmupDone = true;
    // Show start panel again with warmup done
    document.getElementById('hoy-start-panel').style.display = 'block';
    var badge = document.getElementById('warmup-done-badge');
    if (badge) badge.style.display = 'flex';
    var startBtn = document.getElementById('start-train-btn');
    if (startBtn) { startBtn.disabled = false; startBtn.classList.remove('disabled-btn'); }
    // Update progress bar to full
    var pb = document.getElementById('warmup-prog-bar');
    if (pb) pb.style.width = '100%';
  } else {
    renderWarmupStep(HOY_STATE.warmupIdx);
  }
}

async function confirmSkipWarmup() {
  var ok = await modalConfirm('Saltar calentamiento', 'Saltarse el calentamiento aumenta el riesgo de lesiones en los hombros.', '🤔');
  if (ok) {
    document.getElementById('warmup-mode').style.display = 'none';
    HOY_STATE.warmupDone = true;
    document.getElementById('hoy-start-panel').style.display = 'block';
    var startBtn = document.getElementById('start-train-btn');
    if (startBtn) { startBtn.disabled = false; startBtn.classList.remove('disabled-btn'); }
  }
}

// ═══════════════════════════════════════════════════════════════════
// MISSING FUNCTION STUBS (called from HTML)
// ═══════════════════════════════════════════════════════════════════
function openYT(containerId, query) {
  window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), '_blank');
}

async function finishSession() {
  var ok = await modalConfirm('Terminar entrenamiento', '¿Seguro que quieres terminar ahora? Se guardarán las series completadas.', '🏁');
  if (ok) completeAllExercises();
}

// ═══════════════════════════════════════════════════════════════════
// EXERCISE ACCORDION
// ═══════════════════════════════════════════════════════════════════
function toggleE(trig) {
  var body = trig.nextElementSibling, chev = trig.querySelector('.echev');
  var open = body.classList.contains('on');
  body.classList.toggle('on', !open);
  chev.classList.toggle('on', !open);
}
function playV(wid, vid) {
  var w = document.getElementById(wid);
  if (!w) return;
  w.querySelector('.vthumb').style.display = 'none';
  w.querySelector('.vover').style.display = 'none';
  var h = w.querySelector('.vhint'); if (h) h.style.display = 'none';
  var f = w.querySelector('.vframe'); f.style.display = 'block';
  f.querySelector('iframe').src = 'https://www.youtube-nocookie.com/embed/' + vid + '?autoplay=1&rel=0&modestbranding=1';
}

// ═══════════════════════════════════════════════════════════════════
// STICKY REST TIMER
// ═══════════════════════════════════════════════════════════════════
var T = { interval:null, total:0, remaining:0, running:false, prepTimer:null };

function startTimer(sec) {
  clearInterval(T.interval);
  T.total = sec; T.remaining = sec; T.running = false;
  updateTimerDisplay();
  toggleTimer();
}
function toggleTimer() {
  if (T.remaining <= 0) { resetTimer(); return; }
  T.running = !T.running;
  var btn = document.getElementById('timerPlayBtn');
  if (T.running) {
    if (btn) btn.textContent = '⏸';
    T.interval = setInterval(tickTimer, 1000);
  } else {
    if (btn) btn.textContent = '▶';
    clearInterval(T.interval);
  }
}
function tickTimer() {
  if (T.remaining > 0) { T.remaining--; updateTimerDisplay(); }
  if (DB.settings.sound && T.remaining > 0 && T.remaining <= 3) { playCountdownBeep(); }
  if (T.remaining <= 0) {
    clearInterval(T.interval);
    T.running = false;
    var btn = document.getElementById('timerPlayBtn');
    if (btn) btn.textContent = '▶';
    if (DB.settings.sound) playTimerSound();
    if (DB.settings.vibration && navigator.vibrate) navigator.vibrate([200,100,200]);
    document.getElementById('timerDisplay').className = 'timer-display done';
    var fill = document.getElementById('timerProgFill');
    if (fill) { fill.className = 'timer-prog-fill done'; }
  }
}
function updateTimerDisplay() {
  var m = Math.floor(T.remaining/60), s = T.remaining%60;
  var disp = document.getElementById('timerDisplay');
  var fill = document.getElementById('timerProgFill');
  if (!disp) return;
  disp.textContent = m + ':' + (s<10?'0':'') + s;
  var lbl=document.getElementById('timer-label-text'); if(lbl&&T.running) lbl.textContent=T.restType==='between'?'Entre ejercicios':'Descanso';
  var pct = T.total > 0 ? (T.remaining/T.total*100) : 100;
  if (fill) fill.style.width = pct + '%';
  if (T.remaining <= 0) {
    disp.className = 'timer-display done';
    if (fill) fill.className = 'timer-prog-fill done';
  } else if (T.remaining <= 10) {
    disp.className = 'timer-display warning';
    if (fill) { fill.className = 'timer-prog-fill warning'; fill.style.background = 'var(--amber)'; }
  } else if (T.running) {
    disp.className = 'timer-display running';
    if (fill) fill.style.background = 'var(--blue)';
  } else {
    disp.className = 'timer-display';
  }
}
function resetTimer() {
  clearInterval(T.interval); T.running = false; T.remaining = T.total; T.restType = null;
  var btn = document.getElementById('timerPlayBtn');
  if (btn) btn.textContent = '▶';
  updateTimerDisplay();
  var disp = document.getElementById('timerDisplay');
  var fill = document.getElementById('timerProgFill');
  if (disp) disp.className = 'timer-display';
  if (fill) { fill.className = 'timer-prog-fill'; fill.style.width = '100%'; fill.style.background = 'var(--blue)'; }
  if (T.total === 0 && disp) disp.textContent = '0:00';
}

function schedulePrep(restSec, nextName, nextSerie) {
  if (T.prepTimer) clearTimeout(T.prepTimer);
  var delay = DB.settings.prepDelay || 5;
  var prepStart = (restSec - delay) * 1000;
  if (prepStart < 0) prepStart = 0;
  T.prepTimer = setTimeout(function() {
    showPrepOverlay(delay, nextName, nextSerie);
  }, prepStart * 1000);
}

var prepCountInterval = null;
function showPrepOverlay(sec, nextName, nextSerie) {
  var overlay = document.getElementById('prepOverlay');
  if (!overlay) return;
  overlay.classList.add('show');
  var count = sec;
  var nextEl = document.getElementById('prepNext');
  if (nextEl) nextEl.textContent = nextName + ' — Serie ' + nextSerie;
  var countEl = document.getElementById('prepCount');
  if (countEl) countEl.textContent = count;
  if (prepCountInterval) clearInterval(prepCountInterval);
  prepCountInterval = setInterval(function() {
    count--;
    if (countEl) countEl.textContent = count;
    if (count <= 0) {
      clearInterval(prepCountInterval);
      overlay.classList.remove('show');
    }
  }, 1000);
}

document.addEventListener('click', function(e) {
  if (e.target.id === 'prepOverlay') {
    document.getElementById('prepOverlay').classList.remove('show');
    clearInterval(prepCountInterval);
  }
});


// ═══════════════════════════════════════════════════════════════════
// TIMER SOUND OPTIONS
// ═══════════════════════════════════════════════════════════════════
var TIMER_SOUNDS = {
  beep:  { name: 'Beep clásico', freq: 1000, type: 'sine', pattern: [0, 200, 400] },
  bell:  { name: 'Campana', freq: 880, type: 'sine', pattern: [0, 300], duration: 0.4 },
  alarm: { name: 'Alarma', freq: 1200, type: 'square', pattern: [0, 150, 300, 450] },
  soft:  { name: 'Suave', freq: 660, type: 'sine', pattern: [0, 400], duration: 0.5 },
  drum:  { name: 'Tambor', freq: 150, type: 'triangle', pattern: [0, 200, 400] }
};

function playTimerSound(soundKey) {
  var sound = TIMER_SOUNDS[soundKey || DB.settings.timerSound || 'beep'];
  if (!sound) sound = TIMER_SOUNDS.beep;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6; comp.knee.value = 3; comp.ratio.value = 20;
    comp.attack.value = 0.001; comp.release.value = 0.1;
    comp.connect(ctx.destination);
    var dur = sound.duration || 0.28;
    sound.pattern.forEach(function(d) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.connect(g); g.connect(comp);
      o.type = sound.type;
      o.frequency.value = sound.freq;
      var t = ctx.currentTime + d / 1000;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1.0, t + 0.01);
      g.gain.setValueAtTime(1.0, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t); o.stop(t + dur + 0.05);
    });
  } catch(e) {}
}

function previewTimerSound(key) {
  playTimerSound(key);
}

// ── BEEP ────────────────────────────────────────────────────────────
function playBeep() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Compressor to maximize perceived loudness
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 3;
    comp.ratio.value = 20;
    comp.attack.value = 0.001;
    comp.release.value = 0.1;
    comp.connect(ctx.destination);
    // Three loud beeps
    [0, 200, 400].forEach(function(d) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.connect(g); g.connect(comp);
      o.type = 'sine';
      o.frequency.value = 1000;
      var t = ctx.currentTime + d/1000;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1.0, t + 0.01);
      g.gain.setValueAtTime(1.0, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.start(t);
      o.stop(t + 0.3);
    });
  } catch(e) {}
}

// ── WAKE LOCK ── (with iOS fallback via hidden video)
var wakeLock = null;
var noSleepVideo = null;

function createNoSleepFallback() {
  // iOS Safari doesn't support Wake Lock API — use the hidden video trick
  if (noSleepVideo) return;
  noSleepVideo = document.createElement('video');
  noSleepVideo.setAttribute('playsinline', '');
  noSleepVideo.setAttribute('muted', '');
  noSleepVideo.setAttribute('loop', '');
  noSleepVideo.style.cssText = 'position:fixed;top:-1px;left:-1px;width:1px;height:1px;opacity:0.01;pointer-events:none';
  // 1x1 transparent mp4 in base64 — tiny video that loops forever
  var src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28ybXA0MAAAAB9tZGF0AAAAFmZyZWUAAAASbWRhdAAAAA5maWxlAAAADm1vb3YAAAA=';
  noSleepVideo.src = src;
  document.body.appendChild(noSleepVideo);
}

async function requestWakeLock() {
  if (!DB.settings.wakelock) return;
  var indicator = document.getElementById('wake-lock-indicator');
  // Method 1: Wake Lock API (Chrome Android, modern browsers)
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', function() {
        wakeLock = null;
        // Re-acquire if page becomes visible again
      });
      if (indicator) indicator.textContent = '💡';
      return;
    } catch(e) {
      
    }
  }
  // Method 2: iOS Safari fallback — hidden looping video
  try {
    createNoSleepFallback();
    var playPromise = noSleepVideo.play();
    if (playPromise) {
      playPromise.then(function() {
        if (indicator) indicator.textContent = '💡';
      }).catch(function(e) {
        
        if (indicator) indicator.textContent = '📱';
      });
    }
  } catch(e) {
    
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    try { wakeLock.release(); } catch(e) {}
    wakeLock = null;
  }
  if (noSleepVideo) {
    noSleepVideo.pause();
  }
  var ind = document.getElementById('wake-lock-indicator');
  if (ind) ind.textContent = '📱';
}

function toggleWakeLock() {
  if (wakeLock || (noSleepVideo && !noSleepVideo.paused)) {
    releaseWakeLock();
  } else {
    requestWakeLock();
  }
}

// Re-acquire wake lock when page becomes visible (e.g. after switching apps)
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') {
    // App going to background — save session draft immediately
    saveSessionDraft();
    saveDBLocal();
  } else if (document.visibilityState === 'visible' && DB.settings.wakelock) {
    var isTraining = document.getElementById('hoy-training') &&
                     document.getElementById('hoy-training').style.display !== 'none';
    if (isTraining) requestWakeLock();
  }
});

// Also save on pagehide (iOS Safari close)
window.addEventListener('pagehide', function() {
  saveSessionDraft();
  saveDBLocal();
});

// ═══════════════════════════════════════════════════════════════════
// TRACKER — PULL-UP LOG
// ═══════════════════════════════════════════════════════════════════
var BL = { roja:'🟠 Roja', naranja:'🟡 Naranja', azul:'🔵 Azul', sin:'Sin banda' };

async function saveLog() {
  var sem = document.getElementById('inp-sem').value.trim();
  var pu = parseInt(document.getElementById('inp-pu').value);
  var banda = document.getElementById('inp-banda').value;
  if (!sem) { showToast('Selecciona la semana', '⚠️'); return; }
  if (isNaN(pu) || pu < 1 || pu > 100) { showToast('Ingresa un número entre 1 y 100', '⚠️'); return; }
  // Prevent duplicate week entry
  var existing = DB.pullupLog.find(function(e) { return e.sem === sem; });
  if (existing) {
    var replaceOk = await modalConfirm('Semana duplicada', 'Ya registraste ' + sem + ' con ' + existing.pu + ' pull-ups. ¿Reemplazar con ' + pu + '?', '📊');
    if (!replaceOk) return;
    // Replace existing entry
    existing.pu = pu;
    existing.banda = banda;
    var idx = DB.pullupLog.indexOf(existing);
    existing.diff = idx > 0 ? pu - DB.pullupLog[idx-1].pu : null;
    // Recalculate diffs for entries after this one
    for (var i = idx + 1; i < DB.pullupLog.length; i++) {
      DB.pullupLog[i].diff = DB.pullupLog[i].pu - DB.pullupLog[i-1].pu;
    }
    saveDB(); renderLog(); checkAchievements();
    ['inp-sem','inp-pu','inp-banda'].forEach(function(id) { document.getElementById(id).value = ''; });
    showToast(sem + ' actualizada: ' + pu + ' pull-ups', '✅');
    return;
  }
  var prev = DB.pullupLog.length > 0 ? DB.pullupLog[DB.pullupLog.length-1].pu : 0;
  DB.pullupLog.push({ sem:sem, pu:pu, banda:banda, diff: pu-prev });
  saveDB();
  renderLog();
  checkAchievements();
  ['inp-sem','inp-pu','inp-banda'].forEach(function(id) { document.getElementById(id).value = ''; });
  showToast(sem + ' registrada: ' + pu + ' pull-ups', '✅');
}

function renderLog() {
  renderWeekSummary();
  renderWeekComparison();
  updateWeekSelector();
  var best = DB.pullupLog.length > 0 ? Math.max.apply(null, DB.pullupLog.map(function(e) { return e.pu; })) : 0;
  var bestEl = document.getElementById('best-n');
  var weeksEl = document.getElementById('weeks-n');
  if (bestEl) bestEl.textContent = best;
  if (weeksEl) weeksEl.textContent = DB.pullupLog.length;
  var body = document.getElementById('log-body');
  if (!body) return;
  body.innerHTML = DB.pullupLog.map(function(e, i) {
    var d = i===0 ? '<span class="tbase">inicio</span>'
      : e.diff>0 ? '<span class="tup">+'+e.diff+'</span>'
      : e.diff<0 ? '<span class="tdn">'+e.diff+'</span>'
      : '<span class="tbase">igual</span>';
    var semSafe = sanitize(String(e.sem||''));
    var bandaSafe = e.banda ? sanitize(BL[e.banda]||e.banda) : '—';
    var puSafe = parseInt(e.pu)||0;
    var delBtn = i > 0 ? '<button type="button" onclick="deleteLogEntry('+i+')" style="background:none;border:none;color:var(--ink3);cursor:pointer;font-size:11px;padding:1px 4px;opacity:.5" title="Eliminar">✕</button>' : '';
    return '<tr><td style="font-family:JetBrains Mono,monospace;font-size:12px">'+semSafe+'</td>'
      +'<td style="font-weight:700;color:var(--ink);font-size:15px">'+puSafe+'</td>'
      +'<td>'+d+'</td>'
      +'<td style="font-size:12px">'+bandaSafe+' '+delBtn+'</td></tr>';
  }).join('');
}


async function deleteLogEntry(index) {
  var entry = DB.pullupLog[index];
  if (!entry) return;
  var ok = await modalDanger('Eliminar registro', '¿Eliminar ' + entry.sem + ' (' + entry.pu + ' pull-ups)?');
  if (!ok) return;
  DB.pullupLog.splice(index, 1);
  // Recalculate diffs
  for (var i = 1; i < DB.pullupLog.length; i++) {
    DB.pullupLog[i].diff = DB.pullupLog[i].pu - DB.pullupLog[i-1].pu;
  }
  saveDB();
  renderLog();
  showToast('Registro eliminado', '🗑️');
}


function updateWeekSelector() {
  var sel = document.getElementById('inp-sem');
  if (!sel) return;
  var opts = getWeekOptions();
  // Keep the first placeholder option
  sel.innerHTML = '<option value="">Semana...</option>';
  opts.forEach(function(o) {
    sel.innerHTML += '<option>' + o + '</option>';
  });
}

function renderSessionHistory() {
  var el = document.getElementById('session-history-list');
  if (!el) return;
  if (DB.sessions.length === 0) {
    renderEmptyState('session-history-list', '🏋️', 'Sin sesiones aún', 'Completa tu primer entrenamiento desde la pestaña Hoy y aparecerá aquí con todos los detalles.', '¡Empezar ahora!', "goMain('entrenar',document.querySelector('.nb'))");
    return;
  }
  var html = '<div class="lwrap">';
  DB.sessions.slice(0,10).forEach(function(s) {
    var m = Math.floor(s.duration/60), sec = s.duration%60;
    var feelings = ['','😓','😐','🙂','😄','🔥'];
    html += '<div class="weight-log-row">';
    html += '<div><div style="font-size:13px;font-weight:500;color:var(--ink)">Día '+s.day+' — '+s.dayName+'</div>';
    html += '<div style="font-size:12px;color:var(--ink3)">'+s.date+' · '+s.seriesDone+' series · '+m+'min '+sec+'s'+(s.calories?' · ~'+s.calories+' cal':'')+'</div>';
    if (s.notes) html += '<div style="font-size:12px;color:var(--ink2);margin-top:2px;font-style:italic">'+sanitize(s.notes)+'</div>';
    html += '</div>';
    html += '<div style="font-size:20px">'+feelings[s.feeling||3]+'</div>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function renderRecords() {
  var el = document.getElementById('records-list');
  if (!el) return;
  var keys = Object.keys(DB.records);
  if (keys.length === 0) {
    renderEmptyState('records-list', '🏆', 'Sin récords aún', 'Cuando hagas ejercicios al máximo, tu mejor marca se guarda automáticamente aquí.', null, null);
    return;
  }
  var html = '';
  keys.forEach(function(name) {
    var rec = DB.records[name];
    html += '<div class="weight-log-row">';
    html += '<div class="weight-log-date">'+name+'</div>';
    html += '<div><span class="weight-log-val">🏆 '+rec.value+'</span> <span style="font-size:11px;color:var(--ink3)">'+rec.date+'</span></div>';
    html += '</div>';
  });
  el.innerHTML = '<div class="lwrap">'+html+'</div>';
}

function renderTotalStats() {
  var totalH = document.getElementById('total-time-val');
  var totalS = document.getElementById('total-sessions-val');
  if (totalH) {
    var h = Math.floor(DB.totalTrainingTime/3600);
    var m = Math.floor((DB.totalTrainingTime%3600)/60);
    totalH.textContent = h > 0 ? h+'h '+m+'m' : m+'min';
  }
  if (totalS) totalS.textContent = DB.sessions.length;
}

function saveChecklistState() {
  var state = {};
  for (var i=1; i<=7; i++) {
    var el = document.getElementById('ck'+i);
    if (el) state['ck'+i] = el.checked;
  }
  // Save with current week identifier (Mon date of this week)
  var monday = getMondayOfWeek();
  var key = 'checklist_' + monday;
  try { localStorage.setItem(key, JSON.stringify(state)); } catch(e) {}
}

function loadChecklistState() {
  var monday = getMondayOfWeek();
  var key = 'checklist_' + monday;
  try {
    var saved = localStorage.getItem(key);
    if (saved) {
      var state = JSON.parse(saved);
      for (var id in state) {
        var el = document.getElementById(id);
        if (el) el.checked = state[id];
      }
    }
  } catch(e) {}
  // Also restore completed days from sessions this week
  var todayStr = localDateStr();
  var dayMap = {1:'ck1',2:'ck2',3:'ck3',4:'ck4'};
  DB.sessions.forEach(function(s) {
    // Only sessions from this week (Mon-Sun)
    var sessionDate = new Date(s.date + 'T12:00:00');
    var sessionMonday = getMondayOfWeek(sessionDate);
    if (sessionMonday === monday && dayMap[s.day]) {
      var ck = document.getElementById(dayMap[s.day]);
      if (ck) ck.checked = true;
    }
  });
}

function getMondayOfWeek(date) {
  var d = date ? new Date(date) : new Date();
  var day = d.getDay();
  var diff = d.getDate() - day + (day === 0 ? -6 : 1); // Mon=start
  var monday = new Date(d.setDate(diff));
  return localDateStr(monday);
}

function resetCk() {
  document.querySelectorAll('.ckwrap input[type=checkbox]').forEach(c => c.checked = false);
  saveChecklistState();
}

// ═══════════════════════════════════════════════════════════════════
// PROGRESION
// ═══════════════════════════════════════════════════════════════════
function renderProgresion() {
  renderPredictor();
  requestAnimationFrame(drawProgressChart);
  var weeks = DB.pullupLog.length;
  var weekEl = document.getElementById('prog-week');
  var phaseEl = document.getElementById('prog-phase-label');
  var streakEl = document.getElementById('prog-streak');
  if (weekEl) weekEl.textContent = weeks;
  var phase = weeks <= 4 ? 1 : weeks <= 7 ? 2 : 3;
  var phaseNames = {1:'Fase 1 — Volumen base', 2:'Fase 2 — Densidad', 3:'Fase 3 — Intensidad'};
  if (phaseEl) phaseEl.textContent = phaseNames[phase];
  // Highlight current phase card
  [1,2,3].forEach(function(p) {
    var card = document.getElementById('phase-card-'+p);
    var pill = document.getElementById('phase-pill-'+p);
    if (card) card.classList.toggle('now', p===phase);
    if (pill) pill.style.display = p===phase ? 'inline-block' : 'none';
  });
  if (streakEl) streakEl.textContent = DB.streak || 0;
  var ttEl = document.getElementById('total-time-n');
  if (ttEl) ttEl.textContent = getTotalTrainingTime();
  // Chart
  drawProgressChart();
  // Comparador
  renderComparador();
}

// ═══════════════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════════════
function drawProgressChart() {
  var canvas = document.getElementById('progressChart');
  if (!canvas || !canvas.offsetParent) return; // skip if not visible
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.offsetWidth * window.devicePixelRatio;
  var H = 180 * window.devicePixelRatio;
  canvas.width = W; canvas.height = H;
  canvas.style.height = '180px';
  var dpr = window.devicePixelRatio || 1;
  ctx.scale(dpr, dpr);
  var w = canvas.offsetWidth, h = 180;
  ctx.clearRect(0,0,w,h);
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  var textColor = isDark ? '#9B9890' : '#9B9890';
  // Grid
  var pad = {l:32,r:16,t:16,b:28};
  var chartW = w - pad.l - pad.r, chartH = h - pad.t - pad.b;
  // Grid lines
  ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
  for (var i=0; i<=4; i++) {
    var y = pad.t + chartH - (i/4)*chartH;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+chartW,y); ctx.stroke();
  }
  if (DB.pullupLog.length < 2) {
    ctx.fillStyle = textColor; ctx.font = '13px Inter'; ctx.textAlign = 'center';
    ctx.fillText('Registra más semanas para ver la gráfica', w/2, h/2);
    return;
  }
  // Pull-up data
  var puData = DB.pullupLog.map(function(e) { return e.pu; });
  var maxVal = Math.max(...puData, 5);
  var n = puData.length;
  // Draw pull-up line
  ctx.strokeStyle = '#2563EB'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  puData.forEach(function(v,i) {
    var x = pad.l + (i/(n-1||1))*chartW;
    var y = pad.t + chartH - (v/maxVal)*chartH;
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();
  // Dots
  ctx.fillStyle = '#2563EB';
  puData.forEach(function(v,i) {
    var x = pad.l + (i/(n-1||1))*chartW;
    var y = pad.t + chartH - (v/maxVal)*chartH;
    ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = textColor; ctx.font = '10px Inter'; ctx.textAlign = 'center';
    ctx.fillText(v, x, y-8);
    ctx.fillStyle = '#2563EB';
  });
  // X labels
  ctx.fillStyle = textColor; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'center';
  puData.forEach(function(v,i) {
    var x = pad.l + (i/(n-1||1))*chartW;
    ctx.fillText('S'+(i+1), x, h-8);
  });
}

function renderComparador() {
  var el = document.getElementById('comparador-content');
  if (!el || DB.pullupLog.length < 2) return;
  var first = DB.pullupLog[0];
  var last = DB.pullupLog[DB.pullupLog.length-1];
  var diff = last.pu - first.pu;
  var pct = first.pu > 0 ? Math.round((diff/first.pu)*100) : 0;
  el.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    + '<div style="text-align:center;padding:16px;background:var(--s2);border-radius:var(--rs)"><div style="font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em">Inicio</div><div style="font-size:32px;font-weight:700;font-family:JetBrains Mono,monospace;color:var(--ink)">'+first.pu+'</div><div style="font-size:12px;color:var(--ink3)">pull-ups</div></div>'
    + '<div style="text-align:center;padding:16px;background:var(--gbg);border:1px solid var(--gborder);border-radius:var(--rs)"><div style="font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em">Ahora ('+last.sem+')</div><div style="font-size:32px;font-weight:700;font-family:JetBrains Mono,monospace;color:var(--green)">'+last.pu+'</div><div style="font-size:12px;color:var(--ink3)">pull-ups</div></div>'
    + '</div>'
    + '<div style="text-align:center;margin-top:12px;font-size:15px;font-weight:600;color:'+(diff>=0?'var(--green)':'var(--red)')+'">'+( diff>=0?'+':'')+diff+' reps ('+pct+'% de mejora)</div>';
}

// Chart view toggle
function setChartView(v) {
  ['pullups','peso','both'].forEach(id => {
    var btn = document.getElementById('chart-btn-'+id);
    if (btn) btn.className = 'btn btn-ghost btn-sm' + (id===v?' on':'');
  });
  drawProgressChart();
}

// ═══════════════════════════════════════════════════════════════════
// PESO
// ═══════════════════════════════════════════════════════════════════
function renderPeso() {
  requestAnimationFrame(drawPesoChart);
  var today = new Date();
  var months = ['enero','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var fechaEl = document.getElementById('peso-fecha-hoy');
  if (fechaEl) fechaEl.textContent = 'Hoy: ' + today.getDate() + ' de ' + months[today.getMonth()];
  // Update unit labels
  var _pu = document.getElementById('peso-unit');
  if (_pu) _pu.textContent = getWeightUnit();
  // Check today's entry
  var todayStr = today.toISOString().split('T')[0];
  var todayEntry = DB.weights.find(w => w.date === todayStr);
  var todayEl = document.getElementById('peso-hoy-val');
  if (todayEl) todayEl.textContent = todayEntry ? todayEntry.weight : '—';
  if (todayEntry) {
    var inp = document.getElementById('peso-input');
    if (inp) inp.value = todayEntry.weight;
  }
  // Inicio
  var inicioEl = document.getElementById('peso-inicio-val');
  if (inicioEl) inicioEl.textContent = DB.weights.length > 0 ? DB.weights[DB.weights.length-1].weight : (DB.settings.startWeight || '—');
  // Change
  var cambioEl = document.getElementById('peso-cambio-val');
  if (cambioEl && DB.weights.length > 0 && todayEntry) {
    var inicio = DB.weights[DB.weights.length-1].weight;
    var diff = (todayEntry.weight - inicio).toFixed(1);
    cambioEl.textContent = (diff >= 0 ? '+' : '') + diff;
    cambioEl.style.color = diff <= 0 ? 'var(--green)' : 'var(--red)';
  }
  // Weekly avg
  renderWeeklyAvg();
  renderMonthlyAvg();
  renderPesoLog();
  drawPesoChart();
}

function savePeso() {
  var rawVal = document.getElementById('peso-input').value.trim();
  var val = parseFloat(rawVal);
  if (!rawVal || isNaN(val) || val < 80 || val > 500) {
    showToast('Ingresa un peso válido', '⚠️');
    return;
  }
  val = Math.round(val * 10) / 10; // Round to 1 decimal
  var todayStr = localDateStr();
  var existing = DB.weights.findIndex(w => w.date === todayStr);
  if (existing >= 0) DB.weights[existing].weight = val;
  else DB.weights.unshift({ date: todayStr, weight: val });
  saveDB();
  renderPeso();
  checkAchievements();
}


async function deleteWeight(dateStr, btn) {
  var ok = await modalDanger('Eliminar peso', '¿Eliminar el registro del ' + dateStr + '?');
  if (!ok) return;
  DB.weights = DB.weights.filter(function(w) { return w.date !== dateStr; });
  saveDB();
  renderPeso();
  showToast('Registro eliminado', '🗑️');
}

function renderWeeklyAvg() {
  // Get this week's entries (Mon-Sun)
  var now = new Date();
  var dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
  var weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek);
  weekStart.setHours(0,0,0,0);
  var weekEntries = DB.weights.filter(w => new Date(w.date) >= weekStart);
  var el = document.getElementById('peso-avg-sem');
  var lbl = document.getElementById('peso-avg-sem-label');
  if (el) el.textContent = weekEntries.length > 0 ? (weekEntries.reduce((a,w)=>a+w.weight,0)/weekEntries.length).toFixed(1) : '—';
  if (lbl) lbl.textContent = weekEntries.length + ' registro' + (weekEntries.length!==1?'s':'') + ' esta semana';
}

function renderMonthlyAvg() {
  var now = new Date();
  var monthEntries = DB.weights.filter(w => {
    var d = new Date(w.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  var el = document.getElementById('peso-avg-mes');
  var lbl = document.getElementById('peso-avg-mes-label');
  if (el) el.textContent = monthEntries.length > 0 ? (monthEntries.reduce((a,w)=>a+w.weight,0)/monthEntries.length).toFixed(1) : '—';
  if (lbl) lbl.textContent = monthEntries.length + ' registro' + (monthEntries.length!==1?'s':'') + ' este mes';
}

function renderPesoLog() {
  var el = document.getElementById('peso-log-list');
  if (!el) return;
  if (DB.weights.length === 0) {
    renderEmptyState('peso-log-list', '⚖️', 'Sin registros de peso', 'Pésate mañana por la mañana en ayunas y regístralo aquí o desde la pestaña Hoy.', null, null);
    return;
  }
  var html = '';
  DB.weights.slice(0,30).forEach(function(w, i) {
    var diff = i < DB.weights.length-1 ? (w.weight - DB.weights[i+1].weight).toFixed(1) : null;
    var diffHtml = diff !== null ? '<span class="weight-log-diff" style="color:'+(diff<=0?'var(--green)':'var(--red)')+'">'+( diff>=0?'+':'')+diff+'</span>' : '';
    var _wu = getWeightUnit();
    html += '<div class="weight-log-row"><div class="weight-log-date">'+w.date+'</div><div style="display:flex;align-items:center;gap:8px"><div class="weight-log-val">'+w.weight+' '+_wu+'</div>'+diffHtml+'<button type="button" onclick="deleteWeight(\''+w.date+'\',this)" style="background:none;border:none;color:var(--ink3);cursor:pointer;font-size:12px;padding:2px 4px;opacity:.5" title="Eliminar">✕</button></div></div>';
  });
  el.innerHTML = html;
}

function drawPesoChart() {
  var canvas = document.getElementById('pesoChart');
  if (!canvas || !canvas.offsetParent) return; // skip if not visible
  if (!canvas || DB.weights.length < 2) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.offsetWidth * window.devicePixelRatio;
  var H = 180 * window.devicePixelRatio;
  canvas.width = W; canvas.height = H;
  canvas.style.height = '180px';
  ctx.scale(window.devicePixelRatio||1, window.devicePixelRatio||1);
  var w = canvas.offsetWidth, h = 180;
  ctx.clearRect(0,0,w,h);
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  var textColor = '#9B9890';
  var pad = {l:36,r:16,t:16,b:28};
  var chartW = w-pad.l-pad.r, chartH = h-pad.t-pad.b;
  // Use last 30 entries reversed (oldest first)
  var data = DB.weights.slice(0,30).reverse();
  var vals = data.map(d => d.weight);
  var minV = Math.min(...vals) - 1, maxV = Math.max(...vals) + 1;
  var range = maxV - minV;
  var n = data.length;
  // Grid
  ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
  for (var i=0;i<=4;i++) {
    var y = pad.t + chartH - (i/4)*chartH;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+chartW,y); ctx.stroke();
    ctx.fillStyle = textColor; ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'right';
    ctx.fillText((minV + (i/4)*range).toFixed(0), pad.l-3, y+3);
  }
  // Line
  ctx.strokeStyle = '#F97316'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  vals.forEach(function(v,i) {
    var x = pad.l + (i/(n-1||1))*chartW;
    var y = pad.t + chartH - ((v-minV)/range)*chartH;
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();
  // Dots + trend area
  ctx.fillStyle = '#F97316';
  vals.forEach(function(v,i) {
    var x = pad.l + (i/(n-1||1))*chartW;
    var y = pad.t + chartH - ((v-minV)/range)*chartH;
    ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
  });
}

// ═══════════════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ═══════════════════════════════════════════════════════════════════
var BADGES_DEF = [
  { id:'first_session', icon:'🎯', name:'Primer entrenamiento', desc:'Completaste tu primera sesión', check: function() { return DB.sessions.length >= 1; } },
  { id:'first_week', icon:'📅', name:'Primera semana', desc:'4 días completados', check: function() { return DB.sessions.filter(s=>s.completed!==false).length >= 4; } },
  { id:'five_pullups', icon:'💪', name:'5 Pull-ups', desc:'Hiciste 5 wide pull-ups limpias', check: function() { return DB.pullupLog.some(e=>e.pu>=5); } },
  { id:'seven_pullups', icon:'🔥', name:'7 Pull-ups', desc:'Meta de semana 4 alcanzada', check: function() { return DB.pullupLog.some(e=>e.pu>=7); } },
  { id:'ten_pullups', icon:'⚡', name:'10 Pull-ups', desc:'Doble dígito. Increíble.', check: function() { return DB.pullupLog.some(e=>e.pu>=10); } },
  { id:'streak_2', icon:'🔥', name:'2 semanas seguidas', desc:'Consistencia es la clave', check: function() { return (DB.streak||0) >= 2; } },
  { id:'streak_4', icon:'🌟', name:'Mes completo', desc:'4 semanas seguidas sin parar', check: function() { return (DB.streak||0) >= 4; } },
  { id:'streak_10', icon:'👑', name:'10 semanas', desc:'Completaste el programa entero', check: function() { return (DB.streak||0) >= 10; } },
  { id:'weight_logged_7', icon:'⚖️', name:'Semana de peso', desc:'7 días de registro de peso', check: function() { return DB.weights.length >= 7; } },
  { id:'weight_logged_30', icon:'📊', name:'Mes de peso', desc:'30 días de registro de peso', check: function() { return DB.weights.length >= 30; } },
  { id:'personal_record', icon:'🏆', name:'Primer récord', desc:'Superaste tu propio récord', check: function() { return Object.keys(DB.records).length >= 1; } },
  { id:'ten_sessions', icon:'💫', name:'10 sesiones', desc:'10 entrenamientos completados', check: function() { return DB.sessions.length >= 10; } },
];

function checkAchievements() {
  var newUnlocks = [];
  BADGES_DEF.forEach(function(b) {
    if (!DB.achievements[b.id] && b.check()) {
      DB.achievements[b.id] = { date: localDateStr() };
      newUnlocks.push(b);
    }
  });
  if (newUnlocks.length > 0) {
    saveDB();
    newUnlocks.forEach(function(b) {
      showAchievementToast(b);
    });
  }
}

function showAchievementToast(badge) {
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--abg);border:1px solid var(--aborder);border-radius:var(--r);padding:12px 18px;font-size:14px;font-weight:600;color:var(--ink);z-index:99999;box-shadow:var(--shl);animation:fadeUp .3s ease;white-space:nowrap';
  toast.textContent = badge.icon + ' ¡' + badge.name + ' desbloqueado!';
  document.body.appendChild(toast);
  setTimeout(function() { toast.style.opacity='0'; toast.style.transition='opacity .3s'; setTimeout(function(){toast.remove()},300); }, 3500);
}

function renderLogros() {
  var el = document.getElementById('badges-grid');
  if (!el) return;
  var unlocked = BADGES_DEF.filter(b => DB.achievements[b.id]).length;
  var totalEl = document.getElementById('badges-total');
  var unlEl = document.getElementById('badges-unlocked');
  var pctEl = document.getElementById('badges-pct');
  if (totalEl) totalEl.textContent = BADGES_DEF.length;
  if (unlEl) unlEl.textContent = unlocked;
  if (pctEl) pctEl.textContent = Math.round(unlocked/BADGES_DEF.length*100)+'%';
  var unlocked_count = BADGES_DEF.filter(function(b){return !!DB.achievements[b.id];}).length;
  var html = '';
  BADGES_DEF.forEach(function(b) {
    var isUnlocked = !!DB.achievements[b.id];
    html += '<div class="badge-card '+(isUnlocked?'unlocked':'locked')+'">';
    html += '<div class="badge-icon">'+b.icon+'</div>';
    html += '<div class="badge-name">'+b.name+'</div>';
    html += '<div class="badge-desc">'+b.desc+'</div>';
    if (isUnlocked) html += '<div class="badge-date">'+DB.achievements[b.id].date+'</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

function getTotalTrainingTime() {
  // Use totalTrainingTime as the single source of truth
  // (it's updated in completeAllExercises, so no need to sum sessions again)
  var total = Math.max(0, DB.totalTrainingTime || 0);
  var hrs  = Math.floor(total / 3600);
  var mins = Math.floor((total % 3600) / 60);
  if (hrs > 0) return hrs + 'h ' + mins + 'm';
  return mins + 'm';
}

function getSuggestedReps(exName) {
  // Find last logged reps for this exercise across recent sessions
  var recent = DB.sessions.slice(-5).reverse();
  for (var i = 0; i < recent.length; i++) {
    var s = recent[i];
    if (s.exercises) {
      var ex = s.exercises.find(function(e) { return e.name === exName; });
      if (ex && ex.sets && ex.sets.length > 0) {
        var reps = ex.sets.filter(function(s) { return s && s.reps; });
        if (reps.length > 0) {
          var avg = Math.round(reps.reduce(function(a,b){return a+(b.reps||0);},0) / reps.length);
          return avg > 0 ? avg : null;
        }
      }
    }
  }
  return null;
}


// ═══════════════════════════════════════════════════════════════════
// CALORIE ESTIMATION
// ═══════════════════════════════════════════════════════════════════
// MET values (Metabolic Equivalent of Task) for our exercises
var MET_VALUES = {
  'pull':   8.0,   // Pull-ups, chin-ups, rows — vigorous
  'push':   6.0,   // Push-ups, pike push-ups — moderate-vigorous
  'core':   4.0,   // Planks, dead bugs, crunches
  'cardio': 8.5,   // Burpees, jump squats, mountain climbers
  'warmup': 3.0    // Warmup exercises
};

// Exercise to MET category mapping
var EX_MET_MAP = {
  'Wide pull-up': 'pull', 'Neutral pull-up': 'pull', 'Chin-up supino': 'pull',
  'Wide pull-up + banda roja': 'pull', 'Narrow pull-up + banda roja': 'pull',
  'Remo con banda': 'pull', 'Negativas lentas': 'pull',
  'Wide pull-up — TEST ⭐': 'pull', 'Wide pull-up — Test semanal': 'pull',
  'Push-up en barra': 'push', 'Push-up diamante': 'push',
  'Push-up arquero': 'push', 'Pike push-up': 'push', 'Push-up explosivo': 'push',
  'Plank': 'core', 'Plank lateral': 'core', 'Dead bug': 'core',
  'Reverse crunch': 'core', 'Wall slide': 'core', 'V-up': 'core',
  'Sit-up con pies en barra': 'core',
  'Face pull + curl con banda amarilla': 'push', 'Curl bíceps + banda amarilla': 'push',
  'Burpee': 'cardio', 'Jump squat': 'cardio', 'Mountain climber': 'cardio'
};

function estimateCalories(durationSec, exercises) {
  // Formula: Calories = MET × weight(kg) × time(hours)
  var weightKg;
  var unit = getWeightUnit();
  var w = getProfileWeight();
  if (unit === 'kg') {
    weightKg = w;
  } else {
    weightKg = w * 0.4536;
  }
  // Calculate weighted MET based on exercises done
  var totalMET = 0;
  var exCount = 0;
  if (exercises && exercises.length > 0) {
    exercises.forEach(function(ex) {
      var category = EX_MET_MAP[ex.name] || 'core';
      var met = MET_VALUES[category] || 5.0;
      totalMET += met;
      exCount++;
    });
    totalMET = totalMET / exCount; // average MET
  } else {
    totalMET = 6.0; // default moderate
  }
  var hours = durationSec / 3600;
  var calories = Math.round(totalMET * weightKg * hours);
  return Math.max(calories, 1); // minimum 1
}

function getCalorieLabel(cal) {
  if (cal < 100) return '🔥 Ligero';
  if (cal < 250) return '🔥🔥 Moderado';
  if (cal < 400) return '🔥🔥🔥 Intenso';
  return '🔥🔥🔥🔥 Beast mode';
}


// ═══════════════════════════════════════════════════════════════════
// SHARE PROGRESS AS IMAGE
// ═══════════════════════════════════════════════════════════════════
function generateShareCard() {
  var canvas = document.createElement('canvas');
  var W = 600, H = 400;
  canvas.width = W * 2; canvas.height = H * 2;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  // Background
  var grad = ctx.createLinearGradient(0, 0, W, H);
  if (isDark) {
    grad.addColorStop(0, '#1a1a2e'); grad.addColorStop(1, '#16213e');
  } else {
    grad.addColorStop(0, '#EEF3FD'); grad.addColorStop(1, '#F6F5F1');
  }
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  // Border accent
  ctx.fillStyle = '#2563EB'; ctx.fillRect(0, 0, 6, H);
  // Title
  ctx.fillStyle = isDark ? '#F0EDE8' : '#1A1917';
  ctx.font = 'bold 28px Inter, sans-serif';
  ctx.fillText('BARRA PRO', 30, 45);
  ctx.fillStyle = '#2563EB';
  ctx.font = '13px JetBrains Mono, monospace';
  ctx.fillText('v' + APP_VERSION, 180, 45);
  // Divider
  ctx.fillStyle = isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)';
  ctx.fillRect(30, 60, W - 60, 1);
  // Profile name
  var profiles = getProfiles();
  var currentId = getCurrentProfileId();
  var profile = profiles.find(function(p){ return p.id === currentId; }) || {name:'Mi perfil',emoji:'💪'};
  ctx.fillStyle = isDark ? '#9B9890' : '#68655E';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText(profile.emoji + ' ' + profile.name + ' — ' + new Date().toLocaleDateString('es'), 30, 85);
  // Stats boxes
  var best = Math.max.apply(null, DB.pullupLog.map(function(e){return e.pu;}));
  var weeks = DB.pullupLog.length;
  var totalSessions = DB.sessions.length;
  var totalMin = Math.round((DB.totalTrainingTime || 0) / 60);
  var totalCal = DB.sessions.reduce(function(a,s){ return a + (s.calories || 0); }, 0);
  var weightNow = DB.weights.length > 0 ? DB.weights[0].weight : null;
  var stats = [
    { label:'PULL-UPS', value: best, color:'#2563EB' },
    { label:'SEMANAS', value: weeks, color:'#15803D' },
    { label:'SESIONES', value: totalSessions, color:'#7C3AED' },
  ];
  var boxW = (W - 80) / 3;
  stats.forEach(function(s, i) {
    var x = 30 + i * (boxW + 10);
    var y = 105;
    // Box background
    ctx.fillStyle = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)';
    ctx.beginPath();
    roundRect(ctx, x, y, boxW, 85, 10);
    ctx.fill();
    // Value
    ctx.fillStyle = s.color;
    ctx.font = 'bold 36px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(s.value), x + boxW/2, y + 48);
    // Label
    ctx.fillStyle = isDark ? '#5C5A55' : '#9B9890';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(s.label, x + boxW/2, y + 72);
    ctx.textAlign = 'left';
  });
  // Pull-up progression mini chart
  var chartY = 210, chartH = 80, chartW = W - 60;
  ctx.fillStyle = isDark ? '#F0EDE8' : '#1A1917';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('Progresión', 30, chartY);
  chartY += 15;
  if (DB.pullupLog.length > 1) {
    var data = DB.pullupLog.map(function(e){return e.pu;});
    var maxV = Math.max.apply(null, data);
    var n = data.length;
    // Line
    ctx.strokeStyle = '#2563EB'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    data.forEach(function(v, i) {
      var x = 30 + (i / (n-1)) * chartW;
      var y = chartY + chartH - (v / maxV) * chartH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Dots
    ctx.fillStyle = '#2563EB';
    data.forEach(function(v, i) {
      var x = 30 + (i / (n-1)) * chartW;
      var y = chartY + chartH - (v / maxV) * chartH;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    });
    // Labels
    ctx.fillStyle = isDark ? '#5C5A55' : '#9B9890';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    data.forEach(function(v, i) {
      var x = 30 + (i / (n-1)) * chartW;
      ctx.fillText(v, x, chartY + chartH + 14);
    });
    ctx.textAlign = 'left';
  }
  // Bottom stats row
  var bottomY = 340;
  ctx.fillStyle = isDark ? '#9B9890' : '#68655E';
  ctx.font = '12px Inter, sans-serif';
  var bottomText = [];
  if (totalMin > 0) bottomText.push('⏱ ' + Math.floor(totalMin/60) + 'h ' + (totalMin%60) + 'm entrenadas');
  if (totalCal > 0) bottomText.push('🔥 ~' + totalCal + ' cal quemadas');
  if (weightNow) bottomText.push('⚖️ ' + weightNow + ' lb');
  ctx.fillText(bottomText.join('   '), 30, bottomY);
  // Watermark
  ctx.fillStyle = isDark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.1)';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  ctx.fillText('barrapro · ' + localDateStr(), W - 20, H - 15);
  ctx.textAlign = 'left';
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function shareProgress() {
  var canvas = generateShareCard();
  canvas.toBlob(function(blob) {
    // Try native share first (mobile)
    if (navigator.share && navigator.canShare) {
      var file = new File([blob], 'barra-pro-progreso.png', { type: 'image/png' });
      var shareData = { files: [file], title: 'Mi progreso — Barra Pro' };
      if (navigator.canShare(shareData)) {
        navigator.share(shareData).catch(function() { downloadShareImage(blob); });
        return;
      }
    }
    // Fallback: download
    downloadShareImage(blob);
  }, 'image/png');
}

function downloadShareImage(blob) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'barra-pro-progreso-' + localDateStr() + '.png';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Imagen descargada — compártela en tus redes', '📸');
}

function previewShareCard() {
  var canvas = generateShareCard();
  var modal = document.getElementById('share-preview-modal');
  if (!modal) return;
  var container = document.getElementById('share-preview-canvas');
  if (container) {
    container.innerHTML = '';
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.borderRadius = '8px';
    container.appendChild(canvas);
  }
  modal.classList.add('show');
}

function hideSharePreview() {
  var modal = document.getElementById('share-preview-modal');
  if (modal) modal.classList.remove('show');
}


// ═══════════════════════════════════════════════════════════════════
// DYNAMIC UI — Populates all user-specific text/values
// ═══════════════════════════════════════════════════════════════════
function renderDynamicUI() {
  var unit = getWeightUnit();
  var w = getProfileWeight();
  var startR = getStartReps();
  var goals = calcGoals(startR);
  var band = calcCurrentBand();

  // Quick weight unit
  var qwu = document.getElementById('quick-weight-unit');
  if (qwu) qwu.textContent = unit;
  var pwu = document.getElementById('peso-unit');
  if (pwu) pwu.textContent = unit;
  var piu = document.getElementById('peso-input-unit');
  if (piu) piu.textContent = unit;

  // Peso inicio
  var pi = document.getElementById('peso-inicio-val');
  if (pi) pi.textContent = DB.weights.length > 0 ? DB.weights[DB.weights.length-1].weight : (DB.settings.startWeight || '—');

  // Programa subtitle
  var ps = document.getElementById('programa-sub');
  if (ps) ps.textContent = '4 días · ' + (w ? w + ' ' + unit : '') + ' · 10 semanas';

  // Progresión subtitle
  var prs = document.getElementById('progresion-sub');
  if (prs && startR > 0) prs.textContent = 'Punto de partida: ' + startR + ' wide pull-ups · ' + getWeightDisplay(w);

  // Tracker start metric
  var sn = document.getElementById('start-n');
  if (sn) sn.textContent = startR > 0 ? startR : '—';

  // Bandas subtitle
  var bs = document.getElementById('bandas-sub');
  if (bs) bs.textContent = w ? (w + ' ' + unit + ' — peso efectivo con cada banda') : 'Peso efectivo en pull-ups con cada banda';

  // Banda actual callout
  var bac = document.getElementById('banda-actual-text');
  if (bac) {
    var b = calcCurrentBand();
    bac.innerHTML = '<strong>Tu banda actual:</strong> ' + b.label + ' en el Día 3. Peso efectivo: ' + getBandEffectiveWeight(b.key);
  }

  // Banda effective weight spans
  var bandEffects = document.querySelectorAll('.banda-effective');
  bandEffects.forEach(function(span) {
    var bk = span.getAttribute('data-band');
    if (bk) span.textContent = 'Peso efectivo: ' + getBandEffectiveWeight(bk) + '.';
  });

  // Progress bars (dynamic)
  renderProgressBars(startR, goals);

  // Weight input placeholders
  var qwi = document.getElementById('quick-weight-inp');
  if (qwi && w) qwi.placeholder = Math.round(w);
  var pwi = document.getElementById('peso-input');
  if (pwi && w) pwi.placeholder = Math.round(w);

  // Peso page unit label
  var pesoLabel = document.getElementById('quick-weight-label');
  if (pesoLabel) pesoLabel.textContent = 'Peso de hoy';
  var pesoInputLabel = document.querySelector('[for="peso-input"], .weight-day-input .weight-unit');
}

function renderProgressBars(startR, goals) {
  var el = document.getElementById('prog-bars-container');
  if (!el) return;
  if (!goals) goals = calcGoals(startR);
  if (startR === undefined) startR = getStartReps();

  var maxTarget = goals.week10;
  var currentBest = DB.pullupLog.length > 0 ? Math.max.apply(null, DB.pullupLog.map(function(e){return e.pu;})) : startR;

  var bars = [
    { label: 'Inicio', value: startR + ' reps', pct: Math.round((startR/maxTarget)*100), done: true },
    { label: 'Semana 4', value: 'Meta: ' + goals.week4 + ' reps', pct: Math.round((goals.week4/maxTarget)*100), done: currentBest >= goals.week4 },
    { label: 'Semana 7', value: 'Meta: ' + goals.week7 + ' reps', pct: Math.round((goals.week7/maxTarget)*100), done: currentBest >= goals.week7 },
    { label: 'Semana 10', value: 'Meta: ' + goals.week10 + '+ reps', pct: 100, done: currentBest >= goals.week10 },
  ];

  // Add current best if different from start
  if (currentBest > startR && DB.pullupLog.length > 1) {
    var currentPct = Math.round((currentBest/maxTarget)*100);
    bars.splice(1, 0, { label: 'Actual ⭐', value: currentBest + ' reps', pct: Math.min(100, currentPct), done: true, highlight: true });
  }

  var html = '';
  bars.forEach(function(b, i) {
    var cls = b.done ? 'pdone' : 'ptodo';
    var last = i === bars.length - 1 ? ' style="margin-bottom:0"' : '';
    html += '<div class="prog-item"' + last + '>';
    html += '<div class="prog-row"><span>' + b.label + '</span><span' + (b.highlight ? ' style="color:var(--blue)"' : '') + '>' + b.value + '</span></div>';
    html += '<div class="prog-track"><div class="prog-bar ' + cls + '" style="width:' + Math.min(100, b.pct) + '%"></div></div>';
    html += '</div>';
  });
  el.innerHTML = html;
}


// ═══════════════════════════════════════════════════════════════════
// CALENDAR HEATMAP
// ═══════════════════════════════════════════════════════════════════
function renderHeatmap() {
  var el = document.getElementById('heatmap-container');
  if (!el) return;
  // Collect all training dates with intensity
  var dateMap = {};
  DB.sessions.forEach(function(s) {
    if (!s.date) return;
    var intensity = (dateMap[s.date] || 0) + 1;
    dateMap[s.date] = Math.min(intensity, 4); // cap at 4
  });
  // Also count weight logs as activity (lower intensity)
  DB.weights.forEach(function(w) {
    if (!w.date) return;
    if (!dateMap[w.date]) dateMap[w.date] = 0;
  });
  // Generate 12 weeks of calendar (84 days back)
  var today = new Date();
  var weeks = 12;
  var startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (weeks * 7) + 1);
  // Align to Monday
  var dayOfWeek = startDate.getDay();
  var offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startDate.setDate(startDate.getDate() - offset);
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var colors = isDark
    ? ['rgba(255,255,255,.06)','#166534','#15803D','#22C55E','#4ADE80']
    : ['var(--s2)','#BBF0D0','#86EFAC','#22C55E','#15803D'];
  var dayLabels = ['L','','M','','V','',''];
  var html = '<div style="display:flex;gap:2px;font-size:10px;color:var(--ink3)">';
  // Day labels column
  html += '<div style="display:flex;flex-direction:column;gap:2px;margin-right:4px;padding-top:16px">';
  dayLabels.forEach(function(l) {
    html += '<div style="width:12px;height:12px;line-height:12px;text-align:right;font-size:9px">' + l + '</div>';
  });
  html += '</div>';
  // Weeks columns
  var d = new Date(startDate);
  var monthLabels = [];
  var prevMonth = -1;
  var weekIdx = 0;
  while (d <= today) {
    var weekStart = new Date(d);
    // Month label
    if (d.getMonth() !== prevMonth) {
      var mNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      monthLabels.push({ week: weekIdx, label: mNames[d.getMonth()] });
      prevMonth = d.getMonth();
    }
    html += '<div style="display:flex;flex-direction:column;gap:2px">';
    // Month header spacer
    html += '<div style="height:14px"></div>';
    for (var dow = 0; dow < 7; dow++) {
      var dateStr = localDateStr(d);
      var intensity = dateMap[dateStr] || 0;
      var isFuture = d > today;
      var isToday = dateStr === localDateStr(today);
      var bg = isFuture ? 'transparent' : colors[intensity];
      var border = isToday ? '1px solid var(--blue)' : 'none';
      var title = dateStr + (intensity > 0 ? ' (' + intensity + ' sesión' + (intensity>1?'es':'') + ')' : '');
      html += '<div style="width:12px;height:12px;border-radius:2px;background:' + bg + ';border:' + border + '" title="' + title + '"></div>';
      d.setDate(d.getDate() + 1);
    }
    html += '</div>';
    weekIdx++;
  }
  html += '</div>';
  // Month labels overlay
  if (monthLabels.length > 0) {
    var labelsHtml = '<div style="display:flex;position:relative;height:14px;margin-bottom:-14px;margin-left:18px;font-size:9px;color:var(--ink3)">';
    monthLabels.forEach(function(ml) {
      labelsHtml += '<div style="position:absolute;left:' + (ml.week * 14) + 'px">' + ml.label + '</div>';
    });
    labelsHtml += '</div>';
    html = labelsHtml + html;
  }
  // Stats
  var totalDays = Object.keys(dateMap).filter(function(k) { return dateMap[k] > 0; }).length;
  var streak = calcCurrentStreak(dateMap);
  html += '<div style="display:flex;gap:16px;margin-top:8px;font-size:12px;color:var(--ink2)">';
  html += '<span><strong>' + totalDays + '</strong> días activos</span>';
  html += '<span>🔥 <strong>' + streak + '</strong> días seguidos</span>';
  html += '</div>';
  el.innerHTML = html;
}

function calcCurrentStreak(dateMap) {
  var streak = 0;
  var d = new Date();
  // If today has no activity, start from yesterday
  if (!dateMap[localDateStr(d)]) d.setDate(d.getDate() - 1);
  while (dateMap[localDateStr(d)] && dateMap[localDateStr(d)] > 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}


// ═══════════════════════════════════════════════════════════════════
// COLOR THEMES
// ═══════════════════════════════════════════════════════════════════
var COLOR_THEMES = [
  { key:'blue',   label:'Azul',    primary:'#2563EB', hover:'#1D4ED8' },
  { key:'green',  label:'Verde',   primary:'#15803D', hover:'#166534' },
  { key:'purple', label:'Morado',  primary:'#7C3AED', hover:'#6D28D9' },
  { key:'red',    label:'Rojo',    primary:'#DC2626', hover:'#B91C1C' },
  { key:'orange', label:'Naranja', primary:'#EA580C', hover:'#C2410C' },
  { key:'teal',   label:'Teal',    primary:'#0D9488', hover:'#0F766E' },
  { key:'pink',   label:'Rosa',    primary:'#DB2777', hover:'#BE185D' },
  { key:'amber',  label:'Ámbar',   primary:'#D97706', hover:'#B45309' },
];

function applyColorTheme(themeKey) {
  var theme = COLOR_THEMES.find(function(t) { return t.key === themeKey; });
  if (!theme) theme = COLOR_THEMES[0]; // default blue
  document.documentElement.style.setProperty('--blue', theme.primary);
  // Update related blue variables
  var r = parseInt(theme.primary.slice(1,3),16);
  var g = parseInt(theme.primary.slice(3,5),16);
  var b = parseInt(theme.primary.slice(5,7),16);
  document.documentElement.style.setProperty('--bbg', 'rgba('+r+','+g+','+b+',.12)');
  document.documentElement.style.setProperty('--bborder', 'rgba('+r+','+g+','+b+',.35)');
  DB.settings.colorTheme = themeKey;
}

function renderThemePicker() {
  var el = document.getElementById('theme-picker');
  if (!el) return;
  var current = DB.settings.colorTheme || 'blue';
  var html = '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  COLOR_THEMES.forEach(function(t) {
    var isSelected = t.key === current;
    html += '<div onclick="selectTheme(\''+t.key+'\');" style="width:28px;height:28px;border-radius:50%;background:'+t.primary+';cursor:pointer;border:2px solid '+(isSelected?'var(--ink)':'transparent')+';transition:all .15s;transform:'+(isSelected?'scale(1.15)':'scale(1)')+'" title="'+t.label+'"></div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function selectTheme(key) {
  applyColorTheme(key);
  saveDB();
  renderThemePicker();
}

// ═══════════════════════════════════════════════════════════════════
// STREAK
// ═══════════════════════════════════════════════════════════════════
function updateStreak() {
  var today = localDateStr();
  if (DB.lastTrainingDate === today) return;
  // Check if this is a consecutive week
  if (DB.lastTrainingDate) {
    var last = new Date(DB.lastTrainingDate);
    var now = new Date(today);
    var diffDays = Math.round((now-last)/(1000*60*60*24));
    if (diffDays <= 7) DB.streak = (DB.streak||0) + 1;
    else DB.streak = 1;
  } else {
    DB.streak = 1;
  }
  DB.lastTrainingDate = today;
  saveDB();
}

// ═══════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════
function toggleDarkMode(val) {
  document.documentElement.setAttribute('data-theme', val ? 'dark' : 'light');
  DB.settings.dark = val;
  saveDB();
}

function loadSettings() {
  renderCustomDaysUI();
  renderPinSettingsUI();
  var s = DB.settings;
  var darkEl = document.getElementById('setting-dark');
  if (darkEl) darkEl.checked = !!s.dark;
  var soundEl = document.getElementById('setting-sound');
  if (soundEl) soundEl.checked = s.sound !== false;
  var vibEl = document.getElementById('setting-vibration');
  if (vibEl) vibEl.checked = s.vibration !== false;
  var wlEl = document.getElementById('setting-wakelock');
  if (wlEl) wlEl.checked = s.wakelock !== false;
  var prepEl = document.getElementById('setting-prep-delay');
  if (prepEl) prepEl.value = s.prepDelay || 5;
  renderThemePicker();
  var timerSoundEl = document.getElementById('setting-timer-sound');
  if (timerSoundEl) timerSoundEl.value = s.timerSound || 'beep';
}

function setupNotifications() {
  if (!('Notification' in window)) {
    document.getElementById('notif-status').textContent = 'Notificaciones no soportadas en este navegador.';
    return;
  }
  Notification.requestPermission().then(function(perm) {
    var el = document.getElementById('notif-status');
    if (perm === 'granted') {
      el.textContent = '✅ Notificaciones activadas. Te recordaremos los días de entrenamiento.';
      document.getElementById('notif-btn').textContent = 'Activado ✓';
      new Notification('Barra Pro', { body: '¡Notificaciones activadas! Te avisaremos cuando sea hora de entrenar.', icon: '' });
    } else {
      el.textContent = '❌ Permiso denegado. Actívalas en la configuración de tu navegador.';
    }
  });
}

async function confirmReset() {
  var ok = await modalDanger('Borrar perfil', 'Se borrarán TODOS los datos de este perfil. Esta acción no se puede deshacer.');
  if (ok) {
    var profileId = getCurrentProfileId();
    localStorage.removeItem(getDBKey(profileId));
    localStorage.removeItem(getTokenKey(profileId));
    localStorage.removeItem(SESSION_DRAFT_KEY);
    location.reload();
  }
}

async function confirmFullReset() {
  var ok1 = await modalDanger('Reset total', 'Esto borra TODOS los perfiles, datos, configuración de GitHub — absolutamente todo vuelve a cero.');
  if (!ok1) return;
  var ok2 = await modalDanger('Última oportunidad', '¿Estás 100% seguro? No se puede deshacer.');
  if (!ok2) return;
  // Clear everything
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && (key.startsWith('barra_pro') || key.startsWith('bpro_') || key.startsWith('bp_'))) {
      keys.push(key);
    }
  }
  keys.forEach(function(k) { localStorage.removeItem(k); });
  location.reload();
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════════════
function exportData() {
  var data = JSON.stringify(DB, null, 2);
  var blob = new Blob([data], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'barra_pro_datos_' + localDateStr() + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  document.getElementById('import-file').click();
}

function handleImport(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      var imported = JSON.parse(evt.target.result);
      var importOk = await modalConfirm('Importar datos', '¿Reemplazar todos los datos actuales con los importados?', '📥');
      if (importOk) {
        Object.assign(DB, imported);
        saveDB();
        renderLog();
        showToast('Datos importados correctamente', '✅');
      }
    } catch(e) { showToast('Archivo inválido', '❌'); }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', function() {
  // Show first main tab
  var tb = document.getElementById('timerBar');
  if (tb) tb.style.display = 'block';
  goMain('entrenar', document.querySelector('.nb'));
  loadDB();
  // Apply dark mode if saved
  if (DB.settings && DB.settings.dark) {
    document.documentElement.setAttribute('data-theme','dark');
  }
  // Apply saved color theme
  if (DB.settings && DB.settings.colorTheme) applyColorTheme(DB.settings.colorTheme);
  // Init display
  renderHoyDate();
  renderLog();
  renderTotalStats();
  // Load checklist state
  loadChecklistState();
  // Show version number
  var versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = 'v' + APP_VERSION;
  // Init profiles
  profilesInit();
  // Check if current profile needs onboarding
  var _currentPid = getCurrentProfileId();
  if (needsOnboarding(_currentPid)) {
    setTimeout(function() { startOnboarding(_currentPid); }, 500);
  }
  // Init GitHub sync
  ghInit();
  // Auto-sync from GitHub on app open
  setTimeout(function() { ghAutoSync(); }, 1500);
  // Check for session draft recovery
  checkSessionDraft();
  // Init PWA updates
  initPWAUpdates();
  // Init swipe navigation
  initSwipeNav();
  // Init keyboard shortcuts
  initKeyboardShortcuts();
  // Init offline detection
  initOfflineDetection();
  // PWA Manifest injection
  (function() {
    var manifest = {"name":"Barra Pro","short_name":"Barra Pro","description":"Tu rutina de dominadas","start_url":"./","display":"standalone","background_color":"#F6F5F1","theme_color":"#2563EB","orientation":"portrait-primary"};
    try {
      var blob = new Blob([JSON.stringify(manifest)], {type:'application/manifest+json'});
      var link = document.getElementById('pwa-manifest');
      if (link) link.href = URL.createObjectURL(blob);
    } catch(e) {}
  })();
  // Mark completed days in HOY
  var todayStr = localDateStr();
  DB.sessions.filter(function(s) { return s.date === todayStr; }).forEach(function(s) {
    var el = document.getElementById('hoy-d' + s.day);
    if (el) el.classList.add('done');
  });
});

// ═══════════════════════════════════════════════════════════════════
// GITHUB SYNC
// ═══════════════════════════════════════════════════════════════════
var GH = {
  username: null, repo: null, token: null,
  filePath: 'datos.json', fileSha: null, lastSync: null
};

function ghInit() {
  GH.username = DB.settings.ghUsername || null;
  GH.repo     = DB.settings.ghRepo     || 'barra-pro';
  // Load token from separate storage (not stored in main DB)
  try {
    var profileId = LS.get(CURRENT_PROFILE_KEY) || 'default';
    var tokenKey = profileId === 'default' ? 'bpro_t' : 'bpro_t_' + profileId;
    var storedT = localStorage.getItem(tokenKey);
    GH.token = storedT ? atob(storedT) : (DB.settings.ghToken || null);
    // Migrate old format if exists
    if (DB.settings.ghToken) {
      var _tKey = (LS.get(CURRENT_PROFILE_KEY)||'default') === 'default' ? 'bpro_t' : 'bpro_t_'+(LS.get(CURRENT_PROFILE_KEY)||'default');
      try { localStorage.setItem(_tKey, btoa(DB.settings.ghToken)); } catch(e) {}
      delete DB.settings.ghToken;
    }
  } catch(e) { GH.token = null; }
  GH.fileSha  = DB.settings.ghFileSha  || null;
  GH.lastSync = DB.settings.ghLastSync || null;
  ghUpdateUI();
}


// ═══════════════════════════════════════════════════════════════════
// AUTO-SYNC ON APP OPEN
// ═══════════════════════════════════════════════════════════════════
async function ghAutoSync() {
  if (!GH.token || !GH.username) return;
  // Only auto-sync once per session
  if (window._ghAutoSynced) return;
  window._ghAutoSynced = true;
  ghSetStatus('syncing', '⏳ Sincronizando...');
  var url = 'https://api.github.com/repos/' + GH.username + '/' + GH.repo + '/contents/' + GH.filePath;
  try {
    var resp = await fetch(url, {
      headers: {
        'Authorization': 'token ' + GH.token,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (resp.status === 404) {
      // No remote data yet — push local data up
      ghSetStatus('connected', '✅ Conectado (sin datos remotos — se subirán al guardar)');
      return;
    }
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var result = await resp.json();
    GH.fileSha = result.sha;
    DB.settings.ghFileSha = result.sha;
    var decoded = decodeURIComponent(escape(atob(result.content.replace(/\n/g,''))));
    var remote;
    try { remote = JSON.parse(decoded); }
    catch(parseErr) {
      console.error('Auto-sync: corrupt remote data', parseErr);
      ghSetStatus('connected', '⚠️ Datos remotos corruptos');
      return;
    }
    // Compare: use remote if it has a newer sync date
    var remoteDate = remote._syncDate ? new Date(remote._syncDate).getTime() : 0;
    var localDate = DB.settings.ghLastSync ? new Date(DB.settings.ghLastSync).getTime() : 0;
    // Also compare data volume (more sessions = more up-to-date)
    var remoteSessions = (remote.sessions || []).length;
    var localSessions = (DB.sessions || []).length;
    var remoteWeights = (remote.weights || []).length;
    var localWeights = (DB.weights || []).length;
    var remoteIsNewer = remoteDate > localDate || 
                        (remoteSessions > localSessions) || 
                        (remoteSessions === localSessions && remoteWeights > localWeights);
    if (remoteIsNewer) {
      // Restore profile metadata if present
      if (remote._profileMeta) {
        var existingProfiles = getProfiles();
        remote._profileMeta.forEach(function(syncedP) {
          var existing = existingProfiles.find(function(p) { return p.id === syncedP.id; });
          if (existing) {
            existing.name = syncedP.name; existing.emoji = syncedP.emoji;
            existing.color = syncedP.color;
            if (syncedP.pinHash) existing.pinHash = syncedP.pinHash;
          } else {
            existingProfiles.push(syncedP);
          }
        });
        saveProfiles(existingProfiles);
      }
      // Clean sync-only fields
      delete remote._profileMeta; delete remote._syncVersion; delete remote._syncDate;
      // Preserve local-only settings
      var ghSettings = { ghUsername:GH.username, ghRepo:GH.repo, ghToken:GH.token, ghFileSha:GH.fileSha };
      var localDark = DB.settings.dark;
      var localPrep = DB.settings.prepDelay;
      var localSound = DB.settings.sound;
      var localVibration = DB.settings.vibration;
      var localTimerSound = DB.settings.timerSound;
      var localWakelock = DB.settings.wakelock;
      Object.assign(DB, remote);
      Object.assign(DB.settings, ghSettings);
      DB.settings.dark = localDark;
      DB.settings.prepDelay = localPrep;
      DB.settings.sound = localSound;
      DB.settings.vibration = localVibration;
      DB.settings.wakelock = localWakelock;
      if (localTimerSound) DB.settings.timerSound = localTimerSound;
      saveDBLocal();
      // Refresh visible data
      renderLog(); renderTotalStats(); renderHoyDate();
  renderDynamicUI();
      ghSetStatus('connected', '✅ Sincronizado desde GitHub');
      showToast('Datos sincronizados desde GitHub', '🔄', 2500);
    } else {
      ghSetStatus('connected', '✅ Conectado — datos locales al día');
    }
    var el = document.getElementById('gh-last-sync');
    if (el) el.textContent = 'Último sync: ' + new Date().toLocaleString('es');
  } catch(e) {
    console.error('Auto-sync error:', e);
    ghSetStatus('connected', '⚠️ Auto-sync falló: ' + e.message);
  }
}

function ghShowSetup() {
  var panel = document.getElementById('gh-setup-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  var u = document.getElementById('gh-username-input');
  var r = document.getElementById('gh-repo-input');
  var t = document.getElementById('gh-token-input');
  if (u && GH.username) u.value = GH.username;
  if (r && GH.repo) r.value = GH.repo;
  // Don't prefill token for security
}

function ghSaveConfig() {
  var u = document.getElementById('gh-username-input').value.trim();
  var r = document.getElementById('gh-repo-input').value.trim() || 'barra-pro';
  var t = document.getElementById('gh-token-input').value.trim();
  if (!u || !t) { showToast('Completa usuario y token', '⚠️'); return; }
  GH.username = u; GH.repo = r; GH.token = t; GH.fileSha = null;
  DB.settings.ghUsername = u;
  DB.settings.ghRepo = r;
  DB.settings.ghFileSha = null;
  // Store token separately (not in main DB object that syncs to GitHub)
  var _profId = LS.get(CURRENT_PROFILE_KEY) || 'default';
  var _tKey = _profId === 'default' ? 'bpro_t' : 'bpro_t_' + _profId;
  try { localStorage.setItem(_tKey, btoa(t)); } catch(e) {}
  saveDBLocal();
  document.getElementById('gh-setup-panel').style.display = 'none';
  ghUpdateUI();
  // Test connection by saving
  ghSave();
}

function ghDisconnect() {
  GH.username = GH.token = GH.fileSha = null;
  DB.settings.ghUsername = DB.settings.ghFileSha = null;
  var _pId = LS.get(CURRENT_PROFILE_KEY) || 'default';
  var _tkKey = _pId === 'default' ? 'bpro_t' : 'bpro_t_' + _pId;
  LS.remove(_tkKey);
  saveDBLocal();
  ghUpdateUI();
}

async function ghSave() {
  if (!GH.token || !GH.username) { ghShowSetup(); return; }
  // Prevent concurrent saves
  if (GH._saving) return;
  GH._saving = true;
  ghSetStatus('syncing', '⏳ Guardando en GitHub...');
  var dbClean, encoded;
  try {
    // Strip sensitive/local-only fields before uploading to GitHub
    // Include profile metadata for cross-device sync
    var profilesMeta = getProfiles().map(function(p) {
      return { id:p.id, name:p.name, emoji:p.emoji, color:p.color, createdAt:p.createdAt, pinHash:p.pinHash||null };
    });
    dbClean = JSON.parse(JSON.stringify(DB));
    dbClean._profileMeta = profilesMeta;
    dbClean._syncVersion = APP_VERSION;
    dbClean._syncDate = new Date().toISOString();
  if (dbClean.settings) {
    delete dbClean.settings.ghToken;
    delete dbClean.settings.ghFileSha;
    delete dbClean.settings.ghLastSync;
    delete dbClean.settings.gdriveToken;
    delete dbClean.settings.gdriveClientId;
  }
    var data = JSON.stringify(dbClean, null, 2);
    encoded = btoa(unescape(encodeURIComponent(data)));
  } catch(e) {
    console.error('ghSave serialize error:', e);
    ghSetStatus('connected', '⚠️ Error al preparar datos');
    GH._saving = false;
    return;
  }
  var url = 'https://api.github.com/repos/' + GH.username + '/' + GH.repo + '/contents/' + GH.filePath;
  try {
    // Step 1: Always fetch current SHA first (avoids 409 conflicts)
    var currentSha = await ghFetchSha();
    // Step 2: Build request body
    var body = {
      message: 'Sync Barra Pro ' + new Date().toLocaleDateString('es'),
      content: encoded,
      committer: { name: 'Barra Pro', email: 'app@barrapro.local' }
    };
    if (currentSha) body.sha = currentSha;
    // Step 3: PUT
    var resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + GH.token,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(body)
    });
    var result = await resp.json();
    if (!resp.ok) {
      var msg = (result && result.message) ? result.message : ('HTTP ' + resp.status);
      if (resp.status === 401) {
        ghSetStatus('disconnected', '⚠️ Token inválido — reconfigura en Ajustes');
      } else if (resp.status === 404) {
        ghSetStatus('disconnected', '⚠️ Repo "' + GH.repo + '" no encontrado');
      } else {
        ghSetStatus('connected', '⚠️ Error ' + resp.status + ': ' + msg);
      }
      GH._saving = false;
      return;
    }
    // Success
    GH.fileSha = result.content && result.content.sha;
    GH.lastSync = new Date().toLocaleString('es');
    DB.settings.ghFileSha  = GH.fileSha;
    DB.settings.ghLastSync = GH.lastSync;
    saveDBLocal();
    ghSetStatus('connected', '✅ Guardado en GitHub');
    var el = document.getElementById('gh-last-sync');
    if (el) el.textContent = 'Último sync: ' + GH.lastSync;
  } catch(e) {
    console.error('GitHub save error:', e);
    ghSetStatus('connected', '⚠️ Error de red: ' + e.message);
  }
  GH._saving = false;
}

async function ghFetchSha() {
  // Returns current SHA of datos.json, or null if file doesn't exist yet
  var url = 'https://api.github.com/repos/' + GH.username + '/' + GH.repo + '/contents/' + GH.filePath;
  try {
    var resp = await fetch(url, {
      headers: {
        'Authorization': 'token ' + GH.token,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (resp.ok) {
      var data = await resp.json();
      GH.fileSha = data.sha;
      DB.settings.ghFileSha = data.sha;
      return data.sha;
    }
    // 404 = file doesn't exist yet, that's fine for first save
    return null;
  } catch(e) {
    return null;
  }
}

async function ghLoad() {
  if (!GH.token || !GH.username) { ghShowSetup(); return; }
  ghSetStatus('syncing', '⏳ Cargando desde GitHub...');
  var url = 'https://api.github.com/repos/' + GH.username + '/' + GH.repo + '/contents/' + GH.filePath;
  try {
    var resp = await fetch(url, {
      headers: {
        'Authorization': 'token ' + GH.token,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (resp.status === 404) {
      ghSetStatus('connected', 'ℹ️ No hay datos guardados todavía');
      return;
    }
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var result = await resp.json();
    GH.fileSha = result.sha;
    DB.settings.ghFileSha = result.sha;
    // Decode base64 content
    var decoded = decodeURIComponent(escape(atob(result.content.replace(/\n/g,''))));
    var imported = JSON.parse(decoded);
    var loadOk = await modalConfirm('Cargar desde GitHub', '¿Reemplazar datos locales con los de GitHub? Esto sobreescribirá tu progreso local.', '🐙');
    if (loadOk) {
      // Restore profile metadata if synced
      if (imported._profileMeta) {
        var existingProfiles = getProfiles();
        imported._profileMeta.forEach(function(syncedP) {
          var existing = existingProfiles.find(function(p) { return p.id === syncedP.id; });
          if (existing) {
            // Update metadata (name, emoji, color, PIN)
            existing.name = syncedP.name;
            existing.emoji = syncedP.emoji;
            existing.color = syncedP.color;
            if (syncedP.pinHash) existing.pinHash = syncedP.pinHash;
          } else {
            // Add new profile from sync
            existingProfiles.push(syncedP);
          }
        });
        saveProfiles(existingProfiles);
      }
      // Clean sync-only fields
      delete imported._profileMeta;
      delete imported._syncVersion;
      delete imported._syncDate;
      // Keep GitHub settings
      var ghSettings = { ghUsername:GH.username, ghRepo:GH.repo, ghToken:GH.token, ghFileSha:GH.fileSha };
      Object.assign(DB, imported);
      // Restore local-only settings that were never uploaded
      Object.assign(DB.settings, ghSettings);
      // Keep dark mode and other local preferences
      if (!DB.settings.prepDelay) DB.settings.prepDelay = 5;
      saveDBLocal();
      renderLog();
      ghUpdateUI();
      ghSetStatus('connected', '✅ Datos cargados desde GitHub');
    } else {
      ghSetStatus('connected', '✅ Conectado a GitHub');
    }
  } catch(e) {
    console.error('GitHub load error:', e);
    ghSetStatus('connected', '⚠️ Error al cargar: ' + e.message);
  }
}

function ghSetStatus(state, text) {
  var dot = document.getElementById('gh-dot');
  var txt = document.getElementById('gh-status-text');
  if (dot) dot.className = 'sync-dot ' + state;
  if (txt) txt.textContent = text;
}

function ghUpdateUI() {
  var connected = !!(GH.token && GH.username);
  var setupBtn      = document.getElementById('gh-setup-btn');
  var saveBtn       = document.getElementById('gh-save-btn');
  var loadBtn       = document.getElementById('gh-load-btn');
  var disconnectBtn = document.getElementById('gh-disconnect-btn');
  if (setupBtn)      setupBtn.style.display      = connected ? 'none'        : 'inline-flex';
  if (saveBtn)       saveBtn.style.display       = connected ? 'inline-flex' : 'none';
  if (loadBtn)       loadBtn.style.display       = connected ? 'inline-flex' : 'none';
  if (disconnectBtn) disconnectBtn.style.display = connected ? 'inline-flex' : 'none';
  if (connected) {
    ghSetStatus('connected', '✅ Conectado — @' + GH.username + '/' + GH.repo);
    var el = document.getElementById('gh-last-sync');
    if (el && GH.lastSync) el.textContent = 'Último sync: ' + GH.lastSync;
  } else {
    ghSetStatus('disconnected', 'No configurado');
  }
}

// Separate localStorage save that doesn't trigger auto-sync loop
function saveDBLocal() {
  var profileId = LS.get(CURRENT_PROFILE_KEY, 'default');
  var dbKey = profileId === 'default' ? DB_KEY_PREFIX : DB_KEY_PREFIX + '_' + profileId;
  var data = JSON.stringify(DB);
  setTimeout(function() { LS.set(dbKey, data); }, 0);
}



// ═══════════════════════════════════════════════════════════════════
// ONBOARDING WIZARD
// ═══════════════════════════════════════════════════════════════════
var ONBOARDING = { step: 1, data: {} };

function startOnboarding(profileId) {
  ONBOARDING.step = 1;
  ONBOARDING.data = { profileId: profileId };
  var overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.classList.add('show');
  renderOnboardingStep();
}

function renderOnboardingStep() {
  var el = document.getElementById('onboarding-content');
  if (!el) return;
  var html = '';
  var step = ONBOARDING.step;

  // Progress bar
  html += '<div style="display:flex;gap:4px;margin-bottom:24px">';
  for (var i = 1; i <= 3; i++) {
    var color = i < step ? 'var(--green)' : i === step ? 'var(--blue)' : 'var(--border)';
    html += '<div style="flex:1;height:4px;border-radius:99px;background:' + color + ';transition:background .3s"></div>';
  }
  html += '</div>';

  if (step === 1) {
    // STEP 1: Weight + Units
    html += '<div style="text-align:center;margin-bottom:20px"><div style="font-size:48px;margin-bottom:8px">⚖️</div>';
    html += '<div style="font-size:20px;font-weight:700;color:var(--ink)">¿Cuánto pesas?</div>';
    html += '<div style="font-size:13px;color:var(--ink3);margin-top:4px">Lo usamos para calcular tu banda y estimar calorías</div></div>';
    html += '<div style="display:flex;justify-content:center;gap:8px;margin-bottom:16px">';
    var unitLb = !ONBOARDING.data.unit || ONBOARDING.data.unit === 'lb';
    html += '<button type="button" class="btn btn-sm ' + (unitLb ? 'btn-blue' : 'btn-ghost') + '" onclick="obSetUnit(\'lb\')">Libras (lb)</button>';
    html += '<button type="button" class="btn btn-sm ' + (!unitLb ? 'btn-blue' : 'btn-ghost') + '" onclick="obSetUnit(\'kg\')">Kilos (kg)</button>';
    html += '</div>';
    var placeholder = unitLb ? '180' : '82';
    var unit = unitLb ? 'lb' : 'kg';
    html += '<div style="display:flex;align-items:baseline;justify-content:center;gap:8px">';
    html += '<input type="number" id="ob-weight" class="pin-entry-field" style="width:120px;font-size:32px;letter-spacing:2px" placeholder="' + placeholder + '" min="30" max="500" step="0.1"';
    if (ONBOARDING.data.weight) html += ' value="' + ONBOARDING.data.weight + '"';
    html += '>';
    html += '<span style="font-size:18px;color:var(--ink3);font-weight:500">' + unit + '</span>';
    html += '</div>';

  } else if (step === 2) {
    // STEP 2: Starting pull-ups
    html += '<div style="text-align:center;margin-bottom:20px"><div style="font-size:48px;margin-bottom:8px">💪</div>';
    html += '<div style="font-size:20px;font-weight:700;color:var(--ink)">¿Cuántas wide pull-ups puedes hacer?</div>';
    html += '<div style="font-size:13px;color:var(--ink3);margin-top:4px">Hoy, al máximo, con forma limpia. Está bien si es 0.</div></div>';
    html += '<div style="display:flex;justify-content:center">';
    html += '<input type="number" id="ob-reps" class="pin-entry-field" style="width:100px;font-size:40px;letter-spacing:2px" placeholder="0" min="0" max="50"';
    if (ONBOARDING.data.reps !== undefined) html += ' value="' + ONBOARDING.data.reps + '"';
    html += '>';
    html += '</div>';
    // Quick context based on common ranges
    html += '<div id="ob-reps-hint" style="text-align:center;margin-top:12px;font-size:13px;color:var(--ink2)"></div>';

  } else if (step === 3) {
    // STEP 3: Summary + confirm
    var w = ONBOARDING.data.weight;
    var u = ONBOARDING.data.unit || 'lb';
    var r = ONBOARDING.data.reps || 0;
    var wLb = u === 'kg' ? Math.round(w * 2.205) : w;
    var band = calcStartBand(r);
    var goals = calcGoals(r);

    html += '<div style="text-align:center;margin-bottom:20px"><div style="font-size:48px;margin-bottom:8px">🚀</div>';
    html += '<div style="font-size:20px;font-weight:700;color:var(--ink)">¡Tu plan está listo!</div>';
    html += '<div style="font-size:13px;color:var(--ink3);margin-top:4px">Esto es lo que calculamos para ti</div></div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">';
    html += '<div style="text-align:center;background:var(--s2);border-radius:var(--rs);padding:14px">';
    html += '<div style="font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.05em">Peso</div>';
    html += '<div style="font-size:24px;font-weight:700;font-family:JetBrains Mono,monospace;color:var(--ink)">' + w + ' ' + u + '</div></div>';
    html += '<div style="text-align:center;background:var(--s2);border-radius:var(--rs);padding:14px">';
    html += '<div style="font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.05em">Pull-ups</div>';
    html += '<div style="font-size:24px;font-weight:700;font-family:JetBrains Mono,monospace;color:var(--blue)">' + r + '</div></div>';
    html += '</div>';

    html += '<div style="background:var(--bbg);border:1px solid var(--bborder);border-radius:var(--rs);padding:12px 14px;margin-bottom:10px;font-size:13px;color:var(--ink2)">';
    html += '<strong style="color:var(--ink)">Tu banda para el Día 3:</strong> ' + band.label;
    html += '<br><span style="font-size:12px">Peso efectivo con banda: ~' + band.effective + ' ' + u + '</span></div>';

    html += '<div style="background:var(--gbg);border:1px solid var(--gborder);border-radius:var(--rs);padding:12px 14px;margin-bottom:10px;font-size:13px;color:var(--ink2)">';
    html += '<strong style="color:var(--ink)">Tus metas:</strong>';
    html += '<br>Semana 4 → ' + goals.week4 + ' reps';
    html += '<br>Semana 7 → ' + goals.week7 + ' reps';
    html += '<br>Semana 10 → ' + goals.week10 + '+ reps</div>';

    if (r === 0) {
      html += '<div class="co am"><div class="ci">💡</div><div class="ct">Como empiezas desde 0, las primeras semanas se enfocan en negativas y banda. ¡Es normal y funciona!</div></div>';
    }
  }

  // Navigation buttons
  html += '<div style="display:flex;gap:8px;margin-top:20px">';
  if (step > 1) {
    html += '<button type="button" class="btn btn-ghost" onclick="obBack()" style="flex:0 0 auto">← Atrás</button>';
  }
  if (step < 3) {
    html += '<button type="button" class="btn btn-blue" onclick="obNext()" style="flex:1;justify-content:center">' + (step === 1 ? 'Siguiente →' : 'Siguiente →') + '</button>';
  } else {
    html += '<button type="button" class="btn btn-green" onclick="obFinish()" style="flex:1;justify-content:center">💪 ¡Empezar!</button>';
  }
  html += '</div>';

  el.innerHTML = html;

  // Auto-focus inputs
  setTimeout(function() {
    if (step === 1) { var inp = document.getElementById('ob-weight'); if (inp) inp.focus(); }
    if (step === 2) { var inp = document.getElementById('ob-reps'); if (inp) inp.focus(); }
  }, 200);
}

function obSetUnit(u) {
  ONBOARDING.data.unit = u;
  renderOnboardingStep();
}

function obNext() {
  if (ONBOARDING.step === 1) {
    var w = parseFloat(document.getElementById('ob-weight').value);
    if (!w || w < 30 || w > 500) { showToast('Ingresa un peso válido', '⚠️'); return; }
    ONBOARDING.data.weight = Math.round(w * 10) / 10;
    if (!ONBOARDING.data.unit) ONBOARDING.data.unit = 'lb';
  } else if (ONBOARDING.step === 2) {
    var r = parseInt(document.getElementById('ob-reps').value);
    if (isNaN(r) || r < 0 || r > 50) { showToast('Ingresa un número válido (0-50)', '⚠️'); return; }
    ONBOARDING.data.reps = r;
  }
  ONBOARDING.step++;
  renderOnboardingStep();
}

function obBack() {
  if (ONBOARDING.step > 1) { ONBOARDING.step--; renderOnboardingStep(); }
}

function obFinish() {
  var d = ONBOARDING.data;
  var profileId = d.profileId;
  var wLb = d.unit === 'kg' ? Math.round(d.weight * 2.205) : d.weight;

  // Store profile setup data
  var profiles = getProfiles();
  var profile = profiles.find(function(p) { return p.id === profileId; });
  if (profile) {
    profile.startWeight = d.weight;
    profile.startReps = d.reps;
    profile.weightUnit = d.unit;
    profile.onboarded = true;
    saveProfiles(profiles);
  }

  // Initialize DB for this profile with their data
  var band = calcStartBand(d.reps);
  DB.settings.weightUnit = d.unit;
  DB.settings.startWeight = d.weight;
  DB.settings.startReps = d.reps;
  DB.pullupLog = [{ sem: 'Inicio', pu: d.reps, banda: band.key, diff: null }];
  DB.weights = [{ date: localDateStr(), weight: d.weight }];
  saveDBLocal();

  // Close overlay
  var overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.classList.remove('show');

  // Refresh UI
  renderLog(); renderTotalStats(); renderHoyDate();
  renderDynamicUI(); renderPeso();
  showToast('¡Perfil configurado! A entrenar 💪', '🎉', 3500);
}

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC CALCULATIONS (replaces hardcoded values)
// ═══════════════════════════════════════════════════════════════════

function getProfileWeight() {
  // Returns current weight in the user's preferred unit
  if (DB.weights && DB.weights.length > 0) return DB.weights[0].weight;
  return DB.settings.startWeight || 150;
}

function getProfileWeightLb() {
  var w = getProfileWeight();
  var unit = DB.settings.weightUnit || 'lb';
  return unit === 'kg' ? Math.round(w * 2.205) : w;
}

function getWeightUnit() {
  return DB.settings.weightUnit || 'lb';
}

function getWeightDisplay(val) {
  if (val === undefined || val === null) return '—';
  return val + ' ' + getWeightUnit();
}

function getStartReps() {
  if (DB.settings.startReps !== undefined) return DB.settings.startReps;
  // Legacy fallback
  if (DB.pullupLog && DB.pullupLog.length > 0) return DB.pullupLog[0].pu;
  return 0;
}

function calcStartBand(reps) {
  // Determine recommended starting band based on current pull-up ability
  if (reps === undefined) reps = getStartReps();
  if (reps <= 1)  return { key:'morada', label:'🟣 Morada (máxima asistencia)', effective: '~50%' };
  if (reps <= 3)  return { key:'azul', label:'🔵 Azul (alta asistencia)', effective: '~60%' };
  if (reps <= 6)  return { key:'roja', label:'🟠 Roja (moderada)', effective: '~70%' };
  if (reps <= 9)  return { key:'naranja', label:'🟡 Naranja (ligera)', effective: '~85%' };
  return { key:'sin', label:'💪 Sin banda', effective: '100%' };
}

function calcCurrentBand() {
  // Based on latest pull-up data
  var latest = DB.pullupLog && DB.pullupLog.length > 0 ? DB.pullupLog[DB.pullupLog.length - 1] : null;
  if (!latest) return calcStartBand(getStartReps());
  return calcStartBand(latest.pu);
}

function calcGoals(startReps) {
  if (startReps === undefined) startReps = getStartReps();
  var s = Math.max(0, startReps);
  return {
    week4:  Math.max(5, Math.round(s * 1.75) || 5),
    week7:  Math.max(8, Math.round(s * 2.75) || 8),
    week10: Math.max(12, Math.round(s * 3.5) || 12)
  };
}

function getBandEffectiveWeight(bandKey) {
  var wLb = getProfileWeightLb();
  var assist = { morada: [100,125], azul: [60,100], roja: [30,60], naranja: [15,30], amarilla: [5,10], sin: [0,0] };
  var a = assist[bandKey] || [0,0];
  var low = wLb - a[1];
  var high = wLb - a[0];
  var unit = getWeightUnit();
  if (unit === 'kg') { low = Math.round(low / 2.205); high = Math.round(high / 2.205); }
  return '~' + Math.max(0, low) + '-' + Math.max(0, high) + ' ' + unit;
}

function getWeekOptions() {
  // Generate week options dynamically based on current progress
  var current = DB.pullupLog ? DB.pullupLog.length : 1;
  var opts = [];
  for (var i = current; i <= Math.max(current + 5, 10); i++) {
    opts.push('Sem ' + i);
  }
  return opts;
}

function needsOnboarding(profileId) {
  var profiles = getProfiles();
  var profile = profiles.find(function(p) { return p.id === profileId; });
  return profile && !profile.onboarded;
}

// ═══════════════════════════════════════════════════════════════════
// PIN AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════
var PIN_PENDING_PROFILE = null; // profile id waiting for PIN entry

async function hashPin(pin) {
  // SHA-256 hash via Web Crypto API (available in all modern browsers)
  var data = new TextEncoder().encode('bpro_salt_' + pin);
  var buf = await crypto.subtle.digest('SHA-256', data);
  var arr = Array.from(new Uint8Array(buf));
  return arr.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function setupPin() {
  var pin1 = document.getElementById('pin-new-input').value.trim();
  var pin2 = document.getElementById('pin-confirm-input').value.trim();
  if (!pin1 || pin1.length !== 4 || !/^\d{4}$/.test(pin1)) {
    showToast('El PIN debe ser exactamente 4 dígitos', '⚠️');
    return;
  }
  if (pin1 !== pin2) {
    showToast('Los PINs no coinciden', '⚠️');
    return;
  }
  var hash = await hashPin(pin1);
  var profiles = getProfiles();
  var currentId = getCurrentProfileId();
  var profile = profiles.find(function(p) { return p.id === currentId; });
  if (profile) {
    profile.pinHash = hash;
    saveProfiles(profiles);
    showToast('PIN configurado ✓', '🔒');
    renderPinSettingsUI();
    document.getElementById('pin-new-input').value = '';
    document.getElementById('pin-confirm-input').value = '';
  }
}

async function removePin() {
  var ok = await modalConfirm('Quitar PIN', '¿Quitar la protección PIN de este perfil?', '🔓');
  if (!ok) return;
  var profiles = getProfiles();
  var currentId = getCurrentProfileId();
  var profile = profiles.find(function(p) { return p.id === currentId; });
  if (profile) {
    delete profile.pinHash;
    saveProfiles(profiles);
    showToast('PIN eliminado', '🔓');
    renderPinSettingsUI();
  }
}

function renderPinSettingsUI() {
  var el = document.getElementById('pin-settings-content');
  if (!el) return;
  var profiles = getProfiles();
  var currentId = getCurrentProfileId();
  var profile = profiles.find(function(p) { return p.id === currentId; });
  var hasPin = profile && profile.pinHash;
  var html = '';
  if (hasPin) {
    html += '<div class="co gr" style="margin-bottom:10px"><div class="ci">🔒</div><div class="ct"><strong>PIN activo</strong> — este perfil está protegido.</div></div>';
    html += '<div style="display:flex;gap:8px">';
    html += '<button type="button" class="btn btn-ghost btn-sm" onclick="showChangePinUI()">Cambiar PIN</button>';
    html += '<button type="button" class="btn btn-danger btn-sm" onclick="removePin()">Quitar PIN</button>';
    html += '</div>';
    html += '<div id="change-pin-panel" style="display:none;margin-top:12px">';
    html += '<label style="font-size:12px;font-weight:500;color:var(--ink2);display:block;margin-bottom:4px">PIN actual</label>';
    html += '<input type="password" class="sync-input" id="pin-current-input" placeholder="••••" maxlength="4" inputmode="numeric" pattern="[0-9]*" style="max-width:120px;text-align:center;font-size:20px;letter-spacing:8px">';
    html += '<label style="font-size:12px;font-weight:500;color:var(--ink2);display:block;margin-top:8px;margin-bottom:4px">Nuevo PIN</label>';
    html += '<input type="password" class="sync-input" id="pin-change-new" placeholder="••••" maxlength="4" inputmode="numeric" pattern="[0-9]*" style="max-width:120px;text-align:center;font-size:20px;letter-spacing:8px">';
    html += '<div style="margin-top:8px"><button type="button" class="btn btn-blue btn-sm" onclick="changePin()">Guardar nuevo PIN</button></div>';
    html += '</div>';
  } else {
    html += '<div class="co bl" style="margin-bottom:10px"><div class="ci">🔓</div><div class="ct">Sin PIN. Cualquiera puede abrir este perfil.</div></div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;max-width:200px">';
    html += '<label style="font-size:12px;font-weight:500;color:var(--ink2)">Nuevo PIN (4 dígitos)</label>';
    html += '<input type="password" class="sync-input" id="pin-new-input" placeholder="••••" maxlength="4" inputmode="numeric" pattern="[0-9]*" style="max-width:120px;text-align:center;font-size:20px;letter-spacing:8px">';
    html += '<label style="font-size:12px;font-weight:500;color:var(--ink2)">Confirmar PIN</label>';
    html += '<input type="password" class="sync-input" id="pin-confirm-input" placeholder="••••" maxlength="4" inputmode="numeric" pattern="[0-9]*" style="max-width:120px;text-align:center;font-size:20px;letter-spacing:8px">';
    html += '<button type="button" class="btn btn-blue btn-sm" style="margin-top:4px" onclick="setupPin()">🔒 Activar PIN</button>';
    html += '</div>';
  }
  el.innerHTML = html;
}

function showChangePinUI() {
  var panel = document.getElementById('change-pin-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function changePin() {
  var current = document.getElementById('pin-current-input').value.trim();
  var newPin = document.getElementById('pin-change-new').value.trim();
  if (!current || current.length !== 4) { showToast('Ingresa tu PIN actual', '⚠️'); return; }
  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { showToast('Nuevo PIN debe ser 4 dígitos', '⚠️'); return; }
  var profiles = getProfiles();
  var currentId = getCurrentProfileId();
  var profile = profiles.find(function(p) { return p.id === currentId; });
  if (!profile || !profile.pinHash) return;
  var currentHash = await hashPin(current);
  if (currentHash !== profile.pinHash) {
    showToast('PIN actual incorrecto', '❌');
    return;
  }
  profile.pinHash = await hashPin(newPin);
  saveProfiles(profiles);
  showToast('PIN cambiado ✓', '🔒');
  renderPinSettingsUI();
}

// PIN ENTRY OVERLAY
function showPinOverlay(profileId) {
  PIN_PENDING_PROFILE = profileId;
  var profiles = getProfiles();
  var profile = profiles.find(function(p) { return p.id === profileId; });
  if (!profile) return;
  var overlay = document.getElementById('pin-overlay');
  if (!overlay) return;
  var nameEl = document.getElementById('pin-overlay-name');
  if (nameEl) nameEl.textContent = profile.emoji + ' ' + profile.name;
  document.getElementById('pin-entry-input').value = '';
  document.getElementById('pin-error-msg').style.display = 'none';
  overlay.classList.add('show');
  setTimeout(function() {
    document.getElementById('pin-entry-input').focus();
  }, 200);
}

function hidePinOverlay() {
  var overlay = document.getElementById('pin-overlay');
  if (overlay) overlay.classList.remove('show');
  PIN_PENDING_PROFILE = null;
}

async function submitPin() {
  var pin = document.getElementById('pin-entry-input').value.trim();
  if (!pin || pin.length !== 4) {
    document.getElementById('pin-error-msg').textContent = 'Ingresa 4 dígitos';
    document.getElementById('pin-error-msg').style.display = 'block';
    return;
  }
  var profiles = getProfiles();
  var profile = profiles.find(function(p) { return p.id === PIN_PENDING_PROFILE; });
  if (!profile || !profile.pinHash) { hidePinOverlay(); return; }
  var hash = await hashPin(pin);
  if (hash === profile.pinHash) {
    hidePinOverlay();
    switchProfile(PIN_PENDING_PROFILE);
  } else {
    document.getElementById('pin-error-msg').textContent = 'PIN incorrecto';
    document.getElementById('pin-error-msg').style.display = 'block';
    document.getElementById('pin-entry-input').value = '';
    document.getElementById('pin-entry-input').focus();
    // Shake animation
    var input = document.getElementById('pin-entry-input');
    input.classList.add('pin-shake');
    setTimeout(function() { input.classList.remove('pin-shake'); }, 500);
  }
}

function handlePinKeydown(e) {
  if (e.key === 'Enter') submitPin();
  if (e.key === 'Escape') hidePinOverlay();
}

// ═══════════════════════════════════════════════════════════════════
// PROFILES
// ═══════════════════════════════════════════════════════════════════
var PROFILE_EMOJIS = ['💪','🏋️','⚡','🔥','🎯','🦾','🏅','⭐','🚀','😤','👊','🐉'];
var PROFILE_COLORS = ['#2563EB','#15803D','#7C3AED','#C2410C','#0E7490','#BE185D','#854D0E','#1D4ED8','#166534','#6D28D9'];
var CURRENT_PROFILE_KEY = 'bpro_current_profile';
var PROFILES_INDEX_KEY  = 'bpro_profiles';
var selectedEmoji = '💪';
var selectedColor = '#2563EB';

// Profile data structure
// localStorage keys:
//   bpro_profiles        → JSON array of {id, name, emoji, color, createdAt}
//   bpro_current_profile → current profile id
//   barra_pro_v2_{id}    → DB for each profile
//   bpro_t_{id}          → GitHub token for each profile

function getProfiles() {
  try { return JSON.parse(LS.get(PROFILES_INDEX_KEY)) || []; } catch(e) { return []; }
}

function saveProfiles(profiles) {
  try { LS.setJSON(PROFILES_INDEX_KEY, profiles); } catch(e) {}
}

function getCurrentProfileId() {
  return LS.get(CURRENT_PROFILE_KEY) || 'default';
}

function getDBKey(profileId) {
  return profileId === 'default' ? DB_KEY_PREFIX : 'barra_pro_v2_' + profileId;
}

function getTokenKey(profileId) {
  return profileId === 'default' ? 'bpro_t' : 'bpro_t_' + profileId;
}

function profilesInit() {
  // Ensure default profile exists in index
  var profiles = getProfiles();
  var profileId = getCurrentProfileId();
  if (profiles.length === 0) {
    // First run — create default profile
    var defaultProfile = {
      id: 'default',
      name: 'Mi perfil',
      emoji: '💪',
      color: '#2563EB',
      createdAt: localDateStr()
    };
    profiles = [defaultProfile];
    saveProfiles(profiles);
  }
  // Legacy: if default profile has data but no onboarded flag, mark it
  var _defP = profiles.find(function(p) { return p.id === 'default'; });
  if (_defP && !_defP.onboarded) {
    var _defDB = localStorage.getItem(getDBKey('default'));
    if (_defDB) {
      try {
        var _parsed = JSON.parse(_defDB);
        if (_parsed.sessions && _parsed.sessions.length > 0) {
          _defP.onboarded = true;
          _defP.startWeight = 208;
          _defP.startReps = 4;
          _defP.weightUnit = 'lb';
          saveProfiles(profiles);
        }
      } catch(e) {}
    }
  }
  renderProfileAvatar();
  // Close dropdown on outside click
  document.addEventListener('click', function(e) {
    var dd = document.getElementById('profile-dropdown');
    var sw = document.getElementById('profile-switcher');
    if (dd && !dd.classList.contains('hidden') && !dd.contains(e.target) && !sw.contains(e.target)) {
      dd.classList.add('hidden');
    }
  });
}

function renderProfileAvatar() {
  var profiles = getProfiles();
  var currentId = getCurrentProfileId();
  var current = profiles.find(function(p) { return p.id === currentId; }) || profiles[0];
  if (!current) return;
  var avatar = document.getElementById('current-profile-avatar');
  if (avatar) {
    avatar.textContent = current.emoji || current.name[0].toUpperCase();
    avatar.style.background = current.color || 'var(--blue)';
    avatar.style.border = '2px solid ' + (current.color || 'var(--blue)');
    avatar.title = current.name + ' — cambiar perfil';
  }
}

function toggleProfileDropdown() {
  var dd = document.getElementById('profile-dropdown');
  if (!dd) return;
  var isHidden = dd.classList.contains('hidden');
  dd.classList.toggle('hidden', !isHidden);
  if (isHidden) {
    renderProfileList();
    document.getElementById('profile-create-panel').classList.remove('open');
  }
}

function renderProfileList() {
  var profiles = getProfiles();
  var currentId = getCurrentProfileId();
  var list = document.getElementById('profile-list');
  if (!list) return;
  var html = '';
  profiles.forEach(function(p) {
    var isCurrent = p.id === currentId;
    var stats = getProfileStats(p.id);
    var canDelete = profiles.length > 1 && !isCurrent;
    var color = p.color || '#2563EB';
    var avatar = p.emoji || p.name.charAt(0).toUpperCase();
    html += '<div class="profile-item' + (isCurrent ? ' current' : '') + '" data-pid="' + p.id + '" onclick="handleProfileClick(this)">';
    html += '<div class="profile-item-avatar" style="background:' + color + ';color:#fff">' + avatar + '</div>';
    html += '<div class="profile-item-info">';
    html += '<div class="profile-item-name">' + sanitize(p.name) + '</div>';
    html += '<div class="profile-item-stats">' + stats + '</div>';
    html += '</div>';
    if (isCurrent) html += '<span class="profile-item-check">&#10003;</span>';
    if (p.pinHash) html += '<span style="font-size:12px;opacity:.6;margin-right:2px" title="Protegido con PIN">🔒</span>';
    if (canDelete) html += '<button type="button" class="profile-item-delete" data-pid="' + p.id + '" onclick="handleProfileDelete(event,this)" title="Eliminar">&#x1F5D1;</button>';
    html += '</div>';
  });
  list.innerHTML = html;
}

function getProfileStats(profileId) {
  try {
    var key = getDBKey(profileId);
    var data = JSON.parse(localStorage.getItem(key));
    if (!data) return 'Sin datos';
    var pullups = data.pullupLog ? data.pullupLog.length : 0;
    var sessions = data.sessions ? data.sessions.length : 0;
    var best = data.pullupLog && data.pullupLog.length > 0
      ? Math.max.apply(null, data.pullupLog.map(function(e){return e.pu||0;}))
      : 0;
    return sessions + ' sesiones · mejor: ' + best + ' pull-ups';
  } catch(e) { return 'Sin datos'; }
}

function switchProfile(profileId) {
  if (profileId === getCurrentProfileId()) {
    document.getElementById('profile-dropdown').classList.add('hidden');
    return;
  }
  // Save current DB before switching
  saveDBLocal();
  // Switch
  LS.set(CURRENT_PROFILE_KEY, profileId);
  // Load new profile's DB
  var newKey = getDBKey(profileId);
  try {
    var saved = localStorage.getItem(newKey);
    if (saved) {
      DB = JSON.parse(saved);
      // Ensure arrays exist
      if (!Array.isArray(DB.pullupLog)) DB.pullupLog = [];
      if (!Array.isArray(DB.weights)) DB.weights = [];
      if (!Array.isArray(DB.sessions)) DB.sessions = [];
      if (!DB.records) DB.records = {};
      if (!DB.settings) DB.settings = {dark:false,sound:true,vibration:true,wakelock:true,prepDelay:5};
      if (!DB.achievements) DB.achievements = {};
    } else {
      // New profile — start fresh
      DB = {
        settings:{dark:false,sound:true,vibration:true,wakelock:true,prepDelay:5},
        pullupLog:[],
        weights:[], sessions:[], records:{}, totalTrainingTime:0,
        streak:0, lastTrainingDate:null, achievements:{}
      };
    }
  } catch(e) {
    console.error('Profile load error:', e);
  }
  // Load GitHub token for this profile
  try {
    var storedT = localStorage.getItem(getTokenKey(profileId));
    GH.token = storedT ? atob(storedT) : null;
    GH.username = DB.settings.ghUsername || null;
    GH.repo = DB.settings.ghRepo || 'barra-pro';
    GH.fileSha = DB.settings.ghFileSha || null;
  } catch(e) { GH.token = null; }
  // Apply settings
  document.documentElement.setAttribute('data-theme', DB.settings.dark ? 'dark' : 'light');
  if (DB.settings.colorTheme) applyColorTheme(DB.settings.colorTheme);
  // Update UI
  renderProfileAvatar();
  renderLog();
  renderTotalStats();
  loadChecklistState();
  renderHoyDate();
  renderDynamicUI();
  document.getElementById('profile-dropdown').classList.add('hidden');
  // Reset HOY state
  resetHoy();
}

function showCreateProfile() {
  var panel = document.getElementById('profile-create-panel');
  panel.classList.add('open');
  // Render emoji grid
  var emojiGrid = document.getElementById('profile-emoji-grid');
  if (emojiGrid) {
    emojiGrid.innerHTML = PROFILE_EMOJIS.map(function(em) {
      var sel = em === selectedEmoji ? ' selected' : '';
      return '<button type="button" class="profile-emoji-btn' + sel + '" data-emoji="' + em + '" onclick="selectEmoji(this.getAttribute(String.fromCharCode(100,97,116,97,45,101,109,111,106,105)))">' + em + '</button>';
    }).join('');
    // Simpler: rebuild with event delegation approach
    emojiGrid.innerHTML = '';
    PROFILE_EMOJIS.forEach(function(em) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'profile-emoji-btn' + (em === selectedEmoji ? ' selected' : '');
      btn.textContent = em;
      btn.onclick = function() { selectEmoji(em); };
      emojiGrid.appendChild(btn);
    });
  }
  // Render color grid
  var colorGrid = document.getElementById('profile-color-grid');
  if (colorGrid) {
    colorGrid.innerHTML = '';
    PROFILE_COLORS.forEach(function(c) {
      var div = document.createElement('div');
      div.className = 'profile-color-btn' + (c === selectedColor ? ' selected' : '');
      div.style.background = c;
      div.onclick = function() { selectColor(c); };
      colorGrid.appendChild(div);
    });
  }
  document.getElementById('profile-name-input').focus();
}

function selectEmoji(emoji) {
  selectedEmoji = emoji;
  document.querySelectorAll('.profile-emoji-btn').forEach(function(b) {
    b.classList.toggle('selected', b.textContent === emoji);
  });
}

function selectColor(color) {
  selectedColor = color;
  document.querySelectorAll('.profile-color-btn').forEach(function(b) {
    b.classList.toggle('selected', b.style.background === color);
  });
}

function createProfile() {
  var nameInput = document.getElementById('profile-name-input');
  var name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  // Validate: no whitespace-only
  if (!/\S/.test(name)) { showToast('El nombre no puede ser solo espacios', '⚠️'); nameInput.focus(); return; }
  var profiles = getProfiles();
  if (profiles.length >= 10) { showToast('Máximo 10 perfiles', '⚠️'); return; }
  // Validate: no duplicate names (case-insensitive)
  var nameLower = name.toLowerCase();
  var duplicate = profiles.find(function(p) { return p.name.toLowerCase() === nameLower; });
  if (duplicate) {
    showToast('Ya existe un perfil con ese nombre', '⚠️');
    nameInput.focus();
    return;
  }
  var id = 'p_' + Date.now();
  var newProfile = {id:id, name:name, emoji:selectedEmoji, color:selectedColor, createdAt:localDateStr()};
  profiles.push(newProfile);
  saveProfiles(profiles);
  // Switch to new profile (this loads empty DB)
  switchProfile(id);
  // Trigger onboarding wizard
  setTimeout(function() { startOnboarding(id); }, 300);
}

function handleProfileClick(el) {
  var pid = el.getAttribute('data-pid');
  if (!pid) return;
  // Check if target profile has PIN
  if (pid !== getCurrentProfileId()) {
    var profiles = getProfiles();
    var profile = profiles.find(function(p) { return p.id === pid; });
    if (profile && profile.pinHash) {
      document.getElementById('profile-dropdown').classList.add('hidden');
      showPinOverlay(pid);
      return;
    }
  }
  switchProfile(pid);
}
function handleProfileDelete(event, btn) {
  event.stopPropagation();
  var pid = btn.getAttribute('data-pid');
  if (pid) deleteProfile(event, pid);
}

function cancelCreateProfile() {
  document.getElementById('profile-create-panel').classList.remove('open');
  document.getElementById('profile-name-input').value = '';
}

async function deleteProfile(event, profileId) {
  event.stopPropagation();
  var profiles = getProfiles();
  var profile = profiles.find(function(p){return p.id===profileId;});
  if (!profile) return;
  var delOk = await modalDanger('Eliminar perfil', '¿Eliminar "' + profile.name + '"? Se borrarán todos sus datos.');
  if (!delOk) return;
  // Remove data
  try { localStorage.removeItem(getDBKey(profileId)); } catch(e) {}
  try { localStorage.removeItem(getTokenKey(profileId)); } catch(e) {}
  // Remove from index
  var updated = profiles.filter(function(p){return p.id!==profileId;});
  saveProfiles(updated);
  renderProfileList();
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS (single source of truth — easy to update)
// ═══════════════════════════════════════════════════════════════════
var APP_VERSION   = '4.0.0';
var DB_KEY_PREFIX = 'barra_pro_v2';
var SYNC_DEBOUNCE = 8000; // ms

// ═══════════════════════════════════════════════════════════════════
// OFFLINE DETECTION
// ═══════════════════════════════════════════════════════════════════

// COUNTDOWN BEEP
function playCountdownBeep() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 660;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.13);
  } catch(e) {}
}

// BAND SUGGESTION
var BAND_PROGRESSION = ['morada','azul','roja','naranja','amarilla','sin'];
var BAND_LABELS = { morada:'🟣 Morada',azul:'🔵 Azul',roja:'🟠 Roja',naranja:'🟡 Naranja',amarilla:'🔶 Amarilla',sin:'💪 Sin banda' };

function getBandSuggestion() {
  var lastEntry = DB.pullupLog.slice().reverse().find(function(e){return e.banda;});
  if (!lastEntry) return null;
  var lastBand = lastEntry.banda;
  var consec = 0;
  for (var i = DB.pullupLog.length-1; i>=0; i--) {
    if (DB.pullupLog[i].banda === lastBand) consec++; else break;
  }
  var idx = BAND_PROGRESSION.indexOf(lastBand);
  return {
    current: lastBand, currentLabel: BAND_LABELS[lastBand]||lastBand,
    consecutive: consec, shouldProgress: consec >= 2,
    nextBand: idx>=0&&idx<BAND_PROGRESSION.length-1?BAND_PROGRESSION[idx+1]:null,
    nextLabel: idx>=0&&idx<BAND_PROGRESSION.length-1?(BAND_LABELS[BAND_PROGRESSION[idx+1]]||BAND_PROGRESSION[idx+1]):null
  };
}

function renderBandSuggestion() {
  var el = document.getElementById('band-suggestion');
  if (!el) return;
  var s = getBandSuggestion();
  if (!s) { el.style.display='none'; return; }
  el.style.display='block';
  var html = '<div style="display:flex;align-items:flex-start;gap:10px"><span style="font-size:20px">🎗️</span><div>';
  html += '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:3px">Banda para hoy</div>';
  if (s.shouldProgress && s.nextBand) {
    html += '<div style="font-size:13px;color:var(--orange)">⬆️ Prueba subir a <strong>'+sanitize(s.nextLabel)+'</strong></div>';
    html += '<div style="font-size:11px;color:var(--ink3);margin-top:2px">Llevas '+s.consecutive+' sem con '+sanitize(s.currentLabel)+'</div>';
  } else {
    html += '<div style="font-size:13px;color:var(--ink2)">Usa <strong>'+sanitize(s.currentLabel)+'</strong></div>';
    if (s.consecutive>0) html += '<div style="font-size:11px;color:var(--ink3);margin-top:2px">Llevas '+s.consecutive+' sem con esta banda</div>';
  }
  html += '</div></div>';
  el.innerHTML = html;
}

// WEEK COMPARISON
function getWeekComparison() {
  if (DB.pullupLog.length < 2) return null;
  var cur = DB.pullupLog[DB.pullupLog.length-1];
  var prev= DB.pullupLog[DB.pullupLog.length-2];
  var diff = cur.pu - prev.pu;
  return { currentPU:cur.pu, previousPU:prev.pu, currentSem:cur.sem, previousSem:prev.sem,
           diff:diff, pct:prev.pu>0?Math.round((diff/prev.pu)*100):0 };
}

function renderWeekComparison() {
  var el = document.getElementById('week-comparison');
  if (!el) return;
  var c = getWeekComparison();
  if (!c) { el.innerHTML='<div class="co bl"><div class="ci">ℹ️</div><div class="ct">Registra al menos 2 semanas para ver la comparación.</div></div>'; return; }
  var arrow=c.diff>0?'📈':c.diff<0?'📉':'➡️';
  var color=c.diff>0?'var(--green)':c.diff<0?'var(--red)':'var(--ink3)';
  var html='<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center">';
  html+='<div style="text-align:center;background:var(--s2);border-radius:var(--rs);padding:12px 8px">';
  html+='<div style="font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">'+sanitize(c.previousSem)+'</div>';
  html+='<div style="font-size:28px;font-weight:700;font-family:JetBrains Mono,monospace;color:var(--ink)">'+c.previousPU+'</div>';
  html+='<div style="font-size:11px;color:var(--ink3)">pull-ups</div></div>';
  html+='<div style="text-align:center"><div style="font-size:22px">'+arrow+'</div>';
  html+='<div style="font-size:13px;font-weight:700;color:'+color+'">'+(c.diff>=0?'+':'')+c.diff+'</div></div>';
  html+='<div style="text-align:center;background:var(--gbg);border:1px solid var(--gborder);border-radius:var(--rs);padding:12px 8px">';
  html+='<div style="font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">'+sanitize(c.currentSem)+'</div>';
  html+='<div style="font-size:28px;font-weight:700;font-family:JetBrains Mono,monospace;color:var(--green)">'+c.currentPU+'</div>';
  html+='<div style="font-size:11px;color:var(--ink3)">pull-ups</div></div></div>';
  if (c.diff!==0) html+='<div style="text-align:center;margin-top:10px;font-size:13px;color:'+color+';font-weight:600">'+(c.diff>=0?'+':'')+c.diff+' rep'+(Math.abs(c.diff)!==1?'s':'')+(c.pct!==0?' ('+( c.pct>=0?'+':'')+c.pct+'%)':'')+(c.diff>0?' 🔥':'')+'</div>';
  el.innerHTML = html;
}

// PREDICTOR WEEK 10
function calcPredictor() {
  if (DB.pullupLog.length < 2) return null;
  var n=DB.pullupLog.length, xS=0, yS=0, xyS=0, xxS=0;
  DB.pullupLog.forEach(function(e,i){xS+=i;yS+=e.pu;xyS+=i*e.pu;xxS+=i*i;});
  var slope=(n*xyS-xS*yS)/(n*xxS-xS*xS);
  var intercept=(yS-slope*xS)/n;
  var cur=DB.pullupLog[n-1].pu;
  return {
    week4:  Math.max(cur, Math.round(intercept+slope*3)),
    week7:  Math.max(cur, Math.round(intercept+slope*6)),
    week10: Math.max(cur, Math.round(intercept+slope*9)),
    weeklyGain: slope.toFixed(1),
    onTrack10: Math.round(intercept+slope*9)>=14,
    onTrack7:  Math.round(intercept+slope*6)>=11,
    onTrack4:  Math.round(intercept+slope*3)>=7
  };
}

function renderPredictor() {
  var el=document.getElementById('predictor-container');
  if (!el) return;
  var p=calcPredictor();
  if (!p) { el.innerHTML='<div class="card"><div class="card-title">🔮 Predictor</div><div class="co bl" style="margin:0"><div class="ci">ℹ️</div><div class="ct">Registra al menos 2 semanas para ver la predicción.</div></div></div>'; return; }
  var html='<div class="card"><div class="card-title">🔮 Predictor — basado en tu tendencia actual</div>';
  html+='<div style="font-size:12px;color:var(--ink3);margin-bottom:12px">Progresión semanal: <strong style="color:var(--blue)">+'+(p.weeklyGain>=0?p.weeklyGain:'0')+' reps/sem</strong></div>';
  html+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px">';
  [{week:4,label:'Sem 4',val:p.week4,ok:p.onTrack4,meta:7},{week:7,label:'Sem 7',val:p.week7,ok:p.onTrack7,meta:11},{week:10,label:'Sem 10',val:p.week10,ok:p.onTrack10,meta:14}].forEach(function(item){
    var color=item.ok?'var(--green)':'var(--amber)';
    var bg=item.ok?'var(--gbg)':'var(--abg)';
    var border=item.ok?'var(--gborder)':'var(--aborder)';
    html+='<div style="text-align:center;background:'+bg+';border:1px solid '+border+';border-radius:var(--rs);padding:12px 6px">';
    html+='<div style="font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">'+item.label+'</div>';
    html+='<div style="font-size:26px;font-weight:700;font-family:JetBrains Mono,monospace;color:'+color+'">'+item.val+'</div>';
    html+='<div style="font-size:10px;color:var(--ink3)">meta: '+item.meta+'</div></div>';
  });
  html+='</div><div class="co '+(p.onTrack10?'gr':'am')+'"><div class="ci">'+(p.onTrack10?'✅':'⚠️')+'</div>';
  html+='<div class="ct">'+(p.onTrack10?'<strong>¡Vas camino a 14+ reps!</strong> Mantén la consistencia.':'<strong>Necesitas acelerar un poco.</strong> Enfócate en las negativas.')+'</div></div></div>';
  el.innerHTML=html;
}

// WEEKLY CHALLENGE
function generateWeeklyChallenge() {
  var monday=getMondayOfWeek();
  var cKey='bpro_ch_'+monday;
  try { var c=LS.get(cKey); if(c) return JSON.parse(c); } catch(e) {}
  var best=DB.pullupLog.length>0?Math.max.apply(null,DB.pullupLog.map(function(e){return e.pu;})):4;
  var last=DB.pullupLog.length>0?DB.pullupLog[DB.pullupLog.length-1].pu:getStartReps();
  var pool=[
    last<7  ?{icon:'💪',text:'Llega a '+(last+1)+' reps limpias en wide pull-up'}
            :{icon:'🔥',text:'Supera '+last+' reps en la primera serie del Día 1'},
    {icon:'🎯',text:'Completa los 4 días de entrenamiento esta semana'},
    {icon:'⚖️',text:'Pésate todos los días esta semana por la mañana'},
    {icon:'🧘',text:'Haz el calentamiento completo sin saltarlo ningún día'},
    {icon:'⏱️',text:'Respeta los tiempos de descanso exactos esta semana'},
  ];
  var seed=monday.split('-').reduce(function(a,b){return parseInt(a)+parseInt(b);},0);
  var ch=pool[seed%pool.length];
  try { LS.set(cKey,JSON.stringify(ch)); } catch(e) {}
  return ch;
}

function renderWeeklyChallenge() {
  var el=document.getElementById('weekly-challenge');
  if (!el) return;
  var ch=generateWeeklyChallenge();
  if (!ch) { el.style.display='none'; return; }
  el.style.display='block';
  el.innerHTML='<div style="display:flex;align-items:flex-start;gap:10px"><span style="font-size:22px;flex-shrink:0">'+ch.icon+'</span><div>'
    +'<div style="font-size:11px;font-weight:600;color:var(--amber);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Desafío de la semana</div>'
    +'<div style="font-size:14px;font-weight:500;color:var(--ink)">'+sanitize(ch.text)+'</div></div></div>';
}

// CUSTOM TRAINING DAYS
function getCustomDayMap() {
  if (DB.settings && DB.settings.customDays) {
    try { var m=JSON.parse(DB.settings.customDays); return m; } catch(e) {}
  }
  return DAY_MAP;
}

function saveCustomDays() {
  var selects=document.querySelectorAll('.custom-day-select');
  var newMap={};
  selects.forEach(function(sel){
    var dn=parseInt(sel.getAttribute('data-daynum'));
    var wd=parseInt(sel.value);
    newMap[wd]=dn;
  });
  if (Object.keys(newMap).length!==4) { showToast('Selecciona 4 días diferentes','⚠️'); return; }
  // Check no duplicates
  var vals=Object.values(newMap);
  if (new Set(vals).size!==4) { showToast('Cada día de entrenamiento debe ser único','⚠️'); return; }
  DB.settings.customDays=JSON.stringify(newMap);
  saveDB();
  showToast('Días de entrenamiento actualizados','✅');
}

function resetCustomDays() {
  if (DB.settings) delete DB.settings.customDays;
  saveDB(); renderCustomDaysUI();
  showToast('Días restablecidos al programa original','✅');
}

function renderCustomDaysUI() {
  var el=document.getElementById('custom-days-ui');
  if (!el) return;
  var dm=getCustomDayMap();
  var wdn=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  var dlabels={1:'Día 1 — Tirón',2:'Día 2 — Empuje',3:'Día 3 — Tirón+Banda',4:'Día 4 — Test'};
  var html='';
  [1,2,3,4].forEach(function(dayNum){
    var curWd=parseInt(Object.keys(dm).find(function(k){return dm[k]===dayNum;}));
    html+='<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">';
    html+='<div style="font-size:13px;font-weight:500;color:var(--ink)">'+dlabels[dayNum]+'</div>';
    html+='<select class="finp custom-day-select" data-daynum="'+dayNum+'" style="width:100px;font-size:13px" onchange="saveCustomDays()">';
    wdn.forEach(function(name,idx){
      html+='<option value="'+idx+'"'+(idx===curWd?' selected':'')+'>'+name+'</option>';
    });
    html+='</select></div>';
  });
  html+='<button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px;width:100%" onclick="resetCustomDays()">Restablecer por defecto</button>';
  el.innerHTML=html;
}

function initOfflineDetection() {
  function updateOnlineStatus() {
    var isOffline = !navigator.onLine;
    document.body.classList.toggle('is-offline', isOffline);
    if (isOffline) {
      showToast('Sin conexión — los datos se guardan localmente', '⚠️', 4000);
    }
  }
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}


// ═══════════════════════════════════════════════════════════════════
// CUSTOM MODAL (replaces native alert/confirm)
// ═══════════════════════════════════════════════════════════════════
var _modalResolve = null;

function showModal(opts) {
  // opts: { title, message, icon, type:'alert'|'confirm'|'danger', confirmText, cancelText }
  return new Promise(function(resolve) {
    _modalResolve = resolve;
    var modal = document.getElementById('app-modal');
    var icon = opts.icon || (opts.type === 'danger' ? '⚠️' : 'ℹ️');
    var confirmText = opts.confirmText || (opts.type === 'danger' ? 'Sí, borrar' : 'Aceptar');
    var cancelText = opts.cancelText || 'Cancelar';
    var confirmClass = opts.type === 'danger' ? 'btn-danger-full' : 'btn-blue';
    var html = '';
    html += '<div style="text-align:center;font-size:36px;margin-bottom:10px">' + icon + '</div>';
    html += '<div style="font-size:16px;font-weight:700;color:var(--ink);text-align:center;margin-bottom:8px">' + (opts.title || '') + '</div>';
    html += '<div style="font-size:13px;color:var(--ink2);text-align:center;line-height:1.55;margin-bottom:20px">' + (opts.message || '') + '</div>';
    html += '<div style="display:flex;gap:8px">';
    if (opts.type !== 'alert') {
      html += '<button type="button" class="btn btn-ghost" onclick="resolveModal(false)" style="flex:1;justify-content:center">' + cancelText + '</button>';
    }
    html += '<button type="button" class="btn ' + confirmClass + '" onclick="resolveModal(true)" style="flex:1;justify-content:center">' + confirmText + '</button>';
    html += '</div>';
    document.getElementById('app-modal-body').innerHTML = html;
    modal.classList.add('show');
  });
}

function resolveModal(value) {
  var modal = document.getElementById('app-modal');
  if (modal) modal.classList.remove('show');
  if (_modalResolve) { _modalResolve(value); _modalResolve = null; }
}

// Convenience wrappers
function modalAlert(message, icon) {
  return showModal({ title: '', message: message, icon: icon || 'ℹ️', type: 'alert', confirmText: 'OK' });
}

function modalConfirm(title, message, icon) {
  return showModal({ title: title, message: message, icon: icon || '❓', type: 'confirm' });
}

function modalDanger(title, message) {
  return showModal({ title: title, message: message, icon: '⚠️', type: 'danger' });
}

// ═══════════════════════════════════════════════════════════════════
// TOAST NOTIFICATION (replaces alert() in many places)
// ═══════════════════════════════════════════════════════════════════
var _toastTimer = null;
function showToast(message, icon, duration) {
  icon = icon || '✓';
  duration = duration || 3000;
  var toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'update-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = '<span style="font-size:16px;flex-shrink:0">' + sanitize(String(icon)) + '</span><span style="flex:1;min-width:0">' + sanitize(String(message)) + '</span>';
  toast.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { toast.classList.remove('show'); }, duration);
}

// ═══════════════════════════════════════════════════════════════════
// SESSION RECOVERY — persist HOY_STATE across app close/reopen
// ═══════════════════════════════════════════════════════════════════
var SESSION_DRAFT_KEY = 'bpro_session_draft';

function saveSessionDraft() {
  if (!HOY_STATE.day || HOY_STATE.seriesDone === 0) return;
  var draft = {
    day:               HOY_STATE.day,
    exIdx:             HOY_STATE.exIdx,
    serieIdx:          HOY_STATE.serieIdx,
    warmupDone:        HOY_STATE.warmupDone,
    seriesDone:        HOY_STATE.seriesDone,
    seriesTotal:       HOY_STATE.seriesTotal,
    elapsed:           HOY_STATE.elapsed,
    completedExercises:HOY_STATE.completedExercises,
    savedAt:           localDateStr(),
    savedAtTime:       Date.now()
  };
  LS.setJSON(SESSION_DRAFT_KEY, draft);
}

function clearSessionDraft() {
  LS.remove(SESSION_DRAFT_KEY);
}

function getSessionDraft() {
  var draft = LS.getJSON(SESSION_DRAFT_KEY, null);
  if (!draft) return null;
  // Only valid if same day and within 8 hours
  var isToday = draft.savedAt === localDateStr();
  var isRecent = (Date.now() - draft.savedAtTime) < 8 * 60 * 60 * 1000;
  return (isToday && isRecent) ? draft : null;
}

function checkSessionDraft() {
  var draft = getSessionDraft();
  if (!draft) return;
  // Show recovery banner
  var dayNames = {1:'Día 1 — Tirón', 2:'Día 2 — Empuje', 3:'Día 3 — Tirón+Banda', 4:'Día 4 — Full+Test'};
  var pct = Math.round((draft.seriesDone / draft.seriesTotal) * 100);
  var banner = document.getElementById('session-recovery-banner');
  if (!banner) return;
  banner.style.display = 'block';
  var nameEl = document.getElementById('recovery-session-name');
  var progEl = document.getElementById('recovery-progress');
  if (nameEl) nameEl.textContent = dayNames[draft.day] || 'Entrenamiento';
  if (progEl) progEl.textContent = draft.seriesDone + '/' + draft.seriesTotal + ' series (' + pct + '%)';
}

function resumeSession() {
  var draft = getSessionDraft();
  if (!draft) return;
  // Restore HOY_STATE from draft
  HOY_STATE.day               = draft.day;
  HOY_STATE.exIdx             = draft.exIdx;
  HOY_STATE.serieIdx          = draft.serieIdx;
  HOY_STATE.warmupDone        = draft.warmupDone;
  HOY_STATE.seriesDone        = draft.seriesDone;
  HOY_STATE.seriesTotal       = draft.seriesTotal;
  HOY_STATE.elapsed           = draft.elapsed || 0;
  HOY_STATE.completedExercises= draft.completedExercises || [];
  HOY_STATE.startTime         = Date.now() - (HOY_STATE.elapsed * 1000);
  // Navigate to Hoy and restore UI
  goMain('entrenar', document.querySelector('.nb'));
  dismissRecoveryBanner();
  // Select the right day
  var dayBtn = document.getElementById('hoy-d' + draft.day);
  if (dayBtn) selectHoyDay(draft.day, dayBtn);
  // Show training panel directly
  var startPanel = document.getElementById('hoy-start-panel');
  var trainingEl = document.getElementById('hoy-training');
  if (startPanel) startPanel.style.display = 'none';
  if (trainingEl) trainingEl.style.display = 'block';
  // Rebuild training list
  buildTrainingList(HOY_STATE.day);
  // Restore completed exercise states in UI
  restoreTrainingUI();
  // Restart elapsed timer
  startElapsedTimer();
  showToast('Sesión restaurada — llevas ' + draft.seriesDone + ' series completadas', '🔄');
}

function restoreTrainingUI() {
  var dayData = DAYS[HOY_STATE.day];
  if (!dayData) return;
  // Mark completed exercises
  HOY_STATE.completedExercises.forEach(function(exState, exIdx) {
    if (!exState) return;
    var sets = exState.sets || [];
    var ex = dayData.exercises[exIdx];
    if (!ex) return;
    // Mark completed series badges
    sets.forEach(function(set, sIdx) {
      if (!set || !set.reps) return;
      var badge = document.getElementById('badge-' + exIdx + '-' + sIdx);
      if (badge) { badge.classList.remove('current'); badge.classList.add('done'); badge.textContent = '✓'; }
    });
    // If all series done, mark exercise complete
    var allDone = sets.filter(function(s){return s && s.reps;}).length >= ex.sets;
    if (allDone) {
      var icon = document.getElementById('ex-icon-' + exIdx);
      if (icon) { icon.className = 'ex-status-icon ex-status-done'; icon.textContent = '✓'; }
      var trex = document.getElementById('trex-' + exIdx);
      if (trex) { trex.classList.remove('active-ex'); trex.classList.add('done-ex'); }
    }
  });
  // Mark current exercise as active
  var curTrex = document.getElementById('trex-' + HOY_STATE.exIdx);
  if (curTrex) {
    curTrex.classList.add('active-ex');
    var curIcon = document.getElementById('ex-icon-' + HOY_STATE.exIdx);
    if (curIcon) { curIcon.className = 'ex-status-icon ex-status-active'; curIcon.textContent = '▶'; }
    var curBody = document.getElementById('trex-body-' + HOY_STATE.exIdx);
    if (curBody) curBody.classList.add('open');
    setTimeout(function(){ curTrex.scrollIntoView({behavior:'smooth', block:'start'}); }, 300);
  }
  updateHoyProgress();
}

function dismissRecoveryBanner() {
  var banner = document.getElementById('session-recovery-banner');
  if (banner) banner.style.display = 'none';
}

function discardSessionDraft() {
  clearSessionDraft();
  dismissRecoveryBanner();
  showToast('Sesión anterior descartada', '🗑️');
}

function startElapsedTimer() {
  if (HOY_STATE.elapsedTimer) clearInterval(HOY_STATE.elapsedTimer);
  HOY_STATE.elapsedTimer = setInterval(function() {
    HOY_STATE.elapsed++;
    var m = Math.floor(HOY_STATE.elapsed/60);
    var s = HOY_STATE.elapsed % 60;
    var el = document.getElementById('hoy-elapsed');
    if (el) el.textContent = m + ':' + (s<10?'0':'') + s;
  }, 1000);
}

// ═══════════════════════════════════════════════════════════════════
// PWA UPDATE NOTIFICATION
// ═══════════════════════════════════════════════════════════════════
function initPWAUpdates() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(function(reg) {
    reg.addEventListener('updatefound', function() {
      var newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', function() {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available
          showUpdateBanner();
        }
      });
    });
  });
}

function showUpdateBanner() {
  var banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;bottom:76px;left:50%;transform:translateX(-50%);z-index:9998;background:var(--ink);color:var(--bg);border-radius:var(--r);padding:12px 16px;font-size:13px;display:flex;align-items:center;gap:10px;box-shadow:var(--shl);white-space:nowrap;animation:fadeUp .3s ease';
  banner.innerHTML = '🆕 Nueva versión disponible <button type="button" onclick="window.location.reload()" style="background:var(--blue);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;margin-left:4px">Actualizar</button><button type="button" onclick="this.parentNode.remove()" style="background:transparent;border:none;color:var(--bg);opacity:.6;cursor:pointer;font-size:16px;padding:0 4px">✕</button>';
  document.body.appendChild(banner);
  setTimeout(function() { if (banner.parentNode) banner.remove(); }, 15000);
}

// ═══════════════════════════════════════════════════════════════════
// SWIPE NAVIGATION (mobile)
// ═══════════════════════════════════════════════════════════════════
function initSwipeNav() {
  var tabs = ['entrenar','guia','progreso','logros','ajustes'];
  var touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  var MIN_SWIPE = 60, MAX_DURATION = 350, MAX_VERTICAL = 80;
  
  document.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;
    var dt = Date.now() - touchStartTime;
    // Must be fast, horizontal, and not scrolling
    if (dt > MAX_DURATION || Math.abs(dy) > MAX_VERTICAL || Math.abs(dx) < MIN_SWIPE) return;
    // Don't swipe if touching timer bar or dropdown
    var target = e.target;
    while (target) {
      if (target.id === 'timerBar' || target.id === 'profile-dropdown' || 
          target.classList && target.classList.contains('training-ex-body')) return;
      target = target.parentElement;
    }
    var currentActive = document.querySelector('.nb.on');
    if (!currentActive) return;
    var currentIdx = Array.from(document.querySelectorAll('.nb')).indexOf(currentActive);
    var nextIdx = dx < 0 ? currentIdx + 1 : currentIdx - 1;
    var nbs = Array.from(document.querySelectorAll('.nb'));
    if (nextIdx >= 0 && nextIdx < nbs.length) {
      var mainIds = ['entrenar','guia','progreso','logros','ajustes'];
      goMain(mainIds[nextIdx], nbs[nextIdx]);
    }
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS (desktop)
// ═══════════════════════════════════════════════════════════════════
function initKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Don't trigger when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    var nbs = Array.from(document.querySelectorAll('.nb'));
    var tabKeys = { '1':0,'2':1,'3':2,'4':3,'5':4 };
    // Tab switching: 1-7
    if (tabKeys[e.key] !== undefined && !e.ctrlKey && !e.metaKey) {
      var mainIds = ['entrenar','guia','progreso','logros','ajustes'];
      var nb = nbs[tabKeys[e.key]];
      if (nb && mainIds[tabKeys[e.key]]) { goMain(mainIds[tabKeys[e.key]], nb); e.preventDefault(); }
    }
    // Space = play/pause timer
    if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
      var active = document.querySelector('.pg.on');
      if (active && active.id === 'hoy') {
        toggleTimer();
        e.preventDefault();
      }
    }
    // Escape = close dropdowns / overlays
    if (e.key === 'Escape') {
      var dd = document.getElementById('profile-dropdown');
      if (dd && !dd.classList.contains('hidden')) { dd.classList.add('hidden'); return; }
      var overlay = document.getElementById('prepOverlay');
      if (overlay && overlay.classList.contains('show')) { overlay.classList.remove('show'); }
    }
    // D = toggle dark mode
    if (e.key === 'd' && !e.ctrlKey && !e.metaKey) {
      var darkCk = document.getElementById('setting-dark');
      if (darkCk) { darkCk.checked = !darkCk.checked; toggleDarkMode(darkCk.checked); }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// QUICK WEIGHT LOG FROM HOY
// ═══════════════════════════════════════════════════════════════════
function quickWeightSave() {
  var inp = document.getElementById('quick-weight-inp');
  if (!inp) return;
  var val = parseFloat(inp.value);
  if (isNaN(val) || val < 80 || val > 500) {
    showToast('Ingresa un peso válido', '⚠️');
    return;
  }
  val = Math.round(val * 10) / 10;
  var todayStr = localDateStr();
  var existing = DB.weights.findIndex(function(w) { return w.date === todayStr; });
  if (existing >= 0) DB.weights[existing].weight = val;
  else DB.weights.unshift({ date: todayStr, weight: val });
  saveDB();
  inp.value = '';
  showToast('Peso guardado: ' + val + ' lb', '⚖️');
  // Update quick display
  var display = document.getElementById('quick-weight-display');
  if (display) display.textContent = val + ' lb';
}

// ═══════════════════════════════════════════════════════════════════
// WEEK SUMMARY (for Tracker tab)
// ═══════════════════════════════════════════════════════════════════
function renderWeekSummary() {
  var el = document.getElementById('week-summary-container');
  if (!el) return;
  var monday = getMondayOfWeek();
  var dayNames = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  var dayMap = {0:1, 1:2, 3:3, 5:4}; // weekday offset from monday → training day
  var todayStr = localDateStr();
  var html = '<div class="week-summary-grid">';
  // Show Mon, Tue, Thu, Sat
  var trainingDays = [
    { offset:0, label:'Lunes', dayNum:1, focus:'Tirón' },
    { offset:1, label:'Martes', dayNum:2, focus:'Empuje' },
    { offset:3, label:'Jueves', dayNum:3, focus:'Tirón+Banda' },
    { offset:5, label:'Sábado', dayNum:4, focus:'Full+Test' },
  ];
  trainingDays.forEach(function(td) {
    var d = new Date(monday + 'T12:00:00');
    d.setDate(d.getDate() + td.offset);
    var dateStr = localDateStr(d);
    var isToday = dateStr === todayStr;
    var isDone = DB.sessions.some(function(s) {
      return s.date === dateStr && s.day === td.dayNum;
    });
    var isPast = dateStr < todayStr;
    var icon = isDone ? '✅' : (isPast ? '⬜' : (isToday ? '📍' : '○'));
    var cls = 'week-day-card' + (isDone ? ' done' : '') + (isToday ? ' today' : '');
    html += '<div class="' + cls + '">';
    html += '<div class="week-day-name">' + td.label + '</div>';
    html += '<div class="week-day-icon">' + icon + '</div>';
    html += '<div class="week-day-label">Día ' + td.dayNum + '</div>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════
// IMPROVED EMPTY STATES
// ═══════════════════════════════════════════════════════════════════
function renderEmptyState(containerId, icon, title, desc, actionLabel, actionFn) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var html = '<div class="empty-state">';
  html += '<div class="empty-state-icon">' + icon + '</div>';
  html += '<div class="empty-state-title">' + sanitize(title) + '</div>';
  html += '<div class="empty-state-desc">' + sanitize(desc) + '</div>';
  if (actionLabel && actionFn) {
    html += '<button type="button" class="btn btn-blue btn-sm" onclick="' + actionFn + '">' + sanitize(actionLabel) + '</button>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════
// PWA — SERVICE WORKER + INSTALL PROMPT
// ═══════════════════════════════════════════════════════════════════

// Register Service Worker for offline support
if ('serviceWorker' in navigator) {
  var swCode = "const CACHE='barra-pro-v1';"
    + "self.addEventListener('install',function(){self.skipWaiting();});"
    + "self.addEventListener('activate',function(){clients.claim();});"
    + "self.addEventListener('fetch',function(e){"
    + "if(e.request.url.startsWith(self.location.origin)){"
    + "e.respondWith(caches.open(CACHE).then(function(cache){"
    + "return cache.match(e.request).then(function(cached){"
    + "var net=fetch(e.request).then(function(r){cache.put(e.request,r.clone());return r;});"
    + "return cached||net;})}));}});";
  try {
    var swBlob = new Blob([swCode], {type:'application/javascript'});
    var swUrl = URL.createObjectURL(swBlob);
    navigator.serviceWorker.register(swUrl).catch(function(e){  });
  } catch(e) {}
}

// PWA Install prompt
var deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredInstallPrompt = e;
  setTimeout(function() {
    if (!LS.get('pwa_dismissed')) {
      var banner = document.getElementById('pwa-install-banner');
      if (banner) banner.style.display = 'block';
    }
  }, 10000);
});

function installPWA() {
  var banner = document.getElementById('pwa-install-banner');
  if (banner) banner.style.display = 'none';
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(function(r) {
      if (r.outcome === 'accepted') LS.set('pwa_dismissed','1');
      deferredInstallPrompt = null;
    });
  }
}

function dismissInstall() {
  var banner = document.getElementById('pwa-install-banner');
  if (banner) banner.style.display = 'none';
  LS.set('pwa_dismissed','1');
}

window.addEventListener('appinstalled', function() {
  LS.set('pwa_dismissed','1');
});

