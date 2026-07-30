import { CashuMint, CashuWallet, type Proof } from '@cashu/cashu-ts';
import { signP2PKProofs } from '@cashu/cashu-ts/crypto/client/NUT11';

/**
 * Multisig co-sign: append the operator's witness signature to each proof.
 *
 * This is the NON-CUSTODIAL release path — the operator never receives or
 * re-mints anything. The returned proofs carry one of the two required
 * signatures; the winner adds the second with their own key at receive time.
 * signP2PKProofs refuses to sign locks the key is not part of, so a
 * misconfigured operator key fails loudly here rather than releasing an
 * unspendable token.
 */
export function cosignMultisigProofs(proofs: Proof[], privkey: string): Proof[] {
  return signP2PKProofs(proofs, privkey, true);
}

export async function receiveTokenEntry(
  mintUrl: string,
  entryToken: string,
  privkey: string,
): Promise<Proof[]> {
  const mint = new CashuMint(mintUrl);
  const wallet = new CashuWallet(mint, { unit: 'sat' });
  await wallet.loadMint();
  return wallet.receive(entryToken, { privkey, requireDleq: true });
}

export async function sendLockedToken(
  mintUrl: string,
  amount: number,
  proofs: Proof[],
  recipientPubkey: string,
): Promise<{ send: Proof[]; keep: Proof[] }> {
  const mint = new CashuMint(mintUrl);
  const wallet = new CashuWallet(mint, { unit: 'sat' });
  await wallet.loadMint();

  const result = await wallet.send(amount, proofs, {
    pubkey: recipientPubkey,
    includeDleq: true,
  });

  if (!result || !Array.isArray(result.send) || !Array.isArray(result.keep)) {
    throw new Error('Mint returned invalid send response');
  }

  return result;
}
