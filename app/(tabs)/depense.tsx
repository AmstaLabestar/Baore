import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { AllocationPreview } from "@/components/AllocationPreview";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  addDepense,
  createMoisWithEnveloppes,
  getEnveloppesByMois,
  getMoisEnCours,
  getParametresMap,
  getRecentDescriptions,
  initializeMoisBudget,
  type CreateEnveloppeInput,
  type EnveloppeAvecSolde,
  type EnveloppeType,
  type Mois,
} from "@/database/queries";
import { expenseCategories, type ExpenseCategoryLabel } from "@/shared/budget-config";
import { notifyBudgetUpdated } from "@/shared/services/budget-events";
import { envelopeTheme, palette, radius, shadows } from "@/shared/theme";
import { formatMontant } from "@/utils/formatters";

const COLORS = {
  primary: palette.primary,
  primaryDark: palette.primaryDark,
  background: palette.background,
  backgroundSoft: palette.primarySoft,
  card: palette.backgroundElevated,
  text: palette.text,
  muted: palette.muted,
  border: palette.border,
  success: palette.success,
  softPrimary: palette.mutedSoft,
};

const ENVELOPE_CONFIG: Record<
  EnveloppeType,
  {
    color: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
  }
> = {
  charges: {
    color: envelopeTheme.charges.color,
    icon: "home-outline",
    label: envelopeTheme.charges.label,
  },
  epargne: {
    color: envelopeTheme.epargne.color,
    icon: "wallet-outline",
    label: envelopeTheme.epargne.label,
  },
  investissement: {
    color: envelopeTheme.investissement.color,
    icon: "trending-up-outline",
    label: envelopeTheme.investissement.label,
  },
  urgence: {
    color: envelopeTheme.urgence.color,
    icon: "shield-checkmark-outline",
    label: envelopeTheme.urgence.label,
  },
};

type CategoryLabel = ExpenseCategoryLabel;
type ParametresMap = Awaited<ReturnType<typeof getParametresMap>>;

