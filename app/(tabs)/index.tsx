import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { AlertBanner } from "@/components/AlertBanner";
import { AllocationPreview } from "@/components/AllocationPreview";
import { EmptyState } from "@/components/EmptyState";
import { EnveloppeCard } from "@/components/EnveloppeCard";
import { LoadingScreen } from "@/components/LoadingScreen";
import { MonthSummaryCard } from "@/components/MonthSummaryCard";
import {
  createMoisWithEnveloppes,
  getDepensesByMois,
  getEnveloppesByMois,
  getMoisEnCours,
  getParametresMap,
  initializeMoisBudget,
  type CreateEnveloppeInput,
  type Depense,
  type EnveloppeAvecSolde,
  type Mois,
} from "@/database/queries";
import { buildBudgetAlerts } from "@/services/budget-alerts";
import { Button, Card, SectionHeader } from "@/shared/components/ui";
import { subscribeToBudgetUpdates } from "@/shared/services/budget-events";
import { categoryColors, palette, radius, shadows } from "@/shared/theme";
import { formatMois, formatMontant } from "@/utils/formatters";

const COLORS = {
  background: palette.background,
  card: palette.backgroundElevated,
  danger: palette.danger,
  muted: palette.muted,
  primary: palette.primary,
  softIndigo: palette.primarySoft,
  text: palette.text,
};

type ParametresMap = Awaited<ReturnType<typeof getParametresMap>>;

interface CategorieResume {
  color: string;
  montant: number;
  nom: string;
  ratio: number;
}

const CATEGORY_COLORS = Object.values(categoryColors);

function getCurrentMonthLabel(date: Date): string {
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return formatMois(formatted);
}

