export const DATABASE_NAME = "budget-flow.db";

export const DEFAULT_PARAMETRES = [
  { cle: "pct_charges", valeur: "50" },
  { cle: "pct_epargne", valeur: "20" },
  { cle: "pct_investissement", valeur: "20" },
  { cle: "pct_urgence", valeur: "10" },
  { cle: "seuil_alerte", valeur: "10" },
] as const;

export const CREATE_MOIS_TABLE = `
  CREATE TABLE IF NOT EXISTS mois (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    salaire REAL NOT NULL,
    date_debut TEXT NOT NULL,
    date_cloture TEXT,
    statut TEXT NOT NULL CHECK (statut IN ('en_cours', 'cloture'))
  );
`;

export const CREATE_ENVELOPPES_TABLE = `
  CREATE TABLE IF NOT EXISTS enveloppes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mois_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('charges', 'epargne', 'investissement', 'urgence')),
    montant_initial REAL NOT NULL,
    pourcentage REAL NOT NULL,
    FOREIGN KEY (mois_id) REFERENCES mois(id) ON DELETE CASCADE,
    UNIQUE (mois_id, type)
  );
`;

export const CREATE_DEPENSES_TABLE = `
  CREATE TABLE IF NOT EXISTS depenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mois_id INTEGER NOT NULL,
    enveloppe_type TEXT NOT NULL CHECK (enveloppe_type IN ('charges', 'epargne', 'investissement', 'urgence')),
    description TEXT NOT NULL,
    montant REAL NOT NULL,
    categorie TEXT NOT NULL,
    date TEXT NOT NULL,
    heure TEXT NOT NULL,
    FOREIGN KEY (mois_id) REFERENCES mois(id) ON DELETE CASCADE
  );
`;

export const CREATE_PARAMETRES_TABLE = `
  CREATE TABLE IF NOT EXISTS parametres (
    cle TEXT PRIMARY KEY,
    valeur TEXT NOT NULL
  );
`;

export const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_enveloppes_mois_id ON enveloppes(mois_id);
  CREATE INDEX IF NOT EXISTS idx_depenses_mois_id ON depenses(mois_id);
  CREATE INDEX IF NOT EXISTS idx_depenses_date ON depenses(date DESC, heure DESC);
`;

export const SCHEMA_QUERIES = [
  CREATE_MOIS_TABLE,
  CREATE_ENVELOPPES_TABLE,
  CREATE_DEPENSES_TABLE,
  CREATE_PARAMETRES_TABLE,
  CREATE_INDEXES,
];
