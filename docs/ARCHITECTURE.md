# Budget Flow - Architecture initiale

## Stack retenue

- React Native avec Expo SDK 54
- TypeScript
- `expo-sqlite` pour la persistence locale
- `expo-router` pour la navigation
- NativeWind + Tailwind CSS pour le styling

## Approche d'architecture

Le projet est prepare avec une organisation modulaire orientee fonctionnalites, afin de rester simple a faire evoluer tout en respectant les principes SOLID.

Chaque module metier possede ses propres couches :

- `application/` : cas d'usage, orchestration, services applicatifs
- `domain/` : entites, regles metier, contrats
- `infrastructure/` : acces SQLite, repositories, persistence
- `presentation/` : ecrans, composants, view models, hooks lies au module

## Arborescence

```text
app/
  (root)/
  (modals)/

src/
  modules/
    salary/
      application/
      domain/
      infrastructure/
      presentation/
    envelopes/
      application/
      domain/
      infrastructure/
      presentation/
    expenses/
      application/
      domain/
      infrastructure/
      presentation/
    month-closing/
      application/
      domain/
      infrastructure/
      presentation/
    settings/
      application/
      domain/
      infrastructure/
      presentation/
  shared/
    components/
    constants/
    database/
    hooks/
    services/
    theme/
    types/
    utils/
```

## Notes

- `app/` est reserve a la navigation `expo-router`.
- `src/shared/` contient uniquement les briques reutilisables entre modules.
- Les alias TypeScript `@/`, `@modules/` et `@shared/` sont deja poses pour garder des imports propres.
- La logique fonctionnelle n'est pas encore implementee a ce stade, conformement a la demande.