function parseSalaryInput(value: string): number {
  const normalized = value.replace(/[^\d.,]/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function buildEnveloppesFromParametres(
  salaire: number,
  parametres: ParametresMap
): CreateEnveloppeInput[] {
  const pctCharges = Number.parseFloat(parametres.pct_charges);
  const pctEpargne = Number.parseFloat(parametres.pct_epargne);
  const pctInvestissement = Number.parseFloat(parametres.pct_investissement);
  const pctUrgence = Number.parseFloat(parametres.pct_urgence);

  const charges = Math.round((salaire * pctCharges) / 100);
  const epargne = Math.round((salaire * pctEpargne) / 100);
  const investissement = Math.round((salaire * pctInvestissement) / 100);
  const urgence = Math.max(0, Math.round(salaire - charges - epargne - investissement));

  return [
    { type: "charges", montantInitial: charges, pourcentage: pctCharges },
    { type: "epargne", montantInitial: epargne, pourcentage: pctEpargne },
    { type: "investissement", montantInitial: investissement, pourcentage: pctInvestissement },
    { type: "urgence", montantInitial: urgence, pourcentage: pctUrgence },
  ];
}

function buildCategorieResume(depenses: Depense[]): CategorieResume[] {
  const totals = new Map<string, number>();
  const totalDepenses = depenses.reduce((sum, depense) => sum + depense.montant, 0);

  for (const depense of depenses) {
    totals.set(depense.categorie, (totals.get(depense.categorie) ?? 0) + depense.montant);
  }

  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([nom, montant], index) => ({
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      montant,
      nom,
      ratio: totalDepenses > 0 ? montant / totalDepenses : 0,
    }));
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState<Mois | null>(null);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [enveloppes, setEnveloppes] = useState<EnveloppeAvecSolde[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingSalary, setIsSubmittingSalary] = useState(false);
  const [salaryInput, setSalaryInput] = useState("");
  const [parametres, setParametres] = useState<ParametresMap | null>(null);

  const fallbackMonthLabel = useMemo(() => getCurrentMonthLabel(new Date()), []);
  const displayMonthLabel = formatMois(currentMonth?.label ?? fallbackMonthLabel);

  const totalDepense = useMemo(
    () => depenses.reduce((sum, depense) => sum + depense.montant, 0),
    [depenses]
  );
  const categorySummary = useMemo(() => buildCategorieResume(depenses), [depenses]);
  const seuilAlerte = useMemo(
    () => Number.parseFloat(parametres?.seuil_alerte ?? "10") || 10,
    [parametres]
  );
  const alerts = useMemo(
    () => buildBudgetAlerts({ currentMonth, enveloppes, seuilAlerte }),
    [currentMonth, enveloppes, seuilAlerte]
  );
  const salaryPreview = useMemo(() => {
    const salaire = parseSalaryInput(salaryInput);

    if (salaire <= 0 || !parametres) {
      return [];
    }

    return buildEnveloppesFromParametres(salaire, parametres);
  }, [parametres, salaryInput]);

  const loadData = useCallback(async () => {
    const appParametres = await getParametresMap();
    const month = await getMoisEnCours();

    setParametres(appParametres);
    setCurrentMonth(month);

    if (!month) {
      setEnveloppes([]);
      setDepenses([]);
      return;
    }

    const [monthEnveloppes, monthDepenses] = await Promise.all([
      getEnveloppesByMois(month.id),
      getDepensesByMois(month.id),
    ]);

    setEnveloppes(monthEnveloppes);
    setDepenses(monthDepenses);
  }, []);

  const loadScreen = useCallback(
    async (refreshing = false) => {
      try {
        if (refreshing) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }

        await loadData();
      } catch (error) {
        console.error("Erreur de chargement de l'accueil:", error);
        Alert.alert("Erreur", "Impossible de charger les donnees du mois.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [loadData]
  );

  useFocusEffect(
    useCallback(() => {
      void loadScreen();
    }, [loadScreen])
  );

  useEffect(() => {
    return subscribeToBudgetUpdates(() => {
      void loadScreen(true);
    });
  }, [loadScreen]);

  const handleRefresh = useCallback(async () => {
    await loadScreen(true);
  }, [loadScreen]);

  const handleCreateSalary = useCallback(async () => {
    const salaire = parseSalaryInput(salaryInput);

    if (salaire <= 0) {
      Alert.alert("Salaire invalide", "Entre un montant de salaire superieur a zero.");
      return;
    }

    try {
      setIsSubmittingSalary(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const appParametres = parametres ?? (await getParametresMap());
      const enveloppesToCreate = buildEnveloppesFromParametres(salaire, appParametres);

      if (currentMonth && currentMonth.salaire <= 0) {
        await initializeMoisBudget({
          enveloppes: enveloppesToCreate,
          label: currentMonth.label,
          moisId: currentMonth.id,
          salaire,
        });
      } else {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

        await createMoisWithEnveloppes({
          dateDebut: startOfMonth,
          enveloppes: enveloppesToCreate,
          label: fallbackMonthLabel,
          salaire,
          statut: "en_cours",
        });
      }

      setSalaryInput("");
      await loadScreen();
    } catch (error) {
      console.error("Erreur de creation du mois:", error);
      Alert.alert("Erreur", "Le salaire du mois n'a pas pu etre enregistre.");
    } finally {
      setIsSubmittingSalary(false);
    }
  }, [currentMonth, fallbackMonthLabel, loadScreen, parametres, salaryInput]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={96}
      style={styles.container}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
        style={styles.container}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.brandRow}>
              <Image
                resizeMode="contain"
                source={require("../../assets/Baore.png")}
                style={styles.brandLogo}
              />
              <Text style={styles.brandTitle}>Baore</Text>
            </View>
            <Text style={styles.monthLabel}>{displayMonthLabel}</Text>
          </View>

          <View style={[styles.totalSpentBlock, isCompact ? styles.totalSpentBlockCompact : null]}>
            <Text style={styles.totalSpentLabel}>Depense ce mois</Text>
            <Text style={styles.totalSpentValue}>{formatMontant(totalDepense)}</Text>
          </View>
        </View>

        {alerts.length > 0 ? (
          <View style={styles.alertsSection}>
            {alerts.map((alert) => (
              <AlertBanner icon={alert.icon} key={alert.id} message={alert.message} tone={alert.tone} />
            ))}
          </View>
        ) : null}

        {!currentMonth || currentMonth.salaire <= 0 ? (
          <Card style={styles.salaryInputCard}>
            <Text style={styles.sectionTitle}>Definir le salaire du mois</Text>
            <Text style={styles.sectionSubtitle}>
              Commence par enregistrer ton salaire pour repartir automatiquement le budget.
            </Text>

            <TextInput
              keyboardType="numeric"
              onChangeText={setSalaryInput}
              placeholder="Ex: 250000"
              placeholderTextColor={COLORS.muted}
              style={styles.salaryInput}
              value={salaryInput}
            />

            <AllocationPreview items={salaryPreview} />

            <Button
              disabled={isSubmittingSalary}
              onPress={() => {
                void handleCreateSalary();
              }}
            >
              {isSubmittingSalary ? "Enregistrement..." : "Definir mon salaire"}
            </Button>
          </Card>
        ) : (
          <>
            <MonthSummaryCard
              categories={categorySummary.map((item) => ({
                color: item.color,
                label: item.nom,
                montant: item.montant,
              }))}
              depense={totalDepense}
              restant={currentMonth.salaire - totalDepense}
              salaire={currentMonth.salaire}
            />

            <Button
              onPress={() => {
                void Haptics.selectionAsync();
                router.push("/depense");
              }}
            >
              Ajouter une depense
            </Button>
          </>
        )}

        <SectionHeader title="Enveloppes" subtitle="Suivi doux de tes limites du mois" />

        <View style={styles.envelopesGrid}>
          {enveloppes.map((envelope) => (
            <EnveloppeCard
              key={envelope.id}
              montantInitial={envelope.montant_initial}
              montantRestant={envelope.montant_restant}
              pourcentage={envelope.pourcentage}
              seuil={seuilAlerte}
              type={envelope.type}
            />
          ))}

          {currentMonth && enveloppes.length === 0 ? (
            <View style={styles.fullWidth}>
              <EmptyState
                context="enveloppes"
                description="Le mois existe, mais ses enveloppes n'ont pas encore ete generees."
                title="Aucune enveloppe trouvee"
              />
            </View>
          ) : null}
        </View>

        <View style={styles.categorySection}>
          <Text style={styles.sectionTitle}>Ou part mon argent ce mois</Text>

          {categorySummary.length === 0 ? (
            <EmptyState
              context="depenses"
              description="Les categories apparaitront ici des que tu commenceras a enregistrer tes depenses."
              title="Aucune depense ce mois"
            />
          ) : (
            <Card style={styles.categoryCard}>
              {categorySummary.map((category) => (
                <View key={category.nom} style={styles.categoryRow}>
                  <View style={styles.categoryTopLine}>
                    <View style={styles.categoryLabelWrap}>
                      <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                      <Text style={styles.categoryName}>{category.nom}</Text>
                    </View>
                    <Text style={styles.categoryAmount}>{formatMontant(category.montant)}</Text>
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: category.color,
                          width: `${Math.max(6, Math.round(category.ratio * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  alertsSection: {
    gap: 10,
    marginBottom: 20,
  },
  brandLogo: {
    borderRadius: 12,
    height: 38,
    marginRight: 10,
    width: 38,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    minWidth: 0,
  },
  brandTitle: {
    color: COLORS.text,
    flexShrink: 1,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 32,
  },
  categoryAmount: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  categoryCard: {
    backgroundColor: COLORS.card,
    borderRadius: radius.lg,
    padding: 18,
    ...shadows.card,
  },
  categoryDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  categoryLabelWrap: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  categoryName: {
    color: COLORS.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  categoryRow: {
    gap: 10,
  },
  categorySection: {
    gap: 12,
  },
  categoryTopLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  container: {
    backgroundColor: COLORS.background,
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 120,
  },
  envelopesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  fullWidth: {
    width: "100%",
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 18,
    rowGap: 12,
  },
  headerLeft: {
    flexShrink: 1,
  },
  monthLabel: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 4,
  },
  progressFill: {
    borderRadius: 999,
    height: "100%",
  },
  progressTrack: {
    backgroundColor: COLORS.softIndigo,
    borderRadius: 999,
    height: 10,
    overflow: "hidden",
    width: "100%",
  },
  salaryInput: {
    backgroundColor: COLORS.softIndigo,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  salaryInputCard: {
    borderColor: COLORS.primary,
    borderRadius: radius.lg,
    borderStyle: "dashed",
    borderWidth: 2,
    marginBottom: 24,
  },
  sectionSubtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
  totalSpentBlock: {
    alignItems: "flex-end",
    marginLeft: 16,
    minWidth: 120,
  },
  totalSpentBlockCompact: {
    alignItems: "flex-start",
    marginLeft: 0,
  },
  totalSpentLabel: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  totalSpentValue: {
    color: COLORS.danger,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
});
