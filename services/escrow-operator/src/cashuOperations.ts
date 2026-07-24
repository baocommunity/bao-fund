import { CashuMint, CashuWallet, type Proof } from '@cashu/cashu-ts';

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
