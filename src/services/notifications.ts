import Constants from "expo-constants";
import { Platform } from "react-native";

const MONTHLY_REMINDER_ID = "budget-flow-monthly-reminder";
const INACTIVITY_REMINDER_ID = "budget-flow-inactivity-reminder";
const ALERT_CHANNEL_ID = "budget-flow-alerts";

type NotificationsModule = typeof import("expo-notifications");

/** Evite de charger expo-notifications dans Expo Go ou dans un environnement non compatible. */
async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (Constants.appOwnership === "expo") {
    return null;
  }

  return import("expo-notifications");
}

/** Configure le handler d'affichage local une seule fois, quand le module est disponible. */
async function ensureHandler(): Promise<NotificationsModule | null> {
  const Notifications = await getNotificationsModule();

  if (!Notifications) {
    return null;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  return Notifications;
}

/** Cree le canal Android utilise par les notifications locales de l'application. */
async function ensureNotificationChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#4f46e5",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    name: "Budget Flow Alerts",
    vibrationPattern: [0, 250, 250, 250],
  });
}

/** Verifie si l'application peut afficher des notifications locales et configure Android au besoin. */
async function ensureNotificationsEnabled(): Promise<NotificationsModule | null> {
  const Notifications = await ensureHandler();

  if (!Notifications) {
    return null;
  }

  const permissions = await Notifications.getPermissionsAsync();

  if (!permissions.granted) {
    return null;
  }

  await ensureNotificationChannel(Notifications);
  return Notifications;
}

/** Demande les permissions de notification a l'utilisateur. */
export async function requestPermissions(): Promise<boolean> {
  const Notifications = await ensureHandler();

  if (!Notifications) {
    return false;
  }

  const permissions = await Notifications.getPermissionsAsync();

  if (permissions.granted) {
    await ensureNotificationChannel(Notifications);
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();

  if (!requested.granted) {
    return false;
  }

  await ensureNotificationChannel(Notifications);
  return true;
}

/** Programme un rappel recurrent chaque premier jour du mois pour saisir le salaire. */
export async function scheduleMonthlyReminder(): Promise<string | null> {
  const Notifications = await ensureNotificationsEnabled();

  if (!Notifications) {
    return null;
  }

  await Notifications.cancelScheduledNotificationAsync(MONTHLY_REMINDER_ID).catch(() => undefined);

  return Notifications.scheduleNotificationAsync({
    content: {
      body: "Saisis ton salaire pour bien demarrer.",
      sound: true,
      title: "Nouveau mois !",
    },
    identifier: MONTHLY_REMINDER_ID,
    trigger: {
      channelId: ALERT_CHANNEL_ID,
      day: 1,
      hour: 8,
      minute: 0,
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
    },
  });
}

/** Envoie immediatement une notification quand une enveloppe devient critique apres une depense. */
export async function sendEnveloppeAlert(
  enveloppe: string,
  montantRestant: number,
  pourcentage: number
): Promise<string | null> {
  const Notifications = await ensureNotificationsEnabled();

  if (!Notifications) {
    return null;
  }

  const isEmpty = montantRestant <= 0;

  return Notifications.scheduleNotificationAsync({
    content: {
      body: isEmpty
        ? `${enveloppe} est epuisee. Pense a ralentir ou a reequilibrer ton budget.`
        : `${enveloppe} passe sous le seuil: ${Math.max(0, Math.round(pourcentage))}% restant, soit ${new Intl.NumberFormat(
            "fr-FR",
            { maximumFractionDigits: 0 }
          ).format(Math.round(montantRestant))} FCFA.`,
      sound: true,
      title: isEmpty ? "Enveloppe epuisee" : "Attention sur une enveloppe",
    },
    trigger: {
      channelId: ALERT_CHANNEL_ID,
    },
  });
}

/** Programme un rappel si aucune nouvelle depense n'est enregistree pendant 3 jours. */
export async function scheduleInactivityReminder(): Promise<string | null> {
  const Notifications = await ensureNotificationsEnabled();

  if (!Notifications) {
    return null;
  }

  await cancelInactivityReminder();

  return Notifications.scheduleNotificationAsync({
    content: {
      body: "N'oublie pas de noter tes depenses.",
      sound: true,
      title: "Budget Flow",
    },
    identifier: INACTIVITY_REMINDER_ID,
    trigger: {
      channelId: ALERT_CHANNEL_ID,
      repeats: false,
      seconds: 60 * 60 * 24 * 3,
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    },
  });
}

/** Annule le rappel d'inactivite actuellement programme s'il existe. */
export async function cancelInactivityReminder(): Promise<void> {
  const Notifications = await getNotificationsModule();

  if (!Notifications) {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(INACTIVITY_REMINDER_ID).catch(() => undefined);
}
