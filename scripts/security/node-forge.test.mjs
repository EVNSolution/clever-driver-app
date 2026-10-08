// Public regression fixture from digitalbazaar/forge PR1152, commit
// ceba34402e329f0365134f23fe19898756527d65, tests/unit/rsa.js.
// Copyright Digital Bazaar, Inc. BSD-3-Clause option; see patches/node-forge-LICENSE.
// All private keys below are generated in memory for this test run only.
import assert from 'node:assert/strict';
import { constants, createPublicKey, privateEncrypt, verify, X509Certificate } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const forge = require('node-forge');
const expo = require('@expo/code-signing-certificates');
const expoRequire = createRequire(require.resolve('@expo/code-signing-certificates'));
const { asn1, pki, md, util } = forge;
const keyPair = expo.generateKeyPair();
const childKeyPair = expo.generateKeyPair();
const keyPairPEM = expo.convertKeyPairToPEM(keyPair);
const now = Date.now();
const certificate = expo.generateSelfSignedCodeSigningCertificate({
  keyPair,
  validityNotBefore: new Date(now - 60_000),
  validityNotAfter: new Date(now + 3_600_000),
  commonName: 'Issue62 ephemeral compatibility control',
});
const certificatePEM = expo.convertCertificateToCertificatePEM(certificate);
const parsedCertificate = expo.convertCertificatePEMToCertificate(certificatePEM);

function sha256(message) {
  return md.sha256.create().update(message).digest().getBytes();
}

function signDigestInfo(children) {
  const sequence = value => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, value);
  const digestInfo = sequence([
    sequence(children),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, sha256('DigestInfo control')),
  ]);
  const der = Buffer.from(asn1.toDer(digestInfo).getBytes(), 'binary');
  const modulusBytes = Math.ceil(keyPair.publicKey.n.bitLength() / 8);
  const encoded = Buffer.concat([
    Buffer.from([0, 1]), Buffer.alloc(modulusBytes - der.length - 3, 0xff), Buffer.from([0]), der,
  ]);
  return privateEncrypt({ key: keyPairPEM.privateKeyPEM, padding: constants.RSA_NO_PADDING }, encoded).toString('binary');
}

function algorithmOid() {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes());
}

function nullParameter() {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, '');
}

test('Expo uses the same installed Node Forge module', () => {
  assert.equal(require.resolve('node-forge'), expoRequire.resolve('node-forge'));
  assert.match(require.resolve('node-forge'), /[/\\]node-forge[/\\]lib[/\\]index\.js$/);
  assert.equal(require('node-forge/package.json').version, '1.4.0');
});

test('rejects the public CVE-2026-85393 RSA forgery', () => {
  const modulus = new forge.jsbn.BigInteger('E932AC92252F585B3A80A4DD76A897C8B7652952FE788F6EC8DD640587A1EE5647670A8AD4C2BE0F9FA6E49C605ADF77B5174230AF7BD50E5D6D6D6D28CCF0A886A514CC72E51D209CC772A52EF419F6A953F3135929588EBE9B351FCA61CED78F346FE00DBB6306E5C2A4C6DFC3779AF85AB417371CF34D8387B9B30AE46D7A5FF5A655B8D8455F1B94AE736989D60A6F2FD5CADBFFBD504C5A756A2E6BB5CECC13BCA7503F6DF8B52ACE5C410997E98809DB4DC30D943DE4E812A47553DCE54844A78E36401D13F77DC650619FED88D8B3926E3D8E319C80C744779AC5D6ABE252896950917476ECE5E8FC27D5F053D6018D91B502C4787558A002B9283DA7', 16);
  const publicKey = pki.rsa.setPublicKey(modulus, new forge.jsbn.BigInteger('3'));
  const signature = Buffer.from('a4ae63dd5e7712b78f4870d0f51e294df5503d4f16c5d27ae33370981fb57f0de49f50f3d6a04666774cd984cd13972db9bf8e12bd294ef0ddc916c7c86cbae63efd7b6b97885e69760c208a40f1aecc76a90d7af5145177efce1bb55807a8d05c20b1596753ba710642fc9acdde6c160232654662c77cc4466c8257a38edb49f894e8845d0fd987b857ced88f4b62505a080bd87ef700d35d392a6e8f6fde34250c50b86fae606cb551215e8f4813239b77651d5565ad453698c071d48c31e8e526fb4a37610f64b3e1fb8e5be5898e408ad08197a0947794a530b54f84485377ce4a7488ed485ce4e5e105dd89698a472f390c3b1b76bc16b73276c4d1c81d', 'hex');
  assert.equal(verify('sha256', Buffer.from('hello world!'), pki.publicKeyToPem(publicKey), signature), false);
  assert.throws(
    () => publicKey.verify(sha256('hello world!'), signature.toString('binary')),
    /valid RSASSA-PKCS1-v1_5 DigestInfo/,
  );
});

test('accepts valid SHA256 DigestInfo with NULL or absent parameters', () => {
  for (const children of [[algorithmOid(), nullParameter()], [algorithmOid()]]) {
    assert.equal(keyPair.publicKey.verify(sha256('DigestInfo control'), signDigestInfo(children)), true);
  }
});

