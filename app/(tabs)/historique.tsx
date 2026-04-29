import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { DepenseItem } from "@/components/DepenseItem";
import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import { MonthSummaryCard } from "@/components/MonthSummaryCard";
import {
  deleteDepense,
  getDepenses,
  getMois,
  updateDepense,
  type Depense,
  type EnveloppeType,
  type Mois,
} from "@/database/queries";
import { notifyBudgetUpdated, subscribeToBudgetUpdates } from "@/shared/services/budget-events";
import { formatDate, formatMontant, formatMois, getPourcentage } from "@/utils/formatters";

const COLORS = {
  background: "#f8f7ff",
  border: "#e5e7eb",
  card: "#ffffff",
  muted: "#6b7280",
  primary: "#4f46e5",
  primaryDark: "#1a1a2e",
  softPrimary: "#eef2ff",
  softSuccess: "#dcfce7",
  success: "#10b981",
  text: "#1a1a2e",
};

const ENVELOPE_FILTERS: Array<{ key: "tous" | EnveloppeType; label: string }> = [
  { key: "tous", label: "Tous" },
  { key: "charges", label: "Charges" },
  { key: "epargne", label: "Epargne" },
  { key: "investissement", label: "Investissement" },
  { key: "urgence", label: "Urgence" },
];

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  Autre: "#6b7280",
  Communication: "#3b82f6",
  Education: "#8b5cf6",
  Epargne: "#10b981",
  Investissement: "#7c3aed",
  Logement: "#f59e0b",
  Loisirs: "#ec4899",
  Nourriture: "#ef4444",
  Sante: "#10b981",
  Transport: "#0ea5e9",
  Vetements: "#6366f1",
};

const SORT_OPTIONS = [
  { key: "recent", label: "Plus recent" },
  { key: "oldest", label: "Plus ancien" },
  { key: "highest", label: "Plus cher" },
  { key: "lowest", label: "Moins cher" },
] as const;

const EXPENSE_CATEGORIES = [
  "Nourriture",
  "Transport",
  "Logement",
  "Sante",
  "Communication",
  "Vetements",
  "Loisirs",
  "Education",
  "Epargne",
  "Investissement",
  "Autre",
] as const;

const ENVELOPE_OPTIONS: Array<{ key: EnveloppeType; label: string }> = [
  { key: "charges", label: "Charges" },
  { key: "epargne", label: "Epargne" },
  { key: "investissement", label: "Investissement" },
  { key: "urgence", label: "Urgence" },
];

type EnvelopeFilter = (typeof ENVELOPE_FILTERS)[number]["key"];
type SortKey = (typeof SORT_OPTIONS)[number]["key"];

interface DateGroup {
  data: Depense[];
  title: string;
}

interface CategorySummaryItem {
  color: string;
  label: string;
  montant: number;
}

interface MonthSectionData {
  depenses: Depense[];
  isCurrent: boolean;
  mois: Mois;
  total: number;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getEnvelopeLabel(type: EnveloppeType): string {
  switch (type) {
    case "charges":
      return "Charges";
    case "epargne":
      return "Epargne";
    case "investissement":
      return "Investissement";
    case "urgence":
      return "Urgence";
    default:
      return type;
  }
}

function getCategoryColor(category: string): string {
  return CATEGORY_BADGE_COLORS[category] ?? "#6b7280";
}

function buildDateGroups(depenses: Depense[]): DateGroup[] {
  const grouped = new Map<string, Depense[]>();

  for (const depense of depenses) {
    const dateKey = depense.date.slice(0, 10);
    const list = grouped.get(dateKey) ?? [];
    list.push(depense);
    grouped.set(dateKey, list);
  }

  return [...grouped.entries()].map(([dateKey, items]) => ({
    data: items,
    title: formatDate(dateKey),
  }));
}

function buildCategorySummary(depenses: Depense[]): CategorySummaryItem[] {
  const totals = new Map<string, number>();

  for (const depense of depenses) {
    totals.set(depense.categorie, (totals.get(depense.categorie) ?? 0) + depense.montant);
  }

  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label, montant]) => ({
      color: getCategoryColor(label),
      label,
      montant,
    }));
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function groupMonthsWithDepenses(mois: Mois[], depenses: Depense[]): MonthSectionData[] {
  const depensesByMois = new Map<number, Depense[]>();

  for (const depense of depenses) {
    const list = depensesByMois.get(depense.mois_id) ?? [];
    list.push(depense);
    depensesByMois.set(depense.mois_id, list);
  }

  return mois.map((item) => {
    const monthDepenses = depensesByMois.get(item.id) ?? [];

    return {
      depenses: monthDepenses,
      isCurrent: item.statut === "en_cours",
      mois: item,
      total: monthDepenses.reduce((sum, depense) => sum + depense.montant, 0),
    };
  });
}

