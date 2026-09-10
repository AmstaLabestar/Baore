import { NativeModule, requireNativeModule } from "expo";
import { Platform } from "react-native";

import type {
  ReadInboxOptions,
  SmsMessage,
  SmsPermissionStatus,
  SmsReaderEvents,
} from "./src/types";

export type { ReadInboxOptions, SmsMessage, SmsPermissionStatus } from "./src/types";

declare class SmsReaderNativeModule extends NativeModule<SmsReaderEvents> {
  getPermissionStatus(): SmsPermissionStatus;
  readInbox(options: ReadInboxOptions): Promise<SmsMessage[]>;
  requestPermissions(): Promise<{ granted: boolean; status: string }>;
  startListening(senders: string[]): void;
  stopListening(): void;
}

/**
 * iOS n'expose aucune API de lecture des SMS, et n'en exposera pas.
 * Le module est donc Android uniquement : sur les autres plateformes on renvoie
 * un objet inerte plutot que de laisser planter l'application.
 */
const REFUS: SmsPermissionStatus = { canRead: false, canReceive: false };

const natif =
  Platform.OS === "android" ? requireNativeModule<SmsReaderNativeModule>("SmsReader") : null;

export const estDisponible = natif !== null;

export function getPermissionStatus(): SmsPermissionStatus {
  return natif?.getPermissionStatus() ?? REFUS;
}

export async function requestPermissions(): Promise<boolean> {
  if (!natif) {
    return false;
  }

  const resultat = await natif.requestPermissions();

  return resultat.granted;
}

export async function readInbox(options: ReadInboxOptions): Promise<SmsMessage[]> {
  return natif ? natif.readInbox(options) : [];
}

export function startListening(
  senders: string[],
  onMessage: (message: SmsMessage) => void
): () => void {
  if (!natif) {
    return () => undefined;
  }

  const abonnement = natif.addListener("onMessageReceived", onMessage);
  natif.startListening(senders);

  return () => {
    natif.stopListening();
    abonnement.remove();
  };
}
