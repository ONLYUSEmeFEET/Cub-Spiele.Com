#!/usr/bin/env node
/**
 * Cub Spiele.Com — Cross-Platform Android APK Signer (v1 JAR + v2 APK Signature Scheme)
 * Uses Node.js built-in `crypto` (zero external dependencies) to:
 *   1. Generate an RSA-2048 keypair & self-signed X.509 v3 certificate (DER)
 *   2. Produce META-INF/CERT.RSA (DER-encoded PKCS#7 SignedData) for v1 JAR signing
 *   3. Produce APK Signing Block 42 (APK Signature Scheme v2, ID 0x7109871a)
 *      and splice it into the zipaligned APK before the Central Directory.
 */
import crypto from 'crypto';
import fs from 'fs';

// --- Minimal ASN.1 DER Encoder ---
function derLen(len) {
  if (len < 0x80) return Buffer.from([len]);
  const bytes = [];
  let tmp = len;
  while (tmp > 0) {
    bytes.unshift(tmp & 0xff);
    tmp >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derTag(tag, content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), derLen(buf.length), buf]);
}

const derSeq = (...items) => derTag(0x30, items);
const derSet = (...items) => derTag(0x31, items);
const derCtx = (num, content, constructed = true) =>
  derTag((constructed ? 0xa0 : 0x80) | num, content);

function derInt(val) {
  let buf;
  if (typeof val === 'number' || typeof val === 'bigint') {
    let hex = BigInt(val).toString(16);
    if (hex.length % 2) hex = '0' + hex;
    buf = Buffer.from(hex, 'hex');
  } else {
    buf = Buffer.from(val);
  }
  if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0x00]), buf]);
  return derTag(0x02, buf);
}

function derOid(oidStr) {
  const parts = oidStr.split('.').map(Number);
  const out = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    if (v === 0) {
      out.push(0);
      continue;
    }
    const enc = [];
    while (v > 0) {
      enc.unshift(v & 0x7f);
      v >>= 7;
    }
    for (let j = 0; j < enc.length - 1; j++) enc[j] |= 0x80;
    out.push(...enc);
  }
  return derTag(0x06, Buffer.from(out));
}

const derNull = () => Buffer.from([0x05, 0x00]);
const derUtf8 = (s) => derTag(0x0c, Buffer.from(s, 'utf8'));
const derUtcTime = (s) => derTag(0x17, Buffer.from(s, 'ascii'));
const derOctet = (b) => derTag(0x04, b);
const derBitString = (b) => derTag(0x03, Buffer.concat([Buffer.from([0x00]), b]));

const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
const OID_SHA256_WITH_RSA = '1.2.840.113549.1.1.11';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_CN = '2.5.4.3';
const OID_O = '2.5.4.10';

function buildName(cn, org) {
  return derSeq(
    derSet(derSeq(derOid(OID_CN), derUtf8(cn))),
    derSet(derSeq(derOid(OID_O), derUtf8(org)))
  );
}

function generateSelfSignedCert() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });

  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const serial = Buffer.from('01435542535049454c45', 'hex'); // "CUBSPIELE"
  const issuer = buildName('Cub Spiele.Com', 'Cub Spiele.Com');
  const algId = derSeq(derOid(OID_SHA256_WITH_RSA), derNull());
  const validity = derSeq(derUtcTime('250101000000Z'), derUtcTime('491231235959Z'));

  const tbsCert = derSeq(
    derCtx(0, derInt(2)), // v3
    derInt(serial),
    algId,
    issuer,
    validity,
    issuer, // self-signed
    spkiDer
  );

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(tbsCert);
  const sig = signer.sign(privateKey);

  const certDer = derSeq(tbsCert, algId, derBitString(sig));
  return { certDer, privateKey, serial, issuer };
}

