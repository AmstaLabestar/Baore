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

/* ------------------------------------------------------------------------- *
 * Modele multi-comptes
 *
 * Le budget par enveloppes repond a "a quoi cet argent est destine".
 * Les comptes repondent a "ou est cet argent". Ce sont deux axes independants :
 * un retrait deplace de l'argent entre deux comptes sans rien depenser, et une
 * depense consomme une enveloppe quel que soit le compte debite.
 * ------------------------------------------------------------------------- */

export const COMPTE_KEYS = [
  "orange_money_normal",
  "orange_money_coffre",
  "moov_money",
  "wave",
  "coris_money",
  "uba",
  "cash",
] as const;

/**
 * Comptes connus, crees des l'installation pour avoir des identifiants stables.
 * Seul "cash" est actif par defaut : les autres s'activent au premier message
 * recu de l'operateur correspondant.
 */
export const DEFAULT_COMPTES = [
  { actif: 1, cle: "orange_money_normal", label: "Orange Money", operateur: "orange_money", ordre: 1, type: "mobile_money" },
  { actif: 1, cle: "orange_money_coffre", label: "Orange Coffre Fort", operateur: "orange_money", ordre: 2, type: "epargne" },
  { actif: 1, cle: "moov_money", label: "Moov Money", operateur: "moov_money", ordre: 3, type: "mobile_money" },
  { actif: 0, cle: "wave", label: "Wave", operateur: "wave", ordre: 4, type: "mobile_money" },
  { actif: 0, cle: "coris_money", label: "CorisMoney", operateur: "coris_money", ordre: 5, type: "mobile_money" },
  { actif: 0, cle: "uba", label: "UBA", operateur: "uba", ordre: 6, type: "banque" },
  { actif: 1, cle: "cash", label: "Especes", operateur: null, ordre: 7, type: "cash" },
] as const;

export const CREATE_COMPTES_TABLE = `
  CREATE TABLE IF NOT EXISTS comptes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cle TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    operateur TEXT,
    type TEXT NOT NULL CHECK (type IN ('mobile_money', 'banque', 'cash', 'epargne')),
    solde_centimes INTEGER NOT NULL DEFAULT 0,
    solde_constate_le TEXT,
    actif INTEGER NOT NULL DEFAULT 1,
    ordre INTEGER NOT NULL DEFAULT 0
  );
`;

/**
 * Les montants sont en centimes entiers : les soldes s'enchainent d'un message
 * a l'autre pour verifier l'integrite de la suite, et le flottant y accumule
 * une erreur qui rend ce controle inexploitable.
 *
 * `enveloppe_type` est nullable a dessein : une transaction lue par SMS arrive
 * sans affectation budgetaire, c'est l'utilisateur qui la classe ensuite.
 */
export const CREATE_TRANSACTIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mois_id INTEGER,
    nature TEXT NOT NULL CHECK (nature IN ('depense', 'revenu', 'transfert')),
    kind TEXT NOT NULL,
    montant_centimes INTEGER NOT NULL CHECK (montant_centimes >= 0),
    frais_centimes INTEGER,
    taxe_centimes INTEGER,
    total_centimes INTEGER,
    compte_source_id INTEGER,
    compte_destination_id INTEGER,
    enveloppe_type TEXT CHECK (
      enveloppe_type IS NULL
      OR enveloppe_type IN ('charges', 'epargne', 'investissement', 'urgence')
    ),
    categorie TEXT,
    description TEXT NOT NULL,
    contrepartie_nom TEXT,
    contrepartie_numero TEXT,
    contrepartie_code TEXT,
    contrepartie_type TEXT,
    date TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('sms', 'manuelle', 'import')),
    operateur TEXT,
    reference TEXT,
    statut TEXT NOT NULL DEFAULT 'a_classer'
      CHECK (statut IN ('a_classer', 'classee', 'ignoree')),
    legacy_depense_id INTEGER,
    cree_le TEXT NOT NULL,
    FOREIGN KEY (mois_id) REFERENCES mois(id) ON DELETE SET NULL,
    FOREIGN KEY (compte_source_id) REFERENCES comptes(id),
    FOREIGN KEY (compte_destination_id) REFERENCES comptes(id),
    CHECK (
      nature <> 'transfert'
      OR (compte_source_id IS NOT NULL AND compte_destination_id IS NOT NULL)
    )
  );
`;

/**
 * File des messages captes. On garde meme ceux qu'on ne sait pas lire :
 * ils alimentent l'ecriture des parsers manquants (Wave, CorisMoney, UBA)
 * au lieu d'etre perdus silencieusement.
 */
export const CREATE_MESSAGES_BRUTS_TABLE = `
  CREATE TABLE IF NOT EXISTS messages_bruts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expediteur TEXT NOT NULL,
    corps TEXT NOT NULL,
    recu_le TEXT NOT NULL,
    operateur TEXT,
    statut TEXT NOT NULL CHECK (statut IN ('parse', 'non_reconnu', 'ignore')),
    raison TEXT,
    transaction_id INTEGER,
    empreinte TEXT NOT NULL UNIQUE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
  );
`;

/**
 * Soldes annonces par les operateurs. Confrontes a la somme des transactions,
 * ils permettent de detecter qu'un message manque plutot que d'afficher un
 * chiffre faux avec assurance.
 */
export const CREATE_SOLDES_RAPPORTES_TABLE = `
  CREATE TABLE IF NOT EXISTS soldes_rapportes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    compte_id INTEGER NOT NULL,
    transaction_id INTEGER,
    solde_centimes INTEGER NOT NULL,
    constate_le TEXT NOT NULL,
    FOREIGN KEY (compte_id) REFERENCES comptes(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
  );
`;

export const CREATE_MULTI_COMPTES_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
  CREATE INDEX IF NOT EXISTS idx_transactions_mois ON transactions(mois_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_statut ON transactions(statut);
  CREATE INDEX IF NOT EXISTS idx_transactions_nature ON transactions(nature);
  CREATE INDEX IF NOT EXISTS idx_transactions_legacy ON transactions(legacy_depense_id);
  CREATE INDEX IF NOT EXISTS idx_soldes_compte ON soldes_rapportes(compte_id, constate_le DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reference
    ON transactions(operateur, reference) WHERE reference IS NOT NULL;
`;