test('rejects unconsumed DigestAlgorithm children with or without NULL', () => {
  const garbage = () => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, 'extra');
  for (const children of [
    [algorithmOid(), nullParameter(), garbage()],
    [algorithmOid(), garbage()],
    [algorithmOid(), nullParameter(), nullParameter()],
  ]) {
    assert.throws(
      () => keyPair.publicKey.verify(sha256('DigestInfo control'), signDigestInfo(children)),
      /valid RSASSA-PKCS1-v1_5 DigestInfo/,
    );
  }
});

test('Expo certificate and key PEM roundtrip validates a throwaway self-signed certificate', () => {
  const parsedKeyPair = expo.convertKeyPairPEMToKeyPair(keyPairPEM);
  expo.validateSelfSignedCertificate(parsedCertificate, parsedKeyPair);
  assert.equal(parsedCertificate.verify(parsedCertificate), true);
  assert.equal(new X509Certificate(certificatePEM).verify(createPublicKey(keyPairPEM.publicKeyPEM)), true);
  assert.throws(() => expo.validateSelfSignedCertificate(parsedCertificate, childKeyPair), /key pair public key/);
});

test('Expo manifest signing works and tampering is rejected', () => {
  const payload = Buffer.from('{"test":"Issue62 synthetic manifest"}');
  const signature = Buffer.from(expo.signBufferRSASHA256AndVerify(keyPair.privateKey, parsedCertificate, payload), 'base64');
  assert.equal(verify('sha256', payload, keyPairPEM.publicKeyPEM, signature), true);
  assert.equal(verify('sha256', Buffer.from('tampered'), keyPairPEM.publicKeyPEM, signature), false);
  assert.equal(parsedCertificate.publicKey.verify(sha256(payload.toString('binary')), signature.toString('binary')), true);
  assert.equal(parsedCertificate.publicKey.verify(sha256('tampered'), signature.toString('binary')), false);
});

test('Expo CSR issuance preserves X509 signatures and Expo project metadata', () => {
  const csr = expo.convertCSRPEMToCSR(expo.convertCSRToCSRPEM(expo.generateCSR(childKeyPair, 'Issue62 ephemeral CSR')));
  assert.equal(csr.verify(), true);
  const issuer = pki.createCertificate();
  issuer.publicKey = keyPair.publicKey;
  issuer.serialNumber = '01';
  issuer.validity.notBefore = new Date(now - 60_000);
  issuer.validity.notAfter = new Date(now + 3_600_000);
  issuer.setSubject([{ name: 'commonName', value: 'Issue62 ephemeral issuer' }]);
  issuer.setIssuer(issuer.subject.attributes);
  issuer.setExtensions([{ name: 'basicConstraints', cA: true }, { name: 'keyUsage', keyCertSign: true }]);
  issuer.sign(keyPair.privateKey, md.sha256.create());
  const projectId = '00000000-0000-4000-8000-000000000000';
  const scopeKey = '@synthetic/issue62';
  const issued = expo.generateDevelopmentCertificateFromCSR(keyPair.privateKey, issuer, csr, projectId, scopeKey);
  const parsed = expo.convertCertificatePEMToCertificate(expo.convertCertificateToCertificatePEM(issued));
  assert.equal(issuer.verify(parsed), true);
  assert.equal(parsed.publicKey.n.toString(16), childKeyPair.publicKey.n.toString(16));
  assert.equal(parsed.getExtension({ id: expo.expoProjectInformationOID }).value, `${projectId},${scopeKey}`);
});

test('certificate ASN1 DER roundtrip rejects truncated input', () => {
  const encoded = asn1.toDer(pki.certificateToAsn1(parsedCertificate)).getBytes();
  const decoded = pki.certificateFromAsn1(asn1.fromDer(encoded));
  assert.equal(decoded.verify(decoded), true);
  assert.equal(asn1.toDer(pki.certificateToAsn1(decoded)).getBytes(), encoded);
  assert.throws(() => asn1.fromDer(encoded.slice(0, -1)), /Too few bytes/);
});

test('encrypted PKCS12 roundtrip preserves certificate and key and rejects a wrong password', () => {
  const password = 'synthetic-ephemeral-pkcs12';
  const encoded = asn1.toDer(forge.pkcs12.toPkcs12Asn1(keyPair.privateKey, [parsedCertificate], password, {
    algorithm: 'aes256', count: 2048, generateLocalKeyId: true,
  })).getBytes();
  const store = forge.pkcs12.pkcs12FromAsn1(asn1.fromDer(encoded), false, password);
  const keyBags = store.getBags({ bagType: pki.oids.pkcs8ShroudedKeyBag })[pki.oids.pkcs8ShroudedKeyBag];
  const certBags = store.getBags({ bagType: pki.oids.certBag })[pki.oids.certBag];
  assert.equal(keyBags.length, 1);
  assert.equal(certBags.length, 1);
  assert.equal(keyBags[0].key.n.toString(16), keyPair.privateKey.n.toString(16));
  assert.equal(certBags[0].cert.verify(parsedCertificate), true);
  assert.throws(() => forge.pkcs12.pkcs12FromAsn1(asn1.fromDer(encoded), false, 'wrong-test-password'), /MAC could not be verified/);
});
