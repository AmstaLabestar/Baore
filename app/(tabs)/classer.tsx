import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { useClassificationQueue } from "@/modules/classification/presentation/useClassificationQueue";
import { useSmsCapture } from "@/modules/sms-ingestion/presentation/useSmsCapture";
import type { Suggestion } from "@/modules/classification/domain/suggestion";
import type { TransactionEnAttente } from "@/modules/classification/infrastructure/classification-repository";
import { Button, Card, Chip, Screen, SectionHeader } from "@/shared/components/ui";
import { expenseCategories, envelopeOptions } from "@/shared/budget-config";
import { palette, radius, spacing, typography } from "@/shared/theme";
import { envelopeTheme } from "@/shared/theme/theme";
import type { EnveloppeType } from "@/shared/types/budget";
import { formatDate } from "@/utils/formatters";

/** Les montants captes sont en centimes : le FCFA s'affiche sans decimale inutile. */
function formatCentimes(centimes: number): string {
  const entier = Math.trunc(centimes / 100);
  const reste = centimes % 100;
  const base = new Intl.NumberFormat("fr-FR").format(entier);

  return reste === 0 ? `${base} FCFA` : `${base},${String(reste).padStart(2, "0")} FCFA`;
}

const ORIGINE_LABEL: Record<Suggestion["origine"], string> = {
  defaut: "A confirmer",
  historique: "Comme la derniere fois",
  mot_cle: "Reconnu automatiquement",
  type_operation: "D'apres le type d'operation",
};

interface CarteProps {
  onEcarter: () => void;
  onValider: (enveloppe: EnveloppeType, categorie: string) => void;
  suggestion: Suggestion;
  transaction: TransactionEnAttente;
}

