// ── Générateur ZIP sans dépendance (méthode "stored", non compressée) ──
// Suffisant pour une sauvegarde : les JPEG/MP4 sont déjà compressés.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// Construit un Buffer ZIP à partir d'une liste {name, data:Buffer}
function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data    = e.data;
    const crc     = crc32(data);
    const size    = data.length;

    // En-tête local (30 octets + nom)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // flag : nom en UTF-8
    local.writeUInt16LE(0, 8);            // méthode 0 = stored
    local.writeUInt16LE(0, 10);           // heure
    local.writeUInt16LE(0, 12);           // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);        // taille compressée
    local.writeUInt32LE(size, 22);        // taille non compressée
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra field length

    chunks.push(local, nameBuf, data);

    // Entrée du central directory (46 octets + nom)
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);              // version made by
    cd.writeUInt16LE(20, 6);             // version needed
    cd.writeUInt16LE(0x0800, 8);         // flag UTF-8
    cd.writeUInt16LE(0, 10);            // méthode
    cd.writeUInt16LE(0, 12);           // heure
    cd.writeUInt16LE(0, 14);          // date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);          // extra
    cd.writeUInt16LE(0, 32);         // comment
    cd.writeUInt16LE(0, 34);        // disk number
    cd.writeUInt16LE(0, 36);       // internal attrs
    cd.writeUInt32LE(0, 38);      // external attrs
    cd.writeUInt32LE(offset, 42); // offset de l'en-tête local
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                       // disk
  eocd.writeUInt16LE(0, 6);                      // disk with CD
  eocd.writeUInt16LE(entries.length, 8);         // entries on disk
  eocd.writeUInt16LE(entries.length, 10);        // total entries
  eocd.writeUInt32LE(centralBuf.length, 12);     // taille du central dir
  eocd.writeUInt32LE(offset, 16);                // offset du central dir
  eocd.writeUInt16LE(0, 20);                     // comment length

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

module.exports = { buildZip };