function getCurrentMonthLabel(date: Date): string {
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function parseAmountInput(value: string): number {
  const normalized = value.replace(/[^\d]/g, "");

  return normalized ? Number.parseInt(normalized, 10) : 0;
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function DepenseScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const tabBarHeight = useBottomTabBarHeight();
  const descriptionInputRef = useRef<TextInput>(null);
  const amountInputRef = useRef<TextInput>(null);
  const successScale = useRef(new Animated.Value(0.6)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const saveButtonScale = useRef(new Animated.Value(1)).current;

  const [currentMonth, setCurrentMonth] = useState<Mois | null>(null);
  const [enveloppes, setEnveloppes] = useState<EnveloppeAvecSolde[]>([]);
  const [recentDescriptions, setRecentDescriptions] = useState<string[]>([]);
  const [parametres, setParametres] = useState<ParametresMap | null>(null);
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryLabel>("Nourriture");
  const [selectedEnveloppe, setSelectedEnveloppe] = useState<EnveloppeType | null>(null);
  const [salaryInput, setSalaryInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingMonth, setIsCreatingMonth] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const parsedAmount = useMemo(() => parseAmountInput(amountInput), [amountInput]);
  const salaryPreview = useMemo(() => {
    const salaire = parseAmountInput(salaryInput);

    if (salaire <= 0 || !parametres) {
      return [];
    }

    return buildEnveloppesFromParametres(salaire, parametres);
  }, [parametres, salaryInput]);
  const saveHint = useMemo(() => {
    if (!description.trim()) {
      return "Ajoute d'abord une description.";
    }

    if (parsedAmount <= 0) {
      return "Entre ensuite le montant de la depense.";
    }

    if (!selectedEnveloppe) {
      return "Choisis l'enveloppe a debiter.";
    }

    return "Appuie sur le bouton pour valider et enregistrer la depense.";
  }, [description, parsedAmount, selectedEnveloppe]);
  const canSave =
    description.trim().length > 0 &&
    parsedAmount > 0 &&
    Boolean(selectedCategory) &&
    Boolean(selectedEnveloppe) &&
    Boolean(currentMonth) &&
    !isSaving;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(saveButtonScale, {
          duration: 800,
          toValue: 1.02,
          useNativeDriver: true,
        }),
        Animated.timing(saveButtonScale, {
          duration: 800,
          toValue: 1,
          useNativeDriver: true,
        }),
      ])
    );

    if (canSave) {
      pulseAnimation.start();
    } else {
      saveButtonScale.stopAnimation();
      Animated.timing(saveButtonScale, {
        duration: 180,
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      pulseAnimation.stop();
    };
  }, [canSave, saveButtonScale]);

  const focusDescription = useCallback(() => {
    requestAnimationFrame(() => {
      descriptionInputRef.current?.focus();
    });
  }, []);

  const playSuccessAnimation = useCallback(() => {
    setShowSuccess(true);
    successScale.setValue(0.6);
    successOpacity.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(successOpacity, {
          duration: 160,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.spring(successScale, {
          friction: 7,
          tension: 120,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(380),
      Animated.timing(successOpacity, {
        duration: 180,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowSuccess(false);
    });
  }, [successOpacity, successScale]);

  const loadData = useCallback(async () => {
    const [month, appParametres, suggestions] = await Promise.all([
      getMoisEnCours(),
      getParametresMap(),
      getRecentDescriptions(8),
    ]);

    setCurrentMonth(month);
    setParametres(appParametres);
    setRecentDescriptions(suggestions);

    if (!month) {
      setEnveloppes([]);
      setSelectedEnveloppe(null);
      return;
    }

    const monthEnveloppes = await getEnveloppesByMois(month.id);
    setEnveloppes(monthEnveloppes);
    setSelectedEnveloppe((previous) =>
      previous && monthEnveloppes.some((item) => item.type === previous)
        ? previous
        : monthEnveloppes[0]?.type ?? null
    );
  }, []);

  const loadScreen = useCallback(async () => {
    try {
      setIsLoading(true);
      await loadData();
    } catch (error) {
      console.error("Erreur de chargement de la page Depense:", error);
      Alert.alert("Erreur", "Impossible de charger les donnees de saisie.");
    } finally {
      setIsLoading(false);
    }
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      void loadScreen();
    }, [loadScreen])
  );

  const handleCreateCurrentMonth = useCallback(async () => {
    const salaire = parseAmountInput(salaryInput);

    if (salaire <= 0) {
      Alert.alert("Salaire invalide", "Entre un salaire superieur a zero pour demarrer.");
      return;
    }

    try {
      setIsCreatingMonth(true);
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
          label: getCurrentMonthLabel(today),
          salaire,
          statut: "en_cours",
        });
      }

      setSalaryInput("");
      await loadScreen();
      notifyBudgetUpdated();
      focusDescription();
    } catch (error) {
      console.error("Erreur de creation du mois depuis Depense:", error);
      Alert.alert("Erreur", getErrorMessage(error, "Le mois courant n'a pas pu etre initialise."));
    } finally {
      setIsCreatingMonth(false);
    }
  }, [currentMonth, focusDescription, loadScreen, parametres, salaryInput]);

  const handleSave = useCallback(async () => {
    if (!currentMonth || !selectedEnveloppe || !selectedCategory) {
      Alert.alert("Donnees manquantes", "Choisis une enveloppe et une categorie avant d'enregistrer.");
      return;
    }

    if (!description.trim()) {
      Alert.alert("Description manquante", "Decris rapidement la depense pour la retrouver plus tard.");
      return;
    }

    if (parsedAmount <= 0) {
      Alert.alert("Montant invalide", "Entre un montant superieur a zero.");
      return;
    }

    try {
      setIsSaving(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const now = new Date();
      const heure = new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(now);

      await addDepense({
        categorie: selectedCategory,
        date: now.toISOString(),
        description: description.trim(),
        enveloppeType: selectedEnveloppe,
        heure,
        moisId: currentMonth.id,
        montant: parsedAmount,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSuccessAnimation();
      notifyBudgetUpdated();

      setDescription("");
      setAmountInput("");
      setSelectedCategory("Nourriture");

      await loadData();
      focusDescription();
    } catch (error) {
      console.error("Erreur d'enregistrement de la depense:", error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Erreur", getErrorMessage(error, "La depense n'a pas pu etre enregistree."));
    } finally {
      setIsSaving(false);
    }
  }, [
    currentMonth,
    description,
    focusDescription,
    loadData,
    parsedAmount,
    playSuccessAnimation,
    selectedCategory,
    selectedEnveloppe,
  ]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <LinearGradient colors={[COLORS.backgroundSoft, COLORS.card]} style={styles.gradient}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={96}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: tabBarHeight + 128 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>Nouvelle depense</Text>

          {!currentMonth || currentMonth.salaire <= 0 ? (
            <View style={styles.salaryCard}>
              <Text style={styles.stepBadge}>Etape 1</Text>
              <Text style={styles.sectionTitle}>Definir le budget du mois</Text>
              <Text style={styles.sectionSubtitle}>
                Saisis ton salaire puis valide. Le formulaire pour enregistrer une depense apparaitra juste apres.
              </Text>

              <TextInput
                keyboardType="numeric"
                onChangeText={setSalaryInput}
                onSubmitEditing={() => {
                  void handleCreateCurrentMonth();
                }}
                placeholder="Ex: 250000"
                placeholderTextColor={COLORS.muted}
                returnKeyType="done"
                style={styles.salaryInput}
                value={salaryInput}
              />

              <AllocationPreview items={salaryPreview} />

              <Pressable
                disabled={isCreatingMonth}
                onPress={() => {
                  void handleCreateCurrentMonth();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && !isCreatingMonth ? styles.primaryButtonPressed : null,
                  isCreatingMonth ? styles.primaryButtonDisabled : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isCreatingMonth ? "Validation..." : "Valider le salaire"}
                </Text>
              </Pressable>

              <Text style={styles.helperText}>Ensuite tu pourras enregistrer tes depenses ici.</Text>
            </View>
          ) : (
            <>
              <View style={styles.sectionCard}>
                <Text style={styles.stepBadge}>Etape 2</Text>
                <Text style={styles.sectionTitle}>Enregistrer une depense</Text>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  autoFocus
                  onChangeText={setDescription}
                  onSubmitEditing={() => amountInputRef.current?.focus()}
                  placeholder="Quoi ? (ex: arachide, taxi, loyer...)"
                  placeholderTextColor={COLORS.muted}
                  ref={descriptionInputRef}
                  returnKeyType="next"
                  style={styles.descriptionInput}
                  value={description}
                />

                {recentDescriptions.length > 0 ? (
                  <View style={styles.chipsWrap}>
                    {recentDescriptions.map((item) => (
                      <Pressable
                        key={item}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setDescription(item);
                        }}
                        style={({ pressed }) => [
                          styles.quickChip,
                          pressed ? styles.quickChipPressed : null,
                        ]}
                      >
                        <Text numberOfLines={1} style={styles.quickChipText}>
                          {item}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.fieldLabel}>Montant</Text>

                <View style={styles.amountWrap}>
                  <Text style={styles.amountPreview}>{formatMontant(parsedAmount || 0)}</Text>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={(value) => setAmountInput(value.replace(/[^\d]/g, ""))}
                    placeholder="Entre le montant"
                    placeholderTextColor={COLORS.muted}
                    ref={amountInputRef}
                    returnKeyType="done"
                    style={styles.amountField}
                    value={amountInput}
                  />
                </View>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Categorie</Text>

                <ScrollView
                  contentContainerStyle={styles.categoryScrollContent}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {expenseCategories.map((category) => {
                    const isSelected = selectedCategory === category.label;

                    return (
                      <Pressable
                        key={category.label}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setSelectedCategory(category.label);
                        }}
                        style={[
                          styles.categoryChip,
                          isSelected ? styles.categoryChipSelected : styles.categoryChipUnselected,
                        ]}
                      >
                        <Text style={isSelected ? styles.categoryChipTextSelected : styles.categoryChipText}>
                          {category.icon} {category.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Enveloppe</Text>

                <View style={styles.envelopeGrid}>
                  {enveloppes.map((enveloppe) => {
                    const config = ENVELOPE_CONFIG[enveloppe.type];
                    const isSelected = selectedEnveloppe === enveloppe.type;

                    return (
                      <Pressable
                        key={enveloppe.id}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setSelectedEnveloppe(enveloppe.type);
                        }}
                        style={[
                          styles.envelopeButton,
                          isCompact ? styles.envelopeButtonCompact : null,
                          isSelected ? styles.envelopeButtonSelected : null,
                        ]}
                      >
                        <View style={styles.envelopeButtonHeader}>
                          <Ionicons
                            color={isSelected ? COLORS.card : config.color}
                            name={config.icon}
                            size={18}
                          />
                          <Text
                            style={[
                              styles.envelopeButtonTitle,
                              isSelected ? styles.envelopeButtonTitleSelected : null,
                            ]}
                          >
                            {config.label}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.envelopeButtonAmount,
                            isSelected ? styles.envelopeButtonAmountSelected : null,
                          ]}
                        >
                          {formatMontant(enveloppe.montant_restant)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

            </>
          )}
        </ScrollView>

        {currentMonth && currentMonth.salaire > 0 ? (
          <View style={[styles.stickyActionWrap, { bottom: tabBarHeight }]}>
            <Text style={[styles.saveHint, canSave ? styles.saveHintReady : null]}>{saveHint}</Text>

            <Animated.View style={{ transform: [{ scale: saveButtonScale }] }}>
              <Pressable
                disabled={!canSave}
                onPress={() => {
                  void handleSave();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.saveButton,
                  pressed && canSave ? styles.primaryButtonPressed : null,
                  !canSave ? styles.primaryButtonDisabled : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isSaving ? "Enregistrement..." : "Enregistrer"}
                </Text>
              </Pressable>
            </Animated.View>
          </View>
        ) : null}

        {showSuccess ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.successOverlay,
              {
                opacity: successOpacity,
                transform: [{ scale: successScale }],
              },
            ]}
          >
            <View style={styles.successBubble}>
              <Ionicons color={COLORS.success} name="checkmark-circle" size={72} />
            </View>
          </Animated.View>
        ) : null}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  amountField: {
    backgroundColor: COLORS.softPrimary,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "700",
    marginTop: 14,
    minHeight: 56,
    paddingHorizontal: 16,
    textAlign: "center",
  },
  amountPreview: {
    color: COLORS.text,
    fontSize: 38,
    fontWeight: "700",
    textAlign: "center",
  },
  amountWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  categoryChip: {
    borderRadius: radius.round,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryChipSelected: {
    backgroundColor: COLORS.primary,
  },
  categoryChipText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  categoryChipTextSelected: {
    color: COLORS.card,
    fontSize: 14,
    fontWeight: "700",
  },
  categoryChipUnselected: {
    backgroundColor: palette.mutedSoft,
  },
  categoryScrollContent: {
    gap: 10,
    paddingRight: 20,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  contentContainer: {
    padding: 20,
  },
  descriptionInput: {
    borderBottomColor: palette.borderStrong,
    borderBottomWidth: 1,
    color: COLORS.text,
    fontSize: 18,
    minHeight: 56,
    paddingBottom: 12,
    paddingTop: 4,
  },
  envelopeButton: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 108,
    padding: 14,
    width: "48%",
  },
  envelopeButtonCompact: {
    width: "100%",
  },
  envelopeButtonAmount: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 18,
  },
  envelopeButtonAmountSelected: {
    color: COLORS.card,
  },
  envelopeButtonHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  envelopeButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  envelopeButtonTitle: {
    color: COLORS.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  envelopeButtonTitleSelected: {
    color: COLORS.card,
  },
  envelopeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  fieldLabel: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  gradient: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  loadingContainer: {
    display: "none",
  },
  pageTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
    marginBottom: 18,
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 20,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: COLORS.card,
    fontSize: 16,
    fontWeight: "700",
  },
  quickChip: {
    backgroundColor: COLORS.softPrimary,
    borderRadius: radius.round,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  quickChipPressed: {
    opacity: 0.8,
  },
  quickChipText: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: "600",
  },
  salaryCard: {
    backgroundColor: COLORS.card,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 20,
    ...shadows.card,
  },
  salaryInput: {
    backgroundColor: COLORS.softPrimary,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
    minHeight: 58,
    paddingHorizontal: 16,
  },
  saveButton: {
    backgroundColor: COLORS.success,
    borderColor: palette.success,
    borderWidth: 1,
    marginTop: 6,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  saveHint: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
    textAlign: "center",
  },
  saveHintReady: {
    color: COLORS.success,
    fontWeight: "600",
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
    ...shadows.card,
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
    marginBottom: 10,
  },
  stepBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.softPrimary,
    borderRadius: radius.round,
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  successBubble: {
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 999,
    justifyContent: "center",
    padding: 20,
    shadowColor: COLORS.success,
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 8,
  },
  successOverlay: {
    alignItems: "center",
    bottom: 140,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
  },
  stickyActionWrap: {
    backgroundColor: "rgba(246, 247, 251, 0.98)",
    borderTopColor: palette.border,
    borderTopWidth: 1,
    left: 0,
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    position: "absolute",
    right: 0,
  },
});