function SearchHeader({
  onChangeText,
  onOpenCategoryModal,
  onOpenSortModal,
  onSelectEnvelope,
  query,
  selectedCategory,
  selectedEnvelope,
  selectedSortLabel,
}: {
  onChangeText: (value: string) => void;
  onOpenCategoryModal: () => void;
  onOpenSortModal: () => void;
  onSelectEnvelope: (value: EnvelopeFilter) => void;
  query: string;
  selectedCategory: string | null;
  selectedEnvelope: EnvelopeFilter;
  selectedSortLabel: string;
}) {
  return (
    <View style={styles.fixedHeader}>
      <Text style={styles.pageTitle}>Historique</Text>

      <View style={styles.searchBar}>
        <Ionicons color={COLORS.muted} name="search-outline" size={18} />
        <TextInput
          onChangeText={onChangeText}
          placeholder="Chercher par description, categorie, montant"
          placeholderTextColor={COLORS.muted}
          style={styles.searchInput}
          value={query}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.filtersContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {ENVELOPE_FILTERS.map((filter) => {
          const selected = selectedEnvelope === filter.key;

          return (
            <Pressable
              key={filter.key}
              onPress={() => {
                void Haptics.selectionAsync();
                onSelectEnvelope(filter.key);
              }}
              style={[styles.filterChip, selected ? styles.filterChipSelected : null]}
            >
              <Text style={selected ? styles.filterChipTextSelected : styles.filterChipText}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onOpenCategoryModal();
          }}
          style={styles.actionChip}
        >
          <Ionicons color={COLORS.primaryDark} name="funnel-outline" size={16} />
          <Text style={styles.actionChipText}>
            {selectedCategory ? `Categorie: ${selectedCategory}` : "Categorie"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onOpenSortModal();
          }}
          style={styles.actionChip}
        >
          <Ionicons color={COLORS.primaryDark} name="swap-vertical-outline" size={16} />
          <Text style={styles.actionChipText}>{selectedSortLabel}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function MonthHistorySection({
  depenses,
  isCurrent,
  mois,
  onDelete,
  onEdit,
}: {
  depenses: Depense[];
  isCurrent: boolean;
  mois: Mois;
  onDelete: (depense: Depense) => void;
  onEdit: (depense: Depense) => void;
}) {
  const [expanded, setExpanded] = useState(isCurrent);
  const dateGroups = useMemo(() => buildDateGroups(depenses), [depenses]);
  const total = useMemo(() => depenses.reduce((sum, item) => sum + item.montant, 0), [depenses]);
  const categorySummary = useMemo(() => buildCategorySummary(depenses), [depenses]);

  const header = (
    <Pressable
      disabled={isCurrent}
      onPress={() => {
        void Haptics.selectionAsync();
        setExpanded((value) => !value);
      }}
      style={[styles.monthHeaderCard, isCurrent ? styles.currentMonthCard : null]}
    >
      <View style={styles.monthHeaderMain}>
        <View style={styles.monthHeaderTitleWrap}>
          <Text style={styles.monthTitle}>{formatMois(mois.label)}</Text>
          {isCurrent ? (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>En cours</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.monthHeaderMeta}>
          {depenses.length} depenses - Total: {formatMontant(total)}
        </Text>
      </View>

      {!isCurrent ? (
        <Ionicons
          color={COLORS.muted}
          name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
          size={18}
        />
      ) : null}
    </Pressable>
  );

  if (!expanded) {
    return <View style={styles.monthSectionWrap}>{header}</View>;
  }

  return (
    <View style={styles.monthSectionWrap}>
      {header}

      <MonthSummaryCard
        categories={categorySummary.map((item) => ({
          color: item.color,
          label: item.label,
          montant: item.montant,
        }))}
        depense={total}
        restant={mois.salaire - total}
        salaire={mois.salaire}
      />

      <SectionList
        contentContainerStyle={styles.innerSectionContent}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <DepenseItem depense={item} onDelete={onDelete} onPress={onEdit} />}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.dateHeader}>
            <Text style={styles.dateHeaderText}>{title}</Text>
          </View>
        )}
        scrollEnabled={false}
        sections={dateGroups}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

export default function HistoriqueScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const [mois, setMois] = useState<Mois[]>([]);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedEnvelope, setSelectedEnvelope] = useState<EnvelopeFilter>("tous");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [editingDepense, setEditingDepense] = useState<Depense | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState<string>("Nourriture");
  const [editEnveloppe, setEditEnveloppe] = useState<EnveloppeType>("charges");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    const [moisData, depensesData] = await Promise.all([getMois(), getDepenses()]);
    setMois(moisData);
    setDepenses(depensesData);
  }, []);

  const loadScreen = useCallback(async () => {
    try {
      setIsLoading(true);
      await loadData();
    } catch (error) {
      console.error("Erreur de chargement de l'historique:", error);
      Alert.alert("Erreur", "Impossible de charger l'historique complet.");
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

  const categoryOptions = useMemo(() => {
    const allCategories = new Set(depenses.map((item) => item.categorie));
    return ["Toutes les categories", ...[...allCategories].sort((left, right) => left.localeCompare(right))];
  }, [depenses]);

  const filteredDepenses = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim());
    const workingSet = depenses.filter((item) => {
      if (selectedEnvelope !== "tous" && item.enveloppe_type !== selectedEnvelope) {
        return false;
      }

      if (selectedCategory && item.categorie !== selectedCategory) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [
        item.description,
        item.categorie,
        getEnvelopeLabel(item.enveloppe_type),
        String(item.montant),
        formatMontant(item.montant),
      ]
        .map((value) => normalizeText(value))
        .join(" ");

      return searchableText.includes(normalizedQuery);
    });

    const sorted = [...workingSet];
    sorted.sort((left, right) => {
      if (sortKey === "recent") {
        return right.date.localeCompare(left.date) || right.id - left.id;
      }

      if (sortKey === "oldest") {
        return left.date.localeCompare(right.date) || left.id - right.id;
      }

      if (sortKey === "highest") {
        return right.montant - left.montant || right.date.localeCompare(left.date);
      }

      return left.montant - right.montant || right.date.localeCompare(left.date);
    });

    return sorted;
  }, [depenses, query, selectedCategory, selectedEnvelope, sortKey]);

  const monthSections = useMemo(
    () => groupMonthsWithDepenses(mois, filteredDepenses),
    [filteredDepenses, mois]
  );

  const currentSection = useMemo(
    () => monthSections.find((item) => item.isCurrent) ?? null,
    [monthSections]
  );

  const archivedSections = useMemo(
    () => monthSections.filter((item) => !item.isCurrent && item.depenses.length > 0),
    [monthSections]
  );

  const totalAllTime = useMemo(
    () => depenses.reduce((sum, item) => sum + item.montant, 0),
    [depenses]
  );

  const selectedSortLabel = SORT_OPTIONS.find((item) => item.key === sortKey)?.label ?? "Plus recent";
  const canSaveEdit = editDescription.trim().length > 0 && Number(editAmount) > 0 && !isSavingEdit;

  const openEditModal = useCallback((depense: Depense) => {
    setEditingDepense(depense);
    setEditDescription(depense.description);
    setEditAmount(String(Math.round(depense.montant)));
    setEditCategory(depense.categorie);
    setEditEnveloppe(depense.enveloppe_type);
  }, []);

  const closeEditModal = useCallback(() => {
    if (isSavingEdit) {
      return;
    }

    setEditingDepense(null);
    setEditDescription("");
    setEditAmount("");
    setEditCategory("Nourriture");
    setEditEnveloppe("charges");
  }, [isSavingEdit]);

  const handleDelete = useCallback(
    (depense: Depense) => {
      Alert.alert(
        "Supprimer cette depense ?",
        `Cette action supprimera definitivement "${depense.description}" de l'historique.`,
        [
          { style: "cancel", text: "Annuler" },
          {
            style: "destructive",
            text: "Supprimer",
            onPress: () => {
              void (async () => {
                try {
                  await deleteDepense(depense.id);
                  notifyBudgetUpdated();
                  await loadData();
                } catch (error) {
                  console.error("Erreur de suppression de la depense:", error);
                  Alert.alert("Erreur", getErrorMessage(error, "La depense n'a pas pu etre supprimee."));
                }
              })();
            },
          },
        ]
      );
    },
    [loadData]
  );

  const handleSaveEdit = useCallback(async () => {
    if (!editingDepense) {
      return;
    }

    const montant = Number.parseInt(editAmount.replace(/[^\d]/g, ""), 10);

    if (!editDescription.trim()) {
      Alert.alert("Description manquante", "Ajoute une description pour retrouver la depense.");
      return;
    }

    if (!montant || montant <= 0) {
      Alert.alert("Montant invalide", "Entre un montant superieur a zero.");
      return;
    }

    try {
      setIsSavingEdit(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      await updateDepense({
        categorie: editCategory,
        date: editingDepense.date,
        description: editDescription.trim(),
        enveloppeType: editEnveloppe,
        heure: editingDepense.heure,
        id: editingDepense.id,
        montant,
      });

      notifyBudgetUpdated();
      await loadData();
      closeEditModal();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Erreur de mise a jour de la depense:", error);
      Alert.alert("Erreur", getErrorMessage(error, "La depense n'a pas pu etre modifiee."));
    } finally {
      setIsSavingEdit(false);
    }
  }, [
    closeEditModal,
    editAmount,
    editCategory,
    editDescription,
    editEnveloppe,
    editingDepense,
    loadData,
  ]);

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
      <View style={styles.container}>
        <SearchHeader
          onChangeText={setQuery}
          onOpenCategoryModal={() => setShowCategoryModal(true)}
          onOpenSortModal={() => setShowSortModal(true)}
          onSelectEnvelope={setSelectedEnvelope}
          query={query}
          selectedCategory={selectedCategory}
          selectedEnvelope={selectedEnvelope}
          selectedSortLabel={selectedSortLabel}
        />

        <FlatList
          contentContainerStyle={styles.listContent}
          data={archivedSections}
          keyExtractor={(item) => String(item.mois.id)}
          ListFooterComponent={
            <View style={styles.footerCard}>
              <Text style={styles.footerTitle}>Total general</Text>
              <Text style={styles.footerMeta}>
                {depenses.length} depenses - {formatMontant(totalAllTime)}
              </Text>
            </View>
          }
          ListHeaderComponent={
            currentSection ? (
              <MonthHistorySection
                depenses={currentSection.depenses}
                isCurrent
                mois={currentSection.mois}
                onDelete={handleDelete}
                onEdit={openEditModal}
              />
            ) : (
              <EmptyState
                context="historique"
                description="L'historique apparaitra ici des que tu commenceras a enregistrer des depenses."
                title="Historique vide"
              />
            )
          }
          renderItem={({ item }) => (
            <MonthHistorySection
              depenses={item.depenses}
              isCurrent={false}
              mois={item.mois}
              onDelete={handleDelete}
              onEdit={openEditModal}
            />
          )}
          showsVerticalScrollIndicator={false}
        />

        <Modal
          animationType="slide"
          onRequestClose={() => setShowCategoryModal(false)}
          transparent
          visible={showCategoryModal}
        >
          <View style={styles.modalBackdrop}>
            <Pressable onPress={() => setShowCategoryModal(false)} style={styles.modalBackdropPressable} />
            <View style={styles.bottomSheet}>
              <Text style={styles.bottomSheetTitle}>Filtrer par categorie</Text>
              {categoryOptions.map((option) => {
                const isAll = option === "Toutes les categories";
                const selected = isAll ? selectedCategory === null : selectedCategory === option;

                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSelectedCategory(isAll ? null : option);
                      setShowCategoryModal(false);
                    }}
                    style={[styles.sheetOption, selected ? styles.sheetOptionSelected : null]}
                  >
                    <Text style={selected ? styles.sheetOptionTextSelected : styles.sheetOptionText}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Modal>

        <Modal
          animationType="slide"
          onRequestClose={closeEditModal}
          transparent
          visible={Boolean(editingDepense)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable onPress={closeEditModal} style={styles.modalBackdropPressable} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <View style={styles.bottomSheet}>
                <Text style={styles.bottomSheetTitle}>Modifier la depense</Text>

                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  onChangeText={setEditDescription}
                  placeholder="Description"
                  placeholderTextColor={COLORS.muted}
                  style={styles.editInput}
                  value={editDescription}
                />

                <Text style={styles.inputLabel}>Montant</Text>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(value) => setEditAmount(value.replace(/[^\d]/g, ""))}
                  placeholder="Montant"
                  placeholderTextColor={COLORS.muted}
                  style={styles.editInput}
                  value={editAmount}
                />
                <Text style={styles.editAmountPreview}>
                  {formatMontant(Number.parseInt(editAmount || "0", 10) || 0)}
                </Text>

                <Text style={styles.inputLabel}>Categorie</Text>
                <ScrollView
                  contentContainerStyle={styles.modalChipsWrap}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {EXPENSE_CATEGORIES.map((category) => {
                    const selected = editCategory === category;

                    return (
                      <Pressable
                        key={category}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setEditCategory(category);
                        }}
                        style={[styles.filterChip, selected ? styles.filterChipSelected : null]}
                      >
                        <Text style={selected ? styles.filterChipTextSelected : styles.filterChipText}>
                          {category}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={styles.inputLabel}>Enveloppe</Text>
                <View style={styles.enveloppeEditGrid}>
                  {ENVELOPE_OPTIONS.map((option) => {
                    const selected = editEnveloppe === option.key;

                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setEditEnveloppe(option.key);
                        }}
                        style={[
                          styles.enveloppeEditChip,
                          isCompact ? styles.enveloppeEditChipCompact : null,
                          selected ? styles.enveloppeEditChipSelected : null,
                        ]}
                      >
                        <Text style={selected ? styles.enveloppeEditChipTextSelected : styles.enveloppeEditChipText}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.modalActions}>
                  <Pressable onPress={closeEditModal} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Annuler</Text>
                  </Pressable>

                  <Pressable
                    disabled={!canSaveEdit}
                    onPress={() => {
                      void handleSaveEdit();
                    }}
                    style={[styles.primaryActionButton, !canSaveEdit ? styles.primaryButtonDisabled : null]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isSavingEdit ? "Enregistrement..." : "Enregistrer"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          animationType="slide"
          onRequestClose={() => setShowSortModal(false)}
          transparent
          visible={showSortModal}
        >
          <View style={styles.modalBackdrop}>
            <Pressable onPress={() => setShowSortModal(false)} style={styles.modalBackdropPressable} />
            <View style={styles.bottomSheet}>
              <Text style={styles.bottomSheetTitle}>Trier</Text>
              {SORT_OPTIONS.map((option) => {
                const selected = sortKey === option.key;

                return (
                  <Pressable
                    key={option.key}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSortKey(option.key);
                      setShowSortModal(false);
                    }}
                    style={[styles.sheetOption, selected ? styles.sheetOptionSelected : null]}
                  >
                    <Text style={selected ? styles.sheetOptionTextSelected : styles.sheetOptionText}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  actionChip: {
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionChipText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  bottomSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    padding: 20,
    paddingBottom: 28,
  },
  bottomSheetTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  container: {
    backgroundColor: COLORS.background,
    flex: 1,
  },
  currentBadge: {
    backgroundColor: COLORS.softSuccess,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  currentBadgeText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: "700",
  },
  currentMonthCard: {
    borderColor: "#d5f5e5",
    borderWidth: 1,
  },
  dateHeader: {
    backgroundColor: COLORS.background,
    paddingBottom: 8,
    paddingTop: 12,
  },
  dateHeaderText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  editAmountPreview: {
    color: COLORS.primaryDark,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
  },
  editInput: {
    backgroundColor: "#f8f7ff",
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  enveloppeEditChip: {
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: "48%",
  },
  enveloppeEditChipCompact: {
    width: "100%",
  },
  enveloppeEditChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  enveloppeEditChipText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  enveloppeEditChipTextSelected: {
    color: COLORS.card,
    fontSize: 14,
    fontWeight: "700",
  },
  enveloppeEditGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipSelected: {
    backgroundColor: COLORS.primary,
  },
  filterChipText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  filterChipTextSelected: {
    color: COLORS.card,
    fontSize: 13,
    fontWeight: "700",
  },
  filtersContent: {
    gap: 10,
    paddingRight: 20,
  },
  fixedHeader: {
    backgroundColor: COLORS.background,
    borderBottomColor: "#ecebff",
    borderBottomWidth: 1,
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  footerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    marginTop: 8,
    padding: 18,
  },
  footerMeta: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  footerTitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginBottom: 6,
  },
  innerSectionContent: {
    paddingTop: 8,
  },
  inputLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 14,
    textTransform: "uppercase",
  },
  listContent: {
    padding: 20,
    paddingBottom: 120,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  modalChipsWrap: {
    gap: 10,
    paddingRight: 20,
  },
  modalBackdrop: {
    backgroundColor: "rgba(17, 24, 39, 0.22)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdropPressable: {
    flex: 1,
  },
  monthHeaderCard: {
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18,
  },
  monthHeaderMain: {
    flex: 1,
    minWidth: 0,
  },
  monthHeaderMeta: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  monthHeaderTitleWrap: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    rowGap: 8,
  },
  monthSectionWrap: {
    marginBottom: 16,
  },
  monthTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
  pageTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
    marginBottom: 14,
  },
  primaryActionButton: {
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: COLORS.card,
    fontSize: 15,
    fontWeight: "700",
  },
  searchBar: {
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: {
    color: COLORS.text,
    flex: 1,
    fontSize: 15,
    minWidth: 0,
    paddingVertical: 0,
  },
  sheetOption: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sheetOptionSelected: {
    backgroundColor: COLORS.softPrimary,
  },
  sheetOptionText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  sheetOptionTextSelected: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: COLORS.softPrimary,
    borderRadius: 16,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "700",
  },
});
