import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import {
  getDepenses,
  getEnveloppesByMois,
  getMois,
  getParametres,
} from "@/database/queries";

interface ExportBackupResult {
  fileName: string;
  shared: boolean;
  uri: string;
}

interface ExportedMonthData {
  date_cloture: string | null;
  date_debut: string;
  depenses: Awaited<ReturnType<typeof getDepenses>>;
  enveloppes: Awaited<ReturnType<typeof getEnveloppesByMois>>;
  id: number;
  label: string;
  salaire: number;
  statut: "en_cours" | "cloture";
}

function buildBackupFileName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `budget-flow-backup-${year}${month}${day}-${hours}${minutes}${seconds}.json`;
}

/** Exporte toutes les donnees locales dans un fichier JSON puis ouvre le partage natif si disponible. */
export async function exportBudgetBackup(): Promise<ExportBackupResult> {
  if (!FileSystem.documentDirectory) {
    throw new Error("Le stockage local n'est pas disponible sur cet appareil.");
  }

  const exportedAt = new Date();
  const [mois, depenses, parametres] = await Promise.all([
    getMois(),
    getDepenses(),
    getParametres(),
  ]);

  const monthsWithDetails: ExportedMonthData[] = await Promise.all(
    mois.map(async (month) => ({
      ...month,
      depenses: depenses.filter((item) => item.mois_id === month.id),
      enveloppes: await getEnveloppesByMois(month.id),
    }))
  );

  const payload = {
    app: "Baore",
    exported_at: exportedAt.toISOString(),
    schema_version: 1,
    version: Constants.expoConfig?.version ?? "1.0.0",
    data: {
      depenses,
      mois: monthsWithDetails,
      parametres,
    },
  };

  const fileName = buildBackupFileName(exportedAt);
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();

  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      UTI: "public.json",
      dialogTitle: "Exporter la sauvegarde Baore",
      mimeType: "application/json",
    });
  }

  return {
    fileName,
    shared: canShare,
    uri: fileUri,
  };
}
