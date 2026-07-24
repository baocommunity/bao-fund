import { z } from 'zod';

const hexPubkey = z
  .string()
  .regex(
    /^[0-9a-fA-F]{64}([0-9a-fA-F]{2})?$/,
    'Expected a 64 or 66 character hex secp256k1 pubkey',
  );

const finishedEventSchema = z.object({
  id: z.string().min(1),
  pubkey: z.string().min(1),
  kind: z.number().int(),
  created_at: z.number().int(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string().min(1),
});

export const releaseBodySchema = z.object({
  battleId: z.string().min(1),
  winnerPubkey: hexPubkey,
  hostEscrowPubkey: hexPubkey,
  guestEscrowPubkey: hexPubkey,
  hostDepositToken: z.string().min(1),
  guestDepositToken: z.string().min(1),
  finishedEvent: finishedEventSchema,
});

export type ReleaseBody = z.infer<typeof releaseBodySchema>;
