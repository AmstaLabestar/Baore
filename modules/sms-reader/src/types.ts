/** Message brut remonte par le natif. `receivedAt` est un epoch en millisecondes. */
export interface SmsMessage {
  body: string;
  receivedAt: number;
  sender: string;
}

export interface SmsPermissionStatus {
  /** Lecture de l'historique de la boite de reception. */
  canRead: boolean;
  /** Reception des SMS pendant que l'application est ouverte. */
  canReceive: boolean;
}

export interface ReadInboxOptions {
  /** Nombre maximum de messages remontes en une passe. */
  limit?: number;
  /** Expediteurs autorises. Une liste vide ne lit rien. */
  senders: string[];
  /** Epoch en millisecondes : ne relit que ce qui est plus recent. */
  since?: number;
}

export type SmsReaderEvents = {
  onMessageReceived: (message: SmsMessage) => void;
};
