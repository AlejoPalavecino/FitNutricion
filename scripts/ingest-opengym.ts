/**
 * Pipeline de Ingesta y Traducción Estandarizada del Repositorio `emilfunk/opengym`
 *
 * Uso:
 *   node --experimental-strip-types scripts/ingest-opengym.ts [--download-media] [--limit=80]
 *
 * 1. Inspecciona el árbol de GitHub `https://api.github.com/repos/emilfunk/opengym/git/trees/main?recursive=1`
 * 2. Descarga `frontend/src/lib/exercises-data.js`, `frontend/src/locales/es.js` y `frontend/src/instr/es.js`
 * 3. Traduce músculos, equipamiento, títulos (`nameEs`) e instrucciones biomecánicas (`instructionsEs`),
 *    conservando `nameEn` y agregando `aliases` bilingües de gimnasio.
 * 4. Mapea las imágenes estáticas y GIFs animados (y opcionalmente los descarga en `/public/exercises/`).
 * 5. Genera `src/data/opengymCatalog.ts` tipado para uso Offline-First inmediato.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  EquipmentEs,
  ExerciseCatalogItem,
  ExerciseCategoryEs,
  MuscleGroupEs,
} from '../src/types/nutrition.ts';

const GITHUB_TREE_URL =
  'https://api.github.com/repos/emilfunk/opengym/git/trees/main?recursive=1';
const OPENGYM_RAW_BASE = 'https://raw.githubusercontent.com/emilfunk/opengym/main';
const DATASET_RAW_BASE =
  'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main';

interface RawOpenGymExercise {
  id: string;
  n: string;
  bp: string;
  eq: string;
  tg: string;
  mg?: string;
  sm?: string[];
  st?: string[];
  img?: string;
  gif?: string;
}

// ============================================================================
// DICCIONARIO ANATÓMICO Y DE EQUIPAMIENTO OBLIGATORIO
// ============================================================================

export function mapMuscleToSpanish(rawMuscle: string): MuscleGroupEs {
  const m = rawMuscle.toLowerCase().trim();
  if (m.includes('chest') || m.includes('pectoral')) return 'Pecho';
  if (m.includes('lat') || m === 'back' || m.includes('upper back') || m.includes('teres'))
    return 'Espalda / Dorsales';
  if (m.includes('trap') || m.includes('levator')) return 'Trapecios';
  if (
    m.includes('shoulder') ||
    m.includes('delt') ||
    m.includes('serratus') ||
    m.includes('rotator')
  )
    return 'Hombros (Deltoides)';
  if (m.includes('quad')) return 'Cuádriceps';
  if (m.includes('hamstring')) return 'Isquiotibiales';
  if (m.includes('glute')) return 'Glúteos';
  if (m.includes('calf') || m.includes('calves') || m.includes('soleus') || m.includes('lower leg'))
    return 'Gemelos / Pantorrillas';
  if (m.includes('bicep') || m.includes('brachialis')) return 'Bíceps';
  if (m.includes('tricep')) return 'Tríceps';
  if (m.includes('forearm') || m.includes('wrist') || m.includes('lower arm'))
    return 'Antebrazos';
  if (m.includes('adductor') || m.includes('groin')) return 'Aductores';
  if (m.includes('abductor')) return 'Abductores';
  if (m.includes('lower_back') || m.includes('lower back') || m.includes('spine') || m.includes('erector'))
    return 'Espalda Baja / Lumbares';
  if (
    m.includes('abdominal') ||
    m.includes('abs') ||
    m.includes('core') ||
    m.includes('waist') ||
    m.includes('oblique') ||
    m.includes('hip flexor')
  )
    return 'Abdominales / Core';

  return 'Abdominales / Core';
}

export function mapEquipmentToSpanish(rawEq: string, rawName = ''): EquipmentEs {
  const eq = rawEq.toLowerCase().trim();
  const n = rawName.toLowerCase();
  if (eq.includes('ez') || n.includes('ez bar') || n.includes('ez-bar')) return 'Barra Z';
  if (eq.includes('trap') || n.includes('trap bar') || n.includes('hex bar'))
    return 'Barra Hexagonal';
  if (eq.includes('smith') || n.includes('smith')) return 'Máquina Smith (Multipower)';
  if (eq.includes('barbell')) return 'Barra';
  if (eq.includes('dumbbell')) return 'Mancuerna';
  if (eq.includes('cable') || n.includes('cable')) return 'Polea';
  if (eq.includes('kettlebell')) return 'Pesa Rusa (Kettlebell)';
  if (eq.includes('band') || eq.includes('rope')) return 'Banda Elástica';
  if (
    eq.includes('machine') ||
    eq.includes('leverage') ||
    eq.includes('sled') ||
    eq.includes('roller')
  )
    return 'Máquina';
  return 'Peso Corporal';
}

// ============================================================================
// CURACIÓN BILINGÜE DE EJERCICIOS CLAVE DE HIPERTROFIA Y FUERZA
// ============================================================================

interface CuratedExerciseOverride {
  id: string;
  nameEs: string;
  aliases: string[];
  category: ExerciseCategoryEs;
  equipmentOverride?: EquipmentEs;
  primaryMuscleOverride?: MuscleGroupEs;
  secondaryMusclesOverride?: MuscleGroupEs[];
  isUnilateral?: boolean;
  biomechanicalInstructionsEs?: string[];
}

const CURATED_EXERCISES: Record<string, CuratedExerciseOverride> = {
  '0025': {
    id: '0025',
    nameEs: 'Press de Banca Plano con Barra',
    aliases: ['Press Banca', 'Bench Press', 'Flat Bench', 'Pecho con Barra'],
    category: 'fuerza',
    primaryMuscleOverride: 'Pecho',
    secondaryMusclesOverride: ['Tríceps', 'Hombros (Deltoides)'],
    biomechanicalInstructionsEs: [
      'Túmbate en el banco plano asegurando una firme retracción y depresión escapular con los pies anclados al suelo (leg drive).',
      'Sujeta la barra con un agarre ligeramente mayor al ancho biacromial y sácala del rack con los codos bloqueados sobre los hombros.',
      'Realiza una fase excéntrica controlada de 2 a 3 segundos llevando la barra hacia la línea inferior del esternón con los codos a ~45-60°.',
      'Empuja explosivamente en la fase concéntrica manteniendo los glúteos y escápulas en contacto con el banco.',
    ],
  },
  '0047': {
    id: '0047',
    nameEs: 'Press de Banca Inclinado con Barra',
    aliases: ['Press Inclinado', 'Incline Bench Press', 'Pecho Superior Barra'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Pecho',
    secondaryMusclesOverride: ['Hombros (Deltoides)', 'Tríceps'],
    biomechanicalInstructionsEs: [
      'Ajusta el respaldo del banco entre 30° y 45° para priorizar la porción clavicular del pectoral mayor.',
      'Mantén retracción escapular y desciende la barra de forma controlada hacia la parte alta del pecho (debajo de las clavículas).',
      'Extiende los codos empujando verticalmente sin perder la estabilidad escapular.',
    ],
  },
  '0289': {
    id: '0289',
    nameEs: 'Press de Banca con Mancuernas',
    aliases: ['Press Mancuernas', 'Dumbbell Bench Press', 'DB Press Plano'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Pecho',
    secondaryMusclesOverride: ['Tríceps', 'Hombros (Deltoides)'],
    isUnilateral: true,
    biomechanicalInstructionsEs: [
      'Siéntate con las mancuernas apoyadas en los muslos y túmbate impulsándolas con las rodillas hacia la posición inicial.',
      'Desciende las mancuernas en fase excéntrica controlada buscando un estiramiento profundo de las fibras pectorales.',
      'Empuja convergiendo ligeramente las mancuernas arriba sin chocarlas para mantener tensión continua.',
    ],
  },
  '0314': {
    id: '0314',
    nameEs: 'Press Inclinado con Mancuernas',
    aliases: ['Incline DB Press', 'Press Inclinado Mancuernas', 'Pecho Alto Mancuernas'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Pecho',
    secondaryMusclesOverride: ['Hombros (Deltoides)', 'Tríceps'],
    isUnilateral: true,
    biomechanicalInstructionsEs: [
      'Configura el banco a 30° para maximizar el reclutamiento del haz clavicular sin sobrecargar el deltoides anterior.',
      'Baja las mancuernas con los antebrazos perpendiculares al suelo hasta lograr un estiramiento completo del pectoral.',
      'Empuja de forma fluida hasta cerca de la extensión completa.',
    ],
  },
  '0227': {
    id: '0227',
    nameEs: 'Cruce de Poleas (Aperturas en Polea)',
    aliases: ['Cruces en Polea', 'Cable Fly', 'Cable Crossover', 'Aperturas Polea'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Pecho',
    secondaryMusclesOverride: ['Hombros (Deltoides)'],
    biomechanicalInstructionsEs: [
      'Colócate en el centro de las poleas dando un paso al frente para estabilizar el torso.',
      'Con una ligera flexión fija de codos, realiza una aducción horizontal de hombros juntando las manos frente al torso.',
      'Sostén 1 segundo la contracción isométrica máxima (peak contraction) y retorna lentamente estirando el pectoral.',
    ],
  },
  '0043': {
    id: '0043',
    nameEs: 'Sentadilla Trasera con Barra (Back Squat)',
    aliases: ['Sentadilla', 'Squat', 'Back Squat', 'Sentadilla Libre'],
    category: 'fuerza',
    primaryMuscleOverride: 'Cuádriceps',
    secondaryMusclesOverride: ['Glúteos', 'Espalda Baja / Lumbares', 'Abdominales / Core'],
    biomechanicalInstructionsEs: [
      'Apoya la barra sobre los trapecios superiores (barra alta) o deltoides posteriores (barra baja) sujetándola con firmeza.',
      'Toma aire profundo hacia el abdomen (maniobra de Valsalva / bracing 360°) antes de iniciar el descenso.',
      'Flexiona simultáneamente caderas y rodillas manteniendo las rodillas alineadas con la punta de los pies hasta romper el paralelo.',
      'Impúlsate desde el mediopié extendiendo rodillas y cadera de manera coordinada.',
    ],
  },
  '0085': {
    id: '0085',
    nameEs: 'Peso Muerto Rumano con Barra (RDL)',
    aliases: ['RDL', 'Peso Muerto Rumano', 'Romanian Deadlift', 'PMR'],
    category: 'fuerza',
    primaryMuscleOverride: 'Isquiotibiales',
    secondaryMusclesOverride: ['Glúteos', 'Espalda Baja / Lumbares', 'Antebrazos'],
    biomechanicalInstructionsEs: [
      'Inicia de pie con la barra pegada a los muslos, escápulas activas y columna rigurosamente neutra.',
      'Desbloquea ligeramente las rodillas (15-20°) e inicia una bisagra de cadera pura llevando los glúteos hacia atrás.',
      'Desliza la barra rozando las piernas hasta sentir el máximo estiramiento mecánico en los isquiotibiales (mitad de la tibia).',
      'Extiende la cadera contrayendo glúteos e isquios para volver a la vertical sin hiperextender la zona lumbar.',
    ],
  },
  '0032': {
    id: '0032',
    nameEs: 'Peso Muerto Convencional con Barra',
    aliases: ['Peso Muerto', 'Deadlift', 'Conventional Deadlift', 'PM'],
    category: 'fuerza',
    primaryMuscleOverride: 'Espalda Baja / Lumbares',
    secondaryMusclesOverride: ['Glúteos', 'Isquiotibiales', 'Trapecios', 'Antebrazos'],
    biomechanicalInstructionsEs: [
      'Coloca los pies a la anchura de la cadera con la barra exactamente sobre la mitad del pie.',
      'Sujeta la barra por fuera de las tibias, lleva las espinillas hacia la barra, eleva el pecho y elimina la holgura de la barra (pull the slack out).',
      'Empuja el suelo con las piernas manteniendo los dorsales activos para que la barra suba pegada al cuerpo hasta el bloqueo de cadera.',
    ],
  },
  '0739': {
    id: '0739',
    nameEs: 'Prensa de Piernas Inclinada 45°',
    aliases: ['Prensa', 'Leg Press', 'Prensa 45', 'Prensa de Piernas'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Cuádriceps',
    secondaryMusclesOverride: ['Glúteos', 'Isquiotibiales'],
    biomechanicalInstructionsEs: [
      'Apoya toda la espalda y el sacro firmemente contra el respaldo de la prensa y coloca los pies en la plataforma al ancho de caderas.',
      'Desbloquea los seguros y desciende la plataforma controladamente flexionando rodillas al máximo rango sin despegar el sacro del asiento.',
      'Empuja la plataforma con toda la planta del pie evitando bloquear agresivamente las rodillas al final.',
    ],
  },
  '0585': {
    id: '0585',
    nameEs: 'Extensión de Cuádriceps en Máquina',
    aliases: ['Sillón de Cuádriceps', 'Leg Extension', 'Extensiones de Cuádriceps'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Cuádriceps',
    secondaryMusclesOverride: [],
    biomechanicalInstructionsEs: [
      'Alinea el eje de rotación de la máquina con tu articulación de la rodilla y ajusta el rodillo sobre el empeine inferior.',
      'Sujeta los agarres laterales para mantener la cadera pegada al asiento y extiende las rodillas por completo.',
      'Realiza una pausa isométrica de 1 segundo arriba y controla la fase excéntrica durante 2-3 segundos.',
    ],
  },
  '0586': {
    id: '0586',
    nameEs: 'Curl Femoral Tumbado en Máquina',
    aliases: ['Camilla de Isquios', 'Lying Leg Curl', 'Curl Femoral', 'Isquios en Máquina'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Isquiotibiales',
    secondaryMusclesOverride: ['Gemelos / Pantorrillas'],
    biomechanicalInstructionsEs: [
      'Túmbate boca abajo manteniendo la pelvis presionada contra el banco para evitar compensar con la zona lumbar.',
      'Flexiona las rodillas llevando el rodillo hacia los glúteos en fase concéntrica explosiva.',
      'Desciende la carga lentamente resistiendo la extensión hasta el estiramiento completo.',
    ],
  },
  '1409': {
    id: '1409',
    nameEs: 'Hip Thrust con Barra (Empuje de Cadera)',
    aliases: ['Hip Thrust', 'Puente de Glúteo con Barra', 'Barbell Glute Bridge'],
    category: 'fuerza',
    primaryMuscleOverride: 'Glúteos',
    secondaryMusclesOverride: ['Isquiotibiales', 'Abdominales / Core'],
    equipmentOverride: 'Barra',
    biomechanicalInstructionsEs: [
      'Apoya el borde inferior de las escápulas en un banco estable y coloca la barra acolchada sobre el pliegue inguinal.',
      'Ubica los pies de modo que en la extensión máxima las tibias queden completamente verticales (90° en la rodilla).',
      'Extiende la cadera con retroversión pélvica (mirada al frente y mentón recogido) apretando los glúteos 1 segundo en el tope.',
    ],
  },
  '0336': {
    id: '0336',
    nameEs: 'Sentadilla Búlgara con Mancuernas',
    aliases: ['Sentadilla Búlgara', 'Bulgarian Split Squat', 'Zancada Búlgara'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Glúteos',
    secondaryMusclesOverride: ['Cuádriceps', 'Isquiotibiales'],
    equipmentOverride: 'Mancuerna',
    isUnilateral: true,
    biomechanicalInstructionsEs: [
      'Apoya el empeine del pie trasero en un banco y da un paso adelante con la pierna de trabajo.',
      'Desciende flexionando la rodilla delantera (torso erguido para énfasis en cuádriceps o ligeramente inclinado para énfasis en glúteo).',
      'Empuja con el talón y mediopié delantero hasta recuperar la posición inicial.',
    ],
  },
  '0605': {
    id: '0605',
    nameEs: 'Elevación de Talones para Gemelos',
    aliases: ['Gemelos', 'Calf Raise', 'Pantorrillas de Pie'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Gemelos / Pantorrillas',
    secondaryMusclesOverride: [],
    biomechanicalInstructionsEs: [
      'Coloca los metatarsos sobre el escalón dejando los talones libres para recorrer todo el rango articular del tobillo.',
      'Desciende los talones pausando 1-2 segundos en el estiramiento inferior para disipar el reflejo miotático del tendón de Aquiles.',
      'Eleva los talones al máximo en flexión plantar y sostén 1 segundo arriba.',
    ],
  },
  '2330': {
    id: '2330',
    nameEs: 'Jalón al Pecho en Polea Alta',
    aliases: ['Jalón al pecho', 'Lat Pulldown', 'Polea al Pecho', 'Dorsales en Polea'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Espalda / Dorsales',
    secondaryMusclesOverride: ['Bíceps', 'Trapecios', 'Antebrazos'],
    equipmentOverride: 'Polea',
    biomechanicalInstructionsEs: [
      'Ajusta las almohadillas sobre los muslos y sujeta la barra con un agarre prono ligeramente más ancho que los hombros.',
      'Inicia el movimiento con una depresión escapular y tracciona dirigiendo los codos hacia abajo y hacia las caderas.',
      'Lleva la barra hasta la parte superior del pecho y retorna de forma controlada permitiendo la elongación dorsal.',
    ],
  },
  '0651': {
    id: '0651',
    nameEs: 'Dominadas Pronas (Pull-Up)',
    aliases: ['Dominadas', 'Pull Up', 'Pull-ups', 'Chin Up'],
    category: 'calistenia',
    primaryMuscleOverride: 'Espalda / Dorsales',
    secondaryMusclesOverride: ['Bíceps', 'Abdominales / Core', 'Trapecios'],
    equipmentOverride: 'Peso Corporal',
    biomechanicalInstructionsEs: [
      'Cuélgate de la barra con agarre prono completo y activa el core para evitar balanceos (kipping).',
      'Deprime y retrae las escápulas traccionando con los codos hacia el torso hasta pasar la barbilla por encima de la barra.',
      'Desciende en fase excéntrica controlada hasta la extensión completa de los brazos (dead hang activo).',
    ],
  },
  '0027': {
    id: '0027',
    nameEs: 'Remo con Barra Inclinado (Pendlay / Prono)',
    aliases: ['Remo con Barra', 'Barbell Row', 'Bent Over Row', 'Remo 90'],
    category: 'fuerza',
    primaryMuscleOverride: 'Espalda / Dorsales',
    secondaryMusclesOverride: ['Trapecios', 'Espalda Baja / Lumbares', 'Bíceps'],
    biomechanicalInstructionsEs: [
      'Inclina el torso entre 45° y 75° mediante bisagra de cadera manteniendo la columna neutra y el abdomen firme.',
      'Tracciona la barra hacia la zona umbilical / esternón inferior guiando el movimiento con los codos y retrayendo las escápulas.',
      'Baja la barra controladamente sin perder el ángulo del torso.',
    ],
  },
  '0292': {
    id: '0292',
    nameEs: 'Remo Unilateral con Mancuerna (Serrucho)',
    aliases: ['Remo con Mancuerna', 'One Arm Dumbbell Row', 'Remo Serrucho'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Espalda / Dorsales',
    secondaryMusclesOverride: ['Bíceps', 'Trapecios'],
    isUnilateral: true,
    biomechanicalInstructionsEs: [
      'Apoya una mano y rodilla en el banco manteniendo la espalda plana y paralela al suelo.',
      'Deje que la mancuerna estire el dorsal abajo y luego tracciona en arco llevando la mancuerna hacia la cadera (no hacia el hombro).',
      'Controla el descenso sintiendo el estiramiento del dorsal ancho.',
    ],
  },
  '1323': {
    id: '1323',
    nameEs: 'Remo Sentado en Polea Baja (Gironda)',
    aliases: ['Remo Gironda', 'Seated Cable Row', 'Remo en Polea Baja'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Espalda / Dorsales',
    secondaryMusclesOverride: ['Trapecios', 'Bíceps', 'Espalda Baja / Lumbares'],
    equipmentOverride: 'Polea',
    biomechanicalInstructionsEs: [
      'Siéntate con las rodillas semiflexionadas y el torso erguido sujetando el agarre neutro.',
      'Tracciona el maneral hacia el abdomen bajo retrayendo intensamente las escápulas al final del recorrido.',
      'Extiende los brazos de forma controlada dejando que las escápulas se separen ligeramente sin encorvar la zona lumbar.',
    ],
  },
  '0426': {
    id: '0426',
    nameEs: 'Press Militar de Pie con Barra (Overhead Press)',
    aliases: ['Press Militar', 'OHP', 'Overhead Press', 'Shoulder Press Barra'],
    category: 'fuerza',
    primaryMuscleOverride: 'Hombros (Deltoides)',
    secondaryMusclesOverride: ['Tríceps', 'Abdominales / Core', 'Trapecios'],
    equipmentOverride: 'Barra',
    biomechanicalInstructionsEs: [
      'Sujeta la barra apoyada sobre los deltoides anteriores con los glúteos y abdomen fuertemente contraídos.',
      'Empuja la barra verticalmente apartando ligeramente el rostro y encajando la cabeza bajo la barra al pasar la frente.',
      'Desciende la barra de forma controlada hasta la altura de las clavículas.',
    ],
  },
  '0405': {
    id: '0405',
    nameEs: 'Press de Hombros Sentado con Mancuernas',
    aliases: ['Press Hombros Mancuernas', 'Seated Dumbbell Shoulder Press', 'Press Militar Mancuernas'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Hombros (Deltoides)',
    secondaryMusclesOverride: ['Tríceps'],
    isUnilateral: true,
    biomechanicalInstructionsEs: [
      'Siéntate con la espalda apoyada en un banco a 75-85° y sube las mancuernas a la altura de las orejas en el plano escapular (30° hacia adelante).',
      'Empuja verticalmente sin entrechocar las mancuernas y desciende controladamente hasta que los codos pasen ligeramente los 90°.',
    ],
  },
  '0334': {
    id: '0334',
    nameEs: 'Elevaciones Laterales con Mancuernas',
    aliases: ['Elevaciones Laterales', 'Lateral Raise', 'Vuelos Laterales', 'Deltoides Lateral'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Hombros (Deltoides)',
    secondaryMusclesOverride: ['Trapecios'],
    isUnilateral: true,
    biomechanicalInstructionsEs: [
      'De pie con una ligera inclinación del torso hacia adelante, eleva las mancuernas en el plano escapular (unos 20-30° por delante del cuerpo).',
      'Piensa en lanzar las mancuernas lejos hacia los lados guiando con los codos hasta la altura de los hombros.',
      'Baja en 2-3 segundos manteniendo tensión constante sin dejar caer los brazos muertos.',
    ],
  },
  '0031': {
    id: '0031',
    nameEs: 'Curl de Bíceps con Barra Recta / Barra Z',
    aliases: ['Curl con Barra', 'Barbell Curl', 'EZ Bar Curl', 'Bíceps con Barra'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Bíceps',
    secondaryMusclesOverride: ['Antebrazos'],
    biomechanicalInstructionsEs: [
      'De pie con los codos pegados a los costados del torso, sujeta la barra en supinación al ancho de los hombros.',
      'Flexiona los codos contrayendo los bíceps sin balancear la cadera ni adelantar excesivamente los hombros.',
      'Desciende la barra controlando los 2-3 segundos de fase excéntrica hasta estirar el bíceps.',
    ],
  },
  '0313': {
    id: '0313',
    nameEs: 'Curl Martillo con Mancuernas (Hammer Curl)',
    aliases: ['Curl Martillo', 'Hammer Curl', 'Braquial Mancuernas'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Bíceps',
    secondaryMusclesOverride: ['Antebrazos'],
    isUnilateral: true,
    biomechanicalInstructionsEs: [
      'Sostén las mancuernas con agarre neutro (palmas enfrentadas) para enfatizar el braquial anterior y el supinador largo.',
      'Flexiona los codos manteniendo las muñecas firmes y desciende pausadamente.',
    ],
  },
  '0241': {
    id: '0241',
    nameEs: 'Extensión de Tríceps en Polea Alta (Pushdown)',
    aliases: ['Extensión de Tríceps', 'Tricep Pushdown', 'Tríceps en Polea', 'Cuerda Tríceps'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Tríceps',
    secondaryMusclesOverride: [],
    equipmentOverride: 'Polea',
    biomechanicalInstructionsEs: [
      'Fija los codos a los costados del cuerpo e inclina ligeramente el torso hacia adelante.',
      'Extiende únicamente la articulación del codo llevando la cuerda o barra hacia los muslos y bloqueando abajo 1 segundo.',
      'Permite la flexión controlada de los codos sin que estos se desplacen hacia arriba.',
    ],
  },
  '0251': {
    id: '0251',
    nameEs: ' Fondos en Paralelas / Press Francés (Tríceps)',
    aliases: ['Press Francés', 'Skullcrusher', 'Fondos Tríceps', 'Extensión Tríceps Barra'],
    category: 'hipertrofia',
    primaryMuscleOverride: 'Tríceps',
    secondaryMusclesOverride: ['Pecho', 'Hombros (Deltoides)'],
    biomechanicalInstructionsEs: [
      'Mantén los húmeros estables y enfoca el movimiento en la flexo-extensión de los codos para estirar la cabeza larga del tríceps.',
      'Controla la bajada y extiende con potencia evitando abrir los codos.',
    ],
  },
};

function parseJsDefaultExportObject(source: string): Record<string, any> {
  const startIdx = source.indexOf('{');
  const endIdx = source.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) return {};
  const objLiteral = source.slice(startIdx, endIdx + 1);
  try {
    return Function(`"use strict"; return (${objLiteral});`)();
  } catch {
    return {};
  }
}

function parseExdbArray(source: string): RawOpenGymExercise[] {
  const startIdx = source.indexOf('[');
  const endIdx = source.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) return [];
  const arrLiteral = source.slice(startIdx, endIdx + 1);
  try {
    return JSON.parse(arrLiteral);
  } catch {
    return Function(`"use strict"; return (${arrLiteral});`)();
  }
}

function translateGenericEnglishExerciseName(nameEn: string, esDict: Record<string, string>): string {
  if (esDict[nameEn]) return esDict[nameEn];
  const lower = nameEn.toLowerCase();
  if (esDict[lower]) return esDict[lower];

  let translated = nameEn
    .replace(/\bbarbell\b/gi, 'con Barra')
    .replace(/\bdumbbell\b/gi, 'con Mancuernas')
    .replace(/\bcable\b/gi, 'en Polea')
    .replace(/\bsmith\b/gi, 'en Multipower')
    .replace(/\bkettlebell\b/gi, 'con Pesa Rusa')
    .replace(/\bbench press\b/gi, 'Press de Banca')
    .replace(/\bincline\b/gi, 'Inclinado')
    .replace(/\bdecline\b/gi, 'Declinado')
    .replace(/\bsquat\b/gi, 'Sentadilla')
    .replace(/\bdeadlift\b/gi, 'Peso Muerto')
    .replace(/\brow\b/gi, 'Remo')
    .replace(/\bpulldown\b/gi, 'Jalón')
    .replace(/\bpull-up\b|\bpull up\b/gi, 'Dominada')
    .replace(/\bpush-up\b|\bpush up\b/gi, 'Flexiones')
    .replace(/\blunge\b/gi, 'Zancada')
    .replace(/\bcurl\b/gi, 'Curl')
    .replace(/\bextension\b/gi, 'Extensión')
    .replace(/\braise\b/gi, 'Elevación')
    .replace(/\bpress\b/gi, 'Press')
    .replace(/\bseated\b/gi, 'Sentado')
    .replace(/\bstanding\b/gi, 'de Pie')
    .replace(/\blying\b/gi, 'Tumbado');

  return translated.charAt(0).toUpperCase() + translated.slice(1);
}

async function main() {
  const args = process.argv.slice(2);
  const shouldDownloadMedia = args.includes('--download-media');

  console.log('1. Consultando árbol de GitHub de emilfunk/opengym...');
  const treeResp = await fetch(GITHUB_TREE_URL, {
    headers: { 'User-Agent': 'FitNutricion-OpenGym-Ingest' },
  });
  if (treeResp.ok) {
    const treeJson = (await treeResp.json()) as { tree?: Array<{ path: string }> };
    console.log(`   Árbol verificado: ${treeJson.tree?.length ?? 0} nodos en emilfunk/opengym.`);
  }

  console.log('2. Descargando metadatos de ejercicios y diccionarios en español de emilfunk/opengym...');
  const [exDataText, esLocaleText, esInstrText] = await Promise.all([
    fetch(`${OPENGYM_RAW_BASE}/frontend/src/lib/exercises-data.js`).then((r) => r.text()),
    fetch(`${OPENGYM_RAW_BASE}/frontend/src/locales/es.js`).then((r) => r.text()),
    fetch(`${OPENGYM_RAW_BASE}/frontend/src/instr/es.js`).then((r) => r.text()),
  ]);

  const rawExercises = parseExdbArray(exDataText);
  const esLocale = parseJsDefaultExportObject(esLocaleText);
  const esInstr = parseJsDefaultExportObject(esInstrText);

  console.log(
    `   Extraídos ${rawExercises.length} ejercicios base y ${Object.keys(esInstr).length} conjuntos de instrucciones en español.`
  );

  // Seleccionar primero todos los ejercicios curados de fuerza/hipertrofia y complementar con los más relevantes de cada grupo muscular
  const rawMap = new Map(rawExercises.map((e) => [e.id, e]));
  const selectedRaw: RawOpenGymExercise[] = [];
  const usedIds = new Set<string>();

  for (const id of Object.keys(CURATED_EXERCISES)) {
    const found = rawMap.get(id);
    if (found) {
      selectedRaw.push(found);
      usedIds.add(id);
    }
  }

  // Añadir ejercicios adicionales representativos por músculo de emilfunk/opengym hasta llegar a 50 ejercicios ricos
  for (const ex of rawExercises) {
    if (selectedRaw.length >= 50) break;
    if (usedIds.has(ex.id)) continue;
    if (
      ex.eq === 'barbell' ||
      ex.eq === 'dumbbell' ||
      ex.eq === 'cable' ||
      ex.eq === 'leverage machine' ||
      ex.eq === 'kettlebell'
    ) {
      selectedRaw.push(ex);
      usedIds.add(ex.id);
    }
  }

  const catalog: ExerciseCatalogItem[] = [];

  for (const raw of selectedRaw) {
    const curated = CURATED_EXERCISES[raw.id];
    const primaryMuscle =
      curated?.primaryMuscleOverride ?? mapMuscleToSpanish(raw.tg || raw.mg || raw.bp);
    const secondaryMuscles =
      curated?.secondaryMusclesOverride ??
      Array.from(
        new Set(
          (raw.sm ?? [])
            .map((m) => mapMuscleToSpanish(m))
            .filter((m) => m !== primaryMuscle)
        )
      );
    const equipment = curated?.equipmentOverride ?? mapEquipmentToSpanish(raw.eq, raw.n);
    const nameEs = curated?.nameEs ?? translateGenericEnglishExerciseName(raw.n, esLocale);
    const instructionsEs: string[] =
      curated?.biomechanicalInstructionsEs ??
      esInstr[raw.id] ??
      raw.st ?? [
        'Adopta una postura estable con el core activo y las escápulas controladas.',
        'Ejecuta la fase concéntrica de forma controlada y desciende en 2-3 segundos durante la fase excéntrica.',
      ];

    const imgUrl = raw.img
      ? `${DATASET_RAW_BASE}/images/${raw.img}`
      : `${OPENGYM_RAW_BASE}/assets/banner.png`;
    const gifUrl = raw.gif ? `${DATASET_RAW_BASE}/videos/${raw.gif}` : imgUrl;

    const isUnilateral =
      curated?.isUnilateral ??
      (raw.n.includes('alternate') ||
        raw.n.includes('one arm') ||
        raw.n.includes('single') ||
        equipment === 'Mancuerna');

    const category: ExerciseCategoryEs =
      curated?.category ??
      (raw.bp === 'cardio'
        ? 'cardio'
        : equipment === 'Peso Corporal'
          ? 'calistenia'
          : equipment === 'Barra'
            ? 'fuerza'
            : 'hipertrofia');

    const aliases = Array.from(
      new Set([
        ...(curated?.aliases ?? []),
        raw.n,
        nameEs,
        `${primaryMuscle} con ${equipment}`,
      ])
    );

    catalog.push({
      id: `og-${raw.id}`,
      nameEs,
      nameEn: raw.n,
      aliases,
      primaryMuscle,
      secondaryMuscles,
      equipment,
      category,
      images: [imgUrl, gifUrl],
      instructionsEs,
      isUnilateral,
    });
  }

  if (shouldDownloadMedia) {
    const publicDir = path.resolve(process.cwd(), 'public', 'exercises');
    await fs.mkdir(publicDir, { recursive: true });
    console.log(`3. Descargando miniaturas locales en ${publicDir} (Offline-First)...`);
    for (const item of catalog.slice(0, 12)) {
      const stillUrl = item.images[0];
      const fileName = path.basename(stillUrl);
      try {
        const res = await fetch(stillUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(path.join(publicDir, fileName), buf);
        }
      } catch {
        // Fallback a URL remota si falla la red
      }
    }
  }

  const outPath = path.resolve(process.cwd(), 'src', 'data', 'opengymCatalog.ts');
  const fileContent = `// ============================================================================
// CATÁLOGO BILINGÜE OPENGYM GENERADO AUTOMÁTICAMENTE (scripts/ingest-opengym.ts)
// Fuente: https://github.com/emilfunk/opengym/tree/main/
// ============================================================================

import type { ExerciseCatalogItem, WorkoutRoutine, WorkoutSession } from '../types/nutrition';

export const OPENGYM_EXERCISE_CATALOG: ExerciseCatalogItem[] = ${JSON.stringify(catalog, null, 2)};
`;

  await fs.writeFile(outPath, fileContent, 'utf8');
  console.log(`✅ Catálogo OpenGym generado exitosamente en ${outPath} (${catalog.length} ejercicios bilingües).`);
}

main().catch((err) => {
  console.error('Error en ingest-opengym:', err);
  process.exit(1);
});
