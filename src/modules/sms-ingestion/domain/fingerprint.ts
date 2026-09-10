/**
 * Empreinte d'un message capte.
 *
 * Le rattrapage de la boite de reception relit forcement des messages deja
 * ingeres : l'empreinte permet de les reconnaitre sans stocker le corps entier
 * dans un index unique.
 */

/** FNV-1a 32 bits : suffisant pour distinguer des SMS, et sans dependance. */
function hash32(input: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

/**
 * L'horodatage de reception fait partie de l'empreinte : deux messages
 * identiques recus a des moments differents sont deux vraies operations
 * (recharger deux fois 250 F le meme jour, par exemple).
 */
export function empreinteMessage(sender: string, body: string, receivedAt?: Date): string {
  const horodatage = receivedAt ? receivedAt.toISOString() : "";

  return `${sender}|${horodatage}|${body.length}|${hash32(body)}`;
}
