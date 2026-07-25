import { AtSign, Copy, ExternalLink, MessageSquareText, PawPrint } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { usePetBodyCompanion } from "@/hooks/usePetBodyCompanion";
import { toast } from "@/hooks/useToast";
import { writeClipboardText } from "@/lib/clipboard";
import type { PetBodyInfo } from "@/lib/petBodies";
import { getProfileUrl } from "@/lib/profileUrl";
import { tryNpubEncode } from "@/lib/safeNip19";
import type { PetsCompanion, PetsStats } from "@/pets/core/lib/pets";
import { PetsStageVisual } from "@/pets/ui/PetsStageVisual";

interface PetProfileDialogProps {
  /** The agent's pet body (from `useAgentBodyPets`). Dialog renders nothing without it. */
  petBody: PetBodyInfo | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Insert a `nostr:npub…` mention of the pet's agent into the active composer. */
  onMention?: (agentPubkey: string) => void;
  /** Start a direct message with the pet's agent. */
  onMessage?: (agentPubkey: string) => void;
}

const STAT_LABELS: Array<{ key: keyof PetsStats; label: string }> = [
  { key: "hunger", label: "Hunger" },
  { key: "happiness", label: "Happiness" },
  { key: "health", label: "Health" },
  { key: "hygiene", label: "Hygiene" },
  { key: "energy", label: "Energy" },
];

function shortNpub(pubkey: string): string {
  const npub = tryNpubEncode(pubkey);
  return npub ? `${npub.slice(0, 12)}…${npub.slice(-4)}` : `${pubkey.slice(0, 8)}…`;
}

function breedLabel(companion: PetsCompanion): string | undefined {
  const category = companion.breedCategory;
  if (!category) return undefined;
  if (category === "buzz") return "Buzz";
  if (category === "bao") return "₿AO";
  return category;
}

/**
 * Read-only profile for an agent's pet body: the pet's animated body front
 * and center, its stage/state/vibe, the owner's profile link, and the chat
 * interactions that make sense for an agent (mention, message, copy npub).
 * The agent's own npub profile is always one click away ("View agent profile").
 */
export function PetProfileDialog({ petBody, open, onOpenChange, onMention, onMessage }: PetProfileDialogProps) {
  const { data: companion, isLoading } = usePetBodyCompanion(petBody, open);

  if (!petBody) return null;

  const agentNpub = tryNpubEncode(petBody.agentPubkey);

  const copyNpub = () => {
    if (!agentNpub) return;
    writeClipboardText(agentNpub).then(
      () => toast({ title: "Copied npub" }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden" aria-label={`${petBody.name} — pet profile`}>
        <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <PawPrint className="size-5 text-primary" aria-hidden />
            {petBody.name}
          </DialogTitle>

          {/* The body itself — how this agent presents itself in the chat. */}
          <div className="flex items-center justify-center min-h-40">
            {companion ? (
              <PetsStageVisual companion={companion} size="lg" animated />
            ) : isLoading ? (
              <div className="size-40 rounded-full bg-primary/10 flex items-center justify-center">
                <PawPrint className="size-10 text-primary/50 animate-pulse" aria-label="Loading pet body" />
              </div>
            ) : (
              <div className="size-40 rounded-full bg-primary/10 flex items-center justify-center">
                {petBody.picture ? (
                  <img src={petBody.picture} alt={petBody.name} className="size-32 rounded-full object-cover" />
                ) : (
                  <PawPrint className="size-10 text-primary/50" aria-label="Pet body unavailable" />
                )}
              </div>
            )}
          </div>

          {/* Stage / state / breed chips. */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {companion && (
              <>
                <Badge variant="secondary" className="capitalize">{companion.stage}</Badge>
                <Badge variant="outline" className="capitalize">{companion.state}</Badge>
              </>
            )}
            {companion && breedLabel(companion) && (
              <Badge variant="outline">{breedLabel(companion)}</Badge>
            )}
          </div>

          {/* Vibe check: compact read-only stats. */}
          {companion && companion.stage !== "egg" && (
            <div className="w-full space-y-1.5" aria-label="Pet stats">
              {STAT_LABELS.map(({ key, label }) => {
                const value = companion.stats[key];
                if (value === undefined) return null;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
                    <Progress value={value} className="h-1.5 flex-1" />
                    <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {Math.round(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Owner credit. */}
          <p className="text-xs text-muted-foreground">
            Pet body of{" "}
            <Link
              to={getProfileUrl(petBody.agentPubkey)}
              className="text-primary hover:underline"
              onClick={() => onOpenChange(false)}
            >
              {shortNpub(petBody.agentPubkey)}
            </Link>
            {petBody.ownerPubkey !== petBody.agentPubkey && (
              <>
                {" · "}cared for by{" "}
                <Link
                  to={getProfileUrl(petBody.ownerPubkey)}
                  className="text-primary hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  {shortNpub(petBody.ownerPubkey)}
                </Link>
              </>
            )}
          </p>
        </div>

        {/* Chat-appropriate interactions. */}
        <div className="grid grid-cols-2 gap-2 border-t border-border px-4 py-3">
          {onMention && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={() => {
                onMention(petBody.agentPubkey);
                onOpenChange(false);
              }}
            >
              <AtSign className="size-4" aria-hidden />
              Mention
            </Button>
          )}
          {onMessage && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={() => {
                onMessage(petBody.agentPubkey);
                onOpenChange(false);
              }}
            >
              <MessageSquareText className="size-4" aria-hidden />
              Message
            </Button>
          )}
          <Button variant="secondary" size="sm" className="gap-2" onClick={copyNpub}>
            <Copy className="size-4" aria-hidden />
            Copy npub
          </Button>
          <Button variant="secondary" size="sm" className="gap-2" asChild>
            <Link to={getProfileUrl(petBody.agentPubkey)} onClick={() => onOpenChange(false)}>
              <ExternalLink className="size-4" aria-hidden />
              Agent profile
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
