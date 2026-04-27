type BudgetListener = () => void;

const listeners = new Set<BudgetListener>();

/** Notifie les ecrans budgetaires qu'une depense ou un mois a ete modifie. */
export function notifyBudgetUpdated(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Enregistre un listener et retourne une fonction de desinscription simple. */
export function subscribeToBudgetUpdates(listener: BudgetListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
