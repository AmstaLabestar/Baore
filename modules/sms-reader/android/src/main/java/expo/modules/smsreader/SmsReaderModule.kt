package expo.modules.smsreader

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Lecture des SMS d'operateurs mobile money.
 *
 * Deux usages complementaires :
 *  - `readInbox` rattrape l'historique deja present sur le telephone, ce qui
 *    permet d'afficher plusieurs mois de depenses des la premiere ouverture ;
 *  - l'ecoute des SMS entrants met a jour l'application pendant qu'elle est
 *    ouverte.
 *
 * Il n'y a volontairement aucun service en arriere-plan : les SMS restent dans
 * la boite de reception, un simple re-balayage a l'ouverture suffit a ne rien
 * perdre. Cela evite le service persistant et sa justification video exigee par
 * Google depuis Android 14.
 */

class ReadInboxOptions : Record {
  /** Expediteurs autorises. Vide = ne rien lire, jamais "tout lire". */
  @Field val senders: List<String> = emptyList()

  /** Horodatage epoch en millisecondes : ne relit que ce qui est plus recent. */
  @Field val since: Double? = null

  @Field val limit: Int = 1000
}

private const val MESSAGE_EVENT = "onMessageReceived"

/**
 * Normalise un identifiant d'expediteur.
 * "MooV Money", "Moov-Money" et "MOOVMONEY" designent le meme emetteur ;
 * la comparaison doit etre insensible a la casse et aux separateurs.
 */
private fun normalizeSender(raw: String?): String =
  raw?.uppercase()?.replace(Regex("[^A-Z0-9]"), "") ?: ""

class SmsReaderModule : Module() {
  private var receiver: BroadcastReceiver? = null
  private var allowedSenders: Set<String> = emptySet()

  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("Contexte Android indisponible")

  private fun hasPermission(permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    Events(MESSAGE_EVENT)

    Function("getPermissionStatus") {
      mapOf(
        "canRead" to hasPermission(Manifest.permission.READ_SMS),
        "canReceive" to hasPermission(Manifest.permission.RECEIVE_SMS)
      )
    }

    /**
     * Ouvre la boite de dialogue systeme Android. Sans accord explicite de
     * l'utilisateur, le module ne lit rien : c'est Android qui arbitre, pas
     * l'application, et l'autorisation reste revocable a tout moment.
     */
    AsyncFunction("requestPermissions") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        Manifest.permission.READ_SMS,
        Manifest.permission.RECEIVE_SMS
      )
    }

    AsyncFunction("readInbox") { options: ReadInboxOptions ->
      if (!hasPermission(Manifest.permission.READ_SMS)) {
        throw CodedException("PERMISSION_REFUSEE", "Lecture des SMS non autorisee", null)
      }

      readInbox(options)
    }

    /**
     * L'ecoute ne vit que le temps ou l'application est au premier plan.
     * Ce qui arrive pendant qu'elle est fermee est rattrape au prochain
     * `readInbox`, sans perte.
     */
    Function("startListening") { senders: List<String> ->
      allowedSenders = senders.map { normalizeSender(it) }.toSet()
      registerReceiver()
    }

    Function("stopListening") {
      unregisterReceiver()
    }

    OnDestroy {
      unregisterReceiver()
    }
  }

  private fun readInbox(options: ReadInboxOptions): List<Map<String, Any?>> {
    val autorises = options.senders.map { normalizeSender(it) }.toSet()

    if (autorises.isEmpty()) {
      return emptyList()
    }

    val projection = arrayOf(
      Telephony.Sms.ADDRESS,
      Telephony.Sms.BODY,
      Telephony.Sms.DATE
    )

    // Le filtrage par date se fait en SQL, celui par expediteur en Kotlin :
    // les identifiants alphanumeriques demandent une normalisation qu'une
    // clause SQL ne sait pas appliquer.
    val selection = options.since?.let { "${Telephony.Sms.DATE} > ?" }
    val selectionArgs = options.since?.let { arrayOf(it.toLong().toString()) }

    val messages = mutableListOf<Map<String, Any?>>()

    context.contentResolver.query(
      Telephony.Sms.Inbox.CONTENT_URI,
      projection,
      selection,
      selectionArgs,
      "${Telephony.Sms.DATE} DESC"
    )?.use { cursor ->
      val indexAdresse = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
      val indexCorps = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
      val indexDate = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)

      while (cursor.moveToNext() && messages.size < options.limit) {
        val adresse = cursor.getString(indexAdresse)

        if (normalizeSender(adresse) !in autorises) {
          continue
        }

        messages.add(
          mapOf(
            "sender" to (adresse ?: ""),
            "body" to (cursor.getString(indexCorps) ?: ""),
            "receivedAt" to cursor.getLong(indexDate).toDouble()
          )
        )
      }
    }

    return messages
  }

  private fun registerReceiver() {
    if (receiver != null || !hasPermission(Manifest.permission.RECEIVE_SMS)) {
      return
    }

    val nouveau = object : BroadcastReceiver() {
      override fun onReceive(receivedContext: Context?, intent: Intent?) {
        if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
          return
        }

        for (message in Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return) {
          val expediteur = message.displayOriginatingAddress

          // Un SMS hors de la liste declaree n'est jamais transmis a JavaScript.
          if (normalizeSender(expediteur) !in allowedSenders) {
            continue
          }

          sendEvent(
            MESSAGE_EVENT,
            mapOf(
              "sender" to (expediteur ?: ""),
              "body" to (message.displayMessageBody ?: ""),
              "receivedAt" to message.timestampMillis.toDouble()
            )
          )
        }
      }
    }

    ContextCompat.registerReceiver(
      context,
      nouveau,
      IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION),
      ContextCompat.RECEIVER_EXPORTED
    )
    receiver = nouveau
  }

  private fun unregisterReceiver() {
    receiver?.let {
      runCatching { context.unregisterReceiver(it) }
      receiver = null
    }
  }
}
