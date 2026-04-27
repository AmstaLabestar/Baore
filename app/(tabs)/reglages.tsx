import Slider from "@react-native-community/slider";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { LoadingScreen } from "@/components/LoadingScreen";
import {
  cloturerMois,
  createMois,
  getDepenses,
  getMois,
  getMoisEnCours,
  getParametresMap,
  updateParametre,
  type Depense,
  type Mois,
  type ParametreCle,
} from "@/database/queries";
import { notifyBudgetUpdated, subscribeToBudgetUpdates } from "@/shared/services/budget-events";
import { formatMontant } from "@/utils/formatters";

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
  softPrimary: "#eef2ff",
  softSuccess: "#dcfce7",
};

type ParametresMap = Awaited<ReturnType<typeof getParametresMap>>;

interface AllocationState {
  pct_charges: number;
  pct_epargne: number;
  pct_investissement: number;
  pct_urgence: number;
}

function getMonthLabel(date: Date): string {
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getMonthStart(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

function getAllocationTotal(allocation: AllocationState): number {
  return (
    allocation.pct_charges +
    allocation.pct_epargne +
    allocation.pct_investissement +
    allocation.pct_urgence
  );
}

function getMonthTotal(depenses: Depense[], moisId: number): number {
  return depenses
    .filter((depense) => depense.mois_id === moisId)
    .reduce((sum, depense) => sum + depense.montant, 0);
}

function getTopCategory(depenses: Depense[]): { label: string; montant: number } | null {
  const totals = new Map<string, number>();

  for (const depense of depenses) {
    totals.set(depense.categorie, (totals.get(depense.categorie) ?? 0) + depense.montant);
  }

  const sorted = [...totals.entries()].sort((left, right) => right[1] - left[1]);

  if (!sorted.length) {
    return null;
  }

  return {
    label: sorted[0][0],
    montant: sorted[0][1],
  };
}

function getMostEconomicalMonth(mois: Mois[], depenses: Depense[]): { economie: number; label: string } | null {
  const candidates = mois
    .filter((item) => item.salaire > 0)
    .map((item) => ({
      economie: item.salaire - getMonthTotal(depenses, item.id),
      label: item.label,
    }))
    .sort((left, right) => right.economie - left.economie);

  return candidates[0] ?? null;
}

function SettingsSection({
  children,
  footer,
  title,
}: {
  children: React.ReactNode;
  footer?: string;
  title: string;
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

function RowSeparator() {
  return <View style={styles.separator} />;
}

export default function ReglagesScreen() {
  const [allocation, setAllocation] = useState<AllocationState>({
    pct_charges: 50,
    pct_epargne: 20,
    pct_investissement: 20,
    pct_urgence: 10,
  });
  const [alertThreshold, setAlertThreshold] = useState(20);
  const [currentMonth, setCurrentMonth] = useState<Mois | null>(null);
  const [allMonths, setAllMonths] = useState<Mois[]>([]);
  const [allDepenses, setAllDepenses] = useState<Depense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAllocation, setIsSavingAllocation] = useState(false);
  const [isSavingAlert, setIsSavingAlert] = useState(false);
  const [isClosingMonth, setIsClosingMonth] = useState(false);

  const allocationTotal = useMemo(() => getAllocationTotal(allocation), [allocation]);
  const canApplyAllocation = allocationTotal === 100 && !isSavingAllocation;

  const currentMonthSpent = useMemo(
    () => (currentMonth ? getMonthTotal(allDepenses, currentMonth.id) : 0),
    [allDepenses, currentMonth]
  );

  const currentMonthSaved = useMemo(() => {
    if (!currentMonth) {
      return 0;
    }

    return currentMonth.salaire - currentMonthSpent;
  }, [currentMonth, currentMonthSpent]);

  const thresholdPreviewAmount = useMemo(() => {
    const baseCharges =
      currentMonth && currentMonth.salaire > 0
        ? (currentMonth.salaire * allocation.pct_charges) / 100
        : 0;

    return Math.round((baseCharges * alertThreshold) / 100);
  }, [alertThreshold, allocation.pct_charges, currentMonth]);

  const topCategory = useMemo(() => getTopCategory(allDepenses), [allDepenses]);
  const mostEconomicalMonth = useMemo(
    () => getMostEconomicalMonth(allMonths, allDepenses),
    [allDepenses, allMonths]
  );

  const loadData = useCallback(async () => {
    const [settings, current, months, depenses] = await Promise.all([
      getParametresMap(),
      getMoisEnCours(),
      getMois(),
      getDepenses(),
    ]);

    setCurrentMonth(current);
    setAllMonths(months);
    setAllDepenses(depenses);
    setAllocation({
      pct_charges: Number.parseFloat(settings.pct_charges) || 0,
      pct_epargne: Number.parseFloat(settings.pct_epargne) || 0,
      pct_investissement: Number.parseFloat(settings.pct_investissement) || 0,
      pct_urgence: Number.parseFloat(settings.pct_urgence) || 0,
    });
    setAlertThreshold(Number.parseFloat(settings.seuil_alerte) || 20);
  }, []);

  const loadScreen = useCallback(async () => {
    try {
      setIsLoading(true);
      await loadData();
    } catch (error) {
      console.error("Erreur de chargement des reglages:", error);
      Alert.alert("Erreur", "Impossible de charger les reglages.");
    } finally {
      setIsLoading(false);
    }
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      void loadScreen();
    }, [loadScreen])
  );

  useEffect(() => {
    return subscribeToBudgetUpdates(() => {
      void loadData();
    });
  }, [loadData]);

  const handleApplyAllocation = useCallback(async () => {
    if (allocationTotal !== 100) {
      return;
    }

    try {
      setIsSavingAllocation(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const entries: Array<[ParametreCle, number]> = [
        ["pct_charges", allocation.pct_charges],
        ["pct_epargne", allocation.pct_epargne],
        ["pct_investissement", allocation.pct_investissement],
        ["pct_urgence", allocation.pct_urgence],
      ];

      await Promise.all(
        entries.map(([cle, valeur]) =>
          updateParametre({
            cle,
            valeur: String(valeur),
          })
        )
      );

      notifyBudgetUpdated();
      await loadData();
    } catch (error) {
      console.error("Erreur de mise a jour des pourcentages:", error);
      Alert.alert("Erreur", "Les nouveaux pourcentages n'ont pas pu etre enregistres.");
    } finally {
      setIsSavingAllocation(false);
    }
  }, [allocation, allocationTotal, loadData]);

  const persistAlertThreshold = useCallback(async (value: number) => {
    try {
      setIsSavingAlert(true);
      await updateParametre({
        cle: "seuil_alerte",
        valeur: String(value),
      });
      notifyBudgetUpdated();
    } catch (error) {
      console.error("Erreur de mise a jour du seuil d'alerte:", error);
      Alert.alert("Erreur", "Le seuil d'alerte n'a pas pu etre enregistre.");
    } finally {
      setIsSavingAlert(false);
    }
  }, []);

  const closeCurrentMonth = useCallback(() => {
    if (!currentMonth) {
      return;
    }

    Alert.alert(
      `Cloturer ${currentMonth.label} ?`,
      "Le mois sera archive et un nouveau mois vide sera prepare.",
      [
        { style: "cancel", text: "Annuler" },
        {
          style: "destructive",
          text: "Cloturer",
          onPress: () => {
            void (async () => {
              try {
                setIsClosingMonth(true);
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

                await cloturerMois(currentMonth.id);

                const currentMonthDate = new Date(currentMonth.date_debut);
                const nextMonthDate = new Date(
                  currentMonthDate.getFullYear(),
                  currentMonthDate.getMonth() + 1,
                  1
                );

                await createMois({
                  dateDebut: getMonthStart(nextMonthDate),
                  label: getMonthLabel(nextMonthDate),
                  salaire: 0,
                  statut: "en_cours",
                });

                notifyBudgetUpdated();
                await loadData();
              } catch (error) {
                console.error("Erreur de cloture du mois:", error);
                Alert.alert("Erreur", "Le mois n'a pas pu etre cloture.");
              } finally {
                setIsClosingMonth(false);
              }
            })();
          },
        },
      ]
    );
  }, [currentMonth, loadData]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      style={styles.container}
    >
      <StatusBar style="dark" />
      <Text style={styles.pageTitle}>Reglages</Text>

      <SettingsSection
        footer="Ces changements s'appliquent au prochain mois."
        title="Repartition du budget"
      >
        {(
          [
            { key: "pct_charges", label: "Charges" },
            { key: "pct_epargne", label: "Epargne" },
            { key: "pct_investissement", label: "Investissement" },
            { key: "pct_urgence", label: "Urgence" },
          ] as const
        ).map((item, index, array) => (
          <View key={item.key}>
            <View style={styles.sliderRow}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowValue}>{allocation[item.key]}%</Text>
            </View>

            <Slider
              maximumTrackTintColor="#d9dbf3"
              maximumValue={100}
              minimumTrackTintColor={COLORS.primary}
              minimumValue={0}
              onValueChange={(value) =>
                setAllocation((previous) => ({
                  ...previous,
                  [item.key]: Math.round(value),
                }))
              }
              step={1}
              thumbTintColor={COLORS.primary}
              value={allocation[item.key]}
            />

            {index < array.length - 1 ? <RowSeparator /> : null}
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text
            style={[
              styles.totalValue,
              allocationTotal === 100 ? styles.totalValueSuccess : styles.totalValueDanger,
            ]}
          >
            {allocationTotal}% {allocationTotal === 100 ? "OK" : "A ajuster"}
          </Text>
        </View>

        <Pressable
          disabled={!canApplyAllocation}
          onPress={() => {
            void handleApplyAllocation();
          }}
          style={[
            styles.primaryButton,
            !canApplyAllocation ? styles.primaryButtonDisabled : null,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isSavingAllocation ? "Application..." : "Appliquer"}
          </Text>
        </Pressable>
      </SettingsSection>

      <SettingsSection title="Alertes">
        <Text style={styles.rowLabel}>
          M'alerter quand il reste moins de {alertThreshold}% dans une enveloppe
        </Text>
        <Slider
          maximumTrackTintColor="#f3e8cf"
          maximumValue={40}
          minimumTrackTintColor={COLORS.warning}
          minimumValue={5}
          onSlidingComplete={(value) => {
            void Haptics.selectionAsync();
            void persistAlertThreshold(Math.round(value));
          }}
          onValueChange={(value) => setAlertThreshold(Math.round(value))}
          step={1}
          thumbTintColor={COLORS.warning}
          value={alertThreshold}
        />
        <Text style={styles.previewText}>
          Tu seras alerte quand il reste {alertThreshold}% soit {formatMontant(thresholdPreviewAmount)}
          {" "}sur Charges
        </Text>
        {isSavingAlert ? <Text style={styles.helperText}>Enregistrement du seuil...</Text> : null}
      </SettingsSection>

      <SettingsSection title="Mois en cours">
        {currentMonth ? (
          <>
            <View style={styles.metricRow}>
              <Text style={styles.rowLabel}>Mois</Text>
              <Text style={styles.rowValue}>{currentMonth.label}</Text>
            </View>
            <RowSeparator />
            <View style={styles.metricRow}>
              <Text style={styles.rowLabel}>Salaire</Text>
              <Text style={styles.rowValue}>{formatMontant(currentMonth.salaire)}</Text>
            </View>
            <RowSeparator />
            <View style={styles.metricRow}>
              <Text style={styles.rowLabel}>Total depense</Text>
              <Text style={styles.rowValue}>{formatMontant(currentMonthSpent)}</Text>
            </View>
            <RowSeparator />
            <View style={styles.metricRow}>
              <Text style={styles.rowLabel}>Economise</Text>
              <Text
                style={[
                  styles.rowValue,
                  currentMonthSaved >= 0 ? styles.successText : styles.dangerText,
                ]}
              >
                {formatMontant(currentMonthSaved)}
              </Text>
            </View>

            <Pressable
              disabled={isClosingMonth}
              onPress={closeCurrentMonth}
              style={[styles.dangerButton, isClosingMonth ? styles.primaryButtonDisabled : null]}
            >
              <Text style={styles.dangerButtonText}>
                {isClosingMonth ? "Cloture..." : `Cloturer le mois de ${currentMonth.label}`}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.helperText}>Aucun mois en cours pour le moment.</Text>
        )}
      </SettingsSection>

      <SettingsSection title="Statistiques globales">
        <View style={styles.metricRow}>
          <Text style={styles.rowLabel}>Nombre de mois traces</Text>
          <Text style={styles.rowValue}>{allMonths.length}</Text>
        </View>
        <RowSeparator />
        <View style={styles.metricRow}>
          <Text style={styles.rowLabel}>Total depense</Text>
          <Text style={styles.rowValue}>
            {formatMontant(allDepenses.reduce((sum, depense) => sum + depense.montant, 0))}
          </Text>
        </View>
        <RowSeparator />
        <View style={styles.metricRow}>
          <Text style={styles.rowLabel}>Categorie la plus depensiere</Text>
          <Text style={styles.rowValue}>
            {topCategory ? `${topCategory.label} - ${formatMontant(topCategory.montant)}` : "-"}
          </Text>
        </View>
        <RowSeparator />
        <View style={styles.metricRow}>
          <Text style={styles.rowLabel}>Mois le plus econome</Text>
          <Text style={styles.rowValue}>
            {mostEconomicalMonth
              ? `${mostEconomicalMonth.label} - ${formatMontant(mostEconomicalMonth.economie)}`
              : "-"}
          </Text>
        </View>
      </SettingsSection>

      <SettingsSection title="A propos">
        <View style={styles.metricRow}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>
            {Constants.expoConfig?.version ?? "1.0.0"}
          </Text>
        </View>
        <RowSeparator />
        <Text style={styles.aboutText}>
          Toutes vos donnees sont stockees localement sur votre telephone.
        </Text>
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  aboutText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  container: {
    backgroundColor: COLORS.background,
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 120,
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: COLORS.danger,
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 54,
    paddingHorizontal: 18,
  },
  dangerButtonText: {
    color: COLORS.card,
    fontSize: 15,
    fontWeight: "700",
  },
  dangerText: {
    color: COLORS.danger,
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 10,
  },
  loadingContainer: {
    display: "none",
  },
  metricRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pageTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 18,
  },
  previewText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 54,
    paddingHorizontal: 18,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: COLORS.card,
    fontSize: 15,
    fontWeight: "700",
  },
  rowLabel: {
    color: COLORS.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    marginRight: 12,
  },
  rowValue: {
    color: COLORS.primaryDark,
    fontSize: 15,
    fontWeight: "700",
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 4,
  },
  sectionFooter: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginBottom: 10,
    paddingHorizontal: 4,
    textTransform: "uppercase",
  },
  sectionWrap: {
    marginBottom: 24,
  },
  separator: {
    backgroundColor: "#eef0f5",
    height: 1,
    marginVertical: 14,
  },
  sliderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  successText: {
    color: COLORS.success,
  },
  totalLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  totalRow: {
    alignItems: "center",
    backgroundColor: COLORS.softPrimary,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  totalValueDanger: {
    color: COLORS.danger,
  },
  totalValueSuccess: {
    color: COLORS.success,
  },
});