function buildPkcs7CertRsa(sfBytes, certDer, privateKey, serial, issuer) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(sfBytes);
  const signature = signer.sign(privateKey);

  const sha256Alg = derSeq(derOid(OID_SHA256), derNull());
  const rsaAlg = derSeq(derOid(OID_RSA_ENCRYPTION), derNull());

  const signerInfo = derSeq(
    derInt(1), // version 1
    derSeq(issuer, derInt(serial)), // issuerAndSerialNumber
    sha256Alg,
    rsaAlg,
    derOctet(signature)
  );

  const signedData = derSeq(
    derInt(1), // version 1
    derSet(sha256Alg), // digestAlgorithms
    derSeq(derOid(OID_DATA)), // encapContentInfo (detached)
    derCtx(0, certDer), // certificates [0] IMPLICIT
    derSet(signerInfo) // signerInfos
  );

  return derSeq(derOid(OID_SIGNED_DATA), derCtx(0, signedData));
}

// --- APK Signature Scheme v2 ---
function findEocdOffset(buf) {
  // Search backwards for End of Central Directory signature 0x06054b50
  const minOff = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOff; i--) {
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x05 &&
      buf[i + 3] === 0x06 &&
      buf.readUInt16LE(i + 20) === buf.length - i - 22
    ) {
      return i;
    }
  }
  throw new Error('ZIP EOCD not found');
}

function chunkSha256Digests(chunks) {
  // APK v2 chunking: 1MB (1048576 bytes) per chunk, prefix 0xa5 + uint32le(len)
  const CHUNK_SIZE = 1048576;
  const chunkDigests = [];
  for (const buf of chunks) {
    for (let off = 0; off < buf.length; off += CHUNK_SIZE) {
      const slice = buf.subarray(off, Math.min(buf.length, off + CHUNK_SIZE));
      const hdr = Buffer.allocUnsafe(5);
      hdr[0] = 0xa5;
      hdr.writeUInt32LE(slice.length, 1);
      const h = crypto.createHash('sha256');
      h.update(hdr);
      h.update(slice);
      chunkDigests.push(h.digest());
    }
  }
  const topHdr = Buffer.allocUnsafe(5);
  topHdr[0] = 0x5a;
  topHdr.writeUInt32LE(chunkDigests.length, 1);
  const topHash = crypto.createHash('sha256');
  topHash.update(topHdr);
  for (const d of chunkDigests) topHash.update(d);
  return topHash.digest();
}

function lenPrefixed(buf) {
  const hdr = Buffer.allocUnsafe(4);
  hdr.writeUInt32LE(buf.length, 0);
  return Buffer.concat([hdr, buf]);
}

