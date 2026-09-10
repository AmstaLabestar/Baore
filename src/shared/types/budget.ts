/**
 * Types budgetaires partages.
 *
 * Isoles de `database/queries` pour que les modules metier puissent les
 * utiliser sans entrainer avec eux la couche SQLite et les notifications.
 */

/** Doit rester aligne avec la contrainte CHECK des tables enveloppes et transactions. */
export type EnveloppeType = "charges" | "epargne" | "investissement" | "urgence";
