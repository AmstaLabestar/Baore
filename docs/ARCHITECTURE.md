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
- Les migrations sont versionnees via `PRAGMA user_version` dans `src/database/migrations.ts`.

## Modele de donnees : comptes et transactions

Deux axes independants coexistent :

- le **compte** repond a "ou est mon argent" (Orange Money, Coffre Fort, Moov, Wave, CorisMoney, UBA, especes) ;
- l'**enveloppe** repond a "a quoi cet argent est destine" (Charges, Epargne, Investissement, Urgence).

Une transaction porte une **nature** parmi trois, et c'est la distinction centrale :

| Nature | Exemple | Effet sur le budget |
|---|---|---|
| `depense` | paiement marchand, achat de credit | consomme une enveloppe |
| `revenu` | reception d'argent, salaire | alimente le budget |
| `transfert` | retrait, depot, Coffre Fort vers Normal | **aucun** : l'argent change de poche |

Sur dix messages reels, seuls quatre etaient des depenses. Traiter tout debit
comme une depense donnait 41 890 FCFA au lieu de 3 390, soit un facteur douze.

### Regles structurantes

- Les montants sont stockes en **centimes entiers**. Les soldes annonces par les
  operateurs s'enchainent d'un message a l'autre et servent a verifier
  l'integrite de la suite ; en flottant, l'erreur accumulee rend ce controle
  inexploitable.
- `enveloppe_type` est **nullable** : une transaction lue par SMS arrive sans
  affectation budgetaire, c'est l'utilisateur qui la classe ensuite.
- Un `transfert` exige un compte source **et** un compte destination
  (contrainte `CHECK`).
- `(operateur, reference)` est unique : la reference operateur sert de cle de
  deduplication naturelle entre un SMS et une saisie manuelle.
- `messages_bruts` conserve les messages non reconnus au lieu de les perdre :
  ils servent a ecrire les parsers manquants.

## Module d'ingestion des messages

`src/modules/sms-ingestion/` traduit un message d'operateur en fait comptable.

- `domain/` : contrat de sortie, lecture des montants, normalisation du texte.
- `infrastructure/parsers/` : un parser par operateur, plus le routage par
  expediteur qui sert aussi de filtre de confidentialite (seuls les expediteurs
  declares sont lus).
- `application/parse-message.ts` : point d'entree unique, **agnostique de la
  source** (SMS entrant, rattrapage de la boite de reception, ou notification).

Un parser ne decide jamais d'une enveloppe ni d'une categorie : il produit un
fait verifiable, le classement budgetaire est une etape separee et revisable.

## Verifications

- `npm run check` enchaine les trois controles ci-dessous.
- `npm run check:sms` rejoue les parsers contre des messages reels (`__fixtures__/`).
- `npm run check:db` execute les vraies migrations contre un moteur SQLite
  (`node:sqlite`) : conversion en centimes, idempotence, contraintes.

## Capture des messages (Android uniquement)

`modules/sms-reader/` est un module Expo local, ecrit sur mesure : aucune
bibliotheque existante ne sait relire l'historique de la boite de reception,
toutes se limitent aux SMS entrants.

Il expose deux usages complementaires :

- `readInbox` rattrape l'historique deja present sur le telephone. C'est ce qui
  permet d'afficher plusieurs mois de depenses des la premiere ouverture, au
  lieu d'une application vide qui se remplit en quelques semaines.
- l'ecoute des SMS entrants met a jour l'application pendant qu'elle est ouverte.

**Aucun service en arriere-plan.** Les SMS restent dans la boite de reception :
un simple re-balayage a chaque retour au premier plan suffit a ne rien perdre.
Ce choix evite le service persistant et la justification video qu'exige Google
depuis Android 14 (`FOREGROUND_SERVICE_SPECIAL_USE`).

Le rattrapage relit systematiquement les 24 dernieres heures deja traitees : si
un scan precedent a ete interrompu, repartir du dernier message connu laisserait
un trou definitif. La deduplication rend ce recouvrement gratuit.

### Confidentialite

Le filtre par expediteur est applique **cote Android**, avant que le contenu
d'un SMS n'atteigne JavaScript. Seuls les emetteurs declares dans
`EXPEDITEURS_AUTORISES` sont lus ; les messages personnels ne sont jamais
analyses, et rien ne quitte l'appareil.

### Contraintes de build

Ce module ne fonctionne pas dans Expo Go : il faut un development build
(`eas build --profile development --platform android`).
