import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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
  type EnveloppeType,
  type Mois,
} from "@/database/queries";
import { subscribeToBudgetUpdates } from "@/shared/services/budget-events";

const COLORS = {
  primary: "#4f46e5",
  primaryDark: "#1a1a2e",
  background: "#f8f7ff",
  card: "#ffffff",
  text: "#1a1a2e",
  muted: "#6b7280",
  success: "#10b981",
  danger: "#ef4444",
  warning: "#f59e0b",
  border: "#e5e7eb",
  softIndigo: "#eef2ff",
  softWarning: "#fff7d6",
  softDanger: "#fee2e2",
};

const ENVELOPE_CONFIG: Record<
  EnveloppeType,
  {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    lightColor: string;
    label: string;
  }
> = {
  charges: {
    icon: "home-outline",
    color: "#3b82f6",
    lightColor: "#eff6ff",
    label: "Charges",
  },
  epargne: {
    icon: "wallet-outline",
    color: "#10b981",
    lightColor: "#ecfdf5",
    label: "Epargne",
  },
  investissement: {
    icon: "trending-up-outline",
    color: "#8b5cf6",
    lightColor: "#f5f3ff",
    label: "Investissement",
  },
  urgence: {
    icon: "shield-checkmark-outline",
    color: "#f59e0b",
    lightColor: "#fff7ed",
    label: "Urgence",
  },
};

const CATEGORY_COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];

type ParametresMap = Awaited<ReturnType<typeof getParametresMap>>;

interface CategorieResume {
  color: string;
  montant: number;
  nom: string;
  ratio: number;
}

interface EnveloppeAlert {
  message: string;
  severity: "danger" | "warning";
  type: EnveloppeType;
}