function CarteAClasser({ onEcarter, onValider, suggestion, transaction }: CarteProps) {
  const [ouvert, setOuvert] = useState(false);
  const [enveloppe, setEnveloppe] = useState<EnveloppeType>(suggestion.enveloppe);
  const [categorie, setCategorie] = useState(suggestion.categorie);
  const theme = envelopeTheme[enveloppe];

  return (
    <Card style={styles.carte}>
      <View style={styles.enTete}>
        <View style={styles.enTeteTexte}>
          <Text numberOfLines={2} style={styles.libelle}>
            {transaction.description}
          </Text>
          <Text style={styles.meta}>
            {formatDate(transaction.date)}
            {transaction.operateur ? ` - ${transaction.operateur.replace(/_/g, " ")}` : ""}
          </Text>
        </View>
        <Text style={styles.montant}>{formatCentimes(transaction.montant_centimes)}</Text>
      </View>

      <View style={[styles.suggestion, { backgroundColor: theme.soft }]}>
        <Ionicons color={theme.color} name="sparkles-outline" size={16} />
        <Text style={[styles.suggestionTexte, { color: theme.color }]}>
          {theme.label} - {categorie}
        </Text>
        <Text style={styles.origine}>{ORIGINE_LABEL[suggestion.origine]}</Text>
      </View>

      {ouvert ? (
        <View style={styles.choix}>
          <Text style={styles.choixTitre}>Enveloppe</Text>
          <View style={styles.rangee}>
            {envelopeOptions.map((option) => (
              <Chip
                key={option.key}
                onPress={() => setEnveloppe(option.key)}
                selected={option.key === enveloppe}
              >
                {option.label}
              </Chip>
            ))}
          </View>

          <Text style={styles.choixTitre}>Categorie</Text>
          <View style={styles.rangee}>
            {expenseCategories.map((option) => (
              <Chip
                key={option.label}
                onPress={() => setCategorie(option.label)}
                selected={option.label === categorie}
              >
                {`${option.icon} ${option.label}`}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          icon={<Ionicons color={palette.white} name="checkmark" size={18} />}
          onPress={() => onValider(enveloppe, categorie)}
          style={styles.actionPrincipale}
        >
          Valider
        </Button>
        <Button onPress={() => setOuvert((valeur) => !valeur)} variant="secondary">
          {ouvert ? "Fermer" : "Changer"}
        </Button>
        <Button onPress={onEcarter} variant="secondary">
          Ignorer
        </Button>
      </View>
    </Card>
  );
}

interface AutorisationProps {
  onActiver: () => void;
}

function CarteAutorisation({ onActiver }: AutorisationProps) {
  return (
    <Card style={styles.autorisation}>
      <Ionicons color={palette.primary} name="chatbubble-ellipses-outline" size={32} />
      <Text style={styles.autorisationTitre}>Lire tes messages d'operateur</Text>
      <Text style={styles.videTexte}>
        Baore lit uniquement les SMS d'Orange Money, Moov Money, Wave et CorisMoney pour
        retrouver tes depenses. Tes messages personnels ne sont jamais lus, et rien ne quitte
        ton telephone.
      </Text>
      <Button
        icon={<Ionicons color={palette.white} name="lock-open-outline" size={18} />}
        onPress={onActiver}
      >
        Autoriser
      </Button>
    </Card>
  );
}

export default function ClasserScreen() {
  const { chargement, ecarter, entrees, recharger, revenusAConfirmer, valider } =
    useClassificationQueue();
  const capture = useSmsCapture();

  // Un scan qui ramene des transactions doit rafraichir la file affichee.
  useEffect(() => {
    if (capture.nouvelles > 0) {
      void recharger();
    }
  }, [capture.nouvelles, recharger]);

  const rafraichir = async () => {
    await capture.synchroniser();
    await recharger();
  };

  const doitAutoriser = capture.disponible && !capture.autorise;

  if (doitAutoriser) {
    return (
      <Screen>
        <SectionHeader
          subtitle="Une autorisation Android est necessaire pour commencer."
          title="A classer"
        />
        <CarteAutorisation onActiver={() => void capture.demanderAutorisation()} />
      </Screen>
    );
  }

  if (!chargement && entrees.length === 0) {
    return (
      <Screen>
        <SectionHeader
          subtitle="Chaque depense captee est rangee. Rien ne t'attend."
          title="Tout est classe"
        />
        <Card style={styles.vide}>
          <Ionicons color={palette.success} name="checkmark-done" size={40} />
          <Text style={styles.videTexte}>
            Les depenses lues dans tes messages apparaitront ici, deja pre-remplies.
          </Text>
          {revenusAConfirmer > 0 ? (
            <Text style={styles.videMeta}>
              {revenusAConfirmer} revenu(s) en attente de confirmation.
            </Text>
          ) : null}
        </Card>
      </Screen>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.contenu}
      refreshControl={
        <RefreshControl onRefresh={rafraichir} refreshing={chargement || capture.enCours} />
      }
      style={styles.fond}
    >
      <SectionHeader
        subtitle={`${entrees.length} depense(s) a ranger. Un tap suffit.`}
        title="A classer"
      />

      {entrees.map((entree) => (
        <CarteAClasser
          key={entree.transaction.id}
          onEcarter={() => void ecarter(entree.transaction.id)}
          onValider={(enveloppe, categorie) =>
            void valider(entree.transaction.id, enveloppe, categorie)
          }
          suggestion={entree.suggestion}
          transaction={entree.transaction}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actionPrincipale: { flexGrow: 1 },
  actions: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.md },
  autorisation: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
  autorisationTitre: { ...typography.title, color: palette.text, textAlign: "center" },
  carte: { marginBottom: spacing.md },
  choix: { gap: spacing.xs, marginTop: spacing.md },
  choixTitre: { ...typography.caption, color: palette.muted, marginTop: spacing.xs },
  contenu: { padding: spacing.lg, paddingBottom: spacing.xxl },
  enTete: { flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  enTeteTexte: { flexShrink: 1, gap: 2 },
  fond: { backgroundColor: palette.background, flex: 1 },
  libelle: { ...typography.body, color: palette.text, fontWeight: "600" },
  meta: { ...typography.caption, color: palette.muted },
  montant: { ...typography.body, color: palette.text, fontWeight: "700" },
  origine: { ...typography.caption, color: palette.muted, marginLeft: "auto" },
  rangee: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  suggestion: {
    alignItems: "center",
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  suggestionTexte: { ...typography.caption, fontWeight: "700" },
  vide: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
  videMeta: { ...typography.caption, color: palette.muted, textAlign: "center" },
  videTexte: { ...typography.body, color: palette.muted, textAlign: "center" },
});
