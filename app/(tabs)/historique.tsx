import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import {
  deleteDepense,
  getDepenses,
  getMois,
  type Depense,
  type EnveloppeType,
  type Mois,
} from "@/database/queries";
import { notifyBudgetUpdated, subscribeToBudgetUpdates } from "@/shared/services/budget-events";

const COLORS = {
  primary: "#4f46e5",
  primaryDark: "#1a1a2e",
  background: "#f8f7ff",
  card: "#ffffff",
  text: "#1a1a2e",
  muted: "#6b7280",
  success: "#10b981",
  danger: "#ef4444",
  border: "#e5e7eb",
  softPrimary: "#eef2ff",
  softSuccess: "#dcfce7",
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
  ratio: number;
}

interface MonthSectionData {
  depenses: Depense[];
  isCurrent: boolean;
  mois: Mois;
  total: number;
}

function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} FCFA`;
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

function getDateLabel(isoDate: string): string {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (sameDay) {
    return "Aujourd'hui";
  }

  const sameYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (sameYesterday) {
    return "Hier";
  }

  const formatted = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
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
    title: getDateLabel(dateKey),
  }));
}

function buildCategorySummary(depenses: Depense[]): CategorySummaryItem[] {
  const totals = new Map<string, number>();
  const total = depenses.reduce((sum, depense) => sum + depense.montant, 0);

  for (const depense of depenses) {
    totals.set(depense.categorie, (totals.get(depense.categorie) ?? 0) + depense.montant);
  }

  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label, montant]) => ({
      color: getCategoryColor(label),
      label,
      montant,
      ratio: total > 0 ? montant / total : 0,
    }));
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
              onPress={() => onSelectEnvelope(filter.key)}
              style={[styles.filterChip, selected ? styles.filterChipSelected : null]}
            >
              <Text style={selected ? styles.filterChipTextSelected : styles.filterChipText}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}

        <Pressable onPress={onOpenCategoryModal} style={styles.actionChip}>
          <Ionicons color={COLORS.primaryDark} name="funnel-outline" size={16} />
          <Text style={styles.actionChipText}>
            {selectedCategory ? `Categorie: ${selectedCategory}` : "Categorie"}
          </Text>
        </Pressable>

        <Pressable onPress={onOpenSortModal} style={styles.actionChip}>
          <Ionicons color={COLORS.primaryDark} name="swap-vertical-outline" size={16} />
          <Text style={styles.actionChipText}>{selectedSortLabel}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function CategorySummaryCard({ items }: { items: CategorySummaryItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Repartition par categorie</Text>
      {items.map((item) => (
        <View key={item.label} style={styles.summaryRow}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryLabelWrap}>
              <View style={[styles.summaryDot, { backgroundColor: item.color }]} />
              <Text style={styles.summaryLabel}>{item.label}</Text>
            </View>
            <Text style={styles.summaryAmount}>{formatCurrency(item.montant)}</Text>
          </View>

          <View style={styles.summaryTrack}>
            <View
              style={[
                styles.summaryFill,
                {
                  backgroundColor: item.color,
                  width: `${Math.max(4, Math.round(item.ratio * 100))}%`,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function HistoryItem({
  depense,
  onDelete,
}: {
  depense: Depense;
  onDelete: (depense: Depense) => void;
}) {
  return (
    <Swipeable
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={() => onDelete(depense)}
          style={({ pressed }) => [styles.deleteAction, pressed ? styles.deleteActionPressed : null]}
        >
          <Ionicons color={COLORS.card} name="trash-outline" size={18} />
          <Text style={styles.deleteActionText}>Supprimer</Text>
        </Pressable>
      )}
    >
      <View style={styles.historyItem}>
        <View style={styles.historyLeft}>
          <View style={styles.historyTitleRow}>
            <Text numberOfLines={1} style={styles.historyDescription}>
              {depense.description}
            </Text>
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: `${getCategoryColor(depense.categorie)}18` },
              ]}
            >
              <Text style={[styles.categoryBadgeText, { color: getCategoryColor(depense.categorie) }]}>
                {depense.categorie}
              </Text>
            </View>
          </View>

          <Text style={styles.historyMeta}>
            {getEnvelopeLabel(depense.enveloppe_type)} - {depense.heure}
          </Text>
        </View>

        <Text style={styles.historyAmount}>{formatCurrency(depense.montant)}</Text>
      </View>
    </Swipeable>
  );
}

function MonthHistorySection({
  categorySummary,
  depenses,
  isCurrent,
  mois,
  onDelete,
}: {
  categorySummary: CategorySummaryItem[];
  depenses: Depense[];
  isCurrent: boolean;
  mois: Mois;
  onDelete: (depense: Depense) => void;
}) {
  const [expanded, setExpanded] = useState(isCurrent);
  const dateGroups = useMemo(() => buildDateGroups(depenses), [depenses]);
  const total = useMemo(() => depenses.reduce((sum, item) => sum + item.montant, 0), [depenses]);

  const header = (
    <Pressable
      disabled={isCurrent}
      onPress={() => setExpanded((value) => !value)}
      style={[styles.monthHeaderCard, isCurrent ? styles.currentMonthCard : null]}
    >
      <View style={styles.monthHeaderMain}>
        <View style={styles.monthHeaderTitleWrap}>
          <Text style={styles.monthTitle}>{mois.label}</Text>
          {isCurrent ? (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>En cours</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.monthHeaderMeta}>
          {depenses.length} depenses - Total: {formatCurrency(total)}
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

      {!isCurrent ? <CategorySummaryCard items={categorySummary} /> : null}

      <SectionList
        contentContainerStyle={styles.innerSectionContent}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <HistoryItem depense={item} onDelete={onDelete} />}
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
  const [mois, setMois] = useState<Mois[]>([]);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedEnvelope, setSelectedEnvelope] = useState<EnvelopeFilter>("tous");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);

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
        formatCurrency(item.montant),
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

  const categorySummaryByMonth = useMemo(() => {
    const map = new Map<number, CategorySummaryItem[]>();

    for (const section of monthSections) {
      map.set(section.mois.id, buildCategorySummary(section.depenses));
    }

    return map;
  }, [monthSections]);

  const selectedSortLabel = SORT_OPTIONS.find((item) => item.key === sortKey)?.label ?? "Plus recent";

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
                  Alert.alert("Erreur", "La depense n'a pas pu etre supprimee.");
                }
              })();
            },
          },
        ]
      );
    },
    [loadData]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Chargement de l'historique...</Text>
      </View>
    );
  }

  return (
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
              {depenses.length} depenses - {formatCurrency(totalAllTime)}
            </Text>
          </View>
        }
        ListHeaderComponent={
          currentSection ? (
            <MonthHistorySection
              categorySummary={categorySummaryByMonth.get(currentSection.mois.id) ?? []}
              depenses={currentSection.depenses}
              isCurrent
              mois={currentSection.mois}
              onDelete={handleDelete}
            />
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Aucun mois en cours</Text>
              <Text style={styles.emptySubtitle}>
                L'historique apparaitra ici des que tu commenceras a enregistrer des depenses.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <MonthHistorySection
            categorySummary={categorySummaryByMonth.get(item.mois.id) ?? []}
            depenses={item.depenses}
            isCurrent={false}
            mois={item.mois}
            onDelete={handleDelete}
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
    padding: 20,
    paddingBottom: 28,
  },
  bottomSheetTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  categoryBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: "700",
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
  deleteAction: {
    alignItems: "center",
    backgroundColor: COLORS.danger,
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginBottom: 8,
    marginLeft: 10,
    marginTop: 8,
    paddingHorizontal: 18,
  },
  deleteActionPressed: {
    opacity: 0.85,
  },
  deleteActionText: {
    color: COLORS.card,
    fontSize: 13,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    marginBottom: 16,
    padding: 20,
  },
  emptySubtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
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
  historyAmount: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 12,
  },
  historyDescription: {
    color: COLORS.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    marginRight: 8,
  },
  historyItem: {
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  historyLeft: {
    flex: 1,
  },
  historyMeta: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 6,
  },
  historyTitleRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  innerSectionContent: {
    paddingTop: 8,
  },
  listContent: {
    padding: 20,
    paddingBottom: 120,
  },
  loadingContainer: {
    alignItems: "center",
    backgroundColor: COLORS.background,
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: COLORS.muted,
    fontSize: 15,
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
  },
  monthHeaderMeta: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 6,
  },
  monthHeaderTitleWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  monthSectionWrap: {
    marginBottom: 16,
  },
  monthTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  pageTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 14,
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
  summaryAmount: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    marginTop: 10,
    padding: 16,
  },
  summaryDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  summaryFill: {
    borderRadius: 999,
    height: "100%",
  },
  summaryLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  summaryLabelWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  summaryRow: {
    marginTop: 12,
  },
  summaryTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  summaryTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryTrack: {
    backgroundColor: COLORS.softPrimary,
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
  },
});