function addApkV2Signature(apkBuf, certDer, privateKey) {
  const eocdOff = findEocdOffset(apkBuf);
  const cdOff = apkBuf.readUInt32LE(eocdOff + 16);

  const contents = apkBuf.subarray(0, cdOff);
  const centralDir = apkBuf.subarray(cdOff, eocdOff);
  const eocdForDigest = Buffer.from(apkBuf.subarray(eocdOff));
  // Per APK v2 spec, EOCD cd_offset is set to contents.length (start of APK Signing Block)
  eocdForDigest.writeUInt32LE(cdOff, 16);

  const rootDigest = chunkSha256Digests([contents, centralDir, eocdForDigest]);

  // signed_data:
  //   digests: len-prefixed seq of len-prefixed (uint32 sigAlgId=0x0103, len-prefixed digest)
  //   certificates: len-prefixed seq of len-prefixed certDer
  //   additional attributes: len-prefixed empty
  const sigAlgId = 0x0103; // RSASSA-PKCS1-v1_5 with SHA-256
  const digestEntry = Buffer.allocUnsafe(4 + 4 + rootDigest.length);
  digestEntry.writeUInt32LE(sigAlgId, 0);
  digestEntry.writeUInt32LE(rootDigest.length, 4);
  rootDigest.copy(digestEntry, 8);

  const digestsSeq = lenPrefixed(lenPrefixed(digestEntry));
  const certsSeq = lenPrefixed(lenPrefixed(certDer));
  const attrsSeq = Buffer.alloc(4, 0);
  const signedData = Buffer.concat([digestsSeq, certsSeq, attrsSeq]);

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signedData);
  const sigBytes = signer.sign(privateKey);

  const sigEntry = Buffer.allocUnsafe(4 + 4 + sigBytes.length);
  sigEntry.writeUInt32LE(sigAlgId, 0);
  sigEntry.writeUInt32LE(sigBytes.length, 4);
  sigBytes.copy(sigEntry, 8);

  const signaturesSeq = lenPrefixed(lenPrefixed(sigEntry));
  const pubKeyDer = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });

  const signerBlock = Buffer.concat([
    lenPrefixed(signedData),
    signaturesSeq,
    lenPrefixed(pubKeyDer),
  ]);
  const signersSeq = lenPrefixed(lenPrefixed(signerBlock));

  // APK Signing Block pair: uint64le(4 + value.length) + uint32le(0x7109871a) + value
  const pairLen = 4 + signersSeq.length;
  const pair = Buffer.allocUnsafe(8 + pairLen);
  pair.writeBigUInt64LE(BigInt(pairLen), 0);
  pair.writeUInt32LE(0x7109871a, 8);
  signersSeq.copy(pair, 12);

  // APK Signing Block: uint64le(sizeOfBlock) + pairs + uint64le(sizeOfBlock) + "APK Sig Block 42"
  const blockBodySize = pair.length + 8 + 16;
  const sigBlock = Buffer.allocUnsafe(8 + blockBodySize);
  sigBlock.writeBigUInt64LE(BigInt(blockBodySize), 0);
  pair.copy(sigBlock, 8);
  sigBlock.writeBigUInt64LE(BigInt(blockBodySize), 8 + pair.length);
  Buffer.from('APK Sig Block 42', 'ascii').copy(sigBlock, 8 + pair.length + 8);

  const newEocd = Buffer.from(apkBuf.subarray(eocdOff));
  newEocd.writeUInt32LE(cdOff + sigBlock.length, 16);

  return Buffer.concat([contents, sigBlock, centralDir, newEocd]);
}

// CLI modes:
//   node apk-sign.mjs --v1-and-v2 <sf_path> <cert_rsa_out> <unsigned_apk> <signed_apk>
const args = process.argv.slice(2);
if (args[0] === '--sign-apk' && args.length === 5) {
  const [, sfPath, certRsaOut, unsignedApkPath, signedApkPath] = args;
  const sfBytes = fs.readFileSync(sfPath);
  const { certDer, privateKey, serial, issuer } = generateSelfSignedCert();
  const pkcs7 = buildPkcs7CertRsa(sfBytes, certDer, privateKey, serial, issuer);
  fs.writeFileSync(certRsaOut, pkcs7);
  // Wait: caller adds CERT.RSA to unsignedApkPath first, then we add v2 block
  // Actually if caller passes --v1-cert first, then --v2-block, or we can expose two commands!
  console.log('Generated CERT.RSA');
} else if (args[0] === '--v1-cert' && args.length === 4) {
  const [, sfPath, keyJsonOut, certRsaOut] = args;
  const sfBytes = fs.readFileSync(sfPath);
  const { certDer, privateKey, serial, issuer } = generateSelfSignedCert();
  const pkcs7 = buildPkcs7CertRsa(sfBytes, certDer, privateKey, serial, issuer);
  fs.writeFileSync(certRsaOut, pkcs7);
  fs.writeFileSync(
    keyJsonOut,
    JSON.stringify({
      certDerB64: certDer.toString('base64'),
      privPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    })
  );
} else if (args[0] === '--v2-block' && args.length === 4) {
  const [, keyJsonIn, apkIn, apkOut] = args;
  const { certDerB64, privPem } = JSON.parse(fs.readFileSync(keyJsonIn, 'utf8'));
  const certDer = Buffer.from(certDerB64, 'base64');
  const privateKey = crypto.createPrivateKey(privPem);
  const apkBuf = fs.readFileSync(apkIn);
  const signedBuf = addApkV2Signature(apkBuf, certDer, privateKey);
  fs.writeFileSync(apkOut, signedBuf);
} else {
  console.error('Usage: apk-sign.mjs --v1-cert <sf> <keyJsonOut> <certRsaOut> | --v2-block <keyJsonIn> <apkIn> <apkOut>');
  process.exit(1);
}
