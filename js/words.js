'use strict';

// Familles affichées dans l'imagier, dans l'ordre.
const CATEGORIES = [
  { id: 'nature',    label: 'Nature & Décors',     icon: '🌳' },
  { id: 'batiments', label: 'Bâtiments & Objets',  icon: '🏠' },
  { id: 'animaux',   label: 'Animaux',             icon: '🐰' },
  { id: 'vehicules', label: 'Véhicules',           icon: '🚗' },
  { id: 'couleurs',  label: 'Couleurs',            icon: '🎨' },
  { id: 'tailles',   label: 'Tailles & Quantités', icon: '📏' },
  { id: 'actions',   label: 'Actions & Vitesses',  icon: '🏃' },
  { id: 'meteo',     label: 'Météo & Secrets',     icon: '🌦️' },
];

// Base de mots. `label` est la forme affichée et prononcée ; la clé de
// reconnaissance est dérivée de `label` par normalize().
const WORDS = [
  // Nature & Décors
  { label: 'arbre',       cat: 'nature', kind: 'noun' },
  { label: 'sapin',       cat: 'nature', kind: 'noun' },
  { label: 'fleur',       cat: 'nature', kind: 'noun' },
  { label: 'montagne',    cat: 'nature', kind: 'noun' },
  { label: 'nuage',       cat: 'nature', kind: 'noun' },
  { label: 'soleil',      cat: 'nature', kind: 'noun' },
  { label: 'lune',        cat: 'nature', kind: 'noun' },
  { label: 'étoile',      cat: 'nature', kind: 'noun' },
  { label: 'arc-en-ciel', cat: 'nature', kind: 'noun' },
  // Bâtiments & Objets
  { label: 'maison',  cat: 'batiments', kind: 'noun' },
  { label: 'château', cat: 'batiments', kind: 'noun' },
  { label: 'moulin',  cat: 'batiments', kind: 'noun' },
  { label: 'phare',   cat: 'batiments', kind: 'noun' },
  { label: 'tente',   cat: 'batiments', kind: 'noun' },
  { label: 'ballon',  cat: 'batiments', kind: 'noun' },
  // Animaux
  { label: 'lapin',      cat: 'animaux', kind: 'noun' },
  { label: 'oiseau',     cat: 'animaux', kind: 'noun' },
  { label: 'chat',       cat: 'animaux', kind: 'noun' },
  { label: 'chien',      cat: 'animaux', kind: 'noun' },
  { label: 'poisson',    cat: 'animaux', kind: 'noun' },
  { label: 'baleine',    cat: 'animaux', kind: 'noun' },
  { label: 'dinosaure',  cat: 'animaux', kind: 'noun' },
  { label: 'papillon',   cat: 'animaux', kind: 'noun' },
  { label: 'grenouille', cat: 'animaux', kind: 'noun' },
  // Véhicules
  { label: 'voiture',      cat: 'vehicules', kind: 'noun' },
  { label: 'camion',       cat: 'vehicules', kind: 'noun' },
  { label: 'vélo',         cat: 'vehicules', kind: 'noun' },
  { label: 'train',        cat: 'vehicules', kind: 'noun' },
  { label: 'avion',        cat: 'vehicules', kind: 'noun' },
  { label: 'fusée',        cat: 'vehicules', kind: 'noun' },
  { label: 'bateau',       cat: 'vehicules', kind: 'noun' },
  { label: 'montgolfière', cat: 'vehicules', kind: 'noun' },
  // Couleurs
  { label: 'rouge',       cat: 'couleurs', kind: 'color', value: '#e63946' },
  { label: 'bleu',        cat: 'couleurs', kind: 'color', value: '#3a86ff' },
  { label: 'vert',        cat: 'couleurs', kind: 'color', value: '#43b047' },
  { label: 'jaune',       cat: 'couleurs', kind: 'color', value: '#ffd23f' },
  { label: 'rose',        cat: 'couleurs', kind: 'color', value: '#ff7eb6' },
  { label: 'violet',      cat: 'couleurs', kind: 'color', value: '#9b5de5' },
  { label: 'orange',      cat: 'couleurs', kind: 'color', value: '#ff8c1a' },
  { label: 'noir',        cat: 'couleurs', kind: 'color', value: '#2b2b2b' },
  { label: 'blanc',       cat: 'couleurs', kind: 'color', value: '#fafafa' },
  { label: 'multicolore', cat: 'couleurs', kind: 'color', value: 'multi' },
  // Tailles & Quantités
  { label: 'petit',    cat: 'tailles', kind: 'size', op: 'petit', icon: '🤏' },
  { label: 'mini',     cat: 'tailles', kind: 'size', op: 'mini',  icon: '🐜' },
  { label: 'grand',    cat: 'tailles', kind: 'size', op: 'grand', icon: '🦒' },
  { label: 'géant',    cat: 'tailles', kind: 'size', op: 'geant', icon: '🐘' },
  { label: 'beaucoup', cat: 'tailles', kind: 'many', icon: '✨' },
  // Actions & Vitesses
  { label: 'vite',      cat: 'actions', kind: 'speed',  op: 'vite',      icon: '⚡' },
  { label: 'lentement', cat: 'actions', kind: 'speed',  op: 'lentement', icon: '🐌' },
  { label: 'stop',      cat: 'actions', kind: 'speed',  op: 'stop',      icon: '✋' },
  { label: 'saute',     cat: 'actions', kind: 'action', op: 'saute',     icon: '🦘' },
  { label: 'danse',     cat: 'actions', kind: 'action', op: 'danse',     icon: '💃' },
  { label: 'vole',      cat: 'actions', kind: 'action', op: 'vole',      icon: '🕊️' },
  // Météo & Secrets
  { label: 'jour',    cat: 'meteo', kind: 'env', op: 'jour',    icon: '🌞' },
  { label: 'nuit',    cat: 'meteo', kind: 'env', op: 'nuit',    icon: '🌜' },
  { label: 'pluie',   cat: 'meteo', kind: 'env', op: 'pluie',   icon: '🌧️' },
  { label: 'neige',   cat: 'meteo', kind: 'env', op: 'neige',   icon: '❄️' },
  { label: 'orage',   cat: 'meteo', kind: 'env', op: 'orage',   icon: '⛈️' },
  { label: 'vent',    cat: 'meteo', kind: 'env', op: 'vent',    icon: '💨' },
  { label: 'hélium',  cat: 'meteo', kind: 'env', op: 'helium',  icon: '🎈' },
  { label: 'musique', cat: 'meteo', kind: 'env', op: 'musique', icon: '🎵' },
  { label: 'rien',    cat: 'meteo', kind: 'env', op: 'rien',    icon: '🧽' },
];

// Casse, accents, espaces et tirets ignorés : « Vélo », « velo », « VELO »
// et « arc en ciel » donnent tous la même clé.
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z]/g, '');
}

for (const w of WORDS) w.key = normalize(w.label);
const WORD_INDEX = new Map(WORDS.map(w => [w.key, w]));
