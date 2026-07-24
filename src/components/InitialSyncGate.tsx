import type { NostrMetadata } from "@nostrify/nostrify";

import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Heart,
  Loader2,
} from "lucide-react";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { saveNsec } from "@/lib/credentialManager";
import { openUrl } from "@/lib/downloadFile";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppLogo } from "@/components/AppLogo";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { IntroImage } from "@/components/IntroImage";
import { ProfileCard } from "@/components/ProfileCard";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/hooks/useAppContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEncryptedSettings, getLocalSettingsSync } from "@/hooks/useEncryptedSettings";
import { type SyncPhase, useInitialSync } from "@/hooks/useInitialSync";
import { useLoginActions } from "@/hooks/useLoginActions";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { usePublishPreferences } from "@/hooks/usePublishPreferences";
import { OnboardingContext } from "@/hooks/useOnboarding";

import { toast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";
import { isValidAvatarShape } from "@/lib/avatarShape";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// InitialSyncGate
// ---------------------------------------------------------------------------

interface InitialSyncGateProps {
  children: ReactNode;
}

/**
 * Gates the main app behind an initial sync / setup flow for logged-in users.
 * - Logged-out users pass straight through.
 * - Logged-in users see a sync spinner, then either proceed (settings found)
 *   or walk through a brief questionnaire (fresh account / new device with no settings).
 * - Also provides `useOnboarding().startSignup()` for triggering signup from anywhere.
 */
export function InitialSyncGate({ children }: InitialSyncGateProps) {
  const { user } = useCurrentUser();
  const { phase, markComplete } = useInitialSync();
  const { isLoading: settingsLoading } = useEncryptedSettings();
  const { config } = useAppContext();
  const [signupActive, setSignupActive] = useState(false);
  // Track whether we've shown the app at least once so we don't re-gate on
  // subsequent background refetches (e.g. window focus).
  const hasShownApp = useRef(false);

  const startSignup = useCallback(() => setSignupActive(true), []);

  const handleSignupComplete = useCallback(() => {
    setSignupActive(false);
    markComplete();
  }, [markComplete]);

  const contextValue = useMemo(() => ({ startSignup }), [startSignup]);

  // Signup flow takes priority (doesn't require a logged-in user yet)
  if (signupActive) {
    return (
      <OnboardingContext.Provider value={contextValue}>
        <SetupQuestionnaire
          onComplete={handleSignupComplete}
          isSignup
        />
      </OnboardingContext.Provider>
    );
  }

  // Don't show sync/onboarding when logged out — just show the app.
  // Reset hasShownApp so that re-login shows the spinner until settings load.
  if (!user) {
    hasShownApp.current = false;
    return (
      <OnboardingContext.Provider value={contextValue}>
        {children}
      </OnboardingContext.Provider>
    );
  }

  // Normal logged-in sync flow
  if (phase === "syncing" || phase === "found") {
    return (
      <OnboardingContext.Provider value={contextValue}>
        <SyncScreen phase={phase} onSkip={phase === "syncing" ? markComplete : undefined} />
      </OnboardingContext.Provider>
    );
  }

  if (phase === "not-found") {
    return (
      <OnboardingContext.Provider value={contextValue}>
        <SetupQuestionnaire onComplete={markComplete} />
      </OnboardingContext.Provider>
    );
  }

  // For returning users (phase === "complete"), decide whether to gate:
  // - If we have a local lastSync timestamp, localStorage is trustworthy and
  //   we can render immediately. NostrSync will hot-swap any differences in
  //   the background once the remote settings arrive.
  // - If there's NO local timestamp (e.g. localStorage was cleared, or settings
  //   were never synced on this browser), show the spinner until settings load
  //   so the user sees correct state from the start.
  // Only gate on the very first load — once the app has been shown, don't
  // re-gate on background refetches (e.g. window focus).
  if (phase === "complete" && settingsLoading && !hasShownApp.current) {
    const hasLocalSync = user ? getLocalSettingsSync(config.appId, user.pubkey) > 0 : false;
    if (!hasLocalSync) {
      return (
        <OnboardingContext.Provider value={contextValue}>
          <SyncScreen phase="syncing" />
        </OnboardingContext.Provider>
      );
    }
  }

  hasShownApp.current = true;

  // idle or complete -> show app
  return (
    <OnboardingContext.Provider value={contextValue}>
      {children}
    </OnboardingContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Sync Screen
// ---------------------------------------------------------------------------

function SyncScreen({ phase, onSkip }: { phase: SyncPhase; onSkip?: () => void }) {
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    if (phase !== "syncing") {
      setShowSkip(false);
      return;
    }
    const id = setTimeout(() => setShowSkip(true), 6000);
    return () => clearTimeout(id);
  }, [phase]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8 px-6 text-center max-w-sm">
        {/* Logo with gentle pulse */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-30" />
          <AppLogo size={72} className="relative" />
        </div>

        {/* Spinner */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-[2.5px] border-primary/20" />
            <div className="absolute inset-0 rounded-full border-[2.5px] border-transparent border-t-primary animate-spin" />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">
              {phase === "found"
                ? "Settings restored"
                : "Syncing your settings..."}
            </p>
            <p className="text-xs text-muted-foreground">
              {phase === "found"
                ? "Welcome back! Loading your experience..."
                : "Checking for your preferences across devices"}
            </p>
          </div>
        </div>

        {phase === "syncing" && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              ))}
            </div>
            {showSkip && onSkip && (
              <Button variant="outline" size="sm" className="rounded-none" onClick={onSkip}>
                Continue without syncing
              </Button>
            )}
          </div>
        )}

        {phase === "found" && (
          <div className="flex items-center gap-2 text-primary">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">All set</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup Questionnaire
// ---------------------------------------------------------------------------

// Steps for signup (includes keygen + profile) vs. settings-only (existing login)
type SignupStep = "keygen" | "download" | "profile";
type SettingsStep = "privacy" | "outro";
type Step = SignupStep | SettingsStep;

// NOTE (₿AO Fund strip): the "follows" step is gone — this app has no social
// feed, so follow-suggestion onboarding gated every route behind a dead
// feature. Signup still creates the key + profile, then privacy + outro.
const SIGNUP_STEPS: Step[] = [
  "keygen",
  "download",
  "profile",
  "privacy",
  "outro",
];
const SETTINGS_STEPS: Step[] = ["privacy", "outro"];

function SetupQuestionnaire({
  onComplete,
  isSignup = false,
}: {
  onComplete: () => void;
  isSignup?: boolean;
}) {
  const { config } = useAppContext();
  const login = useLoginActions();

  const steps = isSignup ? SIGNUP_STEPS : SETTINGS_STEPS;

  const [step, setStep] = useState<Step>(steps[0]);

  // Signup-specific state
  const [nsec, setNsec] = useState("");

  // Derived pubkey for the just-generated nsec. Used as a defensive guard at
  // every signup publish site to ensure we sign with the *new* account, not a
  // previously logged-in one. Without this, a regression in useLoginActions's
  // auto-switch (or any future re-ordering of logins) could overwrite the
  // previous user's kind 0 metadata / kind 3 follow list during onboarding.
  const expectedPubkey = useMemo(() => {
    if (!nsec) return undefined;
    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== "nsec") return undefined;
      return getPublicKey(decoded.data);
    } catch {
      return undefined;
    }
  }, [nsec]);

  const stepIndex = steps.indexOf(step);
  const progress = (stepIndex / (steps.length - 1)) * 100;

  const goTo = useCallback((target: Step) => setStep(target), []);

  const next = useCallback(() => {
    const i = steps.indexOf(step);
    if (i < steps.length - 1) {
      setStep(steps[i + 1]);
    }
  }, [step, steps]);

  // Keygen handler — generates the key and advances to the save step.
  // The credential manager prompt is deferred until the user clicks "Continue".
  const handleGenerate = useCallback(() => {
    const sk = generateSecretKey();
    const encoded = nip19.nsecEncode(sk);
    setNsec(encoded);
    next();
  }, [next]);

  // Continue handler for the download step — saves the key via the best
  // available method (native credential manager on iOS/Android, file download
  // on web), logs in, and advances to the next step.
  //
  // If the user dismisses the iOS credential prompt, `saveNsec` resolves to
  // `'dismissed'` and we still advance — dismissal is a legitimate choice
  // (e.g. the user is saving the key in their own password manager).
  //
  // On Android, if no credential provider is available (e.g. GrapheneOS or
  // other de-Googled devices), `saveNsec` falls back to writing the key to
  // the app's Documents folder and returns `'saved-to-file'`. We surface a
  // toast so the user knows where to find the backup file.
  //
  // Only unexpected errors (decode failure, filesystem write failure)
  // surface as a destructive toast.
  const handleDownloadContinue = useCallback(async () => {
    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== "nsec") throw new Error("Invalid nsec");

      const pubkey = getPublicKey(decoded.data);
      const npub = nip19.npubEncode(pubkey);

      const result = await saveNsec(npub, nsec, config.appName);

      if (result === "saved-to-file") {
        toast({
          title: "Secret key saved",
          description:
            "Your secret key was saved to the Documents folder on your device.",
        });
      }

      login.nsec(nsec);
      next();
    } catch {
      toast({
        title: "Save failed",
        description:
          "Could not save the key. Please copy it manually.",
        variant: "destructive",
      });
    }
  }, [nsec, login, next, config.appName]);

  // Profile step complete → straight to the privacy notice. (Historically
  // this probed kind 3 and routed to a follow-suggestion step; the ₿AO Fund
  // strip has no feed, so that step was removed. It also no longer writes any
  // hardcoded feed settings — defaults live in App.tsx's `defaultConfig` and
  // cross-device sync handles the rest.)
  const handleSaveAndContinue = useCallback(() => {
    goTo("privacy");
  }, [goTo]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto px-6 py-12">
          {/* Signup steps */}
          {step === "keygen" && <KeygenStep onGenerate={handleGenerate} />}

          {step === "download" && (
            <DownloadStep nsec={nsec} onContinue={handleDownloadContinue} />
          )}

          {step === "profile" && (
            <ProfileStep
              onNext={handleSaveAndContinue}
              isSaving={false}
              expectedPubkey={expectedPubkey}
            />
          )}

          {/* Settings steps */}
          {step === "privacy" && (
            <PrivacyNoticeStep
              onNext={() => goTo("outro")}
              onOpenSettings={() => {
                onComplete();
              }}
            />
          )}

          {step === "outro" && <OutroStep onComplete={onComplete} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signup steps: Keygen, Download, Profile
// ---------------------------------------------------------------------------

function KeygenStep({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <AppLogo size={80} />

      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Create your account
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
          Your identity on Nostr is a cryptographic key. We'll generate one
          for you now.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs gap-2 rounded-full h-12"
        onClick={onGenerate}
      >
        Generate my key
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function DownloadStep({
  nsec,
  onContinue,
}: {
  nsec: string;
  onContinue: () => Promise<void> | void;
}) {
  const { config } = useAppContext();
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Wrap the continue handler in an in-flight guard so rapid double-taps
  // don't trigger multiple credential prompts. `finally` guarantees the
  // button is re-enabled even if the handler throws, so users can never
  // get stuck on a disabled button.
  const handleClick = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onContinue();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Your secret key
        </h2>
        <p className="text-sm text-muted-foreground">
          This secret key controls your account on {config.appName}. You'll need it to log in later. Without it, you'll lose your account.
        </p>
      </div>

      <div className="relative">
        <Input
          type={showKey ? "text" : "password"}
          value={nsec}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
          className="pr-10 font-mono text-base md:text-sm"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowKey(!showKey)}
        >
          {showKey ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {showKey && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-xs text-amber-900 dark:text-amber-300">
            NEVER share your secret key with anyone. Avoid screenshotting your key or pasting it anywhere except a password manager. If shared, others will be able to access your account.{" "}
            <a
              href="https://soapbox.pub/blog/managing-nostr-keys/"
              onClick={(e) => {
                e.preventDefault();
                openUrl("https://soapbox.pub/blog/managing-nostr-keys/");
              }}
              className="underline underline-offset-2 hover:no-underline"
            >
              Learn more
            </a>
          </p>
        </div>
      )}

      <Button
        size="lg"
        className="w-full gap-2 rounded-full h-12"
        onClick={handleClick}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Saving…
          </>
        ) : (
          <>
            <Download className="w-4 h-4" /> Save Key
          </>
        )}
      </Button>
    </div>
  );
}