function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} FCFA`;
}

function getCurrentMonthLabel(date: Date): string {
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function clampProgress(progress: number): number {
  if (Number.isNaN(progress)) {
    return 0;
  }

  return Math.min(Math.max(progress, 0), 1);
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
    const previous = totals.get(depense.categorie) ?? 0;
    totals.set(depense.categorie, previous + depense.montant);
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

function buildAlerts(enveloppes: EnveloppeAvecSolde[], seuilAlerte: number): EnveloppeAlert[] {
  const seuil = seuilAlerte / 100;

  return enveloppes.flatMap<EnveloppeAlert>((enveloppe) => {
    const ratio = enveloppe.montant_initial > 0 ? enveloppe.montant_restant / enveloppe.montant_initial : 0;
    const config = ENVELOPE_CONFIG[enveloppe.type];

    if (enveloppe.montant_restant <= 0) {
      return [
        {
          message: `${config.label} est epuisee.`,
          severity: "danger",
          type: enveloppe.type,
        },
      ];
    }

    if (ratio <= seuil) {
      return [
        {
          message: `${config.label} est presque vide (${Math.round(ratio * 100)}% restant).`,
          severity: "warning",
          type: enveloppe.type,
        },
      ];
    }

    return [];
  });
}

function AnimatedProgressBar({
  color,
  height = 8,
  progress,
  trackColor = "#ebe9ff",
}: {
  color: string;
  height?: number;
  progress: number;
  trackColor?: string;
}) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      duration: 700,
      toValue: clampProgress(progress),
      useNativeDriver: false,
    }).start();
  }, [animatedValue, progress]);

  const width = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={[styles.progressTrack, { height, backgroundColor: trackColor }]}>
      <Animated.View style={[styles.progressFill, { backgroundColor: color, width }]} />
    </View>
  );
}

function EnvelopeCard({
  envelope,
  seuilAlerte,
}: {
  envelope: EnveloppeAvecSolde;
  seuilAlerte: number;
}) {
  const config = ENVELOPE_CONFIG[envelope.type];
  const ratio = envelope.montant_initial > 0 ? envelope.montant_restant / envelope.montant_initial : 0;
  const spentRatio = envelope.montant_initial > 0 ? envelope.total_depenses / envelope.montant_initial : 0;
  const isDanger = envelope.montant_restant <= 0;
  const isWarning = !isDanger && ratio <= seuilAlerte / 100;

  const backgroundColor = isDanger
    ? COLORS.softDanger
    : isWarning
      ? COLORS.softWarning
      : COLORS.card;

  const titleColor = isDanger ? COLORS.danger : isWarning ? COLORS.warning : COLORS.text;
  const amountColor = isDanger ? COLORS.danger : isWarning ? COLORS.warning : COLORS.text;

  return (
    <View style={[styles.envelopeCard, { backgroundColor }]}>
      <View style={styles.envelopeHeader}>
        <View style={[styles.envelopeIconWrap, { backgroundColor: config.lightColor }]}>
          <Ionicons color={config.color} name={config.icon} size={18} />
        </View>
        <Text style={[styles.envelopeTitle, { color: titleColor }]}>{config.label}</Text>
      </View>

      <Text style={[styles.envelopeRemaining, { color: amountColor }]}>
        {formatCurrency(envelope.montant_restant)}
      </Text>
      <Text style={styles.envelopeInitial}>Initial: {formatCurrency(envelope.montant_initial)}</Text>

      <AnimatedProgressBar
        color={config.color}
        progress={clampProgress(spentRatio)}
        trackColor={config.lightColor}
      />
    </View>
  );
}

export default function HomeScreen() {
  const [currentMonth, setCurrentMonth] = useState<Mois | null>(null);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [enveloppes, setEnveloppes] = useState<EnveloppeAvecSolde[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingSalary, setIsSubmittingSalary] = useState(false);
  const [salaryInput, setSalaryInput] = useState("");
  const [parametres, setParametres] = useState<ParametresMap | null>(null);

  const fallbackMonthLabel = useMemo(() => getCurrentMonthLabel(new Date()), []);
  const displayMonthLabel = currentMonth?.label ?? fallbackMonthLabel;

  const totalDepense = useMemo(
    () => depenses.reduce((sum, depense) => sum + depense.montant, 0),
    [depenses]
  );

  const categorySummary = useMemo(() => buildCategorieResume(depenses), [depenses]);
  const seuilAlerte = useMemo(
    () => Number.parseFloat(parametres?.seuil_alerte ?? "10") || 10,
    [parametres]
  );
  const alerts = useMemo(() => buildAlerts(enveloppes, seuilAlerte), [enveloppes, seuilAlerte]);
  const globalProgress = useMemo(() => {
    if (!currentMonth || currentMonth.salaire <= 0) {
      return 0;
    }

    return clampProgress(totalDepense / currentMonth.salaire);
  }, [currentMonth, totalDepense]);

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
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      showsVerticalScrollIndicator={false}
      style={styles.container}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTitle}>Budget Flow</Text>
          <Text style={styles.monthLabel}>{displayMonthLabel}</Text>
        </View>

        <View style={styles.totalSpentBlock}>
          <Text style={styles.totalSpentLabel}>Depense ce mois</Text>
          <Text style={styles.totalSpentValue}>{formatCurrency(totalDepense)}</Text>
        </View>
      </View>

      {alerts.length > 0 ? (
        <View style={styles.alertsSection}>
          {alerts.map((alert) => (
            <View
              key={`${alert.type}-${alert.severity}`}
              style={[
                styles.alertBanner,
                alert.severity === "danger" ? styles.alertDanger : styles.alertWarning,
              ]}
            >
              <Ionicons
                color={alert.severity === "danger" ? COLORS.danger : COLORS.warning}
                name={alert.severity === "danger" ? "alert-circle" : "warning"}
                size={18}
              />
              <Text
                style={[
                  styles.alertText,
                  { color: alert.severity === "danger" ? COLORS.danger : COLORS.warning },
                ]}
              >
                {alert.message}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!currentMonth || currentMonth.salaire <= 0 ? (
        <View style={styles.salaryInputCard}>
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

          <Pressable
            disabled={isSubmittingSalary}
            onPress={() => {
              void handleCreateSalary();
            }}
            style={({ pressed }) => [
              styles.salaryButton,
              pressed && !isSubmittingSalary ? styles.salaryButtonPressed : null,
              isSubmittingSalary ? styles.salaryButtonDisabled : null,
            ]}
          >
            <Text style={styles.salaryButtonText}>
              {isSubmittingSalary ? "Enregistrement..." : "Definir mon salaire"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.salaryCard}>
          <View style={styles.salaryCardHeader}>
            <Text style={styles.salaryCardLabel}>Salaire du mois</Text>
            <Text style={styles.salaryCardAmount}>{formatCurrency(currentMonth.salaire)}</Text>
          </View>

          <AnimatedProgressBar color={COLORS.primary} progress={globalProgress} />

          <View style={styles.salaryCardFooter}>
            <Text style={styles.salaryFooterText}>Depense: {formatCurrency(totalDepense)}</Text>
            <Text style={styles.salaryFooterText}>
              Restant: {formatCurrency(currentMonth.salaire - totalDepense)}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Enveloppes</Text>
      </View>

      <View style={styles.envelopesGrid}>
        {enveloppes.map((envelope) => (
          <EnvelopeCard envelope={envelope} key={envelope.id} seuilAlerte={seuilAlerte} />
        ))}

        {currentMonth && enveloppes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Aucune enveloppe trouvee</Text>
            <Text style={styles.emptySubtitle}>
              Le mois existe, mais ses enveloppes n'ont pas encore ete generees.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.categorySection}>
        <Text style={styles.sectionTitle}>Ou part mon argent ce mois</Text>

        {categorySummary.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyTitle}>Aucune depense pour le moment</Text>
            <Text style={styles.emptySubtitle}>
              Les categories apparaitront ici des que tu commenceras a enregistrer tes depenses.
            </Text>
          </View>
        ) : (
          <View style={styles.categoryCard}>
            {categorySummary.map((category) => (
              <View key={category.nom} style={styles.categoryRow}>
                <View style={styles.categoryTopLine}>
                  <View style={styles.categoryLabelWrap}>
                    <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                    <Text style={styles.categoryName}>{category.nom}</Text>
                  </View>
                  <Text style={styles.categoryAmount}>{formatCurrency(category.montant)}</Text>
                </View>

                <AnimatedProgressBar
                  color={category.color}
                  height={10}
                  progress={category.ratio}
                  trackColor={COLORS.softIndigo}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  alertBanner: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  alertDanger: {
    backgroundColor: COLORS.softDanger,
  },
  alertText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  alertWarning: {
    backgroundColor: COLORS.softWarning,
  },
  alertsSection: {
    gap: 10,
    marginBottom: 20,
  },
  brandTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "700",
  },
  categoryAmount: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  categoryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 4,
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
  },
  categoryName: {
    color: COLORS.text,
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
  emptyCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    width: "100%",
  },
  emptyStateCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
  },
  emptySubtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  envelopeCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 4,
    width: "48%",
  },
  envelopeHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  envelopeIconWrap: {
    alignItems: "center",
    borderRadius: 12,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  envelopeInitial: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 14,
  },
  envelopeRemaining: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6,
  },
  envelopeTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  envelopesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  loadingContainer: {
    alignItems: "center",
    backgroundColor: COLORS.background,
    flex: 1,
    justifyContent: "center",
  },
  monthLabel: {
    color: COLORS.muted,
    fontSize: 15,
    marginTop: 4,
  },
  progressFill: {
    borderRadius: 999,
    height: "100%",
  },
  progressTrack: {
    borderRadius: 999,
    overflow: "hidden",
    width: "100%",
  },
  salaryButton: {
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 18,
  },
  salaryButtonDisabled: {
    opacity: 0.6,
  },
  salaryButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  salaryButtonText: {
    color: COLORS.card,
    fontSize: 15,
    fontWeight: "700",
  },
  salaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: 24,
    padding: 20,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 4,
  },
  salaryCardAmount: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "700",
  },
  salaryCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  salaryCardHeader: {
    marginBottom: 16,
  },
  salaryCardLabel: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 6,
  },
  salaryFooterText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  salaryInput: {
    backgroundColor: COLORS.softIndigo,
    borderColor: "#c7d2fe",
    borderRadius: 14,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  salaryInputCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.primary,
    borderRadius: 16,
    borderStyle: "dashed",
    borderWidth: 2,
    marginBottom: 24,
    padding: 20,
  },
  sectionHeader: {
    marginBottom: 12,
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
  },
  totalSpentBlock: {
    alignItems: "flex-end",
    marginLeft: 16,
  },
  totalSpentLabel: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 4,
  },
  totalSpentValue: {
    color: COLORS.danger,
    fontSize: 18,
    fontWeight: "700",
  },
});