function ProfileStep({
  onNext,
  isSaving = false,
  expectedPubkey,
}: {
  onNext: () => void;
  isSaving?: boolean;
  /**
   * Hex pubkey of the just-generated signup key. When set, the publish
   * handler refuses to publish kind 0 unless the active signer matches —
   * a defensive guard against signing with a previously logged-in user's
   * key and overwriting their profile metadata.
   */
  expectedPubkey?: string;
}) {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending: isPublishing } =
    useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { isEnabled } = usePublishPreferences();
  const pickInputRef = useRef<HTMLInputElement>(null);
  const pendingField = useRef<"picture" | "banner">("picture");

  const [profileData, setProfileData] = useState<Partial<NostrMetadata>>({
    name: "",
    about: "",
    picture: "",
    banner: "",
    website: "",
    shape: "",
  });
  const [cropState, setCropState] = useState<{
    imageSrc: string;
    aspect: number;
    field: "picture" | "banner";
  } | null>(null);

  const handlePickImage = useCallback((field: "picture" | "banner") => {
    pendingField.current = field;
    pickInputRef.current?.click();
  }, []);

  const handleFileChosen = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      const field = pendingField.current;
      setCropState({
        imageSrc: URL.createObjectURL(file),
        aspect: field === "picture" ? 1 : 3,
        field,
      });
    },
    [],
  );

  const handleCropConfirm = useCallback(
    async (blob: Blob) => {
      if (!cropState) return;
      const { field, imageSrc } = cropState;
      URL.revokeObjectURL(imageSrc);
      setCropState(null);
      try {
        const file = new File([blob], `${field}.jpg`, { type: "image/jpeg" });
        const [[, url]] = await uploadFile(file);
        setProfileData((prev) => ({ ...prev, [field]: url }));
      } catch {
        toast({
          title: "Upload failed",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [cropState, uploadFile],
  );

  const handleCropCancel = useCallback(() => {
    if (cropState) URL.revokeObjectURL(cropState.imageSrc);
    setCropState(null);
  }, [cropState]);

  const handlePublishProfile = useCallback(async () => {
    if (!user) return;
    if (!isEnabled('profile')) {
      toast({
        title: "Profile publishing disabled",
        description:
          "Turn on “Profile metadata” in Settings → Privacy & Publishing to publish your profile.",
        variant: "destructive",
      });
      onNext();
      return;
    }

    // Defensive guard: when this is the signup flow, only publish kind 0 if
    // the active signer matches the freshly generated key. If the
    // auto-switch in useLoginActions ever fails to promote the new login,
    // publishing here would sign with the *previous* user's signer and
    // overwrite their kind 0 metadata. Refuse rather than risk it.
    if (expectedPubkey && user.pubkey !== expectedPubkey) {
      toast({
        title: "Profile not saved",
        description:
          "The new account is not active yet, so your profile was not published (this prevents overwriting another account). You can update it later from settings.",
        variant: "destructive",
      });
      return;
    }

    const hasData = Object.values(profileData).some((v) => v);
    if (hasData) {
      try {
        // Build the outgoing metadata, stripping empty strings and validating shape.
        const { shape, ...rest } = profileData;
        const data: Record<string, unknown> = { ...rest };
        if (shape && isValidAvatarShape(shape)) {
          data.shape = shape;
        }
        for (const key in data) {
          if (data[key] === "") delete data[key];
        }
        await publishEvent({ kind: 0, content: JSON.stringify(data), tags: [] });
        queryClient.invalidateQueries({ queryKey: ["logins"] });
        queryClient.invalidateQueries({ queryKey: ["author", user.pubkey] });
      } catch {
        toast({
          title: "Profile failed",
          description:
            "Your account was created but profile setup failed. You can update it later.",
          variant: "destructive",
        });
      }
    }
    onNext();
  }, [user, profileData, publishEvent, queryClient, onNext, expectedPubkey, isEnabled]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="flex items-center gap-4">
        <IntroImage src="/profile-intro.png" />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">
            Set up your profile
          </h2>
          <p className="text-sm text-muted-foreground">
            Tell people a bit about yourself. You can always change this later.
          </p>
        </div>
      </div>

      <input
        ref={pickInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChosen}
      />
      {cropState && (
        <ImageCropDialog
          open
          imageSrc={cropState.imageSrc}
          aspect={cropState.aspect}
          title={
            cropState.field === "picture"
              ? "Crop Profile Picture"
              : "Crop Banner"
          }
          onCancel={handleCropCancel}
          onCrop={handleCropConfirm}
        />
      )}

      <div className={cn(isPublishing && "opacity-50 pointer-events-none")}>
        <ProfileCard
          metadata={profileData}
          onChange={(patch) =>
            setProfileData((prev) => ({ ...prev, ...patch }))
          }
          onPickImage={handlePickImage}
          onAvatarShape={(shape) =>
            setProfileData((prev) => ({ ...prev, shape }))
          }
          showNip05={false}
        />
      </div>

      {isUploading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Uploading image…
        </div>
      )}

      <Button
        onClick={handlePublishProfile}
        className="w-full rounded-full h-11 gap-1.5"
        disabled={isPublishing || isUploading || isSaving}
      >
        {isPublishing || isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Saving…
          </>
        ) : (
          <>
            Continue <ChevronRight className="w-4 h-4" />
          </>
        )}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow Packs Step
// ---------------------------------------------------------------------------

/** Parse a follow pack event into structured data. */
// ---------------------------------------------------------------------------
// Privacy Notice Step
// ---------------------------------------------------------------------------

function PrivacyNoticeStep({
  onNext,
  onOpenSettings,
}: {
  onNext: () => void;
  onOpenSettings: () => void;
}) {
  const navigate = useNavigate();
  const { config } = useAppContext();

  const handleOpenSettings = () => {
    onOpenSettings();
    navigate("/settings");
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="flex items-center gap-4">
        <IntroImage src="/advanced-intro.png" />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">
            Privacy & publishing
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Here is what {config.appName} may publish to Nostr so you can use
            it across devices.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex gap-3">
          <div className="mt-0.5 size-2 rounded-full bg-primary shrink-0" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Encrypted settings.</span>{" "}
            Theme, feed filters, sidebar order, notification preferences, and
            read cursors are encrypted to your key and synced as a NIP-78 event
            (kind 30078).
          </p>
        </div>
        <div className="flex gap-3">
          <div className="mt-0.5 size-2 rounded-full bg-primary shrink-0" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Relays & file servers.</span>{" "}
            Changes to your relay list (kind 10002) or Blossom servers
            (kind 10063) are published when you edit them.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="mt-0.5 size-2 rounded-full bg-primary shrink-0" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">NOSTR Pet.</span>{" "}
            Pet state and Nostr pet profiles are public events (kinds 31124
            and 11125) sent only to the ₿AO pets relay at this stage of
            development.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-dashed p-3 text-muted-foreground">
        <p className="text-xs leading-relaxed">
          You can change every auto-publish option anytime in{" "}
          <span className="font-medium text-foreground">
            Settings → Privacy & Publishing
          </span>
          .
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          className="w-full gap-2 rounded-full h-12"
          onClick={onNext}
        >
          Continue to {config.appName}
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          className="w-full rounded-full h-11"
          onClick={handleOpenSettings}
        >
          Open Privacy & Publishing settings
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outro Step
// ---------------------------------------------------------------------------

function OutroStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative">
        <AppLogo size={72} />
        <div className="absolute -bottom-1 -right-1 bg-primary/10 rounded-full p-1.5">
          <Heart className="w-5 h-5 text-primary fill-primary" />
        </div>
      </div>

      <div className="space-y-3 max-w-xs">
        <h2 className="text-2xl font-bold tracking-tight">You're all set</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          That's it! Go find something wonderful, share something fun, and make
          yourself at home.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs gap-2 rounded-full h-12"
        onClick={onComplete}
      >
        Let's go
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared nav buttons
// ---------------------------------------------------------------------------

function _StepNav({
  onBack,
  onNext,
  nextLabel = "Continue",
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="flex gap-3">
      <Button
        variant="ghost"
        onClick={onBack}
        className="flex-1 rounded-full h-11"
      >
        Back
      </Button>
      <Button onClick={onNext} className="flex-1 rounded-full h-11 gap-1.5">
        {nextLabel}
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
